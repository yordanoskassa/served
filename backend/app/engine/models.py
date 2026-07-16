from enum import StrEnum

from pydantic import BaseModel, Field


class VerdictState(StrEnum):
    VERIFIED = "verified"
    CANNOT_CONFIRM = "cannot_confirm"
    SCAM_INDICATORS = "scam_indicators"


class Tier(StrEnum):
    FEDERAL = "federal"
    STATE = "state"
    NONE = "none"


class Confidence(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class DocumentParse(BaseModel):
    doc_type: str
    court: str | None = None
    case_number: str | None = None
    parties: list[str] = Field(default_factory=list)
    document_date: str | None = None
    deadline: str | None = None
    demands: list[str] = Field(default_factory=list)
    scam_pattern_ids: list[str] = Field(default_factory=list)
    readable: bool = True


class DocketEvidence(BaseModel):
    case_number_normalized: str
    court_id: str
    case_title: str
    parties: list[str]
    filing_date: str
    docket_url: str
    source: str


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
