from typing import Literal

from pydantic import BaseModel, Field


RecordType = Literal["payroll_record", "wage_statement", "time_record"]


class PayrollRequestCriteria(BaseModel):
    employee_name: str
    start_date: str
    end_date: str | None = None
    record_types: list[RecordType]
    source_text: str


class PayrollCandidate(BaseModel):
    record_id: str
    employee_name: str
    record_type: RecordType
    period_start: str
    period_end: str
    gross_pay: str | None = None
    hours: str | None = None
    source: str
    match_strength: Literal["strong", "possible"]
    match_reason: str


class PayrollMatchSummary(BaseModel):
    strong: int
    possible: int
    outside_criteria: int
    missing_record_types: list[RecordType] = Field(default_factory=list)


class PayrollMatchResponse(BaseModel):
    criteria: PayrollRequestCriteria
    summary: PayrollMatchSummary
    strong_matches: list[PayrollCandidate] = Field(default_factory=list)
    possible_matches: list[PayrollCandidate] = Field(default_factory=list)
    manifest_note: str
    privacy_note: str
    human_review_required: Literal[True] = True
