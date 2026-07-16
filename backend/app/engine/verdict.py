import re

from app.engine.models import (
    Confidence,
    CheckerReport,
    DocumentParse,
    EngineResult,
    EngineStep,
    Tier,
    VerdictState,
)
from app.engine.fraud_patterns import load_fraud_patterns


FEDERAL_COURT = re.compile(r"(?:united states|u\.?s\.?)\s+district\s+court", re.I)
STATE_COURT = re.compile(r"(?:superior|supreme|district|circuit|county)\s+court", re.I)
VERDICT_POLICY_VERSION = "three-agent-v1"


def classify_tier(parsed: DocumentParse) -> Tier:
    court = parsed.court or ""
    if FEDERAL_COURT.search(court):
        return Tier.FEDERAL
    if STATE_COURT.search(court):
        return Tier.STATE
    return Tier.NONE


def counted_pattern_ids(checker: CheckerReport) -> list[str]:
    known_patterns = load_fraud_patterns()
    return [
        pattern_id
        for pattern_id in dict.fromkeys(signal.pattern_id for signal in checker.scam_signals)
        if pattern_id in known_patterns and known_patterns[pattern_id].counts_toward_verdict
    ]


def apply_verdict_policy(checker: CheckerReport) -> VerdictState:
    """The complete verdict policy: plain code, never an AI-agent decision."""
    signal_ids = counted_pattern_ids(checker)

    if len(signal_ids) >= 2:
        return VerdictState.SCAM
    if checker.case_found and checker.parties_match:
        return VerdictState.VERIFIED
    return VerdictState.CANNOT_CONFIRM


def decide_verdict(
    parsed: DocumentParse,
    checker: CheckerReport | None = None,
) -> EngineResult:
    """Wrap the deterministic policy with presentation metadata."""
    report = checker or CheckerReport()
    evidence = report.docket_evidence
    tier = classify_tier(parsed)
    indicators = counted_pattern_ids(report)
    verdict = apply_verdict_policy(report)
    confidence = (
        Confidence.HIGH
        if verdict in {VerdictState.SCAM, VerdictState.VERIFIED}
        else Confidence.MEDIUM if tier is Tier.STATE else Confidence.LOW
    )

    steps = [
        EngineStep(key="parsed", label=f"Classified: {parsed.doc_type}"),
        EngineStep(key="tier", label=f"Verification route: {tier.value}"),
    ]
    if indicators:
        steps.append(EngineStep(key="fraud", label=f"Checked warning signs: {len(indicators)} found"))
    steps.append(EngineStep(
        key="verdict",
        label=f"Code policy {VERDICT_POLICY_VERSION} returned: {verdict.value}",
    ))
    return EngineResult(
        parse=parsed,
        verdict=verdict,
        tier=tier,
        evidence=evidence,
        confidence=confidence,
        steps=steps,
        indicators=indicators,
        near_match=report.near_match,
    )
