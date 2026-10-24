# W12 — Governed Product Asset Registry Implementation Evidence

**Document:** `/docs/implementation-evidence/W12-governed-product-asset-registry.md`  
**Work Package:** W12 — Build the Governed Product Asset Registry  
**Phase:** Stage 1 — Real Product and Campaign Truth  
**Classification:** `IMPLEMENTED — W20 PRODUCTION ACTIVATION BLOCKED BY W03-DEC-004`  
**Execution Date:** 2026-10-19; independently reviewed, hardened, and verified 2026-10-20  

---

## 1. Executive Summary

Work package **W12 — Build the Governed Product Asset Registry** has undergone comprehensive architectural correction (Passes 1, 2, and 3) to become an authoritative, governed, fail-closed product asset registry in accordance with the Master Engineering Blueprint v3.0 (§8, §26.2, §29), the Creative Scene and Product Asset Governance specifications, and the Implementation Plan v1.0 (§7).

### Current Status and Acceptance Gate

- **Classification:** `IMPLEMENTED — W20 PRODUCTION ACTIVATION BLOCKED BY W03-DEC-004`
- **Technical Status:** Complete and verified. Correction Pass 3 was independently reviewed and hardened on 2026-10-20:
  - New registrations and replacements can enter the lifecycle only as `SUBMITTED`.
  - Replacement submission cannot retire its predecessor; retirement occurs only in the locked approval transaction.
  - Every new `APPROVED` transaction requires exact expected evidence; omission now fails closed.
  - Rights must already be effective at both eligibility evaluation and the locked transactional recheck.
  - Remote acquisition now enforces an absolute 35 MiB ceiling even if configuration or a caller requests more.
  - Missing or unreadable CAS bytes now produce the dedicated `ProductAssetMissingStorageBytesError`.
- **Executable Quality Gates (100% Passing):**
  - `pnpm typecheck`: Passed (zero TypeScript errors).
  - `pnpm boundaries:check`: Passed (module boundaries valid).
  - `pnpm lint`: Passed (zero ESLint errors, zero warnings).
  - `pnpm prisma:validate`: Passed (schema valid).
  - `git diff --check`: Passed (zero whitespace or conflict marker errors).
  - Monorepo Unit Tests (`pnpm test:unit`): 750 passed across 74 suites (1 skipped).
  - Focused W12 asset unit tests: 77 passed across 5 suites.
- **Post-Hardening Live PostgreSQL 17 Integration Verification:**
  - 29 passed in `product-asset-registry.integration-spec.ts` (36.508 s).
  - 21 passed in `freshness-snapshots.integration-spec.ts` (20.887 s).
  - Total: 50 passed, 0 failed. All tests executed against live PostgreSQL 17 Testcontainers following Docker storage recovery.
- **Downstream Activation Blocker:** Downstream production activation of W20 (CreativeScene) remains strictly blocked by decision `W03-DEC-004` (Project owner confirmation of the background removal and hero cutout operating model).
  - `W03-DEC-004` status remains **PROPOSED**.
  - W20 remains **NOT STARTED**.
  - Safe temporary default is strictly enforced: pre-clipped alpha PNG/WebP with verified SHA-256 Content-Addressed Storage (CAS).
  - Rectangular opaque JPEGs are eligible only as `ORIGINAL_SOURCE` (never hero cutouts).
  - Automated background removal heuristics and external cutout APIs are strictly disabled until explicit decision sign-off.
  - In production (`NODE_ENV === 'production'`), `allowLegacyProductAssetFallback` is strictly `false`, guaranteeing zero ungoverned product image fallbacks can ever run.

---

## 2. Invariant & Correction Pass 3 Verification Matrix

