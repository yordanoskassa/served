import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from app.engine.models import Confidence, VerdictState
from app.main import app
from app.schemas.analysis import AnalysisResponse, LetterBreakdown
from app.schemas.auth import UserProfile
from app.schemas.plaid import PlaidTransaction
from app.services import plaid as plaid_service
from app.services.financial_matcher import extract_payment_request, match_payment_transactions
from app.services.plaid import PlaidAPIError


PROFILE = UserProfile(
    subject="google-user-plaid",
    email="owner@example.com",
    name="Owner",
    given_name="Owner",
    picture=None,
)
FIXTURE_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "financial"
PAYMENT_FIXTURE = FIXTURE_ROOT / "payment-records" / "plaid-sandbox-custom-user.json"
PAYMENT_GOLD = Path(__file__).resolve().parent / "fixtures" / "financial" / "payment-records-expected-output.json"


def _analysis(
    verdict: VerdictState = VerdictState.VERIFIED,
    *,
    supported_request: bool = True,
) -> AnalysisResponse:
    actions = [
        "All records of payments made to or for the benefit of Audrea Barnes from January 1, 2026 to the present, including payroll payments and bank records reflecting such payments."
    ] if supported_request else [
        "All payroll records, wage statements, and time records for Audrea Barnes from January 1, 2026 to the present."
    ]
    return AnalysisResponse(
        document_type="Subpoena to produce records",
        summary="A verified business-records request is displayed.",
        verdict=verdict,
        confidence=Confidence.HIGH,
        breakdown=LetterBreakdown(
            court="United States District Court, Central District of California",
            case_number="5:25-cv-02108-KK-SP",
            parties=["Audrea Barnes", "Maximus Consulting Services"],
            document_date="2026-07-16",
            requested_actions=actions,
        ),
        evidence=[],
        next_step="Review candidate records.",
    )


def _analysis_record(
    analysis_id: ObjectId,
    *,
    verdict: VerdictState = VerdictState.VERIFIED,
    supported_request: bool = True,
) -> dict:
    return {
        "_id": analysis_id,
        "google_subject": PROFILE.subject,
        "filename": "D4.pdf" if supported_request else "D1.pdf",
        "analysis": _analysis(verdict, supported_request=supported_request).model_dump(mode="json"),
    }


def _fixture_plaid_items() -> list[dict]:
    payload = json.loads(PAYMENT_FIXTURE.read_text())
    transactions = payload["override_accounts"][0]["transactions"]
    return [
        {
            "transaction_id": f"PAY-{index:03d}",
            "account_id": "fixture-business-checking",
            "name": item["description"],
            "merchant_name": None,
            "date": item["date_transacted"],
            "amount": item["amount"],
            "iso_currency_code": item["currency"],
            "pending": False,
            "personal_finance_category": None,
        }
        for index, item in enumerate(transactions, start=1)
    ]


def _transactions() -> list[PlaidTransaction]:
    return [PlaidTransaction(
        transaction_id=item["transaction_id"],
        account_id=item["account_id"],
        name=item["name"],
        date=item["date"],
        amount=item["amount"],
        currency=item["iso_currency_code"],
    ) for item in _fixture_plaid_items()]


def test_financial_routes_require_google_authentication() -> None:
    client = TestClient(app)
    analysis_id = ObjectId()

    assert client.get(f"/api/plaid/analyses/{analysis_id}/status").status_code == 401
    assert client.post(f"/api/plaid/analyses/{analysis_id}/link-token").status_code == 401
    assert client.post(f"/api/plaid/analyses/{analysis_id}/sandbox-connect").status_code == 401
    assert client.post("/api/plaid/connection/sandbox-connect").status_code == 401
    assert client.post(
        f"/api/plaid/analyses/{analysis_id}/match",
        json={"cutoff_date": "2026-07-16"},
    ).status_code == 401
    assert client.post("/api/plaid/connection/link-token").status_code == 401
    assert client.post("/api/plaid/connection/exchange", json={"public_token": "x"}).status_code == 401
    assert client.get("/api/plaid/connection/transaction-debug").status_code == 401
    assert client.put(
        "/api/plaid/connection/transaction-debug",
        json={"enabled": True},
    ).status_code == 401
    assert client.post("/api/plaid/connection/transactions/sync").status_code == 401
    assert client.post("/api/plaid/link-token").status_code == 404
    assert client.get("/api/plaid/transactions").status_code == 404


