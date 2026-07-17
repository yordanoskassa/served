"""Deterministic allowlist and grounding checks for untrusted agent claims.

This module deliberately contains no model calls.  It accepts structured claims,
checks them against the versioned corpora, records stable rejection reasons, and
only then invokes the application's existing code-owned verdict policy.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.engine.fraud_patterns import FraudPattern, load_fraud_patterns
from app.engine.ground_truth import (
    ground_truth_corpus_versions,
    load_legal_passages,
)
from app.engine.models import CheckerReport, ScamSignal, VerdictState


class GuardModel(BaseModel):
    """Immutable, strict model used for every guard input and result."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class RejectionReason(StrEnum):
    SCHEMA_INVALID = "SCHEMA_INVALID"
    UNKNOWN_AUTHORITY = "UNKNOWN_AUTHORITY"
    UNKNOWN_PATTERN_ID = "UNKNOWN_PATTERN_ID"
    PATTERN_NOT_SUPPORTED_BY_DOCUMENT = "PATTERN_NOT_SUPPORTED_BY_DOCUMENT"
    ANNOTATION_ONLY_PATTERN = "ANNOTATION_ONLY_PATTERN"
    DOCKET_CROSS_CHECK_FAILED = "DOCKET_CROSS_CHECK_FAILED"
    UNKNOWN_PASSAGE_ID = "UNKNOWN_PASSAGE_ID"
    EMPTY_OFFICIAL_QUOTE = "EMPTY_OFFICIAL_QUOTE"
    QUOTE_MISMATCH = "QUOTE_MISMATCH"
    SOURCE_MISMATCH = "SOURCE_MISMATCH"
    UNSUPPORTED_LEGAL_CLAIM = "UNSUPPORTED_LEGAL_CLAIM"


class QuarantinedClaim(GuardModel):
    reason: RejectionReason
    value: str
    claim_type: Literal[
        "authority",
        "fraud_pattern",
        "docket",
        "legal_passage",
        "legal_quote",
        "source",
        "legal_claim",
        "schema",
    ]


class PatternGuardResult(GuardModel):
    accepted_pattern_ids: list[str] = Field(default_factory=list)
    rejected_pattern_ids: list[str] = Field(default_factory=list)
    quarantined_claims: list[QuarantinedClaim] = Field(default_factory=list)

    @property
    def rejection_reasons(self) -> list[RejectionReason]:
        return list(dict.fromkeys(claim.reason for claim in self.quarantined_claims))


class LegalPassageCandidate(GuardModel):
    passage_id: str
    quote: str | None = None
    source_url: str
    source_name: str | None = None


class GroundedLegalPassage(GuardModel):
    passage_id: str
    source_name: str
    source_url: str
    official_quote: str | None = None


class LegalPassageGuardResult(GuardModel):
    passage_id: str
    passage_accepted: bool = False
    quote_accepted: bool = False
    grounded_passage: GroundedLegalPassage | None = None
    quarantined_claims: list[QuarantinedClaim] = Field(default_factory=list)

    @property
    def accepted_passage_ids(self) -> list[str]:
        return [self.passage_id] if self.passage_accepted else []

    @property
    def rejection_reasons(self) -> list[RejectionReason]:
        return list(dict.fromkeys(claim.reason for claim in self.quarantined_claims))


class GroundingAudit(GuardModel):
    """Machine-readable record for the verdict boundary."""

    accepted: bool = True
    verdict: VerdictState
    accepted_pattern_ids: list[str] = Field(default_factory=list)
    rejected_pattern_ids: list[str] = Field(default_factory=list)
    accepted_passage_ids: list[str] = Field(default_factory=list)
    quarantined_claims: list[QuarantinedClaim] = Field(default_factory=list)
    human_review_required: bool
    corpus_versions: dict[str, str] = Field(default_factory=dict)

    @property
    def rejection_reasons(self) -> list[RejectionReason]:
        return list(dict.fromkeys(claim.reason for claim in self.quarantined_claims))


PatternRecord = FraudPattern | Mapping[str, Any]


def _counts_toward_verdict(pattern: PatternRecord) -> bool:
    """Return true only for an explicit boolean corpus opt-in.

    The mapping branch supports validation before a corpus record has been
    parsed.  A missing field, stale alias, ``null``, string, integer, or other
    truthy value therefore fails closed as annotation-only.
    """

    if isinstance(pattern, Mapping):
        value = pattern.get("counts_toward_verdict", False)
    else:
        value = getattr(pattern, "counts_toward_verdict", False)
    return value is True


def guard_patterns(
    candidate_ids: Sequence[str],
    affirmatively_supported_ids: Sequence[str],
    *,
    corpus: Mapping[str, PatternRecord] | None = None,
) -> PatternGuardResult:
    """Allow only unique, supported, explicitly countable fraud patterns."""

    known: Mapping[str, PatternRecord] = (
        load_fraud_patterns() if corpus is None else corpus
    )
    supported = set(affirmatively_supported_ids)
    accepted: list[str] = []
    rejected: list[str] = []
    quarantined: list[QuarantinedClaim] = []

    # Insertion-ordered deduplication prevents repeated agent claims from
    # increasing the deterministic threshold.
    for pattern_id in dict.fromkeys(candidate_ids):
        pattern = known.get(pattern_id)
        if pattern is None:
            rejected.append(pattern_id)
            quarantined.append(QuarantinedClaim(
                reason=RejectionReason.UNKNOWN_PATTERN_ID,
                value=pattern_id,
                claim_type="fraud_pattern",
            ))
        elif pattern_id not in supported:
            rejected.append(pattern_id)
            quarantined.append(QuarantinedClaim(
                reason=RejectionReason.PATTERN_NOT_SUPPORTED_BY_DOCUMENT,
                value=pattern_id,
                claim_type="fraud_pattern",
            ))
        elif not _counts_toward_verdict(pattern):
            rejected.append(pattern_id)
            quarantined.append(QuarantinedClaim(
                reason=RejectionReason.ANNOTATION_ONLY_PATTERN,
                value=pattern_id,
                claim_type="fraud_pattern",
            ))
        else:
            accepted.append(pattern_id)

    return PatternGuardResult(
        accepted_pattern_ids=accepted,
        rejected_pattern_ids=rejected,
        quarantined_claims=quarantined,
    )


