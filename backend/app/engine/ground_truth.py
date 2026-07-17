"""Deterministic access to Served's versioned ground-truth corpora."""

from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from hashlib import sha256
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.engine.models import CheckerReport, DocumentParse, Tier


CORPUS_DIR = Path(__file__).resolve().parents[1] / "corpus"


class CorpusModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class CourtCaseAccess(CorpusModel):
    prototype_provider: str
    courtlistener_court_id: str | None = None
    automated_lookup: bool = False


class CourtEntry(CorpusModel):
    id: str
    tier: Literal["federal", "federal_appellate", "state"]
    canonical_name: str
    display_name: str
    aliases: list[str] = Field(default_factory=list)
    official_website: str
    official_domains: list[str] = Field(default_factory=list)
    case_access: CourtCaseAccess


class FictitiousAuthority(CorpusModel):
    id: str
    canonical_fixture_name: str
    aliases: list[str] = Field(default_factory=list)
    route: Literal["none"] = "none"
    match_outcome: Literal["UNKNOWN_AUTHORITY"] = "UNKNOWN_AUTHORITY"


class CourtDirectoryCorpus(CorpusModel):
    schema_version: str
    verified_on: str
    courts: list[CourtEntry]
    fixture_only_fictitious_authorities: list[FictitiousAuthority] = Field(default_factory=list)


class CourtDirectoryMatch(BaseModel):
    query: str | None
    normalized_query: str
    outcome: Literal[
        "OFFICIAL_COURT",
        "NAME_MISMATCH",
        "UNKNOWN_AUTHORITY",
    ]
    tier: Tier
    court_id: str | None = None
    canonical_name: str | None = None
    display_name: str | None = None
    official_website: str | None = None
    courtlistener_court_id: str | None = None
    automated_lookup: bool = False
    known_fixture_authority: bool = False
    verified_on: str

    @property
    def courtlistener_eligible(self) -> bool:
        return (
            self.outcome == "OFFICIAL_COURT"
            and self.tier in {Tier.FEDERAL, Tier.FEDERAL_APPELLATE}
            and self.automated_lookup
            and bool(self.courtlistener_court_id)
        )


class LegalPassage(CorpusModel):
    id: str
    topic: Literal["subpoena", "wage_garnishment"]
    title: str
    authority: str
    source_name: str
    source_url: str
    source_locator: str
    official_quote: str = ""
    plain_language: str
    use_when: list[str] = Field(default_factory=list)
    do_not_infer: str
    human_help_trigger: bool = True
    verdict_signal: bool = False


class LegalPassageCorpus(CorpusModel):
    schema_version: str
    verified_on: str
    global_guardrails: list[str] = Field(default_factory=list)
    passages: list[LegalPassage]


def _read_json(filename: str) -> object:
    return json.loads((CORPUS_DIR / filename).read_text(encoding="utf-8"))


@lru_cache
def load_court_directory() -> CourtDirectoryCorpus:
    corpus = CourtDirectoryCorpus.model_validate(_read_json("court-directory-seed.json"))
    court_ids = [court.id for court in corpus.courts]
    if len(court_ids) != len(set(court_ids)):
        raise ValueError("Court directory contains duplicate court IDs")
    return corpus


@lru_cache
def load_legal_passages() -> dict[str, LegalPassage]:
    corpus = LegalPassageCorpus.model_validate(_read_json("legal-passages.json"))
    passage_ids = [passage.id for passage in corpus.passages]
    if len(passage_ids) != len(set(passage_ids)):
        raise ValueError("Legal passage corpus contains duplicate passage IDs")
    if any(passage.verdict_signal for passage in corpus.passages):
        raise ValueError("Legal passages must never be verdict signals")
    return {passage.id: passage for passage in corpus.passages}


@lru_cache
def legal_passage_corpus() -> LegalPassageCorpus:
    return LegalPassageCorpus.model_validate(_read_json("legal-passages.json"))


def corpus_file_version(filename: str) -> str:
    digest = sha256((CORPUS_DIR / filename).read_bytes()).hexdigest()[:16]
    return f"sha256:{digest}"


def ground_truth_corpus_versions() -> dict[str, str]:
    return {
        "court_directory": corpus_file_version("court-directory-seed.json"),
        "ftc_patterns": corpus_file_version("ftc-patterns.json"),
        "legal_passages": corpus_file_version("legal-passages.json"),
    }


