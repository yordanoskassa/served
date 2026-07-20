from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class PlaidLinkTokenResponse(BaseModel):
    link_token: str
    expiration: datetime


class PlaidExchangeRequest(BaseModel):
    public_token: str = Field(min_length=1, max_length=1024)
    institution_id: str | None = Field(default=None, max_length=128)
    institution_name: str | None = Field(default=None, max_length=200)


class PlaidConnectionStatus(BaseModel):
    configured: bool
    connected: bool
    environment: str
    institution_name: str | None = None
    connected_at: datetime | None = None
    demo_fixture: bool = False


class PlaidTransaction(BaseModel):
    transaction_id: str
    account_id: str
    name: str
    merchant_name: str | None = None
    date: date
    amount: float
    currency: str | None = None
    pending: bool = False
    category_primary: str | None = None
    category_detailed: str | None = None


class PlaidTransactionsResponse(BaseModel):
    transactions: list[PlaidTransaction]
    total: int
    initial_update_complete: bool
    historical_update_complete: bool


PaymentDisposition = Literal["INCLUDE", "REVIEW", "EXCLUDE"]
PaymentReasonCode = Literal[
    "PAYEE_AND_DATE_MATCH",
    "UNNAMED_INSTRUMENT_NEEDS_HUMAN",
    "NAME_NEAR_MATCH_NEEDS_HUMAN",
    "NOT_TARGET_PAYEE",
    "OUTSIDE_DATE_RANGE",
]


class PaymentMatchRequest(BaseModel):
    cutoff_date: date


class PaymentCriteriaSnapshot(BaseModel):
    analysis_id: str
    source_document: str
    target_payee: str
    start_date: date
    cutoff_date: date
    requested_category: Literal["payment_and_bank_records"] = "payment_and_bank_records"


class PaymentMatchRecord(BaseModel):
    record_id: str
    disposition: Literal["INCLUDE", "REVIEW"]
    reason_code: PaymentReasonCode
    date: date
    amount: float
    description: str
    currency: str | None = None


class PaymentExcludedAudit(BaseModel):
    record_id: str
    disposition: Literal["EXCLUDE"] = "EXCLUDE"
    reason_code: PaymentReasonCode


class PaymentMatchSummary(BaseModel):
    total_searched: int
    include: int
    review: int
    exclude: int
    excluded_by_reason: dict[PaymentReasonCode, int] = Field(default_factory=dict)


class PaymentMatchResponse(BaseModel):
    criteria_snapshot: PaymentCriteriaSnapshot
    summary: PaymentMatchSummary
    include: list[PaymentMatchRecord] = Field(default_factory=list)
    review: list[PaymentMatchRecord] = Field(default_factory=list)
    excluded_audit: list[PaymentExcludedAudit] = Field(default_factory=list)
    review_notice: str
    boundary_warning: str
    legal_boundary: str
    human_review_required: Literal[True] = True
    automatic_send: Literal[False] = False
