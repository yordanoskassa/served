import json
from datetime import UTC, datetime
from pathlib import Path

from bson import ObjectId
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import ValidationError

from app.config import settings
from app.db import get_db
from app.routes.auth import _verify_google_token
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


def _provider_error(exc: Exception) -> HTTPException:
    if isinstance(exc, PlaidNotConfiguredError):
        return HTTPException(status_code=503, detail="Plaid Sandbox is not configured.")
    if isinstance(exc, PlaidAPIError) and exc.code == "ITEM_LOGIN_REQUIRED":
        return HTTPException(
            status_code=409,
            detail="The bank connection needs to be repaired in Plaid Link.",
        )
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


async def _connection_status_for_subject(subject: str) -> PlaidConnectionStatus:
    configured = plaid_service.is_configured()
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


@router.post("/analyses/{analysis_id}/link-token", response_model=PlaidLinkTokenResponse)
async def link_token(
    analysis_id: str,
    authorization: str = Header(default=""),
) -> PlaidLinkTokenResponse:
    profile = _authenticate(authorization)
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


@router.post("/analyses/{analysis_id}/sandbox-connect", response_model=PlaidConnectionStatus)
async def connect_d4_sandbox(
    analysis_id: str,
    authorization: str = Header(default=""),
) -> PlaidConnectionStatus:
    """Connect D4 to its deterministic Plaid Sandbox business account."""
    profile = _authenticate(authorization)
    await _eligible_analysis(analysis_id, profile)
    if settings.plaid_environment != "sandbox":
        raise HTTPException(status_code=404, detail="The sample bank is available only in Sandbox.")
    try:
        custom_user = json.loads(D4_PLAID_FIXTURE.read_text())
        public_token_result = await plaid_service.create_sandbox_public_token(custom_user)
        public_token = public_token_result.get("public_token")
        if not public_token:
            raise PlaidAPIError("INVALID_PLAID_RESPONSE")
        provider_result = await plaid_service.exchange_public_token(public_token)
    except (OSError, ValueError, PlaidAPIError, PlaidNotConfiguredError) as exc:
        raise _provider_error(exc) from None
    return await _save_connection(
        subject=profile.subject,
        provider_result=provider_result,
        institution_id="ins_109508",
        institution_name="First Platypus Bank",
        demo_fixture=True,
    )


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
            {"access_token": 1},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Bank connection data is temporarily unavailable.",
        ) from exc
    if not connection or not connection.get("access_token"):
        raise HTTPException(status_code=409, detail="Connect a bank account first.")

    try:
        result = await plaid_service.sync_transactions(connection["access_token"])
    except (PlaidAPIError, PlaidNotConfiguredError) as exc:
        raise _provider_error(exc) from None

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
            {"access_token": 1},
        )
        if connection and connection.get("access_token"):
            await plaid_service.remove_item(connection["access_token"])
        await collection.delete_one({"google_subject": profile.subject})
    except (PlaidAPIError, PlaidNotConfiguredError) as exc:
        raise _provider_error(exc) from None
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="The bank connection could not be removed.",
        ) from exc