def test_settings_link_token_does_not_require_analysis() -> None:
    create_link_token = AsyncMock(return_value={
        "link_token": "link-settings",
        "expiration": "2026-07-18T22:00:00Z",
    })
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.plaid_service.create_link_token", new=create_link_token),
    ):
        response = TestClient(app).post(
            "/api/plaid/connection/link-token",
            headers={"Authorization": "Bearer google-token"},
        )

    assert response.status_code == 200
    assert response.json()["link_token"] == "link-settings"
    create_link_token.assert_awaited_once_with(PROFILE.subject)


def test_settings_exchange_does_not_require_analysis() -> None:
    connections = SimpleNamespace(update_one=AsyncMock())
    database = SimpleNamespace(
        bank_connections=connections,
        bank_transaction_snapshots=SimpleNamespace(delete_one=AsyncMock()),
    )
    exchange = AsyncMock(return_value={
        "access_token": "access-user",
        "item_id": "item-user",
    })
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.plaid_service.exchange_public_token", new=exchange),
        patch("app.routes.plaid.get_db", return_value=database),
    ):
        response = TestClient(app).post(
            "/api/plaid/connection/exchange",
            headers={"Authorization": "Bearer google-token"},
            json={
                "public_token": "public-once",
                "institution_id": "ins_oauth",
                "institution_name": "OAuth Test Bank",
            },
        )

    assert response.status_code == 200
    assert response.json()["connected"] is True
    assert response.json()["demo_fixture"] is False
    exchange.assert_awaited_once_with("public-once")


def test_link_token_is_analysis_scoped_and_returns_only_temporary_token() -> None:
    analysis_id = ObjectId()
    analyses = SimpleNamespace(find_one=AsyncMock(return_value=_analysis_record(analysis_id)))
    create_link_token = AsyncMock(return_value={
        "link_token": "link-sandbox-temporary",
        "expiration": "2026-07-18T22:00:00Z",
    })
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.get_db", return_value=SimpleNamespace(analyses=analyses)),
        patch("app.routes.plaid.plaid_service.create_link_token", new=create_link_token),
    ):
        response = TestClient(app).post(
            f"/api/plaid/analyses/{analysis_id}/link-token",
            headers={"Authorization": "Bearer google-token"},
        )

    assert response.status_code == 200
    assert response.json()["link_token"] == "link-sandbox-temporary"
    assert "access_token" not in response.json()
    analyses.find_one.assert_awaited_once_with({
        "_id": analysis_id,
        "google_subject": PROFILE.subject,
    })
    create_link_token.assert_awaited_once_with(PROFILE.subject)


def test_wrong_owner_and_unverified_or_unrelated_requests_fail_closed() -> None:
    client = TestClient(app)
    analysis_id = ObjectId()
    create_link_token = AsyncMock()

    cases = [
        (None, 404),
        (_analysis_record(analysis_id, verdict=VerdictState.CANNOT_CONFIRM), 409),
        (_analysis_record(analysis_id, verdict=VerdictState.SCAM), 409),
        (_analysis_record(analysis_id, supported_request=False), 409),
    ]
    for record, expected_status in cases:
        analyses = SimpleNamespace(find_one=AsyncMock(return_value=record))
        with (
            patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
            patch("app.routes.plaid.get_db", return_value=SimpleNamespace(analyses=analyses)),
            patch("app.routes.plaid.plaid_service.create_link_token", new=create_link_token),
        ):
            response = client.post(
                f"/api/plaid/analyses/{analysis_id}/link-token",
                headers={"Authorization": "Bearer google-token"},
            )
        assert response.status_code == expected_status

    create_link_token.assert_not_awaited()


def test_exchange_keeps_access_token_server_side_after_rechecking_gate() -> None:
    analysis_id = ObjectId()
    analyses = SimpleNamespace(find_one=AsyncMock(return_value=_analysis_record(analysis_id)))
    connections = SimpleNamespace(update_one=AsyncMock())
    database = SimpleNamespace(
        analyses=analyses,
        bank_connections=connections,
        bank_transaction_snapshots=SimpleNamespace(delete_one=AsyncMock()),
    )
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
            f"/api/plaid/analyses/{analysis_id}/exchange",
            headers={"Authorization": "Bearer google-token"},
            json={
                "public_token": "public-sandbox-once",
                "institution_id": "ins_109508",
                "institution_name": "First Platypus Bank",
            },
        )

    assert response.status_code == 200
    assert response.json()["connected"] is True
    assert response.json()["demo_fixture"] is False
    assert "access_token" not in response.json()
    query, update = connections.update_one.await_args.args
    assert query == {"google_subject": PROFILE.subject}
    assert update["$set"]["access_token"] == "access-sandbox-private"
    assert connections.update_one.await_args.kwargs == {"upsert": True}


