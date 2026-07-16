import { AlertTriangle, Building2, CalendarDays, Camera, FileImage, Hash, ListChecks, LoaderCircle, RotateCcw, ShieldCheck, Users } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { type Analysis, analyzeDocument, loadSampleDocument } from "@/lib/api"
import { useAuth } from "@/AuthContext"

const verdictCopy = {
  verified: { label: "Evidence supports it", variant: "default" as const },
  cannot_confirm: { label: "Cannot confirm authenticity", variant: "warning" as const },
  scam_indicators: { label: "Scam warning signs found", variant: "destructive" as const },
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
    const breakdown = analysis.breakdown ?? { court: null, case_number: null, parties: [], document_date: null, deadline: analysis.deadline, requested_actions: [] }
    const detailItems = [
      { label: "Court or issuer", value: breakdown.court, icon: Building2 },
      { label: "Case or reference", value: breakdown.case_number, icon: Hash },
      { label: "Document date", value: breakdown.document_date, icon: CalendarDays },
      { label: "Deadline shown", value: breakdown.deadline, icon: CalendarDays },
    ].filter((item) => item.value)
    return <Card className="overflow-hidden p-2">
      <div className="rounded-[22px] bg-white/70 p-6 sm:p-8">
        <Badge variant={verdict.variant}>{verdict.label}</Badge>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{analysis.document_type}</p>
        <h2 className="mt-2 font-display text-2xl font-medium tracking-[-.04em]">What this letter says</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{analysis.summary}</p>

        <Tabs defaultValue="breakdown" className="mt-6">
          <TabsList className="grid h-auto w-full grid-cols-3 rounded-full bg-black/5 p-1">
            <TabsTrigger className="rounded-full py-2 text-xs data-[state=active]:bg-white" value="breakdown">Breakdown</TabsTrigger>
            <TabsTrigger className="rounded-full py-2 text-xs data-[state=active]:bg-white" value="evidence">Evidence</TabsTrigger>
            <TabsTrigger className="rounded-full py-2 text-xs data-[state=active]:bg-white" value="checks">Checks</TabsTrigger>
          </TabsList>

          <TabsContent value="breakdown" className="mt-4 space-y-4">
            {detailItems.length > 0 && <section><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-400">Key details</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{detailItems.map(({ label, value, icon: Icon }) => <div className="rounded-2xl border border-black/5 bg-white/80 p-4" key={label}><div className="flex items-center gap-2 text-zinc-400"><Icon size={14} /><span className="text-[11px]">{label}</span></div><p className="mt-2 break-words text-sm font-medium">{value}</p></div>)}</div></section>}
            {breakdown.parties.length > 0 && <section className="rounded-2xl border border-black/5 bg-white/80 p-4"><div className="flex items-center gap-2"><Users size={15} /><p className="text-sm font-semibold">People and organizations named</p></div><div className="mt-3 flex flex-wrap gap-2">{breakdown.parties.map((party) => <Badge variant="secondary" key={party}>{party}</Badge>)}</div></section>}
            {breakdown.requested_actions.length > 0 && <section className="rounded-2xl border border-black/5 bg-white/80 p-4"><div className="flex items-center gap-2"><ListChecks size={15} /><p className="text-sm font-semibold">What the letter asks you to do</p></div><ul className="mt-3 space-y-2">{breakdown.requested_actions.map((action, index) => <li className="flex gap-2 text-sm leading-6 text-zinc-600" key={`${action}-${index}`}><span aria-hidden="true">•</span><span>{action}</span></li>)}</ul></section>}
            {!detailItems.length && !breakdown.parties.length && !breakdown.requested_actions.length && <p className="py-6 text-center text-sm text-zinc-400">No additional details were extracted.</p>}
          </TabsContent>

          <TabsContent value="evidence" className="mt-4 space-y-4">
            <section><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-400">Evidence and warning signals</p><div className="mt-3 space-y-3">{analysis.evidence.map((item, index) => <div className="border-l-2 border-brand-soft pl-3" key={`${item.label}-${index}`}><p className="text-sm font-semibold">{item.label}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-400">Source: {item.source}</p></div>)}</div></section>
            {(analysis.limitations?.length ?? 0) > 0 && <Alert className="rounded-2xl border-amber-200 bg-amber-50 text-amber-900"><AlertTriangle size={15} /><AlertTitle>What could not be confirmed</AlertTitle><AlertDescription><ul className="space-y-1">{analysis.limitations.map((limitation) => <li className="leading-6 text-amber-900/70" key={limitation}>{limitation}</li>)}</ul></AlertDescription></Alert>}
          </TabsContent>

          <TabsContent value="checks" className="mt-4">
            {(analysis.checks?.length ?? 0) > 0 ? <div className="space-y-2">{analysis.checks.map((check) => <div className="flex items-center gap-3 rounded-xl bg-bg-base px-3 py-2.5" key={check.key}><span className="size-2 rounded-full bg-brand-soft" /><p className="text-sm text-zinc-600">{check.label}</p></div>)}</div> : <p className="py-6 text-center text-sm text-zinc-400">No check trace was returned.</p>}
          </TabsContent>
        </Tabs>

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
      {error && <Alert variant="destructive" className="mt-4 rounded-2xl border-red-200 bg-red-50 text-left text-red-700"><AlertTriangle size={16} /><AlertTitle>Analysis failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={file ? submit : chooseFile} disabled={loading}><Camera size={18} /> {loading ? "Agents are checking…" : file ? "Analyze letter" : "Choose a file"}</Button>
      </div>
      {import.meta.env.DEV && <><Separator className="mt-6" /><div className="pt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Try a demo document</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Button className="h-8 px-3 text-xs" variant="outline" disabled={loading} onClick={() => useSample("D1")}>D1 · real case</Button>
          <Button className="h-8 px-3 text-xs" variant="outline" disabled={loading} onClick={() => useSample("D2")}>D2 · altered number</Button>
          <Button className="h-8 px-3 text-xs" variant="outline" disabled={loading} onClick={() => useSample("D3")}>D3 · scam letter</Button>
        </div>
      </div></>}
      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={15} /> File bytes are processed; result metadata is saved to your workspace</div>
    </div>
  </Card>
}
