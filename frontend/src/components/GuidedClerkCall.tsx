import { useState } from "react"
import {
  Check,
  Clipboard,
  ExternalLink,
  FileWarning,
  Phone,
  ShieldCheck,
} from "lucide-react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import type { Analysis } from "@/lib/api"

function guidanceFor(verdict: Analysis["verdict"]) {
  if (verdict === "cannot_confirm") {
    return {
      badge: "RECOMMENDED",
      title: "Confirm the case with the court",
      description: "The automated checks could not confirm enough. A short administrative call can help you verify whether the case exists.",
    }
  }
  if (verdict === "verified") {
    return {
      badge: "OPTIONAL",
      title: "Want extra reassurance?",
      description: "The case and parties matched. You can still contact the court through this independently reviewed route.",
    }
  }
  return {
    badge: "OPTIONAL",
    title: "Independently check the named court",
    description: "Warning signals were found. If you want a second check, use only the official route below—not anything printed on the letter.",
  }
}

function reviewedDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })
}

function callScriptFor(analysis: Analysis): string {
  const caseNumber = analysis.breakdown?.case_number
  const parties = analysis.breakdown?.parties?.slice(0, 2).filter(Boolean) ?? []
  const partyQuestion = parties.length
    ? ` involving ${parties.join(" and ")}`
    : ""
  const boundary = "I’m not asking you to authenticate a letter or give legal advice."

  if (!caseNumber) {
    return `Hello. A document names your court but does not show a clear case number. Which official public resource should I use to check whether a case exists? ${boundary}`
  }
  if (analysis.verdict === "cannot_confirm") {
    return `Hello. I’m trying to confirm case ${caseNumber}. I could not locate an exact public-record match. Could you confirm whether a case${partyQuestion} exists and tell me the correct public case number and status? ${boundary}`
  }
  if (analysis.verdict === "verified") {
    return `Hello. I’m calling about case ${caseNumber}. Could you confirm that the case${partyQuestion} exists, tell me which clerk’s office handles it, and point me to the official public case information? ${boundary}`
  }
  return `Hello. I’m calling about case ${caseNumber}. Could you confirm whether this case exists and point me to the official public case information? ${boundary}`
}

