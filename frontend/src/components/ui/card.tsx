import type { HTMLAttributes } from "react"

import { cn } from "@/lib/utils"

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[28px] border border-black/10 bg-white/55 shadow-[0_16px_50px_rgba(0,0,0,.06)] backdrop-blur-xl", className)} {...props} />
}
