# W11 — Freshness-Aware Product Snapshots and Dependency Hashes Implementation Evidence

**Document:** `/docs/implementation-evidence/W11-freshness-aware-snapshots.md`  
**Work Package:** W11 — Add Freshness-Aware Product Snapshots and Dependency Hashes  
**Phase:** Stage 1 — Real Product and Campaign Truth  
**Classification:** `IMPLEMENTED — PRODUCTION ACTIVATION BLOCKED BY W03-DEC-002`  
**Execution Date:** 2026-10-19  

---

## 1. Executive Summary

Work package **W11 — Add Freshness-Aware Product Snapshots and Dependency Hashes** has been fully implemented, verified, and accepted through live PostgreSQL integration and end-to-end unit test suites in accordance with the Master Engineering Blueprint v3.0 (§8, §26.2, §29), the Foundational Freshness Specification (`/docs/specifications/product-freshness-and-campaign-integrity.md`), and the Implementation Plan v1.0 (§7).

### Current Status and Acceptance Gate

- **Classification:** `IMPLEMENTED — PRODUCTION ACTIVATION BLOCKED BY W03-DEC-002`
- **Technical Status:** Complete. All 10 acceptance directives have been implemented and verified:
  1. Policy-version hash decoupled from activation state (`calculatePolicyVersionHash`, retaining `calculatePolicyHash` as alias).
  2. Real lifecycle transitions (`DRAFT` -> `APPROVED` -> multi-env -> `RETIRED`) via public repository behavior.
  3. Monotonic activation sequencing with `sequence BigInt @default(autoincrement())` / `BIGSERIAL` and composite index `[environment, activatedAt, sequence]`.
  4. Per-environment fallback resolution (staging policy does not disable dev fallback; explicit draft/retired never bypassed).
  5. Real PostgreSQL unit-of-work success cases (material change, unchanged refresh, source unavailable, out-of-stock).
  6. Real concurrent idempotency collision recovery and cross-scope isolation on PostgreSQL.
  7. Genuine pre-W11 migration upgrade test (applied 7 pre-W11 migrations, inserted pre-W11 snapshot, applied W11 migration, verified full compatibility).
  8. Policy transaction failure rollback (PostgreSQL rolls back newly created policy version on activation failure) and inclusive exact activation time.
  9. Full quality gates green across the entire monorepo (`typecheck`, `boundaries:check`, `lint`, Prettier, `prisma:validate`, `test:unit`, W10 regressions, W11 live PostgreSQL integration suite).
- **Production Activation Blocker:** Production deployment remains strictly gated by `W03-DEC-002` (owner confirmation of PostgreSQL 17 JSONB extraction index strategy and long-term retention window).

---

## 2. Technical Architecture & In-Place Repairs

### 2.1 Resolution of Policy Immutability Contradiction & Version Decoupling
- Split the policy architecture into two strictly append-only database constructs:
  1. `freshness_policy_versions`: Immutable policy specification table (`policy_id`, `version`, TTL values, `policy_hash`, `created_at`). Protected by PostgreSQL append-only trigger `reject_freshness_policy_version_mutation`.
  2. `freshness_policy_activations`: Append-only activation ledger (`id`, `sequence BIGSERIAL`, `policy_version_id`, `environment`, `lifecycle_state`, `activated_at`, `activated_by`). Protected by PostgreSQL append-only trigger `reject_freshness_policy_activation_mutation`.
  3. `calculatePolicyVersionHash`: Hashes solely immutable policy identity and TTL values (`policyId`, `version`, and the 7 TTL fields), completely decoupled from mutable operational state (`environment`, `lifecycleState`). `calculatePolicyHash` is preserved as a backwards-compatible alias.
  4. `PrismaFreshnessPolicyRepository`:
     - Injected with `Clock` (with fallback to `SystemClock`) and supports `evalTime?: Date`.
     - Queries latest activation where `environment = targetEnv` and `activatedAt <= evalTime` ordered by `{ activatedAt: 'desc' }, { sequence: 'desc' }`.
     - If latest activation is `APPROVED`, returns policy.
     - If latest activation is `RETIRED` or `DRAFT`, returns `null`.
     - Future-dated activations (`activatedAt > evalTime`) are ignored.
     - Resolves timestamp ties deterministically using `sequence DESC`.
     - Checks per-environment activation history: development and test fallback to the approved benchmark only if no activations exist in that specific environment; explicit DRAFT/RETIRED activations in dev are never bypassed. Production and staging fail closed.

