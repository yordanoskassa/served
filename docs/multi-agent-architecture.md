# Served multi-agent architecture

## Objective

Build an auditable legal-mail analysis system in which specialized workers produce evidence-bound outputs, failures remain visible, and the UI displays the real state of a specific analysis. The system must never imply that a real docket proves an uploaded letter is authentic.

The current in-request coordinator is a migration scaffold. It is not the production architecture: its state is process-local, its stages are sequential, and it has no durable run history.

## Safety language

Use these user-facing outcomes:

- `record_match_found`
- `warning_signals_found`
- `not_confirmed`
- `needs_review`

Do not use `verified` for a document. A fake letter can cite a real case. `no_match`, `not_applicable`, and `provider_unavailable` are distinct states.

## Workflow graph

```text
Authenticated upload
  -> Intake and security gate
  -> Document extraction
  -> Deterministic router
       |-> Fraud-signal investigator
       |-> Court-record investigator
       |-> Court-identity investigator
       |-> Contact-channel investigator
       `-> Deadline investigator
  -> Cross-evidence consistency reviewer
  -> Deterministic adjudicator
  -> Evidence-bound explanation writer
  -> Review policy
       |-> Auto-finalize
       `-> Human review -> Finalize
```

Independent nodes fan out concurrently after extraction. Routing is field- and policy-driven; an unrestricted LLM supervisor does not choose which legal checks run.

## Agent catalog

| Agent | Responsibility | Required output |
|---|---|---|
| `intake_guard` | Validate MIME and magic bytes, hash the upload, enforce byte/page limits, sanitize, and scan | Accepted/rejected status, file hash, page count, safe reason codes |
| `document_parser` | Extract visible facts without judging authenticity | Fields with page, text-span, and bounding-box citations |
| `fraud_signals` | Independently match document text to the maintained warning corpus | Pattern, exact excerpt, locator, source policy, and limitations |
| `court_records` | Query CourtListener with case number, parties, court, and dates | `match`, `near_match`, `no_match`, `unavailable`, or `not_applicable`, plus provenance |
| `court_identity` | Compare claimed court name, address, and domain with an official registry | Supporting, contradictory, unknown, or unavailable claims |
| `contact_channels` | Compare extracted phone, email, payment method, and address with official channels | Contact/payment findings with evidence |
| `deadline` | Normalize explicit dates and identify ambiguity or urgency | Cited dates, ambiguity, elapsed/approaching state; never legal advice |
| `consistency` | Compare document claims with all external findings | Supports/contradicts/unknown relationships |
| `adjudicator` | Apply a versioned deterministic evidence policy | Outcome, coverage, limitation codes, and review reasons |
| `explanation` | Convert accepted claim IDs into plain language | Summary containing no unsupported facts |
| `review_router` | Decide whether policy permits auto-finalization | Finalize or durable human-review task |

An agent without a configured authoritative source reports `unavailable`; it is not displayed as healthy or silently skipped.

## Typed contracts

Every worker returns a strict result. Workers never signal a provider outage by returning `None`.

```python
class AgentResult(BaseModel):
    run_id: str
    analysis_id: str
    agent_key: str
    agent_version: str
    state: Literal["succeeded", "degraded", "failed", "skipped"]
    findings: list[Finding]
    claims: list[EvidenceClaim]
    limitations: list[str]
    provider: ProviderMetadata | None
```

Each `EvidenceClaim` contains:

- Stable claim ID and typed value
- Stance: `supports`, `contradicts`, `observes`, or `unknown`
- Source kind, URL/provider, and retrieval time
- Document hash, page, text span, and bounding box when document-derived
- Producing agent and policy version
- Reliability band based on source class, not an invented probability

Each `AgentRun` stores attempt number, input hash, lease, start/end time, latency, safe error code, prompt/model/version, provider request ID, token/cost usage, and output reference. Do not persist chain-of-thought or raw provider reasoning.

## Durable state

