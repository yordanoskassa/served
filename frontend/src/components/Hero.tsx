import { motion } from "motion/react"

export function Hero({ onGetStarted }: { onGetStarted: () => void }) {
  return <section id="top" className="relative flex min-h-[110vh] w-full flex-col items-center justify-start overflow-hidden bg-bg-base sm:min-h-[140vh]">
    <div className="pointer-events-none absolute top-[15vh] left-0 z-0 h-[95vh] w-full sm:top-[20vh] sm:h-[120vh]">
      <img src="/served-hero.jpg" alt="" className="h-full w-full object-cover object-center" />
      <div className="absolute top-0 left-0 h-24 w-full bg-gradient-to-b from-bg-base to-transparent sm:h-32" />
      <div className="absolute inset-0 bg-bg-base/5" />
    </div>
    <div className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-12 gap-x-4 px-8 pt-[23vh] md:gap-x-8 md:px-16 md:pt-[27vh] lg:px-20">
      <div className="col-span-12 md:col-span-10 md:col-start-2">
        <motion.h1 initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="max-w-5xl font-display text-[clamp(2.7rem,7vw,7.5rem)] font-medium leading-[.93] tracking-[-.065em] text-[#8e8e8e]">
          <span className="text-[#1a1a1a]">Served makes legal mail</span><br />
          easier to understand<br />
          with evidence and clear next steps<br />
          before you <span className="inline-flex w-[16px] items-center justify-center rounded-full border-2 border-[#1a1a1a] align-[.08em] md:w-[42px] lg:w-[62px]"><span className="size-2 rounded-full bg-[#1a1a1a]" /></span> act.
        </motion.h1>
        <motion.button type="button" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: .15 }} onClick={onGetStarted} className="mt-8 flex w-full max-w-md items-center rounded-[6px] border border-black/[0.05] bg-white p-1 pl-4 text-left shadow-sm transition-transform hover:-translate-y-0.5">
          <span className="min-w-0 flex-1 text-sm text-zinc-500">Analyze a legal letter</span>
          <span className="relative flex size-9 items-center justify-center rounded-full bg-[#1a1a1a] text-white"><svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M3 7.5h8M7.5 3.5l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        </motion.button>
      </div>
    </div>
    <div className="absolute top-1/2 right-0 z-20 -translate-y-1/2 rounded-l-full border border-black/10 bg-white/55 px-4 py-2 text-xs shadow-sm backdrop-blur-md">PDF · JPG · PNG</div>
    <span className="absolute bottom-8 left-8 z-20 text-[10px] tracking-wide text-zinc-500 md:left-16">{new Date().getFullYear()}</span>
    <span className="absolute right-8 bottom-8 z-20 text-[10px] tracking-wide text-zinc-500 md:right-16">evidence-first tools</span>
  </section>
}