### 2.2 Atomic Policy Version and Activation Creation
- `PrismaFreshnessPolicyRepository.create(policy)` executes within `this.prisma.$transaction`.
- Validates supplied `policyHash` against the calculated hash of the supplied TTL configuration.
- Checks whether `(policyId, version)` already exists in `freshness_policy_versions`. If it exists with a differing hash, throws a conflict error (`Conflict: FreshnessPolicyVersion already exists with differing hash`). If it matches, appends a new activation record to the ledger.

### 2.3 True Transactional Atomicity via Unit of Work
- Implemented `ProductRevalidationUnitOfWork` port and `PrismaProductRevalidationUnitOfWork`.
- All snapshot writes, assessment writes, and outbox event writes execute within an atomic `this.prisma.$transaction(async (tx) => { ... })`.
- Verified on real PostgreSQL:
  - Snapshot creation failure rolls back transaction.
  - Assessment creation failure rolls back snapshot and transaction.
  - Outbox creation failure rolls back snapshot, assessment, and transaction.

### 2.4 FreshnessEvaluator Domain Service
- Created `FreshnessEvaluator` domain service:
  - `evaluateTimeDecay`: Evaluates snapshot degradation against policy TTLs with strict millisecond boundary inclusivity ($\le$ within tier, $>$ exceeds tier).
  - `evaluateRevalidation`: Evaluates upstream comparison deltas (`FRESH`, `NON_MATERIAL_CHANGE`, `MATERIAL_CHANGE`, `SOURCE_UNAVAILABLE`, `PROMOTION_EXPIRED`, `OUT_OF_STOCK`), computing `changedScopes` and `preservedScopes`.
  - Unit test suite (`freshness-evaluator.spec.ts`) covers exact millisecond boundaries, promotion start/end boundaries, and outage precedence over hard expiration caps (15/15 tests passing).

### 2.5 Strict Policy and Assessment Gate Enforcement
- Hardened `ProductEligibilityEvaluator` to fail closed for `FINAL_APPROVAL` and `EXPORT` if:
  - No active policy is configured (`FRESHNESS_POLICY_MISSING`).
  - Active policy is not approved (`POLICY_NOT_APPROVED`).
  - Snapshot has no assessment (`ASSESSMENT_MISSING`).
  - Assessment policy version does not match active policy version (`POLICY_VERSION_MISMATCH`).
  - Upstream source is unreachable (`UPSTREAM_UNAVAILABLE`).
  - Product is out of stock (`OUT_OF_STOCK`).
  - Promotion has expired and manifest requires promotion (`PROMOTION_EXPIRED`).
  - Facts are aging or stale (`STOCK_STALE`, `PRICE_STALE`).
- Unit test suite in `product-eligibility-evaluator.spec.ts` (18/18 tests passing).

### 2.6 Hardened Idempotency Keys and Concurrency Handling
- Replaced unbounded string concatenation with canonical SHA-256 scoping:
  $$\text{reval:v1:}\text{SHA-256}(\text{canonicalJson}(\{\text{actorUserId}, \text{callerKey}, \text{environment}, \text{operation: 'revalidate'}, \text{policyId}, \text{policyVersion}, \text{targetId}\}))$$
- Formats keys as fixed-length strings (`reval:v1:<64-hex-sha256>`), eliminating any risk of `VARCHAR(200)` buffer overflow regardless of input key lengths.
- Concurrency collision handling: wrapped unit of work execution in try/catch to catch unique constraint violations (`P2002` / `23505`) on `idempotency_key`, gracefully re-querying and returning the winning committed assessment.

### 2.7 Truthful Invalidation Outbox Event
- Renamed the material drift invalidation event from `approval.rendered_ineligible_by_fact_change` to `approval.invalidation_requested_by_fact_change`.
- Enriched payload with complete audit trail:
  - `previousSnapshotId`
  - `newSnapshotId`
  - `sku`
  - `changedScopes`
  - `preservedScopes`
  - `assessmentId`
  - `policyId`
  - `policyVersion`
  - `correlationId`
  - `evaluatedAt`

### 2.8 Legacy Snapshot Compatibility
- `PrismaProductSnapshotRepository.toSnapshotDomain`:
  - When loading pre-W11 records where scoped hashes are `NULL`, falls back to computing scoped dependency hashes on the fly.
  - Preserves the original `record.snapshotHash` in `dependencyHashes.full`.

---

## 3. Worktree Safety and Baseline Preservation

Strict worktree safety constraints were preserved throughout:
- **Branch:** `feat/sharp-hero-compositor`
- **HEAD:** `be92bce6be0afe49ade297a20b967317389446a3`
- **Staging Area:** 0 files staged (`git diff --cached --name-only` empty).
- **Pre-existing Work:** All pre-existing modified and untracked user files preserved untouched.
- **Git Commits:** Zero commits created.

---

## 4. Verification & Quality Gates

### 4.1 Quality Gate Summary

