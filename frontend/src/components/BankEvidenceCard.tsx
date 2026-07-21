import { AlertTriangle, Check, CheckCircle2, DatabaseZap, Download, EyeOff, Landmark, LoaderCircle, ShieldCheck, Zap } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useAuth } from "@/AuthContext"
import type { EvidenceWorkflowState } from "@/components/CaseWorkflow"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  connectPlaidSandboxDemo,
  createUserPlaidLinkToken,
  disconnectPlaidConnection,
  exchangeUserPlaidPublicToken,
  fetchPlaidStatus,
  getDemoCredential,
  matchPlaidTransactions,
  type Analysis,
  type PaymentMatchRecord,
  type PaymentMatchResponse,
  type PlaidConnectionStatus,
} from "@/lib/api"
import { isSandboxPlaidEnvironment } from "@/lib/bankConnect"
import { openPlaidLink } from "@/lib/plaidLink"

type LoadState = "loading" | "ready" | "error"
type ReviewDecision = "approved" | "excluded" | "counsel"
type TransactionPartition = "matched" | "review" | "excluded"
const DEFAULT_CUTOFF_DATE = "2026-07-16"
const MIN_TRANSACTION_LOADING_MS = 1100

async function holdTransactionLoading(startedAt: number): Promise<void> {
  const remaining = MIN_TRANSACTION_LOADING_MS - (performance.now() - startedAt)
  if (remaining > 0) await new Promise((resolve) => window.setTimeout(resolve, remaining))
}

function isDemoPlaidEnvironment(environment: PlaidConnectionStatus["environment"] | undefined): boolean {
  return isSandboxPlaidEnvironment(environment)
}

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

function requestText(analysis: Analysis): string {
  return analysis.breakdown?.requested_actions.join(" ") || analysis.summary
}

function requestedPerson(analysis: Analysis): string {
  const match = requestText(analysis).match(
    /(?:benefit\s+of|payments?\s+(?:made\s+)?to)\s+([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,3})\s+from\b/,
  )
  return match?.[1]?.trim() || analysis.breakdown?.parties[0] || "Named person"
}

function requestedStartDate(analysis: Analysis): string {
  const match = requestText(analysis).match(/\bfrom\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i)
  return match?.[1] || "Displayed start date"
}

function transactionMatchSourceLabel(source: PaymentMatchResponse["transaction_source"] | undefined): string {
  if (source === "mongo_cache") return "Mongo snapshot"
  if (source === "reviewed_sample") return "Reviewed sample"
  return "Plaid live"
}

function transactionSyncLabel(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
}

function PaymentRow({ record, decision, onDecision }: {
  record: PaymentMatchRecord
  decision?: ReviewDecision
  onDecision: (decision: ReviewDecision) => void
}) {
  const stateClass = decision === "approved"
    ? "border-emerald-300 bg-emerald-50 shadow-[inset_4px_0_0_#22c55e]"
    : decision === "excluded"
      ? "border-zinc-300 bg-zinc-100 opacity-80"
      : decision === "counsel"
        ? "border-zinc-300 bg-zinc-100 shadow-[inset_4px_0_0_#737373]"
        : record.disposition === "REVIEW"
          ? "border-zinc-200 bg-white"
          : "border-transparent bg-white"
  return <article className={`rounded-2xl border p-4 text-black transition-all ${stateClass}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-sm font-semibold">{record.description}</p><p className="mt-1 text-xs text-zinc-500">{record.date} · {reasonLabel(record)}</p></div>
      <div className="text-right"><Badge variant={record.disposition === "INCLUDE" ? "default" : "warning"}>{record.disposition === "INCLUDE" ? "CANDIDATE" : "REVIEW"}</Badge><p className="mt-2 text-sm font-semibold">{money(record.amount, record.currency)}</p></div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-black/5 pt-3">
      <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400">Owner decision</span>
      <button type="button" aria-pressed={decision === "approved"} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-semibold transition ${decision === "approved" ? "bg-emerald-600 text-white" : "bg-black/5 text-zinc-600 hover:bg-black/10"}`} onClick={() => onDecision("approved")}>{decision === "approved" && <Check size={11} />}{decision === "approved" ? "Approved" : "Approve"}</button>
      <button type="button" aria-pressed={decision === "excluded"} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-semibold transition ${decision === "excluded" ? "bg-black text-white" : "bg-black/5 text-zinc-600 hover:bg-black/10"}`} onClick={() => onDecision("excluded")}>{decision === "excluded" && <EyeOff size={11} />}{decision === "excluded" ? "Kept out" : "Keep out"}</button>
      {record.disposition === "REVIEW" && <button type="button" aria-pressed={decision === "counsel"} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-semibold transition ${decision === "counsel" ? "bg-neutral-500 text-white" : "bg-black/5 text-zinc-600 hover:bg-black/10"}`} onClick={() => onDecision("counsel")}>{decision === "counsel" && <Check size={11} />}{decision === "counsel" ? "Counsel review" : "Ask counsel"}</button>}
    </div>
  </article>
}

