export type ReviewDecision = "approved" | "excluded" | "counsel"

export type PacketRecord = {
  recordId: string
  label: string
  detail: string
  systemRecommendation: string
  ownerDecision: ReviewDecision
}

export type ReviewPacket = {
  analysisId: string
  documentName: string
  generatedAt: string
  sourceLabel: string
  criteria: string[]
  approved: number
  excluded: number
  counsel: number
  records: PacketRecord[]
}

export type AttorneyDisposition = "pending" | "approved" | "changes_requested" | "rejected"
export type AttorneyOverride = "approve" | "exclude" | "counsel"

export type AttorneyReview = {
  reviewerName: string
  notes: string
  proofName: string | null
  proofSize: number | null
  overrides: Record<string, AttorneyOverride>
  disposition: AttorneyDisposition
  finalizedAt: string | null
}

const packetKey = (analysisId: string) => `served-review-packet-${analysisId}`
const attorneyKey = (analysisId: string) => `served-attorney-review-${analysisId}`

function read<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
}

export function loadReviewPacket(analysisId: string | undefined): ReviewPacket | null {
  return analysisId ? read<ReviewPacket>(packetKey(analysisId)) : null
}

export function saveReviewPacket(packet: ReviewPacket): void {
  localStorage.setItem(packetKey(packet.analysisId), JSON.stringify(packet))
}

export function clearReviewPacket(analysisId: string | undefined): void {
  if (!analysisId) return
  localStorage.removeItem(packetKey(analysisId))
  localStorage.removeItem(attorneyKey(analysisId))
}

export function emptyAttorneyReview(): AttorneyReview {
  return {
    reviewerName: "",
    notes: "",
    proofName: null,
    proofSize: null,
    overrides: {},
    disposition: "pending",
    finalizedAt: null,
  }
}

export function loadAttorneyReview(analysisId: string | undefined): AttorneyReview {
  return analysisId ? read<AttorneyReview>(attorneyKey(analysisId)) ?? emptyAttorneyReview() : emptyAttorneyReview()
}

export function saveAttorneyReview(analysisId: string, review: AttorneyReview): void {
  localStorage.setItem(attorneyKey(analysisId), JSON.stringify(review))
}
