# Phase 2A Creative Automation Specification: Architecture, Ports & Review Workflow

**Document:** `/docs/creative-automation.md`  
**Phase:** Phase 2A (Creative / Visual Automation Foundation)  
**Status:** Architectural Specification (PROPOSED — Implementation-Ready Pending Business & Legal Sign-off)  
**Related Documents:** [ADR-003](architecture-decisions/ADR-003-creative-automation-architecture.md), [Creative Business Rules](creative-business-rules.md), [Creative Security](creative-security.md), [Creative License Review](creative-license-review.md)  

---

## 1. Executive Overview

Phase 2A introduces **Creative / Image Automation** to the Parisian Shopper AI Telegram Content System. The system converts approved or reviewable marketing copy and immutable product snapshots into high-resolution, on-brand visual creatives formatted for social platforms.

### Core Architecture Invariants
1. **Hero Preservation Invariant:** Authentic product photography from verified catalog snapshots is preserved and composited; AI generates ambient luxury environments, never the product bottle, box, watch dial, or packaging itself.
2. **Deterministic Typography Invariant:** Diffusion models must never render authoritative marketing text. The Phase 2A baseline enforces `TEXT_ON_IMAGE=false`. If typography overlays are enabled later, they are rendered deterministically through vector SVG templates using verified snapshot data.
3. **Decoupled Workflow:** Creative generation runs downstream and is pinned to an **exact `ContentVersion`**. It does not block text generation or approval. If marketing edits copy and creates `ContentVersion V2`, the V1 visual is not automatically approved for V2.
4. **Validation Boundary Separation:** Deterministic mathematical/format verification (`DeterministicVisualValidator`) is strictly separated from heuristic safety scanning (`VisualSafetyScanner`). OCR is treated as a heuristic, never a mathematical certainty.
5. **Mandatory Human Governance:** Visual assets require explicit human sign-off via Telegram targeting the exact `VisualAsset` version before reaching terminal `CREATIVE_APPROVED`.
6. **Strict Scope Discipline:** Zero social network publishing (Facebook/Instagram), scheduling, Meta Graph API calls, or auto-posting is implemented.

---

## 2. Package Structure & Repository Alignment

The architecture strictly respects the existing Phase 1 modular monolith. **No `@parisian-shopper/domain` package is created.**

```
app/packages/
├── application/
│   └── src/modules/creative/
│       ├── domain/                  # CreativeJob, VisualAsset entities, state transitions, validation rules
│       ├── application/             # Use cases, query handlers, ports (CreativeProvider, AssetStoragePort)
│       └── infrastructure/          # FakeCreativeProvider, LocalDiskAssetStorage, Sharp compositor adapter
├── database/
│   ├── prisma/schema.prisma         # CreativeJob, VisualAsset, VisualValidationResult models
│   └── src/creative/                # Prisma repository implementations
├── jobs/
│   └── src/                         # creative-generation.queue.ts and worker module
├── common/
│   └── src/                         # Common error types, base identifiers, outbox event payloads
└── telegram/
    └── src/                         # Telegram outbox dispatcher for high-resolution visual cards
```

---

## 3. End-to-End Creative Pipeline Flow

```
┌────────────────────────────────────────────────────────┐
│  Stage 1: Input Trigger & Pinning                      │
│  - Target ContentVersion (exact version ID)            │
│  - Immutable ProductSnapshot (verified catalog facts)  │
│  - Active BrandRuleVersion (visual guidance rules)     │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Stage 2: Creative Brief Builder                       │
│  - Synthesizes structured ambient prompt               │
│  - Injects olfactory notes into atmospheric scene      │
│  - Selects platform aspect ratio (1:1, 4:5, 9:16)      │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Stage 3: CreativeProvider Port (AI Generation)        │
│  - In PR 2A-2: FakeCreativeProvider (fixtures)         │
│  - In PR 2A-5: Deferred single real provider           │
│  - Generates ambient luxury scene (pedestal center)    │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Stage 4: Deterministic Hero Compositor (Sharp)        │
│  - Canonical product image extracted & safely ingested │
│  - Scaled to 35%–60% canvas height                     │
│  - Composited onto pedestal with soft contact shadow   │
│  - Zero generative alteration of product pixels        │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Stage 5: Content-Addressable Asset Storage            │
│  - Computes SHA-256 byte digest: sha256(imageBytes)    │
│  - Persists assets with distinct AssetRole             │
│  - Records VisualAsset in PostgreSQL                   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Stage 6: Two-Tier Visual Validation                   │
│  - Tier 1: DeterministicVisualValidator (format/bounds)│
│  - Tier 2: VisualSafetyScanner (heuristic OCR scan)    │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Stage 7: Transactional Outbox & Telegram Delivery     │
│  - CREATIVE_VALIDATION_COMPLETED outbox event          │
│  - Dispatches high-res photo card to Telegram          │
│  - Renders inline review buttons with action tokens    │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Stage 8: Human Review & Decision                      │
│  - Approve Visual (Targets exact VisualAsset version)  │
│  - Request Visual Edit (Conversational instructions)   │
│  - Regenerate Visual (Fresh seed / new candidate)      │
│  - Reject Visual (Mandatory feedback reason)           │
│  - TERMINAL: CREATIVE_APPROVED (Zero auto-publish)     │
└────────────────────────────────────────────────────────┘
```