function TransactionLoader({ label }: { label: string | null }) {
  const stages = ["Open read-only source", "Fetch scoped transactions", "Apply D4 matching rules"]
  const activeIndex = label?.toLowerCase().includes("connect") || label?.toLowerCase().includes("open")
    ? 0
    : label?.toLowerCase().includes("fetch")
      ? 1
      : 2
  return <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/25 p-4" role="status" aria-live="polite">
    <div className="flex items-center gap-3"><span className="relative grid size-10 place-items-center rounded-xl bg-brand-green/15 text-brand-green"><DatabaseZap className="animate-pulse" size={19} /><span className="absolute inset-0 animate-ping rounded-xl border border-brand-green/20 motion-reduce:animate-none" /></span><div><p className="text-sm font-semibold text-white">{label || "Preparing the transaction review"}</p><p className="mt-0.5 text-[10px] text-white/40">Only the verified payee, date range, and requested category are used.</p></div></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-3">{stages.map((stage, index) => <div className={`rounded-xl border px-3 py-2.5 transition ${index < activeIndex ? "border-emerald-400/20 bg-emerald-400/10" : index === activeIndex ? "border-brand-green/30 bg-brand-green/10" : "border-white/[.07] bg-white/[.03]"}`} key={stage}><div className="flex items-center gap-2"><span className={`grid size-5 place-items-center rounded-full text-[9px] font-bold ${index < activeIndex ? "bg-emerald-400 text-black" : index === activeIndex ? "animate-pulse bg-brand-green text-black motion-reduce:animate-none" : "bg-white/10 text-white/35"}`}>{index < activeIndex ? "✓" : index + 1}</span><span className={`text-[10px] ${index <= activeIndex ? "text-white/80" : "text-white/35"}`}>{stage}</span></div></div>)}</div>
    <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full w-2/5 animate-[scan-progress_1.2s_ease-in-out_infinite] rounded-full bg-brand-green motion-reduce:animate-none" /></div>
  </div>
}

