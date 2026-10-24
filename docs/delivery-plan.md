# Phased delivery plan

> **Superseded for new implementation work (2026-10-16).** This document describes the earlier approval-only MVP sequence. Use [`master-engineering-blueprint-v3.md`](./master-engineering-blueprint-v3.md) for product direction and [`implementation-plan-v1.md`](./implementation-plan-v1.md) for the current AI execution plan. Retain this file as historical planning context.

**Strategy:** deliver one independently designed, testable vertical slice from fictional product data to `APPROVED`, then harden it before any creative or publishing expansion.

## Global gates

- No phase may weaken the architecture invariants, append-only evidence, or deterministic approval gate.
- Production Product API access is prohibited until its owner approves the contract, authentication, and sanitized test fixtures.
- Publishing is not part of Phase 0 or Phase 1. `APPROVED` is terminal and publishing code/credentials are absent.
- Each new dependency passes license, maintenance, and security review.
- A phase exits only when its tests, documentation, operations notes, and demonstrated failure paths meet the stated criteria.

## Phase 0 — Architecture and data readiness

**Objective:** approve the clean-room foundation and make external data/security assumptions explicit before application code.

**Major deliverables**

- Accepted ADR-002 and superseded ADR-001.
- System architecture, threat model, development rules, acceptance plan, and delivery plan.
- Reviewed normalized Product API contract using fictional examples.
- Dependency license register and clean-room provenance policy.
- Named Product API owner, technical contact, and decision list.

**Dependencies:** management's Option C approval; existing business requirements; read-only research already completed.

**Exit criteria**

- Architecture documents are internally reviewed.
- All twelve invariants are traceable to design and acceptance tests.
- Product API contract is sufficient for scaffolding and fictional contract tests.
- Management understands that real integration waits for owner-confirmed semantics/fixtures.

**Risks:** undocumented Product API behavior; requirements drift; accidental reuse of restricted source; incomplete operational ownership.

## Phase 1A — Project foundation

**Objective:** establish a secure, reproducible modular-monolith skeleton without business features.

**Major deliverables**

- New clean-room repository structure/entrypoints for API and worker using NestJS, strict TypeScript, pnpm, and pinned versions.
- PostgreSQL, Valkey, and Compose development environment; Prisma baseline and migration workflow.
- CI for format/lint/typecheck/unit/integration tests, dependency/license/security scan, SBOM, and `/research` exclusion.
- Typed configuration and feature flags, startup validation, health/readiness, Pino redaction/correlation, secret-safe example configuration.
- Module-boundary checks, database runtime/migration roles, transaction/outbox abstractions, and fictional-fixture conventions.

**Dependencies:** Phase 0 architecture acceptance; infrastructure/runtime choice; license verification of exact pinned versions.

**Exit criteria**

- API and worker start locally from one independently created codebase.
- Empty migrations apply to clean PostgreSQL; Valkey/BullMQ compatibility smoke test passes.
- CI rejects boundary violations, unapproved licenses, secrets, and application inclusion of `/research`.
- No publishing route/module/dependency/credential exists.

**Risks:** premature abstraction; dependency/version incompatibility; Docker Desktop terms; CI supply-chain exposure.

## Phase 1B — Product Source

**Objective:** reliably normalize fictional Product Source records into immutable snapshots while preserving a fail-closed boundary for a separately approved future HTTP adapter.

**Major deliverables**

- Product Source port and fake adapter with fictional success/error fixtures.
- Documented REST/auth/versioning/search/pagination decision gate; no HTTP adapter or credentials in the fixture-only Phase 1B scope.
- Strict Zod normalized schemas, exact decimals, lifecycle and promotion evaluation, source metadata, canonical digest.
- Product search/exact-SKU application services and immutable ProductSnapshot persistence.
- Documented timeout, bounded retry, rate-limit, SSRF/host, and freshness requirements plus reusable adapter contract tests.

**Dependencies:** Phase 1A and fictional contract fixtures. Product API owner answers, a sandbox, and a secret-management path remain dependencies for a later HTTP adapter.

**Exit criteria**

