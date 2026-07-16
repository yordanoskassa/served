import re

import httpx

from app.config import settings
from app.engine.models import DocketEvidence, DocumentParse

SEARCH_URL = "https://www.courtlistener.com/api/rest/v4/search/"
CORP_SUFFIXES = {"inc", "llc", "corp", "corporation", "co", "company", "services"}


def normalize_case_number(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower()).lstrip("0")


def _tokens(value: str) -> set[str]:
    return {
        token for token in re.findall(r"[a-z0-9]+", value.lower())
        if len(token) > 2 and token not in CORP_SUFFIXES
    }


def _party_overlap(expected: list[str], case_name: str, parties: list[str]) -> bool:
    haystack = _tokens(" ".join([case_name, *parties]))
    return any(bool(_tokens(name) & haystack) for name in expected)


def _evidence(item: dict) -> DocketEvidence | None:
    number = str(item.get("docketNumber") or item.get("docket_number") or "")
    court_id = str(item.get("court_id") or item.get("court") or "")
    title = str(item.get("caseName") or item.get("case_name") or "")
    if not number or not court_id or not title:
        return None
    absolute_url = str(item.get("absolute_url") or item.get("resource_uri") or "")
    if absolute_url.startswith("/"):
        absolute_url = f"https://www.courtlistener.com{absolute_url}"
    parties = item.get("party") or item.get("parties") or []
    if isinstance(parties, str):
        parties = [parties]
    return DocketEvidence(
        case_number_normalized=number,
        court_id=court_id,
        case_title=title,
        parties=[str(p) for p in parties],
        filing_date=str(item.get("dateFiled") or item.get("date_filed") or "unknown"),
        docket_url=absolute_url or "https://www.courtlistener.com/",
        source="recap",
    )


async def lookup_docket(parsed: DocumentParse) -> tuple[list[DocketEvidence], bool, DocketEvidence | None]:
    if not settings.courtlistener_api_token or not parsed.case_number:
        return [], False, None
    headers = {"Authorization": f"Token {settings.courtlistener_api_token}"}
    async with httpx.AsyncClient(timeout=12) as client:
        response = await client.get(
            SEARCH_URL,
            params={"type": "d", "docket_number": parsed.case_number},
            headers=headers,
        )
        response.raise_for_status()
        exact_candidates = [e for item in response.json().get("results", []) if (e := _evidence(item))]
        target = normalize_case_number(parsed.case_number)
        exact = [e for e in exact_candidates if normalize_case_number(e.case_number_normalized) == target]
        for candidate in exact:
            if _party_overlap(parsed.parties, candidate.case_title, candidate.parties):
                return [candidate], True, None

        party_query = next((party for party in parsed.parties if len(_tokens(party)) >= 1), None)
        if not party_query:
            return [], False, None
        near_response = await client.get(
            SEARCH_URL,
            params={"type": "d", "case_name": party_query},
            headers=headers,
        )
        near_response.raise_for_status()
        for item in near_response.json().get("results", []):
            candidate = _evidence(item)
            if candidate and _party_overlap(parsed.parties, candidate.case_title, candidate.parties):
                return [], False, candidate
    return [], False, None