| Quality Gate | Command | Result | Details |
| :--- | :--- | :--- | :--- |
| **TypeScript Compilation** | `pnpm typecheck` | **PASS (Exit 0)** | Zero type errors across all packages and apps (`tsc -b --pretty false`). |
| **Architectural Boundaries** | `pnpm boundaries:check` | **PASS (Exit 0)** | Zero architectural boundary violations (`check-boundaries.mjs`). |
| **ESLint Static Analysis** | `pnpm lint` | **PASS (Exit 0)** | Zero lint warnings, zero lint errors (`eslint . --max-warnings 0`). |
| **Prettier Formatting** | `pnpm prettier --check <modified>` | **PASS (Exit 0)** | All modified files conform to Prettier code style. |
| **Prisma Validation** | `pnpm prisma:validate` | **PASS (Exit 0)** | Schema valid, models formatted and synchronized. |
| **Full Unit Test Suite** | `pnpm test:unit` | **PASS (Exit 0)** | 66 passed suites, 648 passed tests (1 skipped). |
| **W10 Regression Suite** | W10 test group | **PASS (Exit 0)** | 63/63 tests passed across Mekhla adapter, schema, and normalization boundaries. |
| **W11 Products Suite** | Products unit test suite | **PASS (Exit 0)** | 156/156 tests passed across 13 suites in `packages/application/src/modules/products/`. |
| **Live PostgreSQL Container Suite** | `pnpm test:integration` | **PASS (Exit 0)** | 21/21 tests passed on `postgres:17.6-alpine` via `@testcontainers/postgresql`. |

### 4.2 PostgreSQL Integration Test Output

```
$ TESTCONTAINERS_RYUK_DISABLED=true node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.integration.config.cjs --runInBand --runTestsByPath packages/database/test/integration/freshness-snapshots.integration-spec.ts
(node:77529) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
PASS integration packages/database/test/integration/freshness-snapshots.integration-spec.ts (8.823 s)
  Freshness Snapshots and Policy Immutability Integration Tests
    1. PostgreSQL Immutability Triggers
      ✓ enforces append-only triggers on product_snapshots (61 ms)
      ✓ enforces append-only triggers on freshness_policy_versions and activations (32 ms)
      ✓ enforces append-only triggers on product_freshness_assessments (11 ms)
    2. Unit of Work Atomic Rollback
      ✓ rolls back snapshot, assessment, and outbox when outbox event fails (15 ms)
      ✓ rolls back snapshot when assessment creation fails (12 ms)
    3. Real PostgreSQL Success Cases
      ✓ A. Material change success: creates exactly one new snapshot, assessment, and all expected outbox events (18 ms)
      ✓ B. Unchanged refresh success: creates no new snapshot, one assessment, only freshness-assessed outbox event (11 ms)
      ✓ C. Source unavailable: preserves existing snapshot, creates SOURCE_UNAVAILABLE assessment and outage event (12 ms)
      ✓ D. Out-of-stock and promotion-expired behavior: persists correct outcomes without product deletion (15 ms)
    4. Real Concurrent Idempotency & Collision Recovery
      ✓ executes two concurrent identical requests: both succeed, 1 assessment created, winning result returned (50 ms)
      ✓ proves callerKey remains isolated across different products, actors, and environments (44 ms)
    5. Real Policy Lifecycle Transitions via Repository
      ✓ supports DRAFT -> APPROVED -> multi-env -> RETIRED transitions through repository without conflict (23 ms)
    6. Monotonic Activation Event Ordering
      ✓ breaks ties deterministically using sequence DESC when activatedAt timestamps match (8 ms)
    7. Development and Test Fallback Resolution
      ✓ unrelated staging policy does not disable development fallback (6 ms)
      ✓ explicit DRAFT or RETIRED activation in development does NOT get bypassed by fallback (4 ms)
      ✓ production and staging never receive an implicit fallback (2 ms)
    8. Policy Creation Atomicity and Conflict Detection
      ✓ rejects policy creation when policyHash does not match TTL configuration (3 ms)
      ✓ throws conflict error if policy version exists with differing TTL configuration (6 ms)
      ✓ activation failure rolls back a newly created policy version (6 ms)
      ✓ exact activation time is inclusive (activatedAt <= evalTime) (6 ms)
    9. Pre-W11 Database Upgrade Test
      ✓ applies pre-W11 migrations, inserts pre-W11 snapshots, applies W11 migration, and verifies full compatibility (2051 ms)

Test Suites: 1 passed, 1 total
Tests:       21 passed, 21 total
Snapshots:   0 total
Time:        9.067 s, estimated 10 s
Ran all test suites within paths "packages/database/test/integration/freshness-snapshots.integration-spec.ts".
```

---

