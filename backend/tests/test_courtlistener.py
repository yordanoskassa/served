from app.engine.models import DocketEvidence, DocumentParse
from app.services.courtlistener import (
    _court_matches_claim,
    _edit_distance,
    _nearest_party_match,
    _party_overlap,
    courtlistener_case_number,
    normalize_case_number,
)


def test_federal_judge_suffix_does_not_change_the_case_number() -> None:
    assert normalize_case_number("5:25-cv-02108-KK-SP") == normalize_case_number(
        "5:25-cv-02108"
    )
    assert courtlistener_case_number("5:25-cv-02108-KK-SP") == "5:25-cv-02108"


def test_altered_federal_serial_number_stays_different() -> None:
    assert normalize_case_number("5:25-cv-92108-KK-SP") != normalize_case_number(
        "5:25-cv-02108"
    )


def test_party_match_requires_all_caption_sides_and_multiple_tokens() -> None:
    expected = ["Audrea Barnes", "Maximus Consulting Services, Inc."]
    assert _party_overlap(expected, "Barnes v. Maximus Consulting Services", [])
    assert not _party_overlap(expected, "Barnes v. Different Company", [])
    assert not _party_overlap(["Audrea Barnes"], "Barnes v. Someone", [])


def test_party_match_rejects_conflicting_first_name() -> None:
    expected = ["John Smith", "Acme LLC"]
    assert not _party_overlap(expected, "Jane Smith v. Acme Inc.", [])
    assert not _party_overlap(expected, "Jane Smith v. Acme Inc.", ["Smith"])


def test_claimed_federal_district_filters_wrong_court() -> None:
    claimed = "United States District Court, Central District of California"
    assert _court_matches_claim(claimed, "cacd")
    assert not _court_matches_claim(claimed, "nysd")
    # A generic district-court claim is not specific enough to filter safely.
    assert _court_matches_claim("United States District Court", "nysd")
    assert not _court_matches_claim(None, "nysd", "cacd")
    assert _court_matches_claim(None, "cacd", "cacd")


def _docket(number: str, *, court_id: str = "cacd") -> DocketEvidence:
    return DocketEvidence(
        case_number_normalized=number,
        court_id=court_id,
        case_title="Barnes v. Maximus Consulting Services",
        parties=[],
        filing_date="2025-01-01",
        docket_url="https://www.courtlistener.com/example",
        source="recap",
    )


def test_near_match_is_close_sorted_and_in_claimed_court() -> None:
    parsed = DocumentParse(
        doc_type="Federal filing",
        court="United States District Court, Central District of California",
        case_number="5:25-cv-92108-KK-SP",
        parties=["Audrea Barnes", "Maximus Consulting Services, Inc."],
    )
    distance_two = _docket("5:25-cv-00108")
    d1_distance_one = _docket("5:25-cv-02108")
    wrong_court = _docket("5:25-cv-92109", court_id="nysd")
    far = _docket("1:99-cr-55555")

    assert _edit_distance(
        normalize_case_number(parsed.case_number or ""),
        normalize_case_number(d1_distance_one.case_number_normalized),
    ) == 1
    assert _nearest_party_match(
        parsed,
        [distance_two, far, wrong_court, d1_distance_one],
    ) == d1_distance_one


def test_near_match_rejects_numbers_more_than_two_edits_away() -> None:
    parsed = DocumentParse(
        doc_type="Federal filing",
        court="United States District Court, Central District of California",
        case_number="5:25-cv-92108",
        parties=["Audrea Barnes", "Maximus Consulting Services, Inc."],
    )
    assert _nearest_party_match(parsed, [_docket("1:99-cr-55555")]) is None
