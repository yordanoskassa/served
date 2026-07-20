import { ChevronRight, FileText, Scale } from "lucide-react"

import { EmailEvidenceBrief } from "@/components/EmailEvidenceBrief"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { SavedAnalysisListItem } from "@/lib/api"

type LoadState = "loading" | "ready" | "error"

function verdictBadge(verdict: string | null | undefined) {
  if (verdict === "verified") return { label: "VERIFIED", className: "bg-foreground text-background" }
  if (verdict === "scam" || verdict === "scam_indicators") return { label: "SCAM", className: "bg-muted text-foreground" }
  if (verdict === "cannot_confirm") return { label: "CANNOT_CONFIRM", className: "bg-muted text-foreground" }
  return { label: "OUTCOME UNAVAILABLE", className: "bg-muted text-muted-foreground" }
}

function savedDate(value: string | null | undefined): string {
  if (!value) return "Date unavailable"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString()
}

export function ResponsePackPanel({
  items,
  loadState,
  error,
  onOpenAnalysis,
  onOpenDocuments,
}: {
  items: SavedAnalysisListItem[]
  loadState: LoadState
  error?: string | null
  onOpenAnalysis: (id: string) => void
  onOpenDocuments: () => void
}) {
  const packableItems = items.filter((item) => item.detail_available !== false)

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-black/[.08] bg-white/70 p-5">
        <h2 className="type-ui-heading">Response packet</h2>
        <p className="type-body mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
          Email a structured brief for counsel or payroll with the request details, court checks, record matches, and deadlines.
          Financial matching remains attached to each verified request.
        </p>
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-black/5 bg-background p-3 text-xs leading-5 text-zinc-500">
          <Scale size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>Open a request to review clerk-verification steps and payroll or bank matches before producing records.</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-black/[.08] bg-white/70">
        <div className="border-b border-black/5 px-5 py-4">
          <h3 className="text-sm font-semibold">Requests with a response brief</h3>
        </div>
        {loadState === "loading" && (
          <div className="space-y-3 px-6 py-6">
            {[0, 1, 2].map((item) => (
              <div className="flex items-center gap-3" key={item}>
                <Skeleton className="size-10 rounded-full bg-black/5" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/3 bg-black/5" />
                  <Skeleton className="h-2 w-1/5 bg-black/5" />
                </div>
              </div>
            ))}
          </div>
        )}
        {loadState === "error" && (
          <div className="p-5">
            <Alert className="rounded-2xl border-black/10 bg-background">
              <AlertTitle>Response list unavailable</AlertTitle>
              <AlertDescription>{error ?? "We could not load your saved requests."}</AlertDescription>
            </Alert>
          </div>
        )}
        {loadState === "ready" && packableItems.length === 0 && (
          <p className="px-6 py-8 text-center text-sm text-zinc-400">
            No requests yet. Verify a financial subpoena on Overview, then return here to email the brief.
          </p>
        )}
        {loadState === "ready" && packableItems.map((item) => {
          const badge = verdictBadge(item.verdict)
          return (
            <div
              className="flex flex-col gap-3 border-b border-black/5 px-5 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between"
              key={item.id}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 text-left transition hover:opacity-80"
                onClick={() => onOpenAnalysis(item.id)}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-black/5">
                  <FileText size={15} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="truncate text-[11px] text-zinc-400">{savedDate(item.created_at)}</p>
                </div>
                <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium sm:inline ${badge.className}`}>
                  {badge.label}
                </span>
                <ChevronRight className="hidden shrink-0 text-zinc-300 sm:block" size={16} />
              </button>
              <div className="flex flex-wrap items-center gap-2 pl-12 sm:pl-0">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium sm:hidden ${badge.className}`}>{badge.label}</span>
                <EmailEvidenceBrief analysisId={item.id} documentName={item.name} compact />
                <Button variant="outline" className="h-9 px-3 text-xs" onClick={() => onOpenAnalysis(item.id)}>
                  Open request
                </Button>
              </div>
            </div>
          )
        })}
        {loadState === "ready" && items.length > packableItems.length && (
          <p className="border-t border-black/5 px-5 py-3 text-[11px] text-zinc-400">
            Some earlier requests lack a full brief. Re-upload the document to regenerate payroll and bank context.
          </p>
        )}
        {loadState === "ready" && packableItems.length > 0 && (
          <div className="border-t border-black/5 p-5 text-center">
            <Button variant="outline" onClick={onOpenDocuments}>
              All saved requests
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
