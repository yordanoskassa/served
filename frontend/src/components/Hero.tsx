import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Upload } from "lucide-react"
import { useEffect, useRef, type Ref } from "react"

import { BrandMark } from "@/components/BrandMark"
import { Button } from "@/components/ui/button"
import type { EntryIntent } from "@/lib/entry"

const letters = [
  { id: "D1" as const, title: "Letter 1", note: "Sample case D1", rotate: -5 },
  { id: "D2" as const, title: "Letter 2", note: "Sample case D2", rotate: 1.5 },
  { id: "D3" as const, title: "Letter 3", note: "Sample case D3", rotate: 5 },
]

function FlyingLetter({ letter, index, onSelect, buttonRef }: {
  letter: (typeof letters)[number]
  index: number
  onSelect: (intent: EntryIntent) => void
  buttonRef?: Ref<HTMLButtonElement>
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.button
      type="button"
      ref={buttonRef}
      aria-label={`Choose Letter ${index + 1}, sample ${letter.id}`}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 190, scale: .35, rotate: 0 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: reduceMotion ? 0 : letter.rotate }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 80, scale: .7 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 115, damping: 15, delay: .12 + index * .12 }}
      whileHover={reduceMotion ? undefined : { y: -10, rotate: 0, scale: 1.025 }}
      whileTap={reduceMotion ? undefined : { scale: .98 }}
      onClick={() => onSelect(letter.id)}
      className={`group relative aspect-[1.45/1] min-w-0 overflow-hidden rounded-[10px] border border-black/10 bg-[#fffdf6] p-3 text-left shadow-[0_24px_70px_rgba(37,40,33,.16)] transition-shadow hover:shadow-[0_30px_85px_rgba(37,40,33,.23)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black sm:col-span-1 sm:w-auto sm:rounded-[14px] sm:p-5 ${index === 2 ? "col-span-2 w-[calc(50%-4px)] justify-self-center" : ""}`}
    >
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full text-black/[.08]" viewBox="0 0 300 190" preserveAspectRatio="none">
        <path d="M1 188 112 87c22-20 54-20 76 0l111 101" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M1 1 119 104c18 16 44 16 62 0L299 1" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <div className="relative z-10 flex items-start justify-between">
        <span className="grid size-7 place-items-center rounded-full bg-[#1a1a1a] text-[9px] font-semibold text-white sm:size-9 sm:text-[10px]">{letter.id}</span>
        <span className="grid size-7 place-items-center border border-dashed border-black/25 bg-brand-soft sm:size-9"><BrandMark className="size-4 sm:size-5" /></span>
      </div>
      <div className="absolute inset-x-3 bottom-3 z-10 sm:inset-x-5 sm:bottom-5">
        <p className="truncate font-display text-sm font-medium tracking-[-.03em] text-[#1a1a1a] sm:text-lg">{letter.title}</p>
        <p className="mt-0.5 hidden text-[10px] text-zinc-400 sm:block">{letter.note}</p>
      </div>
    </motion.button>
  )
}

