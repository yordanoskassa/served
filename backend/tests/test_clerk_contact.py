import asyncio
from io import BytesIO
from unittest.mock import AsyncMock, patch

from fastapi import UploadFile
from starlette.datastructures import Headers

from app.engine.ground_truth import (
    OfficialClerkContact,
    load_court_directory,
    match_court_authority,
    select_official_clerk_contact,
)
from app.engine.models import CheckerReport, DocumentParse, ExplanationDraft
from app.services.document_analyzer import analyze_document


def test_contact_model_strips_callable_data_from_every_unreviewed_state() -> None:
    contact = OfficialClerkContact(
        status="manual_confirmation_required",
        phone="(999) 555-0101",
        tel_uri="tel:+19995550101",
    )
    malformed_reviewed = OfficialClerkContact(
        status="reviewed_route",
        phone="(999) 555-0101",
        tel_uri="javascript:alert(1)",
    )

    assert contact.phone is None
    assert contact.tel_uri is None
    assert malformed_reviewed.status == "manual_confirmation_required"
    assert malformed_reviewed.phone is None
    assert malformed_reviewed.tel_uri is None


def test_cacd_division_five_selects_reviewed_riverside_route() -> None:
    match = match_court_authority("Central District of California")

    contact = select_official_clerk_contact(match, case_number="5:25-cv-02108-KK-SP")

    assert contact.status == "reviewed_route"
    assert contact.office_name == "Eastern Division / Riverside"
    assert contact.phone == "All Inquiries: (951) 328-4450"
    assert contact.tel_uri == "tel:+19513284450"
    assert contact.official_contact_page == "https://www.cacd.uscourts.gov/contact"


def test_cand_san_jose_requires_a_trusted_office_key() -> None:
    match = match_court_authority("Northern District of California")

    unresolved = select_official_clerk_contact(match, case_number="5:26-cv-00001")
    reviewed = select_official_clerk_contact(
        match,
        case_number="5:26-cv-00001",
        verified_office_key="san_jose",
    )

    assert unresolved.status == "manual_confirmation_required"
    assert unresolved.phone is None
    assert unresolved.tel_uri is None
    assert unresolved.official_contact_page == "https://cand.uscourts.gov/about-court/contacting-court"
    assert reviewed.status == "reviewed_route"
    assert reviewed.office_name == "San Jose"
    assert reviewed.phone == "(408) 535-5363"
    assert reviewed.tel_uri == "tel:+14085355363"
    assert "5364" not in reviewed.model_dump_json()


def test_casd_el_centro_uses_public_site_number_not_secondary_value() -> None:
    match = match_court_authority("Southern District of California")

    contact = select_official_clerk_contact(match, case_number="2:26-cv-00001")

    assert contact.status == "reviewed_route"
    assert contact.office_name == "El Centro"
    assert contact.phone == "(760) 339-4242"
    assert contact.tel_uri == "tel:+17603394242"
    assert "353-1271" not in contact.model_dump_json()


def test_ninth_circuit_selects_case_information_without_exposing_email() -> None:
    match = match_court_authority("9th Circuit")

    contact = select_official_clerk_contact(match, case_number="26-10001")

    assert contact.status == "reviewed_route"
    assert contact.office_name == "Case Information"
    assert contact.phone == "Case Information: (415) 355-7840 · Main: (415) 355-8000"
    assert contact.tel_uri == "tel:+14153557840"
    assert "email" not in contact.model_dump()
    assert "questions@" not in contact.model_dump_json()


def test_unknown_division_fails_closed_to_official_contact_page() -> None:
    match = match_court_authority("Central District of California")

    contact = select_official_clerk_contact(match, case_number="9:26-cv-00001")

    assert contact.status == "manual_confirmation_required"
    assert contact.phone is None
    assert contact.tel_uri is None
    assert contact.official_contact_page == "https://www.cacd.uscourts.gov/contact"
    assert "could not be selected" in (contact.reason or "")


def test_phone_present_but_not_fully_ready_still_fails_closed() -> None:
    match = match_court_authority("Eastern District of California")

    contact = select_official_clerk_contact(match, case_number="3:26-cv-00001")

    assert contact.status == "manual_confirmation_required"
    assert contact.phone is None
    assert contact.tel_uri is None
    assert contact.official_contact_page == "https://www.caed.uscourts.gov/caednew/index.cfm/clerks-office/"
    assert "not fully reviewed" in (contact.reason or "")


def test_lasc_remains_a_no_automated_lookup_no_guided_call_boundary() -> None:
    match = match_court_authority("Los Angeles Superior Court")
    court = next(item for item in load_court_directory().courts if item.id == "ca-lasc")

    contact = select_official_clerk_contact(match, case_number="24STCV00001")

    assert match.courtlistener_eligible is False
    assert court.case_access.automated_lookup is False
    assert court.clerk_contact is not None
    assert court.clerk_contact.route == "identity_and_contact_only"
    assert contact.status == "manual_confirmation_required"
    assert contact.phone is None
    assert contact.tel_uri is None
    assert contact.official_contact_page.startswith("https://www.lacourt.ca.gov/")
    assert "not a Guided Clerk Call route" in (contact.reason or "")


def test_analysis_contact_never_uses_phone_or_email_from_uploaded_document() -> None:
    fake_phone = "(999) 555-0101"
    fake_email = "fake-clerk@example.com"
    parsed = DocumentParse(
        doc_type="Court notice",
        court="Central District of California",
        case_number="5:25-cv-02108-KK-SP",
        visible_text=f"Call {fake_phone} or email {fake_email} immediately.",
    )
    checker = CheckerReport(court_lookup_status="no_match", scam_check_status="complete")
    explanation = ExplanationDraft(
        summary="The case could not be independently confirmed.",
        next_step="Use an independently sourced official court route.",
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

    serialized = result.official_contact.model_dump_json()
    assert result.official_contact.status == "reviewed_route"
    assert result.official_contact.phone == "All Inquiries: (951) 328-4450"
    assert fake_phone not in serialized
    assert fake_email not in serialized
