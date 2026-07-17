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
    description: "Checks CourtListener and the approved scam corpus.",
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
  return "Ready for a letter"
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
          className={cn("h-full rounded-full", runState === "error" ? "bg-orange-500" : "bg-[#812d29]")}
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: "easeOut" }}
        />
      </div>

      <div className="relative mt-3">
        <div className={cn("pointer-events-none absolute left-[8%] right-[8%] top-[19px] h-px bg-black/[.08]", compact ? "hidden" : "hidden xl:block")} aria-hidden="true" />
        <ol className={cn("relative grid items-start gap-2", compact ? rail ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6")}>
        {stages.map((stage) => {
          const Icon = stage.icon
          return (
            <li
              key={stage.id}
              aria-current={stage.state === "active" ? "step" : undefined}
              className={cn(
                "relative min-w-0 rounded-2xl border p-3",
                stage.state === "active" && "border-[#812d29]/35 bg-[#812d29]/[.045]",
                stage.state === "complete" && "border-black/[.06] bg-white/80",
                stage.state === "limited" && "border-amber-200 bg-amber-50/70",
                stage.state === "failed" && "border-orange-200 bg-orange-50/70",
                stage.state === "waiting" && "border-black/[.05] bg-black/[.018]",
              )}
            >
              <div className="relative flex items-center justify-between gap-2">
                <span className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full border bg-bg-base",
                  stage.state === "active" && "border-[#812d29] text-[#812d29]",
                  stage.state === "complete" && "border-brand-green bg-brand-green/20 text-black",
                  stage.state === "limited" && "border-amber-300 text-amber-700",
                  stage.state === "failed" && "border-orange-300 text-orange-700",
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
    </section>
  )
}
