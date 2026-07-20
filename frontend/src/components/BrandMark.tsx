/** Ornate Lady Justice mark — layered B/W SVG (scales, sword, blindfold, frame). */
export function BrandMark({ inverse = false, className = "size-8" }: { inverse?: boolean; className?: string }) {
  const ink = inverse ? "var(--color-bg-base)" : "var(--color-ink)"
  const soft = inverse ? "color-mix(in srgb, var(--color-bg-base) 42%, transparent)" : "color-mix(in srgb, var(--color-ink) 38%, transparent)"
  const hair = inverse ? "color-mix(in srgb, var(--color-bg-base) 68%, transparent)" : "color-mix(in srgb, var(--color-ink) 72%, transparent)"

  return (
    <svg aria-hidden className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer frame — pediment + column hints */}
      <path
        d="M32 3.5 44.5 9v2.2c0 12.8-5.2 24.8-12.5 33.5L32 48.5l-0.5-.1C24.2 39.9 19 27.9 19 11.2V9L32 3.5Z"
        stroke={soft}
        strokeWidth="0.85"
        fill="none"
      />
      <path d="M32 6.2 41.8 10.5v1.4c0 10.6-4.3 20.5-10.2 27.8L32 44.2 22.4 39.7C16.5 32.4 12.2 22.5 12.2 11.9v-1.4L32 6.2Z" fill={soft} opacity={inverse ? 0.35 : 0.22} />

      {/* Pedestal */}
      <path
        fill={ink}
        d="M18.5 52.2h27c1.2 0 2.2 1 2.2 2.2v1.1c0 .6-.5 1.1-1.1 1.1H17.4c-.6 0-1.1-.5-1.1-1.1v-1.1c0-1.2 1-2.2 2.2-2.2Z"
      />
      <path fill={hair} d="M20 51.1h24v1H20v-1Z" />

      {/* Robe body */}
      <path
        fill={ink}
        d="M32 18.2c-4.8 0-8.6 1.4-11.2 3.4-2.1 1.6-3.5 3.6-4.2 5.8-.8 2.5-.9 5.2-.4 7.8.8 4.2 3.2 8.2 7.2 11.2 2.8 2.1 6.3 3.6 10.1 4.1 1.2.15 2.4.2 3.6.15 3.8-.35 7.3-1.9 10.1-4.1 4-3 6.4-7 7.2-11.2.5-2.6.4-5.3-.4-7.8-.7-2.2-2.1-4.2-4.2-5.8-2.6-2-6.4-3.4-11.2-3.4Z"
      />
      <path
        fill={soft}
        d="M32 22.5c-3.2 0-5.8.9-7.6 2.2-1.4 1.1-2.3 2.4-2.7 3.8-.5 1.8-.6 3.7-.2 5.5.5 2.8 2.1 5.5 4.7 7.5 2 1.5 4.5 2.6 7.2 2.9.8.1 1.6.12 2.4.08 2.7-.25 5.2-1.4 7.2-2.9 2.6-2 4.2-4.7 4.7-7.5.4-1.8.3-3.7-.2-5.5-.4-1.4-1.3-2.7-2.7-3.8-1.8-1.3-4.4-2.2-7.6-2.2Z"
      />

      {/* Robe pleats */}
      <path stroke={hair} strokeWidth="0.65" strokeLinecap="round" d="M26 28.5v16M32 27v18.5M38 28.5v16" />

      {/* Shoulders & collar */}
      <path fill={ink} d="M32 17.2c-5.5 0-10.2 2.2-13.4 5.8 2.8-1.8 6.2-2.8 9.8-2.8h7.2c3.6 0 7 1 9.8 2.8-3.2-3.6-7.9-5.8-13.4-5.8Z" />

      {/* Head */}
      <circle cx="32" cy="13.2" r="4.35" fill={ink} />
      <path fill={hair} d="M27.8 12.4c1.2-.9 2.6-1.35 4.2-1.35s3 .45 4.2 1.35c-.8-.6-1.9-.95-3.1-.95h-2.2c-1.2 0-2.3.35-3.1.95Z" />

      {/* Blindfold */}
      <path fill={ink} d="M26.2 12.8h11.6c.55 0 1 .45 1 1v1.35c0 .55-.45 1-1 1H26.2c-.55 0-1-.45-1-1v-1.35c0-.55.45-1 1-1Z" />
      <path stroke={inverse ? "var(--color-bg-base)" : "var(--color-background)"} strokeWidth="0.5" d="M27.5 14.1h9" opacity="0.55" />

      {/* Hair curls */}
      <path
        fill={hair}
        d="M27.2 15.8c-1.8.8-3.2 2.2-3.9 4-.5 1.2-.6 2.5-.3 3.7.4-1.5 1.3-2.8 2.5-3.7 1-.8 2.2-1.2 3.5-1.2h.4c-1.1-.3-2.2-.2-3.2.2ZM36.8 15.8c1.8.8 3.2 2.2 3.9 4 .5 1.2.6 2.5.3 3.7-.4-1.5-1.3-2.8-2.5-3.7-1-.8-2.2-1.2-3.5-1.2h-.4c1.1-.3 2.2-.2 3.2.2Z"
      />

      {/* Left arm + scale assembly */}
      <path fill={ink} d="M19.5 20.2c-1.4-.4-2.8.4-3.2 1.8-.5 1.8-.7 3.7-.5 5.6.2 1.4 1.5 2.3 2.9 2.1l2.1-.4c-.6-2.4-.2-5 1.2-7.1l-2.5-2Z" />
      <path stroke={ink} strokeWidth="1.15" strokeLinecap="round" d="M21 19.2 14.5 15.8" />
      <path stroke={ink} strokeWidth="1.35" strokeLinecap="round" d="M12.8 15.2h11.2" />
      {/* Chains left */}
      <circle cx="15.2" cy="16.8" r="0.55" fill={ink} />
      <circle cx="15.2" cy="18.4" r="0.55" fill={ink} />
      <circle cx="15.2" cy="20" r="0.55" fill={ink} />
      <path stroke={ink} strokeWidth="0.55" d="M15.2 15.5v5" />
      <path fill={ink} d="M12.4 20.6c0-1.55 1.25-2.8 2.8-2.8s2.8 1.25 2.8 2.8v1.2c0 .45-.35.8-.8.8h-4c-.45 0-.8-.35-.8-.8v-1.2Z" />
      <path fill={soft} d="M13.2 21.2h3.6v.35h-3.6v-.35Z" />
      {/* Chains right */}
      <circle cx="21.6" cy="16.8" r="0.55" fill={ink} />
      <circle cx="21.6" cy="18.4" r="0.55" fill={ink} />
      <circle cx="21.6" cy="20" r="0.55" fill={ink} />
      <path stroke={ink} strokeWidth="0.55" d="M21.6 15.5v5" />
      <path fill={ink} d="M18.8 20.6c0-1.55 1.25-2.8 2.8-2.8s2.8 1.25 2.8 2.8v1.2c0 .45-.35.8-.8.8h-4c-.45 0-.8-.35-.8-.8v-1.2Z" />
      <path fill={soft} d="M19.6 21.2h3.6v.35h-3.6v-.35Z" />

      {/* Right arm + sword */}
      <path fill={ink} d="M44.5 20.2c1.4-.4 2.8.4 3.2 1.8.5 1.8.7 3.7.5 5.6-.2 1.4-1.5 2.3-2.9 2.1l-2.1-.4c.6-2.4.2-5-1.2-7.1l2.5-2Z" />
      <path fill={ink} d="M46.8 22.5 49 38.2c.15.95-.5 1.85-1.45 2-1.15.18-2.15-.65-2.3-1.8l-1.5-14.2 2.95-.7Z" />
      <path fill={hair} d="M47.35 26.2 48.6 35.5l-1.05.25-1.25-9.55 1.05-.2Z" />
      <path fill={ink} d="M44.6 37.8h6.2c.75 0 1.35.6 1.35 1.35v.9c0 .5-.4.9-.9.9h-6.7c-.5 0-.9-.4-.9-.9v-.9c0-.75.6-1.35 1.35-1.35Z" />
      <path fill={ink} d="M45.8 39.5h3.8c.55 0 1 .45 1 1v2.1c0 .55-.45 1-1 1h-3.8c-.55 0-1-.45-1-1v-2.1c0-.55.45-1 1-1Z" />
      <path fill={soft} d="M46.5 40.2h2.4v.55h-2.4v-.55Z" />

      {/* Crown rays */}
      <path fill={ink} d="M32 7.2 33.1 9.8h2.8l-2.3 1.7.9 2.8-2.5-1.8-2.5 1.8.9-2.8-2.3-1.7h2.8L32 7.2Z" />
    </svg>
  )
}
