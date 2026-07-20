export type EntryIntent = "D1" | "D2" | "D3" | "D4" | "upload"

export function entryLabel(intent: EntryIntent | null): string {
  if (intent === "D1") return "payroll demo (D1)"
  if (intent === "D2") return "uncertain letter (D2)"
  if (intent === "D3") return "scam letter (D3)"
  if (intent === "D4") return "payment demo (D4)"
  return "your upload"
}
