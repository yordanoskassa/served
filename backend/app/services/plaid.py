from __future__ import annotations

from typing import Any

import httpx

from app.config import settings


PLAID_BASE_URLS = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}


class PlaidNotConfiguredError(RuntimeError):
    pass


class PlaidAPIError(RuntimeError):
    def __init__(self, code: str = "PLAID_API_ERROR") -> None:
        self.code = code
        super().__init__("Plaid could not complete the request.")


def is_configured() -> bool:
    return settings.plaid_configured


async def _post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    if not is_configured():
        raise PlaidNotConfiguredError("Plaid Sandbox is not configured.")

    headers = {
        "PLAID-CLIENT-ID": settings.plaid_client_id,
        "PLAID-SECRET": settings.effective_plaid_secret(),
        "Plaid-Version": "2020-09-14",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(
            base_url=PLAID_BASE_URLS[settings.plaid_environment],
            timeout=httpx.Timeout(20.0),
        ) as client:
            response = await client.post(path, headers=headers, json=payload)
    except httpx.HTTPError:
        # Never chain an httpx exception: its request retains authentication headers.
        raise PlaidAPIError("PLAID_UNAVAILABLE") from None

    try:
        body = response.json()
    except ValueError:
        raise PlaidAPIError("INVALID_PLAID_RESPONSE") from None
    if response.is_error or not isinstance(body, dict):
        code = body.get("error_code") if isinstance(body, dict) else None
        raise PlaidAPIError(str(code or "PLAID_API_ERROR"))
    return body


async def create_link_token(client_user_id: str) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "client_name": "Served",
        "country_codes": ["US"],
        "language": "en",
        "products": ["transactions"],
        "transactions": {"days_requested": 180},
        "user": {"client_user_id": client_user_id},
    }
    if settings.plaid_redirect_uri:
        payload["redirect_uri"] = settings.plaid_redirect_uri
    return await _post("/link/token/create", payload)


async def exchange_public_token(public_token: str) -> dict[str, Any]:
    return await _post("/item/public_token/exchange", {"public_token": public_token})


async def remove_item(access_token: str) -> None:
    await _post("/item/remove", {"access_token": access_token})


async def sync_transactions(access_token: str) -> dict[str, Any]:
    """Read a complete snapshot without persisting transaction details."""
    cursor: str | None = None
    transactions: dict[str, dict[str, Any]] = {}
    removed_ids: set[str] = set()
    initial_update_complete = False
    historical_update_complete = False

    for _ in range(20):
        payload: dict[str, Any] = {
            "access_token": access_token,
            "count": 500,
            "options": {
                "include_original_description": True,
                "personal_finance_category_version": "v2",
            },
        }
        if cursor:
            payload["cursor"] = cursor
        page = await _post("/transactions/sync", payload)

        for transaction in [*(page.get("added") or []), *(page.get("modified") or [])]:
            transaction_id = transaction.get("transaction_id")
            if transaction_id:
                transactions[str(transaction_id)] = transaction
        for removed in page.get("removed") or []:
            transaction_id = removed.get("transaction_id")
            if transaction_id:
                removed_ids.add(str(transaction_id))

        cursor = page.get("next_cursor") or cursor
        initial_update_complete = bool(page.get("initial_update_complete"))
        historical_update_complete = bool(page.get("historical_update_complete"))
        if not page.get("has_more"):
            break
    else:
        raise PlaidAPIError("TRANSACTIONS_SYNC_PAGE_LIMIT")

    for transaction_id in removed_ids:
        transactions.pop(transaction_id, None)
    return {
        "transactions": list(transactions.values()),
        "initial_update_complete": initial_update_complete,
        "historical_update_complete": historical_update_complete,
    }
