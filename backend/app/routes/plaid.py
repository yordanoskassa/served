import asyncio
import json
import logging
from datetime import UTC, datetime
from pathlib import Path

from bson import ObjectId
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import ValidationError

from app.config import settings
from app.db import get_db
from app.routes.auth import _verify_google_token, is_demo_profile
from app.schemas.analysis import AnalysisResponse
from app.schemas.plaid import (
    PaymentMatchRequest,
    PaymentMatchResponse,
    PlaidConnectionStatus,
    PlaidExchangeRequest,
    PlaidLinkTokenResponse,
    PlaidTransaction,
    TransactionDebugRequest,
    TransactionSnapshotResponse,
)
from app.services import plaid as plaid_service
from app.services.financial_matcher import (
    FinancialEligibilityError,
    extract_payment_request,
    match_payment_transactions,
)
from app.services.plaid import PlaidAPIError, PlaidNotConfiguredError


router = APIRouter(prefix="/plaid", tags=["plaid"])
logger = logging.getLogger(__name__)
D4_PLAID_FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "financial"
    / "payment-records"
    / "plaid-sandbox-custom-user.json"
)
MATCH_SYNC_TIMEOUT_SECONDS = 10.0


def _authenticate(authorization: str):
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    return _verify_google_token(token)


def _provider_error(exc: Exception, *, context: str = "plaid") -> HTTPException:
    if isinstance(exc, PlaidNotConfiguredError):
        message = str(exc).strip() or "Plaid Sandbox is not configured."
        logger.warning("%s not configured: %s", context, message)
        return HTTPException(status_code=503, detail=message)
    if isinstance(exc, PlaidAPIError) and exc.code == "ITEM_LOGIN_REQUIRED":
        logger.warning("%s item login required", context)
        return HTTPException(
            status_code=409,
            detail="The bank connection needs to be repaired in Plaid Link.",
        )
    if isinstance(exc, PlaidAPIError) and exc.code == "PLAID_UNAVAILABLE":
        logger.warning("%s Plaid unavailable (transport)", context)
        return HTTPException(
            status_code=503,
            detail="Plaid is temporarily unavailable. Try again in a moment.",
        )
    if isinstance(exc, PlaidAPIError) and exc.code == "TRANSACTIONS_NOT_READY":
        logger.info("%s Plaid transactions still preparing", context)
        return HTTPException(
            status_code=409,
            detail="Plaid is still preparing the transaction history. Try again in a moment.",
            headers={"Retry-After": "3"},
        )
    if isinstance(exc, PlaidAPIError) and exc.code == "INVALID_CREDENTIALS":
        logger.warning("%s Plaid INVALID_CREDENTIALS (custom sandbox user or API keys)", context)
        return HTTPException(
            status_code=502,
            detail=(
                "Plaid rejected the D4 sample bank configuration (INVALID_CREDENTIALS). "
                "Redeploy the latest backend fixture, or check PLAID_SANDBOX_SECRET."
            ),
        )
    if (
        isinstance(exc, PlaidAPIError)
        and exc.code == "INVALID_FIELD"
        and "redirect uri" in (exc.plaid_message or "").lower()
    ):
        logger.warning("%s Plaid OAuth redirect URI is not allowlisted", context)
        return HTTPException(
            status_code=502,
            detail=(
                "Plaid OAuth is not ready for this domain. Add the exact "
                "PLAID_REDIRECT_URI to Plaid Dashboard → API → Allowed redirect URIs."
            ),
        )
    if isinstance(exc, PlaidAPIError):
        logger.warning(
            "%s Plaid API failure code=%s request_id=%s message=%s",
            context,
            exc.code,
            exc.request_id,
            exc.plaid_message,
        )
        return HTTPException(
            status_code=502,
            detail=(
                f"Plaid could not complete the request ({exc.code}). "
                "Confirm PLAID_CLIENT_ID and PLAID_SANDBOX_SECRET in EasyPanel."
            ),
        )
    logger.warning("%s unexpected error type=%s", context, type(exc).__name__)
    return HTTPException(
        status_code=502,
        detail="Plaid could not complete the request. Please try again.",
    )


