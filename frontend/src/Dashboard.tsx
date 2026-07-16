import { Activity, FileText, LayoutDashboard, LogOut, Plus, ShieldCheck } from "lucide-react"
import { useEffect, useState } from "react"

import { useAuth } from "@/AuthContext"
import { BrandMark } from "@/components/BrandMark"
import { UploadCard } from "@/components/UploadCard"
import { Button } from "@/components/ui/button"
import { fetchAgentStatus, fetchDashboardSummary, type AgentStatus, type DashboardSummary } from "@/lib/api"

type LoadState = "loading" | "ready" | "error"

function userInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("")
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

export function Dashboard() {
  const { user, credential, logout } = useAuth()
  const [showUpload, setShowUpload] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [summaryState, setSummaryState] = useState<LoadState>("loading")
  const [agents, setAgents] = useState<AgentStatus[]>([])
  const [agentState, setAgentState] = useState<LoadState>("loading")

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

  return (
    <div className="min-h-screen bg-bg-base text-[#1a1a1a] selection:bg-brand-green selection:text-black">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-black/5 bg-white/55 p-6 backdrop-blur-2xl lg:block">
        <a className="flex items-center gap-3" href="#overview">
          <BrandMark className="size-9" />
          <span className="font-display text-xl font-medium tracking-[-.04em]">Served</span>
        </a>
        <nav className="mt-12 space-y-2 text-sm">
          <a className="flex items-center gap-3 rounded-full bg-brand-green px-4 py-2.5 font-medium" href="#overview"><LayoutDashboard size={16} /> Overview</a>
          <a className="flex items-center gap-3 rounded-full px-4 py-2.5 text-zinc-500 transition hover:bg-black/5 hover:text-black" href="#history"><FileText size={16} /> Documents</a>
          <a className="flex items-center gap-3 rounded-full px-4 py-2.5 text-zinc-500 transition hover:bg-black/5 hover:text-black" href="#agents"><Activity size={16} /> Agent pipeline</a>
          <a className="flex items-center gap-3 rounded-full px-4 py-2.5 text-zinc-500 transition hover:bg-black/5 hover:text-black" href="#privacy"><ShieldCheck size={16} /> Privacy</a>
        </nav>
        <button type="button" onClick={logout} className="absolute bottom-6 left-6 flex items-center gap-3 rounded-full px-4 py-2.5 text-sm text-zinc-500 transition hover:bg-black/5 hover:text-black"><LogOut size={16} /> Sign out</button>
      </aside>

      <main className="lg:ml-64">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-black/5 bg-bg-base/75 px-5 py-4 backdrop-blur-2xl sm:px-8">
          <a className="flex items-center gap-2 lg:hidden" href="#overview"><BrandMark className="size-8" /><span className="font-display text-lg">Served</span></a>
          <div className="hidden lg:block"><p className="text-xs text-zinc-500">{greeting()}</p><p className="font-display text-lg tracking-[-.03em]">Evidence workspace</p></div>
          <div className="flex items-center gap-2 rounded-full border border-black/5 bg-white/60 py-1.5 pl-1.5 pr-3 text-sm backdrop-blur-xl">
            {user.picture ? <img src={user.picture} alt="" className="size-8 rounded-full object-cover" /> : <span className="grid size-8 place-items-center rounded-full bg-[#1a1a1a] text-xs text-white">{userInitials(user.name)}</span>}
            <span className="max-w-28 truncate">{user.given_name || user.name}</span>
          </div>
        </header>

        <div id="overview" className="mx-auto max-w-6xl space-y-8 px-5 py-8 sm:px-8 lg:py-12">
          <section className="flex flex-wrap items-end justify-between gap-5">
            <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">Your workspace</p><h1 className="font-display text-4xl font-medium tracking-[-.055em] sm:text-5xl">Understand before you act.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">Upload legal mail and follow the evidence trail from extraction through independent checks.</p></div>
            <Button onClick={() => setShowUpload(true)}><Plus size={17} /> Analyze a document</Button>
          </section>

          {showUpload && <section className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
            <UploadCard onAnalysisComplete={() => setRefreshKey((value) => value + 1)} />
            <div className="rounded-[28px] border border-black/10 bg-[#1a1a1a] p-6 text-white shadow-[0_20px_60px_rgba(0,0,0,.12)]">
              <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-white/45">Analysis route</p>
              <h2 className="mt-3 font-display text-2xl tracking-[-.04em]">Four checks, one evidence trail.</h2>
              <div className="mt-6 space-y-3">{agents.map((agent, index) => <div className="flex gap-3 rounded-2xl bg-white/[.06] p-3" key={agent.name}><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-green text-xs font-semibold text-black">{index + 1}</span><div><p className="text-sm font-medium capitalize">{agent.name.replaceAll("_", " ")}</p><p className="mt-1 text-xs leading-5 text-white/45">{agent.description}</p></div></div>)}</div>
            </div>
          </section>}

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map(([label, value, note], index) => <article className="rounded-[24px] border border-black/5 bg-white/55 p-5 shadow-[0_12px_40px_rgba(0,0,0,.04)] backdrop-blur-xl" key={label}><div className="mb-6 flex items-center justify-between"><p className="text-xs text-zinc-500">{label}</p><span className={`size-2 rounded-full ${index === 3 ? "bg-orange-400" : "bg-brand-green"}`} /></div><p className="font-display text-4xl tracking-[-.05em]">{summaryState === "loading" ? "—" : summaryState === "error" ? "!" : value ?? 0}</p><p className="mt-2 text-[11px] text-zinc-400">{summaryState === "error" ? "Data temporarily unavailable" : note}</p></article>)}
          </section>

          <section id="history" className="overflow-hidden rounded-[28px] border border-black/5 bg-white/55 backdrop-blur-xl">
            <div className="border-b border-black/5 px-6 py-5"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">Evidence history</p><h2 className="mt-2 font-display text-2xl tracking-[-.04em]">Recent documents</h2></div>
            <div className="divide-y divide-black/5">
              {summaryState === "loading" && <p className="px-6 py-10 text-center text-sm text-zinc-400">Loading your document history…</p>}
              {summaryState === "error" && <p className="px-6 py-10 text-center text-sm text-zinc-500">Document history is temporarily unavailable.</p>}
              {summaryState === "ready" && summary?.recent.map((item) => <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4" key={item.id}><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-black/5"><FileText size={16} /></span><div><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-zinc-400">{new Date(item.created_at).toLocaleString()}</p></div></div><span className={`rounded-full px-3 py-1 text-[11px] font-medium ${item.verdict === "verified" ? "bg-brand-green text-black" : item.verdict === "scam_indicators" ? "bg-orange-100 text-orange-800" : "bg-amber-100 text-amber-800"}`}>{item.verdict === "verified" ? "Record match" : item.verdict === "scam_indicators" ? "Warning signals" : "Cannot confirm"}</span></div>)}
              {summaryState === "ready" && !summary?.recent.length && <p className="px-6 py-10 text-center text-sm text-zinc-400">No analyses yet. Your first completed check will appear here.</p>}
            </div>
          </section>

          <section id="agents" className="rounded-[28px] bg-[#1a1a1a] p-6 text-white shadow-[0_20px_60px_rgba(0,0,0,.12)]">
            <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-white/45">System readiness</p><h2 className="mt-2 font-display text-2xl tracking-[-.04em]">Specialized analysis agents</h2><p className="mt-2 text-sm text-white/45">System availability only; each document keeps its own evidence record.</p></div><Activity className="text-brand-green" size={20} /></div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {agentState === "loading" && <p className="text-sm text-white/45">Checking agent readiness…</p>}
              {agentState === "error" && <p className="text-sm text-white/45">Agent readiness is temporarily unavailable.</p>}
              {agentState === "ready" && agents.map((agent, index) => <article className="rounded-2xl border border-white/10 bg-white/[.06] p-4" key={agent.name}><div className="flex items-center justify-between"><span className="grid size-7 place-items-center rounded-full bg-brand-green text-xs font-semibold text-black">{index + 1}</span><span className={`size-2 rounded-full ${agent.enabled && !agent.last_error ? "bg-brand-green" : "bg-orange-400"}`} /></div><p className="mt-4 text-sm font-medium capitalize">{agent.name.replaceAll("_", " ")}</p><p className="mt-2 text-xs leading-5 text-white/45">{agent.description}</p></article>)}
            </div>
          </section>

          <section id="privacy" className="flex items-start gap-4 rounded-[24px] border border-black/5 bg-brand-green p-5 text-sm"><ShieldCheck className="mt-0.5 shrink-0" size={19} /><p><strong>Privacy, stated accurately.</strong> Uploaded file bytes are processed for the analysis; the dashboard stores analysis metadata and results tied to your account.</p></section>
        </div>
      </main>
    </div>
  )
}
