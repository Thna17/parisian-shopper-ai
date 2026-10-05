# MVP Definition of Done (DoD)

**Document:** `/docs/mvp-definition-of-done.md`  
**System:** Parisian Shopper AI Telegram Content System (Phase 1 MVP)  
**Standard:** Clean-Room Production Grade  

---

## 1. Architectural & Domain Invariants

A feature or phase is considered **DONE** only when the following architectural invariants are strictly preserved:

1. **Clean-Room Monolith Boundaries:**
   - Monorepo package dependencies flow strictly downward (`common` -> `config` -> `domain` -> `application` -> `database` / `telegram` / `jobs` -> `apps`).
   - Circular imports and package leakage are prevented via `pnpm boundaries:check`.
2. **Immutable Snapshots:**
   - Content generation never queries mutable upstream systems directly. A cryptographic `ProductSnapshot` with SHA-256 hash is created first and permanently referenced.
3. **Deterministic Factual Grounding:**
   - Every generated draft undergoes zero-temperature rule-based factual validation (`DeterministicFactualValidator`) before human review.
   - Price, currency, notes, discounts, and origins are verified against the snapshot.
4. **Transactional Outbox Delivery:**
   - Downstream notifications are never sent synchronously inside domain transactions. Events are persisted to `outbox_events` and leased asynchronously with `SKIP LOCKED`.
5. **Terminal State Inviolability:**
   - `APPROVED` and `REJECTED` states are strictly final. Database constraints and transaction checks prohibit subsequent edits, regenerations, or re-approvals.
6. **Strict Scope Discipline:**
   - Zero social publishing APIs, zero scheduling engines, zero Meta/Instagram integrations, zero auto-posting.

---

## 2. Security & Access Standards

1. **Numeric Telegram Authorization:**
   - Authorization is mapped strictly to immutable numeric Telegram User IDs (`BigInt`).
   - Unauthorized update attempts are rejected with security audit logging.
2. **Cryptographic Action Tokens:**
   - Inline keyboard actions use random base64url tokens with SHA-256 hash storage.
   - Single-use consumption and 15-minute TTL enforced; tokens bound to specific recipient user.
3. **Role-Based Access Control (RBAC):**
   - Distinct roles enforced: `VIEWER`, `MARKETING_EDITOR`, `MARKETING_APPROVER`, `ADMIN`.
   - Editors cannot approve or reject; approvers require explicit two-step confirmation.

---

## 3. Engineering Quality Gates

All 10 automated quality gates must execute with zero failures and zero warnings:

- [x] `pnpm format:check` (Prettier code style)
- [x] `pnpm lint` (ESLint 9 + TypeScript-ESLint strict rules)
- [x] `pnpm boundaries:check` (Boundary assertion script)
- [x] `pnpm typecheck` (Strict TypeScript project references)
- [x] `pnpm test:unit` (100% passing unit tests)
- [x] `pnpm test:integration` (Testcontainers PostgreSQL + Valkey integration tests)
- [x] `pnpm test:e2e` (Full API and worker end-to-end suite)
- [x] `pnpm license:check` (Permissive MIT/Apache-2.0 dependency audit)
- [x] `pnpm security:check` (pnpm audit production dependencies)
- [x] `pnpm build` (Clean monorepo build)

---

## 4. Documentation & Operational Readiness

- [x] Complete acceptance report (`/docs/mvp-acceptance-report.md`).
- [x] Operational diagnostic and recovery tooling documented (`/docs/job-recovery.md`).
- [x] Disaster recovery and backup restoration guide (`/docs/backup-and-restore.md`).
- [x] Non-technical management demo script (`/docs/management-demo-script.md`).
- [x] Pilot launch checklist and participant onboarding (`/docs/internal-pilot-checklist.md`).
- [x] Business questions and brand guideline registry (`/docs/business-confirmations-required.md`).
- [x] Operations daily runbook and incident response protocols.