async def _eligible_analysis(analysis_id: str, profile):
    if not ObjectId.is_valid(analysis_id):
        raise HTTPException(status_code=404, detail="Saved analysis not found.")
    try:
        record = await get_db().analyses.find_one({
            "_id": ObjectId(analysis_id),
            "google_subject": profile.subject,
        })
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Saved analysis is temporarily unavailable.",
        ) from exc
    if record is None:
        raise HTTPException(status_code=404, detail="Saved analysis not found.")
    try:
        analysis = AnalysisResponse.model_validate(record.get("analysis"))
    except ValidationError as exc:
        raise HTTPException(
            status_code=409,
            detail="Financial tools stay locked because this analysis is incomplete.",
        ) from exc
    if analysis.verdict != "verified":
        raise HTTPException(
            status_code=409,
            detail="Financial tools stay locked until this request is verified.",
        )
    try:
        target_payee, start_date = extract_payment_request(analysis)
    except FinancialEligibilityError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return record, analysis, target_payee, start_date


def _parse_transactions(result: dict) -> list[PlaidTransaction]:
    parsed: list[PlaidTransaction] = []
    for item in result.get("transactions") or []:
        category = item.get("personal_finance_category") or {}
        if not isinstance(category, dict):
            category = {}
        try:
            parsed.append(PlaidTransaction(
                transaction_id=item["transaction_id"],
                account_id=item["account_id"],
                name=item.get("name") or item.get("original_description") or "Transaction",
                merchant_name=item.get("merchant_name"),
                date=item["date"],
                amount=item["amount"],
                currency=(
                    item.get("currency")
                    or item.get("iso_currency_code")
                    or item.get("unofficial_currency_code")
                ),
                pending=bool(item.get("pending")),
                category_primary=item.get("category_primary") or category.get("primary"),
                category_detailed=item.get("category_detailed") or category.get("detailed"),
            ))
        except (KeyError, TypeError, ValueError, ValidationError) as exc:
            raise HTTPException(
                status_code=502,
                detail="Plaid returned a transaction that could not be safely evaluated.",
            ) from exc
    return parsed


def _seeded_d4_transactions() -> dict:
    fixture = json.loads(D4_PLAID_FIXTURE.read_text())
    transactions = fixture["override_accounts"][0]["transactions"]
    return {
        "transactions": [
            {
                "transaction_id": f"D4-SANDBOX-{index:03d}",
                "account_id": "d4-business-checking",
                "name": item["description"],
                "merchant_name": None,
                "date": item["date_transacted"],
                "amount": item["amount"],
                "iso_currency_code": item["currency"],
                "pending": False,
                "personal_finance_category": None,
            }
            for index, item in enumerate(transactions, start=1)
        ],
        "initial_update_complete": True,
        "historical_update_complete": True,
    }


def _connection_plaid_environment(connection: dict) -> str | None:
    if connection.get("demo_fixture"):
        return "sandbox"
    stored_environment = connection.get("environment")
    if stored_environment in plaid_service.PLAID_BASE_URLS:
        return stored_environment
    return None


async def _load_transaction_snapshot(subject: str, item_id: str | None) -> dict | None:
    if not item_id:
        return None
    try:
        return await get_db().bank_transaction_snapshots.find_one({
            "google_subject": subject,
            "item_id": item_id,
        })
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="The saved transaction snapshot is temporarily unavailable.",
        ) from exc


def _snapshot_response(*, enabled: bool, snapshot: dict | None) -> TransactionSnapshotResponse:
    if not enabled or not snapshot:
        return TransactionSnapshotResponse(enabled=enabled, available=False)
    try:
        transactions = [
            PlaidTransaction.model_validate(item)
            for item in snapshot.get("transactions") or []
        ]
        return TransactionSnapshotResponse(
            enabled=True,
            available=True,
            source=snapshot.get("source"),
            synced_at=snapshot.get("synced_at"),
            total=len(transactions),
            initial_update_complete=bool(snapshot.get("initial_update_complete")),
            historical_update_complete=bool(snapshot.get("historical_update_complete")),
            transactions=transactions,
        )
    except (TypeError, ValueError, ValidationError) as exc:
        raise HTTPException(
            status_code=503,
            detail="The saved transaction snapshot could not be safely read.",
        ) from exc


