from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field
from app.engine.ground_truth import OfficialClerkContact
from app.engine.grounding_guard import GroundingAudit
from app.engine.models import Confidence, ScamSignalReview, VerdictState

Verdict = VerdictState


class EvidenceItem(BaseModel):
    id: str = ""
    tool_key: Literal[
        "reader",
        "court_directory",
        "courtlistener",
        "scam_patterns",
        "legal_passages",
    ] = "reader"
    label: str
    detail: str
    source: str
    quote: str | None = None
    source_url: str | None = None


class LetterBreakdown(BaseModel):
    court: str | None = None
    claimed_authority: str | None = None
    court_directory_status: Literal[
        "OFFICIAL_COURT",
        "NAME_MISMATCH",
        "UNKNOWN_AUTHORITY",
    ] | None = None
    court_route: Literal["federal", "federal_appellate", "state", "none"] = "none"
    case_number: str | None = None
    parties: list[str] = Field(default_factory=list)
    document_date: str | None = None
    deadline: str | None = None
    requested_actions: list[str] = Field(default_factory=list)


class AnalysisCheck(BaseModel):
    key: str
    label: str
    status: str = "complete"


class DecisionTrace(BaseModel):
    policy_version: str
    rule: Literal["two_or_more_scam_signals", "case_and_parties_match", "fallback"]
    counted_signal_ids: list[str] = Field(default_factory=list)
    case_found: bool
    parties_match: bool
    court_lookup_status: Literal[
        "match", "no_match", "near_match", "party_mismatch", "unavailable", "not_applicable"
    ] = "not_applicable"
    scam_check_status: Literal["complete", "unavailable", "not_applicable"] = "not_applicable"


TraceKind = Literal["run", "agent", "tool", "decision", "result"]
TraceStatus = Literal[
    "started",
    "complete",
    "degraded",
    "skipped",
    "failed",
    "unavailable",
]


class TraceEvent(BaseModel):
    run_id: str
    seq: int
    at: str
    key: Literal[
        "intake",
        "reader",
        "court_directory",
        "checker",
        "courtlistener",
        "scam_patterns",
        "rules",
        "explainer",
        "legal_passages",
        "result",
    ]
    kind: TraceKind
    status: TraceStatus
    label: str
    parent_key: str | None = None
    parallel_group: str | None = None
    duration_ms: int | None = None
    detail: str | None = None
    input_summary: str | None = None
    output_summary: str | None = None
    evidence_count: int = 0
    evidence_ids: list[str] = Field(default_factory=list)
    decision: DecisionTrace | None = None


class ModelUsage(BaseModel):
    stage: Literal["reader", "checker", "explainer"]
    model: str
    response_id: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


class RunMetrics(BaseModel):
    total_duration_ms: int
    model_calls: int
    tool_calls: int
    evidence_items: int
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


class AnalysisRunTrace(BaseModel):
    run_id: str
    started_at: str
    completed_at: str
    model_alias: str
    prompt_versions: dict[str, str]
    corpus_version: str
    corpus_versions: dict[str, str] = Field(default_factory=dict)
    policy_version: str
    verdict_authority: Literal["deterministic_policy"] = "deterministic_policy"
    fact_extraction_basis: Literal[
        "model_assisted_document_read",
        "reviewed_sample_fixture",
    ] = "model_assisted_document_read"
    pattern_text_basis: Literal["native_pdf_text", "model_assisted_transcription"] = "model_assisted_transcription"
    scope: Literal["analysis_execution"] = "analysis_execution"
    human_review_required: bool = True
    steps: list[TraceEvent] = Field(default_factory=list)
    model_usage: list[ModelUsage] = Field(default_factory=list)
    signal_reviews: list[ScamSignalReview] = Field(default_factory=list)
    metrics: RunMetrics


class AnalysisResponse(BaseModel):
    saved_analysis_id: str | None = None
    document_type: str
    summary: str
    verdict: Verdict
    confidence: Confidence
    deadline: str | None = None
    breakdown: LetterBreakdown = Field(default_factory=LetterBreakdown)
    official_contact: OfficialClerkContact | None = None
    checks: list[AnalysisCheck] = Field(default_factory=list)
    decision: DecisionTrace | None = None
    guard: GroundingAudit | None = None
    trace: AnalysisRunTrace | None = None
    limitations: list[str] = Field(default_factory=list)
    evidence: list[EvidenceItem]
    next_step: str


class SavedAnalysisListItem(BaseModel):
    """Projected history metadata; nullable fields belong to pre-v2 records."""

    id: str
    name: str
    verdict: str | None = Field(
        default=None,
        description="Null only when a legacy record did not retain its verdict.",
    )
    created_at: datetime | None = Field(
        default=None,
        description="Null only when a legacy record did not retain its creation time.",
    )
    detail_available: bool


class SavedAnalysisList(BaseModel):
    items: list[SavedAnalysisListItem]
    limit: int
    offset: int
    has_more: bool


class SavedAnalysisDetail(SavedAnalysisListItem):
    """A user-owned saved run and its full result, when that result was retained."""

    analysis: AnalysisResponse | None = None


class AnalysisEmailResponse(BaseModel):
    """Acknowledgement that Resend accepted a user-owned handoff for delivery."""

    status: Literal["sent"] = "sent"
    message_id: str
    recipient: str