---

## 4. Provider-Neutral Port Specification

Defined in `@parisian-shopper/application` (`src/modules/creative/application/creative-provider.port.ts`):

```typescript
export interface CreativeBrief {
  readonly creativeJobId: string;
  readonly contentVersionId: string;
  readonly briefText: string;
  readonly stylePrompt: string;
  readonly negativePrompt?: string;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly aspectRatio: string;
  readonly creativeProfile: string;
}

export interface CreativeProviderOptions {
  readonly seed?: number;
  readonly timeoutMs?: number;
  readonly modelOverride?: string;
}

export interface GeneratedBackgroundAsset {
  readonly imageBuffer: Buffer;
  readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  readonly width: number;
  readonly height: number;
  readonly providerId: string;
  readonly model: string;
  readonly seed?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly latencyMs: number;
  readonly estimatedCostUsd?: number;
}

export const CREATIVE_PROVIDER = Symbol('CREATIVE_PROVIDER');

export interface CreativeProvider {
  readonly providerId: string;
  generateBackground(
    brief: CreativeBrief,
    options?: CreativeProviderOptions,
  ): Promise<GeneratedBackgroundAsset>;
}
```

> **Architectural Invariant:**
> `CreativeProvider` generates AI backgrounds ONLY. It is strictly prohibited from compositing or manipulating the canonical product packaging. Providers execute exclusively in background queue workers, never on HTTP/Telegram request cycles.

### 4.1 Dedicated HeroCompositor Port

Defined in `@parisian-shopper/application` (`src/modules/creative/application/hero-compositor.port.ts`):

```typescript
export interface CompositeVisualInput {
  readonly creativeJobId: string;
  readonly canonicalProductBuffer: Buffer;
  readonly canonicalProductMimeType: string;
  readonly canonicalProductSha256: string;
  readonly backgroundBuffer: Buffer;
  readonly backgroundMimeType: string;
  readonly backgroundSha256: string;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly aspectRatio: string;
  readonly compositionMarginPercent?: number;
}

export interface CompositeVisualResult {
  readonly compositedBuffer: Buffer;
  readonly mimeType: 'image/png' | 'image/webp';
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly sha256: string;
  readonly latencyMs: number;
}

export const HERO_COMPOSITOR = Symbol('HERO_COMPOSITOR');

export interface HeroCompositor {
  composite(input: CompositeVisualInput): Promise<CompositeVisualResult>;
}
```

Deterministic local compositing (via Sharp in future PR) places the verified canonical product image over the generated background without generative hallucination.

### Provider Implementation Strategy:
1. **`FakeCreativeProvider` (Mandatory First Provider — PR 2A-2):** Deterministic local fixture generator for unit, integration, and CI test suites. Zero network overhead, zero API cost.
2. **Single Real Provider Experiment (Deferred — PR 2A-5):** At most ONE real provider adapter (e.g. `OpenAICreativeProvider`) implemented behind a disabled-by-default feature flag (`ENABLE_REAL_CREATIVE_PROVIDER=false`).
3. **Legal Separation:** Procurement and legal terms (copyright indemnification, commercial output rights) are marked `TODO_LEGAL_CONFIRMATION` and are not hardcoded engineering prerequisites.

---

## 5. Product Image Handling & Compositing Strategy

### The Hero Image Invariant Flow:
$$\text{Canonical Product Image} \longrightarrow \text{Safe Ingestion} \longrightarrow \text{Deterministic Resize/Crop} \longrightarrow \text{Deterministic Compositing}$$

