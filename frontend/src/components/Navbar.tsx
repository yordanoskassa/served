import { AnimatePresence, motion } from "motion/react"
import { Menu, X } from "lucide-react"
import { useState } from "react"

const links = ["how it works", "your documents", "evidence", "resources"]

function FlowerMark() {
  return <svg aria-hidden="true" className="size-8 shrink-0" viewBox="0 0 36 36" fill="none">
    <path fill="#1a1a1a" d="M18 2c3.2 0 5.3 2.7 5.3 6.5 0 1.2-.2 2.4-.5 3.5 1-1.1 2.5-2 4-2.5 3.7-1.2 6.8.2 7.8 3.1 1.1 3.2-.8 6.5-4.6 7.8-1.1.4-2.3.5-3.5.4 1.1.8 2 1.7 2.7 2.8 2 3.3 1 6.6-1.6 8.3-2.9 1.9-6.4.4-8.3-2.9-.6-1-.9-2.1-1.1-3.2-.5 1.1-1.2 2.2-2.1 3-2.8 2.7-6.4 2.5-8.5 0-2.2-2.7-1.1-6.3 1.7-8.8.9-.8 2-1.4 3.1-1.8-1.2-.2-2.4-.6-3.4-1.2-3.4-1.9-4.4-5.3-2.7-8 1.7-2.8 5.3-3.2 8.6-1.3 1 .6 1.9 1.4 2.6 2.4-.2-1.1-.3-2.3-.2-3.4C12 4.6 14.4 2 18 2Z"/>
    <circle cx="18" cy="18" r="3.6" fill="#EDEEF5"/>
  </svg>
}

export function Navbar({ onGetStarted }: { onGetStarted: () => void }) {
  const [open, setOpen] = useState(false)
  return <>
    <nav className="fixed top-0 left-0 z-50 w-full bg-gradient-to-b from-[#f1f1f1]/80 to-transparent py-6 backdrop-blur-[2px] md:py-10">
      <div className="mx-auto grid max-w-7xl grid-cols-12 items-center gap-x-4 px-8 md:gap-x-8 md:px-16 lg:px-20">
        <a href="#top" className="col-span-6 flex items-center gap-2 md:col-span-3" aria-label="Served home">
          <FlowerMark /><span className="font-display text-xl tracking-[-.04em]">Served</span>
        </a>
        <div className="col-span-6 hidden items-center justify-center gap-6 md:col-span-6 md:flex">
          {links.map((link) => <a className="text-[11px] lowercase tracking-tight text-zinc-700 transition-colors hover:text-black" href={`#${link.replaceAll(" ", "-")}`} key={link}>{link}</a>)}
        </div>
        <div className="col-span-6 hidden items-center justify-end gap-3 md:col-span-3 md:flex">
          <a href="#help" className="text-xs text-zinc-700 hover:text-black">find help</a>
          <button onClick={onGetStarted} className="rounded-full bg-[#1a1a1a] px-4 py-2 text-xs font-medium text-white transition-transform hover:scale-[1.03]">get started <span aria-hidden="true">→</span></button>
        </div>
        <button type="button" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((value) => !value)} className="col-span-6 flex justify-end md:hidden">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </nav>
    <AnimatePresence>
      {open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="fixed top-[84px] left-0 z-40 w-full overflow-hidden border-b border-black/10 bg-bg-base/95 px-8 backdrop-blur-xl md:hidden">
        <div className="flex flex-col gap-5 py-7 text-sm">
          {links.map((link) => <a onClick={() => setOpen(false)} href={`#${link.replaceAll(" ", "-")}`} key={link}>{link}</a>)}
          <a href="#help" onClick={() => setOpen(false)}>find help</a>
          <button onClick={() => { setOpen(false); onGetStarted() }} className="w-fit rounded-full bg-[#1a1a1a] px-5 py-2.5 text-white">get started →</button>
        </div>
      </motion.div>}
    </AnimatePresence>
  </>
}
