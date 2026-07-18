import re
from collections import Counter
from datetime import date, datetime
from difflib import SequenceMatcher

from app.schemas.analysis import AnalysisResponse
from app.schemas.plaid import (
    PaymentCriteriaSnapshot,
    PaymentExcludedAudit,
    PaymentMatchRecord,
    PaymentMatchResponse,
    PaymentMatchSummary,
    PaymentReasonCode,
    PlaidTransaction,
)


class FinancialEligibilityError(ValueError):
    pass


def _normalize(value: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", value.lower()).split())


def _parse_date(value: str) -> date:
    for pattern in ("%Y-%m-%d", "%B %d, %Y", "%b %d, %Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(value.strip(), pattern).date()
        except ValueError:
            continue
    raise FinancialEligibilityError("The payment request does not contain a supported start date.")


def extract_payment_request(analysis: AnalysisResponse) -> tuple[str, date]:
    source = " ".join([
        *analysis.breakdown.requested_actions,
        analysis.summary,
    ]).strip()
    normalized = _normalize(source)
    supported_category = (
        "bank record" in normalized
        and ("payment" in normalized or "payments" in normalized)
    )
    if not supported_category:
        raise FinancialEligibilityError(
            "Financial tools stay locked because this verified request does not ask for supported payment and bank records."
        )

    payee_match = re.search(
        r"(?:benefit\s+of|payments?\s+(?:made\s+)?to)\s+([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,3})\s+from\b",
        source,
    )
    start_match = re.search(
        r"\bfrom\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4})",
        source,
        re.IGNORECASE,
    )
    if not payee_match or not start_match:
        raise FinancialEligibilityError(
            "Financial tools stay locked because the request payee or displayed date range could not be established."
        )
    return payee_match.group(1).strip(), _parse_date(start_match.group(1))


def _description(transaction: PlaidTransaction) -> str:
    return transaction.name or transaction.merchant_name or "Transaction"


def _near_payee(description: str, target_payee: str) -> bool:
    description_tokens = _normalize(description).split()
    target_tokens = _normalize(target_payee).split()
    if len(description_tokens) < 2 or len(target_tokens) < 2:
        return False
    target_first, target_last = target_tokens[0], target_tokens[-1]
    candidate_first, candidate_last = description_tokens[-2], description_tokens[-1]
    initial_matches = candidate_first == target_first[:1] or target_first == candidate_first[:1]
    last_similarity = SequenceMatcher(None, candidate_last, target_last).ratio()
    return initial_matches and last_similarity >= 0.72


def match_payment_transactions(
    transactions: list[PlaidTransaction],
    *,
    analysis_id: str,
    source_document: str,
    target_payee: str,
    start_date: date,
    cutoff_date: date,
) -> PaymentMatchResponse:
    if cutoff_date < start_date:
        raise FinancialEligibilityError("The confirmed cutoff cannot be before the request start date.")

    included: list[PaymentMatchRecord] = []
    review: list[PaymentMatchRecord] = []
    excluded: list[PaymentExcludedAudit] = []
    reasons: Counter[PaymentReasonCode] = Counter()
    target_normalized = _normalize(target_payee)

    for transaction in transactions:
        description = _description(transaction)
        description_normalized = _normalize(description)
        transaction_date = transaction.date
        if transaction_date < start_date or transaction_date > cutoff_date:
            disposition = "EXCLUDE"
            reason: PaymentReasonCode = "OUTSIDE_DATE_RANGE"
        elif re.search(rf"\b{re.escape(target_normalized)}\b", description_normalized):
            disposition = "INCLUDE"
            reason = "PAYEE_AND_DATE_MATCH"
        elif re.match(r"^(?:check|cashier s check|money order)\b", description_normalized):
            disposition = "REVIEW"
            reason = "UNNAMED_INSTRUMENT_NEEDS_HUMAN"
        elif _near_payee(description, target_payee):
            disposition = "REVIEW"
            reason = "NAME_NEAR_MATCH_NEEDS_HUMAN"
        else:
            disposition = "EXCLUDE"
            reason = "NOT_TARGET_PAYEE"

        reasons[reason] += 1
        if disposition == "EXCLUDE":
            excluded.append(PaymentExcludedAudit(
                record_id=transaction.transaction_id,
                reason_code=reason,
            ))
            continue
        record = PaymentMatchRecord(
            record_id=transaction.transaction_id,
            disposition=disposition,
            reason_code=reason,
            date=transaction.date,
            amount=transaction.amount,
            description=description,
            currency=transaction.currency,
        )
        if disposition == "INCLUDE":
            included.append(record)
        else:
            review.append(record)

    return PaymentMatchResponse(
        criteria_snapshot=PaymentCriteriaSnapshot(
            analysis_id=analysis_id,
            source_document=source_document,
            target_payee=target_payee,
            start_date=start_date,
            cutoff_date=cutoff_date,
        ),
        summary=PaymentMatchSummary(
            total_searched=len(transactions),
            include=len(included),
            review=len(review),
            exclude=len(excluded),
            excluded_by_reason={
                reason: count
                for reason, count in reasons.items()
                if reason in {"NOT_TARGET_PAYEE", "OUTSIDE_DATE_RANGE"}
            },
        ),
        include=included,
        review=review,
        excluded_audit=excluded,
        review_notice="Served matched these transactions to the payee and displayed date range in D4. Review every candidate and flagged item before exporting or sharing.",
        boundary_warning="An unnamed check and a near-name ACH require human review. Neither is automatically included.",
        legal_boundary="Served identifies candidate transactions matching displayed criteria. It does not decide legal responsiveness, privilege, objections, proper service, or whether production is required.",
    )
