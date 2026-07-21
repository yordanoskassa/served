import {
  Bot,
  Braces,
  Check,
  CircleDot,
  FileCheck2,
  FileInput,
  Search,
  TriangleAlert,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { TraceEvent } from "@/lib/api"

type RunState = "idle" | "running" | "complete" | "error"
type StageState = "waiting" | "active" | "complete" | "limited" | "failed"

type PipelineStage = {
  id: string
  number: string
  owner: string
  title: string
  description: string
  keys: TraceEvent["key"][]
  summaryKey: TraceEvent["key"]
  icon: typeof FileInput
}

const STAGES: PipelineStage[] = [
  {
    id: "intake",
    number: "01",
    owner: "ORCHESTRATOR",
    title: "Secure intake",
    description: "Checks the signed-in upload and file type.",
    keys: ["intake"],
    summaryKey: "intake",
    icon: FileInput,
  },
  {
    id: "reader",
    number: "02",
    owner: "READER · REVIEWED DATA",
    title: "Read & route",
    description: "Extracts visible facts, then selects an exact reviewed court route.",
    keys: ["reader", "court_directory"],
    summaryKey: "court_directory",
    icon: FileCheck2,
  },
  {
    id: "checker",
    number: "03",
    owner: "CHECKER",
    title: "Check evidence",
    description: "Checks the public federal docket and the approved scam corpus.",
    keys: ["checker", "courtlistener", "scam_patterns"],
    summaryKey: "checker",
    icon: Search,
  },
  {
    id: "rules",
    number: "04",
    owner: "FIXED CODE",
    title: "Apply rules",
    description: "Code—not AI—selects one of the three verdicts.",
    keys: ["rules"],
    summaryKey: "rules",
    icon: Braces,
  },
  {
    id: "explainer",
    number: "05",
    owner: "EXPLAINER",
    title: "Explain result",
    description: "Uses the locked verdict and grounded source passages.",
    keys: ["explainer", "legal_passages"],
    summaryKey: "explainer",
    icon: Bot,
  },
  {
    id: "result",
    number: "06",
    owner: "ORCHESTRATOR",
    title: "Save result",
    description: "Returns the breakdown, evidence, trace, and next step.",
    keys: ["result"],
    summaryKey: "result",
    icon: Check,
  },
]

function latestByKey(events: TraceEvent[]): Map<TraceEvent["key"], TraceEvent> {
  const latest = new Map<TraceEvent["key"], TraceEvent>()
  for (const event of events) {
    const current = latest.get(event.key)
    if (!current || current.seq < event.seq) latest.set(event.key, event)
  }
  return latest
}

function stateForStage(stage: PipelineStage, latest: Map<TraceEvent["key"], TraceEvent>, runState: RunState): StageState {
  const stageEvents = stage.keys
    .map((key) => latest.get(key))
    .filter((event): event is TraceEvent => Boolean(event))

  if (!stageEvents.length) return "waiting"
  if (stageEvents.some((event) => event.status === "failed")) return "failed"
  if (stageEvents.some((event) => event.status === "started")) {
    return runState === "error" ? "failed" : "active"
  }
  if (stageEvents.some((event) => ["degraded", "skipped", "unavailable"].includes(event.status))) {
    return "limited"
  }

  const summary = latest.get(stage.summaryKey)
  if (!summary) return runState === "error" ? "failed" : "active"
  if (["degraded", "skipped", "unavailable"].includes(summary.status)) return "limited"
  return summary.status === "complete" ? "complete" : "waiting"
}

function statusLabel(state: StageState): string {
  if (state === "active") return "Running"
  if (state === "complete") return "Complete"
  if (state === "limited") return "Limited"
  if (state === "failed") return "Stopped"
  return "Queued"
}

function statusVariant(state: StageState): "default" | "warning" | "destructive" | "outline" {
  if (state === "complete") return "default"
  if (state === "active" || state === "limited") return "warning"
  if (state === "failed") return "destructive"
  return "outline"
}

function summaryForStage(stage: PipelineStage, latest: Map<TraceEvent["key"], TraceEvent>): string | null {
  const primary = latest.get(stage.summaryKey)
  if (primary?.output_summary) return primary.output_summary
  if (primary?.detail) return primary.detail

  const newest = stage.keys
    .map((key) => latest.get(key))
    .filter((event): event is TraceEvent => Boolean(event))
    .sort((left, right) => right.seq - left.seq)[0]
  return newest?.output_summary || newest?.detail || null
}

function runLabel(runState: RunState, events: TraceEvent[]): string {
  if (runState === "running") return events.length ? "Live run" : "Connecting"
  if (runState === "complete") return "Run complete"
  if (runState === "error") return "Run stopped"
  return "Ready for a request"
}

function eventMessage(event: TraceEvent): string {
  if (event.status === "started") return event.detail || "This operation has started."
  return event.output_summary || event.detail || "The operation finished without additional detail."
}

function eventTime(event: TraceEvent): string {
  const date = new Date(event.at)
  if (Number.isNaN(date.getTime())) return `Event ${event.seq}`
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })
}

