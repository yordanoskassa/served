import { AlertTriangle, Camera, FileImage, LoaderCircle, ShieldCheck } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { AnalysisDetail } from "@/components/AnalysisDetail"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { type Analysis, type TraceEvent, analyzeDocumentStream, loadSampleDocument } from "@/lib/api"
import { useAuth } from "@/AuthContext"

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export type AnalysisRunState = "idle" | "running" | "complete" | "error"

export function UploadCard({ onAnalysisComplete, onAnalysisStateChange, onTraceEvent, onViewPipeline, onReset, initialSample }: {
  onAnalysisComplete?: (analysis: Analysis) => void
  onAnalysisStateChange?: (state: AnalysisRunState) => void
  onTraceEvent?: (event: TraceEvent) => void
  onViewPipeline?: () => void
  onReset?: () => void
  initialSample?: "D1" | "D2" | "D3"
}) {
  const { credential } = useAuth()
  const input = useRef<HTMLInputElement>(null)
  const analysisController = useRef<AbortController | null>(null)
  const [file, setFile] = useState<File>()
  const [analysis, setAnalysis] = useState<Analysis>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  useEffect(() => () => analysisController.current?.abort(), [])

  useEffect(() => {
    if (!initialSample) return
    let cancelled = false
    setLoading(true)
    setError(undefined)
    void loadSampleDocument(initialSample)
      .then((sampleFile) => {
        if (cancelled) return
        setFile(sampleFile)
        setAnalysis(undefined)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Sample letter could not be prepared.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [initialSample])

  async function submit() {
    if (!file) return input.current?.click()
    if (!credential) {
      setError("Sign in again before analyzing this letter.")
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
      const result = await analyzeDocumentStream(file, credential, onTraceEvent, controller.signal)
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

  async function useSample(sample: "D1" | "D2" | "D3") {
    if (!credential) {
      setError("Sign in again before analyzing this letter.")
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
      const sampleFile = await loadSampleDocument(sample)
      setFile(sampleFile)
      const result = await analyzeDocumentStream(sampleFile, credential, onTraceEvent, controller.signal)
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
    setFile(undefined); setAnalysis(undefined); setError(undefined)
    if (input.current) input.current.value = ""
    onReset?.()
  }

  function chooseFile() {
    if (input.current) input.current.value = ""
    input.current?.click()
  }

  if (analysis) return <AnalysisDetail
    analysis={analysis}
    documentName={file?.name}
    onBack={reset}
    onViewPipeline={onViewPipeline}
    savedAnalysisId={analysis.saved_analysis_id ?? undefined}
  />

  return <Card className="overflow-hidden p-2">
    <div className="rounded-[22px] border border-dashed border-black/15 bg-white/65 px-6 py-10 text-center sm:px-10">
      <div className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-brand-green/20 text-black">{loading ? <LoaderCircle className="animate-spin" size={26} /> : file ? <FileImage size={26} /> : <Camera size={26} />}</div>
      <h2 className="font-display text-2xl font-medium tracking-[-.04em]">{file ? "Ready to analyze" : "Upload the letter"}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{file ? "Your selected file is shown below." : "Use a clear, well-lit photo with the entire page visible."}</p>
      <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => { setFile(event.target.files?.[0]); setAnalysis(undefined); setError(undefined) }} />
      {file && <div aria-live="polite" className="mx-auto mt-5 flex max-w-md items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-left">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-black/5"><FileImage size={17} /></span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={file.name}>{file.name}</p><p className="mt-0.5 text-xs text-zinc-400">{formatFileSize(file.size)} · {file.type === "application/pdf" ? "PDF" : "Image"}</p></div>
        <button type="button" onClick={chooseFile} disabled={loading} className="shrink-0 text-xs font-medium text-zinc-500 hover:text-black">Change</button>
      </div>}
      {error && <Alert variant="destructive" className="mt-4 rounded-2xl border-red-200 bg-red-50 text-left text-red-700"><AlertTriangle size={16} /><AlertTitle>Analysis failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={file ? submit : chooseFile} disabled={loading}><Camera size={18} /> {loading ? "Three-agent analysis…" : file ? "Analyze letter" : "Choose a file"}</Button>
      </div>
      <Separator className="mt-6" /><div className="pt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Run a real sample analysis</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Button className="h-9 px-3 text-xs" variant="outline" disabled={loading} onClick={() => useSample("D1")}>Analyze D1</Button>
          <Button className="h-9 px-3 text-xs" variant="outline" disabled={loading} onClick={() => useSample("D2")}>Analyze D2</Button>
          <Button className="h-9 px-3 text-xs" variant="outline" disabled={loading} onClick={() => useSample("D3")}>Analyze D3</Button>
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">Each sample uses the same live analysis path as an uploaded letter.</p>
      </div>
      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={15} /> The analysis is saved; uploaded file bytes are not</div>
    </div>
  </Card>
}
