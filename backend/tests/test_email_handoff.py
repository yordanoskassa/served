import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId
from fastapi.testclient import TestClient
from pydantic import SecretStr
import pytest

from app.config import Settings, settings
from app.engine.ground_truth import OfficialClerkContact
from app.engine.models import Confidence, VerdictState
from app.main import app
from app.schemas.analysis import (
    AnalysisResponse,
    DecisionTrace,
    EvidenceItem,
    LetterBreakdown,
)
from app.schemas.auth import UserProfile
from app.services.email_delivery import (
    EmailDeliveryError,
    EmailDeliveryNotConfiguredError,
    EmailDeliveryReceipt,
    render_analysis_handoff,
    send_analysis_handoff,
)


PROFILE = UserProfile(
    subject="google-user-1",
    email="owner@example.com",
    name="Owner",
    given_name="Owner",
    picture=None,
)


def _analysis() -> AnalysisResponse:
    return AnalysisResponse(
        document_type="Court notice",
        summary="The letter claims a response is due July 30.",
        verdict=VerdictState.CANNOT_CONFIRM,
        confidence=Confidence.MEDIUM,
        deadline="2026-07-30",
        breakdown=LetterBreakdown(
            court="District Court",
            case_number="1:26-cv-00123",
            parties=["Example Owner", "Example Company"],
            requested_actions=["File a written response"],
        ),
        decision=DecisionTrace(
            policy_version="served-verdict-v1",
            rule="fallback",
            case_found=False,
            parties_match=False,
        ),
        evidence=[EvidenceItem(
            id="reader-case-number",
            label="Case number",
            detail="1:26-cv-00123",
            source="Uploaded document",
            source_url="https://example.gov/cases/123",
            quote="The exact source wording.",
        )],
        limitations=["The court record could not be independently confirmed."],
        next_step="Contact the court using its official directory listing.",
    )


def test_email_handoff_is_owner_scoped_and_uses_verified_profile_email() -> None:
    analysis_id = ObjectId()
    analyses = SimpleNamespace(find_one=AsyncMock(return_value={
        "_id": analysis_id,
        "google_subject": PROFILE.subject,
        "filename": "notice.pdf",
        "verdict": "cannot_confirm",
        "created_at": datetime(2026, 7, 17, tzinfo=UTC),
        "analysis": _analysis().model_dump(mode="json"),
    }))
    send = AsyncMock(return_value=EmailDeliveryReceipt(
        message_id="email-123",
        recipient=PROFILE.email,
    ))

    with (
        patch("app.routes.dashboard._verify_google_token", return_value=PROFILE),
        patch("app.routes.dashboard.get_db", return_value=SimpleNamespace(analyses=analyses)),
        patch("app.routes.dashboard.send_analysis_handoff", new=send),
    ):
        response = TestClient(app).post(
            f"/api/dashboard/analyses/{analysis_id}/email",
            headers={"Authorization": "Bearer test-token"},
        )

    assert response.status_code == 202
    assert response.json() == {
        "status": "sent",
        "message_id": "email-123",
        "recipient": PROFILE.email,
    }
    analyses.find_one.assert_awaited_once_with({
        "_id": analysis_id,
        "google_subject": PROFILE.subject,
    })
    kwargs = send.await_args.kwargs
    assert kwargs["analysis_id"] == str(analysis_id)
    assert kwargs["filename"] == "notice.pdf"
    assert kwargs["recipient"] == PROFILE.email
    assert kwargs["analysis"].verdict == VerdictState.CANNOT_CONFIRM


def test_email_handoff_does_not_expose_another_users_record() -> None:
    analysis_id = ObjectId()
    analyses = SimpleNamespace(find_one=AsyncMock(return_value=None))
    send = AsyncMock()
    with (
        patch("app.routes.dashboard._verify_google_token", return_value=PROFILE),
        patch("app.routes.dashboard.get_db", return_value=SimpleNamespace(analyses=analyses)),
        patch("app.routes.dashboard.send_analysis_handoff", new=send),
    ):
        response = TestClient(app).post(
            f"/api/dashboard/analyses/{analysis_id}/email",
            headers={"Authorization": "Bearer test-token"},
        )

    assert response.status_code == 404
    assert response.json()["detail"] == "Saved analysis not found."
    send.assert_not_awaited()


def test_email_handoff_requires_authentication() -> None:
    response = TestClient(app).post(f"/api/dashboard/analyses/{ObjectId()}/email")
    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token."


