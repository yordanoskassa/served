from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class VerdictState(StrEnum):
    SCAM = "scam"
    VERIFIED = "verified"
    CANNOT_CONFIRM = "cannot_confirm"


class Tier(StrEnum):
    FEDERAL = "federal"
    FEDERAL_APPELLATE = "federal_appellate"
    STATE = "state"
    NONE = "none"


class Confidence(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class StrictAgentModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DocumentParse(StrictAgentModel):
    doc_type: str
    court: str | None = None
    claimed_authority: str | None = None
    case_number: str | None = None
    parties: list[str] = Field(default_factory=list)
    document_date: str | None = None
    deadline: str | None = None
    demands: list[str] = Field(default_factory=list)
    visible_text: str = ""
    readable: bool = True


class DocketEvidence(BaseModel):
    case_number_normalized: str
    court_id: str
    case_title: str
    parties: list[str]
    filing_date: str
    docket_url: str
    source: str


class ScamSignal(StrictAgentModel):
    pattern_id: str
    document_excerpt: str


class ScamSignalReview(StrictAgentModel):
    pattern_id: str
    document_excerpt: str
    accepted: bool
    counts_toward_verdict: bool
    reason: Literal[
        "accepted",
        "unknown_pattern",
        "duplicate_pattern",
        "missing_excerpt",
        "excerpt_not_found",
        "excerpt_does_not_support_pattern",
        "annotation_only_pattern",
    ]


class CheckerReport(StrictAgentModel):
    docket_evidence: list[DocketEvidence] = Field(default_factory=list)
    case_found: bool = False
    parties_match: bool = False
    near_match: DocketEvidence | None = None
    court_lookup_status: Literal[
        "match",
        "party_mismatch",
        "near_match",
        "no_match",
        "unavailable",
        "not_applicable",
    ] = "not_applicable"
    scam_signals: list[ScamSignal] = Field(default_factory=list)
    signal_reviews: list[ScamSignalReview] = Field(default_factory=list)
    scam_check_status: Literal["complete", "unavailable", "not_applicable"] = "not_applicable"
    limitations: list[str] = Field(default_factory=list)


class ScamSignalDraft(StrictAgentModel):
    signals: list[ScamSignal] = Field(default_factory=list)


class ExplanationDraft(StrictAgentModel):
    summary: str
    next_step: str


class EngineStep(BaseModel):
    key: str
    label: str
    status: str = "complete"


class EngineResult(BaseModel):
    parse: DocumentParse
    verdict: VerdictState
    tier: Tier
    evidence: list[DocketEvidence] = Field(default_factory=list)
    confidence: Confidence
    steps: list[EngineStep]
    indicators: list[str] = Field(default_factory=list)
    near_match: DocketEvidence | None = None
