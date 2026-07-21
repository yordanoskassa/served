import asyncio
import json
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path

from fastapi import UploadFile
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from app.engine.models import (
    CheckerReport,
    Confidence,
    DocumentParse,
    ExplanationDraft,
    ScamSignal,
    ScamSignalDraft,
    ScamSignalReview,
    VerdictState,
)
from app.main import app
from app.schemas.analysis import AnalysisResponse, EvidenceItem, TraceEvent
from app.schemas.auth import UserProfile
from app.services import document_analyzer as analyzer
from app.services.agent_system import AgentProviderQuotaError, AgentUnavailableError
from app.services.run_trace import RunTraceCollector


def _upload(data: bytes = b"\x89PNG\r\n\x1a\nimage") -> UploadFile:
    return UploadFile(
        file=BytesIO(data),
        filename="letter.png",
        headers=Headers({"content-type": "image/png"}),
    )


def test_checker_evidence_branches_start_concurrently() -> None:
    court_started = asyncio.Event()
    patterns_started = asyncio.Event()

    async def court_branch(parsed, trace):
        court_started.set()
        await asyncio.wait_for(patterns_started.wait(), timeout=0.25)
        return analyzer.CourtBranchResult([], False, None, "no_match", [])

    async def pattern_branch(parsed, trace):
        patterns_started.set()
        await asyncio.wait_for(court_started.wait(), timeout=0.25)
        return analyzer.PatternBranchResult([], [], "complete", [])

    async def run() -> CheckerReport:
        with (
            patch.object(analyzer, "_courtlistener_branch", new=court_branch),
            patch.object(analyzer, "_pattern_branch", new=pattern_branch),
        ):
            return await analyzer._checker_agent(
                parsed=DocumentParse(doc_type="Notice", visible_text="Text")
            )

    report = asyncio.run(run())
    assert court_started.is_set() and patterns_started.is_set()
    assert report.court_lookup_status == "no_match"
    assert report.scam_check_status == "complete"


def test_trace_preserves_start_and_finish_events_in_order() -> None:
    parsed = DocumentParse(doc_type="Notice", visible_text="No warning signals")
    checker = CheckerReport(court_lookup_status="not_applicable", scam_check_status="complete")
    explanation = ExplanationDraft(summary="No result was confirmed.", next_step="Verify independently.")
    emitted: list[TraceEvent] = []

    with patch(
        "app.services.document_analyzer.coordinator.run",
        new=AsyncMock(side_effect=[parsed, checker, explanation]),
    ):
        result = asyncio.run(analyzer.analyze_document(_upload(), emit=emitted.append))

    assert result.trace is not None
    assert [event.seq for event in emitted] == sorted(event.seq for event in emitted)
    assert [event.seq for event in result.trace.steps] == sorted(event.seq for event in result.trace.steps)
    reader_events = [event.status for event in result.trace.steps if event.key == "reader"]
    assert reader_events == ["started", "complete"]
    rules_finish = next(event for event in result.trace.steps if event.key == "rules" and event.status == "complete")
    explainer_start = next(event for event in result.trace.steps if event.key == "explainer" and event.status == "started")
    assert rules_finish.seq < explainer_start.seq
    assert result.trace.verdict_authority == "deterministic_policy"
    assert result.trace.human_review_required is True


def test_trace_emitter_failure_does_not_change_the_run() -> None:
    def broken_emitter(event: TraceEvent) -> None:
        raise RuntimeError("telemetry is down")

    async def run():
        trace = RunTraceCollector(
            model_alias="test-model",
            prompt_versions={},
            corpus_version="sha256:test",
            policy_version="test-policy",
            emit=broken_emitter,
        )
        await trace.start(key="intake", kind="run", label="Intake")
        await trace.finish(key="intake", kind="run", status="complete", label="Intake")
        return trace.build(evidence_items=0, signal_reviews=[])

    trace = asyncio.run(run())
    assert [event.status for event in trace.steps] == ["started", "complete"]


def test_legitimate_keywords_cannot_create_a_scam_verdict() -> None:
    visible_text = (
        "The wire transfer records are attached as Exhibit A. "
        "The complaint discusses arrest procedures in a historical case."
    )
    draft = ScamSignalDraft(signals=[
        ScamSignal(pattern_id="2", document_excerpt="wire transfer"),
        ScamSignal(pattern_id="4", document_excerpt="arrest procedures"),
    ])

    signals, reviews = analyzer._validate_signals(draft, visible_text)

    assert signals == []
    assert all(review.reason == "excerpt_does_not_support_pattern" for review in reviews)
    assert analyzer.decide_verdict(
        DocumentParse(doc_type="Complaint", visible_text=visible_text),
        CheckerReport(scam_signals=signals),
    ).verdict is VerdictState.CANNOT_CONFIRM


