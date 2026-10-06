# Phase 2A Creative Automation Specification: Architecture, Ports & Review Workflow

**Document:** `/docs/creative-automation.md`  
**Phase:** Phase 2A (Creative / Visual Automation Foundation)  
**Status:** Architecture Complete — Feature Code Deferred Pending Business Confirmation  
**Related Documents:** [ADR-003](architecture-decisions/ADR-003-creative-automation-architecture.md), [Creative Business Rules](creative-business-rules.md)  

---

## 1. Executive Overview

Phase 2A introduces **Creative / Image Automation** to the Parisian Shopper AI Telegram Content System. The system converts approved or reviewable marketing copy and immutable product snapshots into high-resolution, on-brand visual creatives formatted for social platforms.

### Core Philosophy
1. **Never Hallucinate Product Packaging:** Authentic product photography from verified catalog snapshots is preserved and composited; AI generates ambient luxury environments, never the product bottle or packaging itself.
2. **Never Hallucinate Factual Overlays:** Text-on-image elements (price, discounts, names) are rendered deterministically through code templates using verified snapshot data, never by diffusion models.
3. **Decoupled Architecture:** Visual generation runs asynchronously downstream from copy creation. It does not block text drafting or approval.
4. **Mandatory Human Governance:** Visual assets require explicit human sign-off via Telegram before reaching the terminal `CREATIVE_APPROVED` state.
5. **Strict Scope Discipline:** Zero social network publishing (Facebook/Instagram), scheduling, Meta Graph API calls, or auto-posting is implemented.

---

## 2. End-to-End Creative Pipeline Flow

```
┌────────────────────────────────────────────────────────┐
│  Stage 1: Input Trigger                                │
│  - Target ContentVersion (UNDER_REVIEW or APPROVED)    │
│  - Immutable ProductSnapshot (verified catalog facts)  │
│  - Active BrandRuleVersion (visual guidance rules)     │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Stage 2: Creative Brief Builder                       │
│  - Derives structured lighting, mood, scene prompt     │
│  - Enforces Olfactory Note grounding in background     │
│  - Selects platform aspect ratio (1:1, 4:5, 9:16)      │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Stage 3: CreativeProvider Port (AI Generation)        │
│  - Provider-neutral request to AI engine               │
│  - Generates ambient luxury scene (Parisian atelier)   │
│  - Returns high-resolution background buffer           │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Stage 4: Deterministic Hero Compositor                │
│  - Sharp / libvips image composition                   │
│  - Extracts & places authentic catalog hero product    │
│  - Applies contact shadows, lighting blending          │
│  - (Optional) Deterministic SVG typography overlay     │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Stage 5: Content-Addressable Asset Storage            │
│  - SHA-256 digest computation & deduplication          │
│  - Persists image to storage (local disk / S3 MinIO)   │
│  - Records VisualAsset in PostgreSQL                   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Stage 6: Deterministic Visual Validator               │
│  - Verifies exact pixel dimensions & aspect ratio      │
│  - Checks file size, format, color space bounds        │
│  - Programmatic OCR check for unauthorized text        │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Stage 7: Transactional Outbox & Telegram Delivery     │
│  - CREATIVE_VALIDATION_COMPLETED outbox event          │
│  - Dispatches high-res photo card to Telegram          │
│  - Renders inline review buttons                       │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Stage 8: Human Review & Decision                      │
│  - Approve Visual (Two-step confirmation)              │
│  - Request Visual Edit (Conversational instructions)   │
│  - Regenerate Visual (Fresh background seed)           │
│  - Reject Visual (Mandatory feedback reason)           │
│  - TERMINAL: CREATIVE_APPROVED (Zero auto-publish)     │
└────────────────────────────────────────────────────────┘
```

---

## 3. Provider-Neutral Port Specification

The domain layer depends exclusively on the `CreativeProvider` port defined in `packages/application/src/modules/creative/domain/creative-provider.port.ts`:

