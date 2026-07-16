import {
  Activity,
  ArrowDown,
  Bot,
  Braces,
  CheckCircle2,
  Clock3,
  Database,
  FileCheck2,
  FileInput,
  GitBranch,
  Gavel,
  LockKeyhole,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { AgentStatus, Analysis } from "@/lib/api"

type OrchestrationViewProps = {
  agents: AgentStatus[]
  loadState: "loading" | "ready" | "error"
  latestAnalysis?: Analysis | null
  analysisRunState?: "idle" | "running" | "complete" | "error"
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
    fallback: "Checks the extracted facts against CourtListener and the approved scam-pattern corpus.",
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

function Connector({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2 pl-[17px] sm:pl-[21px]" aria-hidden="true">
      <div className="h-8 w-px bg-gradient-to-b from-black/15 to-[#812d29]/60" />
      <ArrowDown size={14} className="text-[#812d29]" />
      <span className="text-[9px] font-semibold uppercase tracking-[.18em] text-zinc-400">{label}</span>
    </div>
  )
}

function StepShell({
  number,
  eyebrow,
  title,
  copy,
  icon: Icon,
  badge,
  children,
  index,
  reduceMotion,
  dark = false,
}: {
  number: string
  eyebrow: string
  title: string
  copy: string
  icon: typeof Activity
  badge: string
  children?: React.ReactNode
  index: number
  reduceMotion: boolean | null
  dark?: boolean
}) {
  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.45, delay: reduceMotion ? 0 : index * 0.07 }}
      className="list-none"
    >
      <Card className={dark ? "border-[#812d29] bg-[#1a1a1a] text-white shadow-[0_18px_55px_rgba(61,20,18,.18)]" : "overflow-hidden"}>
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <span className={`grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${dark ? "bg-[#812d29] text-white" : "bg-[#812d29]/10 text-[#812d29]"}`}>
              {number}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={`text-[10px] font-semibold uppercase tracking-[.2em] ${dark ? "text-white/45" : "text-zinc-500"}`}>{eyebrow}</p>
                <Badge variant={dark ? "outline" : "secondary"} className={dark ? "border-white/15 bg-white/[.06] text-white/70" : undefined}>{badge}</Badge>
              </div>
              <div className="mt-3 flex items-center gap-2.5">
                <Icon size={18} className={dark ? "text-brand-green" : "text-[#812d29]"} aria-hidden="true" />
                <h3 className="font-display text-xl font-medium tracking-[-.035em] sm:text-2xl">{title}</h3>
              </div>
              <p className={`mt-2 max-w-2xl text-sm leading-6 ${dark ? "text-white/50" : "text-zinc-500"}`}>{copy}</p>
            </div>
          </div>
          {children}
        </div>
      </Card>
    </motion.li>
  )
}

