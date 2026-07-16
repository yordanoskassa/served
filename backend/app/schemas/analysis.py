from pydantic import BaseModel, Field
from app.engine.models import Confidence, VerdictState

Verdict = VerdictState


class EvidenceItem(BaseModel):
    label: str
    detail: str
    source: str


class AnalysisResponse(BaseModel):
    document_type: str
    summary: str
    verdict: Verdict
    confidence: Confidence
    deadline: str | None = None
    evidence: list[EvidenceItem]
    next_step: str