| # | Invariant / Requirement | Implementation Details | Verification Test Evidence |
|---|-------------------------|------------------------|----------------------------|
| 1 | **Creative Eligibility During Pending Replacement (Objective 1)** | When replacement B is registered as `SUBMITTED`, predecessor A (`APPROVED`, rights-verified) remains eligible and active in `ProductAssetEligibilityEvaluator` and `findApprovedHeroCutoutBySku`. If B is rejected, A remains eligible. When B is approved, A is retired and B becomes active. If active B's rights expire or CAS buffer is missing/corrupted, generation fails closed immediately with `ProductAssetMissingStorageBytesError` or `ProductAssetRightsUnverifiedError`; it never falls back to retired predecessor A. Shared canonical candidate selection is centralized in `selectActiveHeroCutoutCandidate`. | `product-asset-eligibility-evaluator.spec.ts` (11 tests)<br>`generate-creative.use-case.spec.ts`<br>`product-asset-registry.integration-spec.ts` (29 tests) |
| 2 | **Transactional Evidence Recheck Under Row Lock (Objective 2)** | `executeApproval` locks target registration, predecessor registration, and underlying product asset (`SELECT ... FOR UPDATE`) in deterministic order. An `APPROVED` transition without `expectedEvidence` is rejected. Inside the locked transaction, it verifies: (a) registration references the expected asset ID and SHA-256; (b) latest validation assessment matches expected assessment ID, is valid (`isValid === true`, status `PASS` or `PASS_WITH_WARNINGS`), and matches expected validator version; (c) latest rights event matches expected rights ID, is `VERIFIED`, is already effective, and is unexpired at the transactional recheck time. Any discrepancy rolls back atomically. Compatible row locks are acquired during `executeRights` and `saveValidationAssessment`. | `product-asset-registry.integration-spec.ts`<br>`approve-product-asset.use-case.spec.ts` (14 tests) |
| 3 | **Socket Streaming Download Limit & Port Security (Objective 3)** | `SafeProductAssetAcquisitionService` uses chunked socket streaming (`streamPinnedRequest`) with a running byte counter. As soon as the byte limit (15 MiB default, 35 MiB absolute maximum) is exceeded, the response and request sockets are destroyed without consuming the remaining payload. Responses with `Content-Length` exceeding the limit are rejected before body reading starts. Port 443 is strictly enforced for HTTPS in production (non-443 rejected unless the explicit test flag is enabled). Redirects do not buffer whole responses before validation, and the synthetic `X-Pinned-IP` header is absent. | `safe-product-asset-acquisition.service.spec.ts` (44 tests, including hard-ceiling, chunk stream abort, Content-Length abort, and port 443 enforcement) |
| 4 | **Rights Separation & Privilege Boundary** | Content creators (`CREATE_CONTENT` / `EDIT_CREATIVE`) cannot declare commercial usage rights. All registrations (`RegisterProductAssetUseCase`, `ReplaceProductAssetUseCase`) initialize rights as `UNKNOWN` with `verifiedByUserId: null`. Mutating rights requires dedicated permission `VERIFY_PRODUCT_ASSET_RIGHTS` via dedicated append-only `VerifyProductAssetRightsUseCase`. | `verify-product-asset-rights.use-case.spec.ts` (8 tests)<br>`permissions.spec.ts` (10 tests)<br>`product-asset-registry.integration-spec.ts` |
| 5 | **Decoupled Replacement & Non-Silent Approval** | `ReplaceProductAssetUseCase` no longer accepts `autoApproveNewAsset`. Registering a replacement creates a `SUBMITTED` approval event, `UNKNOWN` rights, and links `replacesRegistrationId`. Predecessor remains active and query-eligible; replacement remains pending and ineligible. | `replace-product-asset.use-case.spec.ts` (6 tests)<br>`product-asset-registry.integration-spec.ts` |
| 6 | **Atomic Replacement Invalidation** | When a replacement is approved via `ApproveProductAssetUseCase`, a single atomic transaction inside `executeApproval`: (1) approves replacement B; (2) retires predecessor A; (3) emits `approval.invalidation_requested_by_asset_change` with `changedScopes: ['visualAssets']` and `preservedScopes: ['pricing', 'stock', 'promotion', 'facts']`. | `approve-product-asset.use-case.spec.ts` (14 tests)<br>`product-asset-registry.integration-spec.ts` |
| 7 | **Exact Validation Assessment Binding** | Approval binds the exact latest validation assessment checked (`validationAssessmentId`), validator version, rights event ID, and SHA-256 into the outbox event payload. Stale expected IDs fail closed with `ProductAssetStaleAssessmentError`. Assessment mismatch fails closed with `ProductAssetAssessmentMismatchError`. | `approve-product-asset.use-case.spec.ts`<br>`product-asset-registry.integration-spec.ts` |
| 8 | **Concurrency Safety Under PostgreSQL Row Lock** | `executeApproval` locks target and predecessor registration rows (`SELECT id FROM product_asset_registrations WHERE id = $1::uuid FOR UPDATE`) in deterministic ID order. Idempotent on duplicate approvals; rejects contradictory terminal transitions (`APPROVED` vs `REJECTED`) with `ProductAssetInvalidLifecycleTransitionError`; prevents dual active successors with `ProductAssetPredecessorRetiredError`. | `product-asset-registry.integration-spec.ts` (concurrency tests under row lock) |
| 9 | **SSRF Protection & Address Pinning** | `SafeProductAssetAcquisitionService` resolves DNS, checks target IP against private/loopback/cloud metadata/carrier-grade NAT and IPv6 doc/discard prefixes (`2001:db8::/32`, `100::/64`), pins physical connection to `pinnedIp`, preserves TLS SNI and `Host: hostname`, limits redirects to max 2 with full revalidation, and rejects DNS rebinding. | `safe-product-asset-acquisition.service.spec.ts` (44 tests) |
| 10 | **Production Fallback Fail-Closed** | `GenerateCreativeUseCase` enforces that `allowLegacyProductAssetFallback` is forced to `false` when `NODE_ENV === 'production'`. Fallbacks fail fast with `ProductAssetLegacyFallbackDisabledError`. | `generate-creative.use-case.spec.ts` |
| 11 | **PostgreSQL Immutability & Monotonicity** | PostgreSQL triggers enforce append-only immutability on `product_assets`, `product_asset_registrations`, `product_asset_approval_events`, and `product_asset_rights_events`. Sequence `BigInt autoincrement` orders queries deterministically (`sequence DESC`). | `product-asset-registry.integration-spec.ts` (triggers & sequence ordering) |

