/** CC0 Lady Justice (Iustitia) — https://commons.wikimedia.org/wiki/File:Iustitia.svg */
export function BrandMark({ inverse = false, className = "size-8" }: { inverse?: boolean; className?: string }) {
  const tone = inverse ? "brightness-0 invert" : "brightness-0"

  return (
    <img
      src="/brand-iustitia-256.png"
      alt=""
      aria-hidden
      width={256}
      height={256}
      decoding="async"
      className={`${className} shrink-0 object-contain ${tone}`}
    />
  )
}
