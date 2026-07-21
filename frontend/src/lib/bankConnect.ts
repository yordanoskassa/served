import type { SavedAnalysisListItem } from "@/lib/api"

/** Verified saved request for Plaid connect fallback (prefer D4 / payment wording). */
export function pickPaymentRecordAnalysisId(items: SavedAnalysisListItem[]): string | null {
  const verified = items.filter((item) => item.verdict === "verified")
  const payment = verified.find((item) => /D4|payment|bank record/i.test(item.name))
  return payment?.id ?? verified[0]?.id ?? null
}

export const PLAID_SANDBOX_LABEL = "Plaid Sandbox"

export function isSandboxPlaidEnvironment(environment: string | undefined): boolean {
  return environment === "sandbox" || environment === "development"
}