async def _store_transaction_snapshot(
    *,
    subject: str,
    item_id: str,
    result: dict,
    source: str,
) -> dict:
    transactions = _parse_transactions(result)
    synced_at = datetime.now(UTC)
    document = {
        "google_subject": subject,
        "item_id": item_id,
        "source": source,
        "synced_at": synced_at,
        "initial_update_complete": bool(result.get("initial_update_complete")),
        "historical_update_complete": bool(result.get("historical_update_complete")),
        "transaction_count": len(transactions),
        "transactions": [item.model_dump(mode="json") for item in transactions],
        "updated_at": synced_at,
    }
    try:
        await get_db().bank_transaction_snapshots.update_one(
            {"google_subject": subject},
            {"$set": document},
            upsert=True,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Transactions were retrieved, but the diagnostic snapshot could not be saved.",
        ) from exc
    logger.info(
        "transaction snapshot saved subject=%s source=%s count=%s",
        subject[:12] + "…" if len(subject) > 12 else subject,
        source,
        len(transactions),
    )
    return document


async def _sync_connection_transactions(connection: dict, *, context: str) -> tuple[dict, str]:
    if connection.get("demo_fixture"):
        return _seeded_d4_transactions(), "reviewed_sample"
    try:
        async with asyncio.timeout(MATCH_SYNC_TIMEOUT_SECONDS):
            result = await plaid_service.sync_transactions(
                connection["access_token"],
                plaid_environment=_connection_plaid_environment(connection),
                readiness_max_polls=1,
            )
        return result, "plaid"
    except TimeoutError:
        logger.info(
            "%s exceeded Plaid request budget timeout_seconds=%s",
            context,
            MATCH_SYNC_TIMEOUT_SECONDS,
        )
        raise PlaidAPIError("TRANSACTIONS_NOT_READY") from None


async def _connection_status_for_subject(subject: str) -> PlaidConnectionStatus:
    try:
        connection = await get_db().bank_connections.find_one(
            {"google_subject": subject},
            {
                "access_token": 1,
                "institution_name": 1,
                "connected_at": 1,
                "environment": 1,
                "demo_fixture": 1,
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Bank connection status is temporarily unavailable.",
        ) from exc
    connected = bool(connection and connection.get("access_token"))
    configured = subject.startswith("demo:") or plaid_service.is_configured() or connected
    stored_environment = connection.get("environment") if connection else None
    environment = (
        stored_environment
        if stored_environment in plaid_service.PLAID_BASE_URLS
        else settings.plaid_environment
    )
    return PlaidConnectionStatus(
        configured=configured,
        connected=connected,
        environment=environment,
        institution_name=connection.get("institution_name") if connected else None,
        connected_at=connection.get("connected_at") if connected else None,
        demo_fixture=bool(connected and connection.get("demo_fixture")),
    )


async def _save_connection(
    *,
    subject: str,
    provider_result: dict,
    institution_id: str | None,
    institution_name: str | None,
    demo_fixture: bool,
) -> PlaidConnectionStatus:
    access_token = provider_result.get("access_token")
    item_id = provider_result.get("item_id")
    if not access_token or not item_id:
        raise HTTPException(status_code=502, detail="Plaid returned an incomplete connection.")

    connected_at = datetime.now(UTC)
    try:
        database = get_db()
        await database.bank_connections.update_one(
            {"google_subject": subject},
            {"$set": {
                "google_subject": subject,
                "access_token": access_token,
                "item_id": item_id,
                "institution_id": institution_id,
                "institution_name": institution_name,
                "environment": settings.plaid_environment,
                "demo_fixture": demo_fixture,
                "transaction_debug_enabled": False,
                "connected_at": connected_at,
                "updated_at": connected_at,
            }},
            upsert=True,
        )
        await database.bank_transaction_snapshots.delete_one({
            "google_subject": subject,
        })
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="The bank connected, but Served could not save the connection.",
        ) from exc

    return PlaidConnectionStatus(
        configured=True,
        connected=True,
        environment=settings.plaid_environment,
        institution_name=institution_name,
        connected_at=connected_at,
        demo_fixture=demo_fixture,
    )


