import { ArrowRight, PlayCircle } from "lucide-react"
import type { ReactNode } from "react"

import { BrandMark } from "@/components/BrandMark"
import { Button } from "@/components/ui/button"

export function LoginPage({
  destination = "your workspace",
  onContinueDemo,
  googleSignIn,
}: {
  destination?: string
  onContinueDemo?: () => void
  googleSignIn: ReactNode
}) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-border bg-background p-2">
      <div className="relative w-full rounded-[22px] border border-border bg-card p-8 text-center sm:p-10">
        <div className="mb-7 flex justify-center">
          <BrandMark className="size-12" />
        </div>
        <h1 className="type-subsection text-foreground">Sign in for {destination}</h1>
        <p className="type-body mx-auto mt-3 max-w-xs">
          Google account required to save requests and connect your own bank. Or continue as a guest with reviewed samples.
        </p>

        {googleSignIn}

        {onContinueDemo && (
          <>
            <div className="my-4 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-black/10" />
              <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-400">or</span>
              <span className="h-px flex-1 bg-black/10" />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={onContinueDemo}
              className="w-full border-black/15 bg-white py-3.5 font-semibold hover:bg-brand-soft"
            >
              <PlayCircle size={17} /> Continue as guest (judge demo) <ArrowRight size={15} />
            </Button>
            <p className="mt-3 text-[11px] leading-5 text-zinc-500">
              Same workspace UI with seeded D1–D4 requests and a reviewed bank fixture—no Google account.
            </p>
          </>
        )}
        <p className="mt-5 type-caption">No shared login · no automatic sharing</p>
      </div>
    </div>
  )
}
