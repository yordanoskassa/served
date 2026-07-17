from app.engine.fraud_patterns import FraudPattern, load_fraud_patterns
from app.engine.ground_truth import (
    ground_legal_passages,
    ground_truth_corpus_versions,
    load_court_directory,
    load_legal_passages,
    match_court_authority,
    normalize_court_name,
    select_legal_passage_ids,
)
from app.engine.models import CheckerReport, DocumentParse, Tier
from app.services import document_analyzer


def test_every_seeded_court_alias_routes_only_by_exact_normalized_match() -> None:
    corpus = load_court_directory()
    for court in corpus.courts:
        for name in [court.canonical_name, *court.aliases]:
            match = match_court_authority(name)
            assert match.outcome == "OFFICIAL_COURT"
            assert match.court_id == court.id
            assert match.normalized_query == normalize_court_name(name)


def test_seed_routes_ninth_circuit_and_keeps_state_manual() -> None:
    ninth = match_court_authority("9th Circuit")
    assert ninth.tier is Tier.FEDERAL_APPELLATE
    assert ninth.courtlistener_court_id == "ca9"
    assert ninth.courtlistener_eligible is True

    lasc = match_court_authority("Los Angeles Superior Court")
    assert lasc.tier is Tier.STATE
    assert lasc.courtlistener_eligible is False


def test_unknown_and_fixture_authorities_are_annotation_only() -> None:
    unknown = match_court_authority("United States District Court for Somewhere Else")
    assert unknown.outcome == "UNKNOWN_AUTHORITY"
    assert unknown.tier is Tier.NONE
    assert unknown.courtlistener_eligible is False

    fixture = match_court_authority("Federal Legal Processing Bureau")
    assert fixture.outcome == "UNKNOWN_AUTHORITY"
    assert fixture.known_fixture_authority is True
    assert fixture.courtlistener_eligible is False


def test_unknown_authority_never_reaches_courtlistener() -> None:
    parsed = DocumentParse(
        doc_type="Court notice",
        court="Federal Court Payment Bureau",
        case_number="2:26-cv-00001",
    )
    lookup = AsyncMock()
    with (
        patch.object(document_analyzer.settings, "courtlistener_api_token", "test-token"),
        patch.object(document_analyzer, "lookup_docket", lookup),
    ):
        result = asyncio.run(document_analyzer._courtlistener_branch(parsed, None))

    assert result.status == "not_applicable"
    lookup.assert_not_awaited()


def test_latest_ftc_countability_flags_are_loaded_from_corpus() -> None:
    patterns = load_fraud_patterns()
    assert patterns["1"].counts_toward_verdict is False
    assert patterns["7"].counts_toward_verdict is False
    assert patterns["8"].counts_toward_verdict is True
    assert patterns["9"].counts_toward_verdict is True


def test_missing_countability_field_fails_closed() -> None:
    pattern = FraudPattern.model_validate({
        "id": "future",
        "title": "Future annotation",
        "description": "No reviewed countability decision yet.",
        "detection_hint": "Do not count by default.",
        "source_name": "Official source",
        "source_url": "https://example.gov/source",
        "official_quote": "",
    })

    assert pattern.counts_toward_verdict is False


def test_grounding_guard_quarantines_unknown_and_duplicate_passages() -> None:
    grounded = ground_legal_passages([
        "ccpa-disposable-earnings-definition",
        "not-in-the-corpus",
        "ccpa-disposable-earnings-definition",
    ])
    assert [passage.id for passage in grounded] == ["ccpa-disposable-earnings-definition"]
    canonical = load_legal_passages()["ccpa-disposable-earnings-definition"]
    assert grounded[0].official_quote == canonical.official_quote


def test_legal_selection_requires_supported_document_facts() -> None:
    unrelated = DocumentParse(doc_type="Court filing", visible_text="Case caption only")
    assert select_legal_passage_ids(unrelated, CheckerReport()) == []

    garnishment = DocumentParse(
        doc_type="Wage garnishment notice",
        visible_text="An ordinary consumer debt may cause withholding from wages.",
    )
    assert select_legal_passage_ids(garnishment, CheckerReport()) == [
        "ccpa-disposable-earnings-definition",
        "ccpa-ordinary-garnishment-limit",
    ]


def test_all_three_corpus_hashes_are_available_for_trace_provenance() -> None:
    versions = ground_truth_corpus_versions()
    assert set(versions) == {"court_directory", "ftc_patterns", "legal_passages"}
    assert all(value.startswith("sha256:") for value in versions.values())
import asyncio
from unittest.mock import AsyncMock, patch