def test_email_handoff_rejects_invalid_id_before_database_lookup() -> None:
    get_db = MagicMock()
    with (
        patch("app.routes.dashboard._verify_google_token", return_value=PROFILE),
        patch("app.routes.dashboard.get_db", new=get_db),
    ):
        response = TestClient(app).post(
            "/api/dashboard/analyses/not-an-object-id/email",
            headers={"Authorization": "Bearer test-token"},
        )

    assert response.status_code == 404
    get_db.assert_not_called()


def test_email_handoff_rejects_legacy_record_without_complete_analysis() -> None:
    analysis_id = ObjectId()
    analyses = SimpleNamespace(find_one=AsyncMock(return_value={
        "_id": analysis_id,
        "google_subject": PROFILE.subject,
        "filename": "legacy.pdf",
    }))
    send = AsyncMock()
    with (
        patch("app.routes.dashboard._verify_google_token", return_value=PROFILE),
        patch("app.routes.dashboard.get_db", return_value=SimpleNamespace(analyses=analyses)),
        patch("app.routes.dashboard.send_analysis_handoff", new=send),
    ):
        response = TestClient(app).post(
            f"/api/dashboard/analyses/{analysis_id}/email",
            headers={"Authorization": "Bearer test-token"},
        )

    assert response.status_code == 409
    assert response.json()["detail"] == "This saved analysis does not contain a complete handoff."
    send.assert_not_awaited()


@pytest.mark.parametrize(
    ("error", "status_code", "detail"),
    [
        (
            EmailDeliveryNotConfiguredError("secret-free configuration error"),
            503,
            "Email delivery is not configured.",
        ),
        (
            EmailDeliveryError("provider detail must not escape"),
            502,
            "The handoff email could not be sent. Please try again.",
        ),
    ],
)
def test_email_handoff_returns_generic_delivery_errors(
    error: Exception,
    status_code: int,
    detail: str,
) -> None:
    analysis_id = ObjectId()
    analyses = SimpleNamespace(find_one=AsyncMock(return_value={
        "_id": analysis_id,
        "google_subject": PROFILE.subject,
        "filename": "notice.pdf",
        "analysis": _analysis().model_dump(mode="json"),
    }))
    with (
        patch("app.routes.dashboard._verify_google_token", return_value=PROFILE),
        patch("app.routes.dashboard.get_db", return_value=SimpleNamespace(analyses=analyses)),
        patch("app.routes.dashboard.send_analysis_handoff", new=AsyncMock(side_effect=error)),
    ):
        response = TestClient(app).post(
            f"/api/dashboard/analyses/{analysis_id}/email",
            headers={"Authorization": "Bearer test-token"},
        )

    assert response.status_code == status_code
    assert response.json()["detail"] == detail
    assert "provider detail" not in response.text
    assert "secret-free" not in response.text


def test_rendered_handoff_escapes_untrusted_content_and_unsafe_links() -> None:
    analysis = _analysis().model_copy(deep=True)
    analysis.summary = '<script>alert("summary")</script>'
    analysis.evidence[0].detail = "<img src=x onerror=alert(1)>"
    analysis.evidence[0].source_url = "javascript:alert(1)"

    html, text = render_analysis_handoff(analysis, "<b>notice.pdf</b>")

    assert "<script>" not in html
    assert "<img src=x" not in html
    assert "<b>notice.pdf</b>" not in html
    assert "&lt;script&gt;" in html
    assert "&lt;img src=x" in html
    assert "&lt;b&gt;notice.pdf&lt;/b&gt;" in html
    assert "javascript:" not in html
    assert '<script>alert("summary")</script>' in text
    assert "CANNOT_CONFIRM" in text
    assert 'Exact source quote: "The exact source wording."' in text
    assert "not legal advice" in text


def test_handoff_uses_only_reviewed_contact_and_never_routes_to_letter_contact() -> None:
    analysis = _analysis().model_copy(deep=True)
    analysis.breakdown.requested_actions = [
        "Email scammer@letter.example or call 202-555-0199",
    ]
    analysis.official_contact = OfficialClerkContact(
        status="reviewed_route",
        court_name="United States District Court",
        office_name="Civil Intake",
        purpose="General case information",
        phone="(408) 535-5363",
        tel_uri="tel:+14085355363",
        office_hours="9:00 a.m.–4:00 p.m.",
        timezone="Pacific Time",
        official_contact_page="https://www.cand.uscourts.gov/about/clerks-office/",
        verified_on="2026-07-16",
    )

    html, text = render_analysis_handoff(analysis, "notice.pdf")

    # Suspicious letter content is retained only as a quoted requested action;
    # it is never elevated into the official route or used as a recipient.
    assert "scammer@letter.example" in text
    official_section = text.split("OFFICIAL FOLLOW-UP ROUTE", 1)[1].split("NEXT STEP", 1)[0]
    assert "scammer@letter.example" not in official_section
    assert "202-555-0199" not in official_section
    assert "(408) 535-5363" in official_section
    assert "General case information" in official_section
    assert "9:00 a.m.–4:00 p.m. Pacific Time" in official_section
    assert "https://www.cand.uscourts.gov/about/clerks-office/" in official_section
    assert "scammer@letter.example" in html


