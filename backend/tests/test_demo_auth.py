from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import settings
from app.engine.models import Confidence
from app.main import app
from app.routes.auth import _verify_google_token, is_demo_profile
from app.schemas.analysis import AnalysisResponse, Verdict


FIXTURE_DOCUMENTS = Path(__file__).resolve().parents[1] / "fixtures" / "documents"


def _demo_token() -> str:
    response = TestClient(app).post("/api/auth/demo")
    assert response.status_code == 200
    return response.json()["credential"]


def test_demo_endpoint_issues_short_lived_scoped_identity() -> None:
    with patch.object(settings, "demo_token_secret", SecretStr("test-demo-secret")):
        response = TestClient(app).post("/api/auth/demo")
        profile = _verify_google_token(response.json()["credential"])

    assert response.status_code == 200
    assert response.json()["expires_in"] == 7200
    assert is_demo_profile(profile)
    assert profile.given_name == "Demo"


@pytest.mark.parametrize("sample_id", ["D1", "D2", "D3", "D4"])
def test_demo_identity_can_analyze_exact_reviewed_sample(sample_id: str) -> None:
    result = AnalysisResponse(
        document_type="Subpoena to produce payment and bank records",
        summary="Reviewed D4 sample.",
        verdict=Verdict.VERIFIED,
        confidence=Confidence.HIGH,
        evidence=[],
        next_step="Connect the sample account.",
    )
    analyzer = AsyncMock(return_value=result)
    database = SimpleNamespace(analyses=SimpleNamespace(insert_one=AsyncMock()))

    with (
        patch.object(settings, "demo_token_secret", SecretStr("test-demo-secret")),
        patch("app.routes.analysis.analyze_document", new=analyzer),
        patch("app.routes.analysis.get_db", return_value=database),
    ):
        token = _demo_token()
        response = TestClient(app).post(
            "/api/documents/analyze",
            files={
                "file": (
                    f"{sample_id}_reviewed_request.pdf",
                    (FIXTURE_DOCUMENTS / f"{sample_id}.pdf").read_bytes(),
                    "application/pdf",
                )
            },
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert analyzer.await_args.kwargs["trusted_sample_id"] == sample_id
    saved = database.analyses.insert_one.await_args.args[0]
    assert saved["google_subject"] == "demo:sample-judge"


def test_demo_identity_cannot_analyze_personal_upload() -> None:
    analyzer = AsyncMock()
    with (
        patch.object(settings, "demo_token_secret", SecretStr("test-demo-secret")),
        patch("app.routes.analysis.analyze_document", new=analyzer),
    ):
        token = _demo_token()
        response = TestClient(app).post(
            "/api/documents/analyze",
            files={"file": ("personal.png", b"\x89PNG\r\n\x1a\nimage", "image/png")},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == (
        "Demo access is limited to the reviewed sample requests."
    )
    analyzer.assert_not_awaited()


def test_demo_identity_cannot_open_saved_history_or_real_bank_link() -> None:
    with patch.object(settings, "demo_token_secret", SecretStr("test-demo-secret")):
        token = _demo_token()
        headers = {"Authorization": f"Bearer {token}"}
        history = TestClient(app).get("/api/dashboard/analyses", headers=headers)
        bank_link = TestClient(app).post(
            "/api/plaid/analyses/507f1f77bcf86cd799439011/link-token",
            headers=headers,
        )

    assert history.status_code == 403
    assert bank_link.status_code == 403


def test_public_sample_stream_requires_no_auth_and_uses_fixtures() -> None:
    result = AnalysisResponse(
        document_type="Payment demand",
        summary="Reviewed D3 sample.",
        verdict=Verdict.SCAM,
        confidence=Confidence.HIGH,
        evidence=[],
        next_step="Do not pay.",
    )
    analyzer = AsyncMock(return_value=result)
    database = SimpleNamespace(analyses=SimpleNamespace(insert_one=AsyncMock()))

    with (
        patch("app.routes.analysis.analyze_document", new=analyzer),
        patch("app.routes.analysis.get_db", return_value=database),
    ):
        response = TestClient(app).post("/api/documents/samples/D3/analyze/stream")

    assert response.status_code == 200
    lines = [line for line in response.text.split("\n") if line.strip()]
    assert any('"type":"result"' in line for line in lines)
    assert analyzer.await_args.kwargs["trusted_sample_id"] == "D3"
    saved = database.analyses.insert_one.await_args.args[0]
    assert saved["google_subject"] == "demo:sample-judge"
