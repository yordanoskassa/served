from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from fastapi.testclient import TestClient

from app.engine.models import Confidence, VerdictState
from app.main import app
from app.schemas.analysis import AnalysisResponse, LetterBreakdown
from app.schemas.auth import UserProfile
from app.services.payroll_matcher import extract_payroll_criteria, match_payroll_csv


PROFILE = UserProfile(
    subject="restaurant-owner-1",
    email="owner@johnskitchen.example",
    name="John Doe",
    given_name="John",
    picture=None,
)
SAMPLE = Path(__file__).resolve().parents[1] / "fixtures" / "payroll" / "johns-kitchen-payroll.csv"


def _analysis(verdict: VerdictState = VerdictState.VERIFIED) -> AnalysisResponse:
    return AnalysisResponse(
        document_type="Subpoena for production of business records",
        summary="The request asks for payroll, wage, and time records for a former employee.",
        verdict=verdict,
        confidence=Confidence.HIGH,
        breakdown=LetterBreakdown(
            court="United States District Court, Central District of California",
            case_number="5:25-cv-02108-KK-SP",
            parties=["Audrea Barnes", "John Doe's Kitchen, LLC"],
            requested_actions=[
                "All payroll records, wage statements, and time records for Audrea Barnes, from January 1, 2026 to the present."
            ],
        ),
        evidence=[],
        next_step="Review candidate payroll records.",
    )


def test_sample_payroll_match_returns_three_candidates_and_protects_fourteen_records() -> None:
    result = match_payroll_csv(SAMPLE.read_bytes(), extract_payroll_criteria(_analysis()))

    assert result.summary.strong == 3
    assert result.summary.possible == 0
    assert result.summary.outside_criteria == 14
    assert result.summary.missing_record_types == []
    assert {item.record_type for item in result.strong_matches} == {
        "payroll_record",
        "wage_statement",
        "time_record",
    }
    assert {item.employee_name for item in result.strong_matches} == {"Audrea Barnes"}
    assert "Miguel Rivera" not in result.model_dump_json()
    assert "14 records stayed outside" in result.privacy_note
    assert result.human_review_required is True


def test_payroll_match_route_requires_authentication() -> None:
    response = TestClient(app).post(
        f"/api/payroll/analyses/{ObjectId()}/match",
        files={"file": ("payroll.csv", SAMPLE.read_bytes(), "text/csv")},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token."


def test_payroll_match_route_locks_records_for_unverified_request() -> None:
    analysis_id = ObjectId()
    analyses = SimpleNamespace(find_one=AsyncMock(return_value={
        "_id": analysis_id,
        "google_subject": PROFILE.subject,
        "analysis": _analysis(VerdictState.CANNOT_CONFIRM).model_dump(mode="json"),
    }))
    with (
        patch("app.routes.payroll._verify_google_token", return_value=PROFILE),
        patch("app.routes.payroll.get_db", return_value=SimpleNamespace(analyses=analyses)),
    ):
        response = TestClient(app).post(
            f"/api/payroll/analyses/{analysis_id}/match",
            headers={"Authorization": "Bearer test-token"},
            files={"file": ("payroll.csv", SAMPLE.read_bytes(), "text/csv")},
        )

    assert response.status_code == 409
    assert response.json()["detail"] == "Records stay locked until the request is independently verified."


def test_payroll_match_route_is_owner_scoped() -> None:
    analysis_id = ObjectId()
    analyses = SimpleNamespace(find_one=AsyncMock(return_value=None))
    with (
        patch("app.routes.payroll._verify_google_token", return_value=PROFILE),
        patch("app.routes.payroll.get_db", return_value=SimpleNamespace(analyses=analyses)),
    ):
        response = TestClient(app).post(
            f"/api/payroll/analyses/{analysis_id}/match",
            headers={"Authorization": "Bearer test-token"},
            files={"file": ("payroll.csv", SAMPLE.read_bytes(), "text/csv")},
        )

    assert response.status_code == 404
    analyses.find_one.assert_awaited_once_with({
        "_id": analysis_id,
        "google_subject": PROFILE.subject,
    })


def test_payroll_match_route_does_not_persist_uploaded_csv() -> None:
    analysis_id = ObjectId()
    analyses = SimpleNamespace(find_one=AsyncMock(return_value={
        "_id": analysis_id,
        "google_subject": PROFILE.subject,
        "analysis": _analysis().model_dump(mode="json"),
    }))
    with (
        patch("app.routes.payroll._verify_google_token", return_value=PROFILE),
        patch("app.routes.payroll.get_db", return_value=SimpleNamespace(analyses=analyses)),
    ):
        response = TestClient(app).post(
            f"/api/payroll/analyses/{analysis_id}/match",
            headers={"Authorization": "Bearer test-token"},
            files={"file": ("payroll.csv", SAMPLE.read_bytes(), "text/csv")},
        )

    assert response.status_code == 200
    assert response.json()["summary"] == {
        "strong": 3,
        "possible": 0,
        "outside_criteria": 14,
        "missing_record_types": [],
    }
    assert not hasattr(analyses, "insert_one")
    assert not hasattr(analyses, "update_one")