1. **Safe Ingestion:** Catalog product images are fetched from verified domains with strict SSRF defense (see [`/docs/creative-security.md`](creative-security.md)).
2. **Hero Isolation:**
   - Canonical product photography with transparent alpha channels is used directly.
   - If automated background removal is used, it must be deterministic. If automated removal would alter or erode bottle edges, the original photo is preserved and flagged for human review.
   - Generative in-painting or fill on the product bottle, box, watch face, logo, or typography is **strictly forbidden**.
3. **Compositing via Sharp (`libvips`):**
   - The hero product is scaled to occupy between 35% and 60% of vertical canvas height.
   - Positioned on the center surface pedestal with realistic soft contact drop shadow.
4. **Text-on-Image Baseline:**
   - Initial Phase 2A sets `TEXT_ON_IMAGE=false`.
   - If promotional overlays are approved later, they must be rendered via deterministic SVG layout templates from structured `ProductSnapshot` data. Diffusion models never render text.

---

## 6. Content-Addressable Asset Storage (`AssetStoragePort`)

Defined in `@parisian-shopper/application` (`src/modules/creative/application/asset-storage.port.ts`):

```typescript
export const ASSET_STORAGE = Symbol('ASSET_STORAGE');

export interface StoredAssetMetadata {
  readonly storageKey: string;
  readonly sha256Digest: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly width?: number;
  readonly height?: number;
  readonly assetRole: VisualAssetRole;
  readonly publicUrl?: string;
  readonly createdAt: Date;
}

export interface SaveAssetInput {
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly assetRole: VisualAssetRole;
  readonly width?: number;
  readonly height?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AssetStoragePort {
  saveAsset(input: SaveAssetInput): Promise<StoredAssetMetadata>;
  getMetadata(storageKey: string): Promise<StoredAssetMetadata | null>;
  getAssetBuffer(storageKey: string): Promise<Buffer | null>;
  assetExists(storageKey: string): Promise<boolean>;
}
```

- **Content Addressing:** Derived strictly from `sha256(imageBytes)`. Deduplication operates on cryptographic byte hashes, never filenames. For full details, see [`creative-local-storage.md`](/docs/creative-local-storage.md).
- **Disk Implementation (`DiskAssetStorageAdapter`):** Implements atomic staging via `.tmp/`, `fsync`, rename, sidecar metadata (`.meta.json`), path traversal defense, symlink rejection, and SHA-256 integrity verification on read.
- **Fake Creative Provider (`FakeCreativeProvider`):** Implements `CreativeProvider` for background generation only. Uses pure Node.js built-ins (`node:zlib`) to generate deterministic PNGs without external native dependencies. Fails closed in production unless `CREATIVE_ALLOW_FAKE_IN_PRODUCTION=true`.
- **Role Isolation:** Every asset records its explicit `AssetRole` (`CANONICAL_PRODUCT`, `GENERATED_BACKGROUND`, `COMPOSITED_CREATIVE`, `PREVIEW`).
- **Audit Preservation & Immutability:** Normal application `AssetStoragePort` provides NO deletion method. Historical assets participate in the audit chain and must not be casually deleted. Any future retention or legal compliance purge must be modeled as a separate privileged operational port (e.g., `AssetRetentionPort` or `AssetAdministrationPort`).

---

## 7. Visual Validation Engine: Deterministic vs. Heuristic

### 7.1 Tier 1: `DeterministicVisualValidator` (Deterministic Checks)

| Check Code | Severity | Description | Verification Logic |
|---|:---:|---|---|
| `DIMENSIONS_INVALID` | `BLOCKING` | Width/height does not match required dimensions. | `width === reqWidth && height === reqHeight` |
| `ASPECT_RATIO_MISMATCH` | `BLOCKING` | Aspect ratio deviates from platform standard. | `Math.abs((w/h) - reqRatio) < 0.001` |
| `FILE_SIZE_EXCEEDED` | `BLOCKING` | Byte size exceeds platform ceiling. | `byteSize <= 10_485_760` (10 MB max) |
| `CONTAINER_UNSUPPORTED`| `BLOCKING` | Unsupported container format. | Magic bytes match JPEG, PNG, or WebP |
| `PIXEL_CEILING_EXCEEDED`| `BLOCKING` | Decoded pixels exceed decompression limits. | `width * height <= 16_777_216` |
| `FRAME_COUNT_INVALID` | `BLOCKING` | Animated multi-frame image detected. | Single static frame only (`pages === 1`) |
| `COLOR_SPACE_INVALID` | `WARNING` | Color profile is not standard sRGB. | `metadata.space === 'srgb'` |
| `HERO_HASH_MISMATCH` | `BLOCKING` | Source hero digest does not match snapshot. | Digest verified against `ProductSnapshot` |

