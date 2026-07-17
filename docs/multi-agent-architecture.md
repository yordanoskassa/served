# Served three-agent architecture

Implementation status: The current runtime implements the three-agent flow, deterministic verdict policy, exact court-directory enforcement, legal-passage insertion, Grounding Guard automation, trace persistence, and fail-closed official clerk-contact selection. Production-scale queueing and retry infrastructure remain outside this hackathon release.

## Product contract

Served analyzes an uploaded legal-looking letter with exactly three AI agents:

1. **READER** extracts visible facts from the uploaded document. It does not investigate or judge.
2. **CHECKER** investigates those facts with CourtListener and the approved scam-pattern corpus. It reports findings and limitations. It does not choose an outcome.
3. **EXPLAINER** describes the code-decided result in plain language and uses canonical source quotations supplied by the server. It does not choose or change an outcome.

The verdict is produced between CHECKER and EXPLAINER by a small deterministic function. The verdict function is ordinary application code, not an agent, model call, tool, or supervisor.

The product promise is:

> The AI never chooses the verdict. Versioned code applies three fixed rules to validated evidence, and official quotations are inserted from the approved source file rather than generated.

This wording is intentionally narrower than “AI cannot hallucinate.” READER and CHECKER still use model-assisted extraction and comparison, so their findings must be cited, validated, and shown with limitations.

## Official OpenAI showcase patterns adopted

Served follows the parts of recent OpenAI customer and internal systems that are useful for a high-stakes document product:

- **Current Agents SDK guidance:** define specialists with clear ownership, add guardrails around risky work, and inspect complete traces of model calls, tool calls, and handoffs. Served makes those ideas visible while keeping the verdict outside model control. ([Agents SDK guide](https://developers.openai.com/api/docs/guides/agents#choose-your-starting-point), [trace evaluation](https://developers.openai.com/api/docs/guides/agent-evals#start-with-traces-when-you-are-still-debugging-behavior))
- **Clio and Legora:** structured legal work, efficient multi-step document analysis, and cautious legal conclusions—not extra agents for presentation. ([GPT-5.6 launch](https://openai.com/index/gpt-5-6/))
- **OpenAI Contract Data Agent:** heterogeneous PDFs/scans become referenced structured data, then remain reviewable by experts. Served retains typed facts, evidence links, a versioned corpus, and an explicit human-review boundary. ([Contract Data Agent](https://openai.com/index/openai-contract-data-agent/))
- **Thrive/OpenAI Tax AI:** trace each source-derived field through corrections and turn failures into focused evals. Served keeps event order, provider metadata, signal dispositions, and D1/D2/D3 golden regressions. ([Self-improving tax agents](https://openai.com/index/building-self-improving-tax-agents-with-codex/))
- **Oscar Health:** long, consequential records need bounded workflow state rather than a single opaque answer. Served exposes READER, both CHECKER branches, the code rule, and EXPLAINER as separate run events. ([Agents SDK evolution](https://openai.com/index/the-next-evolution-of-the-agents-sdk/))
- **Box:** permission-aware private documents can be combined with public evidence tools without confusing the two sources. Served keeps uploaded-document evidence distinct from CourtListener and the approved official-source corpus. ([New agent tools](https://openai.com/index/new-tools-for-building-agents/))
- **OpenAI’s in-house data agent:** consolidate tools, preserve raw-result links, and continuously evaluate traces. Served uses two explicit evidence tools, stable evidence IDs, response/usage provenance, and deterministic fixture tests. ([Inside the data agent](https://openai.com/index/inside-our-in-house-data-agent/))

Ada and TRUSTBANK showcase dynamic planners/routers for open-ended support and search. Served deliberately does **not** copy that pattern into the verdict path: this product has a fixed three-stage graph and a fixed decision table, so an LLM router would add variability without adding a legitimate product capability. ([Ada](https://openai.com/index/ada/), [TRUSTBANK](https://openai.com/index/trustbank/))

## Authoritative flow

```text
Authenticated upload
  -> file safety and ownership checks                 [infrastructure, not an agent]
  -> READER: visible facts and faithful text
       `-> court-directory-seed.json exact routing    [deterministic tool]
  -> CHECKER (concurrent fan-out):
       |-> CourtListener lookup                       [tool]
       `-> ftc-patterns.json comparison               [tool]
  -> deterministic verdict policy                     [plain code, not an agent]
  -> EXPLAINER: plain-language result
       `-> legal-passages.json Grounding Guard        [deterministic tool]
  -> canonical source quotations inserted by server  [plain code]
  -> official clerk-contact route selected or withheld [plain code]
  -> human reviews and optionally opens phone dialer   [human action]
  -> persist result and update the dashboard          [infrastructure]
```

There are no additional product agents. Intake validation, orchestration, persistence, retry handling, the verdict policy, quote insertion, and human review are infrastructure or human processes. They must not be presented as AI agents in code, documentation, metrics, or the dashboard.

The Guided Clerk Call is also not an agent. It is a deterministic, post-verdict action-preparation step. It may expose a phone target only when the exact court route and required division or trusted office key select a fully reviewed `READY` corpus record. Otherwise it removes callable contact data and returns the official court contact page for human confirmation. Contact details printed on the uploaded document never enter this selector. The user reviews the administrative-only script and initiates the call; Served never calls, records, or emails the court.

## Agent boundaries

| Agent | Receives | Produces | Must never do |
|---|---|---|---|
| `reader` | Uploaded JPEG, PNG, or PDF | Document type, claimed court or authority, case number, parties, document date, deadline, requested actions, faithful visible text, readability limitations | Receive the pattern corpus, query CourtListener, label scam signals, assess authenticity, or emit a verdict |
| `checker` | Validated READER output, the approved pattern corpus, and configured CourtListener access | Typed CourtListener status and evidence; typed pattern findings with exact document excerpts; provider limitations | Decide `SCAM`, `VERIFIED`, or `CANNOT_CONFIRM`; treat no-match as fraud; invent excerpts or source records |
| `explainer` | READER facts, CHECKER findings, immutable code verdict, and permitted source identifiers | Plain-language summary and safe next step | Change the verdict, add unsupported facts, generate a legal quotation, or claim that a docket match authenticates the paper |

Strict structured-output schemas must enforce these boundaries. A model output field that is outside its schema must be rejected rather than silently accepted.

## READER contract

READER reports what is visible and nothing more. Its prompt and schema must not contain the FTC pattern list or any outcome vocabulary.

Required facts are:

- Document type
- Claimed court or issuer
- Case or reference number
- Named parties
- Document date
- Stated deadline
- Requested actions
- Faithful visible text
- Readability status and limitations

For production evidence, each material field should include a page number and exact text span. Bounding boxes may also be stored for image highlighting. A missing, ambiguous, or unreadable value is reported as unknown; READER does not fill it from general knowledge.

The uploaded document is untrusted data. Instructions printed in the document that address the model are ignored.

After READER returns, ordinary code normalizes the claimed authority and compares it with `court-directory-seed.json`. Only an exact canonical-name or alias match may produce `OFFICIAL_COURT` and a federal, federal-appellate, or state route. Unknown names and the intentionally fictitious D3 authority remain annotation-only; they contribute zero scam signals. State and unknown routes never reach the automated CourtListener lookup in the current release.

## CHECKER contract

CHECKER owns two investigation tools. These tools are not separate agents.

### CourtListener tool

For an eligible exact federal route, the tool searches the extracted case number using the directory's CourtListener court ID and compares returned party data with the extracted parties using deterministic normalization. Results from another court ID are rejected. It returns one explicit state:

- `match`
- `party_mismatch`
- `near_match`
- `no_match`
- `unavailable`
- `not_applicable`

`no_match`, `unavailable`, and `not_applicable` are different states. None of them is a scam signal. A CourtListener match confirms that the referenced court record and parties match; it does not prove that the uploaded paper was issued by the court.

Every returned record retains its CourtListener URL, docket number, court identifier, case title, parties, retrieval time, and query inputs. The party-match algorithm is deterministic, versioned, and covered by collision tests; a single common-name token is not sufficient evidence.

### Scam-pattern tool

The approved corpus is `backend/app/corpus/ftc-patterns.json`. For text PDFs, CHECKER receives independently extracted embedded PDF text; scanned PDFs and images fall back to READER's model-assisted transcription and are labeled accordingly. CHECKER may report a pattern only when it returns:

- A known pattern ID
- A short, exact, contiguous excerpt from the selected document-text basis
- The corresponding document text span or page when available

Server code validates that the pattern exists, the excerpt occurs in the captured document text, the pattern's full coded predicate is supported, and the same pattern ID is counted only once. Invalid, unknown, duplicate, uncited, or context-only findings do not enter the verdict policy. Every accepted/rejected proposal keeps an audit disposition; rejected text is never passed to EXPLAINER.

Pattern findings retain the corpus title, official source name, source URL, corpus version, and source quotation ID. A docket miss is never converted into a pattern match.

## Deterministic verdict policy

This is the complete decision policy. Precedence is deliberate: two validated scam signals win even when a matching court record exists.

```python
def decide_verdict(checker):
    signal_ids = unique_validated_pattern_ids(checker.scam_signals)

    if len(signal_ids) >= 2:
        return SCAM

    if checker.case_found and checker.parties_match:
        return VERIFIED

    return CANNOT_CONFIRM
```

Canonical outcomes are:

- `SCAM` — at least two unique, validated scam-pattern findings
- `VERIFIED` — a case was found and the extracted parties match
- `CANNOT_CONFIRM` — every other combination, including one signal, no match, near match, unreadable evidence, or provider unavailability

The policy receives only validated CHECKER output. No prompt can invoke, bypass, or modify it. The decision record stores the counted pattern IDs, the CourtListener match inputs, a reason code, and a policy version so the outcome can be reproduced.

`VERIFIED` means the referenced record and parties matched. User-facing copy must not say that CourtListener proved the physical or uploaded letter itself is authentic.

## EXPLAINER and canonical quotations

EXPLAINER runs only after code has produced the immutable verdict. Its structured output contains plain-language explanation fields and safe next steps; it has no writable verdict field.

Official quotations are never copied from free-form model text. The server performs the final assembly:

1. Determine which validated pattern or legal-source IDs apply.
2. Load their canonical quotations from the approved file.
3. Omit entries whose canonical quote is missing.
4. Insert the stored text byte-for-byte with its official source name and URL.

`legal-passages.json` is now wired through a deterministic Grounding Guard. Code first selects only passages whose `use_when` requirements are supported by extracted facts, rejects unknown and duplicate IDs, and then sends canonical plain-language guidance—not writable verdict fields—to EXPLAINER. The final UI loads the source, locator, and `official_quote` directly from the corpus. Empty canonical quotes remain empty; the server never reconstructs them.

Every run records separate content hashes for the court directory, FTC patterns, and legal passages. These hashes identify the exact source sets used without exposing hidden reasoning.

EXPLAINER must distinguish these statements:

- “A matching CourtListener record was found.”
- “The uploaded paper was issued by the court.”

The first may be supported. The second is not established by this system.

## D1, D2, and D3 acceptance fixtures

The supplied documents are release-blocking golden tests:

| Fixture | Scenario | Expected verdict |
|---|---|---|
| `D1.pdf` | Referenced case is found and parties match | `VERIFIED` |
| `D2.pdf` | Case/reference details are altered and the required record-plus-party match is not established | `CANNOT_CONFIRM` |
| `D3.pdf` | At least two unique approved scam patterns are supported by exact document excerpts | `SCAM` |

The provided RECAP spot-check results should be stored as deterministic test fixtures or HTTP cassettes. CI must not rely on the live CourtListener service to establish these expected outcomes.

Required policy tests also cover:

- Two valid unique signals produce `SCAM`.
- Duplicate occurrences of one pattern count once.
- One signal produces `CANNOT_CONFIRM` unless the record-and-party rule independently produces `VERIFIED`.
- Case found without a party match produces `CANNOT_CONFIRM`.
- Party match without a found case produces `CANNOT_CONFIRM`.
- Two signals take precedence over a case and party match.
- Unknown pattern IDs and excerpts absent from the document do not count.
- CourtListener outage remains `unavailable` evidence and produces `CANNOT_CONFIRM` unless the scam rule is independently satisfied.
- EXPLAINER cannot change the verdict.
- Every displayed official quotation exactly equals the canonical file value.
- A document instructing the model to return a particular verdict has no effect.

## Typed run records

Every agent run returns a strict envelope rather than using `None` for failure:

```python
class AgentRunResult(BaseModel):
    analysis_id: str
    agent: Literal["reader", "checker", "explainer"]
    agent_version: str
    state: Literal["succeeded", "degraded", "failed", "skipped"]
    output_ref: str | None
    limitations: list[str]
    provider: ProviderMetadata | None
```

Each run stores attempt number, input hash, start and end time, safe error code, model and prompt version, provider request ID, token/cost usage, and output reference. Do not persist chain-of-thought or raw provider reasoning.

Each evidence item stores:

- Producing agent and version
- Source kind and source URL
- Retrieval time for external evidence
- Document hash, page, and exact text span for document evidence
- Pattern-corpus or legal-corpus version
- Deterministic validation status

## Failure behavior

- READER failure stops CHECKER and yields `CANNOT_CONFIRM` with an unreadable/unavailable limitation.
- CourtListener failure is `unavailable`, never `no_match`.
- Pattern-comparison failure is `unavailable`; zero findings are not implied.
- CHECKER can be degraded when one tool succeeds and the other is unavailable.
- EXPLAINER failure uses a deterministic safe template without changing the verdict.
- Persistence failure is surfaced; the UI does not show an unsaved analysis as part of history.
- A provider error never produces a green “complete” state.

## Durable orchestration without extra agents

The current in-request coordinator is a migration scaffold: it is process-local and has no durable retry queue, but its two CHECKER evidence branches run concurrently and emit a request-specific NDJSON trace. Production orchestration may use separate API, worker, and scheduler processes, but the product agent catalog remains exactly READER, CHECKER, and EXPLAINER.

MongoDB is the workflow source of truth. Redis/Celery may deliver work; task-result storage is not authoritative. Encrypted originals and sanitized derivatives live in S3-compatible object storage.

Collections:

- `analyses`
- `agent_runs`
- `evidence_claims`
- `analysis_events`
- `audit_log`
- `provider_cache`
- `sessions`

Important indexes:

- `analyses(owner_subject, created_at desc)`
- Unique sparse `analyses(owner_subject, idempotency_key)`
- `analyses(status, updated_at)`
- Unique `agent_runs(analysis_id, agent, agent_version, input_hash)`
- `agent_runs(state, lease_until)`
- Unique `analysis_events(analysis_id, sequence)`
- TTL indexes for sessions, provider cache, and expired file metadata

Required worker mechanics include input-hash idempotency, expiring leases, late acknowledgement, worker-loss recovery, bounded retries with jitter, provider circuit breakers, cancellation checks, and duplicate-delivery safety.

## API and synchronized UI

The current compatibility API keeps `POST /api/documents/analyze`, while `POST /api/documents/analyze/stream` emits monotonic NDJSON trace events followed by the same final response. The durable job API target is:

- `POST /api/analyses` — authenticated multipart upload with `Idempotency-Key`; returns `202`
- `GET /api/analyses/{id}` — owner-scoped result and pipeline projection
- `GET /api/analyses/{id}/events` — SSE with `Last-Event-ID` replay
- `GET /api/analyses/{id}/evidence`
- `GET /api/analyses?cursor=...`
- `POST /api/analyses/{id}/cancel`
- `POST /api/analyses/{id}/retry`
- `DELETE /api/analyses/{id}`
- `GET /api/agents/catalog` — the three configured agents
- `GET /api/ops/agents/health` — protected operational readiness
- `GET /api/health/live`
- `GET /api/health/ready`

Stable events include `analysis.created`, `agent.queued`, `agent.started`, `agent.succeeded`, `agent.degraded`, `agent.failed`, `policy.decided`, `analysis.completed`, `analysis.failed`, and `analysis.cancelled`.

The dashboard renders per-analysis run records, not process-global timestamps. Its agent pipeline contains exactly three numbered agent cards in this order:

1. READER
2. CHECKER
3. EXPLAINER

The deterministic verdict may appear between CHECKER and EXPLAINER as a visually distinct “Rules applied” checkpoint, never as an agent card. CourtListener and the FTC corpus appear as CHECKER tool details, not separate agents.

The UI distinguishes queued, running, completed, degraded, failed, skipped, empty, and unavailable states. It shows exact document excerpts, source links, canonical quotations, limitations, and the policy reason. It never substitutes zero metrics or a green status for a failed request.

## Security and privacy

- Require authentication before accepting a production analysis.
- Exchange Google credentials once, then use a short-lived Served session in an `HttpOnly`, `Secure` cookie.
- Prefer a same-origin Netlify `/api/*` proxy and CSRF protection for mutations.
- Enforce owner scope on every analysis, evidence item, event, and deletion route.
- JPEG, PNG, and PDF magic bytes and actual byte length are validated before provider work. Production hardening still needs page and decompressed-size limits.
- Sanitize PDFs, reject embedded scripts/files, and scan uploads.
- Encrypt object storage, MongoDB sensitive fields/backups, and all transport.
- Redact PII from logs and traces; store no raw model reasoning.
- Apply per-user rate limits and concurrent-analysis limits.
- Support configurable retention and complete deletion of originals, derivatives, evidence, runs, and events.

## Deployment

The current deployment can remain:

- Backend on EasyPanel using `backend/Dockerfile`, port `8000`
- Frontend on Netlify using `netlify.toml`
- MongoDB as the `served` database
- CourtListener and OpenAI credentials stored only in EasyPanel secrets
- `SERVED_CORS_ORIGINS` containing the deployed Netlify origin
- The frontend API base pointing to the EasyPanel backend URL ending in `/api`; when environment-based configuration is used, set Netlify `VITE_API_URL` to that value

For durable orchestration, EasyPanel may later run separate infrastructure services:

- `api`
- `worker`
- `scheduler`
- `redis`

Those services do not create more product agents. Workers execute only READER, CHECKER, or EXPLAINER tasks plus non-agent infrastructure operations. MongoDB and S3-compatible storage remain managed external dependencies, and API/worker capacity can scale independently.

## Rollout and release gates

### Phase 1 — Enforce the three contracts

Lock strict READER, CHECKER, and EXPLAINER schemas; keep verdict code outside the coordinator; validate excerpts; attach canonical quotes; add D1/D2/D3 golden tests.

### Phase 2 — Persist evidence and runs

Store source spans, CourtListener provenance, corpus versions, policy version, limitations, and the exact three agent runs.

### Phase 3 — Durable jobs and synchronized UI

Add object storage, queue delivery, leases, SSE events, cancellation, retry, and per-analysis dashboard state without changing the three-agent product model.

### Phase 4 — Hardening

Run provider-outage, worker-loss, duplicate-delivery, load, privacy/deletion, prompt-injection, malformed-document, and regression tests.

Release gates:

- The agent catalog contains exactly READER, CHECKER, and EXPLAINER.
- No agent output can set or modify the verdict.
- The three deterministic rules are the only verdict path.
- D1, D2, and D3 produce their expected outcomes from deterministic fixtures.
- Every counted scam signal has a known ID and exact document excerpt.
- Every displayed official quote is canonical file text with an official source URL.
- CourtListener outage never becomes no-match or fraud.
- A docket match is never described as proof that the uploaded paper is authentic.
- Every visible agent state is backed by that analysis's persisted run record.
- No cross-user access and no raw Google token in browser storage.
- Duplicate tasks are idempotent and worker-loss recovery passes.