export function OrchestrationView({ agents, loadState, latestAnalysis = null, analysisRunState = "idle", onRefresh }: OrchestrationViewProps) {
  const reduceMotion = useReducedMotion()
  const expectedAgents = AGENTS.map((definition) => ({
    ...definition,
    status: agents.find((agent) => agent.name.toLowerCase() === definition.name),
  }))
  const configuredCount = expectedAgents.filter(({ status }) => status?.enabled).length
  const setupHasIssue = expectedAgents.some(({ status }) => Boolean(status?.last_error))

  return (
    <TooltipProvider delayDuration={180}>
      <section aria-labelledby="orchestration-title" className="space-y-6">
        <Card className="relative overflow-hidden border-[#812d29]/25 bg-[#782b29] text-white shadow-[0_24px_80px_rgba(75,24,23,.2)]">
          <div className="absolute -right-20 -top-28 size-72 rounded-full border border-white/10" aria-hidden="true" />
          <div className="absolute -right-6 -top-16 size-48 rounded-full border border-white/10" aria-hidden="true" />
          <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <Badge variant="outline" className="border-white/20 bg-white/[.08] text-white">Multi-agent system</Badge>
              <h1 id="orchestration-title" className="mt-5 max-w-3xl font-display text-3xl font-medium tracking-[-.055em] sm:text-5xl">
                One orchestrator. Three specialist agents.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">
                A code orchestrator moves the document through the same ordered checkpoints every time. The agents extract, investigate, and explain; fixed rules decide the verdict.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 backdrop-blur-sm">
                <p className="font-display text-2xl tracking-[-.04em]">3</p>
                <p className="text-[10px] uppercase tracking-[.16em] text-white/50">AI agents</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 backdrop-blur-sm">
                <p className="font-display text-2xl tracking-[-.04em]">1</p>
                <p className="text-[10px] uppercase tracking-[.16em] text-white/50">Code orchestrator</p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5 sm:p-6" aria-labelledby="readiness-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Activity size={17} className="text-[#812d29]" aria-hidden="true" />
                <h2 id="readiness-title" className="font-display text-2xl font-medium tracking-[-.04em]">System setup</h2>
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-500">Configuration reported by this service instance—not a live provider check or document-progress signal.</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={loadState === "ready" && configuredCount === 3 && !setupHasIssue ? "default" : "outline"}>
                {loadState === "loading" ? "Checking setup" : loadState === "error" ? "Setup status unavailable" : `${configuredCount} of 3 configured`}
              </Badge>
              {onRefresh && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="outline" className="size-10 p-0" onClick={onRefresh} aria-label="Refresh system setup">
                      <RefreshCw size={15} aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh system setup</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          {loadState === "error" && (
            <Alert className="mt-5 rounded-2xl border-orange-200 bg-orange-50/70">
              <TriangleAlert size={16} aria-hidden="true" />
              <AlertTitle>Setup status could not be checked</AlertTitle>
              <AlertDescription>The architecture remains visible below, but current service availability is unknown.</AlertDescription>
            </Alert>
          )}

          <ul className="mt-5 grid gap-3 md:grid-cols-3" aria-label="Agent system setup">
            {expectedAgents.map(({ name, number, fallback, icon: Icon, status }) => {
              const readiness = readinessFor(status, loadState)
              return (
                <li key={name} className="rounded-[22px] border border-black/[.07] bg-white/55 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="grid size-8 place-items-center rounded-full bg-[#812d29]/10 text-[10px] font-semibold text-[#812d29]">{number}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="flex items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#812d29]/50" aria-label={`${name} setup: ${readiness.label}. ${readiness.detail}`}>
                          <span className={`size-2 rounded-full ${readiness.dotClass}`} aria-hidden="true" />
                          <Badge variant={readiness.badgeVariant}>{readiness.label}</Badge>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64 bg-[#1a1a1a] text-white">{readiness.detail}</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <Icon size={16} className="text-[#812d29]" aria-hidden="true" />
                    <h3 className="text-sm font-semibold tracking-[.06em]">{name.toUpperCase()}</h3>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">{status?.description || fallback}</p>
                  <Separator className="my-3 bg-black/[.06]" />
                  <p className="flex items-center gap-1.5 text-[10px] text-zinc-400"><Clock3 size={11} aria-hidden="true" />{formatLastCheck(status?.last_run)}</p>
                </li>
              )
            })}
          </ul>
        </Card>

        <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start">
          <Card className="overflow-hidden border-black/10 bg-[#1a1a1a] text-white lg:sticky lg:top-24">
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-[#812d29]"><Braces size={18} aria-hidden="true" /></span>
                <Badge variant="outline" className="border-white/15 bg-white/[.06] text-white/70">Infrastructure</Badge>
              </div>
              <p className="mt-5 text-[10px] font-semibold uppercase tracking-[.2em] text-white/45">Code orchestrator</p>
              <h2 className="mt-2 font-display text-2xl tracking-[-.04em]">Controls the route, not the facts.</h2>
              <p className="mt-3 text-xs leading-5 text-white/50">It authenticates the request, dispatches each agent in order, applies the verdict policy, and saves the final record.</p>
            </div>
            <Separator className="bg-white/10" />
            <div className="space-y-3 p-5 text-xs text-white/55">
              <p className="flex gap-2"><LockKeyhole size={14} className="mt-0.5 shrink-0 text-brand-green" aria-hidden="true" />Checks access before processing.</p>
              <p className="flex gap-2"><GitBranch size={14} className="mt-0.5 shrink-0 text-brand-green" aria-hidden="true" />Stops or degrades safely when a dependency fails.</p>
              <p className="flex gap-2"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-brand-green" aria-hidden="true" />Keeps AI output outside the verdict decision.</p>
            </div>
            <div className="border-t border-white/10 bg-[#812d29]/30 px-5 py-4 text-[10px] font-semibold uppercase tracking-[.16em] text-white/60">
              Not a fourth AI agent
            </div>
          </Card>

          <div>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">Ordered execution</p>
                <h2 className="mt-2 font-display text-3xl font-medium tracking-[-.045em]">From sealed letter to saved explanation</h2>
              </div>
              <Badge variant="outline">Same route every time</Badge>
            </div>

            <ol aria-label="Document analysis orchestration steps">
              <StepShell number="00" eyebrow="Secure gateway" title="Authenticated intake" copy="The orchestrator accepts the chosen sample or uploaded document only after sign-in, then validates the file before dispatch." icon={LockKeyhole} badge="ORCHESTRATOR" index={0} reduceMotion={reduceMotion}>
                <div className="mt-4 flex flex-wrap gap-2 pl-0 sm:pl-13">
                  <Badge variant="outline">Identity checked</Badge>
                  <Badge variant="outline">File validated</Badge>
                  <Badge variant="outline">Size limit checked</Badge>
                </div>
              </StepShell>
              <Connector label="dispatch" />

              <StepShell number="01" eyebrow="Agent one" title="READER extracts visible facts" copy="Document type, court, case number, parties, dates, deadlines, and requested actions are transcribed without a verdict." icon={FileInput} badge="AI AGENT" index={1} reduceMotion={reduceMotion}>
                <div className="mt-4 rounded-2xl bg-black/[.035] p-4 text-xs leading-5 text-zinc-500 sm:ml-13">
                  Output: structured facts + exact visible text excerpts
                </div>
              </StepShell>
              <Connector label="facts only" />

              <StepShell number="02" eyebrow="Agent two" title="CHECKER investigates two evidence paths" copy="It receives the READER’s structured facts and reports what external and approved internal sources support. It still does not choose a verdict." icon={Search} badge="AI AGENT" index={2} reduceMotion={reduceMotion}>
                <div className="relative mt-5 grid gap-3 sm:ml-13 sm:grid-cols-2">
                  <div className="pointer-events-none absolute left-1/2 top-0 hidden h-3 w-px -translate-y-3 bg-black/10 sm:block" aria-hidden="true" />
                  <div className="rounded-2xl border border-black/[.07] bg-[#f7f7f2] p-4">
                    <div className="flex items-center justify-between gap-2"><Gavel size={16} className="text-[#812d29]" aria-hidden="true" /><Badge variant="secondary">External</Badge></div>
                    <h4 className="mt-3 text-sm font-semibold">CourtListener</h4>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">Looks for the case number, then checks whether the named parties match the public record.</p>
                  </div>
                  <div className="rounded-2xl border border-black/[.07] bg-[#f7f7f2] p-4">
                    <div className="flex items-center justify-between gap-2"><Database size={16} className="text-[#812d29]" aria-hidden="true" /><Badge variant="secondary">Versioned</Badge></div>
                    <h4 className="mt-3 text-sm font-semibold">Approved scam corpus</h4>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">Compares exact excerpts against countable patterns backed by approved official sources.</p>
                  </div>
                </div>
              </StepShell>
              <Connector label="validated findings" />

              <StepShell number="03" eyebrow="Deterministic checkpoint" title="Fixed code applies the verdict rules" copy="This is the decision boundary. No AI agent can return or override the verdict field." icon={Braces} badge="CODE · NOT AI" index={3} reduceMotion={reduceMotion} dark>
                <div className="mt-5 grid gap-2 sm:ml-13 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[.06] p-3"><p className="text-xs font-semibold text-orange-200">SCAM</p><p className="mt-1 text-[11px] leading-4 text-white/45">2+ countable scam signals</p></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[.06] p-3"><p className="text-xs font-semibold text-brand-green">VERIFIED</p><p className="mt-1 text-[11px] leading-4 text-white/45">Case found + parties match</p></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[.06] p-3"><p className="text-xs font-semibold text-white">CANNOT_CONFIRM</p><p className="mt-1 text-[11px] leading-4 text-white/45">Anything else</p></div>
                </div>
              </StepShell>
              <Connector label="decision + evidence" />

              <StepShell number="04" eyebrow="Agent three" title="EXPLAINER makes the result understandable" copy="It receives the code-decided verdict and supporting evidence, then writes a plain-language explanation with approved legal quotations." icon={Bot} badge="AI AGENT" index={4} reduceMotion={reduceMotion}>
                <div className="mt-4 flex flex-wrap gap-2 sm:ml-13">
                  <Badge variant="outline">Plain language</Badge>
                  <Badge variant="outline">Source-linked evidence</Badge>
                  <Badge variant="outline">No verdict authority</Badge>
                </div>
              </StepShell>
              <Connector label="complete record" />

              <StepShell number="05" eyebrow="Workspace" title="Save and show the dashboard result" copy="The final explanation, evidence, limitations, decision trace, and policy version are stored together for review." icon={Save} badge="ORCHESTRATOR" index={5} reduceMotion={reduceMotion}>
                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[#812d29]/15 bg-[#812d29]/[.05] p-3 text-xs text-zinc-600 sm:ml-13">
                  <FileCheck2 size={15} className="shrink-0 text-[#812d29]" aria-hidden="true" />
                  The result remains traceable back to the findings and rule that produced it.
                </div>
              </StepShell>
            </ol>
          </div>
        </div>

        <Card className="overflow-hidden" aria-labelledby="latest-run-title">
          <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">Returned analysis trace</p>
              <h2 id="latest-run-title" className="mt-2 font-display text-2xl font-medium tracking-[-.04em]">Latest document run</h2>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-500">This section reflects the most recent response received in this session. It is separate from system setup above.</p>
            </div>
            {analysisRunState === "complete" && latestAnalysis && (
              <Badge variant={verdictVariant(latestAnalysis.verdict)}>{verdictLabel(latestAnalysis.verdict)}</Badge>
            )}
          </div>
          <Separator className="bg-black/[.06]" />

          <div className="p-5 sm:p-6">
            {analysisRunState === "idle" && (
              <div className="rounded-[22px] border border-dashed border-black/10 bg-black/[.02] px-5 py-9 text-center">
                <FileCheck2 className="mx-auto text-zinc-300" size={24} aria-hidden="true" />
                <p className="mt-3 text-sm font-medium">No document trace yet</p>
                <p className="mt-1 text-xs text-zinc-500">Analyze a sample or upload a document to populate this view.</p>
              </div>
            )}

            {analysisRunState === "running" && (
              <Alert className="rounded-[22px] border-[#812d29]/15 bg-[#812d29]/[.04]">
                <Activity size={16} aria-hidden="true" />
                <AlertTitle>Analysis request submitted</AlertTitle>
                <AlertDescription className="text-zinc-500">Live stage events are not available from the current API. The completed agent checks and decision trace will appear here only after the final response returns.</AlertDescription>
              </Alert>
            )}

            {analysisRunState === "error" && (
              <Alert className="rounded-[22px] border-orange-200 bg-orange-50/70">
                <TriangleAlert size={16} aria-hidden="true" />
                <AlertTitle>The latest analysis did not complete</AlertTitle>
                <AlertDescription>No completed agent trace or code decision was returned for this attempt.</AlertDescription>
              </Alert>
            )}

            {analysisRunState === "complete" && !latestAnalysis && (
              <Alert className="rounded-[22px] border-amber-200 bg-amber-50/70">
                <TriangleAlert size={16} aria-hidden="true" />
                <AlertTitle>Completed trace unavailable</AlertTitle>
                <AlertDescription>The run completed, but no analysis response is available in this session.</AlertDescription>
              </Alert>
            )}

            {analysisRunState === "complete" && latestAnalysis && (() => {
              const returnedChecks = ["reader", "checker", "explainer"].map((key) => ({
                key,
                check: latestAnalysis.checks.find((candidate) => candidate.key.toLowerCase() === key),
              }))
              const orderedTrace = [
                { kind: "intake" as const, key: "intake", check: undefined },
                { kind: "agent" as const, ...returnedChecks[0] },
                { kind: "agent" as const, ...returnedChecks[1] },
                { kind: "decision" as const, key: "decision", check: undefined },
                { kind: "agent" as const, ...returnedChecks[2] },
                { kind: "result" as const, key: "result", check: undefined },
              ]

              return (
                <div>
                  <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="Latest completed analysis trace">
                    {orderedTrace.map((item, index) => {
                      if (item.kind === "intake") {
                        return (
                          <li key={item.key} className="relative rounded-[22px] border border-black/[.07] bg-white/60 p-4">
                            <div className="flex items-center justify-between gap-2"><span className="grid size-7 place-items-center rounded-full bg-[#812d29]/10 text-[10px] font-semibold text-[#812d29]">{index + 1}</span><span className="size-2 rounded-full bg-brand-green" aria-hidden="true" /></div>
                            <FileInput className="mt-5 text-[#812d29]" size={17} aria-hidden="true" />
                            <p className="mt-2 text-sm font-semibold">Upload received</p>
                            <p className="mt-1 min-h-10 text-xs leading-5 text-zinc-500">The authenticated request reached the analysis workflow.</p>
                            <Badge variant="default" className="mt-3">Received</Badge>
                          </li>
                        )
                      }

                      if (item.kind === "decision") {
                        return (
                          <li key={item.key} className="relative rounded-[22px] border border-[#812d29] bg-[#1a1a1a] p-4 text-white">
                            <div className="flex items-center justify-between gap-2">
                              <span className="grid size-7 place-items-center rounded-full bg-[#812d29] text-[10px] font-semibold">{index + 1}</span>
                              <Badge variant="outline" className="border-white/15 bg-white/[.06] text-[9px] text-white/70">CODE · NOT AI</Badge>
                            </div>
                            <Braces className="mt-5 text-brand-green" size={17} aria-hidden="true" />
                            <p className="mt-2 text-sm font-semibold">Verdict checkpoint</p>
                            {latestAnalysis.decision ? (
                              <>
                                <p className="mt-2 text-xs leading-5 text-white/50">{ruleLabel(latestAnalysis.decision.rule)}</p>
                                <p className="mt-3 text-[10px] text-white/35">Policy {latestAnalysis.decision.policy_version}</p>
                              </>
                            ) : (
                              <p className="mt-2 text-xs leading-5 text-white/50">No decision trace was returned.</p>
                            )}
                          </li>
                        )
                      }

                      if (item.kind === "result") {
                        return (
                          <li key={item.key} className="relative rounded-[22px] border border-black/[.07] bg-white/60 p-4">
                            <div className="flex items-center justify-between gap-2"><span className="grid size-7 place-items-center rounded-full bg-[#812d29]/10 text-[10px] font-semibold text-[#812d29]">{index + 1}</span><span className="size-2 rounded-full bg-brand-green" aria-hidden="true" /></div>
                            <FileCheck2 className="mt-5 text-[#812d29]" size={17} aria-hidden="true" />
                            <p className="mt-2 text-sm font-semibold">Result delivered</p>
                            <p className="mt-1 min-h-10 text-xs leading-5 text-zinc-500">The completed explanation and decision trace returned to this workspace.</p>
                            <Badge variant={verdictVariant(latestAnalysis.verdict)} className="mt-3">{verdictLabel(latestAnalysis.verdict)}</Badge>
                          </li>
                        )
                      }

                      const status = traceStatus(item.check?.status)
                      return (
                        <li key={item.key} className="relative rounded-[22px] border border-black/[.07] bg-white/60 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <span className="grid size-7 place-items-center rounded-full bg-[#812d29]/10 text-[10px] font-semibold text-[#812d29]">{index + 1}</span>
                            <span className={`size-2 rounded-full ${status.dotClass}`} aria-hidden="true" />
                          </div>
                          <CheckCircle2 className="mt-5 text-[#812d29]" size={17} aria-hidden="true" />
                          <p className="mt-2 text-sm font-semibold">{item.key.toUpperCase()}</p>
                          <p className="mt-1 min-h-10 text-xs leading-5 text-zinc-500">{item.check?.label || "No check was returned for this agent."}</p>
                          <Badge variant={status.badgeVariant} className="mt-3">{displayStatus(status.label)}</Badge>
                        </li>
                      )
                    })}
                  </ol>

                  {latestAnalysis.decision && (
                    <div className="mt-4 grid gap-2 rounded-[22px] border border-black/[.07] bg-black/[.025] p-4 text-xs text-zinc-500 sm:grid-cols-3">
                      <p><span className="font-medium text-zinc-800">Counted signals:</span> {latestAnalysis.decision.counted_signal_ids.length}</p>
                      <p><span className="font-medium text-zinc-800">Case found:</span> {latestAnalysis.decision.case_found ? "Yes" : "No"}</p>
                      <p><span className="font-medium text-zinc-800">Parties match:</span> {latestAnalysis.decision.parties_match ? "Yes" : "No"}</p>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </Card>
      </section>
    </TooltipProvider>
  )
}