function agentForEvent(event: TraceEvent | undefined) {
  const key = event?.key
  if (key === "reader" || key === "court_directory") return {
    owner: "READER",
    role: "Extracts visible facts and routes only through reviewed court data.",
    icon: FileCheck2,
    dot: "bg-sky-400",
    pill: "border-sky-300/25 bg-sky-400/15 text-sky-200",
    panel: "border-sky-300/20 bg-sky-400/[.08]",
  }
  if (key === "checker" || key === "courtlistener" || key === "scam_patterns") return {
    owner: "CHECKER",
    role: "Investigates docket evidence and approved warning signals without deciding the verdict.",
    icon: Search,
    dot: "bg-zinc-400",
    pill: "border-zinc-300/25 bg-zinc-400/15 text-zinc-200",
    panel: "border-zinc-300/20 bg-zinc-400/[.08]",
  }
  if (key === "rules") return {
    owner: "FIXED CODE",
    role: "Compares the supported facts and selects the immutable result state.",
    icon: Braces,
    dot: "bg-emerald-400",
    pill: "border-emerald-300/25 bg-emerald-400/15 text-emerald-100",
    panel: "border-emerald-300/20 bg-emerald-400/[.08]",
  }
  if (key === "explainer" || key === "legal_passages") return {
    owner: "EXPLAINER",
    role: "Explains the locked outcome using accepted evidence, approved passages, and limitations.",
    icon: Bot,
    dot: "bg-violet-400",
    pill: "border-violet-300/25 bg-violet-400/15 text-violet-100",
    panel: "border-violet-300/20 bg-violet-400/[.08]",
  }
  return {
    owner: "ORCHESTRATOR",
    role: "Controls secure intake, ordered execution, and the final evidence package.",
    icon: event?.key === "result" ? Check : FileInput,
    dot: "bg-brand-green",
    pill: "border-brand-green/25 bg-brand-green/15 text-brand-green",
    panel: "border-brand-green/20 bg-brand-green/[.07]",
  }
}