### 7.2 Tier 2: `VisualSafetyScanner` (Heuristic Scans)

| Scan Code | Severity | Scanner Outcome | Policy Action |
|---|:---:|---|---|
| `TEXT_SCAN_PASSED` | `INFO` | `NO_TEXT_DETECTED` | Heuristic passed; continue to human review. |
| `TEXT_DETECTED` | `BLOCKING` | `TEXT_DETECTED` in background | Blocking. Background rejected or flagged before human presentation. |
| `TEXT_SCAN_INCONCLUSIVE`| `WARNING` | Low confidence or scan timeout | Warning flag attached; requires explicit human confirmation. |

#### Scanner Operational Boundaries:
- **Never Run on Hero Packaging:** The scanner is never applied to the canonical product packaging layer (trusted upstream).
- **Acknowledge Limitations:** Scanners can yield false positives (marble veining, foliage) and false negatives (cursive/stylized scripts). **Human review is never bypassed.**

---

## 8. Creative State Machine & Versioning

### 8.1 State Transitions

```
enum CreativeJobStatus {
  REQUESTED               // Job enqueued
  GENERATING_BACKGROUND   // AI generating ambient scene
  COMPOSITING             // Sharp compositing hero onto scene
  VALIDATING              // Deterministic & heuristic validation
  READY_FOR_REVIEW        // Delivered to Telegram for review
  REVISION_REQUESTED      // Reviewer requested styling changes
  CREATIVE_APPROVED       // Terminal: Approved by human
  CREATIVE_REJECTED       // Terminal: Rejected by human
  FAILED                  // Unrecoverable pipeline error
}
```

- `CREATIVE_APPROVED` and `CREATIVE_REJECTED` are **terminal states** for Phase 2A.
- Creative jobs maintain an **append-only** version log:
  $$\text{CreativeJob} \longrightarrow \text{VisualAsset V1} \longrightarrow \text{Revision Request} \longrightarrow \text{VisualAsset V2}$$
- Each `VisualAsset` preserves: provider, model, seed, brief version, source product digest, background digest, composited digest, and reviewer feedback instructions.

---

## 9. Data Model Specification (Prisma Extensions)

To be added in `@parisian-shopper/database` (`schema.prisma`) in PR 2A-1:

```prisma
enum CreativeJobStatus {
  REQUESTED
  GENERATING_BACKGROUND
  COMPOSITING
  VALIDATING
  READY_FOR_REVIEW
  REVISION_REQUESTED
  CREATIVE_APPROVED
  CREATIVE_REJECTED
  FAILED
}

enum VisualValidationStatus {
  PASSED
  PASSED_WITH_WARNINGS
  BLOCKED
  FAILED
}

enum VisualAssetRole {
  CANONICAL_PRODUCT
  GENERATED_BACKGROUND
  COMPOSITED_CREATIVE
  PREVIEW
}

enum TextScanOutcome {
  NO_TEXT_DETECTED
  TEXT_DETECTED
  TEXT_SCAN_INCONCLUSIVE
}

model CreativeJob {
  id                 String            @id @default(uuid()) @db.Uuid
  contentJobId       String            @map("content_job_id") @db.Uuid
  contentVersionId   String            @map("content_version_id") @db.Uuid
  status             CreativeJobStatus @default(REQUESTED)
  aspectRatio        String            @map("aspect_ratio") @db.VarChar(20)
  requesterUserId    String            @map("requester_user_id") @db.Uuid
  currentVersion     Int               @default(1) @map("current_version")
  createdAt          DateTime          @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt          DateTime          @updatedAt @map("updated_at") @db.Timestamptz(3)

  contentJob         ContentJob        @relation(fields: [contentJobId], references: [id])
  contentVersion     ContentVersion    @relation(fields: [contentVersionId], references: [id])
  assets             VisualAsset[]

  @@index([contentVersionId], map: "creative_jobs_content_version_id_idx")
  @@map("creative_jobs")
}

model VisualAsset {
  id                   String                 @id @default(uuid()) @db.Uuid
  creativeJobId        String                 @map("creative_job_id") @db.Uuid
  contentVersionId     String                 @map("content_version_id") @db.Uuid
  versionNumber        Int                    @map("version_number")
  assetRole            VisualAssetRole        @default(COMPOSITED_CREATIVE) @map("asset_role")
  storageKey           String                 @map("storage_key") @db.VarChar(200)
  sha256Digest         String                 @map("sha256_digest") @db.Char(64)
  backgroundSha256     String?                @map("background_sha256") @db.Char(64)
  heroProductSha256    String?                @map("hero_product_sha256") @db.Char(64)
  mimeType             String                 @map("mime_type") @db.VarChar(50)
  width                Int
  height               Int
  aspectRatio          String                 @map("aspect_ratio") @db.VarChar(20)
  byteSize             Int                    @map("byte_size")
  provider             String                 @db.VarChar(100)
  model                String                 @db.VarChar(200)
  seed                 BigInt?
  promptUsed           String                 @map("prompt_used") @db.Text
  validationStatus     VisualValidationStatus @default(PASSED) @map("validation_status")
  createdAt            DateTime               @default(now()) @map("created_at") @db.Timestamptz(3)

  creativeJob          CreativeJob            @relation(fields: [creativeJobId], references: [id])
  contentVersion       ContentVersion         @relation(fields: [contentVersionId], references: [id])
  validationResults    VisualValidationResult[]

  @@unique([creativeJobId, versionNumber], map: "visual_assets_job_version_key")
  @@index([sha256Digest], map: "visual_assets_sha256_idx")
  @@map("visual_assets")
}

model VisualValidationResult {
  id                 String                 @id @default(uuid()) @db.Uuid
  visualAssetId      String                 @map("visual_asset_id") @db.Uuid
  validatorVersion   String                 @map("validator_version") @db.VarChar(100)
  status             VisualValidationStatus
  textScanOutcome    TextScanOutcome        @default(NO_TEXT_DETECTED) @map("text_scan_outcome")
  createdAt          DateTime               @default(now()) @map("created_at") @db.Timestamptz(3)

  visualAsset        VisualAsset            @relation(fields: [visualAssetId], references: [id])
  findings           VisualValidationFinding[]

  @@map("visual_validation_results")
}

model VisualValidationFinding {
  id                 String             @id @default(uuid()) @db.Uuid
  resultId           String             @map("result_id") @db.Uuid
  code               String             @db.VarChar(100)
  severity           ValidationSeverity
  message            String             @db.VarChar(1000)

  result             VisualValidationResult @relation(fields: [resultId], references: [id])

  @@map("visual_validation_findings")
}
```

