from pydantic import BaseModel, Field
from app.engine.models import Confidence, VerdictState

Verdict = VerdictState


class EvidenceItem(BaseModel):
    label: str
    detail: str
    source: str


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


class AnalysisResponse(BaseModel):
    document_type: str
    summary: str
    verdict: Verdict
    confidence: Confidence
    deadline: str | None = None
    breakdown: LetterBreakdown = Field(default_factory=LetterBreakdown)
    checks: list[AnalysisCheck] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    evidence: list[EvidenceItem]
    next_step: str
