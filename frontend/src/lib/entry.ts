export type EntryIntent = "D1" | "D2" | "D3" | "D4" | "upload"

export function entryLabel(intent: EntryIntent | null): string {
  if (intent === "D1") return "the verified payroll subpoena"
  if (intent === "D2") return "the uncertain request"
  if (intent === "D3") return "the gift-card scam demand"
  if (intent === "D4") return "the verified payment-records subpoena"
  return "your own financial subpoena"
}
