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

export type DashboardSummary = {
  counts: { documents: number; verified: number; review: number; scam: number }
  recent: { id: string; name: string; verdict: Verdict; created_at: string }[]
}

export type AgentStatus = {
  name: string
  description: string
  enabled: boolean
  last_run: string | null
  last_error: string | null
}

export type UserProfile = {
  subject?: string
  email: string
  name: string
  given_name: string
  picture: string | null
}

const API_URL = "https://anton-served.hrvnvm.easypanel.host/api"

async function responseError(res: Response, fallback: string): Promise<Error> {
  const text = await res.text()
  try {
    const parsed = JSON.parse(text) as { detail?: unknown }
    if (typeof parsed.detail === "string") return new Error(parsed.detail)
  } catch {
    // Plain-text responses are handled below.
  }
  return new Error(text || fallback)
}

export async function fetchGoogleClientId(): Promise<string> {
  const res = await fetch(`${API_URL}/auth/client-id`)
  if (!res.ok) throw await responseError(res, "Failed to fetch client ID")
  const data = await res.json()
  return data.client_id
}

export async function verifyGoogleToken(credential: string): Promise<UserProfile> {
  const res = await fetch(`${API_URL}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  })
  if (!res.ok) throw await responseError(res, "Authentication failed")
  return res.json()
}

export async function loadSampleDocument(sample: "D1" | "D2" | "D3"): Promise<File> {
  const response = await fetch(`${API_URL}/documents/samples/${sample}`)
  if (!response.ok) throw new Error("The sample document could not be loaded.")
  return new File([await response.blob()], `${sample}.pdf`, { type: "application/pdf" })
}

export async function analyzeDocument(file: File, credential?: string | null): Promise<Analysis> {
  const body = new FormData()
  body.append("file", file)
  const response = await fetch(`${API_URL}/documents/analyze`, { method: "POST", body, headers: credential ? { Authorization: `Bearer ${credential}` } : undefined })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.detail ?? "We couldn’t analyze that photo. Please try again.")
  }
  return response.json()
}

export async function fetchDashboardSummary(credential: string): Promise<DashboardSummary> {
  const response = await fetch(`${API_URL}/dashboard/summary`, { headers: { Authorization: `Bearer ${credential}` } })
  if (!response.ok) throw await responseError(response, "Unable to load dashboard data")
  return response.json()
}

export async function fetchAgentStatus(): Promise<{ agents: AgentStatus[]; healthy: boolean }> {
  const response = await fetch(`${API_URL}/agents/status`)
  if (!response.ok) throw await responseError(response, "Unable to load agent status")
  return response.json()
}