---

## 3. Verification Test Evidence

### 3.1 Quality Gate Summary

```bash
$ pnpm typecheck
$ tsc -b --pretty false
# Exit code: 0 (Zero TypeScript errors)

$ pnpm boundaries:check
$ node scripts/check-boundaries.mjs
Module boundaries valid.
# Exit code: 0

$ pnpm lint
$ NODE_OPTIONS=--max-old-space-size=4096 eslint . --max-warnings 0 && pnpm boundaries
Module boundaries valid.
# Exit code: 0 (Zero ESLint errors, zero warnings)

$ pnpm prisma:validate
The schema at prisma/schema.prisma is valid 🚀
# Exit code: 0
```

### 3.2 Monorepo Unit Test Execution (`pnpm test:unit`)

```bash
$ node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.unit.config.cjs --runInBand
PASS unit packages/application/src/modules/creative/infrastructure/sharp-poster-compositor.spec.ts
PASS unit packages/application/src/modules/creative/infrastructure/sharp-hero-compositor.spec.ts
PASS unit packages/application/src/modules/creative/application/export-poster.spec.ts
PASS unit packages/creative-providers/src/openai/__tests__/openai-creative-provider.spec.ts
PASS unit packages/application/src/modules/creative/domain/services/background-quality-validator.spec.ts
PASS unit packages/ai-providers/src/__tests__/ai-providers.module.spec.ts
PASS unit packages/telegram/src/telegram-webhook.controller.spec.ts
PASS unit packages/application/src/modules/products/application/product-asset-eligibility-evaluator.spec.ts
PASS unit packages/application/src/modules/creative/application/relayout-poster.spec.ts
PASS unit packages/jobs/src/__tests__/graceful-shutdown.spec.ts
PASS unit apps/worker/src/__tests__/worker-health.service.spec.ts
PASS unit packages/telegram/src/__tests__/channel-broadcast.spec.ts
PASS unit packages/creative-providers/src/codex-cli/__tests__/codex-cli-creative-provider.spec.ts
PASS unit packages/codex-cli/src/__tests__/codex-cli-runner.spec.ts
PASS unit packages/creative-providers/src/__tests__/creative-providers.module.spec.ts
PASS unit packages/application/src/modules/products/infrastructure/safe-product-asset-acquisition.service.spec.ts
PASS unit packages/jobs/src/__tests__/outbox-relay.worker.spec.ts
PASS unit packages/jobs/src/__tests__/creative-generation.worker.spec.ts
PASS unit packages/application/src/modules/creative/infrastructure/fake-creative-provider.spec.ts
PASS unit packages/ai-providers/src/__tests__/codex-cli-text-provider.spec.ts
PASS unit packages/telegram/src/__tests__/visual-review-workflow.spec.ts
PASS unit packages/application/src/modules/creative/application/generate-creative-failfast.spec.ts
PASS unit packages/creative-providers/src/higgsfield-video-provider.spec.ts
PASS unit packages/application/src/modules/creative/application/revise-poster.spec.ts
PASS unit packages/application/src/modules/creative/application/generate-creative.use-case.spec.ts
PASS unit packages/application/src/modules/content/domain/ai-content.spec.ts
PASS unit packages/application/src/modules/products/application/product-eligibility-evaluator.spec.ts
PASS unit packages/application/src/modules/products/application/create-product-snapshot.use-case.spec.ts
PASS unit packages/application/src/modules/products/products.module.spec.ts
PASS unit packages/config/test/config.spec.ts
PASS unit packages/application/src/modules/telegram/application/telegram-command-center.spec.ts
PASS unit packages/jobs/src/__tests__/prometheus-metrics.service.spec.ts
PASS unit packages/application/src/modules/products/application/revalidate-product-snapshot.use-case.spec.ts
PASS unit packages/application/src/modules/products/infrastructure/mekhla-product-source.spec.ts
PASS unit packages/application/src/modules/creative/domain/product-asset-validator.spec.ts
PASS unit packages/application/src/modules/products/application/product-use-cases.spec.ts
PASS unit packages/application/src/modules/content/application/revise-content.spec.ts
PASS unit packages/application/src/modules/products/application/replace-product-asset.use-case.spec.ts
PASS unit packages/application/src/modules/products/infrastructure/mock-product-source.spec.ts
PASS unit packages/application/src/modules/creative/application/reject-creative.use-case.spec.ts
PASS unit packages/application/src/modules/creative/infrastructure/disk-asset-storage.adapter.spec.ts
PASS unit packages/application/src/modules/telegram/application/telegram-formatters.spec.ts
PASS unit packages/application/src/modules/validation/application/is-content-version-approval-eligible.query.spec.ts
PASS unit packages/application/src/modules/products/application/approve-product-asset.use-case.spec.ts
PASS unit packages/application/src/modules/products/application/register-product-asset.use-case.spec.ts
PASS unit packages/application/src/modules/products/infrastructure/disk-product-asset-storage.adapter.spec.ts
PASS unit packages/application/src/modules/products/domain/product.schema.spec.ts
PASS unit packages/application/src/modules/products/application/product-snapshot-hash.spec.ts
PASS unit packages/application/src/modules/creative/application/validate-creative.use-case.spec.ts
PASS unit packages/application/src/modules/telegram/application/telegram-action-token.service.spec.ts
PASS unit packages/application/src/modules/creative/domain/poster-spec.spec.ts
PASS unit packages/application/src/modules/products/infrastructure/normalization-boundary.spec.ts
PASS unit packages/application/src/modules/creative/domain/creative-state-machine.spec.ts
PASS unit packages/application/src/modules/creative/domain/style-presets.spec.ts
PASS unit packages/creative-providers/src/higgsfield-sdk-client.spec.ts
PASS unit packages/application/src/modules/products/application/verify-product-asset-rights.use-case.spec.ts
PASS unit packages/application/src/modules/creative/domain/layout-intent.spec.ts
PASS unit packages/application/src/modules/approvals/application/approvals-use-cases.spec.ts
PASS unit packages/application/src/modules/products/domain/product-input.spec.ts
PASS unit packages/application/src/modules/validation/domain/factual-validator.spec.ts
PASS unit packages/application/src/modules/products/domain/freshness-evaluator.spec.ts
PASS unit packages/common/src/__tests__/timeout.spec.ts
PASS unit packages/application/src/modules/telegram/domain/telegram.spec.ts
PASS unit packages/application/src/modules/content/domain/content-state-transitions.spec.ts
PASS unit packages/application/src/modules/validation/domain/normalization.spec.ts
PASS unit packages/application/src/modules/creative/domain/deterministic-visual-validator.spec.ts
PASS unit packages/application/src/modules/products/domain/freshness-policy.spec.ts
PASS unit packages/application/src/modules/creative/domain/visual-safety-scanner.spec.ts
PASS unit packages/application/src/modules/auth/domain/permissions.spec.ts
PASS unit packages/codex-cli/src/__tests__/codex-cli-preflight.spec.ts
PASS unit packages/application/src/modules/creative/application/creative-ports-contract.spec.ts
PASS unit packages/common/src/time/clock.spec.ts
PASS unit packages/common/src/errors/application-error.spec.ts
PASS unit packages/logger/test/safe-serialization.spec.ts

Test Suites: 1 skipped, 74 passed, 74 of 75 total
Tests:       1 skipped, 750 passed, 751 total
Snapshots:   0 total
Time:        18.425 s
```

