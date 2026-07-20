/** CC0 Lady Justice (Iustitia) — https://commons.wikimedia.org/wiki/File:Iustitia.svg */
export function BrandMark({ inverse = false, className = "size-8" }: { inverse?: boolean; className?: string }) {
  const tone = inverse ? "brightness-0 invert" : ""

  return (
    <span className={`inline-block shrink-0 overflow-hidden ${className}`} aria-hidden>
      <img
        src="/brand-themis.png"
        alt=""
        className={`size-full object-cover object-[50%_8%] scale-[1.35] ${tone}`}
      />
    </span>
  )
}
