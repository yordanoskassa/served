import json
from pathlib import Path
from typing import Any

import pytest

from app.engine.grounding_guard import (
    LegalPassageCandidate,
    RejectionReason,
    guard_and_decide,
    guard_legal_passage,
    guard_patterns,
)
from app.engine.models import VerdictState


VECTOR_PATH = (
    Path(__file__).resolve().parents[1]
    / "app"
    / "engine"
    / "grounding-guard"
    / "guardrail-test-cases.json"
)
VECTORS: list[dict[str, Any]] = json.loads(
    VECTOR_PATH.read_text(encoding="utf-8")
)["cases"]
EXPECTED_VECTOR_IDS = [
    "G01-two-countable-signals",
    "G02-annotation-only-does-not-count",
    "G03-unknown-pattern-is-discarded",
    "G04-duplicate-pattern-counts-once",
    "G05-unsupported-model-signal-is-discarded",
    "G06-docket-miss-is-not-fraud",
    "G07-verified-requires-cross-check",
    "G08-docket-found-cross-check-fails",
    "G09-exact-legal-quote-is-accepted",
    "G10-model-reconstructed-quote-is-quarantined",
    "G11-altered-quote-is-quarantined",
    "G12-source-mismatch-is-quarantined",
]


def _reason_values(reasons: list[RejectionReason]) -> list[str]:
    return [reason.value for reason in reasons]


def test_guardrail_suite_discovers_exactly_the_12_named_release_vectors() -> None:
    assert len(VECTORS) == 12
    assert [vector["id"] for vector in VECTORS] == EXPECTED_VECTOR_IDS


@pytest.mark.parametrize("vector", VECTORS, ids=lambda vector: vector["id"])
def test_grounding_guard_release_vector(vector: dict[str, Any]) -> None:
    vector_id: str = vector["id"]
    untrusted_input = vector["input"]
    expected = vector["expected"]

    vector_number = int(vector_id[1:3])
    if vector_number <= 8:
        # guard_and_decide calls the application's real apply_verdict_policy;
        # this is not a duplicate test-only verdict implementation.
        audit = guard_and_decide(**untrusted_input)
        assert audit.accepted_pattern_ids == expected.get("accepted_pattern_ids", [])
        if "rejected_pattern_ids" in expected:
            assert audit.rejected_pattern_ids == expected["rejected_pattern_ids"]
        if "rejection_reasons" in expected:
            assert _reason_values(audit.rejection_reasons) == expected[
                "rejection_reasons"
            ]
        assert audit.verdict.name == expected["verdict"]
        return

    result = guard_legal_passage(
        LegalPassageCandidate.model_validate(untrusted_input)
    )
    assert result.passage_accepted is expected["passage_accepted"]
    assert result.quote_accepted is expected["quote_accepted"]
    assert _reason_values(result.rejection_reasons) == expected.get(
        "rejection_reasons",
        [],
    )

    if result.passage_accepted:
        assert result.grounded_passage is not None
        assert result.grounded_passage.passage_id == untrusted_input["passage_id"]
        assert result.grounded_passage.source_url == untrusted_input["source_url"]
        if result.quote_accepted:
            assert result.grounded_passage.official_quote == untrusted_input["quote"]


def test_missing_countability_field_fails_closed_to_annotation_only() -> None:
    result = guard_patterns(
        ["future-pattern"],
        ["future-pattern"],
        corpus={"future-pattern": {"id": "future-pattern"}},
    )

    assert result.accepted_pattern_ids == []
    assert result.rejected_pattern_ids == ["future-pattern"]
    assert result.rejection_reasons == [RejectionReason.ANNOTATION_ONLY_PATTERN]


def test_stale_countability_alias_cannot_opt_a_pattern_into_the_verdict() -> None:
    result = guard_patterns(
        ["stale-pattern"],
        ["stale-pattern"],
        corpus={
            "stale-pattern": {
                "id": "stale-pattern",
                "count_toward_scam_threshold": True,
            }
        },
    )

    assert result.accepted_pattern_ids == []
    assert result.rejection_reasons == [RejectionReason.ANNOTATION_ONLY_PATTERN]


def test_g02_explicitly_cannot_confirm() -> None:
    g02 = next(vector for vector in VECTORS if vector["id"].startswith("G02-"))
    audit = guard_and_decide(**g02["input"])

    assert audit.verdict is VerdictState.CANNOT_CONFIRM