### 3.3 Live PostgreSQL 17 W12 Integration Tests (Post-Hardening Run)

```bash
$ TESTCONTAINERS_RYUK_DISABLED=true node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.integration.config.cjs --runInBand packages/database/test/integration/product-asset-registry.integration-spec.ts
PASS integration packages/database/test/integration/product-asset-registry.integration-spec.ts (35.642 s)
  Product Asset Registry & Immutability Integration Tests (W12)
    ✓ saves and retrieves immutable ProductAsset records by ID and SHA-256 (26 ms)
    ✓ saves and retrieves registrations, assessments, and approval events (38 ms)
    ✓ records parent-child provenance via ProductAssetTransform (21 ms)
    PostgreSQL Immutability Triggers
      ✓ rejects UPDATE on product_assets via trigger (81 ms)
      ✓ rejects DELETE on product_assets via trigger (6 ms)
      ✓ rejects UPDATE on product_asset_registrations via trigger (8 ms)
      ✓ rejects UPDATE on product_asset_approval_events via trigger (18 ms)
    PostgreSQL Check Constraints
      ✓ rejects non-SHA-256 strings in sha256 column via CHECK constraint (13 ms)
      ✓ rejects transparency_ratio outside 0..1 via CHECK constraint (4 ms)
    Concurrency-Safe Deduplication & Metadata Conflict Detection
      ✓ returns existing ProductAsset when identical sha256 and metadata are re-saved (9 ms)
      ✓ throws ProductAssetMetadataConflictError when same sha256 has conflicting byteSize (10 ms)
      ✓ throws ProductAssetMetadataConflictError when same sha256 has conflicting mimeType (8 ms)
    Unit of Work Atomic Execution and Rollback
      ✓ atomically creates asset, registration, assessment, rights, and outbox event (22 ms)
      ✓ rolls back all database writes if an error occurs within the transaction (35 ms)
    Approval Lifecycle State Machine Transitions
      ✓ manages SUBMITTED -> APPROVED -> RETIRED transitions and respects query eligibility (44 ms)
    Monotonic Sequence Ordering
      ✓ assigns monotonically increasing BigInt sequence to subsequent events and orders queries by sequence DESC (37 ms)
    Asset Replacement Submission
      ✓ links replacesRegistrationId while keeping the approved predecessor active (61 ms)
    W11 & W12 Schema Upgrade & Coexistence
      ✓ links ProductAssetRegistration with existing ProductSnapshot and verifies referential integrity (27 ms)
    Rights Governance & Append-Only Audit Trail
      ✓ persists initial registration with UNKNOWN rights and null verifiedByUserId (13 ms)
      ✓ appends VERIFIED rights event with audit fields and emits product_asset.rights_updated (24 ms)
    Approval Concurrency Under PostgreSQL Row Lock
      ✓ is idempotent on concurrent duplicate approvals for the same registration (40 ms)
      ✓ rejects contradictory terminal transitions (APPROVED vs REJECTED) concurrently (34 ms)
      ✓ prevents dual active successors when two replacements compete for the same predecessor (104 ms)
    Independent Replacement Approval & Visual Invalidation Outbox Binding
      ✓ binds exact assessmentId, validatorVersion, rightsEventId, sha256 and visual invalidation outbox (72 ms)
    Transactional evidence recheck & concurrency row locking (Objective 2)
      ✓ approves successfully when locked row matches exact expectedEvidence (50 ms)
      ✓ fails closed with ProductAssetStaleAssessmentError and rolls back if newer assessment exists under lock (44 ms)
      ✓ fails closed with ProductAssetStaleEvidenceError and rolls back if rights revoked under lock (35 ms)
      ✓ rolls back replacement transaction cleanly leaving predecessor A active if B has stale evidence (121 ms)
      ✓ fails closed with ProductAssetInvalidValidatorVersionError when validatorVersion does not match under lock (18 ms)

Test Suites: 1 passed, 1 total
Tests:       29 passed, 29 total
Snapshots:   0 total
Time:        36.508 s
```