export function LiveActivityLog({ events }: { events: TraceEvent[] }) {
  const visibleEvents = events.slice(-10).reverse()
  const activeEvent = [...latestByKey(events).values()]
    .filter((event) => event.status === "started")
    .sort((left, right) => right.seq - left.seq)[0]
  const currentEvent = activeEvent ?? [...events].sort((left, right) => right.seq - left.seq)[0]
  const currentRunning = currentEvent?.status === "started"
  const currentAgent = agentForEvent(currentEvent)
  const CurrentIcon = currentAgent.icon

  return <aside className="h-fit overflow-hidden rounded-2xl border border-black/[.07] bg-[#171717] text-white" aria-label="Live analysis activity">
    <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
      <div><h4 className="type-ui-heading !text-white">What Served is doing</h4></div>
      <span className="mt-1 flex items-center gap-1.5 text-[9px] uppercase tracking-[.12em] text-white/45"><span className="size-1.5 animate-pulse rounded-full bg-brand-green motion-reduce:animate-none" />Live</span>
    </div>

    <div className={cn("border-b p-4", currentAgent.panel)} aria-live="polite">
      <div className="flex items-start gap-3"><span className={cn("grid size-9 shrink-0 place-items-center rounded-xl border", currentAgent.pill)}><CurrentIcon size={17} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={cn("rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[.14em]", currentAgent.pill)}>{currentAgent.owner}</span><span className="flex items-center gap-1 text-[9px] uppercase tracking-[.12em] text-white/40"><CircleDot className={currentRunning || !currentEvent ? "animate-pulse motion-reduce:animate-none" : ""} size={11} />{currentRunning ? "Working now" : "Latest step"}</span></div><p className="mt-2 text-sm font-semibold leading-5">{currentEvent?.label ?? "Connecting to secure intake"}</p><p className="mt-1 text-[10px] leading-4 text-white/50">{currentAgent.role}</p></div></div>
      {currentEvent && <p className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] leading-5 text-white/70">{eventMessage(currentEvent)}</p>}
      {currentEvent?.input_summary && <p className="mt-2 rounded-lg bg-black/25 px-2.5 py-2 text-[10px] leading-4 text-white/50"><span className="font-semibold text-white/70">Input:</span> {currentEvent.input_summary}</p>}
    </div>

    {visibleEvents.length > 0 && <ol className="max-h-[360px] overflow-y-auto p-2" aria-label="Backend trace events, newest first">
      {visibleEvents.map((event) => {
        const running = event.status === "started"
        const limited = ["degraded", "skipped", "unavailable"].includes(event.status)
        const failed = event.status === "failed"
        const agent = agentForEvent(event)
        return <motion.li initial={false} animate={{ opacity: 1 }} className="rounded-xl border border-transparent px-2.5 py-2.5 hover:border-white/[.06] hover:bg-white/[.04]" key={`${event.seq}-${event.key}-${event.status}`}>
          <div className="flex gap-2.5"><span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", running ? `animate-pulse motion-reduce:animate-none ${agent.dot}` : failed ? "bg-red-400" : limited ? "bg-neutral-300" : agent.dot)} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><span className={cn("text-[8px] font-bold uppercase tracking-[.13em]", running ? "text-white/75" : "text-white/35")}>{agent.owner}</span><p className="mt-0.5 text-[11px] font-medium leading-4 text-white/85">{event.label}</p></div><span className="shrink-0 text-[9px] text-white/25">{eventTime(event)}</span></div><p className="mt-1 text-[10px] leading-4 text-white/45">{eventMessage(event)}</p>{event.evidence_count > 0 && <p className="mt-1 text-[9px] text-brand-green/70">{event.evidence_count} evidence item{event.evidence_count === 1 ? "" : "s"} attached</p>}</div></div>
        </motion.li>
      })}
    </ol>}
  </aside>
}

