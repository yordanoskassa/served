import { FileSpreadsheet, Landmark, RefreshCw, ShieldCheck } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { AgentStatus, DashboardSummary } from "@/lib/api"

type LoadState = "loading" | "ready" | "error"

function gateStatus(agents: AgentStatus[], loadState: LoadState) {
  const reader = agents.find((item) => item.name === "reader")
  const checker = agents.find((item) => item.name === "checker")
  if (loadState === "loading") return { label: "Checking", variant: "outline" as const, dot: "bg-zinc-300", detail: "Confirming letter-read and docket services." }
  if (loadState === "error") return { label: "Unavailable", variant: "warning" as const, dot: "bg-neutral-500", detail: "Could not load verification services." }
  const ready = Boolean(reader?.enabled && checker?.enabled)
  if (!ready) return { label: "Not configured", variant: "destructive" as const, dot: "bg-neutral-600", detail: "Letter checks cannot run until services are configured." }
  return {
    label: "Ready",
    variant: "default" as const,
    dot: "bg-brand-green",
    detail: "Reads the subpoena letter and checks docket + scam signals before any financial tool unlocks.",
  }
}

function plaidStatus(agent: AgentStatus | undefined, loadState: LoadState) {
  if (loadState === "loading") return { label: "Checking", variant: "outline" as const, dot: "bg-zinc-300" }
  if (loadState === "error") return { label: "Unavailable", variant: "warning" as const, dot: "bg-neutral-500" }
  if (!agent?.enabled) return { label: "Not configured", variant: "destructive" as const, dot: "bg-neutral-600" }
  if (agent.last_error) return { label: "Needs attention", variant: "warning" as const, dot: "bg-neutral-400" }
  return { label: "Ready", variant: "default" as const, dot: "bg-brand-green" }
}

export function FinancialSourcesPanel({
  agents,
  loadState,
  summary,
  summaryState,
  onRefresh,
  onOpenDocuments,
}: {
  agents: AgentStatus[]
  loadState: LoadState
  summary: DashboardSummary | null
  summaryState: LoadState
  onRefresh?: () => void
  onOpenDocuments?: () => void
}) {
  const cook = agents.find((item) => item.name === "cook")
  const gate = gateStatus(agents, loadState)
  const plaid = plaidStatus(cook, loadState)
  const verified = summary?.counts?.verified ?? 0

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-black/[.08] bg-white/70 p-5">
        <h2 className="type-ui-heading">Financial sources</h2>
        <p className="type-caption mt-1 max-w-2xl">
          Payroll and bank matching open only after a financial subpoena letter passes verification—not for scam or uncertain letters.
        </p>
        {onRefresh && (
          <Button variant="outline" className="mt-4 h-9 px-3 text-xs" onClick={onRefresh} disabled={loadState === "loading"}>
            <RefreshCw className={loadState === "loading" ? "animate-spin" : ""} size={14} /> Refresh status
          </Button>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-black/[.08] bg-white/70">
        <ul className="divide-y divide-black/5">
          <li className="flex items-start gap-3 px-5 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-black/5">
              <ShieldCheck size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">Letter verification gate</p>
                <span className={`size-2 rounded-full ${gate.dot}`} aria-hidden="true" />
                <Badge variant={gate.variant} className="text-[10px]">{gate.label}</Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-zinc-500">{gate.detail}</p>
              {summaryState === "ready" && (
                <p className="mt-2 text-[11px] text-zinc-400">
                  {verified} saved letter{verified === 1 ? "" : "s"} eligible for payroll or bank tools.
                </p>
              )}
              {summaryState === "loading" && <Skeleton className="mt-2 h-3 w-48 bg-black/5" />}
            </div>
          </li>

          <li className="flex items-start gap-3 px-5 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-black/5">
              <FileSpreadsheet size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">Payroll, wage &amp; time records</p>
                <Badge variant="secondary" className="text-[10px]">In-app matching</Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Upload or sample payroll files and review candidates against the person and dates named in a verified letter (e.g. D1).
              </p>
              {onOpenDocuments && (
                <Button variant="outline" className="mt-3 h-9 px-3 text-xs" onClick={onOpenDocuments}>
                  Open verified letters
                </Button>
              )}
            </div>
          </li>

          <li className="flex items-start gap-3 px-5 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-black/5">
              <Landmark size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">Bank payment records</p>
                <span className={`size-2 rounded-full ${plaid.dot}`} aria-hidden="true" />
                <Badge variant={plaid.variant} className="text-[10px]">{plaid.label}</Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Plaid Link runs from a verified bank-record letter—match payments to the named employee and period (D4 demo).
              </p>
              {!cook?.enabled && loadState === "ready" && (
                <Alert className="mt-3 rounded-xl border-black/10 bg-background">
                  <AlertTitle>Bank connect unavailable</AlertTitle>
                  <AlertDescription>Plaid is not configured on this backend. Payroll matching may still work on verified letters.</AlertDescription>
                </Alert>
              )}
            </div>
          </li>
        </ul>
      </section>
    </div>
  )
}