def test_d4_sandbox_connect_uses_seeded_audrea_transactions() -> None:
    analysis_id = ObjectId()
    analyses = SimpleNamespace(find_one=AsyncMock(return_value=_analysis_record(analysis_id)))
    connections = SimpleNamespace(update_one=AsyncMock())
    database = SimpleNamespace(
        analyses=analyses,
        bank_connections=connections,
        bank_transaction_snapshots=SimpleNamespace(delete_one=AsyncMock()),
    )
    create_public_token = AsyncMock(return_value={"public_token": "public-d4-seeded"})
    exchange = AsyncMock(return_value={
        "access_token": "access-d4-seeded",
        "item_id": "item-d4-seeded",
    })
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.get_db", return_value=database),
        patch("app.routes.plaid.plaid_service.create_sandbox_public_token", new=create_public_token),
        patch("app.routes.plaid.plaid_service.exchange_sandbox_public_token", new=exchange),
        patch.object(plaid_service.settings, "plaid_environment", "sandbox"),
    ):
        response = TestClient(app).post(
            f"/api/plaid/analyses/{analysis_id}/sandbox-connect",
            headers={"Authorization": "Bearer google-token"},
        )

    assert response.status_code == 200
    assert response.json()["institution_name"] == "First Platypus Bank"
    assert response.json()["demo_fixture"] is True
    custom_user = create_public_token.await_args.args[0]
    descriptions = [
        item["description"]
        for item in custom_user["override_accounts"][0]["transactions"]
    ]
    exact_audrea = [
        item
        for item in custom_user["override_accounts"][0]["transactions"]
        if item["description"] == "PAYROLL ACH - AUDREA BARNES"
    ]
    assert len(exact_audrea) == 9
    assert len([item for item in exact_audrea if item["date_transacted"] >= "2026-01-01"]) == 7
    assert "CHECK #1042" in descriptions
    assert "ACH - A. BARNS" in descriptions
    exchange.assert_awaited_once_with("public-d4-seeded")
    _, update = connections.update_one.await_args.args
    assert update["$set"]["demo_fixture"] is True
    assert update["$set"]["access_token"] == "access-d4-seeded"


def test_settings_sandbox_connect_does_not_require_analysis() -> None:
    connections = SimpleNamespace(update_one=AsyncMock())
    database = SimpleNamespace(
        bank_connections=connections,
        bank_transaction_snapshots=SimpleNamespace(delete_one=AsyncMock()),
    )
    create_public_token = AsyncMock(return_value={"public_token": "public-settings"})
    exchange = AsyncMock(return_value={
        "access_token": "access-settings",
        "item_id": "item-settings",
    })
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.get_db", return_value=database),
        patch("app.routes.plaid.plaid_service.create_sandbox_public_token", new=create_public_token),
        patch("app.routes.plaid.plaid_service.exchange_sandbox_public_token", new=exchange),
        patch.object(plaid_service.settings, "plaid_environment", "sandbox"),
    ):
        response = TestClient(app).post(
            "/api/plaid/connection/sandbox-connect",
            headers={"Authorization": "Bearer google-token"},
        )

    assert response.status_code == 200
    assert response.json()["demo_fixture"] is True
    create_public_token.assert_awaited_once()
    exchange.assert_awaited_once()


def test_d4_sandbox_connect_works_when_plaid_environment_is_development() -> None:
    analysis_id = ObjectId()
    analyses = SimpleNamespace(find_one=AsyncMock(return_value=_analysis_record(analysis_id)))
    connections = SimpleNamespace(update_one=AsyncMock())
    database = SimpleNamespace(
        analyses=analyses,
        bank_connections=connections,
        bank_transaction_snapshots=SimpleNamespace(delete_one=AsyncMock()),
    )
    create_public_token = AsyncMock(return_value={"public_token": "public-d4-seeded"})
    exchange = AsyncMock(return_value={
        "access_token": "access-d4-seeded",
        "item_id": "item-d4-seeded",
    })
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.get_db", return_value=database),
        patch("app.routes.plaid.plaid_service.create_sandbox_public_token", new=create_public_token),
        patch("app.routes.plaid.plaid_service.exchange_sandbox_public_token", new=exchange),
        patch.object(plaid_service.settings, "plaid_environment", "development"),
    ):
        response = TestClient(app).post(
            f"/api/plaid/analyses/{analysis_id}/sandbox-connect",
            headers={"Authorization": "Bearer google-token"},
        )

    assert response.status_code == 200
    assert response.json()["demo_fixture"] is True