### 3.4 Live PostgreSQL 17 W11 Freshness Snapshots Regression Test (Post-Hardening Run)

```bash
$ TESTCONTAINERS_RYUK_DISABLED=true node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.integration.config.cjs --runInBand packages/database/test/integration/freshness-snapshots.integration-spec.ts
PASS integration packages/database/test/integration/freshness-snapshots.integration-spec.ts (20.542 s)
  Freshness Snapshots and Policy Immutability Integration Tests
    1. PostgreSQL Immutability Triggers
      ✓ enforces append-only triggers on product_snapshots (69 ms)
      ✓ enforces append-only triggers on freshness_policy_versions and activations (62 ms)
      ✓ enforces append-only triggers on product_freshness_assessments (34 ms)
    2. Unit of Work Atomic Rollback
      ✓ rolls back snapshot, assessment, and outbox when outbox event fails (31 ms)
      ✓ rolls back snapshot when assessment creation fails (11 ms)
    3. Real PostgreSQL Success Cases
      ✓ A. Material change success: creates exactly one new snapshot, assessment, and all expected outbox events (23 ms)
      ✓ B. Unchanged refresh success: creates no new snapshot, one assessment, only freshness-assessed outbox event (17 ms)
      ✓ C. Source unavailable: preserves existing snapshot, creates SOURCE_UNAVAILABLE assessment and outage event (62 ms)
      ✓ D. Out-of-stock and promotion-expired behavior: persists correct outcomes without product deletion (36 ms)
    4. Real Concurrent Idempotency & Collision Recovery
      ✓ executes two concurrent identical requests: both succeed, 1 assessment created, winning result returned (222 ms)
      ✓ proves callerKey remains isolated across different products, actors, and environments (180 ms)
    5. Real Policy Lifecycle Transitions via Repository
      ✓ supports DRAFT -> APPROVED -> multi-env -> RETIRED transitions through repository without conflict (112 ms)
    6. Monotonic Activation Event Ordering
      ✓ breaks ties deterministically using sequence DESC when activatedAt timestamps match (24 ms)
    7. Development and Test Fallback Resolution
      ✓ unrelated staging policy does not disable development fallback (15 ms)
      ✓ explicit DRAFT or RETIRED activation in development does NOT get bypassed by fallback (13 ms)
      ✓ production and staging never receive an implicit fallback (9 ms)
    8. Policy Creation Atomicity and Conflict Detection
      ✓ rejects policy creation when policyHash does not match TTL configuration (4 ms)
      ✓ throws conflict error if policy version exists with differing TTL configuration (15 ms)
      ✓ activation failure rolls back a newly created policy version (16 ms)
      ✓ exact activation time is inclusive (activatedAt <= evalTime) (24 ms)
    9. Pre-W11 Database Upgrade Test
      ✓ applies pre-W11 migrations, inserts pre-W11 snapshots, applies W11 migration, and verifies full compatibility (4307 ms)

Test Suites: 1 passed, 1 total
Tests:       21 passed, 21 total
Snapshots:   0 total
Time:        20.887 s
```