- Known/unknown SKU, bounded search, normalized-schema, and adapter contract suites pass entirely on fictional fixtures.
- Malformed controlled fields and invalid source responses fail closed; HTTP-specific status/timeout behavior remains unimplemented until an owner-approved raw contract exists.
- Application repository APIs and database enforcement prevent mutation/deletion of ProductSnapshot.
- No production API is accessed.

**Risks:** upstream lacks version timestamps/tombstones; unstable search; ambiguous SKU/currency/promotion/stock; signed image retention.

## Phase 1C — AI generation

**Objective:** generate structured bilingual candidate content asynchronously without coupling business code to one provider.

**Major deliverables**

- `AITextProvider` port, deterministic fake adapter, and initial OpenAI adapter.
- Versioned separate system, brand, strategy, product-data, and reviewer-instruction context sections.
- Strict structured-output schema for headline, captions, CTA, hashtags, creative brief, facts used, warnings, and missing information.
- ContentJob, BrandRuleVersion, GenerationAttempt, ContentVersion persistence foundations.
- Transactional outbox, BullMQ worker, retry/timeout/backoff/dead-job/reconciliation behavior, and usage/cost metadata.

**Dependencies:** Phase 1B snapshots; Phase 1A queue/outbox; approved brand voice and Khmer/English fixture examples; AI provider key/budget for isolated smoke tests.

**Exit criteria**

- Fictional snapshot produces a schema-valid V1 asynchronously with traceable rule/strategy/provider versions.
- Provider timeout, malformed output, refusal, 429, 5xx, crash, and duplicate delivery tests pass.
- No silent fallback; no raw secrets/prompts in logs; append-only V1 is enforced.

**Risks:** Khmer quality; provider structured-output variation; token cost; prompt injection; uncertain provider completion after timeout.

## Phase 1D — Fact validation

**Objective:** prevent approval of any detected contradiction or unsupported protected fact using deterministic code.

**Major deliverables**

- Versioned validation engine and INFO/WARNING/BLOCKING results.
- Exact price/currency/promotion, name/brand/SKU, stock, size, concentration, notes, origin, and similarity-claim rules.
- Unicode/locale normalization and full-field scanning across Khmer/English/headline/CTA/hashtags/creative brief.
- Content-type eligibility rules and approval-eligibility query.
- Adversarial and boundary fixture corpus.

**Dependencies:** Phase 1B normalized semantics; Phase 1C structured content; owner-approved phrase/locale rules and similarity governance.

**Exit criteria**

- Every data-integrity and AI-security case in the acceptance plan has deterministic expected results.
- A database-backed approval precondition cannot pass with a failed BLOCKING result.
- Validator version/evidence is immutable and traceable; AI is never called to decide factual correctness.

**Risks:** natural-language claim extraction gaps, Khmer tokenization/number formats, false positives, unsupported legal/marketing claims beyond product facts.

## Phase 1E — Telegram

**Objective:** provide secure Telegram discovery and `/create <SKU>` interaction while keeping transport logic thin.

**Major deliverables**

- grammY adapter for `/start`, `/help`, `/create`, `/search`, `/newproducts`, `/promo`, `/status`, and `/history` with capability-gated commands.
- Numeric-ID identity mapping and centralized role authorization.
- Durable update inbox/deduplication, opaque single-use callback tokens, rate limits, safe message rendering and pagination.
- Content-type selection, asynchronous status, review notification, and View Source.
- Production webhook design; local test transport/long polling only as configured.

**Dependencies:** Phases 1B–1D; approved test bot; staff enrollment/role process; webhook hosting decision for production.

**Exit criteria**

- `/create <SKU>` reaches validated V1 using fictional/sandbox product data and fake/approved AI adapter.
- Unknown/disabled IDs, duplicate updates, forged/replayed callbacks, oversized input, and Telegram delivery failure pass tests.
- Telegram handlers contain no business transition or vendor persistence logic.

**Risks:** message/callback size limits, account takeover, webhook exposure, user confusion over snapshot age, Telegram outage.

## Phase 1F — Review, revision, and approval

**Objective:** complete the audited Edit/Regenerate/Reject/Approve workflow, stopping at `APPROVED`.

**Major deliverables**

- Explicit transition service and optimistic concurrency control.
- Append-only V2/V3 creation for edit and regeneration; reviewer-instruction policy.
- Immutable ApprovalEvent for exact version; approver policy; stale-version protection.
- Full status/history/source review UX and conflict/recovery messages.
- Runtime append-only database grants/triggers and audit-event coverage.