MongoDB is the workflow source of truth. Redis/Celery delivers work; Celery result storage is not authoritative. Private encrypted originals and sanitized derivatives live in S3-compatible storage.

Collections:

- `analyses`
- `agent_runs`
- `evidence_claims`
- `analysis_events`
- `review_tasks`
- `audit_log`
- `provider_cache`
- `sessions`

Important indexes:

- `analyses(owner_subject, created_at desc)`
- Unique sparse `analyses(owner_subject, idempotency_key)`
- `analyses(status, updated_at)`
- Unique `agent_runs(analysis_id, agent_key, agent_version, input_hash)`
- `agent_runs(state, lease_until)`
- Unique `analysis_events(analysis_id, sequence)`
- `review_tasks(status, priority desc, created_at)`
- TTL indexes for sessions, provider cache, and expired file metadata

## Orchestration

The graph is declarative. Each node declares dependencies, routing condition, timeout, retry policy, queue, and whether failure is critical.

A generic worker receives only `analysis_id` and `node_key`:

1. Acquire an atomic Mongo lease.
2. Load validated inputs by reference.
3. Execute the agent with provider-specific timeout and bounded retry.
4. Validate its typed output.
5. Persist the run, claims, and append-only event.
6. Call `advance_workflow()` to schedule newly ready nodes.

Required mechanics:

- Late acknowledgement and worker-loss requeue
- Input-hash idempotency
- Expiring atomic leases and a recovery scheduler
- Exponential backoff with jitter
- Dead-letter state after bounded retries
- Per-provider queues, concurrency limits, and circuit breakers
- Cancellation checks before every node
- Duplicate delivery safety

## API

- `POST /api/analyses` — authenticated multipart upload; requires `Idempotency-Key`; returns `202`
- `GET /api/analyses/{id}` — owner-scoped workflow projection and result
- `GET /api/analyses/{id}/events` — SSE with `Last-Event-ID` replay
- `GET /api/analyses/{id}/evidence`
- `GET /api/analyses?cursor=...`
- `POST /api/analyses/{id}/cancel`
- `POST /api/analyses/{id}/retry`
- `DELETE /api/analyses/{id}`
- `POST /api/analyses/{id}/request-review`
- `GET /api/reviews` — reviewer role only
- `POST /api/reviews/{id}/decision` — reviewer role and reason required
- `GET /api/agents/catalog` — configured capabilities
- `GET /api/ops/agents/health` — protected operational health
- `GET /api/health/live`
- `GET /api/health/ready`

Stable SSE events:

- `analysis.created`
- `agent.queued`
- `agent.started`
- `agent.succeeded`
- `agent.degraded`
- `agent.failed`
- `review.required`
- `analysis.completed`
- `analysis.failed`
- `analysis.cancelled`

Events expose safe progress and evidence counts, never hidden reasoning or raw provider errors.

## Synchronized UI

The UI renders persisted runs for the selected analysis. Global `/agents/status` is system readiness only.

Flow:

1. Upload creates an analysis and returns its ID.
2. Navigate to `/dashboard/analyses/{id}`.
3. Subscribe to its SSE stream.
4. Render actual nodes as `queued`, `running`, `completed`, `degraded`, `failed`, or `skipped`.
5. Show duration, contribution summary, citations, limitations, and retry/review state.
6. On completion, invalidate dashboard counts and document history.
7. On reconnect, replay from `Last-Event-ID`, then reconcile with `GET /analyses/{id}`.

Frontend additions:

```text
frontend/src/hooks/useAnalysisStream.ts
frontend/src/components/analysis/AnalysisWorkspace.tsx
frontend/src/components/analysis/AgentPipeline.tsx
frontend/src/components/analysis/AgentStage.tsx
frontend/src/components/analysis/EvidencePanel.tsx
frontend/src/components/analysis/ReviewBanner.tsx
frontend/src/components/analysis/LimitationsPanel.tsx
```

