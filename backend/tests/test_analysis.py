from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.engine.models import Confidence
from app.schemas.analysis import AnalysisResponse, EvidenceItem, Verdict
from app.schemas.auth import UserProfile


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
            files={"file": ("letter.png", b"image", "image/png")},
            headers={"Authorization": "Bearer test-token"},
        )
    assert response.status_code == 200
    assert response.json()["document_type"] == "Court notice"
    database.analyses.insert_one.assert_awaited_once()


def test_analyze_requires_sign_in_before_provider_work() -> None:
    analyzer = AsyncMock()
    with patch("app.routes.analysis.analyze_document", new=analyzer):
        response = TestClient(app).post(
            "/api/documents/analyze",
            files={"file": ("letter.png", b"image", "image/png")},
        )
    assert response.status_code == 401
    assert response.json()["detail"] == "Sign in before analyzing a document."
    analyzer.assert_not_awaited()


def test_sample_document_is_available() -> None:
    response = TestClient(app).get("/api/documents/samples/D3")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
