# Corpus — ground-truth data for the Served agents

These files are read-only ground truth. Agents read them to extract, check, and explain facts; they never decide the verdict.

The three-state code verdict — `VERIFIED`, `CANNOT_CONFIRM`, or `SCAM` — is computed by deterministic rules in application code. The UI may label `SCAM` as **SCAM INDICATORS**. No agent may choose, change, or override the code verdict.

| File | Agent | Purpose |
|---|---|---|
| `court-directory-seed.json` | CHECKER / routing contract | Define the reviewed court identities, official domains, and exact-match routes enforced by the runtime. |
| `ftc-patterns.json` | CHECKER | Match extracted facts against 10 officially sourced impersonation-scam patterns and report the supporting evidence. |
| `legal-passages.json` | EXPLAINER | Explain the completed result using controlled legal passages, exact quotations, and official source URLs instead of generating legal claims from memory. |
| Grounding Guard | Application boundary | Validate agent outputs against the corpus, quarantine unsupported claims, and enforce deterministic fallback behavior before anything renders. |

## Deterministic verdict

```text
2+ countable positive fraud-pattern matches  -> SCAM
case found + parties match                   -> VERIFIED
anything else                                -> CANNOT_CONFIRM
```

Only a pattern with `"counts_toward_verdict": true` may increase the scam-signal count. Missing, ambiguous, or unavailable evidence falls back to `CANNOT_CONFIRM` or human review — never an AI guess.

## How Served prevents AI hallucinations from deciding the verdict

Served places deterministic, source-backed checks between model extraction and the user-facing result:

1. Structured extraction, not free-form judgment. The READER returns defined fields such as court, case number, parties, date, deadline, and demands. It does not return a verdict.
2. External verification for `VERIFIED`. The current code requires a CourtListener/RECAP case match and deterministic party match; when a U.S. district court can be derived, the candidate court ID must also match. Document date is extracted but is not currently part of the verdict rule.
3. Allowlisted fraud signals. The CHECKER can report only stable IDs from the sourced fraud-pattern corpus. Unknown IDs are discarded, and annotation-only patterns 1 and 7 cannot increase the scam count.
4. Deterministic verdict code. Application code — not an agent response — applies the same three-state precedence rules to every document.
5. Safe refusal by default. Missing courts, docket misses, unreadable documents, incomplete evidence, and failed cross-checks return `CANNOT_CONFIRM` or human review instead of a guessed conclusion.
6. Grounded explanation contract. `legal-passages.json` defines the permitted passages and quotations. The runtime validates each selected ID, source, and any verbatim quote before it can render.

These controls make the final state constrained, source-backed, and reviewable even when model extraction is uncertain. They reduce hallucination risk without claiming that any AI extraction system is error-free.

## Why the agents are accountable — every accepted reference has provenance

The corpus does not ask a model to invent a fraud rule, court identity, or legal authority. Each accepted reference has a stable corpus entry and a source that a reviewer can inspect:

- `ftc-patterns.json` cites the FTC Government and Business Impersonation Rule (16 CFR Part 461), FTC gift-card guidance, U.S. Courts scam alerts, IRS consumer alerts, and CFPB debt-collection guidance. Each corpus entry carries a stable pattern ID, source name, source URL, and countability rule.
- `legal-passages.json` cites Federal Rule of Civil Procedure 45 and 15 U.S.C. §§ 1672–1674, with source locators, controlled plain-language explanations, and short verbatim quotations where available. Empty `official_quote` fields remain empty; the rendering contract never permits the model to reconstruct a missing quotation.
- `court-directory-seed.json` cites official court websites and `.uscourts.gov` identities and domains, together with the CourtListener routing ID used for external record checks.
- Uploaded-document facts remain labeled as extracted facts from the user's document. They do not become official facts unless the relevant deterministic cross-check succeeds.
- CourtListener/RECAP results remain separately identified as external docket evidence rather than model knowledge.

The application returns the verdict separately from its supporting evidence. A reviewer can trace the result through the extracted fields, matched corpus IDs, official sources, external docket evidence, and the deterministic rule branch instead of relying on hidden model reasoning.

If a reviewer asks, "How do you know the AI did not make this up?" the precise answer is: the model may propose a structured fact from the uploaded document, but it cannot promote that fact into an accepted reference or final verdict by prose alone. Verification, scoring, and explanation are constrained by the sourced corpus, external evidence, and deterministic code; unsupported inputs fall back to `CANNOT_CONFIRM` or human review.

## Safety boundaries

- A directory miss or CourtListener/RECAP docket miss contributes zero scam signals. Absence is never evidence of fraud.
- The `SCAM` code verdict—shown to users as **SCAM INDICATORS**—requires 2+ positive, countable pattern matches, each linked to its official source.
- Patterns 1 and 7 are annotation-only and do not count toward the scam threshold. These are corpus pattern IDs, distinct from the user-facing indicator numbers shown on the verdict screen.
- Legal passages explain an already-computed verdict; they never establish authenticity, fraud, validity, or enforceability.
- A quotation may be rendered only when `official_quote` is non-empty and matches its cited source. The system must never reconstruct a missing quote.
- Every legal corpus version carries a verification date and source timeline. The current Rule 45 passages were verified against the Federal Rules amended through December 1, 2025; proposed amendments are excluded until effective and re-verified.
- High-stakes, disputed, or ambiguous results route to the issuing court, a qualified attorney, or human review.

## Scope and limits

### Corpus coverage

- Court-directory data: the four U.S. District Courts in California, the U.S. Court of Appeals for the Ninth Circuit, and a Los Angeles Superior Court stub. Only exact normalized seed matches receive an automated route.
- Fraud detection: 10 officially sourced impersonation-scam patterns.
- Legal explanation: selected Federal Rule of Civil Procedure 45 topics and federal wage-garnishment basics.

### Not included

- An enforced nationwide or international court directory
- Exhaustive state, tribal, or administrative-court verification
- Every type of legal document, deadline, defense, exception, or local rule
- An exhaustive fraud taxonomy
- A legal determination that a document is valid, enforceable, or fraudulent
- Legal advice or a replacement for a court or qualified attorney

The runtime enforces this intentionally limited directory before CourtListener routing. Unlisted or inexact court names remain `UNKNOWN_AUTHORITY`; regardless of provider or corpus coverage, lack of a record is never treated as evidence of fraud.
