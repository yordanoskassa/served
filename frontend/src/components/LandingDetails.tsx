import { ArrowUpRight, FileSearch, Scale, ShieldCheck } from "lucide-react"

export function LandingDetails({ onGetStarted }: { onGetStarted: () => void }) {
  return <div className="bg-bg-base px-8 pb-24 md:px-16 lg:px-20">
    <section id="how-it-works" className="mx-auto max-w-7xl border-t border-black/10 py-20">
      <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">How it works</p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[{ icon: FileSearch, title: "Read", text: "Extract the visible names, dates, court details, demands, and deadlines." }, { icon: Scale, title: "Cross-check", text: "Compare claims with available official records and independent warning-signal sources." }, { icon: ShieldCheck, title: "Act carefully", text: "See what matched, what could not be checked, and the safest next step." }].map(({ icon: Icon, title, text }, index) => <article className="rounded-[28px] border border-black/5 bg-white/55 p-6 backdrop-blur-xl" key={title}><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-full bg-brand-green"><Icon size={17} /></span><span className="text-xs text-zinc-400">0{index + 1}</span></div><h2 className="mt-8 font-display text-2xl tracking-[-.04em]">{title}</h2><p className="mt-3 text-sm leading-6 text-zinc-500">{text}</p></article>)}
      </div>
    </section>

    <section id="evidence" className="mx-auto grid max-w-7xl gap-8 border-t border-black/10 py-20 md:grid-cols-2 md:items-end">
      <div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">Evidence, not certainty theater</p><h2 className="mt-5 max-w-2xl font-display text-4xl tracking-[-.055em] sm:text-6xl">A court-record match does not prove a letter is authentic.</h2></div>
      <div><p className="max-w-lg text-sm leading-7 text-zinc-500">Served separates extracted facts, external checks, warning signals, and limitations. If a source is unavailable or evidence conflicts, the result should say so plainly.</p><button onClick={onGetStarted} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#1a1a1a] px-5 py-3 text-sm text-white">Start an analysis <ArrowUpRight size={15} /></button></div>
    </section>

    <section id="privacy" className="mx-auto max-w-7xl rounded-[32px] bg-brand-green p-8 sm:p-12"><p className="text-[10px] font-semibold uppercase tracking-[.2em]">Privacy</p><h2 className="mt-4 max-w-2xl font-display text-4xl tracking-[-.05em]">Clear handling, clear limits.</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-black/65">Uploaded file bytes are processed to produce the analysis. The workspace saves analysis metadata and results to your signed-in account. Served is an evidence tool, not a substitute for a lawyer or an official court notice.</p></section>

    <section id="resources" className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-6 border-b border-black/10 py-20"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">Need human help?</p><h2 className="mt-4 font-display text-4xl tracking-[-.05em]">Use independently sourced official channels.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">Contact the court using its official website or ask a qualified attorney to review urgent or high-stakes correspondence.</p></div><button onClick={onGetStarted} className="rounded-full border border-black/10 bg-white/65 px-5 py-3 text-sm">Open your workspace →</button></section>
  </div>
}
