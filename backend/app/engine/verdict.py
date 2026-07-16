import re

from app.engine.models import (
    Confidence,
    DocketEvidence,
    DocumentParse,
    EngineResult,
    EngineStep,
    Tier,
    VerdictState,
)
from app.engine.fraud_patterns import load_fraud_patterns


FEDERAL_COURT = re.compile(r"(?:united states|u\.?s\.?)\s+district\s+court", re.I)
STATE_COURT = re.compile(r"(?:superior|supreme|district|circuit|county)\s+court", re.I)


def classify_tier(parsed: DocumentParse) -> Tier:
    court = parsed.court or ""
    if FEDERAL_COURT.search(court):
        return Tier.FEDERAL
    if STATE_COURT.search(court):
        return Tier.STATE
    return Tier.NONE


def decide_verdict(
    parsed: DocumentParse,
    docket_evidence: list[DocketEvidence] | None = None,
    *,
    cross_check_passed: bool = False,
    near_match: DocketEvidence | None = None,
) -> EngineResult:
    """Pure, deterministic precedence: scam signals, verified docket, refusal."""
    evidence = docket_evidence or []
    tier = classify_tier(parsed)
    known_patterns = load_fraud_patterns()
    indicators = [
        pattern_id for pattern_id in dict.fromkeys(parsed.scam_pattern_ids)
        if pattern_id in known_patterns and pattern_id not in {"1", "7"}
    ]
    if len(indicators) >= 2:
        verdict, confidence = VerdictState.SCAM_INDICATORS, Confidence.LOW
    elif tier is Tier.FEDERAL and evidence and cross_check_passed:
        verdict, confidence = VerdictState.VERIFIED, Confidence.HIGH
    else:
        verdict = VerdictState.CANNOT_CONFIRM
        confidence = Confidence.MEDIUM if tier is Tier.STATE else Confidence.LOW

    steps = [
        EngineStep(key="parsed", label=f"Classified: {parsed.doc_type}"),
        EngineStep(key="tier", label=f"Verification route: {tier.value}"),
    ]
    if indicators:
        steps.append(EngineStep(key="fraud", label=f"Checked warning signs: {len(indicators)} found"))
    steps.append(EngineStep(key="verdict", label=f"Verdict ready: {verdict.value}"))
    return EngineResult(
        parse=parsed,
        verdict=verdict,
        tier=tier,
        evidence=evidence,
        confidence=confidence,
        steps=steps,
        indicators=indicators,
        near_match=near_match,
    )