def normalize_court_name(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).lower().replace("&", " and ")
    value = "".join(
        character
        for character in value
        if character == "-" or not unicodedata.category(character).startswith("P")
    )
    return re.sub(r"\s+", " ", value).strip()


@lru_cache
def _official_court_names() -> dict[str, CourtEntry]:
    names: dict[str, CourtEntry] = {}
    for court in load_court_directory().courts:
        for name in [court.canonical_name, *court.aliases]:
            normalized = normalize_court_name(name)
            if normalized in names and names[normalized].id != court.id:
                raise ValueError(f"Court alias collision: {name}")
            names[normalized] = court
    return names


def _tier(value: str) -> Tier:
    return {
        "federal": Tier.FEDERAL,
        "federal_appellate": Tier.FEDERAL_APPELLATE,
        "state": Tier.STATE,
    }.get(value, Tier.NONE)


def match_court_authority(query: str | None) -> CourtDirectoryMatch:
    corpus = load_court_directory()
    normalized = normalize_court_name(query or "")
    if normalized and (court := _official_court_names().get(normalized)):
        return CourtDirectoryMatch(
            query=query,
            normalized_query=normalized,
            outcome="OFFICIAL_COURT",
            tier=_tier(court.tier),
            court_id=court.id,
            canonical_name=court.canonical_name,
            display_name=court.display_name,
            official_website=court.official_website,
            courtlistener_court_id=court.case_access.courtlistener_court_id,
            automated_lookup=court.case_access.automated_lookup,
            verified_on=corpus.verified_on,
        )

    for authority in corpus.fixture_only_fictitious_authorities:
        fixture_names = [authority.canonical_fixture_name, *authority.aliases]
        if normalized and normalized in {normalize_court_name(name) for name in fixture_names}:
            return CourtDirectoryMatch(
                query=query,
                normalized_query=normalized,
                outcome="UNKNOWN_AUTHORITY",
                tier=Tier.NONE,
                known_fixture_authority=True,
                verified_on=corpus.verified_on,
            )

    # The corpus intentionally defines no fuzzy threshold. Until one is
    # approved, every non-exact name remains UNKNOWN_AUTHORITY.
    return CourtDirectoryMatch(
        query=query,
        normalized_query=normalized,
        outcome="UNKNOWN_AUTHORITY",
        tier=Tier.NONE,
        verified_on=corpus.verified_on,
    )


@lru_cache
def official_court_domains() -> set[str]:
    return {
        domain.lower().strip(".")
        for court in load_court_directory().courts
        for domain in court.official_domains
    }


def select_legal_passage_ids(
    parsed: DocumentParse,
    checker: CheckerReport,
) -> list[str]:
    """Select only passages whose corpus guardrails are supported by run facts."""
    text = " ".join([
        parsed.doc_type,
        *parsed.demands,
        parsed.visible_text,
    ]).lower()
    selected: list[str] = []

    if "subpoena" in text:
        selected.append("frcp45-required-contents")
        if checker.case_found and parsed.demands:
            selected.append("frcp45-contempt-risk")
        if re.search(r"\b(?:privilege|confidential|undue burden)\b", text):
            selected.append("frcp45-quash-or-modify")

    if re.search(r"\b(?:wage garnishment|garnish(?:ment|ing)?|withhold(?:ing)? wages?)\b", text):
        selected.append("ccpa-disposable-earnings-definition")
        exception = re.search(r"\b(?:child support|alimony|bankruptcy|tax debt|tax levy)\b", text)
        selected.append(
            "ccpa-garnishment-exceptions"
            if exception
            else "ccpa-ordinary-garnishment-limit"
        )
        if re.search(r"\b(?:fired|fire|termination|terminate|job loss)\b", text):
            selected.append("ccpa-protection-from-discharge")

    return list(dict.fromkeys(selected))


def ground_legal_passages(passage_ids: list[str]) -> list[LegalPassage]:
    """Grounding Guard: allowlist IDs and preserve corpus text byte-for-byte."""
    known = load_legal_passages()
    return [
        known[passage_id]
        for passage_id in dict.fromkeys(passage_ids)
        if passage_id in known
    ]
