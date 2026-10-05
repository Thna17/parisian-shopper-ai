# Changelog

All notable changes to the Parisian Shopper AI Telegram Content System are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-10-05

### Added - Phase 1G: System Hardening, Acceptance Testing & Operational Readiness

- **Acceptance Golden Path Integration Suite (`packages/database/test/integration/acceptance-golden-path.integration-spec.ts`):**
  - Positive Golden Path verifying all 20 steps from `/create` to terminal `APPROVED` state.
  - Verification of zero premature publishing side-effects (`CONTENT_APPROVED` outbox event only; zero `PUBLISH`, `SCHEDULE`, or `META` topics).
  - Negative Golden Path verifying factual error blocking (`PRICE_MISMATCH`), exclusion of Approve button, server-side `ContentNotApprovalEligibleError`, and edit correction to V2.
  - Concurrency & resilience simulations: duplicate BullMQ delivery deduplication, stale version approval rejection, and outbox transient network failure retry and recovery.
- **Demo Mode Infrastructure:**
  - Added `DEMO_MODE` environment configuration (`packages/config`).
  - Added `[DEMO]` prefix formatting across products, drafts, job summaries, and validation reports (`packages/application/src/modules/telegram/application/telegram-formatters.ts`).
  - Updated fictional cosmetic fixture `FIC-COS-001` with deterministic promotion (25% off promo price \$9.50 USD).
- **Operational Recovery Tooling:**
  - `scripts/outbox-operations.mjs`: Outbox backlog diagnostics, age metrics, failed/dead-letter event inspection, and safe retry CLI (`pnpm outbox:status`).
  - `scripts/queue-operations.mjs`: ContentJob and BullMQ queue health report, stuck attempt detection (`AI_ATTEMPT_STALE_AFTER_MS`), and safe retry CLI with terminal state protection (`pnpm queue:status`).
  - `scripts/verify-backup-restore.mjs`: Automated end-to-end PostgreSQL backup and restore verification pipeline using `@testcontainers/postgresql` (`pnpm backup:verify`).
- **Comprehensive Documentation Suite:**
  - `/docs/mvp-acceptance-report.md`: Systematic evaluation of all 25 acceptance criteria (100% PASS).
  - `/docs/job-recovery.md`: Operational recovery guide for BullMQ and outbox backlogs.
  - `/docs/backup-and-restore.md`: PostgreSQL backup, restoration, RPO/RTO guide.
  - `/docs/security/mvp-security-review.md`: Full defense-in-depth security audit.
  - `/docs/ai-cost-controls.md`: Token usage, timeout caps, and financial modeling.
  - `/docs/management-demo-script.md`: 5–7 minute non-technical executive demo walkthrough.
  - `/docs/demo-checklist.md` & `/docs/internal-pilot-checklist.md`: Pre-flight and pilot checklists.
  - `/docs/business-confirmations-required.md`: Business decision registry for brand rules.
  - `/docs/product-api-readiness.md`: Upstream integration contract analysis.
  - `/docs/operations-runbook.md` & `/docs/incident-response.md`: Daily maintenance and P1–P4 playbooks.
  - `/docs/data-retention.md`: Data retention and table pruning schedule.
  - `/docs/release-checklist.md` & `/docs/mvp-definition-of-done.md`: Quality gates and DoD.
  - `/docs/final-engineering-review.md`: Architectural health scorecard (9.4 / 10).

### Added - Phase 1F: Human Review, Revision, Approval & Rejection

- Review state and approval status queries (`GetContentReviewStateQuery`, `GetApprovalStatusQuery`).
- Content revision workflows (`RequestContentEditUseCase`, `RequestContentRegenerationUseCase`).
- Human sign-off use cases (`ApproveContentVersionUseCase`, `RejectContentVersionUseCase`).
- Two-step approval and rejection confirmation flows with single-use action tokens.
- Terminal `APPROVED` and `REJECTED` state machine enforcement.

### Added - Phase 1E: Secure Telegram Content Workflow

- grammY Telegram bot transport with numeric Telegram User ID authorization.
- Inbound update idempotency and sliding-window rate limiting.
- Cryptographic action tokens with SHA-256 hash storage and 15-minute TTL.
- Transactional Outbox dispatcher with `FOR UPDATE SKIP LOCKED` and exponential backoff.
- Interactive bot commands: `/create`, `/search`, `/status`, `/history`.

### Added - Phase 1D: Deterministic Factual Validation

- Zero-temperature rule engine (`DeterministicFactualValidator`).
- Deterministic checks for price, currency, fragrance notes, concentration, size, origin, and discounts.
- Structured findings with severity (`INFO`, `WARNING`, `BLOCKING`) and outcome status (`PASSED`, `PASSED_WITH_WARNINGS`, `BLOCKED`, `FAILED`).
- Approval eligibility verification preventing approval of non-compliant drafts.

### Added - Phase 1C: AI Content Generation Engine

- Multi-provider abstraction (`AITextProvider`) supporting OpenAI, Google Gemini, and deterministic fixtures.
- Structured bilingual output schema (`aiContentOutputSchema`) validating Khmer and English captions, CTAs, and hashtags.
- Versioned brand rules (`BrandRuleVersion`) permanently pinned to generation records.
- Generation attempt persistence (`GenerationAttempt`) with token usage and latency metrics.

### Added - Phase 1B: Product Ingestion & Immutable Snapshots

- `ProductSource` port and `MockProductSource` implementation.
- Fictional luxury catalogue fixtures (`FIC-PERF-001`, `FIC-WATCH-001`, `FIC-COS-001`).
- `ProductSnapshot` creation with canonical SHA-256 hashing.

### Added - Phase 1A: Application Foundation

- Clean-room TypeScript monorepo with pnpm workspaces.
- NestJS modular monolith architecture.
- PostgreSQL persistence with Prisma ORM.
- Valkey cache and BullMQ job queue integration.
- Monorepo architectural boundary checker (`check-boundaries.mjs`).
- Permissive dependency license auditor (`check-licenses.mjs`).
