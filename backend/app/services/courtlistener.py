import re

import httpx

from app.config import settings
from app.engine.models import DocketEvidence, DocumentParse

SEARCH_URL = "https://www.courtlistener.com/api/rest/v4/search/"
CORP_SUFFIXES = {"inc", "llc", "corp", "corporation", "co", "company", "services"}
STATE_ABBREVIATIONS = {
    "alabama": "al",
    "alaska": "ak",
    "arizona": "az",
    "arkansas": "ar",
    "california": "ca",
    "colorado": "co",
    "connecticut": "ct",
    "delaware": "de",
    "florida": "fl",
    "georgia": "ga",
    "hawaii": "hi",
    "idaho": "id",
    "illinois": "il",
    "indiana": "in",
    "iowa": "ia",
    "kansas": "ks",
    "kentucky": "ky",
    "louisiana": "la",
    "maine": "me",
    "maryland": "md",
    "massachusetts": "ma",
    "michigan": "mi",
    "minnesota": "mn",
    "mississippi": "ms",
    "missouri": "mo",
    "montana": "mt",
    "nebraska": "ne",
    "nevada": "nv",
    "new hampshire": "nh",
    "new jersey": "nj",
    "new mexico": "nm",
    "new york": "ny",
    "north carolina": "nc",
    "north dakota": "nd",
    "ohio": "oh",
    "oklahoma": "ok",
    "oregon": "or",
    "pennsylvania": "pa",
    "rhode island": "ri",
    "south carolina": "sc",
    "south dakota": "sd",
    "tennessee": "tn",
    "texas": "tx",
    "utah": "ut",
    "vermont": "vt",
    "virginia": "va",
    "washington": "wa",
    "west virginia": "wv",
    "wisconsin": "wi",
    "wyoming": "wy",
}
SINGLE_DISTRICT_STATES = {
    "alaska", "arizona", "colorado", "connecticut", "delaware", "hawaii",
    "idaho", "kansas", "maine", "maryland", "massachusetts", "minnesota",
    "montana", "nebraska", "nevada", "new hampshire", "new jersey",
    "new mexico", "north dakota", "oregon", "rhode island", "south carolina",
    "south dakota", "utah", "vermont", "wyoming",
}
DISTRICT_DIRECTIONS = {
    "central": "c",
    "eastern": "e",
    "middle": "m",
    "northern": "n",
    "southern": "s",
    "western": "w",
}
FEDERAL_DOCKET = re.compile(
    r"(?P<division>\d+):(?P<year>\d{2,4})-(?P<kind>[a-z]{2,4})-(?P<serial>\d+)",
    re.I,
)


def normalize_case_number(value: str) -> str:
    federal = FEDERAL_DOCKET.search(value)
    if federal:
        # CourtListener commonly stores the core federal docket number without
        # judge/magistrate suffixes printed on filings (for example -KK-SP).
        return "".join(federal.group("division", "year", "kind", "serial"))
    return re.sub(r"[^a-z0-9]", "", value.lower()).lstrip("0")


def courtlistener_case_number(value: str) -> str:
    """Strip filing-only judge suffixes while preserving CourtListener punctuation."""
    federal = FEDERAL_DOCKET.search(value)
    if not federal:
        return value
    return (
        f"{federal.group('division')}:{federal.group('year')}-"
        f"{federal.group('kind').lower()}-{federal.group('serial')}"
    )


def _tokens(value: str) -> set[str]:
    return {
        token for token in re.findall(r"[a-z0-9]+", value.lower())
        if len(token) > 2 and token not in CORP_SUFFIXES
    }


def _expected_court_id(claimed_court: str | None) -> str | None:
    """Derive CourtListener's federal district ID when the claim is specific."""
    if not claimed_court:
        return None
    normalized = " ".join(re.findall(r"[a-z]+", claimed_court.lower()))
    if "district" not in normalized or "court of appeals" in normalized:
        return None
    if "district of columbia" in normalized:
        return "dcd"
    territories = {
        "northern mariana islands": "nmid",
        "puerto rico": "prd",
        "virgin islands": "vid",
        "guam": "gud",
    }
    for name, court_id in territories.items():
        if name in normalized:
            return court_id
    state = next(
        (
            name
            for name in sorted(STATE_ABBREVIATIONS, key=len, reverse=True)
            if name in normalized
        ),
        None,
    )
    if not state:
        return None
    abbreviation = STATE_ABBREVIATIONS[state]
    direction = next(
        (code for name, code in DISTRICT_DIRECTIONS.items() if name in normalized),
        None,
    )
    if direction:
        return f"{abbreviation}{direction}d"
    if state in SINGLE_DISTRICT_STATES:
        return f"{abbreviation}d"
    # A multi-district state named without a direction is too ambiguous to filter.
    return None


