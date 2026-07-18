import { CheckCircle2, Landmark, LoaderCircle, Search } from "lucide-react"
import { useEffect, useState } from "react"

import { useAuth } from "@/AuthContext"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  createPlaidLinkToken,
  exchangePlaidPublicToken,
  fetchPlaidStatus,
  fetchPlaidTransactions,
  type PlaidConnectionStatus,
  type PlaidTransactionsResponse,
} from "@/lib/api"

type LoadState = "loading" | "ready" | "error"

function money(amount: number, currency: string | null): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
  }).format(Math.abs(amount))
}

function category(value: string | null): string {
  if (!value) return "Uncategorized"
  return value.toLowerCase().split("_").map((word) => (
    word ? `${word[0].toUpperCase()}${word.slice(1)}` : word
  )).join(" ")
}

export function BankEvidenceCard() {
  const { credential } = useAuth()
  const [status, setStatus] = useState<PlaidConnectionStatus | null>(null)
  const [statusState, setStatusState] = useState<LoadState>("loading")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [records, setRecords] = useState<PlaidTransactionsResponse | null>(null)

  useEffect(() => {
    if (!credential) return
    const controller = new AbortController()
    setStatusState("loading")
    void fetchPlaidStatus(credential, controller.signal)
      .then((nextStatus) => {
        setStatus(nextStatus)
        setStatusState("ready")
      })
      .catch((cause) => {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : "Bank connection unavailable.")
        setStatusState("error")
      })
    return () => controller.abort()
  }, [credential])

  const connect = async () => {
    if (!credential || busy) return
    setBusy(true)
    setError(null)
    try {
      const linkToken = await createPlaidLinkToken(credential)
      if (!window.Plaid) throw new Error("Plaid Link did not load. Refresh and try again.")
      let handler: PlaidLinkHandler | null = null
      handler = window.Plaid.create({
        token: linkToken,
        onSuccess: (publicToken, metadata) => {
          void exchangePlaidPublicToken(credential, publicToken, metadata.institution)
            .then((nextStatus) => {
              setStatus(nextStatus)
              setRecords(null)
            })
            .catch((cause) => {
              setError(cause instanceof Error ? cause.message : "The bank could not be connected.")
            })
            .finally(() => {
              setBusy(false)
              handler?.destroy()
            })
        },
        onExit: (linkError) => {
          if (linkError?.error_message) setError(linkError.error_message)
          setBusy(false)
          handler?.destroy()
        },
      })
      handler.open()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The bank connection could not start.")
      setBusy(false)
    }
  }

  const loadTransactions = async () => {
    if (!credential || busy) return
    setBusy(true)
    setError(null)
    try {
      setRecords(await fetchPlaidTransactions(credential))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Transactions could not be retrieved.")
    } finally {
      setBusy(false)
    }
  }

  if (statusState === "loading") {
    return <section className="mt-5 rounded-2xl border border-black/5 bg-white/70 p-4" aria-busy="true">
      <div className="flex items-center gap-3"><LoaderCircle className="animate-spin text-zinc-400" size={18} /><p className="text-sm text-zinc-500">Checking financial evidence connection…</p></div>
    </section>
  }

  if (statusState === "error") {
    return <Alert className="mt-5 rounded-2xl border-black/10 bg-white/70"><AlertTitle>Financial connection unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  }

  if (!status?.configured) {
    return <Alert className="mt-5 rounded-2xl border-amber-200 bg-amber-50 text-amber-900"><AlertTitle>Plaid Sandbox is not configured</AlertTitle><AlertDescription>Add the Plaid client ID and Sandbox secret to the backend environment.</AlertDescription></Alert>
  }

  return <section className="mt-5 overflow-hidden rounded-2xl border border-black/10 bg-[#111] text-white">
    <div className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10"><Landmark size={18} /></span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-white/45">Step 2 · Financial evidence</p>
            <h3 className="mt-1 font-display text-lg tracking-[-.03em]">Find the records this request needs</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-white/55">Served reads transaction details directly through Plaid. Bank credentials are entered only inside Plaid Link.</p>
          </div>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] uppercase tracking-wider text-white/60">{status.environment}</span>
      </div>

      {error && <Alert className="mt-4 border-red-400/30 bg-red-400/10 text-white"><AlertTitle>Could not complete that step</AlertTitle><AlertDescription className="text-white/70">{error}</AlertDescription></Alert>}

      {!status.connected ? <div className="mt-4">
        <Button className="bg-white text-black hover:bg-white/90" disabled={busy} onClick={() => { void connect() }}>
          {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Landmark size={16} />}
          Connect business bank
        </Button>
        {status.environment === "sandbox" && <p className="mt-2 text-[10px] text-white/40">Demo: choose First Platypus Bank and use Plaid Sandbox credentials.</p>}
      </div> : <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[.07] p-3">
        <div className="flex items-center gap-2"><CheckCircle2 className="text-emerald-400" size={16} /><div><p className="text-sm font-medium">{status.institution_name || "Business bank connected"}</p><p className="text-[10px] text-white/40">Access token secured by the Served backend</p></div></div>
        <Button className="bg-brand-soft text-black hover:bg-brand-soft/90" disabled={busy} onClick={() => { void loadTransactions() }}>
          {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Search size={16} />}
          Load financial records
        </Button>
      </div>}
    </div>

    {records && <div className="border-t border-white/10 bg-white/[.04] p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-white/40">Imported securely</p><p className="mt-1 text-sm">{records.total} transaction{records.total === 1 ? "" : "s"} available for evidence matching</p></div>{!records.historical_update_complete && <span className="text-[10px] text-amber-300">Historical records are still syncing</span>}</div>
      {records.transactions.length ? <div className="mt-3 divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10">{records.transactions.slice(0, 5).map((transaction) => <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 bg-black/10 px-3 py-2.5" key={transaction.transaction_id}><div className="min-w-0"><p className="truncate text-xs font-medium">{transaction.merchant_name || transaction.name}</p><p className="mt-0.5 truncate text-[10px] text-white/40">{transaction.date} · {category(transaction.category_primary)}</p></div><p className={`text-xs font-semibold ${transaction.amount < 0 ? "text-emerald-300" : "text-white"}`}>{transaction.amount < 0 ? "+" : "−"}{money(transaction.amount, transaction.currency)}</p></div>)}</div> : <p className="mt-3 rounded-xl border border-white/10 p-4 text-xs text-white/50">Plaid is connected. Transactions may take a moment to finish their initial sync.</p>}
    </div>}
  </section>
}