```typescript
export type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9';

export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

export interface CreativeJobRequest {
  readonly creativeJobId: string;
  readonly contentVersionId: string;
  readonly productSnapshot: NormalizedProductEnvelope;
  readonly creativeBrief: string;
  readonly stylePrompt: string;
  readonly negativePrompt?: string;
  readonly dimensions: ImageDimensions;
  readonly aspectRatio: AspectRatio;
  readonly heroProductImageUrl?: string;
  readonly seed?: number;
  readonly timeoutMs?: number;
}

export interface CreativeJobResult {
  readonly imageBuffer: Buffer;
  readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  readonly width: number;
  readonly height: number;
  readonly provider: string;
  readonly model: string;
  readonly seed?: number;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly latencyMs: number;
  readonly estimatedCost?: number;
}

export const CREATIVE_PROVIDER = Symbol('CREATIVE_PROVIDER');

export interface CreativeProvider {
  readonly providerName: string;
  readonly defaultModel: string;
  generateScene(request: CreativeJobRequest): Promise<CreativeJobResult>;
}
```

### Pluggable Adapters
1. **`FakeCreativeProvider`:** Deterministic local fixture generator for unit and integration testing. Returns valid PNG buffers with zero network calls or vendor costs.
2. **`OpenAICreativeProvider`:** Generates high-resolution scenes via OpenAI Images API (`dall-e-3` or `gpt-image-preview`).
3. **`StabilityCreativeProvider`:** Generates photorealistic scenes via Stability AI API (`stable-diffusion-3.5-large` / `core`).
4. **`LocalFluxCreativeProvider` (Future Enterprise):** Connects to internal company-hosted FLUX / ComfyUI worker nodes for maximum data privacy and zero per-call API cost.

---

## 4. Product Image Handling & Compositing Strategy

### The Hero Image Invariant
Luxury packaging (e.g., perfume flacons, watch bezels, embossed brand gold lettering) cannot be generated accurately by text-to-image AI. Diffusion models create distorted lettering, asymmetric caps, and fake silhouettes that violate luxury brand guidelines.

### Compositing Engine (`Sharp` / `libvips`)
To solve this, the Parisian Shopper architecture employs a **two-layer composite strategy**:

1. **Layer 0 (AI Ambient Scene):**  
   The `CreativeProvider` generates an empty luxury environment tailored to the product's creative brief:
   > *"A sunlit Parisian marble vanity table near an open Haussmannian French window with delicate white jasmine blossoms and morning shadow casting, hyperrealistic still-life photography, empty pedestal center."*
2. **Layer 1 (Hero Product Extraction & Placement):**  
   The canonical product image from `ProductSnapshot.images[0].url` is isolated (background-removed if not transparent) and scaled to occupy 35%–60% of the canvas height.
3. **Layer 2 (Deterministic Blending & Contact Shadow):**  
   `Sharp` composites the authentic hero product onto the ambient scene pedestal, generating a realistic soft contact shadow at the base and applying subtle ambient tone matching.
4. **Layer 3 (Optional Deterministic Overlay):**  
   If the content type is `PROMOTION`, an SVG template renders an elegant discount privilege badge using exact data from `ProductSnapshot.promoPrice` and `discount.label`.

---

## 5. Asset Storage Strategy (`AssetStoragePort`)

### Content-Addressable Storage
All generated and composited assets are persisted using their **cryptographic SHA-256 digest**:
$$\text{Storage Key} = \text{sha256}(\text{imageBuffer})$$

This provides:
- **Automatic Deduplication:** Identical asset outputs never consume duplicate storage.
- **Cryptographic Immutability:** Assets cannot be altered in-place; any edit produces a new digest.
- **Cache Friendly:** Long-lived HTTP caching headers (`Cache-Control: public, max-age=31536000, immutable`).

### Port Definition
```typescript
export interface StoredAssetRecord {
  readonly storageKey: string;
  readonly sha256Digest: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly publicUrl: string;
}

export const ASSET_STORAGE = Symbol('ASSET_STORAGE');

export interface AssetStoragePort {
  saveAsset(buffer: Buffer, mimeType: string, filenamePrefix?: string): Promise<StoredAssetRecord>;
  getAssetBuffer(storageKey: string): Promise<Buffer | null>;
  deleteAsset(storageKey: string): Promise<boolean>;
}
```