def test_phone_payment_signal_is_quarantined_without_official_phone_directory() -> None:
    visible_text = "Call the supplied phone number to pay the fine."
    draft = ScamSignalDraft(signals=[
        ScamSignal(pattern_id="8", document_excerpt=visible_text),
    ])

    signals, reviews = analyzer._validate_signals(draft, visible_text)

    assert signals == []
    assert reviews[0].accepted is False
    assert reviews[0].counts_toward_verdict is True
    assert reviews[0].reason == "excerpt_does_not_support_pattern"


def test_rejected_model_excerpt_is_not_sent_to_explainer() -> None:
    rejected_text = "INVENTED EXCERPT THAT IS NOT IN THE DOCUMENT"
    checker = CheckerReport(
        signal_reviews=[ScamSignalReview(
            pattern_id="2",
            document_excerpt=rejected_text,
            accepted=False,
            counts_toward_verdict=True,
            reason="excerpt_not_found",
        )],
    )
    parse = MagicMock(return_value=SimpleNamespace(
        output_parsed=ExplanationDraft(summary="Summary", next_step="Verify"),
        model="test-model",
        id="response-1",
        usage=None,
    ))
    client = SimpleNamespace(responses=SimpleNamespace(parse=parse))

    with patch.object(analyzer, "OpenAI", return_value=client) as openai_client:
        analyzer._explain_with_openai(
            DocumentParse(doc_type="Notice", visible_text="Real document text"),
            checker,
            VerdictState.CANNOT_CONFIRM,
        )

    assert openai_client.call_args.kwargs["max_retries"] == 0
    prompt = parse.call_args.kwargs["input"][0]["content"][0]["text"]
    assert rejected_text not in prompt
    assert "Real document text" in prompt


def test_reader_provider_failure_is_reported_as_unavailable() -> None:
    checker = CheckerReport(court_lookup_status="not_applicable", scam_check_status="not_applicable")
    explanation = ExplanationDraft(summary="Facts unavailable.", next_step="Try again.")
    with patch(
        "app.services.document_analyzer.coordinator.run",
        new=AsyncMock(side_effect=[AgentUnavailableError("provider failed"), checker, explanation]),
    ):
        result = asyncio.run(analyzer.analyze_document(_upload()))

    assert result.trace is not None
    reader_finish = next(
        event for event in result.trace.steps
        if event.key == "reader" and event.status != "started"
    )
    assert reader_finish.status == "unavailable"
    assert any("READER was unavailable" in limitation for limitation in result.limitations)
    assert not any("could not be read reliably" in limitation for limitation in result.limitations)


def test_reader_quota_failure_uses_service_unavailable_copy_and_stops_agent_calls() -> None:
    runner = AsyncMock(side_effect=AgentProviderQuotaError("provider quota unavailable"))
    with patch("app.services.document_analyzer.coordinator.run", new=runner):
        result = asyncio.run(analyzer.analyze_document(_upload()))

    assert runner.await_count == 1
    assert result.verdict is VerdictState.CANNOT_CONFIRM
    assert result.decision is not None
    assert result.decision.scam_check_status == "unavailable"
    assert "temporarily unavailable" in result.summary.lower()
    assert "try again" in result.next_step.lower()
    assert "retake" not in result.next_step.lower()
    assert not any("could not be read reliably" in item.lower() for item in result.limitations)
    assert any("temporarily unavailable" in item.lower() for item in result.limitations)
    assert result.trace is not None
    reader_finish = next(
        event for event in result.trace.steps
        if event.key == "reader" and event.status != "started"
    )
    assert reader_finish.status == "unavailable"
    assert reader_finish.output_summary == "Document AI temporarily unavailable"
    explainer_finish = next(
        event for event in result.trace.steps
        if event.key == "explainer" and event.status != "started"
    )
    assert explainer_finish.status == "degraded"
    assert "temporarily unavailable" in (explainer_finish.output_summary or "").lower()


def test_explainer_only_quota_failure_keeps_the_verified_fallback_explanation() -> None:
    parsed = DocumentParse(
        doc_type="Subpoena",
        court="United States District Court",
        case_number="5:25-cv-02108-KK-SP",
        parties=["Audrea Barnes", "Maximus Consulting Services"],
        visible_text="Visible subpoena text",
    )
    checker = CheckerReport(
        case_found=True,
        parties_match=True,
        court_lookup_status="match",
        scam_check_status="complete",
    )
    runner = AsyncMock(side_effect=[
        parsed,
        checker,
        AgentProviderQuotaError("provider quota unavailable"),
    ])
    with patch("app.services.document_analyzer.coordinator.run", new=runner):
        result = asyncio.run(analyzer.analyze_document(_upload()))

    assert runner.await_count == 3
    assert result.verdict is VerdictState.VERIFIED
    assert "case number" in result.summary.lower()
    assert "could not extract or verify" not in result.summary.lower()
    assert not any("no document facts were inferred" in item.lower() for item in result.limitations)
    assert any("explainer was unavailable" in item.lower() for item in result.limitations)
    assert result.trace is not None
    explainer_finish = next(
        event for event in result.trace.steps
        if event.key == "explainer" and event.status != "started"
    )
    assert explainer_finish.status == "degraded"
    assert "explainer quota unavailable" in (explainer_finish.output_summary or "").lower()


