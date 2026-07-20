import { ArrowRight, Check } from "lucide-react"

import { Button } from "@/components/ui/button"

const plans = [
  {
    id: "paygo",
    name: "Pay as you go",
    price: "$12",
    cadence: "per request",
    description: "For occasional requests. Sign in, upload, keep structured results in your workspace.",
    cta: "Start with a sample",
    featured: false,
    features: [
      "Document and court verification",
      "Saved analysis and evidence trace",
      "Payroll matching for verified requests",
      "Bank matching for verified requests",
      "Evidence brief to your account email",
    ],
  },
  {
    id: "pro",
    name: "Workspace Pro",
    price: "$89",
    cadence: "per month",
    description: "For owners who receive multiple payroll or bank-record requests each year.",
    cta: "Review a sample",
    featured: true,
    features: [
      "15 request reviews included monthly",
      "$8 each additional check",
      "Response packet and clerk call scripts",
      "Bank connection controls in Settings",
      "Priority email delivery for briefs",
      "Sample requests for staff training",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: "Custom",
    cadence: "annual contract",
    description: "Multi-location operators, bookkeepers, or counsel-led response teams.",
    cta: "Contact sales",
    featured: false,
    features: [
      "Volume request reviews",
      "Shared workspace (roadmap)",
      "Dedicated onboarding call",
      "Custom retention & export policy",
      "SLA for email handoff delivery",
    ],
  },
] as const

const compareRows = [
  ["Request verification", "Included", "Included", "Included"],
  ["Payroll record matching", "Included", "Included", "Included"],
  ["Bank transaction matching", "Included", "Included", "Included"],
  ["Monthly included checks", "—", "15", "Custom"],
  ["Disconnect bank in Settings", "Included", "Included", "Included"],
] as const

export function LandingPricing({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="bg-background px-8 pb-8 md:px-16 lg:px-20">
      <section id="pricing" className="mx-auto max-w-7xl border-t border-border py-20">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-end">
          <div>
            <p className="type-label text-zinc-500">Pricing</p>
            <h2 className="type-section mt-3 max-w-lg">Less than an hour of counsel time.</h2>
          </div>
          <p className="type-lead max-w-xl text-zinc-600">
            Request reviews are priced for small businesses, not enterprise discovery budgets. Subscriptions include the payroll and bank workflows you reuse every quarter.
          </p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              className={`relative flex flex-col rounded-2xl border p-6 sm:p-7 ${plan.featured ? "border-foreground bg-foreground text-background shadow-[0_20px_50px_rgba(0,0,0,.12)]" : "border-border bg-card"}`}
              key={plan.id}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-6 rounded-full bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-black">
                  Most popular
                </span>
              )}
              <h3 className={`type-ui-heading ${plan.featured ? "text-white" : ""}`}>{plan.name}</h3>
              <p className={`mt-2 text-sm leading-6 ${plan.featured ? "text-white/70" : "text-zinc-500"}`}>{plan.description}</p>
              <div className="mt-6 flex items-baseline gap-2">
                <span className={`font-display text-4xl tracking-[-.05em] ${plan.featured ? "text-white" : ""}`}>{plan.price}</span>
                <span className={`text-xs ${plan.featured ? "text-white/55" : "text-zinc-400"}`}>{plan.cadence}</span>
              </div>
              <ul className={`mt-6 flex-1 space-y-2.5 text-sm ${plan.featured ? "text-white/85" : "text-zinc-600"}`}>
                {plan.features.map((feature) => (
                  <li className="flex gap-2.5" key={feature}>
                    <Check className={`mt-0.5 size-4 shrink-0 ${plan.featured ? "text-white" : "text-foreground"}`} aria-hidden />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                onClick={onGetStarted}
                className={`mt-8 h-11 w-full text-sm ${plan.featured ? "bg-white text-black hover:bg-white/90" : ""}`}
                variant={plan.featured ? "default" : "outline"}
              >
                {plan.cta} <ArrowRight size={15} />
              </Button>
            </article>
          ))}
        </div>

        <div className="mt-14 overflow-hidden rounded-2xl border border-border">
          <div className="border-b border-border bg-muted/40 px-5 py-3">
            <p className="type-ui text-sm font-semibold">Compare plans</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-5 py-3 font-medium text-zinc-500">Feature</th>
                  <th className="px-5 py-3 font-medium">Pay as you go</th>
                  <th className="px-5 py-3 font-medium">Pro</th>
                  <th className="px-5 py-3 font-medium">Business</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map(([feature, a, b, c]) => (
                  <tr className="border-b border-border last:border-0" key={feature}>
                    <td className="px-5 py-3 text-zinc-600">{feature}</td>
                    <td className="px-5 py-3">{a}</td>
                    <td className="px-5 py-3">{b}</td>
                    <td className="px-5 py-3">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="type-caption mt-6 max-w-3xl leading-5 text-zinc-500">
          Pricing is illustrative. Attorney review and court filing are out of scope. Served organizes evidence and candidate records for your team and counsel.
        </p>
      </section>

      <section id="faq" className="mx-auto max-w-7xl border-t border-border py-20">
        <h2 className="type-section max-w-xl">Billing questions</h2>
        <dl className="mt-8 grid gap-6 md:grid-cols-2">
          {[
            {
              q: "What counts as a request review?",
              a: "One uploaded subpoena or records request through the verification pipeline, including saved structured results.",
            },
            {
              q: "Do financial tools cost extra?",
              a: "Bank and payroll matching are included once the request is verified. You control bank access in Settings.",
            },
            {
              q: "Can I cancel Pro anytime?",
              a: "Yes. Monthly plans cancel at period end. Pay-as-you-go has no subscription.",
            },
            {
              q: "Is there a free trial?",
              a: "Review the sample requests without payment to see the full workflow.",
            },
          ].map(({ q, a }) => (
            <div className="rounded-xl border border-border bg-card p-5" key={q}>
              <dt className="type-ui font-semibold">{q}</dt>
              <dd className="type-body mt-2 leading-6 text-zinc-600">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-7xl py-12">
        <div className="rounded-2xl border border-border bg-[#111] px-6 py-10 text-center text-white sm:px-10 sm:py-12">
          <h2 className="type-section text-white">Ready when the request arrives.</h2>
          <p className="type-body mx-auto mt-4 max-w-lg text-white/65">
            Open the mailbox, choose a sample, or upload your own request. Sign in to save results.
          </p>
          <Button type="button" onClick={onGetStarted} className="mt-8 h-11 bg-white px-6 text-black hover:bg-white/90">
            Get started <ArrowRight size={16} />
          </Button>
        </div>
      </section>
    </div>
  )
}