export function GuidedClerkCall({ analysis }: { analysis: Analysis }) {
  const [reviewed, setReviewed] = useState(false)
  const [copied, setCopied] = useState(false)
  const contact = analysis.official_contact

  if (!contact) return null

  const exactCourt = analysis.breakdown?.court_directory_status === "OFFICIAL_COURT"
  const isScam = analysis.verdict === "scam" || analysis.verdict === "scam_indicators"
  if (isScam && !exactCourt) return null

  const guidance = guidanceFor(analysis.verdict)
  const safeTelUri = contact.status === "reviewed_route" && contact.tel_uri?.startsWith("tel:")
    ? contact.tel_uri
    : null
  const canDial = Boolean(safeTelUri && contact.phone)
  const callScript = callScriptFor(analysis)

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(callScript)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  if (contact.status !== "reviewed_route" || !canDial) {
    const unavailable = contact.status === "not_available"
    return <section className="mt-5 rounded-[22px] border border-amber-200 bg-amber-50/70 p-5 sm:p-6" aria-labelledby="clerk-contact-title">
      <div className="flex items-start gap-3">
        <FileWarning className="mt-0.5 shrink-0 text-amber-700" size={20} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <Badge variant="warning">{unavailable ? "NO REVIEWED ROUTE" : "HUMAN CHECK NEEDED"}</Badge>
          <h3 id="clerk-contact-title" className="mt-3 font-display text-xl font-medium tracking-[-.03em]">{unavailable ? "Guided calling is not available for this route" : "Confirm the correct court office first"}</h3>
          <p className="mt-2 text-sm leading-6 text-amber-950/70">{contact.reason || "The document did not provide enough reviewed routing information to select a clerk’s office safely."}</p>
          {contact.routing_note && <p className="mt-2 text-xs leading-5 text-amber-900/65">{contact.routing_note}</p>}
          <p className="mt-3 text-xs font-medium leading-5 text-amber-950">No phone number was guessed. Never use a phone number or email address printed on the letter.</p>
          {contact.official_contact_page && <a className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-900/20 bg-white/70 px-4 py-2.5 text-sm font-semibold text-amber-950 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700" href={contact.official_contact_page} target="_blank" rel="noreferrer">
            Open the official contact page <ExternalLink size={15} aria-hidden="true" />
          </a>}
        </div>
      </div>
    </section>
  }

  return <section className="mt-5 rounded-[22px] border border-black/10 bg-[#f7f8f3] p-5 sm:p-6" aria-labelledby="clerk-call-title">
    <div className="flex items-start gap-3">
      <ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" size={21} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <Badge variant={analysis.verdict === "cannot_confirm" ? "warning" : "outline"}>{guidance.badge}</Badge>
        <h3 id="clerk-call-title" className="mt-3 font-display text-xl font-medium tracking-[-.03em]">{guidance.title}</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">{guidance.description}</p>
      </div>
    </div>

    <div className="mt-5 grid gap-3 rounded-2xl border border-black/10 bg-white/70 p-4 sm:grid-cols-2">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-zinc-400">Reviewed official route</p>
        <p className="mt-2 text-sm font-semibold text-zinc-900">{contact.office_name || contact.court_name}</p>
        {contact.line_label && <p className="mt-1 text-xs text-zinc-500">{contact.line_label}</p>}
        {contact.purpose && <p className="mt-1 text-xs leading-5 text-zinc-500">For: {contact.purpose}</p>}
        {contact.phone && <p className="mt-2 text-sm font-medium tabular-nums text-zinc-800">{contact.phone}</p>}
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-zinc-400">Availability</p>
        <p className="mt-2 text-xs leading-5 text-zinc-600">{contact.office_hours || "Check the official contact page for current hours."}</p>
        {reviewedDate(contact.verified_on) && <p className="mt-1 text-[11px] text-zinc-400">Route reviewed {reviewedDate(contact.verified_on)}</p>}
      </div>
    </div>
    {contact.routing_note && <p className="mt-2 text-xs leading-5 text-zinc-500">{contact.routing_note}</p>}

    <div className="mt-3 flex gap-2 rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm leading-6 text-red-950">
      <FileWarning className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
      <p><strong>Use only this independently sourced route.</strong> Never call or email contact details printed on the uploaded letter.</p>
    </div>

    <Accordion type="single" collapsible defaultValue={analysis.verdict === "cannot_confirm" ? "guide" : undefined} className="mt-3">
      <AccordionItem value="guide" className="rounded-2xl border border-black/10 bg-white/70 px-4">
        <AccordionTrigger className="gap-4 py-4 hover:no-underline">
          <span className="flex items-center gap-2"><Phone size={16} aria-hidden="true" /> Review the guided call</span>
        </AccordionTrigger>
        <AccordionContent className="pb-5">
          <ol className="space-y-5">
            <li className="grid grid-cols-[24px_1fr] gap-3">
              <span className="flex size-6 items-center justify-center rounded-full bg-black text-[11px] font-semibold text-white">1</span>
              <div><p className="text-sm font-semibold">Confirm the case—not the paper</p><p className="mt-1 text-xs leading-5 text-zinc-500">Ask only administrative questions: whether the case exists, its public status, and where official case information is available.</p></div>
            </li>
            <li className="grid grid-cols-[24px_1fr] gap-3">
              <span className="flex size-6 items-center justify-center rounded-full bg-black text-[11px] font-semibold text-white">2</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">Review your call script</p><button type="button" onClick={copyScript} className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"><Clipboard size={13} aria-hidden="true" /> {copied ? "Copied" : "Copy script"}</button></div>
                <p className="mt-2 text-xs leading-5 text-zinc-500">The clerk may be able to confirm the case but may not have this particular paper. A paper’s absence from the public docket does not prove it is fake.</p>
                <blockquote className="mt-3 rounded-xl border-l-2 border-brand-soft bg-bg-base px-4 py-3 text-sm leading-6 text-zinc-700">“{callScript}”</blockquote>
                <p className="sr-only" aria-live="polite">{copied ? "Call script copied." : ""}</p>
              </div>
            </li>
            <li className="grid grid-cols-[24px_1fr] gap-3">
              <span className="flex size-6 items-center justify-center rounded-full bg-black text-[11px] font-semibold text-white">3</span>
              <div>
                <p className="text-sm font-semibold">You decide when to call</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">Served never places or records the call. Review the script, then start the call yourself.</p>
                <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-black/10 bg-white/80 p-3 text-xs leading-5 text-zinc-700">
                  <input className="mt-1 size-4 accent-black" type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
                  <span>I reviewed the official route and understand I’m asking about the case, not asking the clerk for legal advice or to authenticate the letter.</span>
                </label>
                {reviewed ? <a className="mt-3 inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2" href={safeTelUri ?? undefined}>
                  <Phone size={15} aria-hidden="true" /> Call official clerk line
                </a> : <span className="mt-3 inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-black/10 px-5 py-3 text-sm font-semibold text-zinc-400" aria-disabled="true"><Phone size={15} aria-hidden="true" /> Review before calling</span>}
              </div>
            </li>
          </ol>
          {contact.official_contact_page && <a className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 underline decoration-black/20 underline-offset-4" href={contact.official_contact_page} target="_blank" rel="noreferrer">View the official court source <ExternalLink size={13} aria-hidden="true" /></a>}
          <p className="mt-3 flex items-center gap-2 text-[11px] leading-5 text-zinc-400"><Check size={13} aria-hidden="true" /> No automated calling · no recording · no court email</p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </section>
}
