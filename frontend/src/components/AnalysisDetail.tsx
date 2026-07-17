import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Hash,
  ListChecks,
  Users,
} from "lucide-react"

import { AnalysisPipeline } from "@/components/AnalysisPipeline"
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
    return "CourtListener found the case and the extracted caption parties matched."
  }
  return "Fewer than two scam signals were validated, and a case-plus-party match was not established."
}

function savedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Saved analysis"
  return `Saved ${date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
}

export function AnalysisDetail({
  analysis,
  documentName,
  createdAt,
  backLabel = "Check another letter",
  onBack,
  onViewPipeline,
}: {
  analysis: Analysis
  documentName?: string
  createdAt?: string | null
  backLabel?: string
  onBack: () => void
  onViewPipeline?: () => void
}) {
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
  const detailItems = [
    { label: "Court or issuer", value: breakdown.court || breakdown.claimed_authority, icon: Building2 },
    { label: "Court directory", value: courtStatus, icon: Building2 },
    { label: "Verification route", value: courtRoute, icon: ListChecks },
    { label: "Case or reference", value: breakdown.case_number, icon: Hash },
    { label: "Document date", value: breakdown.document_date, icon: CalendarDays },
    { label: "Deadline shown", value: breakdown.deadline, icon: CalendarDays },
  ].filter((item) => item.value)

  return <Card className="overflow-hidden p-2">
    <div className="rounded-[22px] bg-white/70 p-6 sm:p-8">
      {(documentName || createdAt) && <div className="mb-5 border-b border-black/5 pb-5">
        {documentName && <p className="break-words text-sm font-semibold">{documentName}</p>}
        {createdAt && <p className="mt-1 text-xs text-zinc-400">{savedAt(createdAt)}</p>}
      </div>}
      <Badge variant={verdict.variant}>{verdict.label}</Badge>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{analysis.document_type}</p>
      <h2 className="mt-2 font-display text-2xl font-medium tracking-[-.04em]">What this letter says</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{analysis.summary}</p>

      {analysis.trace && <AnalysisPipeline className="mt-6" events={analysis.trace.steps} runState="complete" compact />}

      <Tabs defaultValue="breakdown" className="mt-6">
        <TabsList className={`grid h-auto w-full rounded-[22px] bg-black/5 p-1 ${analysis.trace ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
          <TabsTrigger className="rounded-full py-2 text-xs data-[state=active]:bg-white" value="breakdown">Breakdown</TabsTrigger>
          <TabsTrigger className="rounded-full py-2 text-xs data-[state=active]:bg-white" value="evidence">Evidence</TabsTrigger>
          <TabsTrigger className="rounded-full py-2 text-xs data-[state=active]:bg-white" value="checks">Checks</TabsTrigger>
          {analysis.trace && <TabsTrigger className="rounded-full py-2 text-xs data-[state=active]:bg-white" value="run">Run trace</TabsTrigger>}
        </TabsList>

        <TabsContent value="breakdown" className="mt-4 space-y-4">
          {detailItems.length > 0 && <section><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-400">Key details</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{detailItems.map(({ label, value, icon: Icon }) => <div className="rounded-2xl border border-black/5 bg-white/80 p-4" key={label}><div className="flex items-center gap-2 text-zinc-400"><Icon size={14} /><span className="text-[11px]">{label}</span></div><p className="mt-2 break-words text-sm font-medium">{value}</p></div>)}</div></section>}
          {breakdown.parties.length > 0 && <section className="rounded-2xl border border-black/5 bg-white/80 p-4"><div className="flex items-center gap-2"><Users size={15} /><p className="text-sm font-semibold">People and organizations named</p></div><div className="mt-3 flex flex-wrap gap-2">{breakdown.parties.map((party) => <Badge variant="secondary" key={party}>{party}</Badge>)}</div></section>}
          {breakdown.requested_actions.length > 0 && <section className="rounded-2xl border border-black/5 bg-white/80 p-4"><div className="flex items-center gap-2"><ListChecks size={15} /><p className="text-sm font-semibold">What the letter asks you to do</p></div><ul className="mt-3 space-y-2">{breakdown.requested_actions.map((action, index) => <li className="flex gap-2 text-sm leading-6 text-zinc-600" key={`${action}-${index}`}><span aria-hidden="true">•</span><span>{action}</span></li>)}</ul></section>}
          {!detailItems.length && !breakdown.parties.length && !breakdown.requested_actions.length && <p className="py-6 text-center text-sm text-zinc-400">No additional details were extracted.</p>}
        </TabsContent>

        <TabsContent value="evidence" className="mt-4 space-y-4">
          <section><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-400">Evidence and warning signals</p>{analysis.evidence.length ? <div className="mt-3 space-y-4">{analysis.evidence.map((item, index) => <div className="border-l-2 border-brand-soft pl-3" key={`${item.label}-${index}`}><p className="text-sm font-semibold">{item.label}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p>{item.quote && <blockquote className="mt-3 rounded-xl bg-bg-base px-3 py-2 text-sm italic leading-6 text-zinc-600">“{item.quote}”</blockquote>}{item.source_url ? <a className="mt-2 inline-flex text-[10px] uppercase tracking-wider text-zinc-500 underline decoration-black/20 underline-offset-4" href={item.source_url} target="_blank" rel="noreferrer">{item.source}</a> : <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-400">Source: {item.source}</p>}</div>)}</div> : <p className="py-6 text-center text-sm text-zinc-400">No evidence items were returned for this analysis.</p>}</section>
          {(analysis.limitations?.length ?? 0) > 0 && <Alert className="rounded-2xl border-amber-200 bg-amber-50 text-amber-900"><AlertTriangle size={15} /><AlertTitle>What could not be confirmed</AlertTitle><AlertDescription><ul className="space-y-1">{analysis.limitations.map((limitation) => <li className="leading-6 text-amber-900/70" key={limitation}>{limitation}</li>)}</ul></AlertDescription></Alert>}
        </TabsContent>

        <TabsContent value="checks" className="mt-4">
          {decision && <div className="mb-3 rounded-2xl border border-black/5 bg-white/80 p-4"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-400">Why code chose this result</p><p className="mt-2 text-sm leading-6 text-zinc-600">{decision}</p><p className="mt-2 text-[10px] text-zinc-400">Policy {analysis.decision?.policy_version}</p></div>}
          {analysis.guard && <div className="mb-3 rounded-2xl border border-black/5 bg-white/80 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-400">Grounding Guard</p><Badge variant={analysis.guard.accepted ? "default" : "warning"}>{analysis.guard.accepted ? "PASSED" : "REVIEW"}</Badge></div><p className="mt-3 text-sm text-zinc-600">{analysis.guard.accepted_pattern_ids.length} pattern quote{analysis.guard.accepted_pattern_ids.length === 1 ? "" : "s"} accepted · {analysis.guard.rejected_pattern_ids.length} rejected · {analysis.guard.accepted_passage_ids.length} legal passage{analysis.guard.accepted_passage_ids.length === 1 ? "" : "s"} verified</p>{analysis.guard.quarantined_claims.length > 0 && <p className="mt-2 text-xs leading-5 text-amber-700">{analysis.guard.quarantined_claims.length} unsupported claim{analysis.guard.quarantined_claims.length === 1 ? " was" : "s were"} quarantined from the result.</p>}</div>}
          {(analysis.checks?.length ?? 0) > 0 ? <div className="space-y-2">{analysis.checks.map((check) => <div className="flex items-center gap-3 rounded-xl bg-bg-base px-3 py-2.5" key={check.key}><span className={`size-2 rounded-full ${check.status === "complete" ? "bg-brand-soft" : "bg-amber-400"}`} /><p className="text-sm text-zinc-600">{check.label}</p></div>)}</div> : <p className="py-6 text-center text-sm text-zinc-400">No check trace was returned.</p>}
        </TabsContent>

        {analysis.trace && <TabsContent value="run" className="mt-4 space-y-4">
          <section className="rounded-2xl border border-black/5 bg-white/80 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Activity size={15} /><p className="text-sm font-semibold">Saved orchestration trace</p></div><Badge variant="secondary">Run {analysis.trace.run_id.slice(0, 8)}</Badge></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div><p className="text-[10px] uppercase tracking-wider text-zinc-400">Model calls</p><p className="mt-1 text-sm font-semibold">{analysis.trace.metrics.model_calls}</p></div><div><p className="text-[10px] uppercase tracking-wider text-zinc-400">Tool calls</p><p className="mt-1 text-sm font-semibold">{analysis.trace.metrics.tool_calls}</p></div><div><p className="text-[10px] uppercase tracking-wider text-zinc-400">Evidence</p><p className="mt-1 text-sm font-semibold">{analysis.trace.metrics.evidence_items}</p></div><div><p className="text-[10px] uppercase tracking-wider text-zinc-400">Duration</p><p className="mt-1 text-sm font-semibold">{(analysis.trace.metrics.total_duration_ms / 1000).toFixed(1)}s</p></div></div><p className="mt-4 text-[10px] text-zinc-400">Policy {analysis.trace.policy_version} · Corpus {analysis.trace.corpus_version}</p></section>
          <ol className="space-y-2" aria-label="Saved analysis run steps">{analysis.trace.steps.map((step) => <li className="rounded-2xl bg-bg-base p-4" key={`${step.seq}-${step.key}`}><div className="flex items-start gap-3"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${step.status === "complete" ? "bg-brand-green" : step.status === "failed" ? "bg-red-500" : "bg-amber-400"}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{step.label}</p><span className="text-[10px] uppercase tracking-wider text-zinc-400">{step.status}{step.duration_ms != null ? ` · ${step.duration_ms}ms` : ""}</span></div>{(step.output_summary || step.detail) && <p className="mt-1 text-xs leading-5 text-zinc-500">{step.output_summary || step.detail}</p>}</div></div></li>)}</ol>
        </TabsContent>}
      </Tabs>

      <GuidedClerkCall analysis={analysis} />
      <div className="mt-5 rounded-2xl bg-bg-base p-4 text-sm"><strong>Safest next step</strong><p className="mt-1 text-muted-foreground">{analysis.next_step}</p></div>
      <div className="mt-5 flex flex-wrap gap-2"><Button variant="outline" onClick={onBack}><ArrowLeft size={16} /> {backLabel}</Button>{onViewPipeline && <Button onClick={onViewPipeline}>Open this run’s evidence pipeline <ArrowRight size={16} /></Button>}</div>
    </div>
  </Card>
}
