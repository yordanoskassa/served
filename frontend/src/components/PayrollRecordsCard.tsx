import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  EyeOff,
  FileSpreadsheet,
  LockKeyhole,
  LoaderCircle,
  ShieldCheck,
  Upload,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useAuth } from "@/AuthContext"
import type { EvidenceWorkflowState } from "@/components/CaseWorkflow"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  getDemoCredential,
  loadSamplePayroll,
  matchPayrollRecords,
  type Analysis,
  type PayrollCandidate,
  type PayrollMatchResponse,
  type PayrollRecordType,
} from "@/lib/api"


const recordLabels: Record<PayrollRecordType, string> = {
  payroll_record: "Payroll record",
  wage_statement: "Wage statement",
  time_record: "Time record",
}

type ReviewDecision = "approved" | "excluded" | "counsel"
type PayrollPartition = "strong" | "possible" | "outside"

function dateRange(record: PayrollCandidate): string {
  return `${record.period_start} to ${record.period_end}`
}

function payrollRequestText(analysis: Analysis): string {
  return analysis.breakdown?.requested_actions.join(" ") || analysis.summary
}

function payrollSubject(analysis: Analysis): string {
  const match = payrollRequestText(analysis).match(/records?\s+for\s+([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,3}),?\s+from\b/i)
  return match?.[1]?.trim() || analysis.breakdown?.parties[0] || "Named employee"
}

function payrollStartDate(analysis: Analysis): string {
  const match = payrollRequestText(analysis).match(/\bfrom\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i)
  return match?.[1] || "Displayed start date"
}

export function isPayrollRecordRequest(analysis: Analysis): boolean {
  const text = [
    analysis.document_type,
    analysis.summary,
    ...(analysis.breakdown?.requested_actions ?? []),
  ].join(" ").toLowerCase()
  return ["payroll", "wage statement", "time record"].some((word) => text.includes(word))
}