## 5. Inventory of Files

### Modified Files:
- `docs/implementation-plan-v1.md` (updated W11 status to `IMPLEMENTED — PRODUCTION ACTIVATION BLOCKED BY W03-DEC-002`)
- `docs/implementation-evidence/W11-freshness-aware-snapshots.md` (this evidence document)
- `docs/specifications/product-freshness-and-campaign-integrity.md` (reconciled two-axis model, §8.2 boundary inclusivity, §8.3 policy lifecycle, §8.4 compound idempotency)
- `app/packages/database/prisma/schema.prisma` (split policy into `FreshnessPolicyVersion` and `FreshnessPolicyActivation`, added check constraints)
- `app/packages/common/src/errors/application-error.ts` (added `FRESHNESS_POLICY_MISSING`)
- `app/packages/common/src/index.ts` (exported Clock abstraction)
- `app/apps/api/src/http/global-exception.filter.ts` (mapped `FRESHNESS_POLICY_MISSING` to HTTP 412)
- `app/packages/application/src/modules/products/domain/freshness-policy.ts` (updated interface to accept optional `evalTime?: Date`)
- `app/packages/application/src/modules/products/application/product-snapshot-hash.ts` (canonical 6-scope hashing)
- `app/packages/application/src/modules/products/application/product-snapshot-hash.spec.ts` (tests for all 6 scopes)
- `app/packages/application/src/modules/products/application/product-snapshot.repository.ts` (scoped hashes, `resolveSnapshotDependencyHashes`, `CreateProductSnapshotRecord`)
- `app/packages/application/src/modules/products/application/create-product-snapshot.use-case.ts` (snapshot creation with dependency hashes)
- `app/packages/application/src/modules/products/domain/product-errors.ts` (added `FreshnessPolicyMissingError`)
- `app/packages/application/src/modules/products/products.module.ts` (registered revalidation, unit of work, and clock providers)
- `app/packages/application/src/index.ts` (exported new domain models, use cases, ports)
- `app/packages/application/src/modules/products/application/revalidate-product-snapshot.use-case.ts` (hashed idempotency keys, duplicate collision handling, renamed event)
- `app/packages/application/src/modules/products/application/revalidate-product-snapshot.use-case.spec.ts` (unit tests for hashed idempotency, concurrency collision, renamed event)
- `app/packages/database/src/product-snapshot/prisma-product-snapshot.repository.ts` (persists scoped hashes, legacy snapshot hash preservation)
- `app/packages/database/src/product-snapshot/prisma-product-freshness-assessment.repository.ts` (exported `toAssessmentDomain`)
- `app/packages/database/src/product-snapshot/prisma-freshness-policy.repository.ts` (Clock injection, atomic transaction create, activation resolution, conflict detection, no unsafe defaults)
- `app/packages/database/src/database.module.ts` (registered `PrismaProductRevalidationUnitOfWork`)
- `app/packages/database/src/index.ts` (exported `PrismaProductRevalidationUnitOfWork`)

### Created Files:
- `app/packages/database/prisma/migrations/20261019010000_freshness_snapshots_w11/migration.sql` (PostgreSQL migration with triggers)
- `app/packages/common/src/time/clock.ts` (Clock interface, SystemClock, FakeClock)
- `app/packages/common/src/time/clock.spec.ts` (Clock unit tests)
- `app/packages/application/src/modules/products/domain/freshness-state.ts` (two-axis enums, reason codes, presentation formatter)
- `app/packages/application/src/modules/products/domain/freshness-policy.ts` (policy models, hash calculation)
- `app/packages/application/src/modules/products/domain/freshness-policy.spec.ts` (policy tests)
- `app/packages/application/src/modules/products/domain/freshness-evaluator.ts` (freshness evaluation domain service)
- `app/packages/application/src/modules/products/domain/freshness-evaluator.spec.ts` (millisecond boundary and outage tests)
- `app/packages/application/src/modules/products/domain/dependency-manifest.ts` (manifest domain model)
- `app/packages/application/src/modules/products/application/product-freshness-assessment.repository.ts` (assessment repository port)
- `app/packages/application/src/modules/products/application/product-revalidation-unit-of-work.port.ts` (unit of work port)
- `app/packages/application/src/modules/products/application/product-eligibility-evaluator.ts` (eligibility evaluator with strict gates)
- `app/packages/application/src/modules/products/application/product-eligibility-evaluator.spec.ts` (eligibility evaluator specs)
- `app/packages/database/src/product-snapshot/prisma-product-revalidation.unit-of-work.ts` (transactional unit of work implementation)
- `app/packages/database/test/integration/freshness-snapshots.integration-spec.ts` (PostgreSQL integration test suite with 21 passing tests)
