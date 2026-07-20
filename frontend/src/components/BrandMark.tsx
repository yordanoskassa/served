/** CC0 Lady Justice (Iustitia) — https://commons.wikimedia.org/wiki/File:Iustitia.svg */
import themisMark from "@/assets/brand-iustitia-256.png"

export function BrandMark({ inverse = false, className = "size-8" }: { inverse?: boolean; className?: string }) {
  const tone = inverse ? "brightness-0 invert" : ""

  return (
    <img
      src={themisMark}
      alt=""
      aria-hidden
      width={256}
      height={256}
      decoding="async"
      className={`${className} object-contain ${tone}`}
    />
  )
}
