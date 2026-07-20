import { AlertTriangle, CheckCircle2, DatabaseZap, Download, Landmark, LoaderCircle, RefreshCw, ShieldCheck, Zap } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useAuth } from "@/AuthContext"
import type { EvidenceWorkflowState } from "@/components/CaseWorkflow"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  connectPlaidSandboxDemo,
  createPlaidLinkToken,
  exchangePlaidPublicToken,
  fetchPlaidStatus,
  matchPlaidTransactions,
  type PaymentMatchRecord,
  type PaymentMatchResponse,
  type PlaidConnectionStatus,
} from "@/lib/api"

type LoadState = "loading" | "ready" | "error"
type ReviewDecision = "approved" | "excluded" | "counsel"
const DEFAULT_CUTOFF_DATE = "2026-07-16"

function normalizeCutoffDate(value: string | null | undefined): string {
  const candidate = value?.trim()
  if (!candidate) return DEFAULT_CUTOFF_DATE

  const isoDate = candidate.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoDate) {
    const [, year, month, day] = isoDate
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
    if (
      parsed.getUTCFullYear() === Number(year)
      && parsed.getUTCMonth() === Number(month) - 1
      && parsed.getUTCDate() === Number(day)
    ) return `${year}-${month}-${day}`
  }

  const parsed = new Date(candidate)
  if (Number.isNaN(parsed.getTime())) return DEFAULT_CUTOFF_DATE
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, "0")
  const day = String(parsed.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

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

function PaymentRow({ record, decision, onDecision }: {
  record: PaymentMatchRecord
  decision?: ReviewDecision
  onDecision: (decision: ReviewDecision) => void
}) {
  return <article className="rounded-2xl bg-white p-4 text-black">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-sm font-semibold">{record.description}</p><p className="mt-1 text-xs text-zinc-500">{record.date} · {reasonLabel(record)}</p></div>
      <div className="text-right"><Badge variant={record.disposition === "INCLUDE" ? "default" : "warning"}>{record.disposition}</Badge><p className="mt-2 text-sm font-semibold">{money(record.amount, record.currency)}</p></div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-black/5 pt-3">
      <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400">Owner decision</span>
      <button type="button" className={`rounded-full px-3 py-1.5 text-[10px] font-semibold transition ${decision === "approved" ? "bg-brand-green text-black" : "bg-black/5 text-zinc-600 hover:bg-black/10"}`} onClick={() => onDecision("approved")}>Approve</button>
      <button type="button" className={`rounded-full px-3 py-1.5 text-[10px] font-semibold transition ${decision === "excluded" ? "bg-black text-white" : "bg-black/5 text-zinc-600 hover:bg-black/10"}`} onClick={() => onDecision("excluded")}>Exclude</button>
      {record.disposition === "REVIEW" && <button type="button" className={`rounded-full px-3 py-1.5 text-[10px] font-semibold transition ${decision === "counsel" ? "bg-neutral-300 text-black" : "bg-black/5 text-zinc-600 hover:bg-black/10"}`} onClick={() => onDecision("counsel")}>Ask counsel</button>}
    </div>
  </article>
}

export function BankEvidenceCard({ analysisId, cutoffDate = DEFAULT_CUTOFF_DATE, onWorkflowChange }: {
  analysisId: string
  cutoffDate?: string | null
  onWorkflowChange?: (state: EvidenceWorkflowState) => void
}) {
  const { credential } = useAuth()
  const normalizedCutoff = normalizeCutoffDate(cutoffDate)
  const [status, setStatus] = useState<PlaidConnectionStatus | null>(null)
  const [statusState, setStatusState] = useState<LoadState>("loading")
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmedCutoff, setConfirmedCutoff] = useState(normalizedCutoff)
  const [records, setRecords] = useState<PaymentMatchResponse | null>(null)
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>(() => {
    try {
      return JSON.parse(localStorage.getItem(`served-payment-review-${analysisId}`) || "{}") as Record<string, ReviewDecision>
    } catch {
      return {}
    }
  })
  const [packetReady, setPacketReady] = useState(false)
  const autoMatchStarted = useRef(false)

  useEffect(() => {
    localStorage.setItem(`served-payment-review-${analysisId}`, JSON.stringify(decisions))
  }, [analysisId, decisions])

  useEffect(() => {
    const total = records ? records.include.length + records.review.length : 0
    const reviewed = records
      ? [...records.include, ...records.review].filter((record) => Boolean(decisions[record.record_id])).length
      : 0
    onWorkflowChange?.({
      sourceReady: Boolean(status?.connected),
      candidatesReady: Boolean(records),
      reviewed,
      total,
      packetReady,
      sourceLabel: status?.connected ? status.institution_name || "Business bank connected" : "Business bank",
    })
  }, [decisions, onWorkflowChange, packetReady, records, status])

  useEffect(() => {
    if (!credential || !analysisId) return
    const controller = new AbortController()
    setStatusState("loading")
    void fetchPlaidStatus(analysisId, credential, controller.signal)
      .then((nextStatus) => {
        setStatus(nextStatus)
        setStatusState("ready")
        const readyForMatch = nextStatus.connected
          && (nextStatus.environment !== "sandbox" || nextStatus.demo_fixture)
        if (readyForMatch && !autoMatchStarted.current) {
          autoMatchStarted.current = true
          setBusy(true)
          setBusyLabel("Fetching and matching transactions…")
          void matchPlaidTransactions(analysisId, credential, normalizedCutoff)
            .then(setRecords)
            .catch((cause) => setError(cause instanceof Error ? cause.message : "Payment records could not be matched."))
            .finally(() => {
              setBusy(false)
              setBusyLabel(null)
            })
        }
      })
      .catch((cause) => {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : "Financial tools remain locked.")
        setStatusState("error")
      })
    return () => controller.abort()
  }, [analysisId, credential, normalizedCutoff])

  const connect = async () => {
    if (!credential || busy) return
    setBusy(true)
    setBusyLabel("Opening secure bank connection…")
    setError(null)
    try {
      if (status?.environment === "sandbox") {
        setBusyLabel("Connecting Mendoza’s Kitchen sample bank…")
        const nextStatus = await connectPlaidSandboxDemo(analysisId, credential)
        setStatus(nextStatus)
        setBusyLabel("Fetching Audrea Barnes transactions…")
        setRecords(await matchPlaidTransactions(analysisId, credential, confirmedCutoff))
        autoMatchStarted.current = true
        return
      }
      const linkToken = await createPlaidLinkToken(analysisId, credential)
      if (!window.Plaid) throw new Error("Plaid Link did not load. Refresh and try again.")
      let handler: PlaidLinkHandler | null = null
      handler = window.Plaid.create({
        token: linkToken,
        onSuccess: (publicToken, metadata) => {
          setBusyLabel("Bank connected. Fetching transactions…")
          void (async () => {
            try {
              const nextStatus = await exchangePlaidPublicToken(analysisId, credential, publicToken, metadata.institution)
              setStatus(nextStatus)
              setBusyLabel("Matching transactions to the subpoena…")
              setRecords(await matchPlaidTransactions(analysisId, credential, confirmedCutoff))
              autoMatchStarted.current = true
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "The bank could not be connected.")
            } finally {
              setBusy(false)
              setBusyLabel(null)
              handler?.destroy()
            }
          })()
        },
        onExit: (linkError) => {
          if (linkError?.error_message) setError(linkError.error_message)
          setBusy(false)
          setBusyLabel(null)
          handler?.destroy()
        },
      })
      handler.open()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The bank connection could not start.")
      setBusy(false)
      setBusyLabel(null)
    }
  }

  const matchRecords = async () => {
    if (!credential || busy) return
    setBusy(true)
    setBusyLabel("Refreshing transaction match…")
    setError(null)
    try {
      setRecords(await matchPlaidTransactions(analysisId, credential, confirmedCutoff))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment records could not be matched.")
    } finally {
      setBusy(false)
      setBusyLabel(null)
    }
  }

  const decide = (recordId: string, decision: ReviewDecision) => {
    setPacketReady(false)
    setDecisions((current) => ({ ...current, [recordId]: decision }))
  }

  const approveSuggested = () => {
    if (!records) return
    setPacketReady(false)
    setDecisions((current) => ({
      ...current,
      ...Object.fromEntries(records.include.map((record) => [record.record_id, "approved" as const])),
    }))
  }

  const exportManifest = () => {
    if (!records) return
    const candidates = [...records.include, ...records.review]
    const escape = (value: string | number | null) => `"${String(value ?? "").replaceAll('"', '""')}"`
    const rows = [
      ["record_id", "description", "date", "amount", "currency", "served_recommendation", "owner_decision", "reason_code"],
      ...candidates.map((record) => [
        record.record_id,
        record.description,
        record.date,
        record.amount,
        record.currency,
        record.disposition,
        decisions[record.record_id],
        record.reason_code,
      ]),
    ]
    const blob = new Blob([rows.map((row) => row.map(escape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `served-financial-review-${analysisId.slice(-8)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    setPacketReady(true)
  }

  if (statusState === "loading") return <section className="mt-5 rounded-2xl border border-black/5 bg-white/70 p-4" aria-busy="true"><div className="flex items-center gap-3"><LoaderCircle className="animate-spin text-zinc-400" size={18} /><p className="text-sm text-zinc-500">Checking D4 financial eligibility…</p></div></section>
  if (statusState === "error") return <Alert className="mt-5 rounded-2xl border-border bg-muted text-muted-foreground"><AlertTitle>Financial tools remain locked</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  if (!status?.configured) return <Alert className="mt-5 rounded-2xl border-border bg-muted text-muted-foreground"><AlertTitle>Plaid Sandbox is not configured</AlertTitle><AlertDescription>The verified D4 workflow is ready, but the backend Plaid environment is unavailable.</AlertDescription></Alert>

  const progress = [
    { label: "Request verified", done: true },
    { label: "Bank connected", done: status.connected },
    { label: "Transactions fetched", done: Boolean(records) },
    { label: "Matches ready", done: Boolean(records) },
  ]

  const candidateRecords = records ? [...records.include, ...records.review] : []
  const reviewedCount = candidateRecords.filter((record) => Boolean(decisions[record.record_id])).length
  const reviewComplete = candidateRecords.length > 0 && reviewedCount === candidateRecords.length

  return <section id={`records-${analysisId}`} className="mt-5 scroll-mt-24 overflow-hidden rounded-[28px] border border-black/10 bg-[#111] text-white shadow-[0_20px_50px_rgba(0,0,0,.18)]">
    <div className="p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white text-black"><Zap size={20} /></span><div><h3 className="type-subsection text-white">Bank match (D4)</h3><p className="type-caption mt-1 text-white/55">Plaid fetch + payment match for Audrea Barnes.</p></div></div>
        <Badge className="bg-white text-black">READY</Badge>
      </div>

      <div className="mt-5 grid overflow-hidden rounded-2xl border border-white/10 bg-white/[.04] sm:grid-cols-4">
        {progress.map((step, index) => <div className={`flex items-center gap-2 px-3 py-3 text-[11px] ${index < progress.length - 1 ? "border-b border-white/10 sm:border-r sm:border-b-0" : ""}`} key={step.label}><span className={`grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-bold ${step.done ? "bg-brand-green text-black" : "bg-white/10 text-white/40"}`}>{step.done ? "✓" : index + 1}</span><span className={step.done ? "text-white" : "text-white/40"}>{step.label}</span></div>)}
      </div>

      {error && <Alert className="mt-4 border-red-400/30 bg-red-400/10 text-white"><AlertTitle>Could not complete that step</AlertTitle><AlertDescription className="text-white/70">{error}</AlertDescription></Alert>}

      {!status.connected ? <div className="mt-5 rounded-2xl bg-white/[.07] p-4 sm:p-5"><Button className="h-12 w-full bg-white text-sm font-medium text-black hover:bg-white/90 sm:w-auto sm:px-7" disabled={busy} onClick={() => { void connect() }}>{busy ? <LoaderCircle className="animate-spin" size={17} /> : <Landmark size={17} />}{busyLabel || (status.environment === "sandbox" ? "Connect sample bank" : "Connect bank")}</Button>{status.environment === "sandbox" && <p className="type-caption mt-2 text-white/40">Plaid Sandbox connects Mendoza’s Kitchen with 28 synthetic transactions. No bank login required.</p>}</div> : <div className="mt-5 rounded-2xl bg-white/[.07] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><CheckCircle2 className="text-white" size={18} /><div><p className="type-ui font-medium text-white">{status.institution_name || "Bank connected"}</p>{status.demo_fixture && <p className="type-caption mt-0.5 text-white/40">Mendoza’s Kitchen · D4 sample transactions</p>}</div></div><div className="flex flex-wrap items-end gap-2">{status.environment === "sandbox" && !status.demo_fixture && <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white" disabled={busy} onClick={() => { void connect() }}><Landmark size={15} />Use D4 sample bank</Button>}<label className="type-caption text-white/50">Through<input className="mt-1 block h-9 rounded-xl border border-white/15 bg-black/20 px-3 text-xs text-white" type="date" value={confirmedCutoff} onChange={(event) => setConfirmedCutoff(event.target.value)} /></label><Button className="bg-white text-black hover:bg-white/90" disabled={busy || !confirmedCutoff || (status.environment === "sandbox" && !status.demo_fixture)} onClick={() => { void matchRecords() }}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : <RefreshCw size={16} />}{busyLabel || "Refresh"}</Button></div></div>
        {busy && <div className="mt-4 flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2 text-xs text-white/65"><DatabaseZap className="text-brand-green" size={15} /><span>{busyLabel}</span></div>}
      </div>}
    </div>

    {records && <div className="border-t border-white/10 bg-white/[.04] p-4 sm:p-5">
      <div className="grid gap-2 sm:grid-cols-4"><div className="rounded-2xl bg-white/10 p-4"><p className="text-3xl font-semibold tracking-[-.05em]">{records.summary.total_searched}</p><p className="mt-1 text-xs text-white/60">transactions searched</p></div><div className="rounded-2xl bg-brand-green p-4 text-black"><p className="text-3xl font-semibold tracking-[-.05em]">{records.summary.include}</p><p className="mt-1 text-xs font-medium">include candidates</p></div><div className="rounded-2xl bg-neutral-300 p-4 text-black"><p className="text-3xl font-semibold tracking-[-.05em]">{records.summary.review}</p><p className="mt-1 text-xs font-medium">need review</p></div><div className="rounded-2xl bg-white/10 p-4"><p className="text-3xl font-semibold tracking-[-.05em]">{records.summary.exclude}</p><p className="mt-1 text-xs text-white/60">kept outside</p></div></div>
      <p className="mt-4 text-xs leading-5 text-white/55">{records.review_notice}</p>
      {records.include.length > 0 && <div className="mt-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-white/40">Include candidates</p><button type="button" className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold text-white/75 hover:bg-white/15" onClick={approveSuggested}>Approve {records.include.length} suggested</button></div><div className="mt-2 space-y-2">{records.include.map((record) => <PaymentRow key={record.record_id} record={record} decision={decisions[record.record_id]} onDecision={(decision) => decide(record.record_id, decision)} />)}</div></div>}
      {records.review.length > 0 && <div className="mt-4"><div className="flex items-center gap-2 text-muted-foreground"><AlertTriangle size={15} /><p className="text-[10px] font-semibold uppercase tracking-[.18em]">Human review needed</p></div><div className="mt-2 space-y-2">{records.review.map((record) => <PaymentRow key={record.record_id} record={record} decision={decisions[record.record_id]} onDecision={(decision) => decide(record.record_id, decision)} />)}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">{records.boundary_warning}</p></div>}
      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-brand-green/30 bg-brand-green/10 p-4 text-xs leading-5 text-white/70"><ShieldCheck className="mt-0.5 shrink-0 text-brand-green" size={15} /><p><strong className="text-white">Review before export.</strong> {records.legal_boundary} Nothing is automatically sent or shared.</p></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.04] p-4">
        <div><p className="text-sm font-semibold">{reviewedCount} of {candidateRecords.length} candidates reviewed</p><p className="mt-1 text-[10px] text-white/45">The manifest contains your decisions and matching reasons. It is not automatically sent.</p></div>
        <Button className="bg-white text-black hover:bg-white/90" disabled={!reviewComplete} onClick={exportManifest}><Download size={16} /> {packetReady ? "Download manifest again" : "Export counsel handoff"}</Button>
      </div>
    </div>}
  </section>
}
