from datetime import UTC, datetime

from fastapi import APIRouter, Header, HTTPException, status

from app.config import settings
from app.db import get_db
from app.routes.auth import _verify_google_token
from app.schemas.plaid import (
    PlaidConnectionStatus,
    PlaidExchangeRequest,
    PlaidLinkTokenResponse,
    PlaidTransaction,
    PlaidTransactionsResponse,
)
from app.services import plaid as plaid_service
from app.services.plaid import PlaidAPIError, PlaidNotConfiguredError


router = APIRouter(prefix="/plaid", tags=["plaid"])


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


@router.get("/status", response_model=PlaidConnectionStatus)
async def connection_status(
    authorization: str = Header(default=""),
) -> PlaidConnectionStatus:
    profile = _authenticate(authorization)
    configured = plaid_service.is_configured()
    if not configured:
        return PlaidConnectionStatus(
            configured=False,
            connected=False,
            environment=settings.plaid_environment,
        )
    try:
        connection = await get_db().bank_connections.find_one(
            {"google_subject": profile.subject},
            {"institution_name": 1, "connected_at": 1},
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
    )


@router.post("/link-token", response_model=PlaidLinkTokenResponse)
async def link_token(
    authorization: str = Header(default=""),
) -> PlaidLinkTokenResponse:
    profile = _authenticate(authorization)
    try:
        result = await plaid_service.create_link_token(profile.subject)
        return PlaidLinkTokenResponse.model_validate(result)
    except (PlaidAPIError, PlaidNotConfiguredError) as exc:
        raise _provider_error(exc) from None


@router.post("/exchange", response_model=PlaidConnectionStatus)
async def exchange_token(
    body: PlaidExchangeRequest,
    authorization: str = Header(default=""),
) -> PlaidConnectionStatus:
    profile = _authenticate(authorization)
    try:
        result = await plaid_service.exchange_public_token(body.public_token)
    except (PlaidAPIError, PlaidNotConfiguredError) as exc:
        raise _provider_error(exc) from None

    access_token = result.get("access_token")
    item_id = result.get("item_id")
    if not access_token or not item_id:
        raise HTTPException(status_code=502, detail="Plaid returned an incomplete connection.")

    connected_at = datetime.now(UTC)
    try:
        await get_db().bank_connections.update_one(
            {"google_subject": profile.subject},
            {"$set": {
                "google_subject": profile.subject,
                "access_token": access_token,
                "item_id": item_id,
                "institution_id": body.institution_id,
                "institution_name": body.institution_name,
                "environment": settings.plaid_environment,
                "connected_at": connected_at,
                "updated_at": connected_at,
            }},
            upsert=True,
        )
    except Exception as exc:
        # The access token is unusable by the client and is not returned.
        raise HTTPException(
            status_code=503,
            detail="The bank connected, but Served could not save the connection.",
        ) from exc

    return PlaidConnectionStatus(
        configured=True,
        connected=True,
        environment=settings.plaid_environment,
        institution_name=body.institution_name,
        connected_at=connected_at,
    )


@router.get("/transactions", response_model=PlaidTransactionsResponse)
async def transactions(
    authorization: str = Header(default=""),
) -> PlaidTransactionsResponse:
    profile = _authenticate(authorization)
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

    parsed: list[PlaidTransaction] = []
    for item in result["transactions"]:
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
        except (KeyError, TypeError, ValueError):
            continue
    parsed.sort(key=lambda item: (item.date, item.transaction_id), reverse=True)
    return PlaidTransactionsResponse(
        transactions=parsed[:250],
        total=len(parsed),
        initial_update_complete=result["initial_update_complete"],
        historical_update_complete=result["historical_update_complete"],
    )


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
