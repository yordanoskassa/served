from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId
from fastapi.testclient import TestClient

from app.engine.models import Confidence, VerdictState
from app.main import app
from app.schemas.analysis import AnalysisResponse, EvidenceItem, LetterBreakdown
from app.schemas.auth import UserProfile


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
        evidence=[EvidenceItem(
            id="reader-case-number",
            label="Case number",
            detail="1:26-cv-00123",
            source="Uploaded document",
        )],
        limitations=["The court record could not be independently confirmed."],
        next_step="Contact the court using its official directory listing.",
    )


class _Cursor:
    def __init__(self, records: list[dict]):
        self.records = records

    def sort(self, key: str, direction: int):
        assert (key, direction) == ("created_at", -1)
        return self

    async def to_list(self, length: int):
        assert length == 50
        return self.records


class _PaginatedCursor:
    def __init__(self, records: list[dict]):
        self.records = records
        self.sort_keys = None
        self.offset = None

    def sort(self, keys: list[tuple[str, int]]):
        self.sort_keys = keys
        return self

    def skip(self, offset: int):
        self.offset = offset
        return self

    async def to_list(self, length: int):
        assert length == 3
        return self.records


def test_dashboard_summary_marks_reopenable_records_without_loading_snapshots() -> None:
    records = [
        {
            "_id": ObjectId(),
            "filename": "new-result.pdf",
            "verdict": "verified",
            "created_at": datetime(2026, 7, 17, tzinfo=UTC),
            "schema_version": 2,
            "detail_available": True,
        },
        {
            "_id": ObjectId(),
            "filename": "legacy-result.pdf",
            "verdict": "cannot_confirm",
            "created_at": datetime(2026, 7, 16, tzinfo=UTC),
        },
    ]
    analyses = SimpleNamespace(find=MagicMock(return_value=_Cursor(records)))

    with (
        patch("app.routes.dashboard._verify_google_token", return_value=PROFILE),
        patch("app.routes.dashboard.get_db", return_value=SimpleNamespace(analyses=analyses)),
    ):
        response = TestClient(app).get(
            "/api/dashboard/summary",
            headers={"Authorization": "Bearer test-token"},
        )

    assert response.status_code == 200
    assert [item["detail_available"] for item in response.json()["recent"]] == [True, False]
    projection = analyses.find.call_args.args[1]
    assert "analysis" not in projection
    assert projection["detail_available"] == 1


