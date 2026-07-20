import { AlertTriangle, Camera, FileImage, Landmark, LoaderCircle, ShieldCheck, Zap } from "lucide-react"
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
  initialSample?: "D1" | "D2" | "D3" | "D4"
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
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Sample request could not be prepared.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
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

  async function useSample(sample: "D1" | "D2" | "D3" | "D4") {
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

  return <Card className="h-fit self-start overflow-hidden">
    <div className="border-b border-dashed border-black/15 px-5 py-6 text-center sm:px-6">
      <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-brand-green/20 text-black">{loading ? <LoaderCircle className="animate-spin" size={21} /> : file ? <FileImage size={21} /> : <Camera size={21} />}</div>
      <h2 className="type-ui-heading">{file ? "Ready to verify" : "Upload the financial subpoena"}</h2>
      <p className="type-body mx-auto mt-2 max-w-sm">{file ? "Served will read and verify the request before payroll or bank records can open." : "Start with the subpoena. Payroll and bank data stay locked until Served understands and verifies it."}</p>
      <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => { setFile(event.target.files?.[0]); setAnalysis(undefined); setError(undefined) }} />
      {file && <div aria-live="polite" className="mx-auto mt-4 flex max-w-md items-center gap-3 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-left">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-black/5"><FileImage size={15} /></span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={file.name}>{file.name}</p><p className="mt-0.5 text-xs text-zinc-400">{formatFileSize(file.size)} · {file.type === "application/pdf" ? "PDF" : "Image"}</p></div>
        <button type="button" onClick={chooseFile} disabled={loading} className="shrink-0 text-xs font-medium text-zinc-500 hover:text-black">Change</button>
      </div>}
      {error && <Alert variant="destructive" className="mt-3 rounded-xl border-red-200 bg-red-50 text-left text-red-700"><AlertTriangle size={16} /><AlertTitle>Analysis failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="mt-4 flex justify-center gap-2">
        <Button className="h-10 px-4 py-2 text-sm" onClick={file ? submit : chooseFile} disabled={loading}><Camera size={17} /> {loading ? "Verifying request…" : file ? "Verify request" : "Choose a file"}</Button>
      </div>
    </div>
    <div className="px-5 py-4 sm:px-6">
      <div className="rounded-2xl bg-[#111] p-4 text-white">
        <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-black"><Zap size={16} /></span><div><p className="type-label text-white/55">Hero demo · real Plaid flow</p><p className="type-ui mt-1 font-semibold text-white">Connect a bank and match transactions automatically.</p><p className="type-caption mt-1 text-white/45">Verify D4 first, then Plaid fetches the account data and Served creates the 7 / 2 / 19 result.</p></div></div>
        <Button aria-label="Analyze D4 and unlock the Plaid bank connection" className="mt-4 h-10 w-full bg-white text-sm font-medium text-black hover:bg-white/90" disabled={loading} onClick={() => useSample("D4")}><Landmark size={15} /> Run D4 and unlock bank connection</Button>
      </div>
      <div className="mt-4">
        <p className="type-label">Other request paths</p>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <Button aria-label="Analyze verified payroll subpoena D1" className="h-9 px-2 text-xs sm:px-3" variant="outline" disabled={loading} onClick={() => useSample("D1")}><span className="sm:hidden">D1</span><span className="hidden sm:inline">Payroll subpoena</span></Button>
          <Button aria-label="Analyze uncertain request D2" className="h-9 px-2 text-xs sm:px-3" variant="outline" disabled={loading} onClick={() => useSample("D2")}><span className="sm:hidden">D2</span><span className="hidden sm:inline">Uncertain</span></Button>
          <Button aria-label="Analyze scam demand D3" className="h-9 px-2 text-xs sm:px-3" variant="outline" disabled={loading} onClick={() => useSample("D3")}><span className="sm:hidden">D3</span><span className="hidden sm:inline">Scam demand</span></Button>
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">D1 shows payroll matching. D2 and D3 prove sensitive sources stay locked.</p>
      </div>
      <Separator className="my-3" />
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><ShieldCheck size={14} /> The analysis is saved; uploaded file bytes are not</div>
    </div>
  </Card>
}
