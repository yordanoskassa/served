import { Activity, ChevronRight, FileText, LayoutDashboard, LogOut, ShieldCheck } from "lucide-react"
import { lazy, Suspense, useEffect, useRef, useState } from "react"

import { useAuth } from "@/AuthContext"
import { AnalysisDetail } from "@/components/AnalysisDetail"
import { BrandMark } from "@/components/BrandMark"
import { UploadCard, type AnalysisRunState } from "@/components/UploadCard"
import { WorkspaceActivity } from "@/components/WorkspaceActivity"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchAgentStatus, fetchDashboardSummary, fetchSavedAnalyses, fetchSavedAnalysis, type AgentStatus, type Analysis, type DashboardSummary, type SavedAnalysisDetail, type SavedAnalysisListItem, type TraceEvent } from "@/lib/api"
import type { EntryIntent } from "@/lib/entry"

type LoadState = "loading" | "ready" | "error"
type DetailLoadState = "idle" | LoadState
const AGENT_ORDER = ["reader", "checker", "explainer"] as const
const HISTORY_PAGE_SIZE = 25
const OrchestrationView = lazy(() => import("@/components/OrchestrationView").then((module) => ({ default: module.OrchestrationView })))

function userInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("")
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function isScamVerdict(verdict: string | null | undefined): boolean {
  return verdict === "scam" || verdict === "scam_indicators"
}

function savedVerdictLabel(verdict: string | null | undefined): string {
  if (verdict === "verified") return "VERIFIED"
  if (isScamVerdict(verdict)) return "SCAM"
  if (verdict === "cannot_confirm") return "CANNOT_CONFIRM"
  return "OUTCOME UNAVAILABLE"
}

function savedVerdictClass(verdict: string | null | undefined): string {
  if (verdict === "verified") return "bg-brand-soft text-black"
  if (isScamVerdict(verdict)) return "bg-orange-100 text-orange-800"
  if (verdict === "cannot_confirm") return "bg-amber-100 text-amber-800"
  return "bg-zinc-100 text-zinc-600"
}

function savedDate(value: string | null | undefined): string {
  if (!value) return "Date unavailable"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString()
}

