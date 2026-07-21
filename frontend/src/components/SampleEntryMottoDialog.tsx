import { ArrowRight, PlayCircle } from "lucide-react"

import { BrandMark } from "@/components/BrandMark"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { entryLabel, type EntryIntent } from "@/lib/entry"

const SAMPLE_MOTTO =
  "Raul Mendoza runs Mendoza’s Kitchen—not a legal department. Served is for owners who need a clear next step when a financial subpoena lands in the mail."

export function SampleEntryMottoDialog({
  intent,
  open,
  onOpenChange,
  onSignIn,
  onBypassDemo,
}: {
  intent: Exclude<EntryIntent, "upload"> | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSignIn: () => void
  onBypassDemo: () => void
}) {
  if (!intent) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-[28px] border-border bg-background p-0 shadow-none">
        <div className="rounded-[28px] border border-border bg-card p-8 text-center sm:p-10">
          <DialogHeader className="items-center space-y-0 text-center">
            <div className="mb-5 flex justify-center">
              <BrandMark className="size-11" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-400">Reviewed fixture</p>
            <DialogTitle className="type-subsection mt-2 text-foreground">{entryLabel(intent)}</DialogTitle>
            <DialogDescription asChild>
              <blockquote className="type-body mx-auto mt-4 max-w-sm border-l-2 border-border pl-4 text-left text-zinc-600 not-italic">
                {SAMPLE_MOTTO}
              </blockquote>
            </DialogDescription>
          </DialogHeader>

          <div className="mt-8 space-y-3">
            <Button type="button" className="w-full py-3.5" onClick={onSignIn}>
              Sign in with Google
              <ArrowRight size={15} />
            </Button>
            <Button type="button" variant="outline" className="w-full border-black/15 bg-white py-3.5 font-semibold hover:bg-brand-soft" onClick={onBypassDemo}>
              <PlayCircle size={17} /> Continue without sign-in
            </Button>
            <p className="text-[11px] leading-5 text-zinc-500">
              Bypass uses seeded demo data only—no Google account, no personal uploads. Choose sign-in when you want your own saved requests.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
