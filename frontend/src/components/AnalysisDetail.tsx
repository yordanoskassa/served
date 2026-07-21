import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Braces,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  FileCheck2,
  FileText,
  Hash,
  ListChecks,
  Scale,
  Search,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react"
import { useCallback, useState } from "react"

import { BankEvidenceCard } from "@/components/BankEvidenceCard"
import { BrandMark } from "@/components/BrandMark"
import { CaseWorkflow, type EvidenceWorkflowState } from "@/components/CaseWorkflow"
import { EmailEvidenceBrief } from "@/components/EmailEvidenceBrief"
import { GuidedClerkCall } from "@/components/GuidedClerkCall"
import { isPayrollRecordRequest, PayrollRecordsCard } from "@/components/PayrollRecordsCard"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Analysis, TraceEvent } from "@/lib/api"

type CaseReviewDecision = "possible_match" | "different_case" | "attorney_review"

const verdictCopy = {
  scam: { label: "SCAM", variant: "destructive" as const },
  verified: { label: "VERIFIED", variant: "default" as const },
  cannot_confirm: { label: "CANNOT_CONFIRM", variant: "warning" as const },
  scam_indicators: { label: "SCAM", variant: "destructive" as const },
}

function decisionExplanation(analysis: Analysis): string | null {
  if (!analysis.decision) return null
  if (analysis.decision.rule === "two_or_more_scam_signals") {
    return `${analysis.decision.counted_signal_ids.length} unique, cited scam patterns met the SCAM rule.`
  }
  if (analysis.decision.rule === "case_and_parties_match") {
    return "A matching public federal docket record was found and the extracted caption parties matched."
  }
  return "Fewer than two scam signals were validated, and a case-plus-party match was not established."
}

function savedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Saved analysis"
  return `Saved ${date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
}

function isPaymentRecordRequest(analysis: Analysis): boolean {
  const text = [analysis.document_type, analysis.summary, ...(analysis.breakdown?.requested_actions ?? [])]
    .join(" ")
    .toLowerCase()
  return /\b(?:bank records?|bank transactions?|transactions?)\b/.test(text)
    || /\bpayments?(?:\s+and\s+bank)?\s+records?\b/.test(text)
}

function completedTrace(analysis: Analysis, keys: TraceEvent["key"][]): TraceEvent | undefined {
  return [...(analysis.trace?.steps ?? [])]
    .reverse()
    .find((event) => keys.includes(event.key) && event.status !== "started")
}

function traceText(event: TraceEvent | undefined, fallback: string): string {
  return event?.output_summary || event?.detail || fallback
}

function possibleCaseNumber(detail: string): string | null {
  return detail.match(/\b\d+:\d{2}-cv-\d+(?:-[A-Z]+(?:-[A-Z]+)?)?/i)?.[0] ?? null
}

export function AnalysisDetail({
  analysis,
  documentName,
  createdAt,
  backLabel = "Check another request",
  onBack,
  savedAnalysisId,
}: {
  analysis: Analysis
  documentName?: string
  createdAt?: string | null
  backLabel?: string
  onBack: () => void
  savedAnalysisId?: string
}) {
  const [resultTab, setResultTab] = useState("overview")
  const [humanTab, setHumanTab] = useState("brief")
  const [caseReviewDecision, setCaseReviewDecision] = useState<CaseReviewDecision | null>(null)
  const [evidenceWorkflow, setEvidenceWorkflow] = useState<EvidenceWorkflowState>({
    sourceReady: false,
    candidatesReady: false,
    reviewed: 0,
    total: 0,
    packetReady: false,
  })
  const updateEvidenceWorkflow = useCallback((next: EvidenceWorkflowState) => {
    setEvidenceWorkflow((current) => (
      current.sourceReady === next.sourceReady
      && current.candidatesReady === next.candidatesReady
      && current.reviewed === next.reviewed
      && current.total === next.total
      && current.packetReady === next.packetReady
      && current.sourceLabel === next.sourceLabel
    ) ? current : next)
  }, [])

  const verdict = verdictCopy[analysis.verdict]
  const decision = decisionExplanation(analysis)
  const breakdown = analysis.breakdown ?? {
    court: null,
    claimed_authority: null,
    court_directory_status: null,
    court_route: "none" as const,
    case_number: null,
    parties: [],
    document_date: null,
    deadline: analysis.deadline,
    requested_actions: [],
  }
  const courtStatus = breakdown.court_directory_status === "OFFICIAL_COURT"
    ? "Exact official-court match"
    : breakdown.court_directory_status === "NAME_MISMATCH"
      ? "Name needs review"
      : breakdown.court_directory_status === "UNKNOWN_AUTHORITY"
        ? "Not covered by the limited court seed"
        : null
  const courtRoute = breakdown.court_route === "federal_appellate"
    ? "Federal appellate lookup"
    : breakdown.court_route === "federal"
      ? "Federal docket lookup"
      : breakdown.court_route === "state"
        ? "State court, manual verification"
        : null
  const paymentRequest = isPaymentRecordRequest(analysis)
  const payrollRequest = isPayrollRecordRequest(analysis)
  const hasEvidenceWorkflow = paymentRequest || payrollRequest
  const recordsLabel = paymentRequest ? "Bank payments" : payrollRequest ? "Payroll extraction" : "Next steps"
  const possibleCase = analysis.verdict === "cannot_confirm"
    ? analysis.evidence.find((item) => item.id.startsWith("docket:near") || item.label.toLowerCase().includes("possible case-number"))
    : undefined
  const candidateCaseNumber = possibleCase ? possibleCaseNumber(possibleCase.detail) : null
  const detailItems = [
    { label: "Court or issuer", value: breakdown.court || breakdown.claimed_authority, icon: Building2 },
    { label: "Court directory", value: courtStatus, icon: Building2 },
    { label: "Verification route", value: courtRoute, icon: ListChecks },
    { label: "Case or reference", value: breakdown.case_number, icon: Hash },
    { label: "Document date", value: breakdown.document_date, icon: CalendarDays },
    { label: "Deadline shown", value: breakdown.deadline, icon: CalendarDays },
  ].filter((item) => item.value)

  const traceCards = [
    {
      owner: "READER",
      title: "Extracted only visible request facts",
      detail: traceText(completedTrace(analysis, ["reader", "court_directory"]), "Read the document type, authority, case number, parties, dates, and requested records."),
      icon: FileCheck2,
      tone: "border-sky-200 bg-sky-50 text-sky-950",
      iconTone: "bg-sky-500 text-white",
    },
    {
      owner: "CHECKER",
      title: "Investigated independent evidence",
      detail: traceText(completedTrace(analysis, ["checker", "courtlistener", "scam_patterns"]), "Checked the public docket route and approved warning-signal sources without choosing the verdict."),
      icon: Search,
      tone: "border-zinc-200 bg-zinc-50 text-zinc-950",
      iconTone: "bg-zinc-600 text-white",
    },
    {
      owner: "FIXED CODE",
      title: "Applied the deterministic verdict rule",
      detail: decision || "Ordinary code compared the supported facts and selected the result state.",
      icon: Braces,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-950",
      iconTone: "bg-emerald-600 text-white",
    },
    {
      owner: "EXPLAINER",
      title: "Explained the locked outcome",
      detail: traceText(completedTrace(analysis, ["explainer", "legal_passages"]), "Used the fixed result, accepted evidence, approved passages, and limitations without changing the verdict."),
      icon: Bot,
      tone: "border-violet-200 bg-violet-50 text-violet-950",
      iconTone: "bg-violet-600 text-white",
    },
  ]

  return <Card className="overflow-hidden">
    <div className="border-b border-black/[.07] bg-white/75 px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => window.location.assign("/")} className="group inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-sm font-semibold transition hover:border-black/20 hover:bg-black hover:text-white">
          <BrandMark className="size-6 transition group-hover:brightness-0 group-hover:invert" />
          Go home
        </button>
        <div className="min-w-0 text-right">
          {documentName && <p className="max-w-[min(60vw,32rem)] truncate text-xs font-semibold">{documentName}</p>}
          {createdAt && <p className="mt-0.5 text-[10px] text-zinc-400">{savedAt(createdAt)}</p>}
        </div>
      </div>
    </div>

    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant={verdict.variant}>{verdict.label}</Badge>
          <p className="type-label mt-3">{analysis.document_type}</p>
          <h2 className="type-ui-heading mt-1.5">Here is what the evidence supports.</h2>
          <p className="type-body mt-2 max-w-3xl">{analysis.summary}</p>
        </div>
        <div className="rounded-2xl border border-black/[.07] bg-muted px-4 py-3 text-right">
          <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-zinc-400">Code-decided outcome</p>
          <p className="mt-1 text-sm font-semibold">{verdict.label}</p>
          <p className="mt-0.5 text-[10px] capitalize text-zinc-500">{analysis.confidence} confidence</p>
        </div>
      </div>

      <Tabs value={resultTab} onValueChange={setResultTab} className="mt-6">
        <TabsList aria-label="Result sections" className="grid h-auto w-full grid-cols-2 rounded-2xl bg-black/[.05] p-1 sm:grid-cols-5 sm:rounded-full">
          <TabsTrigger className="rounded-full px-3 py-2.5 text-xs data-[state=active]:bg-white" value="overview">Overview</TabsTrigger>
          <TabsTrigger className="rounded-full px-3 py-2.5 text-xs data-[state=active]:bg-white" value="evidence">Evidence</TabsTrigger>
          <TabsTrigger className="rounded-full px-3 py-2.5 text-xs data-[state=active]:bg-white" value="trace">Decision trace</TabsTrigger>
          <TabsTrigger className="rounded-full px-3 py-2.5 text-xs data-[state=active]:bg-white" value="human">Human review</TabsTrigger>
          <TabsTrigger className="col-span-2 rounded-full px-3 py-2.5 text-xs data-[state=active]:bg-black data-[state=active]:text-white sm:col-span-1" value="records">{recordsLabel}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5 space-y-5">
          {detailItems.length > 0 && <section><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-500">What the request names</p><div className="mt-3 grid items-start gap-2 sm:grid-cols-2 xl:grid-cols-3">{detailItems.map(({ label, value, icon: Icon }) => <div className="h-fit rounded-xl border border-black/5 bg-white/80 p-3" key={label}><div className="flex items-center gap-2 text-zinc-500"><Icon size={13} /><span className="text-[11px]">{label}</span></div><p className="mt-1.5 break-words text-sm font-medium">{value}</p></div>)}</div></section>}
          {(breakdown.parties.length > 0 || breakdown.requested_actions.length > 0) && <div className={`grid items-start gap-3 ${breakdown.parties.length > 0 && breakdown.requested_actions.length > 0 ? "lg:grid-cols-2" : ""}`}>
            {breakdown.parties.length > 0 && <section className="rounded-xl border border-black/5 bg-white/80 p-4"><div className="flex items-center gap-2"><Users size={14} /><p className="text-sm font-semibold">People and organizations named</p></div><div className="mt-3 flex flex-wrap gap-2">{breakdown.parties.map((party) => <Badge variant="secondary" key={party}>{party}</Badge>)}</div></section>}
            {breakdown.requested_actions.length > 0 && <section className="rounded-xl border border-black/5 bg-white/80 p-4"><div className="flex items-center gap-2"><ListChecks size={14} /><p className="text-sm font-semibold">Records requested</p></div><ul className="mt-3 space-y-2">{breakdown.requested_actions.map((action, index) => <li className="flex gap-2 text-sm leading-5 text-zinc-600" key={`${action}-${index}`}><span aria-hidden="true">•</span><span>{action}</span></li>)}</ul></section>}
          </div>}
          {!detailItems.length && !breakdown.parties.length && !breakdown.requested_actions.length && <p className="py-6 text-center text-sm text-zinc-400">No additional details were extracted.</p>}
          {possibleCase && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex max-w-2xl items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500 text-white"><CircleHelp size={18} /></span>
                <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-amber-800">Possible public case match</p><h3 className="mt-1 text-base font-semibold text-amber-950">The exact case number did not match, but a nearby docket may involve the same parties.</h3><p className="mt-1 text-sm leading-6 text-amber-950/70">Compare the letter with the public candidate in Human Review. This does not change the CANNOT_CONFIRM verdict.</p></div>
              </div>
              <Button className="bg-amber-950 text-white hover:bg-amber-900" onClick={() => setResultTab("human")}>Compare cases <ArrowRight size={15} /></Button>
            </div>
          </section>}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#171717] p-4 text-white sm:p-5">
            <div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brand-green">Next workspace</p><p className="mt-1 text-sm font-semibold">{analysis.verdict === "verified" && hasEvidenceWorkflow ? `Continue to ${recordsLabel.toLowerCase()}` : "Review the safest next step"}</p><p className="mt-1 max-w-xl text-xs leading-5 text-white/55">{analysis.next_step}</p></div>
            <Button className="bg-white text-black hover:bg-white/90" onClick={() => setResultTab(analysis.verdict === "verified" && hasEvidenceWorkflow ? "records" : "human")}>
              {analysis.verdict === "verified" && hasEvidenceWorkflow ? <WalletCards size={16} /> : <ShieldCheck size={16} />}
              {analysis.verdict === "verified" && hasEvidenceWorkflow ? `Open ${recordsLabel.toLowerCase()}` : "Open human review"}
              <ArrowRight size={15} />
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="evidence" className="mt-5 space-y-4">
          <section><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-400">{possibleCase ? "Evidence and case candidate" : "Accepted evidence"}</p>{analysis.evidence.length ? <div className="mt-3 grid gap-3 lg:grid-cols-2">{analysis.evidence.map((item, index) => {
            const isCandidate = item === possibleCase
            return <article className={`rounded-2xl border p-4 ${isCandidate ? "border-amber-200 bg-amber-50/60" : "border-black/[.07] bg-white"}`} key={`${item.label}-${index}`}><div className="flex items-start gap-3"><span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${isCandidate ? "bg-amber-500 text-white" : "bg-emerald-50 text-emerald-700"}`}>{isCandidate ? <CircleHelp size={15} /> : <CheckCircle2 size={15} />}</span><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{item.label}</p>{isCandidate && <Badge variant="warning">HUMAN REVIEW</Badge>}</div><p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p>{item.quote && <blockquote className="type-quote mt-3 rounded-lg border-l-2 border-border bg-muted px-3 py-2">“{item.quote}”</blockquote>}{item.source_url ? <a className="mt-2 inline-flex text-[10px] uppercase tracking-wider text-zinc-500 underline decoration-black/20 underline-offset-4" href={item.source_url} target="_blank" rel="noreferrer">{item.source}</a> : <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-400">Source: {item.source}</p>}</div></div></article>
          })}</div> : <p className="py-6 text-center text-sm text-zinc-400">No evidence items were returned for this analysis.</p>}</section>
          {(analysis.limitations?.length ?? 0) > 0 && <Alert className="rounded-2xl border-border bg-muted text-foreground"><AlertTriangle size={15} /><AlertTitle>What this result does not prove</AlertTitle><AlertDescription><ul className="space-y-1">{analysis.limitations.map((limitation) => <li className="leading-6 text-muted-foreground" key={limitation}>{limitation}</li>)}</ul></AlertDescription></Alert>}
        </TabsContent>

        <TabsContent value="trace" className="mt-5 space-y-3">
          <div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-400">Three bounded agents, one code checkpoint</p><h3 className="type-ui-heading mt-1">Agents report facts. Fixed policy chooses the state.</h3></div>
          <div className="grid gap-3 lg:grid-cols-2">{traceCards.map(({ owner, title, detail, icon: Icon, tone, iconTone }) => <article className={`rounded-2xl border p-4 ${tone}`} key={owner}><div className="flex items-start gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${iconTone}`}><Icon size={17} /></span><div><p className="text-[9px] font-bold uppercase tracking-[.16em] opacity-60">{owner}</p><p className="mt-1 text-sm font-semibold">{title}</p><p className="mt-2 text-xs leading-5 opacity-70">{detail}</p></div></div></article>)}</div>
          {analysis.guard && <div className="rounded-2xl border border-black/[.07] bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-400">Grounding guard</p><Badge variant={analysis.guard.accepted ? "default" : "warning"}>{analysis.guard.accepted ? "PASSED" : "REVIEW"}</Badge></div><p className="mt-3 text-sm text-zinc-600">{analysis.guard.accepted_pattern_ids.length} pattern quote{analysis.guard.accepted_pattern_ids.length === 1 ? "" : "s"} accepted · {analysis.guard.rejected_pattern_ids.length} rejected · {analysis.guard.accepted_passage_ids.length} legal passage{analysis.guard.accepted_passage_ids.length === 1 ? "" : "s"} grounded</p></div>}
        </TabsContent>

        <TabsContent value="human" className="mt-5">
          <div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-400">Human verification</p><h3 className="type-ui-heading mt-1">{possibleCase ? "Compare the letter with the possible public case." : "The evidence is organized. A person still decides what happens next."}</h3></div>
          {possibleCase && <section className="mt-4 overflow-hidden rounded-2xl border border-amber-200 bg-white">
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-amber-800">Case comparison required</p><h4 className="mt-1 text-base font-semibold text-amber-950">Same matter or nearby case?</h4></div>
                <Badge variant="warning">VERDICT UNCHANGED</Badge>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-950/70">Served found a supported public docket candidate, but the number on the letter did not match exactly. Review the difference before contacting the court or sharing records.</p>
            </div>
            <div className="grid gap-px bg-black/[.07] sm:grid-cols-2">
              <div className="bg-white p-4 sm:p-5"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-zinc-400">On the letter</p><p className="mt-2 font-mono text-base font-semibold">{breakdown.case_number || "Case number not readable"}</p><p className="mt-2 text-xs leading-5 text-zinc-500">Extracted from the uploaded document. It has not been verified against an exact public docket.</p></div>
              <div className="bg-amber-50/40 p-4 sm:p-5"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-amber-700">Public docket candidate</p><p className="mt-2 font-mono text-base font-semibold text-amber-950">{candidateCaseNumber || "Possible nearby case"}</p><p className="mt-2 text-xs leading-5 text-zinc-600">{possibleCase.detail}</p>{possibleCase.source_url && <a className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 underline decoration-amber-900/30 underline-offset-4" href={possibleCase.source_url} target="_blank" rel="noreferrer">Open public docket <ExternalLink size={13} /></a>}</div>
            </div>
            <div className="p-4 sm:p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-zinc-400">Record your review</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button aria-pressed={caseReviewDecision === "possible_match"} variant={caseReviewDecision === "possible_match" ? "default" : "outline"} onClick={() => setCaseReviewDecision("possible_match")}><CheckCircle2 size={15} />{caseReviewDecision === "possible_match" ? "Marked as possible" : "Mark as possible match"}</Button>
                <Button aria-pressed={caseReviewDecision === "different_case"} variant={caseReviewDecision === "different_case" ? "default" : "outline"} onClick={() => setCaseReviewDecision("different_case")}><AlertTriangle size={15} />{caseReviewDecision === "different_case" ? "Marked as different" : "Not the same case"}</Button>
                <Button aria-pressed={caseReviewDecision === "attorney_review"} variant={caseReviewDecision === "attorney_review" ? "default" : "outline"} onClick={() => { setCaseReviewDecision("attorney_review"); setHumanTab("attorney") }}><Scale size={15} />{caseReviewDecision === "attorney_review" ? "Attorney review selected" : "Send to attorney review"}</Button>
              </div>
              {caseReviewDecision && <p className="mt-3 text-xs leading-5 text-zinc-500">Review choice saved for this screen. The code-decided result remains CANNOT_CONFIRM.</p>}
            </div>
          </section>}
          <Tabs value={humanTab} onValueChange={setHumanTab} className="mt-4">
            <TabsList className="grid h-auto w-full grid-cols-3 rounded-2xl bg-black/[.05] p-1">
              <TabsTrigger className="rounded-xl py-2 text-xs data-[state=active]:bg-white" value="brief">Evidence brief</TabsTrigger>
              <TabsTrigger className="rounded-xl py-2 text-xs data-[state=active]:bg-white" value="clerk">Guided clerk call</TabsTrigger>
              <TabsTrigger className="rounded-xl py-2 text-xs data-[state=active]:bg-white" value="attorney">Attorney handoff</TabsTrigger>
            </TabsList>
            <TabsContent value="brief" className="mt-4">
              <section className="grid gap-4 rounded-2xl border border-black/[.07] bg-white p-4 sm:p-5 lg:grid-cols-[1fr_18rem]">
                <div><div className="flex items-center gap-2"><FileText size={17} /><p className="text-sm font-semibold">Owner-controlled evidence brief</p></div><h4 className="type-subsection mt-3">Take the facts, source links, and limits with you.</h4><p className="type-body mt-2">The brief keeps the visible request, public-record evidence, code decision, and unresolved limits in separate sections.</p>{savedAnalysisId && <div className="mt-4"><EmailEvidenceBrief analysisId={savedAnalysisId} documentName={documentName} compact /></div>}</div>
                <aside className="rounded-xl bg-muted p-4"><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-zinc-400">Brief contents</p><ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-600"><li>Document facts and displayed dates</li><li>Docket evidence and source links</li><li>Party cross-check and fixed verdict</li><li>Verification limits</li><li>Reviewed official clerk route</li><li>Candidate-record summary</li></ul></aside>
              </section>
            </TabsContent>
            <TabsContent value="clerk" className="mt-0"><GuidedClerkCall analysis={analysis} /></TabsContent>
            <TabsContent value="attorney" className="mt-4">
              <section className="grid gap-4 rounded-2xl border border-black/[.07] bg-white p-4 sm:p-5 lg:grid-cols-[1fr_18rem]">
                <div><div className="flex items-center gap-2"><Scale size={17} /><p className="text-sm font-semibold">Attorney handoff</p></div><h4 className="type-subsection mt-3">Bring a scoped report, not a pile of files.</h4><p className="type-body mt-2">Send the owner-reviewed brief to counsel chosen independently. Served does not operate an attorney network or create an attorney-client relationship.</p>{savedAnalysisId && <div className="mt-4"><EmailEvidenceBrief analysisId={savedAnalysisId} documentName={documentName} compact /></div>}</div>
                <aside className="rounded-xl bg-[#171717] p-4 text-white"><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-brand-green">Human accountability</p><p className="mt-3 text-sm font-semibold">Agent prepares. Human decides.</p><p className="mt-2 text-xs leading-5 text-white/55">No legal responsiveness decision, waiver, filing, or automatic record delivery.</p></aside>
              </section>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent forceMount value="records" className="mt-5 data-[state=inactive]:hidden">
          <div className="rounded-2xl bg-muted p-4 text-sm"><strong>Safest next step</strong><p className="mt-1 text-muted-foreground">{analysis.next_step}</p></div>
          {analysis.verdict === "verified" && savedAnalysisId && hasEvidenceWorkflow && <CaseWorkflow analysis={analysis} analysisId={savedAnalysisId} documentName={documentName} workflow={evidenceWorkflow} />}
          {analysis.verdict === "verified" && paymentRequest
            ? savedAnalysisId
              ? <BankEvidenceCard analysisId={savedAnalysisId} cutoffDate={breakdown.document_date} onWorkflowChange={updateEvidenceWorkflow} />
              : <Alert className="mt-5 rounded-2xl border-border bg-muted text-muted-foreground"><AlertTitle>Financial tools remain locked</AlertTitle><AlertDescription>Save this verified request before connecting financial data.</AlertDescription></Alert>
            : <PayrollRecordsCard analysis={analysis} analysisId={savedAnalysisId} onWorkflowChange={updateEvidenceWorkflow} />}
          {analysis.verdict !== "verified" && paymentRequest && <Alert className="mt-5 rounded-2xl border-border bg-muted text-muted-foreground"><AlertTitle>Bank payments remain locked</AlertTitle><AlertDescription>The request must pass verification before any financial source can open.</AlertDescription></Alert>}
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-black/[.07] pt-5">
        <Button variant="outline" onClick={onBack}><ArrowLeft size={16} /> {backLabel}</Button>
        {savedAnalysisId && <EmailEvidenceBrief analysisId={savedAnalysisId} documentName={documentName} compact />}
      </div>
    </div>
  </Card>
}