function ServedMailbox({ open, onOpen, onSelect }: {
  open: boolean
  onOpen: () => void
  onSelect: (intent: EntryIntent) => void
}) {
  const reduceMotion = useReducedMotion()
  return (
    <div className="relative h-[350px] w-[310px] sm:h-[390px] sm:w-[410px]" style={{ perspective: "900px" }}>
      <div className="absolute bottom-4 left-1/2 h-9 w-64 -translate-x-1/2 rounded-[50%] bg-black/10 blur-md sm:w-80" />
      <div className="absolute bottom-8 left-1/2 h-40 w-14 -translate-x-1/2 rounded-b-xl bg-[#9d3a34] shadow-[inset_-10px_0_20px_rgba(0,0,0,.12)] sm:h-44 sm:w-16" />
      <div className="absolute bottom-5 left-1/2 h-6 w-36 -translate-x-1/2 rounded-full bg-[#7d302c] sm:w-44" />

      <motion.div
        aria-hidden="true"
        animate={{ rotate: open ? 0 : -82 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 95, damping: 14 }}
        className="absolute right-2 bottom-[184px] z-0 h-36 w-3 origin-bottom rounded-full bg-[#812d29] sm:right-5 sm:bottom-[210px] sm:h-40"
      >
        <div className="absolute -top-1 left-0 h-16 w-12 rounded-r-lg rounded-tl-lg bg-[#d75a4f] shadow-md" />
      </motion.div>

      <div className="absolute bottom-[135px] left-1/2 h-[185px] w-[270px] -translate-x-1/2 rounded-t-[135px] rounded-b-[28px] bg-[#3a2725] p-3 shadow-[0_30px_75px_rgba(78,43,38,.28)] sm:bottom-[155px] sm:h-[215px] sm:w-[330px] sm:rounded-t-[170px] sm:p-4">
        <div className="h-full w-full rounded-t-[125px] rounded-b-[22px] bg-[radial-gradient(circle_at_50%_65%,#6e4a45_0%,#2b1c1a_68%)] sm:rounded-t-[155px]" />
        <motion.button
          type="button"
          aria-label={open ? "Served mailbox open" : "Open the Served mailbox"}
          aria-expanded={open}
          aria-controls="served-letter-choices"
          disabled={open}
          onClick={onOpen}
          animate={open ? { rotateX: reduceMotion ? -74 : -102, y: 20 } : { rotateX: 0, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 14 }}
          style={{ transformOrigin: "50% 100%", transformStyle: "preserve-3d" }}
          className={`group/mailbox absolute inset-0 appearance-none rounded-t-[135px] rounded-b-[28px] border border-[#a63d35] bg-[#cf5047] p-0 text-left shadow-[inset_0_8px_18px_rgba(255,255,255,.14),inset_-18px_-14px_30px_rgba(87,24,22,.16)] sm:rounded-t-[170px] ${reduceMotion ? "" : "transition-[filter,box-shadow]"} ${open ? "pointer-events-none" : "cursor-pointer hover:brightness-[1.035] hover:shadow-[inset_0_8px_18px_rgba(255,255,255,.19),inset_-18px_-14px_30px_rgba(87,24,22,.12),0_18px_45px_rgba(78,43,38,.18)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black/20 focus-visible:ring-offset-4 focus-visible:ring-offset-bg-base"}`}
        >
          <span aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-[inherit]">
            <span className={`absolute -top-1/2 -left-1/3 h-[190%] w-1/3 -rotate-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 ${reduceMotion ? "" : "transition-all duration-700 group-hover/mailbox:left-full group-hover/mailbox:opacity-100"}`} />
          </span>
          <div className="absolute inset-x-8 top-[42%] h-px bg-black/10" />
          <div className="absolute inset-x-0 top-[48%] text-center">
            <p className="font-display text-[clamp(2rem,7vw,3.2rem)] font-semibold tracking-[-.07em] text-[#fffaf1]">Served</p>
            <p className="mt-1 text-[8px] font-semibold uppercase tracking-[.28em] text-white/55 sm:text-[9px]">legal mail, made clearer</p>
          </div>
          {!open && <span aria-hidden="true" className={`absolute inset-x-0 bottom-5 z-10 flex items-center justify-center gap-2 text-[9px] font-semibold uppercase tracking-[.2em] text-white/60 group-hover/mailbox:text-white sm:bottom-7 ${reduceMotion ? "" : "transition-colors"}`}>
            Open
            <span className={`grid size-6 place-items-center rounded-full border border-white/25 bg-white/[.07] text-[11px] group-hover/mailbox:border-white/45 ${reduceMotion ? "" : "transition-transform duration-300 group-hover/mailbox:-translate-y-0.5 group-hover/mailbox:translate-x-0.5"}`}>↗</span>
          </span>}
        </motion.button>
      </div>

      <AnimatePresence>
        {open && <motion.div initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={reduceMotion ? { duration: 0 } : { delay: .58, duration: .35 }} className="absolute bottom-[48px] left-1/2 z-30 -translate-x-1/2 sm:bottom-[56px]">
          <Button type="button" aria-label="Upload your own legal letter" onClick={() => onSelect("upload")} className="h-10 whitespace-nowrap border border-white/60 bg-[#fffaf1] px-4 text-[#1a1a1a] shadow-[0_10px_30px_rgba(20,12,10,.26)] hover:bg-white sm:px-5">
            <Upload size={15} /> Upload your own
          </Button>
        </motion.div>}
      </AnimatePresence>
    </div>
  )
}

