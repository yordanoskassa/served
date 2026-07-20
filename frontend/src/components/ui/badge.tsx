import { cva, type VariantProps } from "class-variance-authority"
import type { HTMLAttributes } from "react"

import { cn } from "@/lib/utils"

const badgeVariants = cva("inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-medium", {
  variants: {
    variant: {
      default: "border-foreground bg-foreground text-background",
      secondary: "border-border bg-muted text-muted-foreground",
      warning: "border-foreground/30 bg-muted text-foreground",
      destructive: "border-foreground bg-muted text-foreground",
      outline: "border-border bg-background text-muted-foreground",
    },
  },
  defaultVariants: { variant: "default" },
})

function Badge({ className, variant, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
