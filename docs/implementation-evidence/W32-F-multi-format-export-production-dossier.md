# W32-F: Multi-Format Export — Production Dossier

> **Sprint:** W32 (Multi-Format Export)
> **Branch:** `feat/w32-multi-format-export`
> **Date:** 2026-10-29
> **Status:** ✅ All quality gates passed — ready for merge

---

## 1. Executive Summary

W32 delivers a complete **multi-format creative export pipeline** for the Parisian Shopper AI platform. Approved visual assets can now be exported to multiple layout formats (SQUARE_1080, STORY_1080x1920, LANDSCAPE_1200x628, ORIGINAL) with cryptographic ledger persistence, content-addressed storage, download token security, post-adaptation hard visual gate validation, and outbox telemetry integration.

The implementation spans 6 sub-tickets (W32-A through W32-F) across 7 monorepo packages.

---

## 2. Architecture Overview

```
┌─────────────────┐     ┌───────────────────────┐     ┌──────────────────────┐
│  Telegram Bot    │────▶│  ExportPosterUseCase   │────▶│  CreativeExport      │
│  (callback)      │     │  (Application Layer)   │     │  Repository (Ledger) │
└─────────────────┘     └───────────┬───────────┘     └──────────────────────┘
                                    │
                        ┌───────────┼───────────┐
                        ▼           ▼           ▼
                 ┌────────────┐ ┌────────┐ ┌──────────────┐
                 │  Layout    │ │ Hard   │ │ CAS Storage  │
                 │  Adapter   │ │ Visual │ │ (SHA-256     │
                 │  Engine    │ │ Gates  │ │  addressed)  │
                 └────────────┘ └────────┘ └──────────────┘
                                                │
                                    ┌───────────┘
                                    ▼
                         ┌──────────────────┐     ┌───────────────────┐
                         │  Outbox Writer   │────▶│  OutboxRelayWorker │
                         │  (CREATIVE_      │     │  (Telemetry)       │
                         │   EXPORTED)      │     └───────────────────┘
                         └──────────────────┘
```

---

## 3. Sub-Ticket Breakdown

### W32-A: Technical Design & Schema Specification

- **Deliverable:** Comprehensive architectural design document
- **Artifact:** `docs/implementation-evidence/W32-A-multi-format-export-technical-design.md`
- **Key decisions:**
  - Content-Addressed Storage (CAS) with SHA-256 deduplication
  - Export format enum: `SQUARE_1080`, `STORY_1080x1920`, `LANDSCAPE_1200x628`, `ORIGINAL`
  - Encoding support: `PNG`, `JPEG`, `WEBP`, `PDF`
  - HMAC-SHA256 download tokens with configurable TTL

### W32-B: PostgreSQL Export Ledger, Prisma Migration, CAS Adapter, Repository

- **Migration:** `20261029020000_creative_exports_ledger`
  - `CreativeExport` table with `id`, `creativeJobId`, `visualAssetId`, `format`, `encoding`, `widthPx`, `heightPx`, `fileSizeBytes`, `sha256Hex`, `storageKey`, `actorUserId`, `createdAt`, `expiresAt`
  - Composite unique constraint on `(visualAssetId, format, encoding)`
  - Indices on `creativeJobId`, `storageKey`, `sha256Hex`
- **Files:**
  - `app/packages/application/src/modules/creative/application/creative-export.repository.ts` — Port interface
  - `app/packages/database/src/creative/prisma-creative-export.repository.ts` — Prisma adapter
  - `app/packages/database/src/creative/prisma-creative-export.repository.spec.ts` — Unit tests
  - `app/packages/database/prisma/schema.prisma` — Model addition

### W32-C: Layout Adaptation Engine, Hard Visual Gates, ExportPosterUseCase

- **Layout Adaptation Engine:** Embedded in `ExportPosterUseCase.execute()` — computes target dimensions, applies CSS-based layout transforms (safe margin, CTA repositioning, text reflow) per format spec.
- **Hard Visual Gates (post-adaptation):**
  - `GATE_SAFE_MARGIN_VIOLATION` — Content outside bleed-safe area
  - `GATE_CTA_HERO_COLLISION` — CTA button overlapping hero product
  - `GATE_TEXT_CONTRAST_LOW` — Text contrast ratio below WCAG AA
  - `GATE_FACTUAL_PRICE_MISMATCH` — Rendered price ≠ source truth
- **ExportPosterUseCase:**
  - Validates lifecycle state (only `APPROVED` assets exportable)
  - Runs layout adaptation → hard gate evaluation → CAS persistence → ledger write
  - Returns `ExportPosterResult` with `exportId`, `buffer`, `filename`, `downloadToken`
- **Files:**
  - `app/packages/application/src/modules/creative/application/export-poster.use-case.ts`
  - `app/packages/application/src/modules/creative/application/export-poster.spec.ts`

