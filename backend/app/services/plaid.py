from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

PLAID_BASE_URLS = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}
TRANSACTIONS_SYNC_MAX_PAGES = 20
TRANSACTIONS_READY_MAX_POLLS = 15
TRANSACTIONS_READY_DELAY_SECONDS = 1.0


class PlaidNotConfiguredError(RuntimeError):
    pass


class PlaidAPIError(RuntimeError):
    def __init__(
        self,
        code: str = "PLAID_API_ERROR",
        *,
        plaid_message: str | None = None,
        request_id: str | None = None,
    ) -> None:
        self.code = code
        self.plaid_message = plaid_message
        self.request_id = request_id
        super().__init__("Plaid could not complete the request.")


def is_configured() -> bool:
    return settings.plaid_configured


def _sandbox_api_secret() -> str:
    sandbox = settings.plaid_sandbox_secret.get_secret_value().strip()
    if sandbox:
        return sandbox
    return settings.plaid_secret.get_secret_value().strip()


def sandbox_configured() -> bool:
    return bool(settings.plaid_client_id.strip() and _sandbox_api_secret())


def log_startup_diagnostics() -> None:
    client_set = bool(settings.plaid_client_id.strip())
    logger.info(
        "Plaid startup: app_environment=%s plaid_environment=%s "
        "client_id_set=%s sandbox_secret_set=%s generic_secret_set=%s "
        "configured=%s sandbox_configured=%s",
        settings.environment,
        settings.plaid_environment,
        client_set,
        bool(settings.plaid_sandbox_secret.get_secret_value().strip()),
        bool(settings.plaid_secret.get_secret_value().strip()),
        is_configured(),
        sandbox_configured(),
    )


