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
  deleteAllSavedAnalyses,
  disconnectPlaidConnection,
  fetchPublicConfig,
  fetchUserPlaidConnection,
  type DashboardSummary,
  type PlaidConnectionStatus,
  type UserProfile,
} from "@/lib/api"

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

function plaidEnvironmentLabel(environment: PlaidConnectionStatus["environment"]): string {
  if (environment === "sandbox") return "Plaid Sandbox"
  if (environment === "production") return "Plaid Production"
  return "Plaid Development"
}

export function SettingsPanel({
  user,
  credential,
  summary,
  summaryState,
  onRefresh,
  onOpenDocuments,
  onDataDeleted,
}: {
  user: UserProfile
  credential: string
  summary: DashboardSummary | null
  summaryState: LoadState
  onRefresh: () => void
  onOpenDocuments: () => void
  onDataDeleted: () => void
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
  const [showSampleTips, setShowSampleTips] = useState(() => {
    if (typeof window === "undefined") return true
    return localStorage.getItem(SAMPLE_TIPS_KEY) !== "off"
  })
  const bankController = useRef<AbortController | null>(null)

  const loadBank = () => {
    bankController.current?.abort()
    const controller = new AbortController()
    bankController.current = controller
    setBankState("loading")
    setBankError(null)
    void fetchUserPlaidConnection(credential, controller.signal)
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
    loadBank()
    void fetchPublicConfig()
      .then((config) => setEnvironment(String(config.environment ?? "")))
      .catch(() => setEnvironment(null))
    return () => bankController.current?.abort()
  }, [credential])

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
      await disconnectPlaidConnection(credential)
      setDisconnectOpen(false)
      setDisconnectSuccess(true)
      loadBank()
    } catch (cause) {
      setBankError(cause instanceof Error ? cause.message : "Could not disconnect the bank.")
    } finally {
      setDisconnecting(false)
    }
  }

  const handleDeleteAll = async () => {
    if (deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteAllSavedAnalyses(credential)
      onDataDeleted()
      onRefresh()
      setDeleteOpen(false)
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Could not delete saved letters.")
    } finally {
      setDeleting(false)
    }
  }

  const letterCount = summary?.counts?.documents ?? 0

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-black/[.08] bg-white/70">
        <div className="border-b border-black/5 px-5 py-4">
          <h2 className="type-ui-heading">Settings</h2>
          <p className="type-caption mt-1">Account, bank access, and saved letter data.</p>
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

      <section className="overflow-hidden rounded-2xl border border-black/[.08] bg-white/70">
        <div className="border-b border-black/5 px-5 py-4">
          <h3 className="text-sm font-semibold">Workspace</h3>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Saved letters</p>
              <p className="text-xs text-zinc-500">
                {summaryState === "loading" ? "Loading counts…" : `${letterCount} on your account`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-9 px-3 text-xs" onClick={onRefresh} disabled={summaryState === "loading"}>
                <RefreshCw className={summaryState === "loading" ? "animate-spin" : ""} size={14} /> Refresh
              </Button>
              <Button type="button" variant="outline" className="h-9 px-3 text-xs" onClick={onOpenDocuments}>
                Open letters
              </Button>
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
              <span className="font-medium text-foreground">Sample letter hints</span>
              <span className="block text-zinc-500">Show D1–D4 notes on the landing mailbox and upload card.</span>
            </span>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-black/[.08] bg-white/70">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <Landmark size={16} />
            <h3 className="text-sm font-semibold">Connected bank</h3>
          </div>
          <Button type="button" variant="outline" className="h-8 px-2.5 text-[11px]" onClick={loadBank} disabled={bankState === "loading"}>
            <RefreshCw className={bankState === "loading" ? "animate-spin" : ""} size={13} /> Refresh
          </Button>
        </div>
        <div className="space-y-4 px-5 py-4">
          {disconnectSuccess && (
            <Alert className="rounded-xl border-black/10 bg-background">
              <AlertTitle>Bank disconnected</AlertTitle>
              <AlertDescription>Served no longer has Plaid access for this account. Open a verified D4 letter to connect again.</AlertDescription>
            </Alert>
          )}
          {bankState === "loading" && <Skeleton className="h-24 w-full rounded-xl bg-black/5" />}
          {bankState === "error" && (
            <Alert className="rounded-xl border-black/10 bg-background">
              <AlertTitle>Could not load bank status</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{bankError ?? "Try again in a moment."}</p>
                <Button type="button" variant="outline" className="h-9 text-xs" onClick={loadBank}>Try again</Button>
              </AlertDescription>
            </Alert>
          )}
          {bankState === "ready" && bank && (
            <>
              {!bank.configured && (
                <p className="text-xs leading-5 text-zinc-500">Plaid is not configured on this backend. Bank matching is unavailable until Plaid credentials are set.</p>
              )}
              {bank.configured && !bank.connected && (
                <div className="rounded-xl border border-dashed border-black/15 bg-background p-4">
                  <Badge variant="secondary" className="text-[10px]">Not connected</Badge>
                  <p className="mt-3 text-sm font-medium text-zinc-800">No bank linked</p>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    Connect through Plaid Link on a <strong className="font-medium text-zinc-700">verified</strong> letter that requests bank records (D4 sample or your own).
                  </p>
                  <Button type="button" variant="outline" className="mt-3 h-9 px-3 text-xs" onClick={onOpenDocuments}>
                    Open saved letters
                  </Button>
                </div>
              )}
              {bank.configured && bank.connected && (
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
                    Served can fetch transactions for payment matching on verified bank-record letters. Disconnect here when you want to revoke that access.
                  </p>
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
                          <span className="block">This removes the Plaid item from Served and deletes the stored access token on our backend.</span>
                          <span className="block">Saved letter analyses stay on your account. To match payments again, open a verified D4 letter and run Plaid Link.</span>
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

      <section className="overflow-hidden rounded-2xl border border-black/[.08] bg-white/70">
        <div className="border-b border-black/5 px-5 py-4">
          <h3 className="text-sm font-semibold">Data & privacy</h3>
        </div>
        <ul className="space-y-2 px-5 py-4 text-xs leading-5 text-zinc-600">
          <li>Uploaded letter files are not kept after analysis.</li>
          <li>Your account stores structured results, evidence, decisions, and run traces.</li>
          <li>Payroll CSVs and Plaid transactions are used for matching only during your session workflows.</li>
        </ul>
        <div className="border-t border-black/5 px-5 py-4">
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" className="h-9 border-red-200 text-xs text-red-700 hover:bg-red-50">
                <Trash2 size={14} /> Delete all saved letters
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md shadow-none">
              <DialogHeader>
                <DialogTitle>Delete all saved letters?</DialogTitle>
                <DialogDescription>
                  This removes every saved analysis on your account ({letterCount} letter{letterCount === 1 ? "" : "s"}). Bank connection stays until you disconnect it. This cannot be undone.
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

      <div className="lg:hidden">
        <Button type="button" variant="outline" className="h-10 w-full" onClick={logout}>
          <LogOut size={16} /> Sign out
        </Button>
      </div>
    </div>
  )
}
