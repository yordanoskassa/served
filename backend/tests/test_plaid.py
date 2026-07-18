import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.auth import UserProfile
from app.services import plaid as plaid_service


PROFILE = UserProfile(
    subject="google-user-plaid",
    email="owner@example.com",
    name="Owner",
    given_name="Owner",
    picture=None,
)


def test_plaid_routes_require_google_authentication() -> None:
    client = TestClient(app)

    assert client.get("/api/plaid/status").status_code == 401
    assert client.post("/api/plaid/link-token").status_code == 401
    assert client.get("/api/plaid/transactions").status_code == 401


def test_link_token_uses_authenticated_subject_and_returns_only_temporary_token() -> None:
    create_link_token = AsyncMock(return_value={
        "link_token": "link-sandbox-temporary",
        "expiration": "2026-07-17T22:00:00Z",
    })
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.plaid_service.create_link_token", new=create_link_token),
    ):
        response = TestClient(app).post(
            "/api/plaid/link-token",
            headers={"Authorization": "Bearer google-token"},
        )

    assert response.status_code == 200
    assert response.json()["link_token"] == "link-sandbox-temporary"
    assert "access_token" not in response.json()
    create_link_token.assert_awaited_once_with(PROFILE.subject)


def test_exchange_keeps_access_token_server_side_and_owner_scoped() -> None:
    connections = SimpleNamespace(update_one=AsyncMock())
    database = SimpleNamespace(bank_connections=connections)
    exchange = AsyncMock(return_value={
        "access_token": "access-sandbox-private",
        "item_id": "item-sandbox-1",
    })
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.plaid_service.exchange_public_token", new=exchange),
        patch("app.routes.plaid.get_db", return_value=database),
    ):
        response = TestClient(app).post(
            "/api/plaid/exchange",
            headers={"Authorization": "Bearer google-token"},
            json={
                "public_token": "public-sandbox-once",
                "institution_id": "ins_109508",
                "institution_name": "First Platypus Bank",
            },
        )

    assert response.status_code == 200
    assert response.json()["connected"] is True
    assert response.json()["institution_name"] == "First Platypus Bank"
    assert "access_token" not in response.json()
    exchange.assert_awaited_once_with("public-sandbox-once")
    query, update = connections.update_one.await_args.args
    assert query == {"google_subject": PROFILE.subject}
    assert update["$set"]["access_token"] == "access-sandbox-private"
    assert update["$set"]["google_subject"] == PROFILE.subject
    assert connections.update_one.await_args.kwargs == {"upsert": True}


def test_transactions_are_read_on_demand_without_returning_bank_token() -> None:
    connections = SimpleNamespace(find_one=AsyncMock(return_value={
        "access_token": "access-sandbox-private",
    }))
    database = SimpleNamespace(bank_connections=connections)
    sync = AsyncMock(return_value={
        "transactions": [{
            "transaction_id": "transaction-1",
            "account_id": "account-1",
            "name": "Restaurant Depot",
            "merchant_name": "Restaurant Depot",
            "date": "2026-07-16",
            "amount": 245.12,
            "iso_currency_code": "USD",
            "pending": False,
            "personal_finance_category": {
                "primary": "FOOD_AND_DRINK",
                "detailed": "FOOD_AND_DRINK_GROCERIES",
            },
        }],
        "initial_update_complete": True,
        "historical_update_complete": True,
    })
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.plaid_service.sync_transactions", new=sync),
        patch("app.routes.plaid.get_db", return_value=database),
    ):
        response = TestClient(app).get(
            "/api/plaid/transactions",
            headers={"Authorization": "Bearer google-token"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["transactions"][0]["merchant_name"] == "Restaurant Depot"
    assert payload["transactions"][0]["category_primary"] == "FOOD_AND_DRINK"
    assert "access_token" not in response.text
    connections.find_one.assert_awaited_once_with(
        {"google_subject": PROFILE.subject},
        {"access_token": 1},
    )
    sync.assert_awaited_once_with("access-sandbox-private")


def test_transactions_fail_closed_without_a_connection() -> None:
    database = SimpleNamespace(
        bank_connections=SimpleNamespace(find_one=AsyncMock(return_value=None)),
    )
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.get_db", return_value=database),
    ):
        response = TestClient(app).get(
            "/api/plaid/transactions",
            headers={"Authorization": "Bearer google-token"},
        )

    assert response.status_code == 409
    assert response.json()["detail"] == "Connect a bank account first."


def test_official_link_token_payload_requests_transactions() -> None:
    post = AsyncMock(return_value={"link_token": "link", "expiration": "soon"})
    with patch("app.services.plaid._post", new=post):
        asyncio.run(plaid_service.create_link_token("google-user-plaid"))

    path, payload = post.await_args.args
    assert path == "/link/token/create"
    assert payload["products"] == ["transactions"]
    assert payload["transactions"] == {"days_requested": 180}
    assert payload["user"] == {"client_user_id": "google-user-plaid"}
    assert "secret" not in payload
