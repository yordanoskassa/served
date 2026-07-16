import { AlertTriangle, Camera, FileImage, LoaderCircle, RotateCcw, ShieldCheck } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { type Analysis, analyzeDocument, loadSampleDocument } from "@/lib/api"
import { useAuth } from "@/AuthContext"

const verdictCopy = {
  verified: { label: "Evidence supports it", className: "bg-pine/10 text-pine" },
  cannot_confirm: { label: "Cannot confirm authenticity", className: "bg-amber-100 text-amber-800" },
  scam_indicators: { label: "Scam warning signs found", className: "bg-coral/10 text-coral" },
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function UploadCard({ onAnalysisComplete }: { onAnalysisComplete?: (analysis: Analysis) => void }) {
  const { credential } = useAuth()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File>()
  const [analysis, setAnalysis] = useState<Analysis>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!file) return input.current?.click()
    setLoading(true)
    setError(undefined)
    try {
      const result = await analyzeDocument(file, credential)
      setAnalysis(result)
      onAnalysisComplete?.(result)
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Analysis failed.") }
    finally { setLoading(false) }
  }

  async function useSample(sample: "D1" | "D2" | "D3") {
    setLoading(true)
    setError(undefined)
    try {
      const sampleFile = await loadSampleDocument(sample)
      setFile(sampleFile)
      const result = await analyzeDocument(sampleFile, credential)
      setAnalysis(result)
      onAnalysisComplete?.(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sample analysis failed.")
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setFile(undefined); setAnalysis(undefined); setError(undefined)
    if (input.current) input.current.value = ""
  }

  function chooseFile() {
    if (input.current) input.current.value = ""
    input.current?.click()
  }

  if (analysis) {
    const verdict = verdictCopy[analysis.verdict]
    return <Card className="overflow-hidden p-2">
      <div className="rounded-[22px] bg-white/70 p-6 sm:p-8">
        <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${verdict.className}`}>{verdict.label}</div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{analysis.document_type}</p>
        <h2 className="mt-2 font-display text-2xl font-medium tracking-[-.04em]">What this letter says</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{analysis.summary}</p>
        {analysis.deadline && <div className="mt-4 rounded-xl bg-coral/5 p-3 text-sm"><strong>Deadline shown:</strong> {analysis.deadline}</div>}
        <div className="mt-5 space-y-3">
          {analysis.evidence.map((item, index) => <div className="border-l-2 border-pine/30 pl-3" key={`${item.label}-${index}`}>
            <p className="text-sm font-semibold">{item.label}</p><p className="text-sm text-muted-foreground">{item.detail}</p>
          </div>)}
        </div>
        <div className="mt-5 rounded-2xl bg-bg-base p-4 text-sm"><strong>Safest next step</strong><p className="mt-1 text-muted-foreground">{analysis.next_step}</p></div>
        <Button className="mt-5" variant="outline" onClick={reset}><RotateCcw size={16} /> Check another letter</Button>
      </div>
    </Card>
  }

  return <Card className="overflow-hidden p-2">
    <div className="rounded-[22px] border border-dashed border-black/15 bg-white/65 px-6 py-10 text-center sm:px-10">
      <div className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-brand-green/20 text-black">{loading ? <LoaderCircle className="animate-spin" size={26} /> : file ? <FileImage size={26} /> : <Camera size={26} />}</div>
      <h2 className="font-display text-2xl font-medium tracking-[-.04em]">{file ? "Ready to analyze" : "Upload the letter"}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{file ? "Your selected file is shown below." : "Use a clear, well-lit photo with the entire page visible."}</p>
      <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => { setFile(event.target.files?.[0]); setAnalysis(undefined); setError(undefined) }} />
      {file && <div aria-live="polite" className="mx-auto mt-5 flex max-w-md items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-left shadow-sm">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-black/5"><FileImage size={17} /></span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={file.name}>{file.name}</p><p className="mt-0.5 text-xs text-zinc-400">{formatFileSize(file.size)} · {file.type === "application/pdf" ? "PDF" : "Image"}</p></div>
        <button type="button" onClick={chooseFile} disabled={loading} className="shrink-0 text-xs font-medium text-zinc-500 hover:text-black">Change</button>
      </div>}
      {error && <div className="mt-4 flex items-start gap-2 rounded-lg bg-coral/10 p-3 text-left text-sm text-coral"><AlertTriangle className="mt-0.5 shrink-0" size={16} />{error}</div>}
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={file ? submit : chooseFile} disabled={loading}><Camera size={18} /> {loading ? "Agents are checking…" : file ? "Analyze letter" : "Choose a file"}</Button>
      </div>
      {import.meta.env.DEV && <div className="mt-6 border-t border-black/5 pt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Try a demo document</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Button className="h-8 px-3 text-xs" variant="outline" disabled={loading} onClick={() => useSample("D1")}>D1 · real case</Button>
          <Button className="h-8 px-3 text-xs" variant="outline" disabled={loading} onClick={() => useSample("D2")}>D2 · altered number</Button>
          <Button className="h-8 px-3 text-xs" variant="outline" disabled={loading} onClick={() => useSample("D3")}>D3 · scam letter</Button>
        </div>
      </div>}
      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={15} /> File bytes are processed; result metadata is saved to your workspace</div>
    </div>
  </Card>
}
