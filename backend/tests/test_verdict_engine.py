from app.engine.models import CheckerReport, DocketEvidence, DocumentParse, ScamSignal, VerdictState
from app.engine.verdict import decide_verdict


def docket() -> DocketEvidence:
    return DocketEvidence(
        case_number_normalized="5:25-cv-02108",
        court_id="cacd",
        case_title="Barnes v. Maximus Consulting Services",
        parties=["Audrea Barnes", "Maximus Consulting Services"],
        filing_date="2025-01-01",
        docket_url="https://courtlistener.com/example",
        source="recap",
    )


def signal(pattern_id: str) -> ScamSignal:
    return ScamSignal(pattern_id=pattern_id, document_excerpt=f"exact excerpt {pattern_id}")


def test_two_scam_signals_take_precedence_over_case_match() -> None:
    parsed = DocumentParse(doc_type="Subpoena", court="United States District Court")
    checker = CheckerReport(
        docket_evidence=[docket()],
        case_found=True,
        parties_match=True,
        court_lookup_status="match",
        scam_signals=[signal("2"), signal("6")],
        scam_check_status="complete",
    )
    assert decide_verdict(parsed, checker).verdict is VerdictState.SCAM


def test_case_found_and_parties_match_is_verified() -> None:
    parsed = DocumentParse(doc_type="Subpoena", court="U.S. District Court")
    checker = CheckerReport(
        docket_evidence=[docket()],
        case_found=True,
        parties_match=True,
        court_lookup_status="match",
        scam_check_status="complete",
    )
    assert decide_verdict(parsed, checker).verdict is VerdictState.VERIFIED


def test_case_and_party_match_fails_closed_when_scam_check_is_unavailable() -> None:
    parsed = DocumentParse(doc_type="Subpoena", court="U.S. District Court")
    checker = CheckerReport(
        docket_evidence=[docket()],
        case_found=True,
        parties_match=True,
        court_lookup_status="match",
        scam_check_status="unavailable",
    )

    assert decide_verdict(parsed, checker).verdict is VerdictState.CANNOT_CONFIRM


def test_case_and_party_flags_fail_closed_without_a_completed_court_match() -> None:
    parsed = DocumentParse(doc_type="Subpoena", court="U.S. District Court")
    checker = CheckerReport(
        docket_evidence=[docket()],
        case_found=True,
        parties_match=True,
        court_lookup_status="unavailable",
        scam_check_status="complete",
    )

    assert decide_verdict(parsed, checker).verdict is VerdictState.CANNOT_CONFIRM


def test_case_found_without_party_match_cannot_confirm() -> None:
    parsed = DocumentParse(doc_type="Subpoena")
    checker = CheckerReport(
        docket_evidence=[docket()],
        case_found=True,
        parties_match=False,
        court_lookup_status="no_match",
        scam_check_status="complete",
    )
    assert decide_verdict(parsed, checker).verdict is VerdictState.CANNOT_CONFIRM


def test_no_docket_match_is_never_called_scam() -> None:
    parsed = DocumentParse(doc_type="Subpoena")
    assert decide_verdict(parsed, CheckerReport()).verdict is VerdictState.CANNOT_CONFIRM


def test_one_signal_is_cannot_confirm() -> None:
    parsed = DocumentParse(doc_type="Notice")
    checker = CheckerReport(scam_signals=[signal("2")], scam_check_status="complete")
    assert decide_verdict(parsed, checker).verdict is VerdictState.CANNOT_CONFIRM


def test_one_signal_does_not_block_a_case_and_party_match() -> None:
    parsed = DocumentParse(doc_type="Notice")
    checker = CheckerReport(
        docket_evidence=[docket()],
        case_found=True,
        parties_match=True,
        court_lookup_status="match",
        scam_signals=[signal("2")],
        scam_check_status="complete",
    )
    assert decide_verdict(parsed, checker).verdict is VerdictState.VERIFIED


def test_duplicate_signal_ids_count_once() -> None:
    parsed = DocumentParse(doc_type="Notice")
    checker = CheckerReport(
        scam_signals=[signal("2"), signal("2")],
        scam_check_status="complete",
    )
    assert decide_verdict(parsed, checker).verdict is VerdictState.CANNOT_CONFIRM


def test_unknown_patterns_cannot_trigger_scam() -> None:
    parsed = DocumentParse(doc_type="Notice")
    checker = CheckerReport(
        scam_signals=[signal("998"), signal("999")],
        scam_check_status="complete",
    )
    assert decide_verdict(parsed, checker).verdict is VerdictState.CANNOT_CONFIRM
