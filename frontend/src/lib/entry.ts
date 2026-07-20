export type EntryIntent = "D1" | "D2" | "D3" | "D4" | "upload"

export function entryLabel(intent: EntryIntent | null): string {
  if (intent === "D1") return "D1 payroll records request"
  if (intent === "D2") return "D2 altered case-number request"
  if (intent === "D3") return "D3 gift-card payment demand"
  if (intent === "D4") return "D4 payment and bank records request"
  return "your upload"
}