**Dependencies:** Phases 1C–1E; approval role/separation-of-duties management rule.

**Exit criteria**

- Concurrent edit/regenerate/approve/reject tests produce one valid outcome with no overwritten version.
- Editors cannot approve; approvers can approve only latest valid version; obsolete callbacks fail.
- `APPROVED` is terminal and no publish behavior exists server-side.
- Complete fictional demonstration from `/create` through approval is auditable.

**Risks:** concurrency bugs, role misconfiguration, excessive instruction retention, reviewer bypass expectations.

## Phase 1G — Hardening, testing, and demo

**Objective:** demonstrate production readiness for the internal approval-only MVP.

**Major deliverables**

- Completed acceptance, integration, contract, adversarial, load/rate, and recovery suites.
- Threat-model refresh, dependency/SBOM/license/vulnerability report, backup/restore test, migration rehearsal.
- Metrics/alerts for queue age, failures, duplicate suppression, provider latency/spend, validation blocks, and authorization denials.
- Runbooks for provider/API/Telegram outage, dead jobs, key rotation, staff offboarding, restore, and incident response.
- Staff demo/training and documented product limitations.

**Dependencies:** all Phase 1 capabilities; production infrastructure/secret/log/backup decisions; sanitized operational accounts.

**Exit criteria**

- Acceptance plan passes on a release candidate; no unresolved high-risk finding affects the core invariants.
- Restore and worker/outbox recovery are demonstrated.
- Management signs off on approval-only scope and operational ownership.
- Architecture check proves absence of publishing paths/credentials.

**Risks:** inadequate operational staffing, untested restore, unexpected Khmer content quality, upstream/provider production differences.

## Phase 2 — Creative and image automation

**Objective:** add controlled visual ideation/generation after MVP stability; do not implement during Phase 1.

**Major deliverables:** new AIImageProvider ADR and threat model; source-asset rights/provenance; image moderation; versioning/approval; cost controls; “New Visual” UX.

**Dependencies:** Phase 1G; brand/legal approval for image use; storage/media architecture and retention decision.

**Exit criteria:** visual output is separately versioned/approved, rights and safety controls are documented, and text/product facts remain protected.

**Risks:** intellectual property, likeness/brand misuse, unsafe imagery, asset SSRF/storage cost, model provenance.

## Phase 3 — Official Facebook/Instagram publishing

**Objective:** add explicitly authorized official Meta publishing and scheduling; do not implement or provision credentials before this phase.

**Major deliverables:** new publishing ADR/state machine, Meta terms/API review, account/token security, channel formatting, schedule/outbox delivery, reconciliation, kill switch, audit and permission model.

**Dependencies:** Phase 1G; official Meta application/account approval; management authorization; legal/security review; operational support.

**Exit criteria:** only exact approved versions can be deliberately scheduled/published by authorized roles; `APPROVED`, `SCHEDULED`, and `PUBLISHED` remain distinct and reconciled.

**Risks:** platform/API changes, token compromise, duplicate/incorrect publication, rate limits, policy violations, production incident impact.

## Phase 4 — Performance intelligence

**Objective:** use channel outcomes to inform humans and content strategy without rewriting historical facts or autonomously publishing.

**Major deliverables:** analytics ingestion/governance, attribution model, dashboards, experiments, recommendation evidence, retention/privacy controls, campaign/live-selling planning interfaces.

**Dependencies:** Phase 3 stable publication/identity data; analytics consent/terms and metric definitions; sufficient data quality/volume.

**Exit criteria:** metrics are traceable, recommendations are explainable and non-authoritative, experiments are approved, and no feedback loop can change canonical product facts.

**Risks:** misleading attribution, platform metric changes, biased sparse data, privacy/retention, automation overreach.

## Recommended first implementation increment

After architecture review, execute **Phase 1A only**: create the clean-room NestJS/pnpm modular-monolith skeleton with API and worker entrypoints, strict configuration/logging, empty module boundaries, PostgreSQL/Valkey Compose services, Prisma migration baseline, transactional-outbox interface, and CI/license/provenance checks. Do not implement Telegram, Product API, AI, validation, approval, or publishing behavior in that increment.
