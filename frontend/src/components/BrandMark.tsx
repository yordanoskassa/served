/** CC0 Lady Justice (Iustitia) — https://commons.wikimedia.org/wiki/File:Iustitia.svg */
import themisMark from "@/assets/brand-themis-square.png"

export function BrandMark({ inverse = false, className = "size-8" }: { inverse?: boolean; className?: string }) {
  const tone = inverse ? "brightness-0 invert" : ""

  return (
    <img
      src={themisMark}
      alt=""
      aria-hidden
      width={128}
      height={128}
      decoding="async"
      className={`${className} object-contain ${tone}`}
    />
  )
}
