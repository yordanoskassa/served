import { cva, type VariantProps } from "class-variance-authority"
import type { HTMLAttributes } from "react"

import { cn } from "@/lib/utils"

const badgeVariants = cva("inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-brand-soft text-black",
      secondary: "bg-black/5 text-zinc-600",
      warning: "bg-amber-100 text-amber-800",
      destructive: "bg-orange-100 text-orange-800",
      outline: "border border-black/10 bg-white/60 text-zinc-700",
    },
  },
  defaultVariants: { variant: "default" },
})

function Badge({ className, variant, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
