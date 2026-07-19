export function BrandMark({ inverse = false, className = "size-8" }: { inverse?: boolean; className?: string }) {
  const ink = inverse ? "var(--color-bg-base)" : "var(--color-ink)"
  const center = inverse ? "var(--color-ink)" : "var(--color-bg-base)"

  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 36 36" fill="none">
      <path fill={ink} d="M18 2c3.2 0 5.3 2.7 5.3 6.5 0 1.2-.2 2.4-.5 3.5 1-1.1 2.5-2 4-2.5 3.7-1.2 6.8.2 7.8 3.1 1.1 3.2-.8 6.5-4.6 7.8-1.1.4-2.3.5-3.5.4 1.1.8 2 1.7 2.7 2.8 2 3.3 1 6.6-1.6 8.3-2.9 1.9-6.4.4-8.3-2.9-.6-1-.9-2.1-1.1-3.2-.5 1.1-1.2 2.2-2.1 3-2.8 2.7-6.4 2.5-8.5 0-2.2-2.7-1.1-6.3 1.7-8.8.9-.8 2-1.4 3.1-1.8-1.2-.2-2.4-.6-3.4-1.2-3.4-1.9-4.4-5.3-2.7-8 1.7-2.8 5.3-3.2 8.6-1.3 1 .6 1.9 1.4 2.6 2.4-.2-1.1-.3-2.3-.2-3.4C12 4.6 14.4 2 18 2Z" />
      <circle cx="18" cy="18" r="3.6" fill={center} />
    </svg>
  )
}
