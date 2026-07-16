import { AlertTriangle, Camera, FileImage, LoaderCircle, RotateCcw, ShieldCheck } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { type Analysis, analyzeDocument, loadSampleDocument } from "@/lib/api"

const verdictCopy = {
  verified: { label: "Evidence supports it", className: "bg-pine/10 text-pine" },
  cannot_confirm: { label: "Cannot confirm authenticity", className: "bg-amber-100 text-amber-800" },
  scam_indicators: { label: "Scam warning signs found", className: "bg-coral/10 text-coral" },
}

export function UploadCard() {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File>()
  const [analysis, setAnalysis] = useState<Analysis>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!file) return input.current?.click()
    setLoading(true)
    setError(undefined)
    try { setAnalysis(await analyzeDocument(file)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Analysis failed.") }
    finally { setLoading(false) }
  }

  async function useSample(sample: "D1" | "D2" | "D3") {
    setLoading(true)
    setError(undefined)
    try {
      const sampleFile = await loadSampleDocument(sample)
      setFile(sampleFile)
      setAnalysis(await analyzeDocument(sampleFile))
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

  if (analysis) {
    const verdict = verdictCopy[analysis.verdict]
    return <Card className="overflow-hidden p-2">
      <div className="rounded-[1.25rem] bg-white p-6 sm:p-8">
        <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${verdict.className}`}>{verdict.label}</div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{analysis.document_type}</p>
        <h2 className="mt-2 text-xl font-semibold">What this letter says</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{analysis.summary}</p>
        {analysis.deadline && <div className="mt-4 rounded-xl bg-coral/5 p-3 text-sm"><strong>Deadline shown:</strong> {analysis.deadline}</div>}
        <div className="mt-5 space-y-3">
          {analysis.evidence.map((item, index) => <div className="border-l-2 border-pine/30 pl-3" key={`${item.label}-${index}`}>
            <p className="text-sm font-semibold">{item.label}</p><p className="text-sm text-muted-foreground">{item.detail}</p>
          </div>)}
        </div>
        <div className="mt-5 rounded-xl bg-muted p-4 text-sm"><strong>Safest next step</strong><p className="mt-1 text-muted-foreground">{analysis.next_step}</p></div>
        <Button className="mt-5" variant="outline" onClick={reset}><RotateCcw size={16} /> Check another letter</Button>
      </div>
    </Card>
  }

  return <Card className="overflow-hidden p-2">
    <div className="rounded-[1.25rem] border border-dashed border-ink/20 bg-white px-6 py-10 text-center sm:px-10">
      <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-coral/10 text-coral">{loading ? <LoaderCircle className="animate-spin" size={26} /> : file ? <FileImage size={26} /> : <Camera size={26} />}</div>
      <h2 className="truncate text-xl font-semibold">{file?.name ?? "Photograph the letter"}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{file ? "Ready to identify important details and warning signs." : "Use a clear, well-lit photo with the entire page visible."}</p>
      <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => { setFile(event.target.files?.[0]); setError(undefined) }} />
      {error && <div className="mt-4 flex items-start gap-2 rounded-lg bg-coral/10 p-3 text-left text-sm text-coral"><AlertTriangle className="mt-0.5 shrink-0" size={16} />{error}</div>}
      <div className="mt-6 flex justify-center gap-2">
        {file && <Button variant="outline" onClick={() => input.current?.click()} disabled={loading}>Change</Button>}
        <Button onClick={submit} disabled={loading}><Camera size={18} /> {loading ? "Reading…" : file ? "Analyze letter" : "Choose a photo"}</Button>
      </div>
      <div className="mt-6 border-t border-border pt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Try a demo document</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Button className="h-8 px-3 text-xs" variant="outline" disabled={loading} onClick={() => useSample("D1")}>D1 · real case</Button>
          <Button className="h-8 px-3 text-xs" variant="outline" disabled={loading} onClick={() => useSample("D2")}>D2 · altered number</Button>
          <Button className="h-8 px-3 text-xs" variant="outline" disabled={loading} onClick={() => useSample("D3")}>D3 · scam letter</Button>
        </div>
      </div>
      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={15} /> Processed for this analysis only</div>
    </div>
  </Card>
}
