import { ArrowRight, ArrowUpRight, CheckCircle2, DatabaseZap, FileCheck2, FileSearch, Landmark, ListChecks, LockKeyhole, Scale, ShieldCheck, Zap } from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"

export function LandingDetails({ onGetStarted }: { onGetStarted: () => void }) {
  const workflow = [
    { icon: FileSearch, title: "Understand", text: "Identify the person, record types, dates, deadline, and court named in the request." },
    { icon: Scale, title: "Check", text: "Compare against official sources. If anything is uncertain, financial data stays locked." },
    { icon: FileCheck2, title: "Find", text: "Search payroll or the connected bank using only what the request names." },
    { icon: ListChecks, title: "Review", text: "See matches and exclusions before you prepare anything." },
  ]

  return <div className="bg-background px-8 pb-24 md:px-16 lg:px-20">
    <section id="workflow" className="mx-auto max-w-7xl border-t border-border py-20">
      <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
        <div>
          <h2 className="type-section max-w-xl">One request. Only what it asks for.</h2>
        </div>
        <p className="type-lead max-w-2xl">Small businesses should not dig through every payroll file or bank line under deadline pressure.</p>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {workflow.map(({ icon: Icon, title, text }, index) => (
          <article className="rounded-lg border border-border bg-card p-6" key={title}>
            <div className="flex items-center justify-between border-b border-border pb-4">
              <span className="grid size-10 place-items-center rounded-full bg-muted"><Icon size={17} /></span>
              <span className="type-label">§ 0{index + 1}</span>
            </div>
            <h3 className="type-ui-title mt-6">{title}</h3>
            <p className="type-body mt-3">{text}</p>
          </article>
        ))}
      </div>
    </section>

    <section id="bank-connection" className="mx-auto max-w-7xl border-t border-border py-20">
      <div className="grid gap-8 lg:grid-cols-[.88fr_1.12fr] lg:items-end">
        <div>
          <h2 className="type-section max-w-2xl">Connect once. Match from live data.</h2>
        </div>
        <div>
          <p className="type-body max-w-2xl text-base leading-7">After the request clears verification, a secure bank connection retrieves transactions and matches them against the named person and dates.</p>
          <Button onClick={onGetStarted} className="mt-5">Review a sample request <ArrowRight size={15} /></Button>
        </div>
      </div>

      <div className="mt-10 grid gap-2 sm:grid-cols-3" aria-label="Bank connection workflow">
        {[{ icon: Landmark, title: "Mendoza’s Kitchen sample", note: "D4 demo account" }, { icon: DatabaseZap, title: "Transaction search", note: "Scoped to the request" }, { icon: ShieldCheck, title: "Owner review", note: "Nothing sent automatically" }].map(({ icon: Icon, title, note }) => (
          <div className="flex min-h-20 items-center gap-3 rounded-lg border border-border bg-card px-4" key={title}>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted"><Icon size={16} /></span>
            <div><p className="type-ui font-medium">{title}</p><p className="type-caption mt-1">{note}</p></div>
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-hidden rounded-lg border border-border bg-primary p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-12 place-items-center rounded-lg bg-white text-black"><Zap size={20} /></span>
            <div>
              <h3 className="type-subsection text-white">Secure bank connection</h3>
              <p className="type-caption mt-2 text-white/55">Account access, retrieval, and matching happen inside Served.</p>
            </div>
          </div>
          <span className="type-label rounded-full border border-white/20 px-3 py-1 text-white/70">READ ONLY</span>
        </div>
        <div className="mt-6 grid overflow-hidden rounded-lg border border-white/10 sm:grid-cols-4">
          {[{ icon: ShieldCheck, label: "Verified" }, { icon: Landmark, label: "Connected" }, { icon: DatabaseZap, label: "Fetched" }, { icon: CheckCircle2, label: "Explained" }].map(({ icon: Icon, label }, index) => (
            <div className={`flex items-center gap-3 p-4 ${index < 3 ? "border-b border-white/10 sm:border-r sm:border-b-0" : ""}`} key={label}>
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10"><Icon className="text-white" size={15} /></span>
              <p className="type-ui font-medium text-white">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section id="record-matching" className="mx-auto grid max-w-7xl gap-8 border-t border-border py-20 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
      <div>
        <h2 className="type-section max-w-2xl">Find the requested records. Exclude the rest.</h2>
        <p className="type-body mt-5 max-w-xl text-base leading-7">On sample D4, Mendoza’s Kitchen business checking yields <strong className="font-medium text-foreground">7 include, 2 review, and 19 exclude</strong> from 28 transactions—Audrea Barnes payments only, not suppliers or other staff.</p>
        <Button onClick={onGetStarted} className="mt-6">Review the result <ArrowUpRight size={15} /></Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-primary p-6 text-white">
        <div className="flex items-center justify-between">
          <p className="type-label text-white/45">Review set</p>
          <span className="type-label rounded-full bg-white px-3 py-1 text-black">VERIFIED</span>
        </div>
        <div className="mt-8 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-white p-5 text-black"><p className="type-stat">7</p><p className="type-caption mt-1 font-medium text-black">include</p></div>
          <div className="rounded-lg bg-white/15 p-5"><p className="type-stat">2</p><p className="type-caption mt-1 text-white/70">review</p></div>
          <div className="rounded-lg bg-white/10 p-5"><p className="type-stat">19</p><p className="type-caption mt-1 text-white/60">exclude</p></div>
        </div>
        <p className="type-caption mt-4 text-white/45">28 transactions searched · sample D4 · Connect sample account in the app (not BoA/Amex sandbox pickers).</p>
      </div>
    </section>

    <section id="privacy" className="mx-auto max-w-7xl rounded-lg border border-border bg-card p-8 sm:p-12">
      <h2 className="type-section max-w-2xl">No verification, no access.</h2>
      <div className="mt-5 grid gap-8 md:grid-cols-2 md:items-end">
        <p className="type-body max-w-2xl text-base leading-7">Verified payroll requests unlock payroll records. Verified payment requests unlock bank records. Everything else remains locked.</p>
        <div className="flex items-start gap-3 rounded-lg bg-black p-5 text-white">
          <LockKeyhole className="mt-0.5 shrink-0 text-white" size={18} />
          <p className="type-body text-white/70"><strong className="font-medium text-white">Nothing ships automatically.</strong> You review candidates; the product does not decide what to share.</p>
        </div>
      </div>
    </section>

    <section id="resources" className="mx-auto grid max-w-7xl gap-10 border-b border-border py-20 md:grid-cols-2">
      <div>
        <h2 className="type-section">Raul runs a restaurant, not a legal department.</h2>
        <p className="type-body mt-3 max-w-xl">A financial subpoena arrives with a deadline and a former employee’s name. Served helps him verify it and review the requested records without exposing the rest.</p>
        <Button variant="outline" onClick={onGetStarted} className="mt-6">Review the request →</Button>
      </div>
      <Accordion type="single" collapsible className="rounded-2xl border border-border bg-card px-6">
        <AccordionItem value="why-restaurants"><AccordionTrigger className="type-ui font-medium">Why a restaurant?</AccordionTrigger><AccordionContent className="type-body leading-6">Hourly payroll and wage records make the small-business problem concrete. The same flow applies to other employers.</AccordionContent></AccordionItem>
        <AccordionItem value="record-match"><AccordionTrigger className="type-ui font-medium">Does a match mean you must share?</AccordionTrigger><AccordionContent className="type-body leading-6">No. A match fits the request criteria. You still decide next steps, ideally with qualified help when stakes are high.</AccordionContent></AccordionItem>
        <AccordionItem value="bank"><AccordionTrigger className="type-ui font-medium">When does bank access open?</AccordionTrigger><AccordionContent className="type-body leading-6">Only after a payment-record request is verified. Payroll requests use payroll records instead.</AccordionContent></AccordionItem>
        <AccordionItem value="legal-advice" className="border-b-0"><AccordionTrigger className="type-ui font-medium">Is this legal advice?</AccordionTrigger><AccordionContent className="type-body leading-6">No. It organizes evidence and candidate records—not legal judgment.</AccordionContent></AccordionItem>
      </Accordion>
    </section>
  </div>
}
