import { Activity, ArrowRight, ChevronRight, FileText, RefreshCw } from "lucide-react"

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
  if (verdict === "cannot_confirm") return { label: "REVIEW", variant: "warning" }
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
  const latestEvent = traceEvents.at(-1)
  const runActive = runState === "running"

  return <Card className="flex min-h-[420px] flex-col overflow-hidden p-2">
    <div className="flex flex-1 flex-col rounded-[22px] bg-white/70 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-400">{runActive ? "Live analysis" : "Workspace activity"}</p>
          <h2 className="mt-2 font-display text-2xl tracking-[-.04em]">{runActive ? "Your letter is being checked" : "Recent analyses"}</h2>
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

      {runActive ? <div className="flex flex-1 flex-col pt-8">
        <div className="h-1.5 overflow-hidden rounded-full bg-black/5">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-brand-green" />
        </div>
        <div className="mt-6 rounded-2xl border border-black/5 bg-bg-base p-4" aria-live="polite">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-zinc-400">
            <Activity size={13} /> Latest verified event
          </div>
          <p className="mt-3 text-sm font-semibold">{latestEvent?.label ?? "Connecting to the analysis trace"}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{latestEvent?.output_summary ?? latestEvent?.detail ?? "The first backend event will appear here."}</p>
          <p className="mt-3 text-[10px] text-zinc-400">{traceEvents.length} event{traceEvents.length === 1 ? "" : "s"} received</p>
        </div>
        <Button className="mt-auto w-full" onClick={onOpenPipeline}>Open live run <ArrowRight size={15} /></Button>
      </div> : <>
        <div className="mt-6 flex-1">
          {summaryState === "loading" && <div className="space-y-4">{[0, 1, 2].map((item) => <div className="flex items-center gap-3" key={item}><Skeleton className="size-10 rounded-full bg-black/5" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-2/3 bg-black/5" /><Skeleton className="h-2 w-1/3 bg-black/5" /></div></div>)}</div>}
          {summaryState === "error" && <Alert className="rounded-2xl border-black/10 bg-bg-base"><AlertTitle>Activity unavailable</AlertTitle><AlertDescription>Refresh to try loading your saved analyses again.</AlertDescription></Alert>}
          {summaryState === "ready" && summary?.recent.slice(0, 4).map((item) => {
            const badge = verdictBadge(item.verdict)
            const date = savedAt(item.created_at)
            return <button type="button" className="flex w-full items-center gap-3 border-b border-black/5 py-3 text-left transition hover:translate-x-0.5 focus-visible:rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 last:border-0" key={item.id} onClick={() => onOpenAnalysis(item.id)} aria-label={`View analysis for ${item.name}, ${badge.label}, ${date}`}>
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-black/5"><FileText size={15} /></span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="mt-0.5 text-[11px] text-zinc-400">{date}</p></div>
              <Badge variant={badge.variant} className="px-2.5 py-1 text-[9px]">{badge.label}</Badge><ChevronRight className="shrink-0 text-zinc-300" size={15} />
            </button>
          })}
          {summaryState === "ready" && !summary?.recent.length && <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-black/10 bg-bg-base px-6 text-center"><div><span className="mx-auto grid size-10 place-items-center rounded-full bg-black/5"><FileText size={16} /></span><p className="mt-3 text-sm font-medium">No saved analyses yet</p><p className="mt-1 text-xs leading-5 text-zinc-400">Your first completed check will appear here.</p></div></div>}
        </div>
        <Separator className="my-4" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Button variant="outline" onClick={onOpenDocuments}>Saved documents <ArrowRight size={14} /></Button>
          <Button variant="outline" onClick={onOpenPipeline} disabled={!traceEvents.length}>Latest run trace <Activity size={14} /></Button>
        </div>
      </>}
    </div>
  </Card>
}