def _court_matches_claim(claimed_court: str | None, candidate_court_id: str) -> bool:
    expected = _expected_court_id(claimed_court)
    return expected is None or candidate_court_id.strip().lower() == expected


def _candidate_party_tokens(case_name: str, parties: list[str]) -> list[set[str]]:
    caption_sides = re.split(r"\s+(?:v\.?|vs\.?|versus)\s+", case_name, flags=re.I)
    candidates = [_tokens(value) for value in [*caption_sides, *parties]]
    candidates = [tokens for tokens in candidates if tokens]
    # Prefer a full party name to a duplicated surname-only party entry.
    return [
        tokens
        for index, tokens in enumerate(candidates)
        if not any(
            tokens < other
            for other_index, other in enumerate(candidates)
            if index != other_index
        )
    ]


def _party_match_score(expected: set[str], candidate: set[str]) -> int:
    # One side may be abbreviated ("Barnes" for "Audrea Barnes"), but partial
    # cross-name overlap ("John Smith" vs. "Jane Smith") is not a match.
    if expected <= candidate or candidate <= expected:
        return len(expected & candidate)
    return 0


def _party_overlap(expected: list[str], case_name: str, parties: list[str]) -> bool:
    expected_parties = [tokens for name in expected if (tokens := _tokens(name))]
    candidate_parties = _candidate_party_tokens(case_name, parties)
    if not expected_parties or len(candidate_parties) < len(expected_parties):
        return False

    def best_assignment(index: int, used: frozenset[int]) -> int:
        if index == len(expected_parties):
            return 0
        best = -1
        for candidate_index, candidate in enumerate(candidate_parties):
            if candidate_index in used:
                continue
            score = _party_match_score(expected_parties[index], candidate)
            if score:
                remainder = best_assignment(index + 1, used | {candidate_index})
                if remainder >= 0:
                    best = max(best, score + remainder)
        return best

    # Every caption side must match a distinct candidate, with at least two
    # distinctive tokens overall. This preserves "Barnes v. Maximus" while a
    # single common surname remains insufficient.
    return best_assignment(0, frozenset()) >= 2


def _edit_distance(left: str, right: str) -> int:
    if len(left) < len(right):
        left, right = right, left
    previous = list(range(len(right) + 1))
    for left_index, left_character in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_character in enumerate(right, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[right_index] + 1,
                    previous[right_index - 1] + (left_character != right_character),
                )
            )
        previous = current
    return previous[-1]


def _nearest_party_match(
    parsed: DocumentParse,
    candidates: list[DocketEvidence],
) -> DocketEvidence | None:
    target = normalize_case_number(parsed.case_number or "")
    near_candidates: list[tuple[int, str, DocketEvidence]] = []
    for candidate in candidates:
        candidate_number = normalize_case_number(candidate.case_number_normalized)
        distance = _edit_distance(target, candidate_number)
        if (
            target
            and candidate_number
            and distance <= 2
            and _court_matches_claim(parsed.court, candidate.court_id)
            and _party_overlap(parsed.parties, candidate.case_title, candidate.parties)
        ):
            near_candidates.append((distance, candidate_number, candidate))
    near_candidates.sort(key=lambda item: (item[0], item[1]))
    return near_candidates[0][2] if near_candidates else None


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
            params={"type": "d", "docket_number": courtlistener_case_number(parsed.case_number)},
            headers=headers,
        )
        response.raise_for_status()
        exact_candidates = [
            evidence
            for item in response.json().get("results", [])
            if (evidence := _evidence(item))
            and _court_matches_claim(parsed.court, evidence.court_id)
        ]
        target = normalize_case_number(parsed.case_number)
        exact = [e for e in exact_candidates if normalize_case_number(e.case_number_normalized) == target]
        for candidate in exact:
            if _party_overlap(parsed.parties, candidate.case_title, candidate.parties):
                return [candidate], True, None
        if exact:
            # The case number exists, but that is not enough to verify it. Keep
            # the record so CHECKER can report case_found=true and parties_match=false.
            return exact, False, None

        party_query = next((party for party in parsed.parties if len(_tokens(party)) >= 1), None)
        if not party_query:
            return [], False, None
        near_response = await client.get(
            SEARCH_URL,
            params={"type": "d", "case_name": party_query},
            headers=headers,
        )
        near_response.raise_for_status()
        candidates = [
            evidence
            for item in near_response.json().get("results", [])
            if (evidence := _evidence(item))
        ]
        if near_match := _nearest_party_match(parsed, candidates):
            return [], False, near_match
    return [], False, None
