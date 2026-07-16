export type EntryIntent = "D1" | "D2" | "D3" | "upload"

export function entryLabel(intent: EntryIntent | null): string {
  if (intent === "D1") return "Letter 1"
  if (intent === "D2") return "Letter 2"
  if (intent === "D3") return "Letter 3"
  return "your own document"
}
