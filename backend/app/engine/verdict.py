from app.engine.ground_truth import match_court_authority
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


VERDICT_POLICY_VERSION = "three-agent-v2"


def classify_tier(parsed: DocumentParse) -> Tier:
    # Only an exact, normalized match in the limited seed receives a route.
    # Similar or unlisted names remain annotation-only and cannot become proof.
    return match_court_authority(parsed.court).tier


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
    if (
        checker.case_found
        and checker.parties_match
        and checker.court_lookup_status == "match"
        and checker.scam_check_status == "complete"
    ):
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
