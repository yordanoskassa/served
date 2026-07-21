import { Check, Copy, Landmark, LogOut, RefreshCw, Trash2, UserRound } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useAuth } from "@/AuthContext"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  connectPlaidSandboxSample,
  createUserPlaidLinkToken,
  deleteAllSavedAnalyses,
  disconnectPlaidConnection,
  exchangeUserPlaidPublicToken,
  fetchPublicConfig,
  fetchUserPlaidConnection,
  getDemoCredential,
  type DashboardSummary,
  type PlaidConnectionStatus,
  type SavedAnalysisListItem,
  type UserProfile,
} from "@/lib/api"
import { isSandboxPlaidEnvironment, PLAID_SANDBOX_LABEL, pickPaymentRecordAnalysisId } from "@/lib/bankConnect"
import { openPlaidLink } from "@/lib/plaidLink"

type LoadState = "loading" | "ready" | "error"

export const SAMPLE_TIPS_KEY = "served_show_sample_tips"

function userInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("")
}

function formatConnectedAt(value: string | null | undefined): string {
  if (!value) return "Date unknown"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Date unknown"
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
}

function plaidEnvironmentLabel(_environment: PlaidConnectionStatus["environment"]): string {
  return PLAID_SANDBOX_LABEL
}

export function SettingsPanel({
  user,
  credential,
  summary,
  summaryState,
  savedRequests,
  bankConnecting,
  demoMode = false,
  onRefresh,
  onOpenDocuments,
  onOpenBankRequest,
  onDataDeleted,
}: {
  user: UserProfile
  credential?: string | null
  summary: DashboardSummary | null
  summaryState: LoadState
  savedRequests: SavedAnalysisListItem[]
  bankConnecting?: boolean
  demoMode?: boolean
  onRefresh: () => void
  onOpenDocuments?: () => void
  onOpenBankRequest?: (analysisId: string) => void
  onDataDeleted?: () => void
}) {
  const { logout } = useAuth()
  const [bank, setBank] = useState<PlaidConnectionStatus | null>(null)
  const [bankState, setBankState] = useState<LoadState>("loading")
  const [bankError, setBankError] = useState<string | null>(null)
  const [environment, setEnvironment] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [disconnectSuccess, setDisconnectSuccess] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [accessCredential, setAccessCredential] = useState<string | null>(credential ?? null)
  const [localBankConnecting, setLocalBankConnecting] = useState(false)
  const bankConnectingActive = bankConnecting || localBankConnecting
  const [showSampleTips, setShowSampleTips] = useState(() => {
    if (typeof window === "undefined") return true
    return localStorage.getItem(SAMPLE_TIPS_KEY) !== "off"
  })
  const bankController = useRef<AbortController | null>(null)

  const ensureCredential = async (): Promise<string> => {
    if (accessCredential) return accessCredential
    if (credential) {
      setAccessCredential(credential)
      return credential
    }
    if (!demoMode) {
      throw new Error("Sign in to connect a bank.")
    }
    const demo = await getDemoCredential()
    setAccessCredential(demo)
    return demo
  }

  const loadBank = (token?: string | null) => {
    const active = token ?? accessCredential
    if (!active) return
    bankController.current?.abort()
    const controller = new AbortController()
    bankController.current = controller
    setBankState("loading")
    setBankError(null)
    void fetchUserPlaidConnection(active, controller.signal)
      .then((status) => {
        if (bankController.current !== controller) return
        setBank(status)
        setBankState("ready")
      })
      .catch((cause) => {
        if (controller.signal.aborted || bankController.current !== controller) return
        setBankError(cause instanceof Error ? cause.message : "Unable to load bank connection.")
        setBankState("error")
      })
  }

  useEffect(() => {
    if (credential) setAccessCredential(credential)
  }, [credential])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        let token = credential ?? accessCredential
        if (!token) {
          if (demoMode) {
            token = await getDemoCredential()
          } else {
            setBankError("Sign in to connect a bank.")
            setBankState("error")
            return
          }
        }
        if (cancelled) return
        setAccessCredential(token)
        loadBank(token)
      } catch {
        if (!cancelled) {
          setBankError("Could not start a session for bank settings.")
          setBankState("error")
        }
      }
    })()
    void fetchPublicConfig()
      .then((config) => setEnvironment(String(config.environment ?? "")))
      .catch(() => setEnvironment(null))
    return () => {
      cancelled = true
      bankController.current?.abort()
    }
  }, [credential, demoMode])

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(user.email)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const toggleSampleTips = () => {
    const next = !showSampleTips
    setShowSampleTips(next)
    localStorage.setItem(SAMPLE_TIPS_KEY, next ? "on" : "off")
    window.dispatchEvent(new Event("served-prefs"))
  }

  const handleDisconnectBank = async () => {
    if (disconnecting) return
    setDisconnecting(true)
    setBankError(null)
    setDisconnectSuccess(false)
    try {
      const token = await ensureCredential()
      await disconnectPlaidConnection(token)
      setDisconnectOpen(false)
      setDisconnectSuccess(true)
      loadBank(token)
    } catch (cause) {
      setBankError(cause instanceof Error ? cause.message : "Could not disconnect the bank.")
    } finally {
      setDisconnecting(false)
    }
  }

  const handleDeleteAll = async () => {
    if (deleting || !onDataDeleted) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const token = await ensureCredential()
      await deleteAllSavedAnalyses(token)
      onDataDeleted()
      onRefresh()
      setDeleteOpen(false)
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Could not delete saved requests.")
    } finally {
      setDeleting(false)
    }
  }

  const letterCount = summary?.counts?.documents ?? 0
  const bankConnectAnalysisId = pickPaymentRecordAnalysisId(savedRequests)

  const handleConnectSampleBank = () => {
    setBankError(null)
    setDisconnectSuccess(false)
    setLocalBankConnecting(true)
    void (async () => {
      try {
        const token = await ensureCredential()
        await connectPlaidSandboxSample(token, bankConnectAnalysisId)
        loadBank(token)
      } catch (cause: unknown) {
        setBankError(cause instanceof Error ? cause.message : "Unable to connect the sample bank.")
      } finally {
        setLocalBankConnecting(false)
      }
    })()
  }

  const handleConnectPlaidLink = () => {
    setBankError(null)
    setDisconnectSuccess(false)
    setLocalBankConnecting(true)
    void (async () => {
      try {
        const token = await ensureCredential()
        await openPlaidLink({
          fetchLinkToken: () => createUserPlaidLinkToken(token, bankConnectAnalysisId),
          analysisIdForLegacyApi: bankConnectAnalysisId,
          onSuccess: async (publicToken, institution) => {
            await exchangeUserPlaidPublicToken(token, publicToken, institution, bankConnectAnalysisId)
            loadBank(token)
          },
          onExit: (message) => {
            if (message) setBankError(message)
          },
        })
      } catch (cause: unknown) {
        setBankError(cause instanceof Error ? cause.message : "Unable to open Plaid Link.")
      } finally {
        setLocalBankConnecting(false)
      }
    })()
  }

  const showSampleConnect = demoMode || (bank?.environment ? isSandboxPlaidEnvironment(bank.environment) : true)

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-black/[.08] bg-white/70">
        <div className="border-b border-black/5 px-5 py-4">
          <h2 className="type-ui-heading">Settings</h2>
          <p className="type-caption mt-1">Account, bank access, and saved request data.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <Avatar className="size-12">
            <AvatarImage src={user.picture ?? undefined} alt={user.name} />
            <AvatarFallback className="bg-[#1a1a1a] text-sm text-white">{userInitials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-zinc-500">{user.email}</p>
            {environment && <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-400">Backend · {environment}</p>}
          </div>
          <Button type="button" variant="outline" className="h-9 px-3 text-xs" onClick={() => { void copyEmail() }}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy email"}
          </Button>
        </div>
        <div className="border-t border-black/5 px-5 py-4 text-xs leading-5 text-zinc-500">
          <p className="flex items-start gap-2">
            <UserRound size={14} className="mt-0.5 shrink-0" />
            Evidence briefs email only to this Google address. Recipients on uploaded letters are never used.
          </p>
        </div>
      </section>

      {!demoMode && (
      <section className="overflow-hidden rounded-2xl border border-black/[.08] bg-white/70">
        <div className="border-b border-black/5 px-5 py-4">
          <h3 className="text-sm font-semibold">Workspace</h3>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Saved requests</p>
              <p className="text-xs text-zinc-500">
                {summaryState === "loading" ? "Loading counts…" : `${letterCount} on your account`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-9 px-3 text-xs" onClick={onRefresh} disabled={summaryState === "loading"}>
                <RefreshCw className={summaryState === "loading" ? "animate-spin" : ""} size={14} /> Refresh
              </Button>
              {onOpenDocuments && (
                <Button type="button" variant="outline" className="h-9 px-3 text-xs" onClick={onOpenDocuments}>
                  Open requests
                </Button>
              )}
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-black/5 bg-background p-3">
            <input
              type="checkbox"
              className="mt-1 size-4 rounded border-black/20"
              checked={showSampleTips}
              onChange={toggleSampleTips}
            />
            <span className="text-left text-xs leading-5 text-zinc-600">
              <span className="font-medium text-foreground">Sample request hints</span>
              <span className="block text-zinc-500">Show sample labels on the landing mailbox and upload card.</span>
            </span>
          </label>
        </div>
      </section>
      )}

      {demoMode && (
        <section className="overflow-hidden rounded-2xl border border-black/[.08] bg-white/70 px-5 py-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-4 rounded border-black/20"
              checked={showSampleTips}
              onChange={toggleSampleTips}
            />
            <span className="text-left text-xs leading-5 text-zinc-600">
              <span className="font-medium text-foreground">Sample request hints</span>
              <span className="block text-zinc-500">Show sample labels on the landing mailbox and upload card.</span>
            </span>
          </label>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-black/[.08] bg-white/70">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <Landmark size={16} />
            <h3 className="text-sm font-semibold">Connected bank</h3>
          </div>
          <Button type="button" variant="outline" className="h-8 px-2.5 text-[11px]" onClick={() => { void ensureCredential().then((token) => loadBank(token)) }} disabled={bankState === "loading"}>
            <RefreshCw className={bankState === "loading" ? "animate-spin" : ""} size={13} /> Refresh
          </Button>
        </div>
        <div className="space-y-4 px-5 py-4">
          {disconnectSuccess && (
            <Alert className="rounded-xl border-black/10 bg-background">
              <AlertTitle>Bank disconnected</AlertTitle>
              <AlertDescription>You can connect again below anytime—no saved request required.</AlertDescription>
            </Alert>
          )}
          {bankState === "loading" && <Skeleton className="h-24 w-full rounded-xl bg-black/5" />}
          {bankState === "error" && (
            <Alert className="rounded-xl border-black/10 bg-background">
              <AlertTitle>Could not load bank status</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{bankError ?? "Try again in a moment."}</p>
                <Button type="button" variant="outline" className="h-9 text-xs" onClick={() => loadBank(accessCredential)}>Try again</Button>
              </AlertDescription>
            </Alert>
          )}
          {bankState === "ready" && bank && (
            <>
              {!bank.configured && (
                <Alert className="rounded-xl border-border bg-muted/80">
                  <AlertTitle>Plaid not configured on server</AlertTitle>
                  <AlertDescription className="text-xs leading-5">
                    Set PLAID_CLIENT_ID and PLAID_SANDBOX_SECRET in EasyPanel. Demo accounts can still use the in-app sandbox stub.
                  </AlertDescription>
                </Alert>
              )}
              {!bank.connected && (
                <div className="rounded-xl border border-dashed border-black/15 bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">Not connected</Badge>
                    <Badge variant="outline" className="text-[10px]">{PLAID_SANDBOX_LABEL}</Badge>
                  </div>
                  <p className="mt-3 text-sm font-medium text-zinc-800">No bank linked</p>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    {demoMode
                      ? "Connect the Mendoza’s Kitchen Plaid Sandbox sample anytime—no saved subpoena required."
                      : bankConnectAnalysisId
                        ? "Connect with Plaid or the Mendoza sample—no extra setup. Matching still needs a verified payment-records request."
                        : "Connect with Plaid or the sample bank. If connect fails, redeploy the latest EasyPanel backend—or run sample D4 once so the API can use your saved analysis as a fallback."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!demoMode && bank.configured && (
                      <Button
                        type="button"
                        className="h-9 px-3 text-xs"
                        disabled={bankConnectingActive}
                        onClick={handleConnectPlaidLink}
                      >
                        <Landmark size={14} />
                        {bankConnectingActive ? "Connecting…" : "Connect with Plaid"}
                      </Button>
                    )}
                    {showSampleConnect && (
                    <Button
                      type="button"
                      variant={demoMode ? "default" : "outline"}
                      className="h-9 px-3 text-xs"
                      disabled={bankConnectingActive}
                      onClick={handleConnectSampleBank}
                    >
                      <Landmark size={14} />
                      {bankConnectingActive ? "Connecting…" : "Connect sample bank"}
                    </Button>
                    )}
                    {onOpenDocuments && !demoMode && (
                      <Button type="button" variant="outline" className="h-9 px-3 text-xs" onClick={onOpenDocuments}>
                        Open saved requests
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {bank.connected && (
                <div className="rounded-xl border border-black/10 bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default" className="text-[10px]">Connected</Badge>
                    <Badge variant="outline" className="text-[10px]">{plaidEnvironmentLabel(bank.environment)}</Badge>
                  </div>
                  <p className="mt-3 font-display text-lg tracking-[-.03em] text-foreground">
                    {bank.institution_name ?? "Linked institution"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">Linked {formatConnectedAt(bank.connected_at)}</p>
                  <p className="mt-4 text-xs leading-5 text-zinc-600">
                    Served can retrieve transactions for verified payment-record requests. Disconnect here to revoke access.
                  </p>
                  {bankConnectAnalysisId && onOpenBankRequest && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 h-9 px-3 text-xs"
                      onClick={() => onOpenBankRequest(bankConnectAnalysisId)}
                    >
                      Open payment records
                    </Button>
                  )}
                  <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
                    <DialogTrigger asChild>
                      <Button type="button" variant="outline" className="mt-4 h-9 border-red-200 px-3 text-xs text-red-700 hover:bg-red-50">
                        Disconnect bank
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md shadow-none">
                      <DialogHeader>
                        <DialogTitle>Disconnect {bank.institution_name ?? "this bank"}?</DialogTitle>
                        <DialogDescription className="space-y-2 text-left leading-6">
                          <span className="block">This removes the bank connection from Served and deletes the stored access token.</span>
                          <span className="block">Saved request analyses remain on your account. Open a verified payment-record request to connect again.</span>
                        </DialogDescription>
                      </DialogHeader>
                      {bankError && disconnectOpen && (
                        <Alert variant="destructive" className="rounded-xl bg-red-50">
                          <AlertTitle>Disconnect failed</AlertTitle>
                          <AlertDescription>{bankError}</AlertDescription>
                        </Alert>
                      )}
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button type="button" variant="outline">Keep connected</Button>
                        </DialogClose>
                        <Button type="button" disabled={disconnecting} onClick={() => { void handleDisconnectBank() }}>
                          {disconnecting ? "Disconnecting…" : "Disconnect"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
            </>
          )}
          {bankError && bankState === "ready" && !disconnectOpen && <p className="text-xs text-red-600">{bankError}</p>}
        </div>
      </section>

      {!demoMode && (
      <section className="overflow-hidden rounded-2xl border border-black/[.08] bg-white/70">
        <div className="border-b border-black/5 px-5 py-4">
          <h3 className="text-sm font-semibold">Data & privacy</h3>
        </div>
        <ul className="space-y-2 px-5 py-4 text-xs leading-5 text-zinc-600">
          <li>Uploaded request files are not kept after analysis.</li>
          <li>Your account stores structured results, evidence, decisions, and run traces.</li>
          <li>Payroll CSVs and Plaid transactions are used for matching only during your session workflows.</li>
        </ul>
        <div className="border-t border-black/5 px-5 py-4">
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" className="h-9 border-red-200 text-xs text-red-700 hover:bg-red-50">
                <Trash2 size={14} /> Delete all saved requests
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md shadow-none">
              <DialogHeader>
                <DialogTitle>Delete all saved requests?</DialogTitle>
                <DialogDescription>
                  This removes every saved analysis on your account ({letterCount} request{letterCount === 1 ? "" : "s"}). Your bank connection remains until you disconnect it. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              {deleteError && (
                <Alert variant="destructive" className="rounded-xl bg-red-50">
                  <AlertTitle>Delete failed</AlertTitle>
                  <AlertDescription>{deleteError}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="button" disabled={deleting} onClick={() => { void handleDeleteAll() }}>
                  {deleting ? "Deleting…" : "Delete all"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </section>
      )}

      {!demoMode && (
      <div className="lg:hidden">
        <Button type="button" variant="outline" className="h-10 w-full" onClick={logout}>
          <LogOut size={16} /> Sign out
        </Button>
      </div>
      )}
    </div>
  )
}