def test_saved_analysis_history_is_paginated_owner_scoped_and_metadata_only() -> None:
    records = [
        {
            "_id": ObjectId(),
            "filename": "newest.pdf",
            "verdict": "verified",
            "created_at": datetime(2026, 7, 17, 12, tzinfo=UTC),
            "schema_version": 2,
        },
        {
            "_id": ObjectId(),
            "filename": "older.pdf",
            "verdict": "cannot_confirm",
            "created_at": datetime(2026, 7, 16, 12, tzinfo=UTC),
            "detail_available": True,
        },
        {
            "_id": ObjectId(),
            "filename": "next-page.pdf",
            "verdict": "scam",
            "created_at": datetime(2026, 7, 15, 12, tzinfo=UTC),
        },
    ]
    cursor = _PaginatedCursor(records)
    analyses = SimpleNamespace(find=MagicMock(return_value=cursor))

    with (
        patch("app.routes.dashboard._verify_google_token", return_value=PROFILE),
        patch("app.routes.dashboard.get_db", return_value=SimpleNamespace(analyses=analyses)),
    ):
        response = TestClient(app).get(
            "/api/dashboard/analyses?limit=2&offset=5",
            headers={"Authorization": "Bearer test-token"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert [item["name"] for item in payload["items"]] == ["newest.pdf", "older.pdf"]
    assert payload["limit"] == 2
    assert payload["offset"] == 5
    assert payload["has_more"] is True
    assert cursor.sort_keys == [("created_at", -1), ("_id", -1)]
    assert cursor.offset == 5
    analyses.find.assert_called_once_with(
        {"google_subject": PROFILE.subject},
        {
            "filename": 1,
            "verdict": 1,
            "created_at": 1,
            "schema_version": 1,
            "detail_available": 1,
        },
    )
    assert "analysis" not in analyses.find.call_args.args[1]


def test_saved_analysis_history_keeps_legacy_missing_fields_explicitly_null() -> None:
    cursor = _PaginatedCursor([{"_id": ObjectId(), "filename": "legacy.pdf"}])
    analyses = SimpleNamespace(find=MagicMock(return_value=cursor))
    with (
        patch("app.routes.dashboard._verify_google_token", return_value=PROFILE),
        patch("app.routes.dashboard.get_db", return_value=SimpleNamespace(analyses=analyses)),
    ):
        response = TestClient(app).get(
            "/api/dashboard/analyses?limit=2",
            headers={"Authorization": "Bearer test-token"},
        )

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["verdict"] is None
    assert item["created_at"] is None
    assert item["detail_available"] is False


def test_saved_analysis_history_rejects_unbounded_pages() -> None:
    client = TestClient(app)
    headers = {"Authorization": "Bearer test-token"}
    assert client.get("/api/dashboard/analyses?limit=0", headers=headers).status_code == 422
    assert client.get("/api/dashboard/analyses?limit=101", headers=headers).status_code == 422
    assert client.get("/api/dashboard/analyses?offset=10001", headers=headers).status_code == 422


def test_saved_analysis_history_requires_authentication() -> None:
    response = TestClient(app).get("/api/dashboard/analyses")
    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token."


def test_saved_analysis_detail_returns_full_owner_scoped_result() -> None:
    analysis_id = ObjectId()
    created_at = datetime(2026, 7, 17, 12, 30, tzinfo=UTC)
    analyses = SimpleNamespace(find_one=AsyncMock(return_value={
        "_id": analysis_id,
        "google_subject": PROFILE.subject,
        "filename": "notice.pdf",
        "verdict": "cannot_confirm",
        "created_at": created_at,
        "analysis": _analysis().model_dump(mode="json"),
    }))

    with (
        patch("app.routes.dashboard._verify_google_token", return_value=PROFILE),
        patch("app.routes.dashboard.get_db", return_value=SimpleNamespace(analyses=analyses)),
    ):
        response = TestClient(app).get(
            f"/api/dashboard/analyses/{analysis_id}",
            headers={"Authorization": "Bearer test-token"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["detail_available"] is True
    assert payload["name"] == "notice.pdf"
    assert payload["analysis"]["summary"] == "The letter claims a response is due July 30."
    assert payload["analysis"]["breakdown"]["case_number"] == "1:26-cv-00123"
    assert payload["analysis"]["evidence"][0]["id"] == "reader-case-number"
    analyses.find_one.assert_awaited_once_with({
        "_id": analysis_id,
        "google_subject": PROFILE.subject,
    })


def test_saved_analysis_detail_does_not_expose_another_users_record() -> None:
    analysis_id = ObjectId()
    analyses = SimpleNamespace(find_one=AsyncMock(return_value=None))

    with (
        patch("app.routes.dashboard._verify_google_token", return_value=PROFILE),
        patch("app.routes.dashboard.get_db", return_value=SimpleNamespace(analyses=analyses)),
    ):
        response = TestClient(app).get(
            f"/api/dashboard/analyses/{analysis_id}",
            headers={"Authorization": "Bearer test-token"},
        )

    assert response.status_code == 404
    assert response.json()["detail"] == "Saved analysis not found."
    analyses.find_one.assert_awaited_once_with({
        "_id": analysis_id,
        "google_subject": PROFILE.subject,
    })


def test_legacy_saved_analysis_is_returned_without_invented_detail() -> None:
    analysis_id = ObjectId()
    analyses = SimpleNamespace(find_one=AsyncMock(return_value={
        "_id": analysis_id,
        "google_subject": PROFILE.subject,
        "filename": "older-letter.png",
        "verdict": "verified",
        "created_at": datetime(2026, 7, 16, tzinfo=UTC),
        "document_type": "Court notice",
    }))

    with (
        patch("app.routes.dashboard._verify_google_token", return_value=PROFILE),
        patch("app.routes.dashboard.get_db", return_value=SimpleNamespace(analyses=analyses)),
    ):
        response = TestClient(app).get(
            f"/api/dashboard/analyses/{analysis_id}",
            headers={"Authorization": "Bearer test-token"},
        )

    assert response.status_code == 200
    assert response.json()["detail_available"] is False
    assert response.json()["analysis"] is None
    assert response.json()["verdict"] == "verified"


def test_saved_analysis_detail_rejects_invalid_id_without_database_lookup() -> None:
    get_db = AsyncMock()
    with (
        patch("app.routes.dashboard._verify_google_token", return_value=PROFILE),
        patch("app.routes.dashboard.get_db", new=get_db),
    ):
        response = TestClient(app).get(
            "/api/dashboard/analyses/not-an-object-id",
            headers={"Authorization": "Bearer test-token"},
        )

    assert response.status_code == 404
    get_db.assert_not_called()


def test_saved_analysis_detail_requires_authentication() -> None:
    response = TestClient(app).get(f"/api/dashboard/analyses/{ObjectId()}")
    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token."
