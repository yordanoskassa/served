import asyncio
import json
from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import UploadFile
from pydantic import ValidationError
from starlette.datastructures import Headers

from app.engine.fraud_patterns import load_fraud_patterns
from app.engine.models import (
    CheckerReport,
    DocketEvidence,
    DocumentParse,
    ExplanationDraft,
    ScamSignal,
    ScamSignalDraft,
    VerdictState,
)
from app.engine.verdict import decide_verdict
from app.services.agent_system import agent_status
from app.services.document_analyzer import _validate_signals, _validated_signals, analyze_document


@pytest.mark.parametrize(
    ("model", "payload"),
    [
        (DocumentParse, {"doc_type": "Notice", "verdict": "scam"}),
        (CheckerReport, {"verdict": "verified"}),
        (ExplanationDraft, {"summary": "Facts", "next_step": "Verify", "verdict": "cannot_confirm"}),
    ],
)
def test_agent_contracts_reject_any_verdict_field(model, payload) -> None:
    with pytest.raises(ValidationError):
        model.model_validate(payload)


def test_agent_catalog_contains_the_four_product_agents() -> None:
    assert [item["name"] for item in agent_status()] == [
        "reader",
        "checker",
        "explainer",
        "cook",
    ]


def test_validated_signals_require_document_excerpts_and_known_unique_ids() -> None:
    visible_text = (
        "Purchase prepaid retail gift cards today. "
        "Do not contact your local courthouse."
    )
    draft = ScamSignalDraft(signals=[
        ScamSignal(pattern_id="2", document_excerpt="prepaid retail gift cards"),
        ScamSignal(pattern_id="2", document_excerpt="gift cards today"),
        ScamSignal(pattern_id="5", document_excerpt="Do not contact your local courthouse"),
        ScamSignal(pattern_id="4", document_excerpt="immediate arrest"),
        ScamSignal(pattern_id="999", document_excerpt="gift cards"),
        ScamSignal(pattern_id="6", document_excerpt="   "),
    ])

    accepted = _validated_signals(draft, visible_text)

    assert accepted == [
        ScamSignal(pattern_id="2", document_excerpt="prepaid retail gift cards"),
        ScamSignal(pattern_id="5", document_excerpt="Do not contact your local courthouse"),
    ]
    assert all(signal.document_excerpt in visible_text for signal in accepted)


def test_analysis_emits_the_canonical_corpus_quote_without_rewriting() -> None:
    excerpt = "prepaid retail gift cards"
    parsed = DocumentParse(
        doc_type="Payment demand",
        visible_text=f"Purchase {excerpt} immediately.",
    )
    checker = CheckerReport(
        scam_signals=[ScamSignal(pattern_id="2", document_excerpt=excerpt)],
        scam_check_status="complete",
    )
    explanation = ExplanationDraft(
        summary="The visible payment instruction matched an official warning pattern.",
        next_step="Use an independently sourced official contact.",
    )
    upload = UploadFile(
        file=BytesIO(b"image"),
        filename="letter.png",
        headers=Headers({"content-type": "image/png"}),
    )

    with patch(
        "app.services.document_analyzer.coordinator.run",
        new=AsyncMock(side_effect=[parsed, checker, explanation]),
    ):
        result = asyncio.run(analyze_document(upload))

    canonical = load_fraud_patterns()["2"]
    evidence = next(item for item in result.evidence if item.label == canonical.title)
    assert evidence.quote == canonical.official_quote
    assert evidence.source == canonical.source_name
    assert evidence.source_url == canonical.source_url
    assert result.decision is not None
    assert result.decision.rule == "fallback"
    assert result.decision.counted_signal_ids == ["2"]
    assert result.guard is not None
    assert result.guard.verdict is VerdictState.CANNOT_CONFIRM
    assert result.guard.accepted_pattern_ids == ["2"]
    assert result.guard.rejected_pattern_ids == []


def test_case_number_hit_without_party_match_is_not_labeled_as_verified() -> None:
    parsed = DocumentParse(
        doc_type="Court notice",
        case_number="5:25-cv-02108",
        parties=["Different Person", "Different Company"],
        visible_text="Court notice",
    )
    record = DocketEvidence(
        case_number_normalized="5:25-cv-02108",
        court_id="cacd",
        case_title="Barnes v. Maximus Consulting Services",
        parties=["Audrea Barnes", "Maximus Consulting Services"],
        filing_date="2025-01-01",
        docket_url="https://www.courtlistener.com/example",
        source="recap",
    )
    checker = CheckerReport(
        docket_evidence=[record],
        case_found=True,
        parties_match=False,
        court_lookup_status="party_mismatch",
        scam_check_status="complete",
    )
    explanation = ExplanationDraft(
        summary="The case number exists, but the parties did not match.",
        next_step="Check the record through an official source.",
    )
    upload = UploadFile(
        file=BytesIO(b"image"),
        filename="letter.png",
        headers=Headers({"content-type": "image/png"}),
    )

    with patch(
        "app.services.document_analyzer.coordinator.run",
        new=AsyncMock(side_effect=[parsed, checker, explanation]),
    ):
        result = asyncio.run(analyze_document(upload))

    assert result.verdict is VerdictState.CANNOT_CONFIRM
    assert result.evidence[0].label == "Case number found; parties did not match"
    assert result.decision is not None
    assert result.decision.case_found is True
    assert result.decision.parties_match is False