export function BankEvidenceCard({ analysis, analysisId, documentName, cutoffDate = DEFAULT_CUTOFF_DATE, onWorkflowChange }: {
  analysis: Analysis
  analysisId: string
  documentName?: string
  cutoffDate?: string | null
  onWorkflowChange?: (state: EvidenceWorkflowState) => void
}) {
  const { credential } = useAuth()
  const [demoCredential, setDemoCredential] = useState<string | null>(null)
  const accessCredential = credential ?? demoCredential
  const normalizedCutoff = normalizeCutoffDate(cutoffDate)
  const scopePerson = requestedPerson(analysis)
  const scopeStart = requestedStartDate(analysis)
  const [status, setStatus] = useState<PlaidConnectionStatus | null>(null)
  const [statusState, setStatusState] = useState<LoadState>("loading")
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmedCutoff, setConfirmedCutoff] = useState(normalizedCutoff)
  const [records, setRecords] = useState<PaymentMatchResponse | null>(null)
  const [activePartition, setActivePartition] = useState<TransactionPartition>("matched")
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
    autoMatchStarted.current = false
    setStatus(null)
    setRecords(null)
    setError(null)
    setPacketReady(false)
    setBusy(false)
    setBusyLabel(null)
  }, [analysisId])

  useEffect(() => {
    if (credential) {
      setDemoCredential(null)
      return
    }
    let active = true
    void getDemoCredential()
      .then((token) => { if (active) setDemoCredential(token) })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "The sample workspace is unavailable.")
          setStatusState("error")
        }
      })
    return () => { active = false }
  }, [credential])

  useEffect(() => {
    localStorage.setItem(`served-payment-review-${analysisId}`, JSON.stringify(decisions))
  }, [analysisId, decisions])

  useEffect(() => {
    if (records) setActivePartition("matched")
  }, [records])

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
    if (!accessCredential || !analysisId) return
    const controller = new AbortController()
    setStatusState("loading")
    void fetchPlaidStatus(analysisId, accessCredential, controller.signal)
      .then((nextStatus) => {
        setStatus(nextStatus)
        setStatusState("ready")
        const readyForMatch = nextStatus.connected
          && (nextStatus.environment === "production" || nextStatus.demo_fixture)
        if (readyForMatch && !autoMatchStarted.current) {
          autoMatchStarted.current = true
          const startedAt = performance.now()
          setBusy(true)
          setBusyLabel("Fetching and matching transactions…")
          void matchPlaidTransactions(analysisId, accessCredential, normalizedCutoff, controller.signal)
            .then(async (nextRecords) => {
              await holdTransactionLoading(startedAt)
              if (controller.signal.aborted) return
              setRecords(nextRecords)
            })
            .catch((cause) => {
              if (controller.signal.aborted) return
              autoMatchStarted.current = false
              setError(cause instanceof Error ? cause.message : "Payment records could not be matched.")
            })
            .finally(() => {
              if (controller.signal.aborted) return
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
  }, [accessCredential, analysisId, normalizedCutoff])

  const connectSampleAccount = async () => {
    if (!accessCredential || busy) return
    setBusy(true)
    const startedAt = performance.now()
    setError(null)
    try {
      if (status?.connected && !status.demo_fixture) {
        setBusyLabel("Switching to sample account…")
        await disconnectPlaidConnection(accessCredential)
        setStatus((current) => (current ? { ...current, connected: false, demo_fixture: false, institution_name: null } : current))
        setRecords(null)
        autoMatchStarted.current = false
      }
      setBusyLabel("Connecting Mendoza’s Kitchen sample account…")
      const nextStatus = await connectPlaidSandboxDemo(analysisId, accessCredential)
      setStatus(nextStatus)
      setBusyLabel("Matching Audrea Barnes payments…")
      const nextRecords = await matchPlaidTransactions(analysisId, accessCredential, confirmedCutoff)
      await holdTransactionLoading(startedAt)
      setRecords(nextRecords)
      autoMatchStarted.current = true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The sample account could not be connected.")
    } finally {
      setBusy(false)
      setBusyLabel(null)
    }
  }

  const connect = async () => {
    if (!accessCredential || busy) return
    if (!credential) {
      await connectSampleAccount()
      return
    }
    setBusy(true)
    setBusyLabel("Opening secure bank connection…")
    setError(null)
    try {
      await openPlaidLink({
        fetchLinkToken: () => createUserPlaidLinkToken(accessCredential, analysisId),
        analysisIdForLegacyApi: analysisId,
        onSuccess: async (publicToken, institution) => {
          const startedAt = performance.now()
          setBusyLabel("Bank connected. Fetching transactions…")
          const nextStatus = await exchangeUserPlaidPublicToken(accessCredential, publicToken, institution, analysisId)
          setStatus(nextStatus)
          setBusyLabel("Matching transactions to the subpoena…")
          const nextRecords = await matchPlaidTransactions(analysisId, accessCredential, confirmedCutoff)
          await holdTransactionLoading(startedAt)
          setRecords(nextRecords)
          autoMatchStarted.current = true
        },
        onExit: (message) => {
          if (message) setError(message)
        },
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The bank connection could not start.")
    } finally {
      setBusy(false)
      setBusyLabel(null)
    }
  }

  const matchRecords = async () => {
    if (!accessCredential || busy) return
    setBusy(true)
    const startedAt = performance.now()
    setBusyLabel("Loading saved or live transactions…")
    setError(null)
    try {
      const nextRecords = await matchPlaidTransactions(analysisId, accessCredential, confirmedCutoff)
      await holdTransactionLoading(startedAt)
      setRecords(nextRecords)
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
    const approvedCount = candidates.filter((record) => decisions[record.record_id] === "approved").length
    const keptOutCount = candidates.filter((record) => decisions[record.record_id] === "excluded").length
    const counselCount = candidates.filter((record) => decisions[record.record_id] === "counsel").length
    const escape = (value: string | number | null | undefined) => `"${String(value ?? "").replaceAll('"', '""')}"`
    const rows = [
      ["criteria_source_document", records.criteria_snapshot.source_document],
      ["criteria_case", analysis.breakdown?.case_number],
      ["criteria_person", records.criteria_snapshot.target_payee],
      ["criteria_date_range", `${records.criteria_snapshot.start_date} through ${records.criteria_snapshot.cutoff_date}`],
      ["criteria_record_type", "Payments and bank records"],
      ["summary_searched", records.summary.total_searched],
      ["summary_candidate", records.summary.include],
      ["summary_needs_review", records.summary.review],
      ["summary_kept_out_by_rule", records.summary.exclude],
      ["owner_approved", approvedCount],
      ["owner_kept_out", keptOutCount],
      ["owner_marked_for_counsel", counselCount],
      [],
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

  if (statusState === "loading") return <section className="mt-5 rounded-2xl border border-black/10 bg-[#111] p-4 text-white" aria-busy="true"><TransactionLoader label="Checking financial-record eligibility…" /></section>
  if (statusState === "error") return <Alert className="mt-5 rounded-2xl border-border bg-muted text-muted-foreground"><AlertTitle>Financial tools remain locked</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  if (!status?.configured) return <Alert className="mt-5 rounded-2xl border-border bg-muted text-muted-foreground"><AlertTitle>Bank connection unavailable</AlertTitle><AlertDescription>The request is verified, but the bank connection is not configured.</AlertDescription></Alert>

  const progress = [
    { label: "Request verified", done: true },
    { label: "Bank connected", done: status.connected },
    { label: "Transactions loaded", done: Boolean(records) },
    { label: "Matches ready", done: Boolean(records) },
  ]

  const candidateRecords = records ? [...records.include, ...records.review] : []
  const reviewedCount = candidateRecords.filter((record) => Boolean(decisions[record.record_id])).length
  const reviewComplete = candidateRecords.length > 0 && reviewedCount === candidateRecords.length
  const approvedSuggestedCount = records?.include.filter((record) => decisions[record.record_id] === "approved").length ?? 0
  const allSuggestedApproved = Boolean(records?.include.length) && approvedSuggestedCount === records?.include.length
  const approvedCount = candidateRecords.filter((record) => decisions[record.record_id] === "approved").length
  const ownerKeptOutCount = candidateRecords.filter((record) => decisions[record.record_id] === "excluded").length
  const counselCount = candidateRecords.filter((record) => decisions[record.record_id] === "counsel").length

  const demoPlaid = isDemoPlaidEnvironment(status?.environment)
  const wrongDemoBank = demoPlaid && status.connected && !status.demo_fixture
  const showDemoMismatch =
    records != null
    && demoPlaid
    && !status.demo_fixture
    && records.summary.include === 0
    && records.summary.review === 0
    && records.summary.exclude > 0

  return <section id={`records-${analysisId}`} className="mt-5 scroll-mt-24 overflow-hidden rounded-[28px] border border-black/10 bg-[#111] text-white shadow-[0_20px_50px_rgba(0,0,0,.18)]">
    <div className="p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white text-black"><Zap size={20} /></span><div><h3 className="type-subsection text-white">Candidate payment records</h3><p className="type-caption mt-1 text-white/55">The request controls which bank transactions enter review.</p></div></div>
        <Badge className="bg-white text-black">VERIFIED</Badge>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[.04]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-green">Locked request scope</p><p className="mt-1 text-xs text-white/55">Served searches against these extracted limits, not the whole account.</p></div><p className="max-w-[16rem] truncate text-[10px] text-white/35" title={documentName || "Saved request"}>{documentName || "Saved request"}</p></div>
        <div className="grid gap-px bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
          <div className="bg-[#171717] p-3"><p className="text-[9px] uppercase tracking-[.14em] text-white/35">Case</p><p className="mt-1.5 break-all text-xs font-semibold">{analysis.breakdown?.case_number || "Verified saved case"}</p></div>
          <div className="bg-[#171717] p-3"><p className="text-[9px] uppercase tracking-[.14em] text-white/35">Person</p><p className="mt-1.5 text-xs font-semibold">{records?.criteria_snapshot.target_payee || scopePerson}</p></div>
          <div className="bg-[#171717] p-3"><p className="text-[9px] uppercase tracking-[.14em] text-white/35">Date range</p><p className="mt-1.5 text-xs font-semibold">{records?.criteria_snapshot.start_date || scopeStart} through {confirmedCutoff}</p></div>
          <div className="bg-[#171717] p-3"><p className="text-[9px] uppercase tracking-[.14em] text-white/35">Requested records</p><p className="mt-1.5 text-xs font-semibold">Payments and bank records</p></div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 px-4 py-3 text-[10px] text-white/60">{["Owner-scoped analysis", "VERIFIED request", "Supported record type"].map((gate) => <span className="inline-flex items-center gap-1.5" key={gate}><CheckCircle2 className="text-brand-green" size={13} />{gate}</span>)}</div>
      </div>

      <div className="mt-3 grid overflow-hidden rounded-2xl border border-white/10 bg-white/[.04] sm:grid-cols-4">
        {progress.map((step, index) => <div className={`flex items-center gap-2 px-3 py-3 text-[11px] ${index < progress.length - 1 ? "border-b border-white/10 sm:border-r sm:border-b-0" : ""}`} key={step.label}><span className={`grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-bold ${step.done ? "bg-brand-green text-black" : "bg-white/10 text-white/40"}`}>{step.done ? "✓" : index + 1}</span><span className={step.done ? "text-white" : "text-white/40"}>{step.label}</span></div>)}
      </div>

      {wrongDemoBank && (
        <Alert className="mt-4 border-white/25 bg-white/10 text-white">
          <AlertTitle>Not the D4 demo bank</AlertTitle>
          <AlertDescription className="space-y-2 text-white/75">
            <p>
              Generic Plaid sandbox banks (Bank of America, American Express, etc.) do not include Audrea Barnes payments.
              Connect the Mendoza’s Kitchen sample for 7 include, 2 review, 19 exclude.
            </p>
            <Button type="button" className="h-9 bg-white text-black hover:bg-white/90" disabled={busy} onClick={() => { void connectSampleAccount() }}>
              <Landmark size={15} /> Switch to sample account
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {error && <Alert className="mt-4 border-red-400/30 bg-red-400/10 text-white"><AlertTitle>Could not complete that step</AlertTitle><AlertDescription className="text-white/70">{error}</AlertDescription></Alert>}

      {!status.connected ? <div className="mt-5 rounded-2xl bg-white/[.07] p-4 sm:p-5"><div className="flex flex-wrap gap-2"><Button className="h-12 w-full bg-white text-sm font-medium text-black hover:bg-white/90 sm:w-auto sm:px-7" disabled={busy} onClick={() => { void connect() }}>{busy ? <LoaderCircle className="animate-spin" size={17} /> : <Landmark size={17} />}{busyLabel || (credential ? "Connect realistic Plaid bank" : "Open D4 judge fixture")}</Button>{credential && demoPlaid && <Button variant="outline" className="h-12 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white" disabled={busy} onClick={() => { void connectSampleAccount() }}><DatabaseZap size={17} />Use D4 judge fixture</Button>}</div>{demoPlaid && <p className="type-caption mt-2 text-white/40">{credential ? "Plaid Link provides general sandbox transactions unrelated to Audrea. The separate D4 fixture preserves the exact 7 / 2 / 19 judging flow." : "Loads the reviewed D4 fixture for the exact judging flow."}</p>}</div> : <div className="mt-5 rounded-2xl bg-white/[.07] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><CheckCircle2 className="text-white" size={18} /><div><p className="type-ui font-medium text-white">{status.institution_name || "Bank connected"}</p>{status.demo_fixture && <p className="type-caption mt-0.5 text-white/40">Mendoza’s Kitchen · Business checking · 28 transactions</p>}</div></div><div className="flex flex-wrap items-end gap-2">{wrongDemoBank && <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white" disabled={busy} onClick={() => { void connectSampleAccount() }}><Landmark size={15} />Use sample account</Button>}<label className="type-caption text-white/50">Through<input className="mt-1 block h-9 rounded-xl border border-white/15 bg-black/20 px-3 text-xs text-white" type="date" value={confirmedCutoff} onChange={(event) => setConfirmedCutoff(event.target.value)} /></label><Button className="bg-white text-black hover:bg-white/90" disabled={busy || !confirmedCutoff || (demoPlaid && !status.demo_fixture)} onClick={() => { void matchRecords() }}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : <DatabaseZap size={16} />}{busyLabel || "Get transactions"}</Button></div></div>
        {busy && <TransactionLoader label={busyLabel} />}
      </div>}
    </div>

    {records && <div className="border-t border-white/10 bg-white/[.04] p-4 sm:p-5">
      {showDemoMismatch && (
        <Alert className="mb-4 border-white/25 bg-white/10 text-white">
          <AlertTitle>These counts are not the D4 demo</AlertTitle>
          <AlertDescription className="space-y-2 text-white/75">
            <p>Expected on sample D4: 7 include, 2 review, 19 exclude (28 transactions). Switch to the sample account to match the homepage.</p>
            <Button type="button" className="h-9 bg-white text-black hover:bg-white/90" disabled={busy} onClick={() => { void connectSampleAccount() }}>
              <Landmark size={15} /> Switch to sample account
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-green">Transaction review</p><h4 className="mt-1 text-lg font-semibold text-white">Found candidate records. Kept everything else outside.</h4><p className="mt-1 text-[10px] text-white/40">Source · {transactionMatchSourceLabel(records.transaction_source)}{transactionSyncLabel(records.transactions_synced_at) ? ` · synced ${transactionSyncLabel(records.transactions_synced_at)}` : ""}</p></div><div className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] text-white/55">{records.summary.total_searched} searched</div></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Transaction partitions">
        <button type="button" aria-pressed={activePartition === "matched"} onClick={() => setActivePartition("matched")} className={`rounded-2xl border p-4 text-left transition ${activePartition === "matched" ? "border-emerald-300 bg-emerald-300 text-emerald-950 shadow-[0_10px_30px_rgba(52,211,153,.14)]" : "border-white/10 bg-white/[.05] text-white hover:bg-white/10"}`}><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-[.14em]">Candidate</p><CheckCircle2 size={16} /></div><p className="mt-2 text-3xl font-semibold tracking-[-.05em]">{records.summary.include}</p><p className={`mt-1 text-xs ${activePartition === "matched" ? "text-emerald-900/70" : "text-white/45"}`}>{approvedSuggestedCount} owner approved</p></button>
        <button type="button" aria-pressed={activePartition === "review"} onClick={() => setActivePartition("review")} className={`rounded-2xl border p-4 text-left transition ${activePartition === "review" ? "border-white/40 bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,.08)]" : "border-white/10 bg-white/[.05] text-white hover:bg-white/10"}`}><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-[.14em]">Needs review</p><AlertTriangle size={16} /></div><p className="mt-2 text-3xl font-semibold tracking-[-.05em]">{records.summary.review}</p><p className={`mt-1 text-xs ${activePartition === "review" ? "text-black/60" : "text-white/45"}`}>Human decision required</p></button>
        <button type="button" aria-pressed={activePartition === "excluded"} onClick={() => setActivePartition("excluded")} className={`rounded-2xl border p-4 text-left transition ${activePartition === "excluded" ? "border-sky-200 bg-sky-100 text-sky-950 shadow-[0_10px_30px_rgba(186,230,253,.10)]" : "border-white/10 bg-white/[.05] text-white hover:bg-white/10"}`}><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-[.14em]">Kept outside</p><EyeOff size={16} /></div><p className="mt-2 text-3xl font-semibold tracking-[-.05em]">{records.summary.exclude}</p><p className={`mt-1 text-xs ${activePartition === "excluded" ? "text-sky-900/65" : "text-white/45"}`}>Protected from the packet</p></button>
      </div>
      <p className="mt-4 text-xs leading-5 text-white/55">{records.review_notice}</p>

      {activePartition === "matched" && <div className="mt-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-emerald-300">Exact candidate matches</p><p className="mt-1 text-xs text-white/45">Payee and displayed date range matched. The owner still approves each record.</p></div><button type="button" disabled={allSuggestedApproved} className={`rounded-full px-3 py-1.5 text-[10px] font-semibold transition ${allSuggestedApproved ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 text-white/75 hover:bg-white/15"}`} onClick={approveSuggested}>{allSuggestedApproved ? "All suggested approved" : `Approve ${records.include.length} suggested`}</button></div><div className="mt-3 space-y-2">{records.include.map((record) => <PaymentRow key={record.record_id} record={record} decision={decisions[record.record_id]} onDecision={(decision) => decide(record.record_id, decision)} />)}</div></div>}
      {activePartition === "review" && <div className="mt-4"><div className="flex items-center gap-2 text-white/70"><AlertTriangle size={15} /><p className="text-[10px] font-semibold uppercase tracking-[.18em]">Resolve before export</p></div><div className="mt-3 space-y-2">{records.review.map((record) => <PaymentRow key={record.record_id} record={record} decision={decisions[record.record_id]} onDecision={(decision) => decide(record.record_id, decision)} />)}</div><p className="mt-3 text-xs leading-5 text-white/45">{records.boundary_warning}</p></div>}
      {activePartition === "excluded" && <div className="mt-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-sky-200">Protected from the response packet</p><p className="mt-1 text-xs leading-5 text-white/45">Served records only an audit ID and exclusion reason. Unrelated transaction details stay out of the candidate workspace.</p></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{records.excluded_audit.map((record) => <article className="flex items-center justify-between gap-3 rounded-xl border border-white/[.08] bg-white/[.04] px-3 py-3" key={record.record_id}><div className="min-w-0"><p className="truncate text-xs font-semibold text-white/75">{record.record_id}</p><p className="mt-1 text-[10px] text-white/35">{record.reason_code === "OUTSIDE_DATE_RANGE" ? "Outside the displayed date range" : "Different payee, not requested"}</p></div><Badge className="shrink-0 bg-sky-100 text-sky-950">KEPT OUT</Badge></article>)}</div></div>}
      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-brand-green/30 bg-brand-green/10 p-4 text-xs leading-5 text-white/70"><ShieldCheck className="mt-0.5 shrink-0 text-brand-green" size={15} /><p><strong className="text-white">Review before export.</strong> {records.legal_boundary} Nothing is automatically sent or shared.</p></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.04] p-4">
        <div><p className="text-sm font-semibold">{reviewedCount} of {candidateRecords.length} candidates reviewed</p><p className="mt-1 text-[10px] text-white/45">The manifest contains your decisions and matching reasons. It is not automatically sent.</p></div>
        <Button className="bg-white text-black hover:bg-white/90" disabled={!reviewComplete} onClick={exportManifest}><Download size={16} /> {packetReady ? "Download review list again" : "Download review list"}</Button>
      </div>
      {packetReady && <div className="mt-3 flex items-start gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-xs leading-5 text-emerald-100"><CheckCircle2 className="mt-0.5 shrink-0" size={16} /><p><strong>Review list prepared.</strong> {approvedCount} approved, {ownerKeptOutCount} kept out, and {counselCount} marked for counsel. The locked criteria and reason codes are included. Nothing was sent.</p></div>}
    </div>}
  </section>
}