- **Development / Pilot:** `LocalFileAssetStorage` persists files to `./storage/creatives/` and serves via secure static endpoint.
- **Production:** `S3AssetStorage` persists files to AWS S3 or MinIO buckets with pre-signed CDN URLs.

---

## 6. Deterministic Visual Validation Engine

Before any generated visual asset can be presented to a human reviewer in Telegram, it must pass the `DeterministicVisualValidator`:

| Rule Code | Severity | Description | Verification Logic |
|---|:---:|---|---|
| `DIMENSIONS_INVALID` | `BLOCKING` | Image width and height do not match required platform dimensions. | `width === expectedWidth && height === expectedHeight` |
| `ASPECT_RATIO_MISMATCH` | `BLOCKING` | Aspect ratio deviates from requested ratio (1:1, 4:5, 9:16). | `Math.abs((w / h) - expectedRatio) < 0.01` |
| `FILE_SIZE_EXCEEDED` | `BLOCKING` | Image file size exceeds platform and Telegram limits. | `byteSize <= 10_485_760` (10 MB max) |
| `MIME_TYPE_UNSUPPORTED` | `BLOCKING` | Unsupported image container format. | `mimeType in ['image/jpeg', 'image/png', 'image/webp']` |
| `COLOR_SPACE_INVALID` | `WARNING` | Image color space is not sRGB (causes color shift on mobile). | `metadata.space === 'srgb'` |
| `UNAPPROVED_TEXT_DETECTED`| `BLOCKING` | Diffusion model generated unauthorized text or fake pricing. | OCR check against `ProductSnapshot` dictionary |

If any `BLOCKING` finding occurs:
1. `VisualValidationStatus` is marked `BLOCKED`.
2. The Telegram review message renders a prominent `❌ Visual Validation Blocked` banner.
3. The `Approve Visual` action button is disabled and omitted.

---

## 7. Telegram Interactive Visual Review Flow

The visual creative is delivered to the reviewer's private Telegram chat using Telegram's high-resolution photo API (`sendPhoto`):

```text
[DEMO] CREATIVE DRAFT #799F4A1E — V1
Product: North Clock Automatic Watch
Format: Educational • En • Facebook (4:5 Portrait)
─────────────────────────
🛡️ Visual Validation: ✅ Passed (1080×1350 px • 1.4 MB • sRGB)
─────────────────────────
🎨 Creative Concept:
"A sunlit Parisian marble vanity table near an open Haussmannian French window with delicate white jasmine blossoms and morning shadow casting."

👤 Human review required: Choose an action below.

[ 🔍 View Source ] [ 🛡️ View Visual Validation ]
[ ✏️ Request Visual Edit ] [ 🔄 Regenerate Visual ]
[ ✅ Approve Visual ] [ ❌ Reject Visual ]
```

### Review Actions:
- **`Approve Visual`:** Requires two-step confirmation dialog. Marks creative as `CREATIVE_APPROVED`.
- **`Request Visual Edit`:** Prompts user for natural language styling instructions (e.g. *"Adjust lighting to evening golden hour and add subtle cedarwood accents in background"*). Triggers generation of Creative V2.
- **`Regenerate Visual`:** Re-runs creative generation with a new random seed.
- **`Reject Visual`:** Prompts reviewer for a rejection comment. Marks creative as `CREATIVE_REJECTED`.

---

## 8. Data Model Specification (Prisma Extensions)

To support Phase 2A, the database schema will be extended with the following models:

```prisma
enum CreativeJobStatus {
  REQUESTED
  GENERATING
  UNDER_REVIEW
  REVISION_REQUESTED
  APPROVED
  REJECTED
  FAILED
}

enum VisualValidationStatus {
  PASSED
  PASSED_WITH_WARNINGS
  BLOCKED
  FAILED
}

model VisualAsset {
  id                 String                 @id @default(uuid()) @db.Uuid
  contentVersionId   String                 @map("content_version_id") @db.Uuid
  creativeJobId      String                 @map("creative_job_id") @db.Uuid
  versionNumber      Int                    @map("version_number")
  storageKey         String                 @map("storage_key") @db.VarChar(200)
  sha256Digest       String                 @map("sha256_digest") @db.Char(64)
  mimeType           String                 @map("mime_type") @db.VarChar(50)
  width              Int
  height             Int
  aspectRatio        String                 @map("aspect_ratio") @db.VarChar(20)
  byteSize           Int                    @map("byte_size")
  publicUrl          String                 @map("public_url") @db.VarChar(500)
  provider           String                 @db.VarChar(100)
  model              String                 @db.VarChar(200)
  promptUsed         String                 @map("prompt_used") @db.Text
  validationStatus   VisualValidationStatus @default(PASSED) @map("validation_status")
  createdAt          DateTime               @default(now()) @map("created_at") @db.Timestamptz(3)

  contentVersion     ContentVersion         @relation(fields: [contentVersionId], references: [id])
  creativeJob        CreativeJob            @relation(fields: [creativeJobId], references: [id])
  validationResults  VisualValidationResult[]

  @@unique([creativeJobId, versionNumber], map: "visual_assets_job_version_key")
  @@map("visual_assets")
}

model CreativeJob {
  id                 String            @id @default(uuid()) @db.Uuid
  contentJobId       String            @map("content_job_id") @db.Uuid
  contentVersionId   String            @map("content_version_id") @db.Uuid
  status             CreativeJobStatus @default(REQUESTED)
  aspectRatio        String            @map("aspect_ratio") @db.VarChar(20)
  requesterUserId    String            @map("requester_user_id") @db.Uuid
  createdAt          DateTime          @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt          DateTime          @updatedAt @map("updated_at") @db.Timestamptz(3)

  contentJob         ContentJob        @relation(fields: [contentJobId], references: [id])
  assets             VisualAsset[]

  @@map("creative_jobs")
}

model VisualValidationResult {
  id                 String                 @id @default(uuid()) @db.Uuid
  visualAssetId      String                 @map("visual_asset_id") @db.Uuid
  validatorVersion   String                 @map("validator_version") @db.VarChar(100)
  status             VisualValidationStatus
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

## 9. Security, Threat Modeling & Licensing Analysis

### 9.1 Threat Modeling
- **Malicious Image Ingestion (SSRF):** Catalog product image URLs are strictly validated against allowlisted product asset domains. Arbitrary user URLs are never fetched.
- **Decompression Bomb Defense:** Images are decoded with size-capped memory buffers in Sharp, rejecting images exceeding 25 megapixels or 15 MB uncompressed size.
- **EXIF Stripping:** All generated and composited assets have EXIF metadata scrubbed to eliminate geographic location leakage, while embedding verified C2PA provenance tags.

### 9.2 Licensing & Intellectual Property Compliance
- **Permissive Open-Source Libraries:** All image processing relies on `sharp` (Apache-2.0).
- **Commercial Generative Models:** Providers selected (OpenAI, Stability AI) must provide clear commercial usage terms transferring ownership of generated output to Parisian Shopper.
- **Zero Research Contamination:** No proprietary code or assets from `/research/muse` or `/research/nichebot` are utilized.

---

## 10. Recommended Phased Implementation Roadmap

When business leadership approves the creative brand guidelines in `docs/creative-business-rules.md`, implementation will proceed in four controlled steps:

| Phase | Milestone | Deliverables |
|---|---|---|
| **Phase 2A.1** | Ports & Storage Foundation | Implement `CreativeProvider` port, `AssetStoragePort`, local file storage adapter, Sharp compositing pipeline, and Prisma schema migrations. |
| **Phase 2A.2** | Generation & Provider Adapters | Implement `FakeCreativeProvider` (for testing) and `OpenAICreativeProvider` (for live generation) with BullMQ `creative-generation` worker queue. |
| **Phase 2A.3** | Deterministic Visual Validator | Implement `DeterministicVisualValidator` checking dimensions, aspect ratio, safe zones, and text overlay accuracy. |
| **Phase 2A.4** | Telegram Visual Review Workflow | Wire Telegram photo card dispatch, interactive review buttons (`Approve Visual`, `Request Visual Edit`, `Regenerate Visual`, `Reject Visual`), and two-step confirmation dialog. |
