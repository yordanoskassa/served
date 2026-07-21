import { Check, Download, FileCheck2, FileUp, LockKeyhole, RotateCcw, Scale, ShieldCheck, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  emptyAttorneyReview,
  loadAttorneyReview,
  saveAttorneyReview,
  type AttorneyDisposition,
  type AttorneyOverride,
  type AttorneyReview,
  type ReviewPacket,
} from "@/lib/reviewWorkflow"

const dispositionCopy: Record<AttorneyDisposition, string> = {
  pending: "Review in progress",
  approved: "Approved for owner-controlled handoff",
  changes_requested: "Changes requested",
  rejected: "Packet rejected",
}

function fileSize(bytes: number | null): string {
  if (!bytes) return ""
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function AttorneyReviewPanel({
  analysisId,
  packet,
  onOpenRecords,
  onReviewChange,
}: {
  analysisId?: string
  packet: ReviewPacket | null
  onOpenRecords: () => void
  onReviewChange?: (review: AttorneyReview) => void
}) {
  const proofInput = useRef<HTMLInputElement>(null)
  const [review, setReview] = useState<AttorneyReview>(() => loadAttorneyReview(analysisId))
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setReview(loadAttorneyReview(analysisId))
    setSaved(false)
  }, [analysisId, packet?.generatedAt])

  const effectiveCounts = useMemo(() => {
    if (!packet) return { approved: 0, excluded: 0, counsel: 0 }
    const counts = { approved: 0, excluded: 0, counsel: 0 }
    packet.records.forEach((record) => {
      const override = review.overrides[record.recordId]
      const decision = override === "approve" ? "approved" : override === "exclude" ? "excluded" : override === "counsel" ? "counsel" : record.ownerDecision
      counts[decision] += 1
    })
    return counts
  }, [packet, review.overrides])

  if (!packet || !analysisId) {
    return <section className="rounded-2xl border border-black/[.07] bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-zinc-100"><LockKeyhole size={18} /></span><div><p className="text-sm font-semibold">Attorney review unlocks after packet generation</p><p className="mt-1 text-xs leading-5 text-zinc-500">Review every candidate record, generate the response packet, then return here to inspect, annotate, override, and finalize it.</p><Button className="mt-3" onClick={onOpenRecords}><FileCheck2 size={15} />Open candidate records</Button></div></div>
    </section>
  }

  const updateOverride = (recordId: string, value: AttorneyOverride) => {
    setSaved(false)
    setReview((current) => ({
      ...current,
      finalizedAt: null,
      disposition: "pending",
      overrides: { ...current.overrides, [recordId]: value },
    }))
  }

  const save = (disposition: AttorneyDisposition = review.disposition) => {
    const next = {
      ...review,
      disposition,
      finalizedAt: disposition === "pending" ? null : new Date().toISOString(),
    }
    saveAttorneyReview(analysisId, next)
    setReview(next)
    onReviewChange?.(next)
    setSaved(true)
  }

  const downloadFinalDecision = () => {
    const finalRecords = packet.records.map((record) => ({
      ...record,
      attorney_override: review.overrides[record.recordId] ?? null,
    }))
    const artifact = {
      packet,
      attorney_review: review,
      final_counts: effectiveCounts,
      final_records: finalRecords,
      boundary: "Prepared for owner-controlled handoff. Nothing was automatically sent, filed, or disclosed.",
    }
    const blob = new Blob([JSON.stringify(artifact, null, 2)], { type: "application/json;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `served-final-review-${analysisId.slice(-8)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <section className="overflow-hidden rounded-2xl border border-black/[.08] bg-white">
    <div className="border-b border-black/[.07] bg-[#171717] p-4 text-white sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Scale size={17} /><p className="text-sm font-semibold">Attorney-only review</p></div><h4 className="mt-2 text-xl font-semibold">Inspect the packet. Change what needs changing.</h4><p className="mt-1 text-xs leading-5 text-white/55">Overrides affect the handoff packet only. They never rewrite Served’s fixed verification verdict.</p></div><Badge className={review.disposition === "approved" ? "bg-emerald-300 text-emerald-950" : "bg-white/10 text-white"}>{dispositionCopy[review.disposition]}</Badge></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-white/[.07] p-3"><p className="text-[9px] uppercase tracking-wider text-white/40">Approved</p><p className="mt-1 text-2xl font-semibold">{effectiveCounts.approved}</p></div><div className="rounded-xl bg-white/[.07] p-3"><p className="text-[9px] uppercase tracking-wider text-white/40">Kept out</p><p className="mt-1 text-2xl font-semibold">{effectiveCounts.excluded}</p></div><div className="rounded-xl bg-white/[.07] p-3"><p className="text-[9px] uppercase tracking-wider text-white/40">Needs counsel</p><p className="mt-1 text-2xl font-semibold">{effectiveCounts.counsel}</p></div></div>
    </div>

    <div className="space-y-5 p-4 sm:p-5">
      <div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-zinc-400">Packet records and overrides</p><div className="mt-3 space-y-2">{packet.records.map((record) => {
        const override = review.overrides[record.recordId]
        return <article className="rounded-xl border border-black/[.07] p-3" key={record.recordId}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold">{record.label}</p><p className="mt-1 text-xs text-zinc-500">{record.detail}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-400">Served: {record.systemRecommendation} · Owner: {record.ownerDecision}</p></div><Badge variant={override ? "warning" : "secondary"}>{override ? `OVERRIDE: ${override.toUpperCase()}` : `OWNER: ${record.ownerDecision.toUpperCase()}`}</Badge></div><div className="mt-3 flex flex-wrap gap-1.5"><Button className="h-8 px-3 py-1 text-xs" variant={override === "approve" ? "default" : "outline"} onClick={() => updateOverride(record.recordId, "approve")}><Check size={13} />Approve</Button><Button className="h-8 px-3 py-1 text-xs" variant={override === "exclude" ? "default" : "outline"} onClick={() => updateOverride(record.recordId, "exclude")}><X size={13} />Exclude</Button><Button className="h-8 px-3 py-1 text-xs" variant={override === "counsel" ? "default" : "outline"} onClick={() => updateOverride(record.recordId, "counsel")}><Scale size={13} />More review</Button>{override && <Button className="h-8 bg-transparent px-3 py-1 text-xs" variant="outline" onClick={() => { const overrides = { ...review.overrides }; delete overrides[record.recordId]; setReview((current) => ({ ...current, overrides, disposition: "pending", finalizedAt: null })); setSaved(false) }}><RotateCcw size={13} />Restore owner choice</Button>}</div></article>
      })}</div></div>

      <div className="grid gap-4 lg:grid-cols-2"><label className="text-xs font-semibold text-zinc-600">Reviewer name<input className="mt-2 h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal text-black" value={review.reviewerName} placeholder="Kathleen Huang" onChange={(event) => { setReview((current) => ({ ...current, reviewerName: event.target.value, disposition: "pending", finalizedAt: null })); setSaved(false) }} /></label><div><p className="text-xs font-semibold text-zinc-600">Supporting proof reference</p><input ref={proofInput} className="sr-only" type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; setReview((current) => ({ ...current, proofName: file.name, proofSize: file.size, disposition: "pending", finalizedAt: null })); setSaved(false) }} /><Button variant="outline" className="mt-2" onClick={() => proofInput.current?.click()}><FileUp size={15} />{review.proofName ? "Replace proof reference" : "Add proof reference"}</Button>{review.proofName && <p className="mt-2 text-xs text-zinc-500">{review.proofName} · {fileSize(review.proofSize)} · filename recorded, original stays on this device</p>}</div></div>
      <label className="block text-xs font-semibold text-zinc-600">Attorney notes<textarea className="mt-2 min-h-28 w-full rounded-xl border border-black/10 bg-white p-3 text-sm font-normal leading-6 text-black" value={review.notes} placeholder="Explain the legal or factual reason for any override." onChange={(event) => { setReview((current) => ({ ...current, notes: event.target.value, disposition: "pending", finalizedAt: null })); setSaved(false) }} /></label>

      <Alert className="rounded-xl border-black/10 bg-zinc-50"><ShieldCheck size={15} /><AlertTitle>Human decision controls the packet</AlertTitle><AlertDescription>Final approval records the reviewer, notes, proof filename, and every override. It does not send, file, or disclose anything automatically.</AlertDescription></Alert>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-zinc-500">{saved ? "Review saved." : "Unsaved review changes."}{review.finalizedAt ? ` Finalized ${new Date(review.finalizedAt).toLocaleString()}.` : ""}</p><div className="flex flex-wrap gap-2">{review.disposition !== "pending" && <Button variant="outline" onClick={downloadFinalDecision}><Download size={15} />Download final decision</Button>}<Button variant="outline" onClick={() => save("changes_requested")}>Request changes</Button><Button variant="outline" onClick={() => save("rejected")}>Reject packet</Button><Button onClick={() => save("approved")} disabled={!review.reviewerName.trim()}><Check size={15} />Final attorney approval</Button></div></div>
    </div>
  </section>
}