def test_guest_d4_uses_seeded_fixture_without_plaid_credentials() -> None:
    analysis_id = ObjectId()
    demo_profile = UserProfile(
        subject="demo:judge-session",
        email="demo@served.local",
        name="Served Demo",
        given_name="Demo",
    )
    analyses = SimpleNamespace(find_one=AsyncMock(return_value=_analysis_record(analysis_id)))
    connections = SimpleNamespace(
        update_one=AsyncMock(),
        find_one=AsyncMock(return_value={
            "access_token": "served-demo-fixture:demo:judge-session",
            "demo_fixture": True,
        }),
    )
    database = SimpleNamespace(
        analyses=analyses,
        bank_connections=connections,
        bank_transaction_snapshots=SimpleNamespace(delete_one=AsyncMock()),
    )
    create_public_token = AsyncMock()
    sync = AsyncMock()

    with (
        patch("app.routes.plaid._verify_google_token", return_value=demo_profile),
        patch("app.routes.plaid.get_db", return_value=database),
        patch("app.routes.plaid.plaid_service.create_sandbox_public_token", new=create_public_token),
        patch("app.routes.plaid.plaid_service.sync_transactions", new=sync),
        patch.object(plaid_service.settings, "plaid_environment", "sandbox"),
    ):
        connected = TestClient(app).post(
            f"/api/plaid/analyses/{analysis_id}/sandbox-connect",
            headers={"Authorization": "Bearer demo-token"},
        )
        matched = TestClient(app).post(
            f"/api/plaid/analyses/{analysis_id}/match",
            headers={"Authorization": "Bearer demo-token"},
            json={"cutoff_date": "2026-07-16"},
        )

    assert connected.status_code == 200
    assert connected.json()["institution_name"] == "Mendoza’s Kitchen Sandbox"
    assert connected.json()["demo_fixture"] is True
    assert matched.status_code == 200
    assert matched.json()["summary"] == {
        "total_searched": 28,
        "include": 7,
        "review": 2,
        "exclude": 19,
        "excluded_by_reason": {"NOT_TARGET_PAYEE": 17, "OUTSIDE_DATE_RANGE": 2},
    }
    create_public_token.assert_not_awaited()
    sync.assert_not_awaited()


def test_enabling_transaction_debug_saves_reviewed_sample_snapshot() -> None:
    connections = SimpleNamespace(
        find_one=AsyncMock(return_value={
            "access_token": "access-sandbox-private",
            "item_id": "item-sandbox-private",
            "environment": "sandbox",
            "demo_fixture": True,
            "transaction_debug_enabled": False,
        }),
        update_one=AsyncMock(),
    )
    snapshots = SimpleNamespace(update_one=AsyncMock())
    database = SimpleNamespace(
        bank_connections=connections,
        bank_transaction_snapshots=snapshots,
    )
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.get_db", return_value=database),
    ):
        response = TestClient(app).put(
            "/api/plaid/connection/transaction-debug",
            headers={"Authorization": "Bearer google-token"},
            json={"enabled": True},
        )

    assert response.status_code == 200
    assert response.json()["enabled"] is True
    assert response.json()["available"] is True
    assert response.json()["source"] == "reviewed_sample"
    assert response.json()["total"] == 28
    assert len(response.json()["transactions"]) == 28
    assert connections.update_one.await_args.args[1]["$set"]["transaction_debug_enabled"] is True
    saved = snapshots.update_one.await_args.args[1]["$set"]
    assert saved["google_subject"] == PROFILE.subject
    assert saved["item_id"] == "item-sandbox-private"
    assert saved["transaction_count"] == 28


def test_disabling_transaction_debug_deletes_saved_snapshot() -> None:
    connections = SimpleNamespace(
        find_one=AsyncMock(return_value={
            "access_token": "access-production-private",
            "item_id": "item-production-private",
            "environment": "production",
            "demo_fixture": False,
            "transaction_debug_enabled": True,
        }),
        update_one=AsyncMock(),
    )
    snapshots = SimpleNamespace(delete_one=AsyncMock())
    database = SimpleNamespace(
        bank_connections=connections,
        bank_transaction_snapshots=snapshots,
    )
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.get_db", return_value=database),
    ):
        response = TestClient(app).put(
            "/api/plaid/connection/transaction-debug",
            headers={"Authorization": "Bearer google-token"},
            json={"enabled": False},
        )

    assert response.status_code == 200
    assert response.json() == {
        "enabled": False,
        "available": False,
        "source": None,
        "synced_at": None,
        "total": 0,
        "initial_update_complete": False,
        "historical_update_complete": False,
        "transactions": [],
    }
    snapshots.delete_one.assert_awaited_once_with({"google_subject": PROFILE.subject})


