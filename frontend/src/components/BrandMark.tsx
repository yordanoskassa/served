/** Classic Lady Justice (Iustitia) — blindfold, scales, sword. CC0, Wikimedia Commons. */
import ladyJustice from "@/assets/brand-iustitia-256.png"

export function BrandMark({ inverse = false, className = "size-8" }: { inverse?: boolean; className?: string }) {
  return (
    <img
      src={ladyJustice}
      alt=""
      aria-hidden
      width={256}
      height={256}
      decoding="async"
      draggable={false}
      className={`object-contain object-center ${inverse ? "brightness-0 invert" : ""} ${className}`}
    />
  )
}