export function Dashboard({ initialIntent = null, onIntentConsumed }: {
  initialIntent?: EntryIntent | null
  onIntentConsumed?: () => void
}) {
  const { user, credential, logout } = useAuth()
  const [launchIntent] = useState(initialIntent)
  const [refreshKey, setRefreshKey] = useState(0)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [summaryState, setSummaryState] = useState<LoadState>("loading")
  const [agents, setAgents] = useState<AgentStatus[]>([])
  const [agentState, setAgentState] = useState<LoadState>("loading")
  const [latestAnalysis, setLatestAnalysis] = useState<Analysis | null>(null)
  const [analysisRunState, setAnalysisRunState] = useState<AnalysisRunState>("idle")
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([])
  const [activeTab, setActiveTab] = useState("overview")
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null)
  const [savedDetail, setSavedDetail] = useState<SavedAnalysisDetail | null>(null)
  const [savedDetailState, setSavedDetailState] = useState<DetailLoadState>("idle")
  const [savedDetailError, setSavedDetailError] = useState<string | null>(null)
  const [historyItems, setHistoryItems] = useState<SavedAnalysisListItem[]>([])
  const [historyState, setHistoryState] = useState<LoadState>("loading")
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const intentConsumed = useRef(false)
  const pipelineFocusPending = useRef(false)
  const savedDetailController = useRef<AbortController | null>(null)
  const workspaceController = useRef<AbortController | null>(null)
  const historyController = useRef<AbortController | null>(null)
  const savedDetailRegion = useRef<HTMLElement | null>(null)
  const savedRowRefs = useRef(new Map<string, HTMLButtonElement>())
  const returnFocusId = useRef<string | null>(null)

  useEffect(() => {
    if (!launchIntent || intentConsumed.current) return
    intentConsumed.current = true
    onIntentConsumed?.()
  }, [launchIntent, onIntentConsumed])

  useEffect(() => {
    workspaceController.current?.abort()
    setSummary(null)
    setAgents([])
    if (!credential) {
      setSummaryState("loading")
      setAgentState("loading")
      return
    }
    const controller = new AbortController()
    workspaceController.current = controller
    setSummaryState("loading")
    setAgentState("loading")
    void fetchDashboardSummary(credential, controller.signal)
      .then((data) => {
        if (workspaceController.current !== controller) return
        setSummary(data)
        setSummaryState("ready")
      })
      .catch(() => {
        if (!controller.signal.aborted && workspaceController.current === controller) setSummaryState("error")
      })
    void fetchAgentStatus(controller.signal)
      .then((response) => {
        if (workspaceController.current !== controller) return
        setAgents(response.agents)
        setAgentState("ready")
      })
      .catch(() => {
        if (!controller.signal.aborted && workspaceController.current === controller) setAgentState("error")
      })
    return () => controller.abort()
  }, [credential, refreshKey])

  useEffect(() => {
    historyController.current?.abort()
    setHistoryItems([])
    setHistoryHasMore(false)
    setHistoryLoadingMore(false)
    setHistoryError(null)
    if (!credential) {
      setHistoryState("loading")
      return
    }
    const controller = new AbortController()
    historyController.current = controller
    setHistoryState("loading")
    void fetchSavedAnalyses(credential, 0, HISTORY_PAGE_SIZE, controller.signal)
      .then((page) => {
        if (historyController.current !== controller) return
        setHistoryItems(page.items)
        setHistoryHasMore(page.has_more)
        setHistoryState("ready")
      })
      .catch((cause) => {
        if (controller.signal.aborted || historyController.current !== controller) return
        setHistoryError(cause instanceof Error ? cause.message : "Unable to load saved analyses.")
        setHistoryState("error")
      })
    return () => controller.abort()
  }, [credential, refreshKey])

  useEffect(() => () => savedDetailController.current?.abort(), [])
  useEffect(() => () => historyController.current?.abort(), [])

  useEffect(() => {
    savedDetailController.current?.abort()
    returnFocusId.current = null
    setSelectedSavedId(null)
    setSavedDetail(null)
    setSavedDetailError(null)
    setSavedDetailState("idle")
  }, [credential])

  useEffect(() => {
    if (activeTab !== "agents" || !pipelineFocusPending.current) return
    const startedAt = performance.now()
    let frame = 0
    const focusPipelineHeading = () => {
      const heading = document.getElementById("orchestration-title")
      if (heading instanceof HTMLElement) {
        heading.focus()
        pipelineFocusPending.current = false
        return
      }
      if (performance.now() - startedAt < 2_000) frame = requestAnimationFrame(focusPipelineHeading)
    }
    frame = requestAnimationFrame(focusPipelineHeading)
    return () => cancelAnimationFrame(frame)
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== "documents" || savedDetailState === "idle") return
    const frame = requestAnimationFrame(() => savedDetailRegion.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [activeTab, savedDetailState])

  if (!user) return null

  const counts = summary?.counts
  const metrics = [
    ["Saved analyses", counts?.documents, "Most recent 50 records"],
    ["Verified records", counts?.verified, "Case and parties matched"],
    ["Need review", counts?.review, "Human review suggested"],
    ["Scam warnings", counts?.scam, "Two or more grounded signals"],
  ] as const
  const orderedAgents = AGENT_ORDER
    .map((name) => agents.find((agent) => agent.name === name))
    .filter((agent): agent is AgentStatus => Boolean(agent))
  const openPipeline = () => {
    pipelineFocusPending.current = true
    setActiveTab("agents")
  }
  const closeSavedAnalysis = (restoreFocus = true) => {
    const focusId = returnFocusId.current
    returnFocusId.current = null
    savedDetailController.current?.abort()
    savedDetailController.current = null
    setSelectedSavedId(null)
    setSavedDetail(null)
    setSavedDetailError(null)
    setSavedDetailState("idle")
    if (restoreFocus && focusId) requestAnimationFrame(() => savedRowRefs.current.get(focusId)?.focus())
  }
  const openDocuments = () => {
    closeSavedAnalysis(false)
    setActiveTab("documents")
  }
  const openSavedAnalysis = async (id: string) => {
    if (!credential) return
    savedDetailController.current?.abort()
    const controller = new AbortController()
    savedDetailController.current = controller
    returnFocusId.current = id
    setActiveTab("documents")
    setSelectedSavedId(id)
    setSavedDetail(null)
    setSavedDetailError(null)
    setSavedDetailState("loading")
    try {
      const detail = await fetchSavedAnalysis(id, credential, controller.signal)
      if (savedDetailController.current !== controller) return
      setSavedDetail(detail)
      setSavedDetailState("ready")
    } catch (cause) {
      if (controller.signal.aborted || savedDetailController.current !== controller) return
      setSavedDetailError(cause instanceof Error ? cause.message : "Unable to load this saved analysis.")
      setSavedDetailState("error")
    } finally {
      if (savedDetailController.current === controller) savedDetailController.current = null
    }
  }
  const loadMoreHistory = async () => {
    if (!credential || !historyHasMore || historyLoadingMore) return
    historyController.current?.abort()
    const controller = new AbortController()
    historyController.current = controller
    setHistoryLoadingMore(true)
    setHistoryError(null)
    try {
      const page = await fetchSavedAnalyses(
        credential,
        historyItems.length,
        HISTORY_PAGE_SIZE,
        controller.signal,
      )
      if (historyController.current !== controller) return
      setHistoryItems((current) => {
        const existing = new Set(current.map((item) => item.id))
        return [...current, ...page.items.filter((item) => !existing.has(item.id))]
      })
      setHistoryHasMore(page.has_more)
    } catch (cause) {
      if (controller.signal.aborted || historyController.current !== controller) return
      setHistoryError(cause instanceof Error ? cause.message : "Unable to load more saved analyses.")
    } finally {
      if (historyController.current === controller) {
        historyController.current = null
        setHistoryLoadingMore(false)
      }
    }
  }
  const handleTabChange = (value: string) => {
    if (value === "documents" && activeTab !== "documents") closeSavedAnalysis(false)
    setActiveTab(value)
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="min-h-screen bg-bg-base text-[#1a1a1a] selection:bg-brand-green selection:text-black">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-black/5 bg-white/55 p-6 backdrop-blur-2xl lg:block">
        <button type="button" className="flex items-center gap-3" onClick={() => setActiveTab("overview")}>
          <BrandMark className="size-9" />
          <span className="font-display text-xl font-medium tracking-[-.04em]">Served</span>
        </button>
        <TabsList className="mt-12 flex h-auto w-full flex-col items-stretch gap-2 bg-transparent p-0 text-sm">
          <TabsTrigger value="overview" className="justify-start gap-3 rounded-full px-4 py-2.5 text-zinc-500 data-[state=active]:bg-brand-soft data-[state=active]:text-black data-[state=active]:shadow-none"><LayoutDashboard size={16} /> Overview</TabsTrigger>
          <TabsTrigger value="documents" className="justify-start gap-3 rounded-full px-4 py-2.5 text-zinc-500 data-[state=active]:bg-brand-soft data-[state=active]:text-black data-[state=active]:shadow-none"><FileText size={16} /> Documents</TabsTrigger>
          <TabsTrigger value="agents" className="justify-start gap-3 rounded-full px-4 py-2.5 text-zinc-500 data-[state=active]:bg-brand-soft data-[state=active]:text-black data-[state=active]:shadow-none"><Activity size={16} /> Agent pipeline</TabsTrigger>
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

        <TabsList className="mx-5 mt-4 grid h-auto grid-cols-2 rounded-[22px] bg-black/5 p-1 sm:grid-cols-4 sm:rounded-full lg:hidden">
          <TabsTrigger value="overview" className="rounded-full px-2 py-2 text-[11px] data-[state=active]:bg-white">Overview</TabsTrigger>
          <TabsTrigger value="documents" className="rounded-full px-2 py-2 text-[11px] data-[state=active]:bg-white">Docs</TabsTrigger>
          <TabsTrigger value="agents" className="rounded-full px-2 py-2 text-[11px] data-[state=active]:bg-white">Pipeline</TabsTrigger>
          <TabsTrigger value="privacy" className="rounded-full px-2 py-2 text-[11px] data-[state=active]:bg-white">Privacy</TabsTrigger>
        </TabsList>

        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-12">
          <TabsContent forceMount value="overview" className="mt-0 space-y-8 data-[state=inactive]:hidden">
          <section className="flex flex-wrap items-end justify-between gap-5">
            <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">Your workspace</p><h1 className="font-display text-4xl font-medium tracking-[-.055em] sm:text-5xl">Understand before you act.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">Upload a photo or PDF to extract the letter’s details, check available records, and review the supporting evidence.</p></div>
            <Button variant="outline" onClick={openDocuments}><FileText size={16} /> Saved documents</Button>
          </section>

          <section className={`grid gap-5 ${latestAnalysis ? "" : "lg:grid-cols-[1.15fr_.85fr]"}`}>
            <UploadCard
              initialSample={launchIntent && launchIntent !== "upload" ? launchIntent : undefined}
              onAnalysisComplete={(analysis) => {
                setLatestAnalysis(analysis)
                setRefreshKey((value) => value + 1)
              }}
              onAnalysisStateChange={(state) => {
                setAnalysisRunState(state)
                if (state === "running") {
                  setLatestAnalysis(null)
                  setTraceEvents([])
                }
              }}
              onTraceEvent={(event) => {
                setTraceEvents((current) => {
                  const sameRun = current.length === 0 || current[0].run_id === event.run_id
                  const base = sameRun ? current : []
                  return [...base.filter((item) => item.seq !== event.seq), event]
                    .sort((left, right) => left.seq - right.seq)
                })
              }}
              onViewPipeline={openPipeline}
              onReset={() => {
                setLatestAnalysis(null)
                setAnalysisRunState("idle")
                setTraceEvents([])
              }}
            />
            {!latestAnalysis && <WorkspaceActivity
              summary={summary}
              summaryState={summaryState}
              runState={analysisRunState}
              traceEvents={traceEvents}
              onRefresh={() => setRefreshKey((value) => value + 1)}
              onOpenDocuments={openDocuments}
              onOpenAnalysis={(id) => { void openSavedAnalysis(id) }}
              onOpenPipeline={openPipeline}
            />}
          </section>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map(([label, value, note], index) => <article className="rounded-[24px] border border-black/5 bg-white/55 p-5 shadow-[0_12px_40px_rgba(0,0,0,.04)] backdrop-blur-xl" key={label}><div className="mb-6 flex items-center justify-between"><p className="text-xs text-zinc-500">{label}</p><span className={`size-2 rounded-full ${index === 3 ? "bg-orange-400" : "bg-brand-green"}`} /></div>{summaryState === "loading" ? <Skeleton className="h-10 w-14 rounded-lg bg-black/5" /> : <p className="font-display text-4xl tracking-[-.05em]">{summaryState === "error" ? "!" : value ?? 0}</p>}<p className="mt-2 text-[11px] text-zinc-400">{summaryState === "error" ? "Data temporarily unavailable" : note}</p></article>)}
          </section>

          </TabsContent>

          <TabsContent value="documents" className="mt-0">
            {savedDetailState === "idle" ? <section className="overflow-hidden rounded-[28px] border border-black/5 bg-white/55 backdrop-blur-xl">
              <div className="border-b border-black/5 px-6 py-5"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">Evidence history</p><h2 className="mt-2 font-display text-2xl tracking-[-.04em]">Saved documents</h2><p className="mt-2 text-xs text-zinc-400">Newest first. Choose a document to reopen its saved analysis.</p></div>
              <div className="divide-y divide-black/5">
                {historyState === "loading" && <div className="space-y-3 px-6 py-6">{[0, 1, 2].map((item) => <div className="flex items-center gap-3" key={item}><Skeleton className="size-10 rounded-full bg-black/5" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-1/3 bg-black/5" /><Skeleton className="h-2 w-1/5 bg-black/5" /></div></div>)}</div>}
                {historyState === "error" && <div className="p-5"><Alert className="rounded-2xl border-black/10 bg-white/70"><AlertTitle>History unavailable</AlertTitle><AlertDescription className="space-y-4"><p>{historyError ?? "We could not load your saved analyses right now."}</p><Button variant="outline" onClick={() => setRefreshKey((value) => value + 1)}>Try again</Button></AlertDescription></Alert></div>}
                {historyState === "ready" && historyItems.map((item) => {
                  const verdict = savedVerdictLabel(item.verdict)
                  const date = savedDate(item.created_at)
                  return <button type="button" ref={(node) => { if (node) savedRowRefs.current.set(item.id, node); else savedRowRefs.current.delete(item.id) }} className="flex w-full flex-wrap items-center justify-between gap-3 px-6 py-4 text-left transition hover:bg-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 focus-visible:ring-inset" key={item.id} onClick={() => { void openSavedAnalysis(item.id) }} aria-label={`View analysis for ${item.name}, ${verdict}, ${date}`}><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-black/5"><FileText size={16} /></span><div className="min-w-0"><p className="truncate text-sm font-medium">{item.name}</p><p className="text-xs text-zinc-400">{date}</p></div></div><div className="flex items-center gap-2">{item.detail_available === false && <span className="hidden text-[10px] text-zinc-400 sm:inline">Summary only</span>}<span className={`rounded-full px-3 py-1 text-[11px] font-medium ${savedVerdictClass(item.verdict)}`}>{verdict}</span><ChevronRight className="text-zinc-300" size={17} /></div></button>
                })}
                {historyState === "ready" && !historyItems.length && <p className="px-6 py-10 text-center text-sm text-zinc-400">No analyses yet. Your first completed check will appear here.</p>}
              </div>
              {historyState === "ready" && historyError && <div className="border-t border-black/5 p-5"><Alert className="rounded-2xl border-black/10 bg-bg-base"><AlertTitle>Could not load more</AlertTitle><AlertDescription>{historyError}</AlertDescription></Alert></div>}
              {historyState === "ready" && historyHasMore && <div className="border-t border-black/5 p-5 text-center"><Button variant="outline" disabled={historyLoadingMore} onClick={() => { void loadMoreHistory() }}>{historyLoadingMore ? "Loading more…" : "Load more documents"}</Button></div>}
            </section> : <section ref={savedDetailRegion} tabIndex={-1} aria-label="Saved analysis detail" aria-busy={savedDetailState === "loading"} className="space-y-4 outline-none">
              {savedDetailState === "loading" && <><p role="status" className="sr-only">Loading saved analysis</p><Button variant="outline" onClick={() => closeSavedAnalysis()}>← Back to documents</Button><div className="space-y-4 rounded-[28px] border border-black/5 bg-white/55 p-7"><Skeleton className="h-5 w-28 bg-black/5" /><Skeleton className="h-9 w-1/2 bg-black/5" /><Skeleton className="h-20 w-full bg-black/5" /><Skeleton className="h-52 w-full bg-black/5" /></div></>}
              {savedDetailState === "error" && <><Button variant="outline" onClick={() => closeSavedAnalysis()}>← Back to documents</Button><Alert className="rounded-[24px] border-black/10 bg-white/70"><AlertTitle>Analysis unavailable</AlertTitle><AlertDescription className="space-y-4"><p>{savedDetailError ?? "We could not load this saved analysis."}</p>{selectedSavedId && <Button variant="outline" onClick={() => { void openSavedAnalysis(selectedSavedId) }}>Try again</Button>}</AlertDescription></Alert></>}
              {savedDetailState === "ready" && savedDetail?.analysis && <AnalysisDetail analysis={savedDetail.analysis} documentName={savedDetail.name} createdAt={savedDetail.created_at} backLabel="Back to documents" onBack={() => closeSavedAnalysis()} />}
              {savedDetailState === "ready" && savedDetail && !savedDetail.analysis && <><Button variant="outline" onClick={() => closeSavedAnalysis()}>← Back to documents</Button><section className="rounded-[28px] border border-black/5 bg-white/60 p-7"><span className={`rounded-full px-3 py-1 text-[11px] font-medium ${savedVerdictClass(savedDetail.verdict)}`}>{savedVerdictLabel(savedDetail.verdict)}</span><h2 className="mt-5 font-display text-2xl tracking-[-.04em]">{savedDetail.name}</h2><p className="mt-1 text-xs text-zinc-400">{savedDate(savedDetail.created_at)}</p><Alert className="mt-6 rounded-2xl border-black/10 bg-bg-base"><AlertTitle>Earlier analysis</AlertTitle><AlertDescription>The full breakdown was not saved for this earlier analysis. Because Served does not retain uploaded file bytes, upload the document again to create a complete saved breakdown.</AlertDescription></Alert></section></>}
            </section>}
          </TabsContent>

          <TabsContent value="agents" className="mt-0"><Suspense fallback={<div className="space-y-4"><Skeleton className="h-52 w-full rounded-[28px] bg-black/5" /><Skeleton className="h-80 w-full rounded-[28px] bg-black/5" /></div>}><OrchestrationView agents={orderedAgents} loadState={agentState} latestAnalysis={latestAnalysis} analysisRunState={analysisRunState} traceEvents={traceEvents} onRefresh={() => setRefreshKey((value) => value + 1)} /></Suspense></TabsContent>

          <TabsContent value="privacy" className="mt-0"><section className="flex items-start gap-4 rounded-[24px] border border-black/5 bg-white/55 p-5 text-sm backdrop-blur-xl"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft"><ShieldCheck size={17} /></span><p className="pt-1.5"><strong>Privacy, stated accurately.</strong> Uploaded file bytes are processed for the analysis. Your workspace saves the structured result—including extracted facts, evidence, the code decision, and run trace—plus document metadata tied to your account. It does not retain the uploaded file bytes.</p></section></TabsContent>
        </div>
      </main>
    </Tabs>
  )
}