def test_settings_transaction_sync_saves_normalized_plaid_snapshot() -> None:
    connections = SimpleNamespace(find_one=AsyncMock(return_value={
        "access_token": "access-production-private",
        "item_id": "item-production-private",
        "environment": "production",
        "demo_fixture": False,
        "transaction_debug_enabled": True,
    }))
    snapshots = SimpleNamespace(update_one=AsyncMock())
    database = SimpleNamespace(
        bank_connections=connections,
        bank_transaction_snapshots=snapshots,
    )
    sync = AsyncMock(return_value={
        "transactions": _fixture_plaid_items(),
        "initial_update_complete": True,
        "historical_update_complete": True,
    })
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.plaid_service.sync_transactions", new=sync),
        patch("app.routes.plaid.get_db", return_value=database),
    ):
        response = TestClient(app).post(
            "/api/plaid/connection/transactions/sync",
            headers={"Authorization": "Bearer google-token"},
        )

    assert response.status_code == 200
    assert response.json()["source"] == "plaid"
    assert response.json()["total"] == 28
    assert response.json()["historical_update_complete"] is True
    sync.assert_awaited_once_with(
        "access-production-private",
        plaid_environment="production",
        readiness_max_polls=1,
    )
    saved = snapshots.update_one.await_args.args[1]["$set"]
    assert saved["item_id"] == "item-production-private"
    assert len(saved["transactions"]) == 28
    assert saved["transactions"][0]["currency"] == "USD"


def test_case_match_reuses_owner_scoped_mongo_snapshot_without_plaid() -> None:
    analysis_id = ObjectId()
    synced_at = datetime(2026, 7, 21, 16, 30, tzinfo=UTC)
    cached_transactions = [item.model_dump(mode="json") for item in _transactions()]
    database = SimpleNamespace(
        analyses=SimpleNamespace(find_one=AsyncMock(return_value=_analysis_record(analysis_id))),
        bank_connections=SimpleNamespace(find_one=AsyncMock(return_value={
            "access_token": "access-production-private",
            "item_id": "item-production-private",
            "environment": "production",
            "demo_fixture": False,
            "transaction_debug_enabled": True,
        })),
        bank_transaction_snapshots=SimpleNamespace(find_one=AsyncMock(return_value={
            "google_subject": PROFILE.subject,
            "item_id": "item-production-private",
            "source": "plaid",
            "synced_at": synced_at,
            "initial_update_complete": True,
            "historical_update_complete": True,
            "transactions": cached_transactions,
        })),
    )
    sync = AsyncMock(side_effect=AssertionError("cached case matching must not call Plaid"))
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.plaid_service.sync_transactions", new=sync),
        patch("app.routes.plaid.get_db", return_value=database),
        patch.object(plaid_service.settings, "plaid_environment", "production"),
    ):
        response = TestClient(app).post(
            f"/api/plaid/analyses/{analysis_id}/match",
            headers={"Authorization": "Bearer google-token"},
            json={"cutoff_date": "2026-07-16"},
        )

    assert response.status_code == 200
    assert response.json()["transaction_source"] == "mongo_cache"
    assert response.json()["transactions_synced_at"] == "2026-07-21T16:30:00Z"
    assert response.json()["summary"] == {
        "total_searched": 28,
        "include": 7,
        "review": 2,
        "exclude": 19,
        "excluded_by_reason": {"NOT_TARGET_PAYEE": 17, "OUTSIDE_DATE_RANGE": 2},
    }
    sync.assert_not_awaited()


def test_payment_matcher_reconciles_every_gold_record_to_7_2_19() -> None:
    gold = json.loads(PAYMENT_GOLD.read_text())
    target_payee, start_date = extract_payment_request(_analysis())
    result = match_payment_transactions(
        _transactions(),
        analysis_id="analysis-d4",
        source_document="D4.pdf",
        target_payee=target_payee,
        start_date=start_date,
        cutoff_date=datetime(2026, 7, 16).date(),
    )

    assert result.summary.model_dump() == {
        "total_searched": 28,
        "include": 7,
        "review": 2,
        "exclude": 19,
        "excluded_by_reason": {"NOT_TARGET_PAYEE": 17, "OUTSIDE_DATE_RANGE": 2},
    }
    actual = {
        item.record_id: (item.disposition, item.reason_code)
        for item in [*result.include, *result.review, *result.excluded_audit]
    }
    expected = {
        record_id: (item["disposition"], item["reason_code"])
        for record_id, item in gold["expected_by_record_id"].items()
    }
    assert actual == expected
    assert len(actual) == gold["expected_totals"]["TOTAL"]