export function AnalysisPipeline({
  events,
  runState,
  compact = false,
  rail = false,
  className,
}: {
  events: TraceEvent[]
  runState: RunState
  compact?: boolean
  rail?: boolean
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const latest = latestByKey(events)
  const stages = STAGES.map((stage) => ({
    ...stage,
    state: stateForStage(stage, latest, runState),
    summary: summaryForStage(stage, latest),
  }))
  const settled = stages.filter((stage) => ["complete", "limited"].includes(stage.state)).length
  const active = stages.find((stage) => stage.state === "active")
  const stopped = [...stages].reverse().find((stage) => stage.state === "failed")
  const progress = Math.round((settled / STAGES.length) * 100)
  const liveMessage = active
    ? `${active.owner} is running: ${active.title}`
    : stopped
      ? `Analysis stopped during ${stopped.title}`
      : runState === "complete"
        ? "All analysis stages have settled"
        : runState === "error"
          ? "Analysis stopped before the next stage began"
          : "The analysis route is ready"

  return (
    <section className={cn("rounded-2xl border border-black/[.07] bg-white/55", compact ? "p-3.5" : "p-4 sm:p-5", className)} aria-label="Document analysis pipeline">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveMessage}</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-400">Ordered pipeline</p>
          <h3 className={cn("mt-1 font-display font-medium tracking-[-.035em]", compact ? "text-lg" : "text-xl")}>From upload to supported next step</h3>
        </div>
        <Badge variant={runState === "error" ? "destructive" : runState === "running" ? "warning" : runState === "complete" ? "default" : "outline"}>
          {runLabel(runState, events)}
        </Badge>
      </div>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/[.06]" aria-hidden="true">
        <motion.div
          className={cn("h-full rounded-full", runState === "error" ? "bg-neutral-600" : "bg-foreground")}
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: "easeOut" }}
        />
      </div>

      <div className={cn("mt-3", compact && !rail && events.length > 0 && "grid items-start gap-3 lg:grid-cols-[minmax(18rem,.82fr)_minmax(0,1.45fr)]")}>
        {compact && !rail && events.length > 0 && <LiveActivityLog events={events} />}
        <div className="relative">
        <div className={cn("pointer-events-none absolute left-[8%] right-[8%] top-[19px] h-px bg-black/[.08]", compact ? "hidden" : "hidden xl:block")} aria-hidden="true" />
        <ol className={cn("relative grid items-start gap-2", compact ? rail ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6")}>
        {stages.map((stage) => {
          const Icon = stage.icon
          return (
            <li
              key={stage.id}
              aria-current={stage.state === "active" ? "step" : undefined}
              className={cn(
                "relative min-w-0 rounded-2xl border p-3",
                stage.state === "active" && "border-foreground/35 bg-foreground/[.045]",
                stage.state === "complete" && "border-black/[.06] bg-white/80",
                stage.state === "limited" && "border-border bg-muted",
                stage.state === "failed" && "border-border bg-muted",
                stage.state === "waiting" && "border-black/[.05] bg-black/[.018]",
              )}
            >
              <div className="relative flex items-center justify-between gap-2">
                <span className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full border bg-background",
                  stage.state === "active" && "border-foreground text-foreground",
                  stage.state === "complete" && "border-brand-green bg-brand-green/20 text-black",
                  stage.state === "limited" && "border-foreground/30 text-muted-foreground",
                  stage.state === "failed" && "border-foreground text-foreground",
                  stage.state === "waiting" && "border-black/10 text-zinc-400",
                )}>
                  {stage.state === "failed" ? <TriangleAlert size={14} /> : stage.state === "active" ? <CircleDot className="animate-pulse motion-reduce:animate-none" size={14} /> : <Icon size={14} />}
                </span>
                <span className="text-[9px] font-semibold tracking-[.12em] text-zinc-400">{stage.number}</span>
              </div>
              <p className="mt-3 truncate text-[9px] font-semibold uppercase tracking-[.12em] text-zinc-400" title={stage.owner}>{stage.owner}</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-zinc-800">{stage.title}</p>
              {!compact && <p className="mt-1 text-[11px] leading-4 text-zinc-500">{stage.description}</p>}
              {(stage.summary || stage.state !== "waiting") && (
                <div className="mt-3 border-t border-black/[.06] pt-2">
                  <Badge variant={statusVariant(stage.state)} className="px-2 py-0.5 text-[9px]">{statusLabel(stage.state)}</Badge>
                  {stage.summary && !compact && <p className="mt-2 line-clamp-3 text-[10px] leading-4 text-zinc-500">{stage.summary}</p>}
                </div>
              )}
            </li>
          )
        })}
        </ol>
        </div>
      </div>
    </section>
  )
}
