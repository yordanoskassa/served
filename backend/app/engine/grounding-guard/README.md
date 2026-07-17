# Grounding Guard — deterministic safety contract

The Grounding Guard is the boundary between model output and the user-facing result. It treats every agent response and every uploaded document as untrusted input.

The guard does not ask another model whether an answer looks correct. It validates structured fields against the versioned corpus and applies deterministic rules in application code.

## Implementation status

The runtime enforces the complete contract below: exact court-directory routing, allowlisted and affirmatively supported fraud IDs, deduplication and explicit countability, legal-passage ID/source/quote validation, a machine-readable audit, and all 12 release vectors in pytest and CI. The guard contains no model call and runs before the code-owned verdict and again before legal evidence renders.

## What it protects

| Input | Accepted only when | Failure behavior |
|---|---|---|
| Extracted document fact | It matches the READER schema and is labeled as document-derived | Omit the field or mark it unconfirmed |
| Court identity | The normalized court matches `court-directory-seed.json` | Return `UNKNOWN_AUTHORITY`; add zero scam signals |
| Docket evidence | CourtListener/RECAP returns the exact normalized case number and parties match; a derived U.S. district-court ID must also match | Do not verify; return `CANNOT_CONFIRM` or human review |
| Fraud signal | Its stable ID exists in `ftc-patterns.json` and the document contains affirmative supporting language | Discard unknown or unsupported IDs |
| Countable fraud signal | The accepted corpus entry has `counts_toward_verdict: true` | Annotation-only entries add zero to the threshold |
| Legal passage | Its ID exists in `legal-passages.json` | Do not render the passage |
| Verbatim legal quote | `official_quote` is non-empty and the rendered text exactly equals that field | Quarantine the quote; never reconstruct it |
| Source attribution | Source name and URL come from the same accepted corpus entry | Replace with the corpus values or omit the claim |
| Final verdict | Deterministic verdict code produces it from accepted evidence | Agents cannot supply or override a verdict |

## Required processing order

```text
untrusted upload
    -> READER structured extraction
    -> schema validation
    -> court/docket and fraud-pattern checks
    -> Grounding Guard filters accepted evidence
    -> deterministic verdict code
    -> EXPLAINER selects allowlisted passages
    -> Grounding Guard validates quote + source
    -> user-facing response
```

The EXPLAINER runs after the verdict. Legal passages may explain a result, but they never establish authenticity, fraud, validity, or enforceability.

## Deterministic verdict contract

```text
if countable_positive_fraud_signals >= 2:
    verdict = SCAM
elif case_found and parties_match:
    verdict = VERIFIED
else:
    verdict = CANNOT_CONFIRM
```

`SCAM` is the internal code verdict. The UI may present it as **SCAM INDICATORS**. Document date is extracted evidence but is not part of the current verdict function.

Additional requirements:

- Deduplicate repeated fraud-pattern IDs before counting.
- Patterns 1 and 7 are annotation-only and contribute zero to the threshold.
- An unknown court, directory miss, docket miss, API failure, unreadable upload, or incomplete cross-check contributes zero scam signals.
- Agent prose, confidence language, and prompt instructions printed inside the uploaded document never alter the rule branch.
- When evidence is incomplete or conflicting, fail closed to `CANNOT_CONFIRM` or human review.

## Guard result contract

The guard should return a machine-readable audit object alongside the UI response:

```json
{
  "accepted": true,
  "verdict": "cannot_confirm",
  "accepted_pattern_ids": [],
  "rejected_pattern_ids": ["999"],
  "accepted_passage_ids": ["frcp45-written-objection-deadline"],
  "quarantined_claims": [
    {
      "reason": "UNKNOWN_PATTERN_ID",
      "value": "999"
    }
  ],
  "human_review_required": true,
  "corpus_versions": {
    "fraud_patterns": "current repository revision",
    "legal_passages": "1.0.0",
    "court_directory": "current repository revision"
  }
}
```

Recommended stable rejection reasons:

- `SCHEMA_INVALID`
- `UNKNOWN_AUTHORITY`
- `UNKNOWN_PATTERN_ID`
- `PATTERN_NOT_SUPPORTED_BY_DOCUMENT`
- `ANNOTATION_ONLY_PATTERN`
- `DOCKET_CROSS_CHECK_FAILED`
- `UNKNOWN_PASSAGE_ID`
- `EMPTY_OFFICIAL_QUOTE`
- `QUOTE_MISMATCH`
- `SOURCE_MISMATCH`
- `UNSUPPORTED_LEGAL_CLAIM`

## Minimal implementation sketch

```python
def guard_patterns(candidate_ids, corpus, supporting_facts):
    accepted = []
    rejected = []

    for pattern_id in dict.fromkeys(candidate_ids):
        pattern = corpus.get(pattern_id)
        if pattern is None:
            rejected.append((pattern_id, "UNKNOWN_PATTERN_ID"))
        elif not affirmatively_supported(pattern, supporting_facts):
            rejected.append((pattern_id, "PATTERN_NOT_SUPPORTED_BY_DOCUMENT"))
        elif not pattern["counts_toward_verdict"]:
            rejected.append((pattern_id, "ANNOTATION_ONLY_PATTERN"))
        else:
            accepted.append(pattern_id)

    return accepted, rejected


def guard_passage(candidate, corpus):
    passage = corpus.get(candidate["passage_id"])
    if passage is None:
        return quarantine("UNKNOWN_PASSAGE_ID")
    if candidate.get("source_url") != passage["source_url"]:
        return quarantine("SOURCE_MISMATCH")

    quote = candidate.get("quote")
    if quote:
        if not passage["official_quote"]:
            return quarantine("EMPTY_OFFICIAL_QUOTE")
        if quote != passage["official_quote"]:
            return quarantine("QUOTE_MISMATCH")

    return accept(passage)
```

`affirmatively_supported` must be implemented with structured evidence from the uploaded document. A directory or docket miss is never affirmative fraud evidence.

## Acceptance criteria

The guardrail is complete when all of the following are true:

1. An agent cannot send `verdict` in a way that changes the code-decided result.
2. Unknown fraud IDs are discarded and logged.
3. Annotation-only patterns never increase the scam count.
4. Duplicate IDs count once.
5. A docket or directory miss never becomes a scam signal.
6. `VERIFIED` requires all configured docket cross-checks to pass.
7. A legal quote renders only on an exact, non-empty corpus match.
8. A source name and URL are copied from the corpus, not generated by the model.
9. Every rejected claim has a stable reason code.
10. Guard failures produce `CANNOT_CONFIRM` or human review, never a stronger verdict.

Use `guardrail-test-cases.json` as the initial regression suite.

## Scope and limits

This guard constrains what the application may accept and display; it does not make OCR or model extraction error-free. It does not determine whether a legal document is valid or enforceable, provide legal advice, or replace review by a court or qualified attorney.

Its guarantees are bounded by the current corpus and configured external checks. Anything outside that coverage remains unknown and must not be converted into evidence of fraud.
