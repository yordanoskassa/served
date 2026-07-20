const links = [
  { label: "Workflow", href: "#workflow" },
  { label: "Pricing", href: "#pricing" },
  { label: "Bank connect", href: "#bank-connection" },
  { label: "FAQ", href: "#faq" },
  { label: "Privacy", href: "#privacy" },
] as const

export function LandingFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-border bg-card/40 px-8 py-12 md:px-16 lg:px-20">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-display text-lg tracking-[-.03em]">Served</p>
          <p className="type-caption mt-2 max-w-xs leading-5">Financial subpoena response for small businesses. Not legal advice.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
          {links.map(({ label, href }) => (
            <a className="type-caption font-medium text-zinc-600 transition hover:text-foreground" href={href} key={href}>
              {label}
            </a>
          ))}
        </nav>
      </div>
      <p className="type-caption mx-auto mt-10 max-w-7xl text-zinc-400">© {year} Served</p>
    </footer>
  )
}
