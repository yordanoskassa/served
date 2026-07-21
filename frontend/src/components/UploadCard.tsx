import { AlertTriangle, Camera, FileImage, Landmark, ShieldCheck, Zap } from "lucide-react"
import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { useEffect, useRef, useState } from "react"

import { AnalysisDetail } from "@/components/AnalysisDetail"
import { LiveActivityLog } from "@/components/AnalysisPipeline"
import { SAMPLE_TIPS_KEY } from "@/components/SettingsPanel"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { type Analysis, type TraceEvent, analyzeDocumentStream, analyzeSampleStream, loadSampleDocument } from "@/lib/api"
import { useAuth } from "@/AuthContext"

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function holdSampleScan(startedAt: number, signal: AbortSignal): Promise<void> {
  const remaining = Math.max(0, 4200 - (Date.now() - startedAt))
  if (!remaining || signal.aborted) return
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, remaining)
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}

export type AnalysisRunState = "idle" | "running" | "complete" | "error"

function DocumentScan({ file, events }: { file?: File; events: TraceEvent[] }) {
  const [previewUrl, setPreviewUrl] = useState<string>()
  const [pdfReady, setPdfReady] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latest = events[events.length - 1]

  useEffect(() => {
    if (!file) {
      setPreviewUrl(undefined)
      return
    }
    const nextUrl = URL.createObjectURL(file)
    setPreviewUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [file])

  useEffect(() => {
    if (!file || file.type !== "application/pdf") {
      setPdfReady(false)
      return
    }
    let cancelled = false
    let loadingTask: PDFDocumentLoadingTask | null = null
    let renderTask: RenderTask | null = null
    setPdfReady(false)
    void file.arrayBuffer().then(async (data) => {
      const pdfjs = await import("pdfjs-dist")
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
      loadingTask = pdfjs.getDocument({ data })
      const pdf = await loadingTask.promise
      const page = await pdf.getPage(1)
      const natural = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: 960 / natural.width })
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      const context = canvas.getContext("2d", { alpha: false })
      if (!context) return
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      renderTask = page.render({ canvas, canvasContext: context, viewport })
      await renderTask.promise
      if (!cancelled) setPdfReady(true)
    }).catch(() => {
      if (!cancelled) setPdfReady(false)
    })
    return () => {
      cancelled = true
      renderTask?.cancel()
      void loadingTask?.destroy()
    }
  }, [file])

  return <section className="grid overflow-hidden rounded-2xl border border-black/[.08] bg-[#111] shadow-[0_24px_70px_rgba(0,0,0,.16)] lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,.75fr)]" aria-label="Scanning uploaded request">
    <div className="border-b border-white/10 lg:border-r lg:border-b-0">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
        <div className="min-w-0"><p className="truncate text-xs font-medium">{file?.name || "Preparing request preview"}</p><p className="mt-0.5 text-[9px] uppercase tracking-[.16em] text-white/35">Secure document scan</p></div>
        <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-[.14em] text-[#b7ff4a]"><span className="size-1.5 animate-pulse rounded-full bg-[#b7ff4a] motion-reduce:animate-none" />Reading</span>
      </div>
      <div className="relative h-[min(62vh,660px)] min-h-[420px] overflow-hidden bg-[#d9d6cf]">
        {file?.type === "application/pdf" && <canvas ref={canvasRef} aria-label={`Preview of ${file.name}`} className={`absolute inset-x-0 top-0 h-auto w-full bg-white transition-opacity duration-300 ${pdfReady ? "opacity-100" : "opacity-0"}`} />}
        {previewUrl && file && file.type !== "application/pdf" && <img alt={`Preview of ${file.name}`} className="absolute inset-0 size-full object-contain" src={previewUrl} />}
        {(!previewUrl || (file?.type === "application/pdf" && !pdfReady)) && <div className="absolute inset-0 grid place-items-center text-sm text-black/45">Rendering document…</div>}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/15" />
        <div className="served-scan-line pointer-events-none absolute inset-x-0 top-0 z-10 h-[2px] bg-[#b7ff4a] shadow-[0_0_14px_4px_rgba(183,255,74,.72)] motion-reduce:top-1/2" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-4 pb-4 pt-12 text-white" aria-live="polite">
          <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-[#b7ff4a]">Now processing</p>
          <p className="mt-1 text-sm font-medium">{latest?.label || "Opening the reviewed request"}</p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-white/55">{latest?.output_summary || latest?.detail || "The request stays visible while Served reads and verifies it."}</p>
        </div>
      </div>
    </div>
    <LiveActivityLog events={events} />
  </section>
}

export function UploadCard({ onAnalysisComplete, onAnalysisStateChange, onTraceEvent, onReset, onSignInRequired, initialSample, traceEvents = [] }: {
  onAnalysisComplete?: (analysis: Analysis) => void
  onAnalysisStateChange?: (state: AnalysisRunState) => void
  onTraceEvent?: (event: TraceEvent) => void
  onReset?: () => void
  onSignInRequired?: () => void
  initialSample?: "D1" | "D2" | "D3" | "D4"
  traceEvents?: TraceEvent[]
}) {
  const { credential } = useAuth()
  const input = useRef<HTMLInputElement>(null)
  const analysisController = useRef<AbortController | null>(null)
  const [file, setFile] = useState<File>()
  const [selectedSample, setSelectedSample] = useState<"D1" | "D2" | "D3" | "D4">()
  const [analysis, setAnalysis] = useState<Analysis>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [showSampleTips, setShowSampleTips] = useState(() => {
    if (typeof window === "undefined") return true
    return localStorage.getItem(SAMPLE_TIPS_KEY) !== "off"
  })

  useEffect(() => {
    const sync = () => setShowSampleTips(localStorage.getItem(SAMPLE_TIPS_KEY) !== "off")
    window.addEventListener("served-prefs", sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener("served-prefs", sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  useEffect(() => () => analysisController.current?.abort(), [])

  useEffect(() => {
    if (!initialSample) return
    void useSample(initialSample)
    return () => analysisController.current?.abort()
    // The landing-page intent should start exactly once for that selected sample.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSample])

  async function submit() {
    if (!file) return input.current?.click()
    if (!credential) {
      setError("Sign in again before analyzing this request.")
      onAnalysisStateChange?.("error")
      return
    }
    setLoading(true)
    setError(undefined)
    onAnalysisStateChange?.("running")
    analysisController.current?.abort()
    const controller = new AbortController()
    analysisController.current = controller
    try {
      const result = await analyzeDocumentStream(
        file,
        credential,
        onTraceEvent,
        controller.signal,
        selectedSample,
      )
      setAnalysis(result)
      onAnalysisComplete?.(result)
      onAnalysisStateChange?.("complete")
    }
    catch (cause) {
      if (controller.signal.aborted) return
      setError(cause instanceof Error ? cause.message : "Analysis failed.")
      onAnalysisStateChange?.("error")
    }
    finally {
      if (analysisController.current === controller) analysisController.current = null
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  async function useSample(sample: "D1" | "D2" | "D3" | "D4") {
    const scanStartedAt = Date.now()
    setLoading(true)
    setError(undefined)
    onAnalysisStateChange?.("running")
    analysisController.current?.abort()
    const controller = new AbortController()
    analysisController.current = controller
    try {
      setSelectedSample(sample)
      if (!credential) {
        const sampleFile = await loadSampleDocument(sample)
        setFile(sampleFile)
        const result = await analyzeSampleStream(sample, onTraceEvent, controller.signal)
        await holdSampleScan(scanStartedAt, controller.signal)
        if (controller.signal.aborted) return
        setAnalysis(result)
        onAnalysisComplete?.(result)
        onAnalysisStateChange?.("complete")
        return
      }
      const accessCredential = credential
      const sampleFile = await loadSampleDocument(sample)
      setFile(sampleFile)
      const result = await analyzeDocumentStream(sampleFile, accessCredential, onTraceEvent, controller.signal, sample)
      await holdSampleScan(scanStartedAt, controller.signal)
      if (controller.signal.aborted) return
      setAnalysis(result)
      onAnalysisComplete?.(result)
      onAnalysisStateChange?.("complete")
    } catch (cause) {
      if (controller.signal.aborted) return
      setError(cause instanceof Error ? cause.message : "Sample analysis failed.")
      onAnalysisStateChange?.("error")
    } finally {
      if (analysisController.current === controller) analysisController.current = null
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  function reset() {
    setFile(undefined); setSelectedSample(undefined); setAnalysis(undefined); setError(undefined)
    if (input.current) input.current.value = ""
    onReset?.()
  }

  function chooseFile() {
    if (!credential && onSignInRequired) {
      onSignInRequired()
      return
    }
    if (input.current) input.current.value = ""
    setSelectedSample(undefined)
    input.current?.click()
  }

  if (analysis) return <AnalysisDetail
    analysis={analysis}
    documentName={file?.name}
    onBack={reset}
    savedAnalysisId={analysis.saved_analysis_id ?? undefined}
  />

  if (loading) return <DocumentScan file={file} events={traceEvents} />

  return <Card className="h-fit self-start overflow-hidden">
    <div className="border-b border-dashed border-black/15 px-5 py-6 text-center sm:px-6">
      <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-brand-green/20 text-black">{file ? <FileImage size={21} /> : <Camera size={21} />}</div>
      <h2 className="type-ui-heading">{file ? "Ready for review" : "Upload a financial subpoena"}</h2>
      <p className="type-body mx-auto mt-2 max-w-sm">{file ? "Verification runs before financial records become available." : "Financial records remain locked until the request is verified."}</p>
      <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => { setFile(event.target.files?.[0]); setSelectedSample(undefined); setAnalysis(undefined); setError(undefined) }} />
      {file && <div aria-live="polite" className="mx-auto mt-4 flex max-w-md items-center gap-3 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-left">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-black/5"><FileImage size={15} /></span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={file.name}>{file.name}</p><p className="mt-0.5 text-xs text-zinc-400">{formatFileSize(file.size)} · {file.type === "application/pdf" ? "PDF" : "Image"}</p></div>
        <button type="button" onClick={chooseFile} disabled={loading} className="shrink-0 text-xs font-medium text-zinc-500 hover:text-black">Change</button>
      </div>}
      {error && <Alert variant="destructive" className="mt-3 rounded-xl border-red-200 bg-red-50 text-left text-red-700"><AlertTriangle size={16} /><AlertTitle>Analysis failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="mt-4 flex justify-center gap-2">
        <Button className="h-10 px-4 py-2 text-sm" onClick={file ? submit : chooseFile}><Camera size={17} /> {file ? "Verify request" : "Choose file"}</Button>
      </div>
    </div>
    <div className="px-5 py-4 sm:px-6">
      {showSampleTips && <>
      <div className="rounded-2xl bg-[#111] p-4 text-white">
        <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-black"><Zap size={16} /></span><div><p className="type-label text-white/55">Payment records request</p><p className="type-ui mt-1 font-semibold text-white">Bank transaction review</p></div></div>
        <Button aria-label="Review the payment and bank records request" className="mt-4 h-10 w-full bg-white text-sm font-medium text-black hover:bg-white/90" disabled={loading} onClick={() => useSample("D4")}><Landmark size={15} /> Review payment request</Button>
      </div>
      <div className="mt-4">
        <p className="type-label">Other requests</p>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <Button aria-label="Analyze verified payroll subpoena D1" className="h-9 px-2 text-xs sm:px-3" variant="outline" disabled={loading} onClick={() => useSample("D1")}><span className="sm:hidden">D1</span><span className="hidden sm:inline">Payroll</span></Button>
          <Button aria-label="Analyze uncertain request D2" className="h-9 px-2 text-xs sm:px-3" variant="outline" disabled={loading} onClick={() => useSample("D2")}><span className="sm:hidden">D2</span><span className="hidden sm:inline">Unverified</span></Button>
          <Button aria-label="Analyze scam demand D3" className="h-9 px-2 text-xs sm:px-3" variant="outline" disabled={loading} onClick={() => useSample("D3")}><span className="sm:hidden">D3</span><span className="hidden sm:inline">Fraud risk</span></Button>
        </div>
        <p className="type-caption mt-2">Unverified and suspicious requests keep financial records locked.</p>
      </div>
      <Separator className="my-3" />
      </>}
      <div className="flex items-center gap-2 type-caption"><ShieldCheck size={14} /> Results are saved. Uploaded files are not retained.</div>
    </div>
  </Card>
}
