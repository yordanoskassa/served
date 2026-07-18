from datetime import date, datetime

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