export function Hero({ open, onOpen, onSelect }: {
  open: boolean
  onOpen: () => void
  onSelect: (intent: EntryIntent) => void
}) {
  const reduceMotion = useReducedMotion()
  const firstLetter = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const timeout = window.setTimeout(() => firstLetter.current?.focus(), reduceMotion ? 0 : 850)
    return () => window.clearTimeout(timeout)
  }, [open, reduceMotion])

  return <section id="top" className="relative min-h-[100svh] w-full overflow-hidden bg-bg-base">
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[72%] overflow-hidden">
      <img src="/served-hero.jpg" alt="" className="h-full w-full object-cover object-bottom opacity-35 grayscale-[15%]" />
      <div className="absolute inset-0 bg-gradient-to-b from-bg-base via-bg-base/55 to-bg-base/10" />
    </div>
    <div className="pointer-events-none absolute top-[22%] left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-white/40 blur-3xl" />

    <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center px-5 pt-24 text-center sm:px-8 sm:pt-28 lg:px-20">
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-[10px] font-semibold uppercase tracking-[.24em] text-zinc-500">An evidence-first legal-mail experience</motion.p>
      <AnimatePresence mode="wait">
        <motion.div key={open ? "open" : "closed"} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: reduceMotion ? 0 : .45 }} className="mt-4">
          <h1 className="font-display text-[clamp(2.75rem,6.2vw,6rem)] font-medium leading-[.9] tracking-[-.07em] text-[#1a1a1a]">
            {open ? <>Three letters.<br /><span className="text-[#8e8e8e]">Three evidence trails.</span></> : <>You’ve got legal mail.<br /><span className="text-[#8e8e8e]">Open it carefully.</span></>}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-zinc-500 sm:text-base">
            {open ? "Choose a sample letter, or use the button on the mailbox to bring your own. You’ll sign in before anything is analyzed." : "Open the red Served mailbox to explore three sample cases—then follow the facts from the letter to the record."}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>

    <div
      id="mailbox-stage"
      className={`relative z-10 mx-auto w-full max-w-6xl px-3 sm:px-8 ${open ? "mt-3 h-[650px] sm:h-[610px]" : "-mt-2 h-[390px] sm:-mt-5 sm:h-[420px]"}`}
    >
      <AnimatePresence>
        {open && <motion.div id="served-letter-choices" role="group" aria-label="Choose a sample letter" className="absolute top-4 left-1/2 z-30 grid w-[min(94vw,850px)] -translate-x-1/2 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-6">
          {letters.map((letter, index) => <FlyingLetter key={letter.id} letter={letter} index={index} onSelect={onSelect} buttonRef={index === 0 ? firstLetter : undefined} />)}
        </motion.div>}
      </AnimatePresence>
      <motion.div
        animate={{ y: open ? -72 : 0, scale: open ? .92 : 1 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 85, damping: 17 }}
        className="absolute bottom-0 left-1/2 -translate-x-1/2"
      >
        <ServedMailbox open={open} onOpen={onOpen} onSelect={onSelect} />
      </motion.div>
    </div>

    <p aria-live="polite" className="sr-only">{open ? "Mailbox open. Choose Letter 1, Letter 2, Letter 3, or upload your own document." : "Mailbox closed."}</p>
    <span className="absolute bottom-6 left-6 z-20 text-[10px] tracking-wide text-zinc-500 md:left-16">{new Date().getFullYear()}</span>
    <span className="absolute right-6 bottom-6 z-20 text-[10px] tracking-wide text-zinc-500 md:right-16">three agents · one code-decided verdict</span>
  </section>
}