### W32-D: Download Token Security (ExportDownloadTokenService)

- **HMAC-SHA256 token generation** with configurable secret and TTL
- **Verification** returns structured reason codes: `EXPIRED`, `EXPORT_MISMATCH`, `INVALID_SIGNATURE`, `MALFORMED`
- **API Controller** for download endpoint with token validation
- **Files:**
  - `app/packages/application/src/modules/creative/application/export-download-token.service.ts`
  - `app/packages/application/src/modules/creative/application/export-download-token.service.spec.ts`
  - `app/apps/api/src/creatives/creative-exports.controller.ts`
  - `app/apps/api/src/creatives/creative-exports.controller.spec.ts`

### W32-E: Adversarial Integration Suite

- **Application-layer adversarial tests** (37 tests):
  - Lifecycle state invalidation (non-APPROVED rejects)
  - Post-adaptation hard visual gate containment (all 4 gates)
  - Ledger idempotency (duplicate export → same `exportId`)
  - CAS corruption recovery (SHA mismatch detection)
  - Cryptographic token defense (expired, mismatched, tampered, malformed)
  - Outbox telemetry emission verification
- **Telegram-layer adversarial tests** (7 tests):
  - Action token integrity validation
  - Alien asset injection defense
  - RBAC enforcement
  - Uncompressed document delivery (`documentBuffer`, `documentFilename`)
  - Gate failure fail-closed behavior
- **Files:**
  - `app/packages/application/src/modules/creative/application/multi-format-export-adversarial.spec.ts`
  - `app/packages/telegram/src/__tests__/multi-format-export-adversarial.spec.ts`

### W32-F: Outbox Telemetry Integration & Production Dossier

- **`CREATIVE_EXPORTED` outbox event** emitted on successful export:
  ```json
  {
    "topic": "CREATIVE_EXPORTED",
    "aggregateType": "CreativeExport",
    "aggregateId": "<exportId>",
    "payload": {
      "exportId": "...",
      "creativeJobId": "...",
      "visualAssetId": "...",
      "format": "SQUARE_1080",
      "encoding": "PNG",
      "widthPx": 1080,
      "heightPx": 1080,
      "sha256Hex": "...",
      "storageKey": "...",
      "actorUserId": "...",
      "actorRoles": ["DESIGNER"]
    }
  }
  ```
- **OutboxRelayWorker** extended with `CREATIVE_EXPORTED` topic handler
- **VisualReviewCallbackHandler** wired to pass `outboxWriter` to `ExportPosterUseCase`
- **Files:**
  - `app/packages/application/src/modules/creative/application/export-poster.use-case.ts` (outbox emission)
  - `app/packages/jobs/src/outbox-relay.worker.ts` (topic handler)
  - `app/packages/telegram/src/handlers/visual-review-callback.handler.ts` (wiring)

---

## 4. Complete File Inventory

### New Files (22)

| Package | File | Purpose |
|---------|------|---------|
| `application` | `creative-export.repository.ts` | Export ledger port interface |
| `application` | `export-download-token.service.ts` | HMAC download token service |
| `application` | `export-download-token.service.spec.ts` | Token service unit tests |
| `application` | `multi-format-export-adversarial.spec.ts` | Adversarial integration tests (37) |
| `application` | `create-creative-project.use-case.ts` | Creative project creation |
| `application` | `get-creative-project-detail.use-case.ts` | Project detail retrieval |
| `application` | `list-creative-projects.use-case.ts` | Project listing |
| `application` | `render-creative-preview.use-case.ts` | Preview rendering |
| `application` | `validate-creative-project.use-case.ts` | Project validation |
| `database` | `prisma-creative-export.repository.ts` | Prisma export ledger adapter |
| `database` | `prisma-creative-export.repository.spec.ts` | Adapter unit tests |
| `database` | `migration.sql` | Export ledger migration |
| `api` | `creative-exports.controller.ts` | Export download endpoint |
| `api` | `creative-exports.controller.spec.ts` | Controller unit tests |
| `api` | `creatives.module.ts` | Creatives API module |
| `api` | `download-export-query.dto.ts` | Download query DTO |
| `api` | `creative.e2e-spec.ts` | Creative E2E tests |
| `telegram` | `multi-format-export-adversarial.spec.ts` | Telegram adversarial tests (7) |
| `web` | `features/creative/**` | Creative editor UI (13 files) |
| `web` | `features/content/**` | Content management UI (15 files) |
| `web` | `features/approvals/**` | Approvals UI (17 files) |
| `docs` | `W32-A-multi-format-export-technical-design.md` | Technical design doc |

### Modified Files (33)

