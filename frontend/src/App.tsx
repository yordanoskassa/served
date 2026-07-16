import { ArrowRight, CheckCircle2, CircleHelp, Languages, ShieldAlert } from "lucide-react"

import { UploadCard } from "@/components/UploadCard"
import { Button } from "@/components/ui/button"

const outcomes = [
  { icon: CheckCircle2, label: "Evidence supports it", tone: "text-pine" },
  { icon: CircleHelp, label: "Cannot confirm", tone: "text-amber-700" },
  { icon: ShieldAlert, label: "Scam warning signs", tone: "text-coral" },
]

export function App() {
  return (
    <main className="min-h-screen overflow-hidden">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <a className="flex items-center gap-3 font-semibold" href="#">
          <span className="grid size-9 place-items-center rounded-xl bg-pine text-white">S</span>
          Served
        </a>
        <Button variant="outline" className="hidden sm:inline-flex">
          <Languages size={17} /> English
        </Button>
      </nav>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:pt-20">
        <div>
          <div className="mb-5 inline-flex rounded-full border border-pine/20 bg-pine/5 px-3 py-1 text-xs font-semibold uppercase tracking-[.14em] text-pine">
            Understand before you act
          </div>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[1.02] tracking-[-.045em] sm:text-6xl">
            Scary legal mail, explained clearly.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            Take a photo. Served reads the document, checks key details against available evidence, and tells you when a human should step in.
          </p>
          <div className="mt-8 flex flex-wrap gap-5">
            {outcomes.map(({ icon: Icon, label, tone }) => (
              <div className="flex items-center gap-2 text-sm font-medium" key={label}>
                <Icon className={tone} size={18} /> {label}
              </div>
            ))}
          </div>
          <a className="mt-9 inline-flex items-center gap-2 text-sm font-semibold text-pine" href="#how-it-works">
            See how it works <ArrowRight size={16} />
          </a>
        </div>
        <UploadCard />
      </section>

      <section className="border-t border-border bg-white/60" id="how-it-works">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 text-sm sm:grid-cols-3 sm:px-8">
          <p><strong>1. Read</strong><br /><span className="text-muted-foreground">Extract names, case details, and dates.</span></p>
          <p><strong>2. Check</strong><br /><span className="text-muted-foreground">Compare key facts with available sources.</span></p>
          <p><strong>3. Decide safely</strong><br /><span className="text-muted-foreground">See the evidence or ask a qualified human.</span></p>
        </div>
      </section>
    </main>
  )
}
