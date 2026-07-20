const stats = [
  { value: "Fast review", label: "Request facts and deadlines" },
  { value: "Fail closed", label: "Before financial access" },
  { value: "No retention", label: "Uploaded request files" },
  { value: "Owner controlled", label: "Evidence delivery" },
] as const

const integrations = ["Secure sign-in", "Court verification", "Bank connection", "Document analysis"] as const

export function LandingTrustBar() {
  return (
    <section className="border-y border-border bg-card/50" aria-label="Product highlights">
      <div className="mx-auto grid max-w-7xl gap-8 px-8 py-12 md:px-16 lg:px-20">
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {stats.map(({ value, label }) => (
            <div key={label}>
              <p className="font-display text-2xl tracking-[-.04em] text-foreground md:text-3xl">{value}</p>
              <p className="type-caption mt-1.5">{label}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-8">
          <span className="type-label mr-2 text-zinc-400">Integrations</span>
          {integrations.map((name) => (
            <span className="rounded-full border border-black/10 bg-background px-3 py-1 text-[11px] font-medium text-zinc-600" key={name}>
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