@router.get("/connection", response_model=PlaidConnectionStatus)
async def user_connection_status(
    authorization: str = Header(default=""),
) -> PlaidConnectionStatus:
    profile = _authenticate(authorization)
    return await _connection_status_for_subject(profile.subject)


@router.get("/connection/transaction-debug", response_model=TransactionSnapshotResponse)
async def transaction_debug_status(
    authorization: str = Header(default=""),
) -> TransactionSnapshotResponse:
    profile = _authenticate(authorization)
    try:
        connection = await get_db().bank_connections.find_one(
            {"google_subject": profile.subject},
            {"item_id": 1, "transaction_debug_enabled": 1},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Transaction diagnostics are temporarily unavailable.",
        ) from exc
    enabled = bool(connection and connection.get("transaction_debug_enabled"))
    snapshot = await _load_transaction_snapshot(
        profile.subject,
        connection.get("item_id") if connection else None,
    ) if enabled else None
    return _snapshot_response(enabled=enabled, snapshot=snapshot)


@router.put("/connection/transaction-debug", response_model=TransactionSnapshotResponse)
async def update_transaction_debug(
    body: TransactionDebugRequest,
    authorization: str = Header(default=""),
) -> TransactionSnapshotResponse:
    profile = _authenticate(authorization)
    collection = get_db().bank_connections
    try:
        connection = await collection.find_one(
            {"google_subject": profile.subject},
            {
                "access_token": 1,
                "item_id": 1,
                "environment": 1,
                "demo_fixture": 1,
                "transaction_debug_enabled": 1,
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Transaction diagnostics are temporarily unavailable.",
        ) from exc
    if not connection or not connection.get("access_token") or not connection.get("item_id"):
        raise HTTPException(status_code=409, detail="Connect a bank account first.")

    try:
        await collection.update_one(
            {"google_subject": profile.subject},
            {"$set": {
                "transaction_debug_enabled": body.enabled,
                "updated_at": datetime.now(UTC),
            }},
        )
        if not body.enabled:
            await get_db().bank_transaction_snapshots.delete_one({
                "google_subject": profile.subject,
            })
            return TransactionSnapshotResponse(enabled=False, available=False)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Transaction diagnostic settings could not be saved.",
        ) from exc

    if connection.get("demo_fixture"):
        snapshot = await _store_transaction_snapshot(
            subject=profile.subject,
            item_id=connection["item_id"],
            result=_seeded_d4_transactions(),
            source="reviewed_sample",
        )
    else:
        snapshot = await _load_transaction_snapshot(profile.subject, connection["item_id"])
    return _snapshot_response(enabled=True, snapshot=snapshot)