def test_resend_delivery_uses_secret_auth_both_formats_and_idempotency() -> None:
    response = MagicMock(status_code=200)
    response.json.return_value = {"id": "resend-email-123"}
    post = AsyncMock(return_value=response)
    client = AsyncMock()
    client.post = post
    context = AsyncMock()
    context.__aenter__.return_value = client
    context.__aexit__.return_value = None

    with (
        patch.object(settings, "resend_api_key", SecretStr("fake-resend-secret")),
        patch.object(settings, "resend_from_email", "Served <handoff@served.test>"),
        patch.object(settings, "resend_reply_to", "help@served.test"),
        patch("app.services.email_delivery.httpx.AsyncClient", return_value=context),
    ):
        receipt = asyncio.run(
            send_analysis_handoff(
                analysis_id="analysis-123",
                filename="notice\r\nBcc: victim@example.com.pdf",
                analysis=_analysis(),
                recipient=PROFILE.email,
            )
        )

    assert receipt == EmailDeliveryReceipt(
        message_id="resend-email-123",
        recipient=PROFILE.email,
    )
    call = post.await_args
    assert call.args[0] == "https://api.resend.com/emails"
    assert call.kwargs["headers"] == {
        "Authorization": "Bearer fake-resend-secret",
        "Content-Type": "application/json",
        "Idempotency-Key": "served-analysis-handoff-analysis-123",
    }
    payload = call.kwargs["json"]
    assert payload["from"] == "Served <handoff@served.test>"
    assert payload["to"] == [PROFILE.email]
    assert payload["reply_to"] == "help@served.test"
    assert "\n" not in payload["subject"]
    assert "Bcc: victim@example.com.pdf" in payload["subject"]
    assert payload["text"]
    assert payload["html"]
    assert payload["tags"] == [
        {"name": "category", "value": "analysis_handoff"},
        {"name": "verdict", "value": "cannot_confirm"},
    ]


def test_resend_delivery_fails_closed_without_configuration() -> None:
    with (
        patch.object(settings, "resend_api_key", SecretStr("")),
        patch.object(settings, "resend_from_email", ""),
    ):
        with pytest.raises(EmailDeliveryNotConfiguredError):
            asyncio.run(
                send_analysis_handoff(
                    analysis_id="analysis-123",
                    filename="notice.pdf",
                    analysis=_analysis(),
                    recipient=PROFILE.email,
                )
            )


def test_resend_delivery_hides_provider_rejection_details() -> None:
    response = MagicMock(status_code=422)
    response.json.return_value = {"message": "sensitive provider response"}
    client = AsyncMock()
    client.post = AsyncMock(return_value=response)
    context = AsyncMock()
    context.__aenter__.return_value = client
    context.__aexit__.return_value = None

    with (
        patch.object(settings, "resend_api_key", SecretStr("fake-resend-secret")),
        patch.object(settings, "resend_from_email", "Served <handoff@served.test>"),
        patch("app.services.email_delivery.httpx.AsyncClient", return_value=context),
    ):
        with pytest.raises(EmailDeliveryError) as caught:
            asyncio.run(
                send_analysis_handoff(
                    analysis_id="analysis-123",
                    filename="notice.pdf",
                    analysis=_analysis(),
                    recipient=PROFILE.email,
                )
            )

    assert "sensitive provider response" not in str(caught.value)


def test_resend_api_key_is_masked_by_settings() -> None:
    with patch.object(settings, "resend_api_key", SecretStr("fake-resend-secret")):
        assert "fake-resend-secret" not in repr(settings.resend_api_key)
        assert str(settings.resend_api_key) == "**********"


@pytest.mark.parametrize("prefix", ["SERVED_", ""])
def test_resend_settings_accept_served_and_standard_env_aliases(prefix: str) -> None:
    configured = Settings(
        _env_file=None,
        **{
            f"{prefix}RESEND_API_KEY": "fake-resend-secret",
            f"{prefix}RESEND_FROM_EMAIL": "Served <handoff@served.test>",
            f"{prefix}RESEND_REPLY_TO": "help@served.test",
        },
    )

    assert configured.resend_api_key.get_secret_value() == "fake-resend-secret"
    assert configured.resend_from_email == "Served <handoff@served.test>"
    assert configured.resend_reply_to == "help@served.test"
