import { AlertTriangle, CheckCircle2, Landmark, LoaderCircle, Search, ShieldCheck } from "lucide-react"
import { useEffect, useState } from "react"

import { useAuth } from "@/AuthContext"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  createPlaidLinkToken,
  exchangePlaidPublicToken,
  fetchPlaidStatus,
  matchPlaidTransactions,
  type PaymentMatchRecord,
  type PaymentMatchResponse,
  type PlaidConnectionStatus,
} from "@/lib/api"

type LoadState = "loading" | "ready" | "error"

function money(amount: number, currency: string | null): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
  }).format(Math.abs(amount))
}

function reasonLabel(record: PaymentMatchRecord): string {
  if (record.reason_code === "PAYEE_AND_DATE_MATCH") return "Exact payee and in-range date"
  if (record.reason_code === "UNNAMED_INSTRUMENT_NEEDS_HUMAN") return "Unnamed instrument needs human review"
  return "Near-name payee needs human review"
}

function PaymentRow({ record }: { record: PaymentMatchRecord }) {
  return <article className="rounded-2xl bg-white p-4 text-black">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-sm font-semibold">{record.description}</p><p className="mt-1 text-xs text-zinc-500">{record.date} · {reasonLabel(record)}</p></div>
      <div className="text-right"><Badge variant={record.disposition === "INCLUDE" ? "default" : "warning"}>{record.disposition}</Badge><p className="mt-2 text-sm font-semibold">{money(record.amount, record.currency)}</p></div>
    </div>
  </article>
}

