import { AnimatePresence, motion } from "motion/react"
import { Menu, X } from "lucide-react"
import { useState } from "react"

import { BrandMark } from "@/components/BrandMark"

const links = [
  { label: "how it works", href: "#how-it-works" },
  { label: "evidence", href: "#evidence" },
  { label: "privacy", href: "#privacy" },
  { label: "resources", href: "#resources" },
]

export function Navbar({ onGetStarted }: { onGetStarted: () => void }) {
  const [open, setOpen] = useState(false)
  return <>
    <nav className="fixed top-0 left-0 z-50 w-full bg-gradient-to-b from-[#f1f1f1]/80 to-transparent py-6 backdrop-blur-[2px] md:py-10">
      <div className="mx-auto grid max-w-7xl grid-cols-12 items-center gap-x-4 px-8 md:gap-x-8 md:px-16 lg:px-20">
        <a href="#top" className="col-span-6 flex items-center gap-2 md:col-span-3" aria-label="Served home">
          <BrandMark className="size-8 shrink-0" /><span className="font-display text-xl tracking-[-.04em]">Served</span>
        </a>
        <div className="col-span-6 hidden items-center justify-center gap-6 md:col-span-6 md:flex">
          {links.map((link) => <a className="text-[11px] lowercase tracking-tight text-zinc-700 transition-colors hover:text-black" href={link.href} key={link.label}>{link.label}</a>)}
        </div>
        <div className="col-span-6 hidden items-center justify-end gap-3 md:col-span-3 md:flex">
          <a href="#resources" className="text-xs text-zinc-700 hover:text-black">find help</a>
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
          {links.map((link) => <a onClick={() => setOpen(false)} href={link.href} key={link.label}>{link.label}</a>)}
          <a href="#resources" onClick={() => setOpen(false)}>find help</a>
          <button onClick={() => { setOpen(false); onGetStarted() }} className="w-fit rounded-full bg-[#1a1a1a] px-5 py-2.5 text-white">get started →</button>
        </div>
      </motion.div>}
    </AnimatePresence>
  </>
}