@router.post("/connection/transactions/sync", response_model=TransactionSnapshotResponse)
async def sync_transaction_snapshot(
    authorization: str = Header(default=""),
) -> TransactionSnapshotResponse:
    profile = _authenticate(authorization)
    try:
        connection = await get_db().bank_connections.find_one(
            {"google_subject": profile.subject},
            {
                "access_token": 1,
                "item_id": 1,
                "environment": 1,
                "demo_fixture": 1,
                "transaction_debug_enabled": 1,
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Bank connection data is temporarily unavailable.",
        ) from exc
    if not connection or not connection.get("access_token") or not connection.get("item_id"):
        raise HTTPException(status_code=409, detail="Connect a bank account first.")
    if not connection.get("transaction_debug_enabled"):
        raise HTTPException(
            status_code=409,
            detail="Enable transaction diagnostics in Settings before saving a snapshot.",
        )
    try:
        result, source = await _sync_connection_transactions(
            connection,
            context="settings transaction sync",
        )
        snapshot = await _store_transaction_snapshot(
            subject=profile.subject,
            item_id=connection["item_id"],
            result=result,
            source=source,
        )
        return _snapshot_response(enabled=True, snapshot=snapshot)
    except (OSError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=503,
            detail="The transaction snapshot could not be prepared.",
        ) from exc
    except (PlaidAPIError, PlaidNotConfiguredError) as exc:
        raise _provider_error(exc, context="settings-transaction-sync") from None


@router.get("/analyses/{analysis_id}/status", response_model=PlaidConnectionStatus)
async def connection_status(
    analysis_id: str,
    authorization: str = Header(default=""),
) -> PlaidConnectionStatus:
    profile = _authenticate(authorization)
    await _eligible_analysis(analysis_id, profile)
    return await _connection_status_for_subject(profile.subject)


@router.post("/connection/link-token", response_model=PlaidLinkTokenResponse)
async def user_link_token(
    authorization: str = Header(default=""),
) -> PlaidLinkTokenResponse:
    """Start Plaid Link from Settings without a saved analysis."""
    profile = _authenticate(authorization)
    if is_demo_profile(profile):
        raise HTTPException(
            status_code=403,
            detail="Demo access uses the seeded Sandbox account only.",
        )
    try:
        result = await plaid_service.create_link_token(profile.subject)
        return PlaidLinkTokenResponse.model_validate(result)
    except (PlaidAPIError, PlaidNotConfiguredError) as exc:
        raise _provider_error(exc, context="connection-link-token") from None


@router.post("/connection/exchange", response_model=PlaidConnectionStatus)
async def user_exchange_token(
    body: PlaidExchangeRequest,
    authorization: str = Header(default=""),
) -> PlaidConnectionStatus:
    """Finish Plaid Link from Settings (user-level bank connection)."""
    profile = _authenticate(authorization)
    if is_demo_profile(profile):
        raise HTTPException(
            status_code=403,
            detail="Demo access cannot connect a personal bank account.",
        )
    try:
        result = await plaid_service.exchange_public_token(body.public_token)
    except (PlaidAPIError, PlaidNotConfiguredError) as exc:
        raise _provider_error(exc, context="connection-exchange") from None
    return await _save_connection(
        subject=profile.subject,
        provider_result=result,
        institution_id=body.institution_id,
        institution_name=body.institution_name,
        demo_fixture=False,
    )


@router.post("/analyses/{analysis_id}/link-token", response_model=PlaidLinkTokenResponse)
async def link_token(
    analysis_id: str,
    authorization: str = Header(default=""),
) -> PlaidLinkTokenResponse:
    profile = _authenticate(authorization)
    if is_demo_profile(profile):
        raise HTTPException(
            status_code=403,
            detail="Demo access uses the seeded Sandbox account only.",
        )
    await _eligible_analysis(analysis_id, profile)
    try:
        result = await plaid_service.create_link_token(profile.subject)
        return PlaidLinkTokenResponse.model_validate(result)
    except (PlaidAPIError, PlaidNotConfiguredError) as exc:
        raise _provider_error(exc) from None


@router.post("/analyses/{analysis_id}/exchange", response_model=PlaidConnectionStatus)
async def exchange_token(
    analysis_id: str,
    body: PlaidExchangeRequest,
    authorization: str = Header(default=""),
) -> PlaidConnectionStatus:
    profile = _authenticate(authorization)
    if is_demo_profile(profile):
        raise HTTPException(
            status_code=403,
            detail="Demo access cannot connect a personal bank account.",
        )
    await _eligible_analysis(analysis_id, profile)
    try:
        result = await plaid_service.exchange_public_token(body.public_token)
    except (PlaidAPIError, PlaidNotConfiguredError) as exc:
        raise _provider_error(exc) from None
    return await _save_connection(
        subject=profile.subject,
        provider_result=result,
        institution_id=body.institution_id,
        institution_name=body.institution_name,
        demo_fixture=False,
    )


async def _save_local_d4_sample_connection(
    profile,
    *,
    institution_name: str = "Mendoza’s Kitchen · D4 sample",
) -> PlaidConnectionStatus:
    """Persist the reviewed D4 fixture locally (matching uses fixture rows, not Plaid sync)."""
    return await _save_connection(
        subject=profile.subject,
        provider_result={
            "access_token": f"served-seeded-fixture:{profile.subject}",
            "item_id": f"served-seeded-item:{profile.subject}",
        },
        institution_id="ins_109508",
        institution_name=institution_name,
        demo_fixture=True,
    )


async def _connect_seeded_sandbox_bank(profile, *, log_label: str) -> PlaidConnectionStatus:
    """Connect the Mendoza D4 Plaid Sandbox item for this user (no analysis required)."""
    demo_profile = is_demo_profile(profile)
    subject_hint = profile.subject[:12] + "…" if len(profile.subject) > 12 else profile.subject
    logger.info(
        "sandbox-connect start context=%s subject=%s plaid_environment=%s "
        "sandbox_configured=%s fixture_path=%s fixture_exists=%s",
        log_label,
        subject_hint,
        settings.plaid_environment,
        plaid_service.sandbox_configured(),
        D4_PLAID_FIXTURE,
        D4_PLAID_FIXTURE.is_file(),
    )
    if not demo_profile and settings.plaid_environment not in ("sandbox", "development"):
        logger.warning(
            "sandbox-connect rejected: plaid_environment=%s (production)",
            settings.plaid_environment,
        )
        raise HTTPException(status_code=404, detail="The sample bank is available only in Sandbox.")
    if demo_profile:
        return await _save_local_d4_sample_connection(
            profile,
            institution_name="Mendoza’s Kitchen Sandbox",
        )
    if settings.plaid_environment in ("sandbox", "development"):
        if not D4_PLAID_FIXTURE.is_file():
            raise HTTPException(
                status_code=503,
                detail=f"D4 bank demo fixture is missing on the server ({D4_PLAID_FIXTURE.name}).",
            )
        logger.info(
            "sandbox-connect using local D4 fixture (skip Plaid custom-user API) context=%s",
            log_label,
        )
        status = await _save_local_d4_sample_connection(profile)
        logger.info(
            "sandbox-connect success context=%s subject=%s demo_fixture=%s institution=%s",
            log_label,
            subject_hint,
            status.demo_fixture,
            status.institution_name,
        )
        return status

    raise HTTPException(status_code=404, detail="The sample bank is available only in Sandbox.")


@router.post("/connection/sandbox-connect", response_model=PlaidConnectionStatus)
async def connect_sandbox_from_settings(
    authorization: str = Header(default=""),
) -> PlaidConnectionStatus:
    """Connect the D4 sample bank from Settings or Financial records (user-level)."""
    profile = _authenticate(authorization)
    return await _connect_seeded_sandbox_bank(profile, log_label="settings")


@router.post("/analyses/{analysis_id}/sandbox-connect", response_model=PlaidConnectionStatus)
async def connect_d4_sandbox(
    analysis_id: str,
    authorization: str = Header(default=""),
) -> PlaidConnectionStatus:
    """Connect D4 to its deterministic Plaid Sandbox business account."""
    profile = _authenticate(authorization)
    await _eligible_analysis(analysis_id, profile)
    return await _connect_seeded_sandbox_bank(profile, log_label=f"analysis:{analysis_id}")


@router.post("/analyses/{analysis_id}/match", response_model=PaymentMatchResponse)
async def match_transactions(
    analysis_id: str,
    body: PaymentMatchRequest,
    authorization: str = Header(default=""),
) -> PaymentMatchResponse:
    profile = _authenticate(authorization)
    record, _, target_payee, start_date = await _eligible_analysis(analysis_id, profile)
    try:
        connection = await get_db().bank_connections.find_one(
            {"google_subject": profile.subject},
            {
                "access_token": 1,
                "item_id": 1,
                "environment": 1,
                "demo_fixture": 1,
                "transaction_debug_enabled": 1,
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Bank connection data is temporarily unavailable.",
        ) from exc
    if not connection or not connection.get("access_token"):
        raise HTTPException(status_code=409, detail="Connect a bank account first.")

    plaid_api_env = _connection_plaid_environment(connection)

    filename = str(record.get("filename") or "")
    if (
        (plaid_api_env or settings.plaid_environment) != "production"
        and not connection.get("demo_fixture")
        and "D4" in filename.upper()
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Connect the Mendoza’s Kitchen sample account for the D4 demo "
                "(7 include, 2 review, 19 exclude). Generic sandbox banks such as "
                "Bank of America or American Express do not contain Audrea Barnes payments."
            ),
        )

    try:
        logger.info(
            "plaid match sync start analysis_id=%s demo_fixture=%s plaid_api_env=%s",
            analysis_id,
            bool(connection.get("demo_fixture")),
            plaid_api_env or settings.plaid_environment,
        )
        result = None
        transaction_source = "plaid"
        transactions_synced_at = None
        if connection.get("transaction_debug_enabled"):
            snapshot = await _load_transaction_snapshot(
                profile.subject,
                connection.get("item_id"),
            )
            if snapshot:
                result = {
                    "transactions": snapshot.get("transactions") or [],
                    "initial_update_complete": bool(snapshot.get("initial_update_complete")),
                    "historical_update_complete": bool(snapshot.get("historical_update_complete")),
                }
                transaction_source = "mongo_cache"
                transactions_synced_at = snapshot.get("synced_at")

        if result is None:
            result, provider_source = await _sync_connection_transactions(
                connection,
                context=f"match:{analysis_id}",
            )
            transaction_source = provider_source
            if connection.get("transaction_debug_enabled"):
                if not connection.get("item_id"):
                    raise HTTPException(
                        status_code=409,
                        detail="Reconnect the bank before saving a transaction snapshot.",
                    )
                snapshot = await _store_transaction_snapshot(
                    subject=profile.subject,
                    item_id=connection["item_id"],
                    result=result,
                    source=provider_source,
                )
                transactions_synced_at = snapshot.get("synced_at")
        logger.info(
            "plaid match data ready analysis_id=%s source=%s transactions=%s initial=%s historical=%s",
            analysis_id,
            transaction_source,
            len(result.get("transactions") or []),
            result.get("initial_update_complete"),
            result.get("historical_update_complete"),
        )
    except (OSError, KeyError, TypeError, ValueError) as exc:
        logger.exception("transaction data preparation failed analysis_id=%s", analysis_id)
        raise HTTPException(
            status_code=503,
            detail="The transaction data could not be safely prepared.",
        ) from exc
    except (PlaidAPIError, PlaidNotConfiguredError) as exc:
        raise _provider_error(exc, context=f"match:{analysis_id}") from None

    parsed = _parse_transactions(result)
    try:
        matched = match_payment_transactions(
            parsed,
            analysis_id=analysis_id,
            source_document=record.get("filename") or "Uploaded document",
            target_payee=target_payee,
            start_date=start_date,
            cutoff_date=body.cutoff_date,
        )
        return matched.model_copy(update={
            "transaction_source": transaction_source,
            "transactions_synced_at": transactions_synced_at,
        })
    except FinancialEligibilityError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/connection", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect(
    authorization: str = Header(default=""),
) -> None:
    profile = _authenticate(authorization)
    collection = get_db().bank_connections
    try:
        connection = await collection.find_one(
            {"google_subject": profile.subject},
            {"access_token": 1, "environment": 1, "demo_fixture": 1},
        )
        if (
            connection
            and connection.get("access_token")
            and not is_demo_profile(profile)
        ):
            await plaid_service.remove_item(
                connection["access_token"],
                plaid_environment=_connection_plaid_environment(connection),
            )
        await collection.delete_one({"google_subject": profile.subject})
        await get_db().bank_transaction_snapshots.delete_one({
            "google_subject": profile.subject,
        })
    except (PlaidAPIError, PlaidNotConfiguredError) as exc:
        raise _provider_error(exc) from None
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="The bank connection could not be removed.",
        ) from exc