The dashboard must distinguish loading, empty, degraded, and unavailable states. It must never substitute zero metrics or green agent cards for a failed request.

## Human review

Create a review task when:

- Extraction is unreadable or materially ambiguous
- A court-record match conflicts with warning signals
- CourtListener returns a near match
- A required provider is unavailable
- A cited deadline is imminent or ambiguous
- A configured high-stakes document type lacks sufficient evidence
- The user requests review

Reviewers see the source, cited extracted fields, provider evidence, limitations, and policy reason codes. They may confirm the assessment, correct extraction, request a clearer upload, or override with a mandatory reason. Every action is append-only audited. Human review does not itself mean authenticity.

## Security and privacy

- Require authentication before accepting a production analysis.
- Exchange Google credentials once, then use a short-lived Served session in an `HttpOnly`, `Secure` cookie.
- Prefer a same-origin Netlify `/api/*` proxy and apply CSRF protection to mutations.
- Enforce owner scope on every analysis, evidence, event, and deletion route.
- Enforce reviewer and operations roles separately.
- Sniff file type, cap bytes/pages/decompressed size, sanitize PDFs, reject embedded scripts/files, and scan uploads.
- Encrypt object storage, MongoDB sensitive fields/backups, and all transport.
- Redact PII from logs and traces; store no raw model reasoning.
- Add per-user rate limits, concurrent-analysis limits, and provider egress restrictions.
- Implement configurable retention and complete deletion of files, derivatives, claims, runs, and events.

## Failure model

- Expected provider errors become typed `degraded` results after bounded retry.
- Infrastructure failures retry and eventually dead-letter.
- Contract violations receive one repair attempt, then route to review or failure.
- Parser failure stops dependent agents.
- Worker crashes recover through expired leases.
- `court_records=no_match` never means fraud.
- `court_records=unavailable` never becomes `no_match`.
- Persistence failure is surfaced as unavailable, not an empty dashboard.

## Observability

Instrument FastAPI, Celery, MongoDB, HTTPX, and OpenAI with OpenTelemetry. Structured logs include `trace_id`, `analysis_id`, `run_id`, and safe error codes.

Track:

- Queue depth and oldest-job age
- Stage and total workflow duration
- Completion, degraded, retry, and dead-letter rates
- Provider availability and circuit state
- Token/cost usage
- Review rate and reason distribution
- Outcome and evidence-coverage distribution

Liveness checks the process only. Readiness checks MongoDB, Redis, object storage, required configuration, and queue connectivity.

## Deployment topology

EasyPanel runs separate services:

- `api`
- `worker`
- `scheduler`
- `redis`

MongoDB and S3-compatible object storage remain external managed dependencies. Scale API and workers independently.

## Rollout

### Phase 1 — Contracts and safety

Introduce typed agent results, explicit failure taxonomy, safer outcome language, ownership checks, evidence citations, and indexes.

### Phase 2 — Durable jobs

Add object storage, Mongo workflow state, Redis/Celery, idempotency, leases, events, and recovery. Initially execute the existing analyzer as one legacy node.

### Phase 3 — Independent agents

Split the real investigators, add deterministic routing and parallel fan-out, and run the new graph in shadow mode against current outputs.

### Phase 4 — Synchronized workspace

Ship asynchronous upload, run-specific SSE, evidence and limitation panels, dashboard invalidation, cancellation, and retry.

### Phase 5 — Human review

Add roles, review queue, decision audit, user-facing pending/reviewed states, and escalation policy.

### Phase 6 — Hardening

Run worker-kill recovery tests, provider-outage tests, concurrency/load tests, retention/deletion drills, adversarial document tests, canaries, and staged rollout.

Release gates:

- No cross-user access
- No raw Google token in browser storage
- Worker-kill recovery passes
- Duplicate tasks are idempotent
- CourtListener outage never becomes a negative match
- Every visible pipeline stage is backed by an `agent_runs` record
- Evidence claims retain source and document citations
- No user-facing claim that a matched docket authenticates a letter
