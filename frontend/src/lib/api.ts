export type Verdict = "scam" | "verified" | "cannot_confirm" | "scam_indicators"

export type TraceStatus = "started" | "complete" | "degraded" | "skipped" | "failed" | "unavailable"

export type TraceEvent = {
  run_id: string
  seq: number
  at: string
  key: "intake" | "reader" | "court_directory" | "checker" | "courtlistener" | "scam_patterns" | "rules" | "explainer" | "legal_passages" | "result"
  kind: "run" | "agent" | "tool" | "decision" | "result"
  status: TraceStatus
  label: string
  parent_key: string | null
  parallel_group: string | null
  duration_ms: number | null
  detail: string | null
  input_summary: string | null
  output_summary: string | null
  evidence_count: number
  evidence_ids: string[]
  decision?: Analysis["decision"]
}

export type RunMetrics = {
  total_duration_ms: number
  model_calls: number
  tool_calls: number
  evidence_items: number
  input_tokens: number | null
  output_tokens: number | null
  total_tokens: number | null
}

export type AnalysisRunTrace = {
  run_id: string
  started_at: string
  completed_at: string
  model_alias: string
  prompt_versions: Record<string, string>
  corpus_version: string
  corpus_versions: Record<string, string>
  policy_version: string
  verdict_authority: "deterministic_policy"
  fact_extraction_basis: "model_assisted_document_read"
  pattern_text_basis: "native_pdf_text" | "model_assisted_transcription"
  scope: "analysis_execution"
  human_review_required: boolean
  steps: TraceEvent[]
  model_usage: {
    stage: "reader" | "checker" | "explainer"
    model: string
    response_id: string | null
    input_tokens: number | null
    output_tokens: number | null
    total_tokens: number | null
  }[]
  signal_reviews: {
    pattern_id: string
    document_excerpt: string
    accepted: boolean
    counts_toward_verdict: boolean
    reason: "accepted" | "unknown_pattern" | "duplicate_pattern" | "missing_excerpt" | "excerpt_not_found" | "excerpt_does_not_support_pattern" | "annotation_only_pattern"
  }[]
  metrics: RunMetrics
}

export type OfficialContact = {
  status: "reviewed_route" | "manual_confirmation_required" | "not_available"
  court_name: string | null
  office_name: string | null
  purpose: string | null
  line_label: string | null
  phone: string | null
  tel_uri: string | null
  office_hours: string | null
  timezone: string | null
  official_contact_page: string | null
  verified_on: string | null
  routing_note: string | null
  reason: string | null
}

export interface Analysis {
  saved_analysis_id?: string | null
  document_type: string
  summary: string
  verdict: Verdict
  confidence: "low" | "medium" | "high"
  deadline: string | null
  breakdown: {
    court: string | null
    claimed_authority: string | null
    court_directory_status: "OFFICIAL_COURT" | "NAME_MISMATCH" | "UNKNOWN_AUTHORITY" | null
    court_route: "federal" | "federal_appellate" | "state" | "none"
    case_number: string | null
    parties: string[]
    document_date: string | null
    deadline: string | null
    requested_actions: string[]
  }
  checks: { key: string; label: string; status: string }[]
  decision?: {
    policy_version: string
    rule: "two_or_more_scam_signals" | "case_and_parties_match" | "fallback"
    counted_signal_ids: string[]
    case_found: boolean
    parties_match: boolean
  } | null
  guard?: {
    accepted: boolean
    verdict: "scam" | "verified" | "cannot_confirm"
    accepted_pattern_ids: string[]
    rejected_pattern_ids: string[]
    accepted_passage_ids: string[]
    quarantined_claims: {
      reason: string
      value: string
      claim_type: string
    }[]
    human_review_required: boolean
    corpus_versions: Record<string, string>
  } | null
  trace?: AnalysisRunTrace | null
  limitations: string[]
  evidence: { id: string; tool_key: "reader" | "court_directory" | "courtlistener" | "scam_patterns" | "legal_passages"; label: string; detail: string; source: string; quote: string | null; source_url: string | null }[]
  next_step: string
  official_contact?: OfficialContact | null
}

export type DashboardSummary = {
  counts: { documents: number; verified: number; review: number; scam: number }
  recent: { id: string; name: string; verdict: Verdict | null; created_at: string | null; detail_available?: boolean }[]
}

export type SavedAnalysisListItem = {
  id: string
  name: string
  verdict: Verdict | null
  created_at: string | null
  detail_available: boolean
}

export type SavedAnalysisPage = {
  items: SavedAnalysisListItem[]
  limit: number
  offset: number
  has_more: boolean
}

export type SavedAnalysisDetail = SavedAnalysisListItem & {
  analysis: Analysis | null
}

export type EvidenceBriefEmailResponse = {
  status: "sent"
  message_id: string
  recipient: string
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

export type PlaidConnectionStatus = {
  configured: boolean
  connected: boolean
  environment: "sandbox" | "development" | "production"
  institution_name: string | null
  connected_at: string | null
}

export type PlaidTransaction = {
  transaction_id: string
  account_id: string
  name: string
  merchant_name: string | null
  date: string
  amount: number
  currency: string | null
  pending: boolean
  category_primary: string | null
  category_detailed: string | null
}

export type PlaidTransactionsResponse = {
  transactions: PlaidTransaction[]
  total: number
  initial_update_complete: boolean
  historical_update_complete: boolean
}

const API_URL = (
  import.meta.env.VITE_API_URL || "https://anton-served.hrvnvm.easypanel.host/api"
).replace(/\/$/, "")

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

export async function analyzeDocument(file: File, credential: string): Promise<Analysis> {
  const body = new FormData()
  body.append("file", file)
  const response = await fetch(`${API_URL}/documents/analyze`, { method: "POST", body, headers: { Authorization: `Bearer ${credential}` } })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.detail ?? "We couldn’t analyze that photo. Please try again.")
  }
  return response.json()
}

