import { ArrowUpRight, FileCheck2, FileSearch, ListChecks, LockKeyhole, Scale, ShieldCheck } from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"

export function LandingDetails({ onGetStarted }: { onGetStarted: () => void }) {
  const workflow = [
    { icon: FileSearch, title: "Understand", text: "Extract the employee, record types, date range, deadline, and claimed court from the letter." },
    { icon: Scale, title: "Verify", text: "Check official court sources. If the request is missing or uncertain, every sensitive record source stays locked." },
    { icon: FileCheck2, title: "Match", text: "Use only the relevant source: payroll for D1, bank payments for D4, and the request's exact person and dates." },
    { icon: ListChecks, title: "Review", text: "See why each candidate matched and approve a manifest before anything is produced or shared." },
  ]

  return <div className="bg-bg-base px-8 pb-24 md:px-16 lg:px-20">
    <section id="workflow" className="mx-auto max-w-7xl border-t border-black/10 py-20">
      <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
        <div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">The subpoena-to-records workflow</p><h2 className="mt-5 max-w-xl font-display text-4xl tracking-[-.055em] sm:text-6xl">One request. Only the records it names.</h2></div>
        <p className="max-w-2xl text-sm leading-7 text-zinc-500">A restaurant owner should not have to search every payroll file or bank transaction under deadline pressure. Served turns a verified financial subpoena into transparent matching criteria while keeping unrelated employees, vendors, and payments out of the response.</p>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {workflow.map(({ icon: Icon, title, text }, index) => <article className="rounded-[28px] border border-black/5 bg-white/55 p-6 backdrop-blur-xl" key={title}><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-full bg-brand-soft"><Icon size={17} /></span><span className="text-xs text-zinc-400">0{index + 1}</span></div><h3 className="mt-8 font-display text-2xl tracking-[-.04em]">{title}</h3><p className="mt-3 text-sm leading-6 text-zinc-500">{text}</p></article>)}
      </div>
    </section>

    <section id="record-matching" className="mx-auto grid max-w-7xl gap-8 border-t border-black/10 py-20 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
      <div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">The demo moment</p><h2 className="mt-5 max-w-2xl font-display text-4xl tracking-[-.055em] sm:text-6xl">28 searched. 7 matched. 2 need review. 19 stayed protected.</h2><p className="mt-5 max-w-xl text-sm leading-7 text-zinc-500">D4 asks for payments to Audrea Barnes. After the request passes verification, Served checks the connected business account once, explains each candidate, and keeps suppliers, other employees, and out-of-range payments outside the packet.</p><Button onClick={onGetStarted} className="mt-6">Run the D4 payment demo <ArrowUpRight size={15} /></Button></div>
      <div className="overflow-hidden rounded-[30px] bg-[#111] p-6 text-white shadow-xl">
        <div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-white/45">Candidate manifest</p><span className="rounded-full bg-brand-green px-3 py-1 text-[10px] font-semibold text-black">VERIFIED</span></div>
        <div className="mt-8 grid grid-cols-3 gap-3"><div className="rounded-2xl bg-brand-green p-5 text-black"><p className="font-display text-5xl tracking-[-.07em]">7</p><p className="mt-1 text-xs font-medium">include</p></div><div className="rounded-2xl bg-amber-300 p-5 text-black"><p className="font-display text-5xl tracking-[-.07em]">2</p><p className="mt-1 text-xs font-medium">review</p></div><div className="rounded-2xl bg-white/10 p-5"><p className="font-display text-5xl tracking-[-.07em]">19</p><p className="mt-1 text-xs text-white/60">exclude</p></div></div>
        <div className="mt-3 space-y-2">{["Exact Audrea payee + in-range date", "Unnamed check needs review", "Near-name ACH needs review"].map((label) => <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm" key={label}><ShieldCheck className="text-brand-green" size={16} />{label}</div>)}</div>
      </div>
    </section>

    <section id="privacy" className="mx-auto max-w-7xl rounded-[32px] border border-black/5 bg-white/55 p-8 backdrop-blur-xl sm:p-12">
      <span className="inline-flex rounded-full bg-brand-soft px-3 py-1 text-[10px] font-semibold uppercase tracking-[.2em]">Privacy boundary</span>
      <div className="mt-5 grid gap-8 md:grid-cols-2 md:items-end"><div><h2 className="max-w-2xl font-display text-4xl tracking-[-.05em]">Verification controls access.</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-black/60">D1 can unlock a payroll CSV match. D4 can unlock bank-payment matching. Uncertain, scam, and unrelated verified requests keep sensitive sources locked.</p></div><div className="flex items-start gap-3 rounded-2xl bg-black p-5 text-white"><LockKeyhole className="mt-0.5 shrink-0 text-brand-green" size={18} /><p className="text-sm leading-6 text-white/65"><strong className="text-white">No auto-production.</strong> Served creates a candidate manifest for human review. It does not decide legal responsiveness or send records.</p></div></div>
    </section>

    <section id="resources" className="mx-auto grid max-w-7xl gap-10 border-b border-black/10 py-20 md:grid-cols-2">
      <div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">Built for the daily reality</p><h2 className="mt-4 font-display text-4xl tracking-[-.05em]">For independent restaurants without legal, HR, or finance teams.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">Served helps immigrant business owners understand a financial subpoena, verify the referenced case, and narrow the search across payroll or banking data before the deadline. It remains an evidence tool, not legal advice.</p><Button variant="outline" onClick={onGetStarted} className="mt-6">Run the restaurant story →</Button></div>
      <Accordion type="single" collapsible className="rounded-[28px] border border-black/5 bg-white/55 px-6 backdrop-blur-xl">
        <AccordionItem value="why-restaurants"><AccordionTrigger>Why focus on restaurants?</AccordionTrigger><AccordionContent className="leading-6 text-zinc-500">Restaurants manage hourly workers, time records, wage statements, and payroll data, often without dedicated HR staff. A narrow former-employee request can still force an owner to search across many sensitive records.</AccordionContent></AccordionItem>
        <AccordionItem value="record-match"><AccordionTrigger>Does a match mean the record must be shared?</AccordionTrigger><AccordionContent className="leading-6 text-zinc-500">No. A match means the record fits the displayed employee, type, and date criteria. A person must review the manifest and decide what to do with qualified legal help when needed.</AccordionContent></AccordionItem>
        <AccordionItem value="bank"><AccordionTrigger>When does Served connect a bank?</AccordionTrigger><AccordionContent className="leading-6 text-zinc-500">Only D4 asks for payment and bank records, so only a verified D4-style request unlocks Plaid. D1 uses payroll data instead. Uncertain, scam, and unrelated verified requests fail closed.</AccordionContent></AccordionItem>
        <AccordionItem value="legal-advice" className="border-b-0"><AccordionTrigger>Is this legal advice?</AccordionTrigger><AccordionContent className="leading-6 text-zinc-500">No. Served organizes evidence, candidate records, and limitations. Urgent or high-stakes requests should be reviewed by a qualified professional.</AccordionContent></AccordionItem>
      </Accordion>
    </section>
  </div>
}