export function BankEvidenceCard({ analysisId, cutoffDate = "2026-07-16" }: { analysisId: string; cutoffDate?: string | null }) {
  const { credential } = useAuth()
  const [status, setStatus] = useState<PlaidConnectionStatus | null>(null)
  const [statusState, setStatusState] = useState<LoadState>("loading")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmedCutoff, setConfirmedCutoff] = useState(cutoffDate || "2026-07-16")
  const [records, setRecords] = useState<PaymentMatchResponse | null>(null)

  useEffect(() => {
    if (!credential || !analysisId) return
    const controller = new AbortController()
    setStatusState("loading")
    void fetchPlaidStatus(analysisId, credential, controller.signal)
      .then((nextStatus) => {
        setStatus(nextStatus)
        setStatusState("ready")
      })
      .catch((cause) => {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : "Financial tools remain locked.")
        setStatusState("error")
      })
    return () => controller.abort()
  }, [analysisId, credential])

  const connect = async () => {
    if (!credential || busy) return
    setBusy(true)
    setError(null)
    try {
      const linkToken = await createPlaidLinkToken(analysisId, credential)
      if (!window.Plaid) throw new Error("Plaid Link did not load. Refresh and try again.")
      let handler: PlaidLinkHandler | null = null
      handler = window.Plaid.create({
        token: linkToken,
        onSuccess: (publicToken, metadata) => {
          void exchangePlaidPublicToken(analysisId, credential, publicToken, metadata.institution)
            .then((nextStatus) => {
              setStatus(nextStatus)
              setRecords(null)
            })
            .catch((cause) => setError(cause instanceof Error ? cause.message : "The bank could not be connected."))
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

  const matchRecords = async () => {
    if (!credential || busy) return
    setBusy(true)
    setError(null)
    try {
      setRecords(await matchPlaidTransactions(analysisId, credential, confirmedCutoff))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment records could not be matched.")
    } finally {
      setBusy(false)
    }
  }

  if (statusState === "loading") return <section className="mt-5 rounded-2xl border border-black/5 bg-white/70 p-4" aria-busy="true"><div className="flex items-center gap-3"><LoaderCircle className="animate-spin text-zinc-400" size={18} /><p className="text-sm text-zinc-500">Checking D4 financial eligibility…</p></div></section>
  if (statusState === "error") return <Alert className="mt-5 rounded-2xl border-amber-200 bg-amber-50 text-amber-900"><AlertTitle>Financial tools remain locked</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  if (!status?.configured) return <Alert className="mt-5 rounded-2xl border-amber-200 bg-amber-50 text-amber-900"><AlertTitle>Plaid Sandbox is not configured</AlertTitle><AlertDescription>The verified D4 workflow is ready, but the backend Plaid environment is unavailable.</AlertDescription></Alert>

  return <section className="mt-5 overflow-hidden rounded-2xl border border-black/10 bg-[#111] text-white">
    <div className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10"><Landmark size={18} /></span><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-white/45">Step 2 · D4 payment evidence</p><h3 className="mt-1 font-display text-lg tracking-[-.03em]">Potentially responsive payments</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-white/55">This saved analysis is VERIFIED and specifically requests payment and bank records for Audrea Barnes.</p></div></div>
        <Badge className="bg-brand-green text-black">GATE PASSED</Badge>
      </div>

      {error && <Alert className="mt-4 border-red-400/30 bg-red-400/10 text-white"><AlertTitle>Could not complete that step</AlertTitle><AlertDescription className="text-white/70">{error}</AlertDescription></Alert>}

      {!status.connected ? <div className="mt-4"><Button className="bg-white text-black hover:bg-white/90" disabled={busy} onClick={() => { void connect() }}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Landmark size={16} />}Connect business bank</Button>{status.environment === "sandbox" && <p className="mt-2 max-w-xl text-[10px] leading-4 text-white/50">Sandbox: use phone <strong className="text-white/80">415-555-0010</strong> and code <strong className="text-white/80">123456</strong>, or choose “Maybe later.”</p>}</div> : <div className="mt-4 rounded-2xl bg-white/[.07] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><CheckCircle2 className="text-brand-green" size={16} /><div><p className="text-sm font-medium">{status.institution_name || "Business bank connected"}</p><p className="text-[10px] text-white/40">Connection reusable, eligibility rechecked for this analysis</p></div></div><div className="flex flex-wrap items-end gap-2"><label className="text-[10px] text-white/50">Confirmed cutoff<input className="mt-1 block h-9 rounded-xl border border-white/15 bg-black/20 px-3 text-xs text-white" type="date" value={confirmedCutoff} onChange={(event) => setConfirmedCutoff(event.target.value)} /></label><Button className="bg-brand-green text-black hover:bg-brand-green/90" disabled={busy || !confirmedCutoff} onClick={() => { void matchRecords() }}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Search size={16} />}Match D4 payments</Button></div></div>
      </div>}
    </div>

    {records && <div className="border-t border-white/10 bg-white/[.04] p-4 sm:p-5">
      <div className="grid gap-2 sm:grid-cols-4"><div className="rounded-2xl bg-white/10 p-4"><p className="text-3xl font-semibold tracking-[-.05em]">{records.summary.total_searched}</p><p className="mt-1 text-xs text-white/60">transactions searched</p></div><div className="rounded-2xl bg-brand-green p-4 text-black"><p className="text-3xl font-semibold tracking-[-.05em]">{records.summary.include}</p><p className="mt-1 text-xs font-medium">include candidates</p></div><div className="rounded-2xl bg-amber-300 p-4 text-black"><p className="text-3xl font-semibold tracking-[-.05em]">{records.summary.review}</p><p className="mt-1 text-xs font-medium">need review</p></div><div className="rounded-2xl bg-white/10 p-4"><p className="text-3xl font-semibold tracking-[-.05em]">{records.summary.exclude}</p><p className="mt-1 text-xs text-white/60">kept outside</p></div></div>
      <p className="mt-4 text-xs leading-5 text-white/55">{records.review_notice}</p>
      {records.include.length > 0 && <div className="mt-4"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-white/40">Include candidates</p><div className="mt-2 space-y-2">{records.include.map((record) => <PaymentRow key={record.record_id} record={record} />)}</div></div>}
      {records.review.length > 0 && <div className="mt-4"><div className="flex items-center gap-2 text-amber-300"><AlertTriangle size={15} /><p className="text-[10px] font-semibold uppercase tracking-[.18em]">Human review needed</p></div><div className="mt-2 space-y-2">{records.review.map((record) => <PaymentRow key={record.record_id} record={record} />)}</div><p className="mt-2 text-xs leading-5 text-amber-200/70">{records.boundary_warning}</p></div>}
      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-brand-green/30 bg-brand-green/10 p-4 text-xs leading-5 text-white/70"><ShieldCheck className="mt-0.5 shrink-0 text-brand-green" size={15} /><p><strong className="text-white">Review before export.</strong> {records.legal_boundary} Nothing is automatically sent or shared.</p></div>
    </div>}
  </section>
}