export async function analyzeDocumentStream(
  file: File,
  credential: string,
  onTrace?: (event: TraceEvent) => void,
  signal?: AbortSignal,
): Promise<Analysis> {
  const body = new FormData()
  body.append("file", file)
  const response = await fetch(`${API_URL}/documents/analyze/stream`, {
    method: "POST",
    body,
    headers: { Authorization: `Bearer ${credential}` },
    signal,
  })
  if (!response.ok) throw await responseError(response, "We couldn’t analyze that photo. Please try again.")
  if (!response.body) throw new Error("The analysis stream was not available.")

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let result: Analysis | undefined

  function processLine(line: string) {
    if (!line.trim()) return
    const message = JSON.parse(line) as
      | { type: "trace"; event: TraceEvent }
      | { type: "result"; analysis: Analysis }
      | { type: "error"; detail: string }
    if (message.type === "trace") onTrace?.(message.event)
    if (message.type === "result") result = message.analysis
    if (message.type === "error") throw new Error(message.detail || "Analysis failed.")
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) processLine(line)
      if (done) break
    }
    if (buffer.trim()) processLine(buffer)
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  if (!result) throw new Error("The analysis ended before returning a result.")
  return result
}

export async function fetchDashboardSummary(credential: string, signal?: AbortSignal): Promise<DashboardSummary> {
  const response = await fetch(`${API_URL}/dashboard/summary`, { headers: { Authorization: `Bearer ${credential}` }, signal })
  if (!response.ok) throw await responseError(response, "Unable to load dashboard data")
  return response.json()
}

export async function fetchSavedAnalysis(
  id: string,
  credential: string,
  signal?: AbortSignal,
): Promise<SavedAnalysisDetail> {
  const response = await fetch(`${API_URL}/dashboard/analyses/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${credential}` },
    signal,
  })
  if (!response.ok) throw await responseError(response, "Unable to load this saved analysis")
  return response.json()
}

export async function emailEvidenceBrief(
  id: string,
  credential: string,
  signal?: AbortSignal,
): Promise<EvidenceBriefEmailResponse> {
  const response = await fetch(`${API_URL}/dashboard/analyses/${encodeURIComponent(id)}/email`, {
    method: "POST",
    headers: { Authorization: `Bearer ${credential}` },
    signal,
  })
  if (!response.ok) throw await responseError(response, "Unable to email this evidence brief")
  return response.json()
}

export async function fetchSavedAnalyses(
  credential: string,
  offset = 0,
  limit = 25,
  signal?: AbortSignal,
): Promise<SavedAnalysisPage> {
  const query = new URLSearchParams({ offset: String(offset), limit: String(limit) })
  const response = await fetch(`${API_URL}/dashboard/analyses?${query}`, {
    headers: { Authorization: `Bearer ${credential}` },
    signal,
  })
  if (!response.ok) throw await responseError(response, "Unable to load saved analyses")
  return response.json()
}

export async function fetchAgentStatus(signal?: AbortSignal): Promise<{ agents: AgentStatus[]; healthy: boolean }> {
  const response = await fetch(`${API_URL}/agents/status`, { signal })
  if (!response.ok) throw await responseError(response, "Unable to load agent status")
  return response.json()
}

export async function fetchPlaidStatus(
  credential: string,
  signal?: AbortSignal,
): Promise<PlaidConnectionStatus> {
  const response = await fetch(`${API_URL}/plaid/status`, {
    headers: { Authorization: `Bearer ${credential}` },
    signal,
  })
  if (!response.ok) throw await responseError(response, "Unable to load bank connection")
  return response.json()
}

export async function createPlaidLinkToken(credential: string): Promise<string> {
  const response = await fetch(`${API_URL}/plaid/link-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${credential}` },
  })
  if (!response.ok) throw await responseError(response, "Unable to start Plaid Link")
  const data = await response.json() as { link_token: string }
  return data.link_token
}

export async function exchangePlaidPublicToken(
  credential: string,
  publicToken: string,
  institution?: { institution_id: string; name: string } | null,
): Promise<PlaidConnectionStatus> {
  const response = await fetch(`${API_URL}/plaid/exchange`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      public_token: publicToken,
      institution_id: institution?.institution_id ?? null,
      institution_name: institution?.name ?? null,
    }),
  })
  if (!response.ok) throw await responseError(response, "Unable to finish bank connection")
  return response.json()
}

export async function fetchPlaidTransactions(
  credential: string,
  signal?: AbortSignal,
): Promise<PlaidTransactionsResponse> {
  const response = await fetch(`${API_URL}/plaid/transactions`, {
    headers: { Authorization: `Bearer ${credential}` },
    signal,
  })
  if (!response.ok) throw await responseError(response, "Unable to retrieve transactions")
  return response.json()
}