def test_fixture_expectations_use_existing_api_verdict_values() -> None:
    fixture_root = Path(__file__).resolve().parents[1] / "fixtures"
    manifest = json.loads((fixture_root / "expected-verdicts.json").read_text())

    assert manifest == {
        "D1": VerdictState.VERIFIED.value,
        "D2": VerdictState.CANNOT_CONFIRM.value,
        "D3": VerdictState.SCAM.value,
        "D4": VerdictState.VERIFIED.value,
    }
    assert all((fixture_root / "documents" / f"{name}.pdf").is_file() for name in manifest)


def test_trusted_d4_sample_uses_reviewed_verification_evidence() -> None:
    fixture_root = Path(__file__).resolve().parents[1] / "fixtures"
    upload = UploadFile(
        file=BytesIO((fixture_root / "documents" / "D4.pdf").read_bytes()),
        filename="D4_payment_and_bank_records_request.pdf",
        headers=Headers({"content-type": "application/pdf"}),
    )
    with patch(
        "app.services.document_analyzer.coordinator.run",
        new=AsyncMock(),
    ) as runner:
        result = asyncio.run(analyze_document(upload, trusted_sample_id="D4"))

    assert result.verdict is VerdictState.VERIFIED
    assert result.decision is not None
    assert result.decision.case_found is True
    assert result.decision.parties_match is True
    assert result.trace is not None
    assert result.trace.fact_extraction_basis == "reviewed_sample_fixture"
    assert runner.await_count == 0


@pytest.mark.parametrize("sample_id", ["D1", "D2", "D3", "D4"])
def test_trusted_samples_never_call_live_agents(sample_id: str) -> None:
    fixture_root = Path(__file__).resolve().parents[1] / "fixtures"
    upload = UploadFile(
        file=BytesIO((fixture_root / "documents" / f"{sample_id}.pdf").read_bytes()),
        filename=f"{sample_id}_reviewed_request.pdf",
        headers=Headers({"content-type": "application/pdf"}),
    )
    with patch(
        "app.services.document_analyzer.coordinator.run",
        new=AsyncMock(),
    ) as runner:
        result = asyncio.run(analyze_document(upload, trusted_sample_id=sample_id))

    assert result.trace is not None
    assert result.trace.fact_extraction_basis == "reviewed_sample_fixture"
    assert runner.await_count == 0


@pytest.mark.parametrize("case_name", ["D1", "D2", "D3", "D4"])
def test_golden_agent_outputs_replay_through_validation_and_code_policy(case_name: str) -> None:
    """Replay saved agent outputs without invoking OpenAI or CourtListener."""
    fixture_root = Path(__file__).resolve().parents[1] / "fixtures"
    manifest = json.loads((fixture_root / "expected-verdicts.json").read_text())
    golden = json.loads((fixture_root / "golden-agent-outputs.json").read_text())
    assert golden["schema_version"] == 1
    assert set(golden["cases"]) == set(manifest)
    case = golden["cases"][case_name]

    assert case["document"] == f"{case_name}.pdf"
    assert (fixture_root / "documents" / case["document"]).is_file()

    parsed = DocumentParse.model_validate(case["reader"])
    checker_payload = dict(case["checker"])
    draft = ScamSignalDraft.model_validate(checker_payload.pop("scam_signal_draft"))
    checker_payload["scam_signals"] = _validated_signals(draft, parsed.visible_text)
    checker = CheckerReport.model_validate(checker_payload)

    result = decide_verdict(parsed, checker)

    assert result.verdict.value == manifest[case_name]
    assert all(signal.document_excerpt in parsed.visible_text for signal in checker.scam_signals)
    if case_name == "D3":
        assert result.indicators == ["2", "4", "5", "6"]


def test_annotation_only_pattern_seven_plus_one_countable_signal_is_not_scam() -> None:
    parsed = DocumentParse(doc_type="Court notice")
    checker = CheckerReport(
        scam_signals=[
            ScamSignal(pattern_id="7", document_excerpt="Reference number: FILE-123"),
            ScamSignal(pattern_id="2", document_excerpt="Purchase prepaid retail gift cards"),
        ],
        scam_check_status="complete",
    )

    result = decide_verdict(parsed, checker)

    assert result.verdict is VerdictState.CANNOT_CONFIRM
    assert result.indicators == ["2"]


def test_annotation_only_model_proposal_is_quarantined_before_evidence() -> None:
    visible_text = "Reference number: FILE-123"
    draft = ScamSignalDraft(signals=[
        ScamSignal(pattern_id="7", document_excerpt=visible_text),
    ])

    accepted, reviews = _validate_signals(draft, visible_text)

    assert accepted == []
    assert len(reviews) == 1
    assert reviews[0].reason == "annotation_only_pattern"
    assert reviews[0].counts_toward_verdict is False


def test_known_pattern_id_with_semantically_wrong_exact_excerpt_is_rejected() -> None:
    visible_text = "Purchase prepaid retail gift cards immediately."
    draft = ScamSignalDraft(signals=[
        ScamSignal(pattern_id="4", document_excerpt="prepaid retail gift cards"),
        ScamSignal(pattern_id="2", document_excerpt="prepaid retail gift cards"),
    ])

    assert _validated_signals(draft, visible_text) == [
        ScamSignal(pattern_id="2", document_excerpt="prepaid retail gift cards"),
    ]