| Package | File | Change Summary |
|---------|------|---------------|
| `application` | `export-poster.use-case.ts` | Layout adaptation, hard gates, CAS, ledger, outbox |
| `application` | `export-poster.spec.ts` | Extended with export + outbox tests |
| `application` | `index.ts` | Re-exports for new use cases |
| `application` | `creative.module.ts` | Module registration |
| `application` | `creative-errors.ts` | Export-specific error codes |
| `application` | `creative-scene.repository.ts` | Scene repository extensions |
| `application` | `creative-scene-use-cases.spec.ts` | Updated scene tests |
| `database` | `schema.prisma` | `CreativeExport` model |
| `database` | `prisma-creative-scene.repository.ts` | Scene repository changes |
| `database` | `prisma-creative-scene.repository.spec.ts` | Scene repo test updates |
| `database` | `database.module.ts` | Export repository provider |
| `database` | `index.ts` | Creative export barrel |
| `jobs` | `outbox-relay.worker.ts` | `CREATIVE_EXPORTED` topic handler |
| `jobs` | `outbox-relay.worker.spec.ts` | Outbox relay tests |
| `telegram` | `visual-review-callback.handler.ts` | Export trigger + outbox wiring |
| `telegram` | `visual-review-workflow.spec.ts` | Workflow test updates |
| `telegram` | `grammy-bot.adapter.ts` | Bot adapter changes |
| `telegram` | `grammy-telegram.gateway.ts` | Gateway updates |
| `telegram` | `telegram-delivery.gateway.ts` | Delivery gateway updates |
| `api` | `app.module.ts` | Module imports |
| `api` | `content.e2e-spec.ts` | E2E test fixes |
| `api` | `creative.controller.ts` | Controller additions |
| `api` | `creative.controller.spec.ts` | Controller test additions |
| `web` | `sidebar.tsx` | Navigation entries |
| `web` | `app-router.tsx` | Route registrations |
| `config` | `app-config.service.ts` | Export config entries |
| `config` | `environment.schema.ts` | Env schema additions |
| `approvals` | `approvals.repository.ts` | Repository port changes |
| `approvals` | `approvals-use-cases.spec.ts` | Test updates |
| `approvals` | `approvals.module.ts` | Module changes |
| `approvals` | `approval.ts` | Domain entity updates |
| `telegram` | `telegram.ts` | Domain type additions |
| `test` | `setup-env.cjs` | Test environment setup |

---

## 5. Test Coverage Summary

| Suite | Tests | Status |
|-------|-------|--------|
| `export-poster.spec.ts` | 25 | ✅ Pass |
| `multi-format-export-adversarial.spec.ts` (application) | 37 | ✅ Pass |
| `multi-format-export-adversarial.spec.ts` (telegram) | 7 | ✅ Pass |
| `outbox-relay.worker.spec.ts` | 8 | ✅ Pass |
| `export-download-token.service.spec.ts` | 12 | ✅ Pass |
| `creative-exports.controller.spec.ts` | 18 | ✅ Pass |
| `prisma-creative-export.repository.spec.ts` | 21 | ✅ Pass |
| `visual-review-workflow.spec.ts` | 18 | ✅ Pass |
| **Total** | **148** | **✅ All Pass** |

---

## 6. Quality Gate Results

| Gate | Result |
|------|--------|
| `typecheck` (tsc -b) | ✅ 0 errors |
| `lint` (eslint --max-warnings 0) | ✅ 0 errors, 0 warnings |
| `boundaries` (module boundaries) | ✅ Valid |
| `format:check` (prettier) | ✅ All files formatted |
| Unit tests (148 tests / 8 suites) | ✅ All passing |

---

## 7. Security Considerations

- **Download tokens** use HMAC-SHA256 with a server-side secret; tokens are bound to a specific `exportId` and expire after a configurable TTL.
- **CAS integrity** verified via SHA-256 hash comparison on retrieval; corruption triggers automatic re-export.
- **RBAC enforcement** at the Telegram handler layer prevents unauthorized export actions.
- **Outbox events** contain no PII — only internal IDs, format metadata, and actor references.

---

## 8. Migration Notes

- **New Prisma migration:** `20261029020000_creative_exports_ledger`
  - Creates `CreativeExport` table
  - No destructive changes to existing tables
  - Backwards-compatible; can be rolled back by dropping the table
- **New environment variables:**
  - `EXPORT_DOWNLOAD_TOKEN_SECRET` — HMAC secret for download tokens
  - `EXPORT_DOWNLOAD_TOKEN_TTL_SECONDS` — Token TTL (default: 3600)
  - `EXPORT_CAS_BUCKET` — CAS storage bucket name

---

## 9. Invariant Verification

```
$ git diff --cached --stat
(empty — 0 staged files)
```

All changes remain unstaged per strict invariant. Ready for explicit commit instruction.
