import { AnimatePresence, motion } from "motion/react"
import { Menu, X } from "lucide-react"
import { useState } from "react"

import { BrandMark } from "@/components/BrandMark"
import { Button } from "@/components/ui/button"

const links = [
  { label: "workflow", href: "#workflow" },
  { label: "bank", href: "#bank-connection" },
  { label: "results", href: "#record-matching" },
  { label: "privacy", href: "#privacy" },
]

export function Navbar({ onGetStarted }: { onGetStarted: () => void }) {
  const [open, setOpen] = useState(false)
  return <>
    <nav className="fixed top-0 left-0 z-50 w-full border-b border-border bg-background/90 py-5 backdrop-blur-xl md:py-6">
      <div className="mx-auto grid max-w-7xl grid-cols-12 items-center gap-x-4 px-8 md:gap-x-8 md:px-16 lg:px-20">
        <a href="#top" className="col-span-6 flex items-center gap-2 md:col-span-3" aria-label="Served home">
          <BrandMark className="size-8 shrink-0" /><span className="font-display text-xl font-normal tracking-[-.03em]">Served</span>
        </a>
        <div className="col-span-6 hidden items-center justify-center gap-6 md:col-span-6 md:flex">
          {links.map((link) => <a className="type-caption font-medium lowercase transition-colors hover:text-foreground" href={link.href} key={link.label}>{link.label}</a>)}
        </div>
        <div className="col-span-6 hidden items-center justify-end gap-3 md:col-span-3 md:flex">
          <a href="#resources" className="type-ui text-muted-foreground hover:text-foreground">the story</a>
          <Button onClick={onGetStarted} className="px-4 py-2 text-sm font-medium">run the demo <span aria-hidden="true">→</span></Button>
        </div>
        <button type="button" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((value) => !value)} className="col-span-6 flex justify-end md:hidden">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </nav>
    <AnimatePresence>
      {open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="fixed top-[84px] left-0 z-40 w-full overflow-hidden border-b border-border bg-background/95 px-8 backdrop-blur-xl md:hidden">
        <div className="flex flex-col gap-5 py-7 text-sm">
          {links.map((link) => <a onClick={() => setOpen(false)} href={link.href} key={link.label}>{link.label}</a>)}
          <a href="#resources" onClick={() => setOpen(false)}>the story</a>
          <Button onClick={() => { setOpen(false); onGetStarted() }} className="w-fit px-5 py-2.5">run the demo →</Button>
        </div>
      </motion.div>}
    </AnimatePresence>
  </>
}
