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
        try:
            parsed.append(PlaidTransaction(
                transaction_id=item["transaction_id"],
                account_id=item["account_id"],
                name=item.get("name") or item.get("original_description") or "Transaction",
                merchant_name=item.get("merchant_name"),
                date=item["date"],
                amount=item["amount"],
                currency=item.get("iso_currency_code") or item.get("unofficial_currency_code"),
                pending=bool(item.get("pending")),
                category_primary=category.get("primary"),
                category_detailed=category.get("detailed"),
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


async def _connection_status_for_subject(subject: str) -> PlaidConnectionStatus:
    configured = subject.startswith("demo:") or plaid_service.is_configured()
    if not configured:
        return PlaidConnectionStatus(
            configured=False,
            connected=False,
            environment=settings.plaid_environment,
        )
    try:
        connection = await get_db().bank_connections.find_one(
            {"google_subject": subject},
            {"institution_name": 1, "connected_at": 1, "demo_fixture": 1},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Bank connection status is temporarily unavailable.",
        ) from exc
    return PlaidConnectionStatus(
        configured=True,
        connected=connection is not None,
        environment=settings.plaid_environment,
        institution_name=connection.get("institution_name") if connection else None,
        connected_at=connection.get("connected_at") if connection else None,
        demo_fixture=bool(connection and connection.get("demo_fixture")),
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
        await get_db().bank_connections.update_one(
            {"google_subject": subject},
            {"$set": {
                "google_subject": subject,
                "access_token": access_token,
                "item_id": item_id,
                "institution_id": institution_id,
                "institution_name": institution_name,
                "environment": settings.plaid_environment,
                "demo_fixture": demo_fixture,
                "connected_at": connected_at,
                "updated_at": connected_at,
            }},
            upsert=True,
        )
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
        return await _save_connection(
            subject=profile.subject,
            provider_result={
                "access_token": f"served-demo-fixture:{profile.subject}",
                "item_id": f"served-demo-item:{profile.subject}",
            },
            institution_id="served_demo_fixture",
            institution_name="Mendoza’s Kitchen Sandbox",
            demo_fixture=True,
        )
    try:
        raw_fixture = D4_PLAID_FIXTURE.read_text()
        custom_user = json.loads(raw_fixture)
        logger.info(
            "sandbox-connect fixture loaded bytes=%s accounts=%s",
            len(raw_fixture),
            len(custom_user.get("override_accounts") or []),
        )
        public_token_result = await plaid_service.create_sandbox_public_token(custom_user)
        public_token = public_token_result.get("public_token")
        if not public_token:
            logger.warning("sandbox-connect missing public_token in Plaid response keys=%s", list(public_token_result))
            raise PlaidAPIError("INVALID_PLAID_RESPONSE")
        logger.info("sandbox-connect public_token received, exchanging")
        provider_result = await plaid_service.exchange_sandbox_public_token(public_token)
        item_id = provider_result.get("item_id")
        logger.info("sandbox-connect exchange ok item_id=%s", item_id)
    except OSError as exc:
        logger.exception(
            "sandbox-connect fixture IO error path=%s context=%s",
            D4_PLAID_FIXTURE,
            log_label,
        )
        raise HTTPException(
            status_code=503,
            detail=f"D4 bank demo fixture is missing on the server ({D4_PLAID_FIXTURE.name}).",
        ) from exc
    except ValueError as exc:
        logger.warning(
            "sandbox-connect invalid fixture JSON path=%s context=%s error=%s",
            D4_PLAID_FIXTURE,
            log_label,
            exc,
        )
        raise HTTPException(
            status_code=503,
            detail="D4 bank demo fixture is invalid JSON on the server.",
        ) from exc
    except (PlaidAPIError, PlaidNotConfiguredError) as exc:
        raise _provider_error(exc, context="sandbox-connect") from None
    status = await _save_connection(
        subject=profile.subject,
        provider_result=provider_result,
        institution_id="ins_109508",
        institution_name="First Platypus Bank",
        demo_fixture=True,
    )
    logger.info(
        "sandbox-connect success context=%s subject=%s demo_fixture=%s institution=%s",
        log_label,
        subject_hint,
        status.demo_fixture,
        status.institution_name,
    )
    return status


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
            {"access_token": 1, "demo_fixture": 1},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Bank connection data is temporarily unavailable.",
        ) from exc
    if not connection or not connection.get("access_token"):
        raise HTTPException(status_code=409, detail="Connect a bank account first.")

    plaid_api_env = "sandbox" if connection.get("demo_fixture") else None

    filename = str(record.get("filename") or "")
    if (
        settings.plaid_environment != "production"
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
        seeded_result = _seeded_d4_transactions() if connection.get("demo_fixture") else None
        if is_demo_profile(profile) and seeded_result:
            result = seeded_result
        else:
            try:
                result = await plaid_service.sync_transactions(
                    connection["access_token"],
                    plaid_environment=plaid_api_env,
                )
            except PlaidAPIError as exc:
                if seeded_result and exc.code == "TRANSACTIONS_NOT_READY":
                    logger.warning(
                        "plaid D4 sandbox history stayed pending; using reviewed seeded snapshot analysis_id=%s",
                        analysis_id,
                    )
                    result = seeded_result
                else:
                    raise
            if (
                seeded_result
                and len(result.get("transactions") or [])
                != len(seeded_result["transactions"])
            ):
                logger.warning(
                    "plaid D4 sandbox returned incomplete history actual=%s expected=%s; "
                    "using reviewed seeded snapshot analysis_id=%s",
                    len(result.get("transactions") or []),
                    len(seeded_result["transactions"]),
                    analysis_id,
                )
                result = seeded_result
        logger.info(
            "plaid match sync ok analysis_id=%s transactions=%s initial=%s historical=%s",
            analysis_id,
            len(result.get("transactions") or []),
            result.get("initial_update_complete"),
            result.get("historical_update_complete"),
        )
    except (OSError, KeyError, TypeError, ValueError) as exc:
        logger.exception("demo fixture transaction load failed analysis_id=%s", analysis_id)
        raise HTTPException(
            status_code=503,
            detail="The seeded D4 transaction fixture is unavailable.",
        ) from exc
    except (PlaidAPIError, PlaidNotConfiguredError) as exc:
        raise _provider_error(exc, context=f"match:{analysis_id}") from None

    parsed = _parse_transactions(result)
    try:
        return match_payment_transactions(
            parsed,
            analysis_id=analysis_id,
            source_document=record.get("filename") or "Uploaded document",
            target_payee=target_payee,
            start_date=start_date,
            cutoff_date=body.cutoff_date,
        )
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
            {"access_token": 1, "demo_fixture": 1},
        )
        if (
            connection
            and connection.get("access_token")
            and not is_demo_profile(profile)
        ):
            plaid_api_env = "sandbox" if connection.get("demo_fixture") else None
            await plaid_service.remove_item(
                connection["access_token"],
                plaid_environment=plaid_api_env,
            )
        await collection.delete_one({"google_subject": profile.subject})
    except (PlaidAPIError, PlaidNotConfiguredError) as exc:
        raise _provider_error(exc) from None
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="The bank connection could not be removed.",
        ) from exc
