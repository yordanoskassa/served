import { Activity, FileText, LayoutDashboard, LogOut, Plus, ShieldCheck } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useAuth } from "@/AuthContext"
import { BrandMark } from "@/components/BrandMark"
import { UploadCard } from "@/components/UploadCard"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { fetchAgentStatus, fetchDashboardSummary, type AgentStatus, type DashboardSummary } from "@/lib/api"
import type { EntryIntent } from "@/lib/entry"

type LoadState = "loading" | "ready" | "error"
const AGENT_ORDER = ["reader", "checker", "explainer"] as const

function userInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("")
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function isScamVerdict(verdict: string): boolean {
  return verdict === "scam" || verdict === "scam_indicators"
}

export function Dashboard({ initialIntent = null, onIntentConsumed }: {
  initialIntent?: EntryIntent | null
  onIntentConsumed?: () => void
}) {
  const { user, credential, logout } = useAuth()
  const [launchIntent] = useState(initialIntent)
  const [showUpload, setShowUpload] = useState(Boolean(launchIntent))
  const [refreshKey, setRefreshKey] = useState(0)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [summaryState, setSummaryState] = useState<LoadState>("loading")
  const [agents, setAgents] = useState<AgentStatus[]>([])
  const [agentState, setAgentState] = useState<LoadState>("loading")
  const [activeTab, setActiveTab] = useState("overview")
  const intentConsumed = useRef(false)

  useEffect(() => {
    if (!launchIntent || intentConsumed.current) return
    intentConsumed.current = true
    onIntentConsumed?.()
  }, [launchIntent, onIntentConsumed])

  useEffect(() => {
    if (!credential) return
    setSummaryState("loading")
    setAgentState("loading")
    void fetchDashboardSummary(credential)
      .then((data) => { setSummary(data); setSummaryState("ready") })
      .catch(() => setSummaryState("error"))
    void fetchAgentStatus()
      .then((response) => { setAgents(response.agents); setAgentState("ready") })
      .catch(() => setAgentState("error"))
  }, [credential, refreshKey])

  if (!user) return null

  const counts = summary?.counts
  const metrics = [
    ["Documents checked", counts?.documents, "Saved analyses"],
    ["Evidence supported", counts?.verified, "Court-record matches"],
    ["Need review", counts?.review, "Human review suggested"],
    ["Warning signals", counts?.scam, "Handle with care"],
  ] as const
  const orderedAgents = AGENT_ORDER
    .map((name) => agents.find((agent) => agent.name === name))
    .filter((agent): agent is AgentStatus => Boolean(agent))

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-screen bg-bg-base text-[#1a1a1a] selection:bg-brand-green selection:text-black">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-black/5 bg-white/55 p-6 backdrop-blur-2xl lg:block">
        <button type="button" className="flex items-center gap-3" onClick={() => setActiveTab("overview")}>
          <BrandMark className="size-9" />
          <span className="font-display text-xl font-medium tracking-[-.04em]">Served</span>
        </button>
        <TabsList className="mt-12 flex h-auto w-full flex-col items-stretch gap-2 bg-transparent p-0 text-sm">
          <TabsTrigger value="overview" className="justify-start gap-3 rounded-full px-4 py-2.5 text-zinc-500 data-[state=active]:bg-brand-soft data-[state=active]:text-black data-[state=active]:shadow-none"><LayoutDashboard size={16} /> Overview</TabsTrigger>
          <TabsTrigger value="documents" className="justify-start gap-3 rounded-full px-4 py-2.5 text-zinc-500 data-[state=active]:bg-brand-soft data-[state=active]:text-black data-[state=active]:shadow-none"><FileText size={16} /> Documents</TabsTrigger>
          <TabsTrigger value="agents" className="justify-start gap-3 rounded-full px-4 py-2.5 text-zinc-500 data-[state=active]:bg-brand-soft data-[state=active]:text-black data-[state=active]:shadow-none"><Activity size={16} /> Three-agent pipeline</TabsTrigger>
          <TabsTrigger value="privacy" className="justify-start gap-3 rounded-full px-4 py-2.5 text-zinc-500 data-[state=active]:bg-brand-soft data-[state=active]:text-black data-[state=active]:shadow-none"><ShieldCheck size={16} /> Privacy</TabsTrigger>
        </TabsList>
        <button type="button" onClick={logout} className="absolute bottom-6 left-6 flex items-center gap-3 rounded-full px-4 py-2.5 text-sm text-zinc-500 transition hover:bg-black/5 hover:text-black"><LogOut size={16} /> Sign out</button>
      </aside>

      <main className="lg:ml-64">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-black/5 bg-bg-base/75 px-5 py-4 backdrop-blur-2xl sm:px-8">
          <button type="button" className="flex items-center gap-2 lg:hidden" onClick={() => setActiveTab("overview")}><BrandMark className="size-8" /><span className="font-display text-lg">Served</span></button>
          <div className="hidden lg:block"><p className="text-xs text-zinc-500">{greeting()}</p><p className="font-display text-lg tracking-[-.03em]">Evidence workspace</p></div>
          <div className="flex items-center gap-2 rounded-full border border-black/5 bg-white/60 py-1.5 pl-1.5 pr-3 text-sm backdrop-blur-xl">
            <Avatar className="size-8"><AvatarImage src={user.picture ?? undefined} alt={user.name} /><AvatarFallback className="bg-[#1a1a1a] text-xs text-white">{userInitials(user.name)}</AvatarFallback></Avatar>
            <span className="max-w-28 truncate">{user.given_name || user.name}</span>
          </div>
        </header>

        <TabsList className="mx-5 mt-4 grid h-auto grid-cols-4 rounded-full bg-black/5 p-1 lg:hidden">
          <TabsTrigger value="overview" className="rounded-full px-2 py-2 text-[11px] data-[state=active]:bg-white">Overview</TabsTrigger>
          <TabsTrigger value="documents" className="rounded-full px-2 py-2 text-[11px] data-[state=active]:bg-white">Docs</TabsTrigger>
          <TabsTrigger value="agents" className="rounded-full px-2 py-2 text-[11px] data-[state=active]:bg-white">3 agents</TabsTrigger>
          <TabsTrigger value="privacy" className="rounded-full px-2 py-2 text-[11px] data-[state=active]:bg-white">Privacy</TabsTrigger>
        </TabsList>

        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-12">
          <TabsContent value="overview" className="mt-0 space-y-8">
          <section className="flex flex-wrap items-end justify-between gap-5">
            <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">Your workspace</p><h1 className="font-display text-4xl font-medium tracking-[-.055em] sm:text-5xl">Understand before you act.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">READER extracts the facts, CHECKER investigates the evidence, and EXPLAINER makes the code-decided result clear. Deterministic code—not an AI agent—sets the verdict.</p></div>
            <Button onClick={() => setShowUpload(true)}><Plus size={17} /> Analyze a document</Button>
          </section>

          {showUpload && <section className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
            <UploadCard initialSample={launchIntent && launchIntent !== "upload" ? launchIntent : undefined} onAnalysisComplete={() => setRefreshKey((value) => value + 1)} />
            <div className="rounded-[28px] border border-black/10 bg-[#1a1a1a] p-6 text-white shadow-[0_20px_60px_rgba(0,0,0,.12)]">
              <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-white/45">Analysis route</p>
              <h2 className="mt-3 font-display text-2xl tracking-[-.04em]">Three agents. One code-decided verdict.</h2>
              <p className="mt-2 text-xs leading-5 text-white/45">READER → CHECKER → deterministic code → EXPLAINER</p>
              <div className="mt-6 space-y-3">{orderedAgents.map((agent, index) => <div className="flex gap-3 rounded-2xl bg-white/[.06] p-3" key={agent.name}><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-black">{index + 1}</span><div><p className="text-sm font-medium">{agent.name.toUpperCase()}</p><p className="mt-1 text-xs leading-5 text-white/45">{agent.description}</p></div></div>)}{agentState === "ready" && orderedAgents.length !== 3 && <p className="rounded-2xl bg-white/[.06] p-3 text-xs leading-5 text-white/50">The three-agent backend status is not fully available yet.</p>}</div>
            </div>
          </section>}

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map(([label, value, note], index) => <article className="rounded-[24px] border border-black/5 bg-white/55 p-5 shadow-[0_12px_40px_rgba(0,0,0,.04)] backdrop-blur-xl" key={label}><div className="mb-6 flex items-center justify-between"><p className="text-xs text-zinc-500">{label}</p><span className={`size-2 rounded-full ${index === 3 ? "bg-orange-400" : "bg-brand-green"}`} /></div>{summaryState === "loading" ? <Skeleton className="h-10 w-14 rounded-lg bg-black/5" /> : <p className="font-display text-4xl tracking-[-.05em]">{summaryState === "error" ? "!" : value ?? 0}</p>}<p className="mt-2 text-[11px] text-zinc-400">{summaryState === "error" ? "Data temporarily unavailable" : note}</p></article>)}
          </section>

          </TabsContent>

          <TabsContent value="documents" className="mt-0"><section className="overflow-hidden rounded-[28px] border border-black/5 bg-white/55 backdrop-blur-xl">
            <div className="border-b border-black/5 px-6 py-5"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">Evidence history</p><h2 className="mt-2 font-display text-2xl tracking-[-.04em]">Recent documents</h2></div>
            <div className="divide-y divide-black/5">
              {summaryState === "loading" && <div className="space-y-3 px-6 py-6">{[0, 1, 2].map((item) => <div className="flex items-center gap-3" key={item}><Skeleton className="size-10 rounded-full bg-black/5" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-1/3 bg-black/5" /><Skeleton className="h-2 w-1/5 bg-black/5" /></div></div>)}</div>}
              {summaryState === "error" && <div className="p-5"><Alert className="rounded-2xl border-black/10 bg-white/70"><AlertTitle>History unavailable</AlertTitle><AlertDescription>We could not load your saved analyses right now.</AlertDescription></Alert></div>}
              {summaryState === "ready" && summary?.recent.map((item) => <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4" key={item.id}><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-black/5"><FileText size={16} /></span><div><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-zinc-400">{new Date(item.created_at).toLocaleString()}</p></div></div><span className={`rounded-full px-3 py-1 text-[11px] font-medium ${item.verdict === "verified" ? "bg-brand-soft text-black" : isScamVerdict(item.verdict) ? "bg-orange-100 text-orange-800" : "bg-amber-100 text-amber-800"}`}>{item.verdict === "verified" ? "VERIFIED" : isScamVerdict(item.verdict) ? "SCAM" : "CANNOT_CONFIRM"}</span></div>)}
              {summaryState === "ready" && !summary?.recent.length && <p className="px-6 py-10 text-center text-sm text-zinc-400">No analyses yet. Your first completed check will appear here.</p>}
            </div>
          </section></TabsContent>

          <TabsContent value="agents" className="mt-0"><section className="rounded-[28px] bg-[#1a1a1a] p-6 text-white shadow-[0_20px_60px_rgba(0,0,0,.12)]">
            <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-white/45">System readiness</p><h2 className="mt-2 font-display text-2xl tracking-[-.04em]">READER, CHECKER, EXPLAINER</h2><p className="mt-2 text-sm text-white/45">Three agents read, investigate, and explain. Deterministic code—not AI—decides every verdict.</p></div><Activity className="text-brand-green" size={20} /></div>
            <TooltipProvider><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {agentState === "loading" && <p className="text-sm text-white/45">Checking agent readiness…</p>}
              {agentState === "error" && <Alert className="border-white/10 bg-white/[.06] text-white"><AlertTitle>Readiness unavailable</AlertTitle><AlertDescription className="text-white/50">The status service could not be reached.</AlertDescription></Alert>}
              {agentState === "ready" && orderedAgents.map((agent, index) => <article className="rounded-2xl border border-white/10 bg-white/[.06] p-4" key={agent.name}><div className="flex items-center justify-between"><span className="grid size-7 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-black">{index + 1}</span><Tooltip><TooltipTrigger asChild><span tabIndex={0} className={`size-2 rounded-full ${agent.enabled && !agent.last_error ? "bg-brand-soft" : "bg-orange-400"}`} /></TooltipTrigger><TooltipContent className="bg-white text-black">{agent.enabled && !agent.last_error ? "Ready" : "Unavailable"}</TooltipContent></Tooltip></div><p className="mt-4 text-sm font-medium">{agent.name.toUpperCase()}</p><p className="mt-2 text-xs leading-5 text-white/45">{agent.description}</p></article>)}
              {agentState === "ready" && orderedAgents.length !== 3 && <Alert className="border-white/10 bg-white/[.06] text-white"><AlertTitle>Three-agent status incomplete</AlertTitle><AlertDescription className="text-white/50">The deployed backend did not return all three expected agents.</AlertDescription></Alert>}
            </div></TooltipProvider>
          </section></TabsContent>

          <TabsContent value="privacy" className="mt-0"><section className="flex items-start gap-4 rounded-[24px] border border-black/5 bg-white/55 p-5 text-sm backdrop-blur-xl"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft"><ShieldCheck size={17} /></span><p className="pt-1.5"><strong>Privacy, stated accurately.</strong> Uploaded file bytes are processed for the analysis; the dashboard stores analysis metadata and results tied to your account.</p></section></TabsContent>
        </div>
      </main>
    </Tabs>
  )
}
