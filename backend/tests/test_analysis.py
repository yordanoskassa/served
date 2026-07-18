from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.engine.ground_truth import OfficialClerkContact
from app.engine.models import Confidence
from app.schemas.analysis import (
    AnalysisResponse,
    AnalysisRunTrace,
    EvidenceItem,
    ModelUsage,
    RunMetrics,
    Verdict,
)
from app.schemas.auth import UserProfile
from app.routes.analysis import _saved_analysis_payload


def test_analyze_rejects_non_image() -> None:
    response = TestClient(app).post(
        "/api/documents/analyze",
        files={"file": ("letter.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 415


def test_analyze_returns_service_result() -> None:
    result = AnalysisResponse(
        document_type="Court notice",
        summary="A hearing date is visible.",
        verdict=Verdict.CANNOT_CONFIRM,
        confidence=Confidence.LOW,
        official_contact=OfficialClerkContact(
            status="reviewed_route",
            court_name="U.S. District Court, Central District of California",
            office_name="Eastern Division / Riverside",
            phone="All Inquiries: (951) 328-4450",
            tel_uri="tel:+19513284450",
            official_contact_page="https://www.cacd.uscourts.gov/contact",
        ),
        evidence=[EvidenceItem(label="Date", detail="July 30", source="Uploaded document")],
        next_step="Call the court using its official website.",
    )
    profile = UserProfile(
        subject="google-user-1",
        email="owner@example.com",
        name="Owner",
        given_name="Owner",
        picture=None,
    )
    database = SimpleNamespace(
        analyses=SimpleNamespace(insert_one=AsyncMock()),
    )
    with (
        patch("app.routes.analysis.analyze_document", new=AsyncMock(return_value=result)),
        patch("app.routes.analysis._verify_google_token", return_value=profile),
        patch("app.routes.analysis.get_db", return_value=database),
    ):
        response = TestClient(app).post(
            "/api/documents/analyze",
            files={"file": ("letter.png", b"\x89PNG\r\n\x1a\nimage", "image/png")},
            headers={"Authorization": "Bearer test-token"},
        )
    assert response.status_code == 200
    assert response.json()["document_type"] == "Court notice"
    assert response.json()["official_contact"]["tel_uri"] == "tel:+19513284450"
    assert response.json()["saved_analysis_id"]
    database.analyses.insert_one.assert_awaited_once()
    saved = database.analyses.insert_one.await_args.args[0]
    assert str(saved["_id"]) == response.json()["saved_analysis_id"]
    assert saved["analysis"]["saved_analysis_id"] == response.json()["saved_analysis_id"]
    assert saved["schema_version"] == 2
    assert saved["detail_available"] is True
    assert saved["analysis"] == result.model_dump(mode="json")
    assert saved["content_type"] == "image/png"
    assert saved["file_size_bytes"] == len(b"\x89PNG\r\n\x1a\nimage")
    assert not _contains_bytes(saved)


def _contains_bytes(value) -> bool:
    if isinstance(value, bytes):
        return True
    if isinstance(value, dict):
        return any(_contains_bytes(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return any(_contains_bytes(item) for item in value)
    return False


def test_saved_analysis_snapshot_removes_provider_response_ids() -> None:
    result = AnalysisResponse(
        document_type="Court notice",
        summary="A hearing date is visible.",
        verdict=Verdict.CANNOT_CONFIRM,
        confidence=Confidence.LOW,
        evidence=[EvidenceItem(label="Date", detail="July 30", source="Uploaded document")],
        next_step="Call the court using its official website.",
        trace=AnalysisRunTrace(
            run_id="run-1",
            started_at="2026-07-17T12:00:00Z",
            completed_at="2026-07-17T12:00:01Z",
            model_alias="gpt-test",
            prompt_versions={},
            corpus_version="sha256:test",
            policy_version="policy-v1",
            model_usage=[ModelUsage(
                stage="reader",
                model="gpt-test",
                response_id="resp_private_provider_id",
            )],
            metrics=RunMetrics(
                total_duration_ms=1000,
                model_calls=1,
                tool_calls=0,
                evidence_items=1,
            ),
        ),
    )

    payload = _saved_analysis_payload(result)

    assert payload["trace"]["model_usage"][0]["response_id"] is None
    assert result.trace.model_usage[0].response_id == "resp_private_provider_id"


def test_analyze_requires_sign_in_before_provider_work() -> None:
    analyzer = AsyncMock()
    with patch("app.routes.analysis.analyze_document", new=analyzer):
        response = TestClient(app).post(
            "/api/documents/analyze",
            files={"file": ("letter.png", b"\x89PNG\r\n\x1a\nimage", "image/png")},
        )
    assert response.status_code == 401
    assert response.json()["detail"] == "Sign in before analyzing a document."
    analyzer.assert_not_awaited()


def test_sample_documents_are_available() -> None:
    for sample in ("D1", "D2", "D3", "D4"):
        response = TestClient(app).get(f"/api/documents/samples/{sample}")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert response.content.startswith(b"%PDF")