def test_match_route_returns_review_manifest_without_excluded_details() -> None:
    analysis_id = ObjectId()
    analyses = SimpleNamespace(find_one=AsyncMock(return_value=_analysis_record(analysis_id)))
    connections = SimpleNamespace(find_one=AsyncMock(return_value={
        "access_token": "access-production-private",
        "environment": "production",
        "demo_fixture": False,
    }))
    database = SimpleNamespace(analyses=analyses, bank_connections=connections)
    sync = AsyncMock(return_value={
        "transactions": _fixture_plaid_items(),
        "initial_update_complete": True,
        "historical_update_complete": True,
    })
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.plaid_service.sync_transactions", new=sync),
        patch("app.routes.plaid.get_db", return_value=database),
        patch.object(plaid_service.settings, "plaid_environment", "production"),
    ):
        response = TestClient(app).post(
            f"/api/plaid/analyses/{analysis_id}/match",
            headers={"Authorization": "Bearer google-token"},
            json={"cutoff_date": "2026-07-16"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"] == {
        "total_searched": 28,
        "include": 7,
        "review": 2,
        "exclude": 19,
        "excluded_by_reason": {"NOT_TARGET_PAYEE": 17, "OUTSIDE_DATE_RANGE": 2},
    }
    assert len(payload["include"]) == 7
    assert len(payload["review"]) == 2
    assert len(payload["excluded_audit"]) == 19
    assert "description" not in payload["excluded_audit"][0]
    assert "SUNRISE PRODUCE CO" not in response.text
    assert payload["automatic_send"] is False
    sync.assert_awaited_once_with(
        "access-production-private",
        plaid_environment="production",
        readiness_max_polls=1,
    )


def test_signed_in_d4_uses_reviewed_snapshot_without_waiting_for_plaid() -> None:
    analysis_id = ObjectId()
    analyses = SimpleNamespace(find_one=AsyncMock(return_value=_analysis_record(analysis_id)))
    connections = SimpleNamespace(find_one=AsyncMock(return_value={
        "access_token": "access-sandbox-private",
        "demo_fixture": True,
    }))
    database = SimpleNamespace(analyses=analyses, bank_connections=connections)
    sync = AsyncMock(side_effect=AssertionError("sample matching must not poll Plaid"))
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.plaid_service.sync_transactions", new=sync),
        patch("app.routes.plaid.get_db", return_value=database),
        patch.object(plaid_service.settings, "plaid_environment", "sandbox"),
    ):
        response = TestClient(app).post(
            f"/api/plaid/analyses/{analysis_id}/match",
            headers={"Authorization": "Bearer google-token"},
            json={"cutoff_date": "2026-07-16"},
        )

    assert response.status_code == 200
    assert response.json()["summary"] == {
        "total_searched": 28,
        "include": 7,
        "review": 2,
        "exclude": 19,
        "excluded_by_reason": {"NOT_TARGET_PAYEE": 17, "OUTSIDE_DATE_RANGE": 2},
    }
    sync.assert_not_awaited()


def test_real_match_returns_retryable_response_when_history_is_not_ready() -> None:
    analysis_id = ObjectId()
    database = SimpleNamespace(
        analyses=SimpleNamespace(find_one=AsyncMock(return_value=_analysis_record(analysis_id))),
        bank_connections=SimpleNamespace(find_one=AsyncMock(return_value={
            "access_token": "access-production-private",
            "environment": "production",
            "demo_fixture": False,
        })),
    )
    sync = AsyncMock(side_effect=PlaidAPIError("TRANSACTIONS_NOT_READY"))
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.plaid_service.sync_transactions", new=sync),
        patch("app.routes.plaid.get_db", return_value=database),
        patch.object(plaid_service.settings, "plaid_environment", "production"),
    ):
        response = TestClient(app).post(
            f"/api/plaid/analyses/{analysis_id}/match",
            headers={"Authorization": "Bearer google-token"},
            json={"cutoff_date": "2026-07-16"},
        )

    assert response.status_code == 409
    assert response.headers["retry-after"] == "3"
    assert response.json()["detail"] == (
        "Plaid is still preparing the transaction history. Try again in a moment."
    )
    sync.assert_awaited_once_with(
        "access-production-private",
        plaid_environment="production",
        readiness_max_polls=1,
    )


