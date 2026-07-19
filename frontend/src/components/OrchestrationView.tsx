import {
  Activity,
  ArrowDown,
  Bot,
  Braces,
  Clock3,
  Database,
  FileCheck2,
  FileInput,
  GitBranch,
  Gavel,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react"

import { AnalysisPipeline } from "@/components/AnalysisPipeline"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { AgentStatus, Analysis, TraceEvent } from "@/lib/api"

type OrchestrationViewProps = {
  agents: AgentStatus[]
  loadState: "loading" | "ready" | "error"
  latestAnalysis?: Analysis | null
  analysisRunState?: "idle" | "running" | "complete" | "error"
  traceEvents?: TraceEvent[]
  runLabel?: string | null
  onRefresh?: () => void
}

type Readiness = {
  label: string
  detail: string
  dotClass: string
  badgeVariant: "default" | "warning" | "destructive" | "outline"
}

const AGENTS = [
  {
    name: "reader",
    number: "01",
    fallback: "Extracts only visible facts from the document. It does not investigate or decide.",
    icon: FileInput,
  },
  {
    name: "checker",
    number: "02",
    fallback: "Checks the extracted facts against the public federal docket and the approved scam-pattern corpus.",
    icon: Search,
  },
  {
    name: "explainer",
    number: "03",
    fallback: "Turns the code-decided result and its evidence into clear, plain language.",
    icon: Bot,
  },
] as const

function readinessFor(agent: AgentStatus | undefined, loadState: OrchestrationViewProps["loadState"]): Readiness {
  if (loadState === "loading") {
    return {
      label: "Checking",
      detail: "Reading system configuration",
      dotClass: "bg-zinc-300",
      badgeVariant: "outline",
    }
  }

  if (loadState === "error") {
    return {
      label: "Unknown",
      detail: "Readiness service unavailable",
      dotClass: "bg-orange-400",
      badgeVariant: "warning",
    }
  }

  if (!agent) {
    return {
      label: "Not reported",
      detail: "No status was returned for this agent",
      dotClass: "bg-orange-400",
      badgeVariant: "warning",
    }
  }

  if (!agent.enabled) {
    return {
      label: "Not configured",
      detail: "Required service configuration is missing",
      dotClass: "bg-orange-500",
      badgeVariant: "destructive",
    }
  }

  if (agent.last_error) {
    return {
      label: "Configured · issue seen",
      detail: "The latest attempt on this service instance reported an issue.",
      dotClass: "bg-amber-400",
      badgeVariant: "warning",
    }
  }

  return {
    label: "Configured",
    detail: "The required credentials and agent runner are configured. This is not a live provider check.",
    dotClass: "bg-brand-green",
    badgeVariant: "default",
  }
}

function formatLastCheck(value: string | null | undefined): string {
  if (!value) return "No response recorded on this service instance"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "A previous response was recorded on this service instance"
  return `Last response recorded ${date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
}

function traceStatus(value: string | undefined): { label: string; dotClass: string; badgeVariant: "default" | "warning" | "destructive" | "outline" } {
  const normalized = value?.toLowerCase().replaceAll("-", "_")
  if (normalized === "started") {
    return { label: "Running", dotClass: "bg-[#812d29] animate-pulse motion-reduce:animate-none", badgeVariant: "warning" }
  }
  if (["complete", "completed", "success", "passed", "ready"].includes(normalized || "")) {
    return { label: value || "Complete", dotClass: "bg-brand-green", badgeVariant: "default" }
  }
  if (["degraded", "skipped", "partial", "cannot_confirm"].includes(normalized || "")) {
    return { label: value || "Limited", dotClass: "bg-amber-400", badgeVariant: "warning" }
  }
  if (["error", "failed", "unavailable", "disabled"].includes(normalized || "")) {
    return { label: value || "Unavailable", dotClass: "bg-orange-500", badgeVariant: "destructive" }
  }
  return { label: value || "Not reported", dotClass: "bg-zinc-300", badgeVariant: "outline" }
}

function displayStatus(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function verdictLabel(verdict: Analysis["verdict"]): string {
  if (verdict === "scam" || verdict === "scam_indicators") return "SCAM"
  return verdict.toUpperCase()
}

function verdictVariant(verdict: Analysis["verdict"]): "default" | "warning" | "destructive" {
  if (verdict === "verified") return "default"
  if (verdict === "scam" || verdict === "scam_indicators") return "destructive"
  return "warning"
}

function ruleLabel(rule: NonNullable<Analysis["decision"]>["rule"]): string {
  if (rule === "two_or_more_scam_signals") return "Two or more countable scam signals"
  if (rule === "case_and_parties_match") return "Case found and parties matched"
  return "Fallback: evidence could not confirm either outcome"
}

function formatDuration(duration: number | null | undefined): string {
  if (duration == null) return "—"
  if (duration < 1000) return `${duration} ms`
  return `${(duration / 1000).toFixed(duration < 10_000 ? 1 : 0)} s`
}

function DetailedRunTrace({ events, analysis, terminal = false }: { events: TraceEvent[]; analysis?: Analysis | null; terminal?: boolean }) {
  const latest = new Map<TraceEvent["key"], TraceEvent>()
  for (const event of events) latest.set(event.key, event)
  const metrics = analysis?.trace?.metrics
  const newestEvent = events.at(-1)
  const usage = analysis?.trace?.model_usage ?? []
  const completeTokenTotal = metrics
    && usage.length === metrics.model_calls
    && usage.every((item) => item.total_tokens != null)
    ? usage.reduce((total, item) => total + (item.total_tokens ?? 0), 0)
    : null
  const completedAgents = ["reader", "checker", "explainer"].filter((key) => {
    const status = latest.get(key as TraceEvent["key"])?.status
    return status && status !== "started"
  }).length
  const attemptedTools = new Set(
    events.filter((event) => event.kind === "tool").map((event) => event.key),
  ).size

  function RunNode({
    eventKey,
    title,
    icon: Icon,
    dark = false,
  }: {
    eventKey: TraceEvent["key"]
    title: string
    icon: typeof Activity
    dark?: boolean
  }) {
    const event = latest.get(eventKey)
    const status = traceStatus(event?.status)
    return (
      <div className={`h-fit rounded-2xl border p-3.5 ${dark ? "border-[#812d29] bg-[#1a1a1a] text-white" : "border-black/[.07] bg-white/65"}`}>
        <div className="flex items-center justify-between gap-3">
          <span className={`grid size-8 place-items-center rounded-full ${dark ? "bg-[#812d29] text-brand-green" : "bg-[#812d29]/10 text-[#812d29]"}`}>
            <Icon size={15} aria-hidden="true" />
          </span>
          <div className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${status.dotClass}`} aria-hidden="true" />
            <Badge variant={dark ? "outline" : status.badgeVariant} className={dark ? "border-white/15 bg-white/[.06] text-white/70" : undefined}>
              {displayStatus(status.label)}
            </Badge>
          </div>
        </div>
        <p className="mt-3 text-sm font-semibold">{title}</p>
        <p className={`mt-1 text-xs leading-5 ${dark ? "text-white/70" : "text-zinc-500"}`}>
          {event?.output_summary || event?.detail || (event?.status === "started" ? "This step is running." : event ? "No additional detail was reported." : terminal ? "No backend event was returned for this step." : "Waiting for the backend event.")}
        </p>
        <div className={`mt-3 flex items-center justify-between text-[10px] ${dark ? "text-white/55" : "text-zinc-400"}`}>
          <span>{event?.kind ? displayStatus(event.kind) : "Not started"}</span>
          <span>{formatDuration(event?.duration_ms)}</span>
        </div>
        {event?.decision && (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[.06] p-3 text-[11px] leading-5 text-white/70">
            <p className="font-medium text-white">{ruleLabel(event.decision.rule)}</p>
            <p>{event.decision.counted_signal_ids.length} countable signal(s) · case {event.decision.case_found ? "found" : "not found"} · parties {event.decision.parties_match ? "matched" : "not matched"}</p>
          </div>
        )}
      </div>
    )
  }

  const courtEvent = latest.get("courtlistener")
  const patternEvent = latest.get("scam_patterns")
  const checkerEvent = latest.get("checker")
  const checkerSettled = Boolean(checkerEvent && checkerEvent.status !== "started")
  const checkerSkipped = checkerEvent?.status === "skipped"
  const missingBranchStatus: TraceEvent["status"] | undefined = checkerSkipped
    ? "skipped"
    : checkerSettled
      ? "unavailable"
      : undefined
  const courtStatus = traceStatus(courtEvent?.status ?? missingBranchStatus)
  const patternStatus = traceStatus(patternEvent?.status ?? missingBranchStatus)
  const fanOutLabel = checkerSkipped
    ? "evidence paths skipped"
    : courtEvent && patternEvent
      ? "fan out concurrently"
      : checkerSettled
        ? "evidence path trace incomplete"
        : "prepare concurrent evidence paths"
  const missingBranchCopy = (waitingCopy: string) => checkerSkipped
    ? "Not run because READER could not provide readable facts."
    : checkerSettled
      ? "No backend tool event was returned for this completed CHECKER run."
      : waitingCopy
  const courtEvidence = analysis?.evidence.filter((item) => item.tool_key === "courtlistener") ?? []
  const patternEvidence = analysis?.evidence.filter((item) => item.tool_key === "scam_patterns") ?? []
  const signalReviews = analysis?.trace?.signal_reviews ?? []

  return (
    <div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {newestEvent ? `${newestEvent.label}: ${displayStatus(newestEvent.status)}` : "Waiting for analysis events"}
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge variant="outline">{completedAgents} / 3 agents settled</Badge>
        <Badge variant="outline">{metrics ? `${metrics.tool_calls} tool invocation${metrics.tool_calls === 1 ? "" : "s"}` : `${attemptedTools} tool branch${attemptedTools === 1 ? "" : "es"} seen`}</Badge>
        <Badge variant="outline">{metrics ? `Analysis ${formatDuration(metrics.total_duration_ms)}` : "Run in progress"}</Badge>
        {completeTokenTotal != null && <Badge variant="outline">{completeTokenTotal.toLocaleString()} reported tokens</Badge>}
        {analysis?.trace?.run_id && <Badge variant="secondary">Run {analysis.trace.run_id.slice(0, 8)}</Badge>}
      </div>

      <div className="grid items-start gap-3 md:grid-cols-3">
        <RunNode eventKey="intake" title="Authenticated document intake" icon={FileInput} />
        <RunNode eventKey="reader" title="READER · visible facts" icon={FileCheck2} />
        <RunNode eventKey="court_directory" title="Court directory · exact route" icon={Gavel} />
      </div>

      <div className="my-3 flex items-center gap-3 px-4" aria-hidden="true">
        <div className="h-px flex-1 bg-black/[.07]" />
        <span className="text-[9px] font-semibold uppercase tracking-[.18em] text-zinc-400">{fanOutLabel}</span>
        <GitBranch size={14} className="text-[#812d29]" />
        <div className="h-px flex-1 bg-black/[.07]" />
      </div>

      <Card className="overflow-hidden border-[#812d29]/20 bg-white/60">
        <div className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-500">Agent two</p>
            <h3 className="mt-2 font-display text-xl tracking-[-.035em]">CHECKER · two independent evidence paths</h3>
          </div>
          {(() => {
            const status = traceStatus(checkerEvent?.status)
            return <Badge variant={status.badgeVariant}>{displayStatus(status.label)}</Badge>
          })()}
        </div>
        <Separator className="bg-black/[.06]" />
        <div className="grid items-start gap-3 p-4 sm:grid-cols-2">
          <div className={`rounded-2xl border border-black/[.07] bg-[#f7f7f2] p-4 ${courtEvent?.status === "started" ? "ring-2 ring-[#812d29]/20" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <Gavel size={17} className="text-[#812d29]" aria-hidden="true" />
              <div className="flex items-center gap-2"><span className={`size-2 rounded-full ${courtStatus.dotClass}`} aria-hidden="true" /><Badge variant={courtStatus.badgeVariant}>{displayStatus(courtStatus.label)}</Badge></div>
            </div>
            <h4 className="mt-3 text-sm font-semibold">Public federal docket</h4>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{courtEvent?.output_summary || courtEvent?.detail || missingBranchCopy("Waiting for READER facts.")}</p>
            <p className="mt-3 text-[10px] text-zinc-400">{formatDuration(courtEvent?.duration_ms)}</p>
            {courtEvent && courtEvent.status !== "started" && (
              <Accordion type="single" collapsible className="mt-2">
                <AccordionItem value="court-evidence" className="border-black/[.07]">
                  <AccordionTrigger className="py-3 text-xs">Inspect returned evidence</AccordionTrigger>
                  <AccordionContent>
                    <dl className="space-y-2 text-xs text-zinc-500">
                      <div><dt className="font-medium text-zinc-800">Lookup input</dt><dd className="mt-0.5 break-words">{courtEvent.input_summary || "Not reported"}</dd></div>
                      <div><dt className="font-medium text-zinc-800">Provider result</dt><dd className="mt-0.5">{courtEvent.output_summary || "No result summary"}</dd></div>
                    </dl>
                    {courtEvidence.map((item) => <a key={item.id} className="mt-3 block rounded-xl border border-black/[.06] bg-white p-3 text-xs hover:border-[#812d29]/30" href={item.source_url ?? undefined} target="_blank" rel="noreferrer"><span className="font-medium">{item.label}</span><span className="mt-1 block text-zinc-500">{item.detail}</span></a>)}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </div>

          <div className={`rounded-2xl border border-black/[.07] bg-[#f7f7f2] p-4 ${patternEvent?.status === "started" ? "ring-2 ring-[#812d29]/20" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <Database size={17} className="text-[#812d29]" aria-hidden="true" />
              <div className="flex items-center gap-2"><span className={`size-2 rounded-full ${patternStatus.dotClass}`} aria-hidden="true" /><Badge variant={patternStatus.badgeVariant}>{displayStatus(patternStatus.label)}</Badge></div>
            </div>
            <h4 className="mt-3 text-sm font-semibold">Approved scam corpus</h4>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{patternEvent?.output_summary || patternEvent?.detail || missingBranchCopy("Waiting for the model-assisted READER transcription.")}</p>
            <p className="mt-3 text-[10px] text-zinc-400">{formatDuration(patternEvent?.duration_ms)}</p>
            {patternEvent && patternEvent.status !== "started" && (
              <Accordion type="single" collapsible className="mt-2">
                <AccordionItem value="pattern-evidence" className="border-black/[.07]">
                  <AccordionTrigger className="py-3 text-xs">Inspect validation audit</AccordionTrigger>
                  <AccordionContent>
                    {analysis?.trace?.corpus_version && <p className="mb-3 text-[10px] text-zinc-400">Corpus {analysis.trace.corpus_version}</p>}
                    <div className="space-y-2">
                      {signalReviews.map((review, index) => <div key={`${review.pattern_id}-${index}`} className="rounded-xl border border-black/[.06] bg-white p-3 text-xs"><div className="flex items-center justify-between gap-2"><span className="font-medium">Pattern {review.pattern_id}</span><Badge variant={review.accepted && review.counts_toward_verdict ? "default" : "outline"}>{review.accepted ? review.counts_toward_verdict ? "Accepted · countable" : "Accepted · context" : "Rejected"}</Badge></div><p className="mt-1 text-zinc-500">{displayStatus(review.reason)}</p>{review.document_excerpt && <p className="mt-2 border-l-2 border-[#812d29]/25 pl-2 text-zinc-600">“{review.document_excerpt}”</p>}</div>)}
                      {!signalReviews.length && <p className="text-xs text-zinc-400">No model proposals required validation.</p>}
                    </div>
                    {patternEvidence.map((item) => <a key={item.id} className="mt-3 block rounded-xl border border-black/[.06] bg-white p-3 text-xs hover:border-[#812d29]/30" href={item.source_url ?? undefined} target="_blank" rel="noreferrer"><span className="font-medium">{item.label}</span><span className="mt-1 block text-zinc-500">{item.source}</span></a>)}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </div>
        </div>
      </Card>

      <div className="my-3 flex items-center gap-3 px-4" aria-hidden="true">
        <div className="h-px flex-1 bg-black/[.07]" />
        <span className="text-[9px] font-semibold uppercase tracking-[.18em] text-zinc-400">merge validated findings</span>
        <ArrowDown size={14} className="text-[#812d29]" />
        <div className="h-px flex-1 bg-black/[.07]" />
      </div>

      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
        <RunNode eventKey="rules" title="Fixed rules · not AI" icon={Braces} dark />
        <RunNode eventKey="legal_passages" title="Grounding Guard · legal sources" icon={ShieldCheck} />
        <RunNode eventKey="explainer" title="EXPLAINER · plain language" icon={Bot} />
        <RunNode eventKey="result" title="Result assembled" icon={Save} />
      </div>

      {analysis && (
        <Accordion type="single" collapsible className="mt-4 rounded-[22px] border border-black/[.07] bg-white/55 px-4">
          <AccordionItem value="stage-outputs" className="border-0">
            <AccordionTrigger className="hover:no-underline">
              <span><span className="block text-left text-sm font-semibold">Inspect the stage outputs</span><span className="mt-1 block text-left text-[11px] font-normal text-zinc-400">Facts, decision inputs, and grounded explanation returned by this run</span></span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid items-start gap-3 lg:grid-cols-3">
                <section className="rounded-2xl border border-black/[.06] bg-white/75 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-zinc-400">READER output</p>
                  <h4 className="mt-2 text-sm font-semibold">Extracted facts</h4>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div><dt className="text-zinc-400">Court or issuer</dt><dd className="mt-0.5 break-words text-zinc-700">{analysis.breakdown.court || analysis.breakdown.claimed_authority || "Not extracted"}</dd></div>
                    <div><dt className="text-zinc-400">Case number</dt><dd className="mt-0.5 break-words text-zinc-700">{analysis.breakdown.case_number || "Not extracted"}</dd></div>
                    <div><dt className="text-zinc-400">Parties</dt><dd className="mt-0.5 break-words text-zinc-700">{analysis.breakdown.parties.join(" · ") || "Not extracted"}</dd></div>
                    <div><dt className="text-zinc-400">Deadline</dt><dd className="mt-0.5 break-words text-zinc-700">{analysis.breakdown.deadline || "Not extracted"}</dd></div>
                  </dl>
                  <p className="mt-3 border-t border-black/[.06] pt-3 text-[10px] leading-4 text-zinc-400">Model-assisted facts require comparison with the original letter.</p>
                </section>

                <section className="rounded-2xl border border-black/[.06] bg-white/75 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-zinc-400">Fixed-code output</p>
                  <h4 className="mt-2 text-sm font-semibold">Decision inputs</h4>
                  {analysis.decision ? <><p className="mt-3 text-xs leading-5 text-zinc-600">{ruleLabel(analysis.decision.rule)}</p><dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-bg-base p-3"><dt className="text-zinc-400">Signals</dt><dd className="mt-1 font-semibold">{analysis.decision.counted_signal_ids.length}</dd></div><div className="rounded-xl bg-bg-base p-3"><dt className="text-zinc-400">Case</dt><dd className="mt-1 font-semibold">{analysis.decision.case_found ? "Found" : "Not found"}</dd></div><div className="rounded-xl bg-bg-base p-3"><dt className="text-zinc-400">Parties</dt><dd className="mt-1 font-semibold">{analysis.decision.parties_match ? "Match" : "No match"}</dd></div><div className="rounded-xl bg-bg-base p-3"><dt className="text-zinc-400">Verdict</dt><dd className="mt-1 font-semibold">{verdictLabel(analysis.verdict)}</dd></div></dl></> : <p className="mt-3 text-xs text-zinc-400">No deterministic decision record was returned.</p>}
                </section>

                <section className="rounded-2xl border border-black/[.06] bg-white/75 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-zinc-400">EXPLAINER output</p>
                  <h4 className="mt-2 text-sm font-semibold">Grounded explanation</h4>
                  <p className="mt-3 text-xs leading-5 text-zinc-600">{analysis.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-black/[.06] pt-3">
                    <Badge variant="outline">{analysis.guard?.accepted_pattern_ids.length ?? 0} pattern quote(s)</Badge>
                    <Badge variant="outline">{analysis.guard?.accepted_passage_ids.length ?? 0} legal passage(s)</Badge>
                    {(analysis.guard?.quarantined_claims.length ?? 0) > 0 && <Badge variant="warning">{analysis.guard?.quarantined_claims.length} quarantined</Badge>}
                  </div>
                </section>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {analysis?.trace && (
        <div className="mt-4 grid gap-2 rounded-[22px] border border-black/[.07] bg-black/[.025] p-4 text-xs text-zinc-500 sm:grid-cols-2 lg:grid-cols-3">
          <p><span className="font-medium text-zinc-800">Configured model:</span> {analysis.trace.model_alias}</p>
          <p><span className="font-medium text-zinc-800">Corpora:</span> {Object.keys(analysis.trace.corpus_versions ?? {}).length || 1} versioned source set(s)</p>
          <p><span className="font-medium text-zinc-800">Policy:</span> {analysis.trace.policy_version}</p>
          <p><span className="font-medium text-zinc-800">Evidence:</span> {analysis.trace.metrics.evidence_items} item(s)</p>
          <p><span className="font-medium text-zinc-800">Verdict authority:</span> fixed code</p>
          <p><span className="font-medium text-zinc-800">Document facts:</span> model-assisted · human review required</p>
          <p><span className="font-medium text-zinc-800">Pattern text:</span> {analysis.trace.pattern_text_basis === "native_pdf_text" ? "native PDF text" : "model-assisted transcription"}</p>
        </div>
      )}
    </div>
  )
}

export function OrchestrationView({ agents, loadState, latestAnalysis = null, analysisRunState = "idle", traceEvents = [], runLabel, onRefresh }: OrchestrationViewProps) {
  const expectedAgents = AGENTS.map((definition) => ({
    ...definition,
    status: agents.find((agent) => agent.name.toLowerCase() === definition.name),
  }))
  const configuredCount = expectedAgents.filter(({ status }) => status?.enabled).length
  const setupHasIssue = expectedAgents.some(({ status }) => Boolean(status?.last_error))
  const events = latestAnalysis?.trace?.steps ?? traceEvents
  const runId = latestAnalysis?.trace?.run_id ?? events[0]?.run_id
  const intakeName = events.find((event) => event.key === "intake" && event.input_summary)?.input_summary
  const documentLabel = runLabel || intakeName || "No document selected"
  const sourceLabel = runLabel ? "Saved analysis" : analysisRunState === "running" ? "Live stream" : "Current session"

  return (
    <TooltipProvider delayDuration={180}>
      <section aria-labelledby="orchestration-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Badge variant="secondary">3 agents · 1 code orchestrator</Badge>
            <h1 id="orchestration-title" className="mt-2.5 font-display text-2xl font-medium tracking-[-.045em] sm:text-3xl">Analysis pipeline</h1>
            <p className="mt-1.5 max-w-3xl text-sm leading-5 text-zinc-500">Inspect real backend events, evidence, and the fixed-code decision boundary. The agents report facts; they cannot choose the verdict.</p>
          </div>
        </div>

        <Card className="overflow-hidden" aria-labelledby="latest-run-title">
          <div className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">{sourceLabel}</p>
              <h2 id="latest-run-title" tabIndex={-1} className="mt-1.5 break-words rounded font-display text-xl font-medium tracking-[-.035em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30">{documentLabel}</h2>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-400">
                <span>{runId ? `Run ${runId.slice(0, 8)}` : "Run ID appears when processing begins"}</span>
                {latestAnalysis?.trace?.started_at && <span>Started {new Date(latestAnalysis.trace.started_at).toLocaleString()}</span>}
              </div>
            </div>
            {analysisRunState === "complete" && latestAnalysis && <Badge variant={verdictVariant(latestAnalysis.verdict)}>{verdictLabel(latestAnalysis.verdict)}</Badge>}
          </div>
          <Separator className="bg-black/[.06]" />

          <div className="space-y-4 p-4 sm:p-5">
            <AnalysisPipeline events={events} runState={analysisRunState} compact={analysisRunState !== "idle"} />

            {analysisRunState === "running" && events.length === 0 && (
              <Alert className="rounded-[22px] border-[#812d29]/15 bg-[#812d29]/[.04]">
                <Activity size={16} className="animate-pulse motion-reduce:animate-none" aria-hidden="true" />
                <AlertTitle>Connecting to the analysis trace</AlertTitle>
                <AlertDescription className="text-zinc-500">Waiting for the first verified event from the backend.</AlertDescription>
              </Alert>
            )}

            {analysisRunState === "idle" && <p className="text-center text-xs text-zinc-500">Analyze a sample or upload a document from Overview. Every stage above will update from the returned backend trace.</p>}

            {analysisRunState === "running" && events.length > 0 && <DetailedRunTrace events={events} analysis={latestAnalysis} />}

            {analysisRunState === "error" && (
              <div className="space-y-4">
                {events.length > 0 && <DetailedRunTrace events={events} analysis={latestAnalysis} terminal />}
                <Alert className="rounded-[22px] border-orange-200 bg-orange-50/70">
                  <TriangleAlert size={16} aria-hidden="true" />
                  <AlertTitle>The analysis did not complete</AlertTitle>
                  <AlertDescription>{events.length ? "The verified events above show where the run stopped." : "No backend trace event was returned for this attempt."}</AlertDescription>
                </Alert>
              </div>
            )}

            {analysisRunState === "complete" && !latestAnalysis && (
              <Alert className="rounded-[22px] border-amber-200 bg-amber-50/70">
                <TriangleAlert size={16} aria-hidden="true" />
                <AlertTitle>Completed trace unavailable</AlertTitle>
                <AlertDescription>The run completed, but no analysis response is available in this session.</AlertDescription>
              </Alert>
            )}

            {analysisRunState === "complete" && latestAnalysis && (
              <>
                <DetailedRunTrace events={events} analysis={latestAnalysis} terminal />
                {latestAnalysis.official_contact && (
                  <div className="rounded-2xl border border-black/[.07] bg-white/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-black/[.05]"><Gavel size={16} aria-hidden="true" /></span><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-zinc-400">Deterministic next action · not an agent</p><h3 className="mt-1 text-sm font-semibold">Official contact route</h3></div></div>
                      <Badge variant={latestAnalysis.official_contact.status === "reviewed_route" ? "default" : latestAnalysis.official_contact.status === "manual_confirmation_required" ? "warning" : "outline"}>{displayStatus(latestAnalysis.official_contact.status)}</Badge>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-zinc-500">{latestAnalysis.official_contact.office_name || latestAnalysis.official_contact.court_name || latestAnalysis.official_contact.reason || "No reviewed contact route is available for this result."}</p>
                    <p className="mt-2 text-[10px] text-zinc-400">This action is selected only from the reviewed court directory. Contact details printed in the uploaded letter are never used.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>

        <Card className="px-4 sm:px-5">
          <Accordion type="single" collapsible>
            <AccordionItem value="diagnostics" className="border-black/[.07]">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex w-full flex-wrap items-center justify-between gap-3 pr-3 text-left"><div><p className="font-display text-xl tracking-[-.035em]">System diagnostics</p><p className="mt-1 text-xs font-normal text-zinc-500">Configuration for this service instance—not a live run status.</p></div><Badge variant={loadState === "ready" && configuredCount === 3 && !setupHasIssue ? "default" : "outline"}>{loadState === "loading" ? "Checking" : loadState === "error" ? "Unavailable" : `${configuredCount} of 3 configured`}</Badge></div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex justify-end pb-3">{onRefresh && <Tooltip><TooltipTrigger asChild><Button type="button" variant="outline" className="h-9" onClick={onRefresh}><RefreshCw size={14} aria-hidden="true" /> Refresh</Button></TooltipTrigger><TooltipContent>Refresh system setup</TooltipContent></Tooltip>}</div>
                {loadState === "error" && <Alert className="mb-4 rounded-2xl border-orange-200 bg-orange-50/70"><TriangleAlert size={16} aria-hidden="true" /><AlertTitle>Setup status could not be checked</AlertTitle><AlertDescription>The run trace remains the source of truth for document progress.</AlertDescription></Alert>}
                <ul className="grid items-start gap-3 md:grid-cols-3" aria-label="Agent system configuration">
                  {expectedAgents.map(({ name, number, fallback, icon: Icon, status }) => {
                    const readiness = readinessFor(status, loadState)
                    return <li key={name} className="rounded-2xl border border-black/[.07] bg-white/55 p-3.5"><div className="flex items-center justify-between gap-3"><span className="grid size-8 place-items-center rounded-full bg-black/[.04] text-[10px] font-semibold">{number}</span><Badge variant={readiness.badgeVariant}>{readiness.label}</Badge></div><div className="mt-3 flex items-center gap-2"><Icon size={16} className="text-[#812d29]" aria-hidden="true" /><h3 className="text-sm font-semibold tracking-[.06em]">{name.toUpperCase()}</h3></div><p className="mt-1.5 text-xs leading-5 text-zinc-500">{status?.description || fallback}</p><Separator className="my-2.5 bg-black/[.06]" /><p className="flex items-center gap-1.5 text-[10px] text-zinc-400"><Clock3 size={11} aria-hidden="true" />{formatLastCheck(status?.last_run)}</p></li>
                  })}
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="policy" className="border-0">
              <AccordionTrigger className="hover:no-underline">
                <div className="pr-3 text-left"><p className="font-display text-xl tracking-[-.035em]">Published verdict boundary</p><p className="mt-1 text-xs font-normal text-zinc-500">Same decision graph; external branches can fail closed.</p></div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid items-start gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4"><p className="text-xs font-semibold text-orange-800">SCAM</p><p className="mt-2 text-xs leading-5 text-zinc-500">Two or more accepted, countable scam signals.</p></div>
                  <div className="rounded-2xl border border-brand-soft bg-brand-soft/30 p-4"><p className="text-xs font-semibold">VERIFIED</p><p className="mt-2 text-xs leading-5 text-zinc-500">The case is found and the caption parties match.</p></div>
                  <div className="rounded-2xl border border-black/[.07] bg-white/60 p-4"><p className="text-xs font-semibold">CANNOT_CONFIRM</p><p className="mt-2 text-xs leading-5 text-zinc-500">Anything else, including an unavailable evidence branch.</p></div>
                </div>
                <p className="mt-4 text-xs leading-5 text-zinc-500"><strong className="text-zinc-800">The orchestrator is not a fourth AI agent.</strong> It enforces this rule order, records the trace, and packages the result.</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>
      </section>
    </TooltipProvider>
  )
}