async def _post(
    path: str,
    payload: dict[str, Any],
    *,
    plaid_environment: str | None = None,
) -> dict[str, Any]:
    env = plaid_environment or settings.plaid_environment
    client_id = settings.plaid_client_id.strip()
    base_url = PLAID_BASE_URLS[env]
    if env == "sandbox":
        if not sandbox_configured():
            logger.error(
                "Plaid sandbox call blocked: missing credentials "
                "(client_id_set=%s sandbox_secret_set=%s path=%s)",
                bool(client_id),
                bool(settings.plaid_sandbox_secret.get_secret_value().strip()),
                path,
            )
            raise PlaidNotConfiguredError(
                "Plaid Sandbox is not configured (set PLAID_CLIENT_ID and PLAID_SANDBOX_SECRET)."
            )
        secret = _sandbox_api_secret()
    else:
        if not is_configured():
            logger.error("Plaid call blocked: not configured path=%s env=%s", path, env)
            raise PlaidNotConfiguredError("Plaid is not configured.")
        secret = settings.effective_plaid_secret()

    headers = {
        "PLAID-CLIENT-ID": client_id,
        "PLAID-SECRET": secret,
        "Plaid-Version": "2020-09-14",
        "Content-Type": "application/json",
    }
    started = time.monotonic()
    logger.info("Plaid request start env=%s host=%s path=%s", env, base_url, path)
    try:
        async with httpx.AsyncClient(
            base_url=base_url,
            timeout=httpx.Timeout(25.0),
        ) as client:
            response = await client.post(path, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        elapsed_ms = int((time.monotonic() - started) * 1000)
        logger.warning(
            "Plaid transport error env=%s path=%s elapsed_ms=%s error=%s",
            env,
            path,
            elapsed_ms,
            type(exc).__name__,
        )
        raise PlaidAPIError("PLAID_UNAVAILABLE") from None

    elapsed_ms = int((time.monotonic() - started) * 1000)
    try:
        body = response.json()
    except ValueError:
        logger.warning(
            "Plaid non-JSON response env=%s path=%s status=%s elapsed_ms=%s body_prefix=%r",
            env,
            path,
            response.status_code,
            elapsed_ms,
            (response.text or "")[:200],
        )
        raise PlaidAPIError("INVALID_PLAID_RESPONSE") from None
    if response.is_error or not isinstance(body, dict):
        code = body.get("error_code") if isinstance(body, dict) else None
        error_type = body.get("error_type") if isinstance(body, dict) else None
        request_id = body.get("request_id") if isinstance(body, dict) else None
        message = None
        if isinstance(body, dict):
            message = body.get("error_message") or body.get("display_message")
        logger.warning(
            "Plaid API error env=%s path=%s status=%s elapsed_ms=%s "
            "error_code=%s error_type=%s request_id=%s message=%s",
            env,
            path,
            response.status_code,
            elapsed_ms,
            code,
            error_type,
            request_id,
            message,
        )
        raise PlaidAPIError(
            str(code or "PLAID_API_ERROR"),
            plaid_message=str(message) if message else None,
            request_id=str(request_id) if request_id else None,
        )
    logger.info(
        "Plaid request ok env=%s path=%s status=%s elapsed_ms=%s request_id=%s",
        env,
        path,
        response.status_code,
        elapsed_ms,
        body.get("request_id"),
    )
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
    try:
        return await _post("/link/token/create", payload)
    except PlaidAPIError as exc:
        # OAuth redirect allowlisting should never block the Sandbox demo. Keep
        # the configured redirect on the first request so OAuth institutions work
        # when the dashboard is ready, then fall back to non-OAuth Sandbox Link.
        if (
            settings.plaid_environment != "sandbox"
            or "redirect_uri" not in payload
            or exc.code != "INVALID_FIELD"
            or "redirect uri" not in (exc.plaid_message or "").lower()
        ):
            raise
        logger.warning(
            "Plaid Sandbox rejected the configured OAuth redirect; "
            "retrying Link without redirect_uri"
        )
        sandbox_payload = {
            key: value
            for key, value in payload.items()
            if key != "redirect_uri"
        }
        return await _post("/link/token/create", sandbox_payload)


async def exchange_public_token(public_token: str) -> dict[str, Any]:
    return await _post("/item/public_token/exchange", {"public_token": public_token})


async def exchange_sandbox_public_token(public_token: str) -> dict[str, Any]:
    """Exchange a token created on sandbox.plaid.com (D4 seeded account)."""
    return await _post(
        "/item/public_token/exchange",
        {"public_token": public_token},
        plaid_environment="sandbox",
    )


async def create_sandbox_public_token(custom_user: dict[str, Any]) -> dict[str, Any]:
    """Create the deterministic D4 Item through Plaid's Sandbox API."""
    tx_count = 0
    try:
        accounts = custom_user.get("override_accounts") or []
        if accounts:
            tx_count = len(accounts[0].get("transactions") or [])
    except (AttributeError, TypeError, IndexError):
        tx_count = 0
    logger.info(
        "Plaid D4 sandbox public_token/create institution_id=ins_109508 seeded_transactions=%s",
        tx_count,
    )
    return await _post(
        "/sandbox/public_token/create",
        {
            "institution_id": "ins_109508",
            "initial_products": ["transactions"],
            "options": {
                "override_username": "user_custom",
                "override_password": json.dumps(custom_user, separators=(",", ":")),
                "transactions": {
                    "start_date": "2025-11-01",
                    "end_date": "2026-07-19",
                },
            },
        },
        plaid_environment="sandbox",
    )


async def remove_item(access_token: str, *, plaid_environment: str | None = None) -> None:
    await _post(
        "/item/remove",
        {"access_token": access_token},
        plaid_environment=plaid_environment,
    )


async def sync_transactions(
    access_token: str,
    *,
    plaid_environment: str | None = None,
) -> dict[str, Any]:
    """Read a complete snapshot after Plaid finishes its historical pull."""
    cursor: str | None = None
    transactions: dict[str, dict[str, Any]] = {}
    removed_ids: set[str] = set()
    initial_update_complete = False
    historical_update_complete = False

    for readiness_attempt in range(TRANSACTIONS_READY_MAX_POLLS):
        for _ in range(TRANSACTIONS_SYNC_MAX_PAGES):
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
            page = await _post(
                "/transactions/sync",
                payload,
                plaid_environment=plaid_environment,
            )

            for transaction in [*(page.get("added") or []), *(page.get("modified") or [])]:
                transaction_id = transaction.get("transaction_id")
                if transaction_id:
                    transactions[str(transaction_id)] = transaction
            for removed in page.get("removed") or []:
                transaction_id = removed.get("transaction_id")
                if transaction_id:
                    removed_ids.add(str(transaction_id))

            cursor = page.get("next_cursor") or cursor
            update_status = str(page.get("transactions_update_status") or "")
            initial_update_complete = (
                initial_update_complete
                or bool(page.get("initial_update_complete"))
                or update_status in {"INITIAL_UPDATE_COMPLETE", "HISTORICAL_UPDATE_COMPLETE"}
            )
            historical_update_complete = (
                historical_update_complete
                or bool(page.get("historical_update_complete"))
                or update_status == "HISTORICAL_UPDATE_COMPLETE"
            )
            if not page.get("has_more"):
                break
        else:
            raise PlaidAPIError("TRANSACTIONS_SYNC_PAGE_LIMIT")

        if historical_update_complete:
            break
        if readiness_attempt == TRANSACTIONS_READY_MAX_POLLS - 1:
            raise PlaidAPIError("TRANSACTIONS_NOT_READY")
        logger.info(
            "Plaid transactions still preparing env=%s attempt=%s/%s initial=%s historical=%s",
            plaid_environment or settings.plaid_environment,
            readiness_attempt + 1,
            TRANSACTIONS_READY_MAX_POLLS,
            initial_update_complete,
            historical_update_complete,
        )
        await asyncio.sleep(TRANSACTIONS_READY_DELAY_SECONDS)

    for transaction_id in removed_ids:
        transactions.pop(transaction_id, None)
    return {
        "transactions": list(transactions.values()),
        "initial_update_complete": initial_update_complete,
        "historical_update_complete": historical_update_complete,
    }