def test_real_match_has_a_hard_provider_timeout() -> None:
    analysis_id = ObjectId()
    database = SimpleNamespace(
        analyses=SimpleNamespace(find_one=AsyncMock(return_value=_analysis_record(analysis_id))),
        bank_connections=SimpleNamespace(find_one=AsyncMock(return_value={
            "access_token": "access-production-private",
            "environment": "production",
            "demo_fixture": False,
        })),
    )

    async def stalled_sync(*_args, **_kwargs):
        await asyncio.Event().wait()

    sync = AsyncMock(side_effect=stalled_sync)
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.plaid_service.sync_transactions", new=sync),
        patch("app.routes.plaid.get_db", return_value=database),
        patch("app.routes.plaid.MATCH_SYNC_TIMEOUT_SECONDS", 0.01),
        patch.object(plaid_service.settings, "plaid_environment", "production"),
    ):
        response = TestClient(app).post(
            f"/api/plaid/analyses/{analysis_id}/match",
            headers={"Authorization": "Bearer google-token"},
            json={"cutoff_date": "2026-07-16"},
        )

    assert response.status_code == 409
    assert response.headers["retry-after"] == "3"
    assert "still preparing" in response.json()["detail"]
    sync.assert_awaited_once()


def test_match_fails_closed_without_a_connection() -> None:
    analysis_id = ObjectId()
    database = SimpleNamespace(
        analyses=SimpleNamespace(find_one=AsyncMock(return_value=_analysis_record(analysis_id))),
        bank_connections=SimpleNamespace(find_one=AsyncMock(return_value=None)),
    )
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.get_db", return_value=database),
    ):
        response = TestClient(app).post(
            f"/api/plaid/analyses/{analysis_id}/match",
            headers={"Authorization": "Bearer google-token"},
            json={"cutoff_date": "2026-07-16"},
        )

    assert response.status_code == 409
    assert response.json()["detail"] == "Connect a bank account first."


def test_match_d4_sandbox_requires_demo_fixture_connection() -> None:
    analysis_id = ObjectId()
    database = SimpleNamespace(
        analyses=SimpleNamespace(find_one=AsyncMock(return_value=_analysis_record(analysis_id))),
        bank_connections=SimpleNamespace(find_one=AsyncMock(return_value={
            "access_token": "access-generic-boa",
            "demo_fixture": False,
        })),
    )
    with (
        patch("app.routes.plaid._verify_google_token", return_value=PROFILE),
        patch("app.routes.plaid.get_db", return_value=database),
        patch.object(plaid_service.settings, "plaid_environment", "sandbox"),
    ):
        response = TestClient(app).post(
            f"/api/plaid/analyses/{analysis_id}/match",
            headers={"Authorization": "Bearer google-token"},
            json={"cutoff_date": "2026-07-16"},
        )

    assert response.status_code == 409
    assert "sample account" in response.json()["detail"].lower()


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


def test_sandbox_link_token_retries_without_unregistered_redirect() -> None:
    post = AsyncMock(side_effect=[
        PlaidAPIError(
            "INVALID_FIELD",
            plaid_message="OAuth redirect URI must be configured in the developer dashboard.",
        ),
        {"link_token": "link-without-oauth", "expiration": "soon"},
    ])
    with (
        patch("app.services.plaid._post", new=post),
        patch.object(plaid_service.settings, "plaid_environment", "sandbox"),
        patch.object(
            plaid_service.settings,
            "plaid_redirect_uri",
            "https://servedai.netlify.app/",
        ),
    ):
        result = asyncio.run(plaid_service.create_link_token("google-user-plaid"))

    assert result["link_token"] == "link-without-oauth"
    assert post.await_count == 2
    first_payload = post.await_args_list[0].args[1]
    second_payload = post.await_args_list[1].args[1]
    assert first_payload["redirect_uri"] == "https://servedai.netlify.app/"
    assert "redirect_uri" not in second_payload


