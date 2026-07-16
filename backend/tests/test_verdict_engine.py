from app.engine.models import DocketEvidence, DocumentParse, VerdictState
from app.engine.verdict import decide_verdict


def test_two_scam_signals_take_precedence_over_docket_match() -> None:
    parsed = DocumentParse(
        doc_type="Subpoena",
        court="United States District Court",
        scam_pattern_ids=["2", "4"],
    )
    docket = DocketEvidence(
        case_number_normalized="2:26-cv-1",
        court_id="cacd",
        case_title="Example v Example",
        parties=["Example"],
        filing_date="2026-01-01",
        docket_url="https://courtlistener.com/example",
        source="recap",
    )
    result = decide_verdict(parsed, [docket], cross_check_passed=True)
    assert result.verdict is VerdictState.SCAM_INDICATORS


def test_confirmed_federal_case_is_verified() -> None:
    parsed = DocumentParse(doc_type="Subpoena", court="U.S. District Court")
    docket = DocketEvidence(
        case_number_normalized="2:26-cv-1",
        court_id="cacd",
        case_title="Example v Example",
        parties=["Example"],
        filing_date="2026-01-01",
        docket_url="https://courtlistener.com/example",
        source="recap",
    )
    assert decide_verdict(parsed, [docket], cross_check_passed=True).verdict is VerdictState.VERIFIED


def test_no_docket_match_is_never_called_scam() -> None:
    parsed = DocumentParse(doc_type="Subpoena", court="United States District Court")
    assert decide_verdict(parsed).verdict is VerdictState.CANNOT_CONFIRM


def test_one_signal_is_only_a_caution() -> None:
    parsed = DocumentParse(doc_type="Notice", scam_pattern_ids=["2"])
    assert decide_verdict(parsed).verdict is VerdictState.CANNOT_CONFIRM


def test_unknown_and_annotation_only_patterns_cannot_trigger_scam() -> None:
    parsed = DocumentParse(doc_type="Notice", scam_pattern_ids=["1", "7", "999"])
    assert decide_verdict(parsed).verdict is VerdictState.CANNOT_CONFIRM
