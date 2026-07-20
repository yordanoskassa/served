import { Activity, ArrowRight, ChevronRight, FileText, RefreshCw } from "lucide-react"

import { AnalysisPipeline } from "@/components/AnalysisPipeline"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import type { AnalysisRunState } from "@/components/UploadCard"
import type { DashboardSummary, TraceEvent, Verdict } from "@/lib/api"

type LoadState = "loading" | "ready" | "error"

function verdictBadge(verdict: Verdict | null): { label: string; variant: "default" | "warning" | "destructive" | "secondary" } {
  if (verdict === "verified") return { label: "VERIFIED", variant: "default" }
  if (verdict === "scam" || verdict === "scam_indicators") return { label: "SCAM", variant: "destructive" }
  if (verdict === "cannot_confirm") return { label: "CANNOT_CONFIRM", variant: "warning" }
  return { label: "UNKNOWN", variant: "secondary" }
}

function savedAt(value: string | null): string {
  if (!value) return "Date unavailable"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Saved analysis"
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function WorkspaceActivity({
  summary,
  summaryState,
  runState,
  traceEvents,
  onRefresh,
  onOpenDocuments,
  onOpenAnalysis,
  onOpenPipeline,
}: {
  summary: DashboardSummary | null
  summaryState: LoadState
  runState: AnalysisRunState
  traceEvents: TraceEvent[]
  onRefresh: () => void
  onOpenDocuments: () => void
  onOpenAnalysis: (id: string) => void
  onOpenPipeline: () => void
}) {
  const runActive = runState === "running"
  const runStopped = runState === "error" && traceEvents.length > 0
  const showRun = runActive || runStopped

  return <Card className="h-fit self-start overflow-hidden">
    <div className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="type-ui-heading">{runActive ? "Running analysis" : runStopped ? "Run stopped" : "Recent checks"}</h2>
        </div>
        <Button
          variant="outline"
          className="size-9 shrink-0 p-0"
          onClick={onRefresh}
          disabled={summaryState === "loading"}
          aria-label="Refresh workspace activity"
          title="Refresh workspace activity"
        >
          <RefreshCw className={summaryState === "loading" ? "animate-spin" : ""} size={15} />
        </Button>
      </div>

      {showRun ? <div className="pt-4">
        <AnalysisPipeline events={traceEvents} runState={runStopped ? "error" : "running"} compact rail />
        <p className="type-caption mt-3">{traceEvents.length} event{traceEvents.length === 1 ? "" : "s"}</p>
        <Button className="mt-4 h-10 w-full py-2 text-sm" onClick={onOpenPipeline}>{runStopped ? "See trace" : "Live trace"} <ArrowRight size={15} /></Button>
      </div> : <>
        <div className="mt-4">
          {summaryState === "loading" && <div className="space-y-4">{[0, 1, 2].map((item) => <div className="flex items-center gap-3" key={item}><Skeleton className="size-10 rounded-full bg-black/5" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-2/3 bg-black/5" /><Skeleton className="h-2 w-1/3 bg-black/5" /></div></div>)}</div>}
          {summaryState === "error" && <Alert className="rounded-2xl border-black/10 bg-background"><AlertTitle>Activity unavailable</AlertTitle><AlertDescription>Refresh to try loading your saved analyses again.</AlertDescription></Alert>}
          {summaryState === "ready" && summary?.recent.slice(0, 4).map((item) => {
            const badge = verdictBadge(item.verdict)
            const date = savedAt(item.created_at)
            return <button type="button" className="flex w-full items-center gap-2.5 border-b border-black/5 py-2.5 text-left transition hover:translate-x-0.5 focus-visible:rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 last:border-0" key={item.id} onClick={() => onOpenAnalysis(item.id)} aria-label={`View analysis for ${item.name}, ${badge.label}, ${date}`}>
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-black/5"><FileText size={14} /></span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="mt-0.5 text-[11px] text-zinc-400">{date}</p></div>
              <Badge variant={badge.variant} className="px-2.5 py-1 text-[9px]">{badge.label}</Badge><ChevronRight className="shrink-0 text-zinc-300" size={15} />
            </button>
          })}
          {summaryState === "ready" && !summary?.recent.length && <div className="grid place-items-center rounded-xl border border-dashed border-black/10 bg-background px-5 py-8 text-center"><div><span className="mx-auto grid size-9 place-items-center rounded-full bg-black/5"><FileText size={15} /></span><p className="mt-2.5 text-sm font-medium">No checks yet</p><p className="type-caption mt-1">Completed analyses appear here.</p></div></div>}
        </div>
        <Separator className="my-3" />
        <div className="grid gap-2 sm:grid-cols-2">
          <Button className="h-9 px-3 py-2 text-xs" variant="outline" onClick={onOpenDocuments}>All requests <ArrowRight size={14} /></Button>
          <Button className="h-9 px-3 py-2 text-xs" variant="outline" onClick={onOpenPipeline} disabled={!traceEvents.length}>Trace <Activity size={14} /></Button>
        </div>
      </>}
    </div>
  </Card>
}
