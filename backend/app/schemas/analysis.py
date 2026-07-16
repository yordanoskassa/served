from typing import Literal

from pydantic import BaseModel, Field
from app.engine.models import Confidence, VerdictState

Verdict = VerdictState


class EvidenceItem(BaseModel):
    label: str
    detail: str
    source: str
    quote: str | None = None
    source_url: str | None = None


class LetterBreakdown(BaseModel):
    court: str | None = None
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


class AnalysisResponse(BaseModel):
    document_type: str
    summary: str
    verdict: Verdict
    confidence: Confidence
    deadline: str | None = None
    breakdown: LetterBreakdown = Field(default_factory=LetterBreakdown)
    checks: list[AnalysisCheck] = Field(default_factory=list)
    decision: DecisionTrace | None = None
    limitations: list[str] = Field(default_factory=list)
    evidence: list[EvidenceItem]
    next_step: str
