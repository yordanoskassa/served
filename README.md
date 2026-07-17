# Served

> **That envelope says you have been served. Now you are served by us.**

[Try the demo](https://servedai.netlify.app/) · [Architecture](docs/multi-agent-architecture.md) · [Safety corpus](backend/app/corpus/README.md) · [UPL boundary](docs/product-safety/UPL.md)

**Anyone can get one of these.** A federal subpoena, a wage-garnishment notice, or a “pay now or else” demand can land in the mailbox of a household or small business with no lawyer on call. Some documents are real and time-sensitive. Others are scams designed to look official. Telling the difference can become a $500-an-hour question.

Served gives the recipient an evidence-backed first answer in about 30 seconds.

In our demo, John — a restaurant owner who moved from Mexico and whose business is already having a rough month — finds an official-looking federal subpoena in the mail, addressed to his restaurant, John Doe’s Kitchen LLC: it demands payroll records for a former employee’s wage lawsuit. His English is fine; legal English is the foreign language, as it is for almost everyone. **He is not being sued — but the document never explains that in plain language.** Served reads the letter, checks the referenced case against the public federal docket, and shows him what the document says, what evidence could be verified, and when the result needs human review.
Three narrowly scoped AI agents gather and explain the evidence. A small deterministic code policy—not an AI model—selects the final outcome.

```text
Upload -> READER -> CHECKER -> code-decided verdict -> EXPLAINER
```

## Three agents · one code-decided verdict

| Agent | Job | Hard boundary |
|---|---|---|
| **1 · READER** | Extracts the document type, claimed court, case number, parties, dates, deadline, requested actions, and visible text | Does not investigate, label scams, or choose a verdict |
| **2 · CHECKER** | Searches CourtListener/RECAP and compares exact document excerpts with the approved fraud-pattern corpus | Does not treat a missing record as fraud or choose a verdict |
| **3 · EXPLAINER** | Turns the immutable code result into plain language; any legal quotation must be inserted from an allowlisted corpus entry | Cannot change the verdict or generate an official quotation |

CourtListener and the corpus are CHECKER tools, not additional agents. The verdict policy and Grounding Guard are ordinary application code.

## Three honest outcomes

| User-facing outcome | What it means |
|---|---|
| **VERIFIED** | A matching public federal docket record was found and the extracted parties matched. This verifies the referenced record—not the physical paper. A forged document could copy a real case number. |
| **CANNOT CONFIRM** | Served could not establish the required match. This does **not** mean the document is fake: the public archive may be incomplete, a number may contain a typo, the provider may be unavailable, or the document may be outside demo coverage. |
| **SCAM INDICATORS** | At least two unique, countable warning signs were supported by exact document excerpts and matched to officially sourced corpus entries. This is a safety warning, not a legal finding that someone committed fraud. |

The hardest product decision is also the simplest: **when we do not know, we say we do not know.** A directory miss or docket miss contributes zero scam signals.

## LLMs gather evidence; code decides

The complete verdict policy is deliberately small and reviewable:

```python
if countable_positive_fraud_signals >= 2:
    verdict = SCAM
elif case_found and parties_match:
    verdict = VERIFIED
else:
    verdict = CANNOT_CONFIRM
```

The scam rule takes precedence even if a real docket exists, because a scam letter may copy a real case. Unknown pattern IDs, duplicate IDs, unsupported excerpts, annotation-only patterns, and record misses do not count.

## What counts as ground truth

Agents cannot promote free-form model text into accepted evidence. The repository defines the permitted sources:

| Source of truth | Defines | Contract consumer | Current status |
|---|---|---|---|
| [`court-directory-seed.json`](backend/app/corpus/court-directory-seed.json) | Recognized court identities, official domains, reviewed clerk-contact routes, and the rule that absence is never fraud evidence | CHECKER routing, deterministic validation, and Guided Clerk Call preparation | Enforced through exact normalized seed matching and fail-closed contact selection |
| [`ftc-patterns.json`](backend/app/corpus/ftc-patterns.json) | Which affirmative warning signs may be reported, which ones count, and the official source behind each | CHECKER | Loaded and validated by the runtime |
| [`legal-passages.json`](backend/app/corpus/legal-passages.json) | Which legal passages, short official quotations, citations, and limitations the product may display | EXPLAINER and server-side quote insertion | IDs, sources, and verbatim quotes are guarded at runtime |
| [`multi-agent-architecture.md`](docs/multi-agent-architecture.md) | Agent responsibilities, schemas, failure behavior, and the immutable verdict boundary | Engineering contract | Checked in |

Sources include the FTC, IRS, CFPB, U.S. Courts, Department of Labor, U.S. Code, official court websites, and CourtListener/RECAP. Uploaded-document facts and external docket evidence remain separately labeled so a reviewer can trace where every claim came from.

## Grounding Guard safety contract

The [Grounding Guard specification](backend/app/engine/grounding-guard/README.md) defines the deterministic boundary between model output and anything shown to the user. Its acceptance criteria require the application to:

- reject unknown or unsupported fraud-pattern IDs;
- deduplicate repeated findings and prevent annotation-only patterns from counting;
- require exact document excerpts for fraud findings;
- keep record and directory misses out of the scam threshold;
- allow a legal quote only when it exactly matches a non-empty corpus value;
- quarantine mismatched sources or reconstructed quotations; and
- fall back to `CANNOT_CONFIRM` or human review when evidence is incomplete.

The runtime enforces that full boundary and returns a machine-readable guard audit with every analysis. The repository’s [12 guardrail release vectors](backend/app/engine/grounding-guard/guardrail-test-cases.json) run through the real verdict code in pytest and in a dedicated GitHub Actions gate on every push and pull request.

## Current prototype lookup scope

The runtime first requires an exact normalized match in the reviewed court seed. When that route supports automated lookup, READER has extracted a case number, and CourtListener credentials are available, CHECKER searches CourtListener/RECAP for that number.

For a seeded federal route, the candidate record must match the configured CourtListener court ID, normalized case number, and extracted parties before code may return `VERIFIED`.

The checked-in [`court-directory-seed.json`](backend/app/corpus/court-directory-seed.json) currently covers the four U.S. District Courts in California, the Ninth Circuit, and a Los Angeles Superior Court stub. The state-court stub has no automated docket integration in this release.

Ambiguous, inexact, or unsupported claimed authorities remain `UNKNOWN_AUTHORITY` and receive no automated route. A missing record, unavailable provider, or out-of-scope authority never becomes a scam signal; without the required record-and-party match, the safe outcome is `CANNOT_CONFIRM`.

## Guided Clerk Call

After the search and code-owned verdict are complete, Served can prepare a safe administrative call using only the reviewed contact data in `court-directory-seed.json`. The uploaded document never supplies the phone number, email address, or contact URL.

- CACD, CAED, and CASD select a phone route only when the case number contains an exact reviewed leading division code.
- The Ninth Circuit uses its reviewed court-wide Case Information route.
- CAND selects a specific office only when a trusted routing source supplies a reviewed office key. The uploaded letter is not trusted for that choice; without trusted routing, Served shows the court's official contact page and no dial button.
- LASC remains an identity/contact stub with no automated docket lookup; it exposes only the official contact page, never a phone or dial action, in this release.
- Any missing, ambiguous, or not-fully-reviewed route strips the phone number and falls back to the official court contact page. No office is guessed or silently defaulted.

The user reviews the court, route, and administrative-only script before opening their own phone dialer. Served does not place or record calls, email the court, ask the clerk for legal advice, or claim the clerk can authenticate the paper. The boundary is: **confirm the case, not the document.**

## Versioned legal sources

The legal corpus is a dated source snapshot, not model memory:

- The selected federal passages were verified on **July 16, 2026** against the Federal Rules of Civil Procedure amended through **December 1, 2025**.
- The 2025 Civil Rules package amended Rules 16 and 26 and added Rule 16.1; it did not amend Rule 45.
- Proposed Rule 45 changes are excluded unless they complete the rules process, take effect, and are re-verified.
- Empty `official_quote` fields stay empty. The model may not reconstruct missing rule text.

Legal passages explain an already-computed outcome. They never decide authenticity, fraud, validity, enforceability, strategy, or a user's actual legal deadline.

## Demo fixtures

The release fixtures make the three branches easy to inspect:

| Fixture | Scenario | Expected outcome |
|---|---|---|
| `D1.pdf` | Referenced federal case is found and parties match | `VERIFIED` |
| `D2.pdf` | The case number is altered, so the required match is not established | `CANNOT_CONFIRM` |
| `D3.pdf` | Two or more countable, sourced warning signs are supported by the letter text | `SCAM` |

The specimens are training fixtures, not valid legal documents. Personal, attorney, and contact details are fictionalized. Expected outcomes and golden agent outputs live in [`backend/fixtures/`](backend/fixtures/), so the demo contract does not depend on a live API response remaining unchanged.

## Built with OpenAI + Codex

The runtime is configured for [**GPT-5.6 through the OpenAI Responses API**](https://developers.openai.com/api/docs/models/gpt-5.6-sol). Structured outputs keep each agent inside a strict schema; image input supports document reading, while external lookup results and corpus entries remain separately validated.

Codex was used as the build partner to:

- turn the product contract into the three-agent architecture and deterministic safety boundary;
- prepare and audit the sourced corpora, D1/D2/D3 fixtures, expected outcomes, and 12-case Grounding Guard contract; and
- inspect the frontend/backend integration, reproduce failures, and keep implementation notes aligned with the repository.

Early visual reference mocks (in references/drive/) were explored with other AI tools; all product code, architecture, corpora, and the running application were built with Codex and GPT-5.6. The final verdict is never delegated to any model.

## Run locally

Backend:

```bash
cd backend
python -m uvicorn app.main:app --reload --port 8001
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend falls back to the deployed EasyPanel API. For local backend work, set `VITE_API_URL=http://localhost:8001/api` before starting Vite. Copy `.env.example` to your local environment and keep OpenAI and CourtListener credentials out of Git.

## Repository map

```text
backend/app/corpus/                  sourced, versioned ground truth
backend/app/engine/                  schemas, Grounding Guard, verdict policy
backend/app/services/                agents and external integrations
backend/fixtures/                    D1/D2/D3 and golden expected results
backend/tests/                       deterministic backend tests
docs/multi-agent-architecture.md     full engineering contract
docs/product-safety/UPL.md           legal-information boundary copy
frontend/                            React/Vite product UI
```

## What Served is not

Served provides document information, evidence links, and review logistics—not legal advice. It does not determine that a document is legally valid, properly served, enforceable, or fraudulent; calculate a case-specific legal deadline; or create an attorney-client relationship.

The attorney handoff shown in the hackathon demo illustrates a future workflow. It is not a live legal service, and no attorney is retained through the demo.

**Hackathon prototype. Bounded coverage. Evidence before action.**

## Deploying

For EasyPanel, deploy the root `docker-compose.yml` (or the backend service
using `backend/Dockerfile`). Add the variables from `.env.example` to the
backend service, including `SERVED_CORS_ORIGINS` with the deployed Netlify
origin, for example:

```text
SERVED_CORS_ORIGINS=["https://your-site.netlify.app"]
```

For Netlify, connect the repository and use the included `netlify.toml`.
Set the build environment variable `VITE_API_URL` to the public EasyPanel
backend URL ending in `/api`, such as `https://api.example.com/api`.

## EasyPanel

Deploy the root `docker-compose.yml`, or create two services using
`backend/Dockerfile` and `frontend/Dockerfile`. Set the backend variables from
`.env.example`; shared Lumper credentials should be copied into EasyPanel's
secret environment settings, never committed. Point the frontend's
`BACKEND_URL` at the private backend service URL (or its public HTTPS URL when
the services cannot share a private network).

Google login can reuse Lumper's OAuth client, but the Served production origin
must also be added to that client's Authorized JavaScript origins in Google
Cloud. Served uses the shared Mongo cluster with the separate `served` database.
