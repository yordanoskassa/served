/** Lady Justice (Iustitia) — same asset in nav, mailbox, login, and favicon. */
import iustitiaMark from "@/assets/brand-iustitia-256.png"

export function BrandMark({ inverse = false, className = "size-8" }: { inverse?: boolean; className?: string }) {
  return (
    <img
      src={iustitiaMark}
      alt=""
      aria-hidden
      width={256}
      height={256}
      decoding="async"
      draggable={false}
      className={`object-contain ${inverse ? "brightness-0 invert" : ""} ${className}`}
    />
  )
}
