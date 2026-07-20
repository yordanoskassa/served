import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarDays,
  Hash,
  ListChecks,
  Users,
} from "lucide-react"
import { useCallback, useState } from "react"

import { BankEvidenceCard } from "@/components/BankEvidenceCard"
import { EmailEvidenceBrief } from "@/components/EmailEvidenceBrief"
import { CaseWorkflow, type EvidenceWorkflowState } from "@/components/CaseWorkflow"
import { isPayrollRecordRequest, PayrollRecordsCard } from "@/components/PayrollRecordsCard"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { GuidedClerkCall } from "@/components/GuidedClerkCall"
import type { Analysis } from "@/lib/api"

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
  const text = [
    analysis.document_type,
    analysis.summary,
    ...(analysis.breakdown?.requested_actions ?? []),
  ].join(" ").toLowerCase()
  return /\b(?:bank records?|bank transactions?|transactions?)\b/.test(text)
    || /\bpayments?(?:\s+and\s+bank)?\s+records?\b/.test(text)
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
        ? "State court · manual verification"
        : null
  const hasEvidenceWorkflow = isPaymentRecordRequest(analysis) || isPayrollRecordRequest(analysis)
  const detailItems = [
    { label: "Court or issuer", value: breakdown.court || breakdown.claimed_authority, icon: Building2 },
    { label: "Court directory", value: courtStatus, icon: Building2 },
    { label: "Verification route", value: courtRoute, icon: ListChecks },
    { label: "Case or reference", value: breakdown.case_number, icon: Hash },
    { label: "Document date", value: breakdown.document_date, icon: CalendarDays },
    { label: "Deadline shown", value: breakdown.deadline, icon: CalendarDays },
  ].filter((item) => item.value)

  return <Card className="overflow-hidden">
    <div className="p-5 sm:p-6">
      {(documentName || createdAt) && <div className="mb-4 border-b border-black/5 pb-4">
        {documentName && <p className="break-words text-sm font-semibold">{documentName}</p>}
        {createdAt && <p className="mt-1 text-xs text-zinc-400">{savedAt(createdAt)}</p>}
      </div>}
      <Badge variant={verdict.variant}>{verdict.label}</Badge>
      <p className="type-label mt-3">{analysis.document_type}</p>
      <h2 className="type-ui-heading mt-1.5">What this request says</h2>
      <p className="type-body mt-2">{analysis.summary}</p>

      <Tabs defaultValue="breakdown" className="mt-4">
        <TabsList className="grid h-auto w-full grid-cols-3 rounded-[22px] bg-black/5 p-1">
          <TabsTrigger className="rounded-full py-2 text-xs data-[state=active]:bg-white" value="breakdown">Breakdown</TabsTrigger>
          <TabsTrigger className="rounded-full py-2 text-xs data-[state=active]:bg-white" value="evidence">Evidence</TabsTrigger>
          <TabsTrigger className="rounded-full py-2 text-xs data-[state=active]:bg-white" value="checks">Checks</TabsTrigger>
        </TabsList>

        <TabsContent value="breakdown" className="mt-4 space-y-4">
          {detailItems.length > 0 && <section><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-500">Key details</p><div className="mt-3 grid items-start gap-2 sm:grid-cols-2 xl:grid-cols-3">{detailItems.map(({ label, value, icon: Icon }) => <div className="h-fit rounded-xl border border-black/5 bg-white/80 p-3" key={label}><div className="flex items-center gap-2 text-zinc-500"><Icon size={13} /><span className="text-[11px]">{label}</span></div><p className="mt-1.5 break-words text-sm font-medium">{value}</p></div>)}</div></section>}
          {(breakdown.parties.length > 0 || breakdown.requested_actions.length > 0) && <div className={`grid items-start gap-3 ${breakdown.parties.length > 0 && breakdown.requested_actions.length > 0 ? "lg:grid-cols-2" : ""}`}>
            {breakdown.parties.length > 0 && <section className="rounded-xl border border-black/5 bg-white/80 p-3"><div className="flex items-center gap-2"><Users size={14} /><p className="text-sm font-semibold">People and organizations named</p></div><div className="mt-2.5 flex flex-wrap gap-2">{breakdown.parties.map((party) => <Badge variant="secondary" key={party}>{party}</Badge>)}</div></section>}
            {breakdown.requested_actions.length > 0 && <section className="rounded-xl border border-black/5 bg-white/80 p-3"><div className="flex items-center gap-2"><ListChecks size={14} /><p className="text-sm font-semibold">Records and actions requested</p></div><ul className="mt-2.5 space-y-1.5">{breakdown.requested_actions.map((action, index) => <li className="flex gap-2 text-sm leading-5 text-zinc-600" key={`${action}-${index}`}><span aria-hidden="true">•</span><span>{action}</span></li>)}</ul></section>}
          </div>}
          {!detailItems.length && !breakdown.parties.length && !breakdown.requested_actions.length && <p className="py-6 text-center text-sm text-zinc-400">No additional details were extracted.</p>}
        </TabsContent>

        <TabsContent value="evidence" className="mt-4 space-y-4">
          <section><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-400">Evidence and warning signals</p>{analysis.evidence.length ? <div className="mt-3 space-y-4">{analysis.evidence.map((item, index) => <div className="border-l-2 border-brand-soft pl-3" key={`${item.label}-${index}`}><p className="text-sm font-semibold">{item.label}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p>{item.quote && <blockquote className="type-quote mt-3 rounded-lg border-l-2 border-border bg-muted px-3 py-2">“{item.quote}”</blockquote>}{item.source_url ? <a className="mt-2 inline-flex text-[10px] uppercase tracking-wider text-zinc-500 underline decoration-black/20 underline-offset-4" href={item.source_url} target="_blank" rel="noreferrer">{item.source}</a> : <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-400">Source: {item.source}</p>}</div>)}</div> : <p className="py-6 text-center text-sm text-zinc-400">No evidence items were returned for this analysis.</p>}</section>
          {(analysis.limitations?.length ?? 0) > 0 && <Alert className="rounded-2xl border-border bg-muted text-muted-foreground"><AlertTriangle size={15} /><AlertTitle>What could not be confirmed</AlertTitle><AlertDescription><ul className="space-y-1">{analysis.limitations.map((limitation) => <li className="leading-6 text-muted-foreground" key={limitation}>{limitation}</li>)}</ul></AlertDescription></Alert>}
        </TabsContent>

        <TabsContent value="checks" className="mt-4">
          {decision && <div className="mb-3 rounded-2xl border border-black/5 bg-white/80 p-4"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-400">Why code chose this result</p><p className="mt-2 text-sm leading-6 text-zinc-600">{decision}</p><p className="mt-2 text-[10px] text-zinc-400">Policy {analysis.decision?.policy_version}</p></div>}
          {analysis.guard && <div className="mb-3 rounded-2xl border border-black/5 bg-white/80 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-400">Grounding Guard</p><Badge variant={analysis.guard.accepted ? "default" : "warning"}>{analysis.guard.accepted ? "PASSED" : "REVIEW"}</Badge></div><p className="mt-3 text-sm text-zinc-600">{analysis.guard.accepted_pattern_ids.length} pattern quote{analysis.guard.accepted_pattern_ids.length === 1 ? "" : "s"} accepted · {analysis.guard.rejected_pattern_ids.length} rejected · {analysis.guard.accepted_passage_ids.length} legal passage{analysis.guard.accepted_passage_ids.length === 1 ? "" : "s"} verified</p>{analysis.guard.quarantined_claims.length > 0 && <p className="mt-2 text-xs leading-5 text-muted-foreground">{analysis.guard.quarantined_claims.length} unsupported claim{analysis.guard.quarantined_claims.length === 1 ? " was" : "s were"} quarantined from the result.</p>}</div>}
          {(analysis.checks?.length ?? 0) > 0 ? <div className="space-y-2">{analysis.checks.map((check) => <div className="flex items-center gap-3 rounded-xl bg-background px-3 py-2.5" key={check.key}><span className={`size-2 rounded-full ${check.status === "complete" ? "bg-brand-soft" : "bg-neutral-400"}`} /><p className="text-sm text-zinc-600">{check.label}</p></div>)}</div> : <p className="py-6 text-center text-sm text-zinc-400">No check trace was returned.</p>}
        </TabsContent>

      </Tabs>

      <GuidedClerkCall analysis={analysis} />
      <div className="mt-5 rounded-2xl bg-background p-4 text-sm"><strong>Safest next step</strong><p className="mt-1 text-muted-foreground">{analysis.next_step}</p></div>
      {analysis.verdict === "verified" && savedAnalysisId && hasEvidenceWorkflow && <CaseWorkflow analysis={analysis} analysisId={savedAnalysisId} documentName={documentName} workflow={evidenceWorkflow} />}
      {analysis.verdict === "verified" && isPaymentRecordRequest(analysis)
        ? savedAnalysisId
          ? <BankEvidenceCard analysisId={savedAnalysisId} cutoffDate={breakdown.document_date} onWorkflowChange={updateEvidenceWorkflow} />
          : <Alert className="mt-5 rounded-2xl border-border bg-muted text-muted-foreground"><AlertTitle>Financial tools remain locked</AlertTitle><AlertDescription>Save this verified request before connecting financial data.</AlertDescription></Alert>
        : <PayrollRecordsCard analysis={analysis} analysisId={savedAnalysisId} onWorkflowChange={updateEvidenceWorkflow} />}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="outline" onClick={onBack}><ArrowLeft size={16} /> {backLabel}</Button>
        {savedAnalysisId && <EmailEvidenceBrief analysisId={savedAnalysisId} documentName={documentName} compact />}
      </div>
    </div>
  </Card>
}