---

## 10. Telegram Review Workflow Specification

1. **Card Presentation:** High-resolution photo message (`sendPhoto`) containing:
   - Visual metadata (dimensions, byte size, format, color space)
   - Validation summary (Deterministic: Passed, Heuristic Scan: Passed)
   - Creative concept description and active version tag (`V1`, `V2`)
2. **Review Inline Buttons:**
   - `[ ✅ Approve Visual ]`: Triggers optimistic concurrency check verifying the target is still the latest `VisualAsset` version. Requires two-step confirmation dialog before moving to `CREATIVE_APPROVED`.
   - `[ ✏️ Request Visual Edit ]`: Enters conversational reply mode for styling adjustments. Creates append-only `VisualAsset` version.
   - `[ 🔄 Regenerate Visual ]`: Requests a fresh background candidate with a new seed.
   - `[ ❌ Reject Visual ]`: Prompts for rejection reason; marks job as `CREATIVE_REJECTED`.
3. **Stale Approval Protection:** If a reviewer clicks `Approve Visual` on an older message when a newer version exists, the action is rejected with an explanatory message: *"Approval failed: A newer visual version exists for this creative."*

---

## 11. Phased Implementation Roadmap (Narrowly Scoped PRs)

- **PR 2A-1: Data Model & Ports Only**
  - Schema migration in `@parisian-shopper/database`.
  - Domain entities, state machine, repository/storage/provider interfaces in `@parisian-shopper/application`.
  - Zero image dependencies installed.
- **PR 2A-2: Fake Provider, Local CAS & Deterministic Compositor**
  - Install `sharp` (with approved LGPL exception in `license-exceptions.json`).
  - Implement `FakeCreativeProvider`, local filesystem CAS, and Sharp compositor.
- **PR 2A-3: Validation Engine & Queue Workflow**
  - Implement `DeterministicVisualValidator` and `VisualSafetyScanner`.
  - Add `creative-generation` queue and worker in `@parisian-shopper/jobs`.
  - Wire transactional outbox dispatcher.
- **PR 2A-4: Telegram Visual Review Workflow**
  - High-res photo message delivery and interactive action token handlers in Telegram.
  - Two-step approval and revision request workflows.
- **PR 2A-5: Single Real Provider Integration (Disabled by Default)**
  - Optional real provider adapter behind `ENABLE_REAL_CREATIVE_PROVIDER=false` flag.
  - Activated only after business rules and legal terms are signed off.
