export type Verdict = "verified" | "cannot_confirm" | "scam_indicators"

export interface Analysis {
  document_type: string
  summary: string
  verdict: Verdict
  confidence: "low" | "medium" | "high"
  deadline: string | null
  evidence: { label: string; detail: string; source: string }[]
  next_step: string
}

const API_URL = "https://anton-served.hrvnvm.easypanel.host/api"

export async function loadSampleDocument(sample: "D1" | "D2" | "D3"): Promise<File> {
  const response = await fetch(`${API_URL}/documents/samples/${sample}`)
  if (!response.ok) throw new Error("The sample document could not be loaded.")
  return new File([await response.blob()], `${sample}.pdf`, { type: "application/pdf" })
}

export async function analyzeDocument(file: File): Promise<Analysis> {
  const body = new FormData()
  body.append("file", file)
  const response = await fetch(`${API_URL}/documents/analyze`, { method: "POST", body })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.detail ?? "We couldn’t analyze that photo. Please try again.")
  }
  return response.json()
}