function CandidateDecision({ decision, possible, onDecision }: {
  decision?: ReviewDecision
  possible?: boolean
  onDecision: (decision: ReviewDecision) => void
}) {
  return <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-black/5 pt-3">
    <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400">Owner decision</span>
    <button type="button" aria-pressed={decision === "approved"} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-semibold ${decision === "approved" ? "bg-emerald-600 text-white" : "bg-black/5 text-zinc-600"}`} onClick={() => onDecision("approved")}>{decision === "approved" && <Check size={11} />}{decision === "approved" ? "Approved" : "Approve"}</button>
    <button type="button" aria-pressed={decision === "excluded"} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-semibold ${decision === "excluded" ? "bg-black text-white" : "bg-black/5 text-zinc-600"}`} onClick={() => onDecision("excluded")}>{decision === "excluded" && <EyeOff size={11} />}{decision === "excluded" ? "Kept out" : "Keep out"}</button>
    {possible && <button type="button" aria-pressed={decision === "counsel"} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-semibold ${decision === "counsel" ? "bg-neutral-500 text-white" : "bg-black/5 text-zinc-600"}`} onClick={() => onDecision("counsel")}>{decision === "counsel" && <Check size={11} />}{decision === "counsel" ? "Counsel review" : "Ask counsel"}</button>}
  </div>
}

export function PayrollRecordsCard({ analysis, analysisId, documentName, onWorkflowChange }: {
  analysis: Analysis
  analysisId?: string
  documentName?: string
  onWorkflowChange?: (state: EvidenceWorkflowState) => void
}) {
  const { credential } = useAuth()
  const [demoCredential, setDemoCredential] = useState<string | null>(null)
  const accessCredential = credential ?? demoCredential
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<PayrollMatchResponse | null>(null)
  const [activePartition, setActivePartition] = useState<PayrollPartition>("strong")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>(() => {
    try {
      return JSON.parse(localStorage.getItem(`served-payroll-review-${analysisId || "unsaved"}`) || "{}") as Record<string, ReviewDecision>
    } catch {
      return {}
    }
  })
  const [packetReady, setPacketReady] = useState(false)
  const isPayroll = isPayrollRecordRequest(analysis)
  const scopePerson = payrollSubject(analysis)
  const scopeStart = payrollStartDate(analysis)

  useEffect(() => {
    if (credential) {
      setDemoCredential(null)
      return
    }
    let active = true
    void getDemoCredential()
      .then((token) => { if (active) setDemoCredential(token) })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "The sample workspace is unavailable.")
      })
    return () => { active = false }
  }, [credential])

  useEffect(() => {
    if (analysisId) localStorage.setItem(`served-payroll-review-${analysisId}`, JSON.stringify(decisions))
  }, [analysisId, decisions])

  useEffect(() => {
    if (result) setActivePartition("strong")
  }, [result])

  useEffect(() => {
    const candidates = result ? [...result.strong_matches, ...result.possible_matches] : []
    onWorkflowChange?.({
      sourceReady: Boolean(file),
      candidatesReady: Boolean(result),
      reviewed: candidates.filter((record) => Boolean(decisions[record.record_id])).length,
      total: candidates.length,
      packetReady,
      sourceLabel: file ? file.name : "Payroll export",
    })
  }, [decisions, file, onWorkflowChange, packetReady, result])

  if (analysis.verdict !== "verified") {
    return <section className="mt-5 rounded-2xl border border-black/10 bg-white/75 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-black/5"><LockKeyhole size={18} /></span>
        <div>
          <h3 className="type-ui-heading">Financial tools locked</h3>
          <p className="type-body mt-1 max-w-2xl">
            {analysis.verdict === "cannot_confirm"
              ? "Confirm the route through an official source first."
              : "Fraud indicators detected. Financial access remains locked."}
          </p>
        </div>
      </div>
    </section>
  }

  if (!isPayroll) return null

  const runMatch = async (nextFile: File) => {
    setFile(nextFile)
    setResult(null)
    setError(null)
    if (!analysisId || !accessCredential) {
      setError("Save this verified analysis and sign in again before matching payroll records.")
      return
    }
    setBusy(true)
    try {
      setResult(await matchPayrollRecords(analysisId, nextFile, accessCredential))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payroll records could not be matched.")
    } finally {
      setBusy(false)
    }
  }

  const useDemo = async () => {
    setBusy(true)
    setError(null)
    try {
      const sample = await loadSamplePayroll()
      await runMatch(sample)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The sample payroll file could not be prepared.")
      setBusy(false)
    }
  }

  const decide = (recordId: string, decision: ReviewDecision) => {
    setPacketReady(false)
    setDecisions((current) => ({ ...current, [recordId]: decision }))
  }

  const approveSuggested = () => {
    if (!result) return
    setPacketReady(false)
    setDecisions((current) => ({
      ...current,
      ...Object.fromEntries(result.strong_matches.map((record) => [record.record_id, "approved" as const])),
    }))
  }

  const exportManifest = () => {
    if (!result || !analysisId) return
    const candidates = [...result.strong_matches, ...result.possible_matches]
    const approvedCount = candidates.filter((record) => decisions[record.record_id] === "approved").length
    const keptOutCount = candidates.filter((record) => decisions[record.record_id] === "excluded").length
    const counselCount = candidates.filter((record) => decisions[record.record_id] === "counsel").length
    const escape = (value: string | number | null | undefined) => `"${String(value ?? "").replaceAll('"', '""')}"`
    const rows = [
      ["criteria_source_document", documentName || "Saved request"],
      ["criteria_case", analysis.breakdown?.case_number],
      ["criteria_employee", result.criteria.employee_name],
      ["criteria_date_range", `${result.criteria.start_date} through ${result.criteria.end_date || "present"}`],
      ["criteria_record_types", result.criteria.record_types.map((type) => recordLabels[type]).join("; ")],
      ["summary_candidate", result.summary.strong],
      ["summary_needs_review", result.summary.possible],
      ["summary_kept_out_by_rule", result.summary.outside_criteria],
      ["owner_approved", approvedCount],
      ["owner_kept_out", keptOutCount],
      ["owner_marked_for_counsel", counselCount],
      [],
      ["record_id", "employee", "record_type", "period_start", "period_end", "source", "served_match", "owner_decision", "match_reason"],
      ...candidates.map((record) => [record.record_id, record.employee_name, record.record_type, record.period_start, record.period_end, record.source, record.match_strength, decisions[record.record_id], record.match_reason]),
    ]
    const blob = new Blob([rows.map((row) => row.map((value) => escape(value)).join(",")).join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `served-payroll-review-${analysisId.slice(-8)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    setPacketReady(true)
  }

  const candidates = result ? [...result.strong_matches, ...result.possible_matches] : []
  const reviewedCount = candidates.filter((record) => Boolean(decisions[record.record_id])).length
  const reviewComplete = candidates.length > 0 && reviewedCount === candidates.length
  const strongApprovedCount = result?.strong_matches.filter((record) => decisions[record.record_id] === "approved").length ?? 0
  const allStrongApproved = Boolean(result?.strong_matches.length) && strongApprovedCount === result?.strong_matches.length
  const approvedCount = candidates.filter((record) => decisions[record.record_id] === "approved").length
  const ownerKeptOutCount = candidates.filter((record) => decisions[record.record_id] === "excluded").length
  const counselCount = candidates.filter((record) => decisions[record.record_id] === "counsel").length

  return <section id={analysisId ? `records-${analysisId}` : undefined} className="mt-5 scroll-mt-24 overflow-hidden rounded-2xl border border-black/10 bg-[#111] text-white">
    <div className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10"><FileSpreadsheet size={18} /></span>
          <div>
            <h3 className="type-ui-heading text-white">Candidate payroll records</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-white/55">The request controls which payroll records enter review.</p>
          </div>
        </div>
        <Badge className="bg-brand-green text-black">REQUEST VERIFIED</Badge>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[.04]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-green">Locked request scope</p><p className="mt-1 text-xs text-white/55">Served compares the export against these limits, not every payroll record.</p></div><p className="max-w-[16rem] truncate text-[10px] text-white/35" title={documentName || "Saved request"}>{documentName || "Saved request"}</p></div>
        <div className="grid gap-px bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
          <div className="bg-[#171717] p-3"><p className="text-[9px] uppercase tracking-[.14em] text-white/35">Case</p><p className="mt-1.5 break-all text-xs font-semibold">{analysis.breakdown?.case_number || "Verified saved case"}</p></div>
          <div className="bg-[#171717] p-3"><p className="text-[9px] uppercase tracking-[.14em] text-white/35">Employee</p><p className="mt-1.5 text-xs font-semibold">{result?.criteria.employee_name || scopePerson}</p></div>
          <div className="bg-[#171717] p-3"><p className="text-[9px] uppercase tracking-[.14em] text-white/35">Date range</p><p className="mt-1.5 text-xs font-semibold">{result?.criteria.start_date || scopeStart} through {result?.criteria.end_date || "present"}</p></div>
          <div className="bg-[#171717] p-3"><p className="text-[9px] uppercase tracking-[.14em] text-white/35">Requested records</p><p className="mt-1.5 text-xs font-semibold">Payroll, wages, and time</p></div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 px-4 py-3 text-[10px] text-white/60">{["Owner-scoped analysis", "VERIFIED request", "Supported record type"].map((gate) => <span className="inline-flex items-center gap-1.5" key={gate}><CheckCircle2 className="text-brand-green" size={13} />{gate}</span>)}</div>
      </div>

      {error && <Alert className="mt-4 border-red-400/30 bg-red-400/10 text-white"><AlertTitle>Records stayed locked</AlertTitle><AlertDescription className="text-white/70">{error}</AlertDescription></Alert>}

      {!result && <div className="mt-5 rounded-2xl border border-white/10 bg-white/[.04] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button className="bg-white text-black hover:bg-white/90" disabled={busy} onClick={() => { void useDemo() }}>
            {busy ? <LoaderCircle className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
            Use sample payroll file
          </Button>
          <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white" disabled={busy} onClick={() => input.current?.click()}>
            <Upload size={16} /> Upload payroll CSV
          </Button>
          <input
            ref={input}
            className="sr-only"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const nextFile = event.target.files?.[0]
              if (nextFile) void runMatch(nextFile)
            }}
          />
        </div>
        <p className="mt-3 text-[10px] leading-4 text-white/40">Mendoza&apos;s Kitchen payroll records. No live payroll account is used.</p>
      </div>}

      {result && <div className="mt-5 space-y-4">
        <div className="grid gap-2 sm:grid-cols-3" aria-label="Payroll record partitions">
          <button type="button" aria-pressed={activePartition === "strong"} onClick={() => setActivePartition("strong")} className={`rounded-2xl border p-4 text-left transition ${activePartition === "strong" ? "border-emerald-300 bg-emerald-300 text-emerald-950" : "border-white/10 bg-white/[.05] text-white"}`}><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[.14em]">Candidate</p><CheckCircle2 size={16} /></div><p className="mt-2 text-3xl font-semibold tracking-[-.05em]">{result.summary.strong}</p><p className={`mt-1 text-xs ${activePartition === "strong" ? "text-emerald-900/70" : "text-white/45"}`}>{strongApprovedCount} owner approved</p></button>
          <button type="button" aria-pressed={activePartition === "possible"} onClick={() => setActivePartition("possible")} className={`rounded-2xl border p-4 text-left transition ${activePartition === "possible" ? "border-white/40 bg-white text-black" : "border-white/10 bg-white/[.05] text-white"}`}><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[.14em]">Needs review</p><AlertTriangle size={16} /></div><p className="mt-2 text-3xl font-semibold tracking-[-.05em]">{result.summary.possible}</p><p className={`mt-1 text-xs ${activePartition === "possible" ? "text-black/60" : "text-white/45"}`}>Human decision required</p></button>
          <button type="button" aria-pressed={activePartition === "outside"} onClick={() => setActivePartition("outside")} className={`rounded-2xl border p-4 text-left transition ${activePartition === "outside" ? "border-sky-200 bg-sky-100 text-sky-950" : "border-white/10 bg-white/[.05] text-white"}`}><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[.14em]">Kept outside</p><EyeOff size={16} /></div><p className="mt-2 text-3xl font-semibold tracking-[-.05em]">{result.summary.outside_criteria}</p><p className={`mt-1 text-xs ${activePartition === "outside" ? "text-sky-900/65" : "text-white/45"}`}>Protected from the packet</p></button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-white/40">Request criteria</p>
          <p className="mt-2 text-sm font-semibold">{result.criteria.employee_name} · from {result.criteria.start_date}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{result.criteria.record_types.map((type) => <Badge className="bg-white/10 text-white" key={type}>{recordLabels[type]}</Badge>)}</div>
        </div>

        {activePartition === "strong" && <div className="space-y-2">
          <div className="flex justify-end"><button type="button" disabled={allStrongApproved} className={`rounded-full px-3 py-1.5 text-[10px] font-semibold ${allStrongApproved ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 text-white/75 hover:bg-white/15"}`} onClick={approveSuggested}>{allStrongApproved ? "All suggested approved" : `Approve ${result.strong_matches.length} suggested`}</button></div>
          {result.strong_matches.map((record) => <article className={`rounded-2xl border p-4 text-black transition ${decisions[record.record_id] === "approved" ? "border-emerald-300 bg-emerald-50 shadow-[inset_4px_0_0_#22c55e]" : decisions[record.record_id] === "excluded" ? "border-zinc-300 bg-zinc-100 opacity-80" : "border-transparent bg-white"}`} key={record.record_id}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{recordLabels[record.record_type]}</p><p className="mt-1 text-xs text-zinc-500">{dateRange(record)} · {record.source}</p></div><Badge>{record.match_strength.toUpperCase()}</Badge></div>
            <p className="mt-3 text-xs leading-5 text-zinc-500">{record.match_reason}</p>
            <CandidateDecision decision={decisions[record.record_id]} onDecision={(decision) => decide(record.record_id, decision)} />
          </article>)}
        </div>}
        {activePartition === "possible" && <div className="space-y-2">
          {result.possible_matches.map((record) => <article className={`rounded-2xl border p-4 text-black transition ${decisions[record.record_id] === "approved" ? "border-emerald-300 bg-emerald-50 shadow-[inset_4px_0_0_#22c55e]" : decisions[record.record_id] === "excluded" ? "border-zinc-300 bg-zinc-100 opacity-80" : decisions[record.record_id] === "counsel" ? "border-zinc-300 bg-zinc-100 shadow-[inset_4px_0_0_#737373]" : "border-zinc-200 bg-white"}`} key={record.record_id}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{recordLabels[record.record_type]}</p><p className="mt-1 text-xs text-zinc-500">{dateRange(record)} · {record.source}</p></div><Badge variant="warning">REVIEW</Badge></div>
            <p className="mt-3 text-xs leading-5 text-zinc-500">{record.match_reason}</p>
            <CandidateDecision possible decision={decisions[record.record_id]} onDecision={(decision) => decide(record.record_id, decision)} />
          </article>)}
        </div>}
        {activePartition === "outside" && <div className="rounded-2xl border border-sky-200/20 bg-sky-100/10 p-4"><div className="flex items-start gap-3"><EyeOff className="mt-0.5 shrink-0 text-sky-200" size={18} /><div><p className="text-sm font-semibold">{result.summary.outside_criteria} payroll records stayed outside</p><p className="mt-1 text-xs leading-5 text-white/50">Their details are not copied into this candidate workspace because they fall outside the named employee, requested record types, or displayed date range.</p></div></div></div>}

        <div className="flex items-start gap-2 rounded-2xl border border-brand-green/30 bg-brand-green/10 p-4 text-xs leading-5 text-white/70"><ShieldCheck className="mt-0.5 shrink-0 text-brand-green" size={15} /><p><strong className="text-white">Human review required.</strong> {result.manifest_note} {result.privacy_note}</p></div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.04] p-4">
          <div><p className="text-sm font-semibold">{reviewedCount} of {candidates.length} candidates reviewed</p><p className="mt-1 text-[10px] text-white/45">Export only after each candidate has an owner decision.</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={() => { setResult(null); setFile(null); setPacketReady(false) }}>Choose another file</Button><Button className="bg-white text-black hover:bg-white/90" disabled={!reviewComplete} onClick={exportManifest}><Download size={16} /> {packetReady ? "Download review list again" : "Download review list"}</Button></div>
        </div>
        {packetReady && <div className="flex items-start gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-xs leading-5 text-emerald-100"><CheckCircle2 className="mt-0.5 shrink-0" size={16} /><p><strong>Review list prepared.</strong> {approvedCount} approved, {ownerKeptOutCount} kept out, and {counselCount} marked for counsel. The locked criteria and matching reasons are included. Nothing was sent.</p></div>}
      </div>}
    </div>
  </section>
}