@pytest.mark.parametrize(
    ("environment", "message"),
    [
        ("sandbox", "The transactions field is invalid."),
        ("production", "OAuth redirect URI must be configured in the developer dashboard."),
    ],
)
def test_link_token_does_not_retry_unrelated_or_production_invalid_fields(
    environment: str,
    message: str,
) -> None:
    post = AsyncMock(side_effect=PlaidAPIError(
        "INVALID_FIELD",
        plaid_message=message,
    ))
    with (
        patch("app.services.plaid._post", new=post),
        patch.object(plaid_service.settings, "plaid_environment", environment),
        patch.object(
            plaid_service.settings,
            "plaid_redirect_uri",
            "https://servedai.netlify.app/",
        ),
    ):
        with pytest.raises(PlaidAPIError) as caught:
            asyncio.run(plaid_service.create_link_token("google-user-plaid"))

    assert caught.value.code == "INVALID_FIELD"
    assert post.await_count == 1


def test_sandbox_public_token_payload_uses_custom_d4_user() -> None:
    custom_user = json.loads(PAYMENT_FIXTURE.read_text())
    post = AsyncMock(return_value={"public_token": "public-d4"})
    with patch("app.services.plaid._post", new=post):
        asyncio.run(plaid_service.create_sandbox_public_token(custom_user))

    path, payload = post.await_args.args
    assert post.await_args.kwargs["plaid_environment"] == "sandbox"
    assert path == "/sandbox/public_token/create"
    assert payload["institution_id"] == "ins_109508"
    assert payload["initial_products"] == ["transactions"]
    assert payload["options"]["override_username"] == "user_custom"
    assert json.loads(payload["options"]["override_password"]) == custom_user
    assert payload["options"]["transactions"] == {
        "start_date": "2025-11-01",
        "end_date": "2026-07-19",
    }


def test_transaction_sync_waits_for_historical_update() -> None:
    first_page = {
        "added": [],
        "modified": [],
        "removed": [],
        "next_cursor": "cursor-not-ready",
        "has_more": False,
        "transactions_update_status": "NOT_READY",
    }
    ready_page = {
        "added": [{"transaction_id": "tx-ready", "name": "PAYROLL ACH - AUDREA BARNES"}],
        "modified": [],
        "removed": [],
        "next_cursor": "cursor-ready",
        "has_more": False,
        "transactions_update_status": "HISTORICAL_UPDATE_COMPLETE",
    }
    post = AsyncMock(side_effect=[first_page, ready_page])
    sleep = AsyncMock()
    with (
        patch("app.services.plaid._post", new=post),
        patch("app.services.plaid.asyncio.sleep", new=sleep),
    ):
        result = asyncio.run(
            plaid_service.sync_transactions("access-ready", plaid_environment="sandbox")
        )

    assert result["transactions"] == ready_page["added"]
    assert result["initial_update_complete"] is True
    assert result["historical_update_complete"] is True
    assert post.await_args_list[1].args[1]["cursor"] == "cursor-not-ready"
    sleep.assert_awaited_once_with(plaid_service.TRANSACTIONS_READY_DELAY_SECONDS)


def test_transaction_sync_fails_closed_when_history_stays_pending() -> None:
    pending_page = {
        "added": [],
        "modified": [],
        "removed": [],
        "next_cursor": "cursor-pending",
        "has_more": False,
        "transactions_update_status": "NOT_READY",
    }
    post = AsyncMock(return_value=pending_page)
    sleep = AsyncMock()
    with (
        patch("app.services.plaid._post", new=post),
        patch("app.services.plaid.asyncio.sleep", new=sleep),
        patch.object(plaid_service, "TRANSACTIONS_READY_MAX_POLLS", 2),
    ):
        with pytest.raises(PlaidAPIError, match="Plaid could not complete the request") as exc:
            asyncio.run(
                plaid_service.sync_transactions("access-pending", plaid_environment="sandbox")
            )

    assert exc.value.code == "TRANSACTIONS_NOT_READY"
    assert post.await_count == 2
    sleep.assert_awaited_once_with(plaid_service.TRANSACTIONS_READY_DELAY_SECONDS)


def test_transaction_sync_can_check_readiness_without_sleeping() -> None:
    pending_page = {
        "added": [],
        "modified": [],
        "removed": [],
        "next_cursor": "cursor-pending",
        "has_more": False,
        "transactions_update_status": "NOT_READY",
    }
    post = AsyncMock(return_value=pending_page)
    sleep = AsyncMock()
    with (
        patch("app.services.plaid._post", new=post),
        patch("app.services.plaid.asyncio.sleep", new=sleep),
    ):
        with pytest.raises(PlaidAPIError) as exc:
            asyncio.run(
                plaid_service.sync_transactions(
                    "access-pending",
                    plaid_environment="production",
                    readiness_max_polls=1,
                )
            )

    assert exc.value.code == "TRANSACTIONS_NOT_READY"
    post.assert_awaited_once()
    sleep.assert_not_awaited()
