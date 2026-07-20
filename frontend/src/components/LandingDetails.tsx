import { ArrowRight, ArrowUpRight, CheckCircle2, DatabaseZap, FileCheck2, FileSearch, Landmark, ListChecks, LockKeyhole, Scale, ShieldCheck, Zap } from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"

export function LandingDetails({ onGetStarted }: { onGetStarted: () => void }) {
  const workflow = [
    { icon: FileSearch, title: "Understand", text: "Extract the employee, record types, date range, deadline, and claimed court from the letter." },
    { icon: Scale, title: "Verify", text: "Check official court sources. If anything is missing or uncertain, payroll and bank data stay locked." },
    { icon: FileCheck2, title: "Find", text: "Search the right source using the person, record type, and dates named in the request." },
    { icon: ListChecks, title: "Review", text: "See what matched and why before you prepare or share anything." },
  ]

  return <div className="bg-background px-8 pb-24 md:px-16 lg:px-20">
    <section id="workflow" className="mx-auto max-w-7xl border-t border-border py-20">
      <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
        <div>
          <p className="type-eyebrow">How Served works</p>
          <h2 className="type-section mt-5 max-w-xl">One request. Only the records it asks for.</h2>
        </div>
        <p className="type-lead max-w-2xl">A small-business owner should not have to search every payroll file or bank transaction under deadline pressure. Served finds the likely matches and keeps unrelated employees, vendors, and payments out.</p>
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
          <p className="type-eyebrow">The integration judges can see</p>
          <h2 className="type-section mt-5 max-w-2xl">Connect the bank. Fetch the data. Find the matches.</h2>
        </div>
        <div>
          <p className="type-body max-w-2xl text-base leading-7">After D4 is verified, Served opens Plaid Link, connects the business account, fetches its transactions through the backend, and matches them to the person and dates in the subpoena. The result is created from fetched data, not a prebuilt screen.</p>
          <Button onClick={onGetStarted} className="mt-5">Run the live connection flow <ArrowRight size={15} /></Button>
        </div>
      </div>

      <div className="mt-10 grid gap-2 sm:grid-cols-3" aria-label="Plaid Sandbox connection preview">
        {[{ icon: Landmark, title: "First Platypus Bank", note: "Fictional Sandbox institution" }, { icon: DatabaseZap, title: "Seeded business checking", note: "28 synthetic transactions" }, { icon: ShieldCheck, title: "No real financial data", note: "Safe, repeatable judge demo" }].map(({ icon: Icon, title, note }) => (
          <div className="flex min-h-20 items-center gap-3 rounded-lg border border-border bg-card px-4" key={title}>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted"><Icon size={16} /></span>
            <div><p className="type-ui font-medium">{title}</p><p className="type-caption mt-1">{note}</p></div>
          </div>
        ))}
      </div>
      <p className="type-caption mt-3 text-center">The hackathon demo uses Plaid Sandbox and a fictional institution.</p>

      <div className="mt-8 overflow-hidden rounded-lg border border-border bg-primary p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-12 place-items-center rounded-lg bg-white text-black"><Zap size={20} /></span>
            <div>
              <p className="type-label text-white/55">Real Plaid Link flow</p>
              <h3 className="type-subsection mt-2 text-white">One connection starts the full search.</h3>
              <p className="type-caption mt-2 text-white/55">The user does not upload a fake transaction list or watch a canned animation.</p>
            </div>
          </div>
          <span className="type-label rounded-full border border-white/20 px-3 py-1 text-white/70">SANDBOX</span>
        </div>
        <div className="mt-6 grid overflow-hidden rounded-lg border border-white/10 sm:grid-cols-4">
          {[{ icon: ShieldCheck, label: "Request verified" }, { icon: Landmark, label: "Bank connected" }, { icon: DatabaseZap, label: "Transactions fetched" }, { icon: CheckCircle2, label: "Matches explained" }].map(({ icon: Icon, label }, index) => (
            <div className={`flex items-center gap-3 p-4 ${index < 3 ? "border-b border-white/10 sm:border-r sm:border-b-0" : ""}`} key={label}>
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10"><Icon className="text-white" size={15} /></span>
              <div><p className="type-caption text-white/40">0{index + 1}</p><p className="type-ui mt-0.5 font-medium text-white">{label}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section id="record-matching" className="mx-auto grid max-w-7xl gap-8 border-t border-border py-20 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
      <div>
        <p className="type-eyebrow">The result from fetched data</p>
        <h2 className="type-section mt-5 max-w-2xl">28 searched. 7 matched. 2 need review. 19 stayed protected.</h2>
        <p className="type-body mt-5 max-w-xl text-base leading-7">D4 asks for payments to Audrea Barnes. Served checks the connected account, explains each match, and keeps suppliers, other employees, and out-of-range payments outside the response.</p>
        <Button onClick={onGetStarted} className="mt-6">Run the D4 payment demo <ArrowUpRight size={15} /></Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-primary p-6 text-white">
        <div className="flex items-center justify-between">
          <p className="type-label text-white/45">Records to review</p>
          <span className="type-label rounded-full bg-white px-3 py-1 text-black">VERIFIED</span>
        </div>
        <div className="mt-8 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-white p-5 text-black"><p className="type-stat">7</p><p className="type-caption mt-1 font-medium text-black">include</p></div>
          <div className="rounded-lg bg-white/15 p-5"><p className="type-stat">2</p><p className="type-caption mt-1 text-white/70">review</p></div>
          <div className="rounded-lg bg-white/10 p-5"><p className="type-stat">19</p><p className="type-caption mt-1 text-white/60">exclude</p></div>
        </div>
        <div className="mt-3 space-y-2">{["Exact Audrea payee + in-range date", "Unnamed check needs review", "Near-name ACH needs review"].map((label) => (
          <div className="flex items-center gap-3 rounded-lg bg-white/10 px-4 py-3 type-ui text-white" key={label}><ShieldCheck size={16} />{label}</div>
        ))}</div>
      </div>
    </section>

    <section id="privacy" className="mx-auto max-w-7xl rounded-lg border border-border bg-card p-8 sm:p-12">
      <span className="type-label inline-flex rounded-full bg-muted px-3 py-1">Privacy boundary</span>
      <div className="mt-5 grid gap-8 md:grid-cols-2 md:items-end">
        <div>
          <h2 className="type-section max-w-2xl">No verification, no access.</h2>
          <p className="type-body mt-4 max-w-2xl text-base leading-7">D1 opens payroll matching. D4 opens bank-payment matching. Uncertain, suspicious, or unrelated requests keep those records locked.</p>
        </div>
        <div className="flex items-start gap-3 rounded-lg bg-black p-5 text-white">
          <LockKeyhole className="mt-0.5 shrink-0 text-white" size={18} />
          <p className="type-body text-white/70"><strong className="font-medium text-white">Nothing is sent automatically.</strong> Served shows possible matches for a person to review. It does not decide what must be shared.</p>
        </div>
      </div>
    </section>

    <section id="resources" className="mx-auto grid max-w-7xl gap-10 border-b border-border py-20 md:grid-cols-2">
      <div>
        <p className="type-eyebrow">The demo story</p>
        <h2 className="type-section mt-4">Raul Mendoza runs a restaurant. He does not have a legal team.</h2>
        <p className="type-body mt-3 max-w-xl">Raul moved from Mexico and built Mendoza’s Kitchen, a neighborhood restaurant. Then a financial subpoena arrives with a deadline and asks for records about a former employee. Served helps him understand it, verify it, and find the requested payroll or bank records without exposing everything else.</p>
        <Button variant="outline" onClick={onGetStarted} className="mt-6">Run Raul’s story →</Button>
      </div>
      <Accordion type="single" collapsible className="rounded-2xl border border-border bg-card px-6">
        <AccordionItem value="why-restaurants"><AccordionTrigger className="type-ui font-medium">Why is Raul a restaurant owner?</AccordionTrigger><AccordionContent className="type-body leading-6">Raul makes the small-business problem concrete. Restaurants manage hourly workers, time records, wage statements, and payroll data, often without a legal or HR team. The product can serve other small businesses facing the same problem.</AccordionContent></AccordionItem>
        <AccordionItem value="record-match"><AccordionTrigger className="type-ui font-medium">Does a match mean the record must be shared?</AccordionTrigger><AccordionContent className="type-body leading-6">No. A match means the record fits the displayed employee, type, and date criteria. A person must review the manifest and decide what to do with qualified legal help when needed.</AccordionContent></AccordionItem>
        <AccordionItem value="bank"><AccordionTrigger className="type-ui font-medium">When does Served connect a bank?</AccordionTrigger><AccordionContent className="type-body leading-6">Only D4 asks for payment and bank records, so only a verified D4-style request unlocks Plaid. D1 uses payroll data instead. Uncertain, scam, and unrelated verified requests fail closed.</AccordionContent></AccordionItem>
        <AccordionItem value="legal-advice" className="border-b-0"><AccordionTrigger className="type-ui font-medium">Is this legal advice?</AccordionTrigger><AccordionContent className="type-body leading-6">No. Served organizes evidence, candidate records, and limitations. Urgent or high-stakes requests should be reviewed by a qualified professional.</AccordionContent></AccordionItem>
      </Accordion>
    </section>
  </div>
}
