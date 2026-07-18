import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from fastapi.testclient import TestClient

from app.engine.models import Confidence, VerdictState
from app.main import app
from app.schemas.analysis import AnalysisResponse, LetterBreakdown
from app.schemas.auth import UserProfile
from app.schemas.plaid import PlaidTransaction
from app.services import plaid as plaid_service
from app.services.financial_matcher import extract_payment_request, match_payment_transactions


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
    assert client.post(
        f"/api/plaid/analyses/{analysis_id}/match",
        json={"cutoff_date": "2026-07-16"},
    ).status_code == 401
    assert client.post("/api/plaid/link-token").status_code == 404
    assert client.get("/api/plaid/transactions").status_code == 404


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
    database = SimpleNamespace(analyses=analyses, bank_connections=connections)
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
    assert "access_token" not in response.json()
    query, update = connections.update_one.await_args.args
    assert query == {"google_subject": PROFILE.subject}
    assert update["$set"]["access_token"] == "access-sandbox-private"
    assert connections.update_one.await_args.kwargs == {"upsert": True}


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
        "access_token": "access-sandbox-private",
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
    sync.assert_awaited_once_with("access-sandbox-private")


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
