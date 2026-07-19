import { BellRing, Check, Circle, Clipboard, FileCheck2, ListChecks, MailPlus, UserRound } from "lucide-react"
import { useMemo, useState } from "react"

import { EmailEvidenceBrief } from "@/components/EmailEvidenceBrief"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { Analysis } from "@/lib/api"

export type EvidenceWorkflowState = {
  sourceReady: boolean
  candidatesReady: boolean
  reviewed: number
  total: number
  packetReady: boolean
  sourceLabel?: string | null
}

const EMPTY_WORKFLOW: EvidenceWorkflowState = {
  sourceReady: false,
  candidatesReady: false,
  reviewed: 0,
  total: 0,
  packetReady: false,
}

function deadlineStatus(value: string | null | undefined): { label: string; urgent: boolean } {
  if (!value) return { label: "Deadline not extracted", urgent: true }
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const parsed = isoDate
    ? new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]))
    : new Date(value)
  if (Number.isNaN(parsed.getTime())) return { label: value, urgent: false }
  const today = new Date()
  const end = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 23, 59, 59)
  const days = Math.ceil((end.getTime() - today.getTime()) / 86_400_000)
  if (days < 0) return { label: `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} past deadline`, urgent: true }
  if (days === 0) return { label: "Due today", urgent: true }
  return { label: `${days} day${days === 1 ? "" : "s"} remaining`, urgent: days <= 3 }
}

function requestDraft(analysis: Analysis): string {
  const actions = analysis.breakdown?.requested_actions ?? []
  const requested = actions.length
    ? actions.map((action) => `• ${action}`).join("\n")
    : `• Records described in case ${analysis.breakdown?.case_number || "the attached request"}`
  return `Subject: Records needed for a time-sensitive business request

Hi,

We received a verified records request and need help collecting the following business records:

${requested}

Please send the export to me through our normal secure business channel. Do not send it to any contact listed in the original letter. I will review the records in Served before anything is shared externally.

Deadline shown: ${analysis.breakdown?.deadline || analysis.deadline || "Please confirm with me"}

Thank you.`
}

export function CaseWorkflow({
  analysis,
  analysisId,
  documentName,
  workflow = EMPTY_WORKFLOW,
}: {
  analysis: Analysis
  analysisId: string
  documentName?: string
  workflow?: EvidenceWorkflowState
}) {
  const [copied, setCopied] = useState(false)
  const deadline = deadlineStatus(analysis.breakdown?.deadline || analysis.deadline)
  const draft = useMemo(() => requestDraft(analysis), [analysis])
  const reviewDone = workflow.candidatesReady && workflow.total > 0 && workflow.reviewed === workflow.total
  const steps = [
    { label: "Request verified", done: analysis.verdict === "verified" },
    { label: workflow.sourceLabel || "Records collected", done: workflow.sourceReady },
    { label: workflow.total ? `${workflow.reviewed}/${workflow.total} reviewed` : "Candidate review", done: reviewDone },
    { label: "Handoff ready", done: workflow.packetReady },
  ]
  const completed = steps.filter((step) => step.done).length
  const nextStep = !workflow.sourceReady
    ? "Collect the requested records"
    : !workflow.candidatesReady
      ? "Run the evidence match"
      : !reviewDone
        ? `Review ${Math.max(workflow.total - workflow.reviewed, 0)} remaining candidate${workflow.total - workflow.reviewed === 1 ? "" : "s"}`
        : !workflow.packetReady
          ? "Export the counsel handoff"
          : "Package ready for intentional handoff"

  const copyDraft = async () => {
    await navigator.clipboard.writeText(draft)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2_000)
  }

  return <section className="mt-5 overflow-hidden rounded-2xl border border-black/10 bg-white/75" aria-label="Case plan">
    <div className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-500"><ListChecks size={14} /> Case plan</div>
        <h3 className="mt-1.5 font-display text-xl tracking-[-.035em]">{nextStep}</h3>
        <p className="mt-1 text-xs text-zinc-500">Case owner: you · {completed} of 4 stages complete</p>
      </div>
      <Badge variant={deadline.urgent ? "warning" : "secondary"}><BellRing size={12} /> {deadline.label}</Badge>
    </div>

    <div className="grid border-y border-black/5 bg-white/55 sm:grid-cols-4">
      {steps.map((step, index) => <div className={`flex items-center gap-2 px-4 py-3 text-[11px] ${index < steps.length - 1 ? "border-b border-black/5 sm:border-r sm:border-b-0" : ""}`} key={step.label}>
        <span className={`grid size-5 shrink-0 place-items-center rounded-full ${step.done ? "bg-brand-green text-black" : index === completed ? "bg-black text-white" : "bg-black/5 text-zinc-400"}`}>
          {step.done ? <Check size={12} strokeWidth={3} /> : <Circle size={8} fill="currentColor" />}
        </span>
        <span className={step.done || index === completed ? "font-medium text-black" : "text-zinc-400"}>{step.label}</span>
      </div>)}
    </div>

    <div className="flex flex-wrap gap-2 p-4 sm:px-5">
      <Button className="px-4 py-2 text-xs" onClick={() => document.getElementById(`records-${analysisId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
        <FileCheck2 size={15} /> {workflow.sourceReady ? "Continue evidence review" : "Collect records"}
      </Button>
      <Dialog>
        <DialogTrigger asChild><Button className="px-4 py-2 text-xs" variant="outline"><MailPlus size={15} /> Ask bookkeeper for records</Button></DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="mb-2 grid size-11 place-items-center rounded-full bg-brand-soft"><UserRound size={19} /></div>
            <DialogTitle>Request the missing records</DialogTitle>
            <DialogDescription>Copy this prepared message to your normal business email. It keeps the original letter’s contact information out of the workflow.</DialogDescription>
          </DialogHeader>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-black/10 bg-white/70 p-4 font-sans text-xs leading-5 text-zinc-600">{draft}</pre>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
            <Button onClick={() => { void copyDraft() }}><Clipboard size={15} /> {copied ? "Copied" : "Copy request"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <EmailEvidenceBrief analysisId={analysisId} documentName={documentName} compact />
    </div>
  </section>
}