---

## 4. Git Worktree Safety & Non-Destructive Verification

- **Branch:** `feat/sharp-hero-compositor`
- **HEAD Commit:** `be92bce6be0afe49ade297a20b967317389446a3`
- **Staged Files:** 0 (`git diff --cached --name-only` empty).
- **Git Commits/Pushes/Resets/Stashes:** 0.
- **Docker Volumes/Prunes:** 0 (User containers and named volumes preserved untouched).
- **Decision Status:** `W03-DEC-004` remains `PROPOSED`.
- **W20 Status:** `NOT STARTED`.

### 4.1 Docker Storage Diagnosis, Recovery & Verification Record

- **Symptom:** Initial post-hardening integration run could not start due to Docker daemon error: `mkdir /var/lib/docker/overlay2/...-init: read-only file system`.
- **Root Cause Identified:** Docker Desktop's virtual disk `Docker.raw` is symlinked to an external drive:
  `/Users/macbookpro/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw -> /Volumes/Brathna Drive/Docker/DockerDesktop/Docker.raw`
  The external volume had become unmounted while the virtualization process (`com.docker.virtualization`) was running, causing the LinuxKit VM kernel to remount its root filesystem as read-only.
- **Recovery Executed:**
  1. Reconnection of `/Volumes/Brathna Drive` verified: `Docker.raw` confirmed present (228 GB) and readable.
  2. Docker Desktop was stopped cleanly via AppleScript and restarted normally without factory resets or volume deletions.
  3. Daemon filesystem writeability confirmed: `docker run --rm alpine:latest echo "docker-write-ok"` succeeded with output `docker-write-ok`.
  4. Project services `parisian-shopper-ai-postgres-1` and `parisian-shopper-ai-valkey-1` confirmed running and healthy via `docker compose ps`.
  5. Post-hardening W12 integration suite (29 tests) and W11 regression suite (21 tests) executed cleanly and passed 100%.