def test_pattern_quota_failure_fails_closed_without_signal() -> None:
    class FakeQuotaError(RuntimeError):
        code = "insufficient_quota"
        body = {"code": "insufficient_quota"}

    with (
        patch.object(analyzer.settings, "openai_api_key", "test-key"),
        patch.object(
            analyzer,
            "_check_patterns_with_openai",
            side_effect=FakeQuotaError("quota exhausted"),
        ),
    ):
        result = asyncio.run(analyzer._pattern_branch(
            DocumentParse(doc_type="Notice", visible_text="Visible document text"),
            trace=None,
        ))

    assert result.status == "unavailable"
    assert result.signals == []
    assert result.reviews == []
    assert any("temporarily unavailable" in item.lower() for item in result.limitations)


def test_embedded_pdf_text_anchors_pattern_checking() -> None:
    pdf_path = Path(__file__).resolve().parents[1] / "fixtures" / "documents" / "D3.pdf"
    upload = UploadFile(
        file=BytesIO(pdf_path.read_bytes()),
        filename="D3.pdf",
        headers=Headers({"content-type": "application/pdf"}),
    )
    parsed = DocumentParse(doc_type="Notice", visible_text="MODEL TRANSCRIPTION ONLY")
    explanation = ExplanationDraft(summary="Summary", next_step="Verify")
    checker_input: list[str] = []

    async def run_agent(name: str, **kwargs):
        if name == "reader":
            return parsed
        if name == "checker":
            checker_input.append(kwargs["parsed"].visible_text)
            return CheckerReport(court_lookup_status="not_applicable", scam_check_status="complete")
        return explanation

    with patch("app.services.document_analyzer.coordinator.run", new=run_agent):
        result = asyncio.run(analyzer.analyze_document(upload))

    assert checker_input and "FEDERAL LEGAL PROCESSING BUREAU" in checker_input[0]
    assert "MODEL TRANSCRIPTION ONLY" not in checker_input[0]
    assert result.trace is not None
    assert result.trace.pattern_text_basis == "native_pdf_text"


def test_stream_returns_trace_before_the_final_result() -> None:
    result = AnalysisResponse(
        document_type="Court notice",
        summary="No outcome was confirmed.",
        verdict=VerdictState.CANNOT_CONFIRM,
        confidence=Confidence.LOW,
        evidence=[EvidenceItem(label="Facts", detail="Visible text", source="Document")],
        next_step="Verify independently.",
    )
    profile = UserProfile(
        subject="google-user-1",
        email="owner@example.com",
        name="Owner",
        given_name="Owner",
        picture=None,
    )
    database = SimpleNamespace(analyses=SimpleNamespace(insert_one=AsyncMock()))

    async def fake_analyze(file, *, emit=None):
        assert emit is not None
        await emit(TraceEvent(
            run_id="run-1",
            seq=1,
            at="2026-07-16T00:00:00Z",
            key="intake",
            kind="run",
            status="started",
            label="Document intake",
        ))
        return result

    with (
        patch("app.routes.analysis.analyze_document", new=fake_analyze),
        patch("app.routes.analysis._verify_google_token", return_value=profile),
        patch("app.routes.analysis.get_db", return_value=database),
    ):
        response = TestClient(app).post(
            "/api/documents/analyze/stream",
            files={"file": ("letter.png", b"\x89PNG\r\n\x1a\nimage", "image/png")},
            headers={"Authorization": "Bearer test-token"},
        )

    messages = [json.loads(line) for line in response.text.splitlines()]
    assert response.status_code == 200
    assert [message["type"] for message in messages] == ["trace", "result"]
    assert messages[0]["event"]["key"] == "intake"
    assert messages[1]["analysis"]["verdict"] == "cannot_confirm"
    assert messages[1]["analysis"]["saved_analysis_id"]
    database.analyses.insert_one.assert_awaited_once()
    saved = database.analyses.insert_one.await_args.args[0]
    assert str(saved["_id"]) == messages[1]["analysis"]["saved_analysis_id"]


def test_upload_rejects_mismatched_declared_type_before_analysis() -> None:
    analyzer_mock = AsyncMock()
    with patch("app.routes.analysis.analyze_document", new=analyzer_mock):
        response = TestClient(app).post(
            "/api/documents/analyze",
            files={"file": ("letter.png", b"not actually a png", "image/png")},
            headers={"Authorization": "Bearer test-token"},
        )

    assert response.status_code == 415
    assert "do not match" in response.json()["detail"]
    analyzer_mock.assert_not_awaited()