def guard_legal_passage(
    candidate: LegalPassageCandidate,
) -> LegalPassageGuardResult:
    """Accept a legal passage only with an allowlisted ID and exact provenance.

    Any accepted source values and quote are copied from the corpus rather than
    from model output.  A missing candidate quote is safe (no quote may render),
    while a supplied quote must match a non-empty official corpus quote exactly.
    """

    passage = load_legal_passages().get(candidate.passage_id)
    if passage is None:
        return LegalPassageGuardResult(
            passage_id=candidate.passage_id,
            quarantined_claims=[QuarantinedClaim(
                reason=RejectionReason.UNKNOWN_PASSAGE_ID,
                value=candidate.passage_id,
                claim_type="legal_passage",
            )],
        )

    source_mismatch = (
        candidate.source_url != passage.source_url
        or (
            candidate.source_name is not None
            and candidate.source_name != passage.source_name
        )
    )
    if source_mismatch:
        value = candidate.source_url
        if (
            candidate.source_name is not None
            and candidate.source_name != passage.source_name
        ):
            value = f"{candidate.source_name} | {candidate.source_url}"
        return LegalPassageGuardResult(
            passage_id=candidate.passage_id,
            quarantined_claims=[QuarantinedClaim(
                reason=RejectionReason.SOURCE_MISMATCH,
                value=value,
                claim_type="source",
            )],
        )

    quote_accepted = False
    official_quote: str | None = None
    if candidate.quote:
        if not passage.official_quote:
            return LegalPassageGuardResult(
                passage_id=candidate.passage_id,
                quarantined_claims=[QuarantinedClaim(
                    reason=RejectionReason.EMPTY_OFFICIAL_QUOTE,
                    value=candidate.quote,
                    claim_type="legal_quote",
                )],
            )
        if candidate.quote != passage.official_quote:
            return LegalPassageGuardResult(
                passage_id=candidate.passage_id,
                quarantined_claims=[QuarantinedClaim(
                    reason=RejectionReason.QUOTE_MISMATCH,
                    value=candidate.quote,
                    claim_type="legal_quote",
                )],
            )
        quote_accepted = True
        official_quote = passage.official_quote

    return LegalPassageGuardResult(
        passage_id=candidate.passage_id,
        passage_accepted=True,
        quote_accepted=quote_accepted,
        grounded_passage=GroundedLegalPassage(
            passage_id=passage.id,
            source_name=passage.source_name,
            source_url=passage.source_url,
            official_quote=official_quote,
        ),
    )


def guard_and_decide(
    *,
    candidate_pattern_ids: Sequence[str],
    affirmatively_supported_ids: Sequence[str],
    docket_found: bool,
    cross_check_passed: bool,
) -> GroundingAudit:
    """Guard fraud/docket facts and invoke the real deterministic verdict code."""

    pattern_result = guard_patterns(
        candidate_pattern_ids,
        affirmatively_supported_ids,
    )
    quarantined = list(pattern_result.quarantined_claims)
    if docket_found and not cross_check_passed:
        quarantined.append(QuarantinedClaim(
            reason=RejectionReason.DOCKET_CROSS_CHECK_FAILED,
            value="docket_found=true,cross_check_passed=false",
            claim_type="docket",
        ))

    checker = CheckerReport(
        case_found=docket_found,
        parties_match=docket_found and cross_check_passed,
        court_lookup_status=(
            "match"
            if docket_found and cross_check_passed
            else "party_mismatch" if docket_found else "no_match"
        ),
        scam_signals=[
            ScamSignal(
                pattern_id=pattern_id,
                document_excerpt=f"guarded evidence for pattern {pattern_id}",
            )
            for pattern_id in pattern_result.accepted_pattern_ids
        ],
        scam_check_status="complete",
    )

    # Import at the boundary to keep this module usable by lower-level engine
    # code without creating a module-import cycle.
    from app.engine.verdict import apply_verdict_policy

    verdict = apply_verdict_policy(checker)
    versions = ground_truth_corpus_versions()
    corpus_versions = {
        "fraud_patterns": versions.get(
            "fraud_patterns",
            versions.get("ftc_patterns", "unknown"),
        ),
        "legal_passages": versions.get("legal_passages", "unknown"),
        "court_directory": versions.get("court_directory", "unknown"),
    }
    return GroundingAudit(
        verdict=verdict,
        accepted_pattern_ids=pattern_result.accepted_pattern_ids,
        rejected_pattern_ids=pattern_result.rejected_pattern_ids,
        quarantined_claims=quarantined,
        human_review_required=(
            verdict is VerdictState.CANNOT_CONFIRM or bool(quarantined)
        ),
        corpus_versions=corpus_versions,
    )
