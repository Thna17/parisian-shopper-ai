# ADR-003: Architectural Strategy for Creative & Visual Automation (Phase 2A)

- **Status:** PROPOSED (Pending formal business sign-off and legal licensing exception review)
- **Date:** 2026-10-06 (Updated with hardening and consistency review)
- **Decision owners:** Parisian Shopper Engineering & Architecture
- **Supersedes:** None (Extends [ADR-002](ADR-002-clean-room-application-stack.md))
- **Scope:** Phase 2A Creative / Visual Generation Architecture. Strictly excludes social publishing, auto-posting, Meta Graph APIs, scheduling, and analytics.

---

## 1. Context & Business Need

In Phase 1 (MVP 0.1.0), the Parisian Shopper AI Content System established a hardened, clean-room foundation for bilingual marketing text generation, deterministic factual validation, and human review via Telegram. Content jobs advance through:
$$\text{Product} \longrightarrow \text{ProductSnapshot} \longrightarrow \text{AI Text Generation} \longrightarrow \text{Deterministic Validation} \longrightarrow \text{Telegram Review} \longrightarrow \text{APPROVED}$$

While textual copy is fully automated and factually verified, luxury social commerce relies heavily on high-fidelity, polished visual assets. Marketing teams currently must manually search for product photos, compose lifestyle backgrounds, format aspect ratios, and assemble multi-channel assets.

Phase 2A introduces **Creative / Image Automation** to generate on-brand, photorealistic visual assets directly grounded in verified product data and approved marketing text.

### Critical Engineering & Brand Risks
1. **Factual Hallucination in Visuals:** Generative image models (e.g., DALL-E, Stable Diffusion, FLUX) frequently synthesize distorted typography, hallucinate fictional packaging, alter luxury brand logos, or fabricate non-existent prices on visual cards.
2. **Packaging & Brand Integrity Distortion:** Luxury fragrance bottles, watch dials, and cosmetic packaging have exact physical proportions, typography, and glass refractions that cannot be synthesized from scratch without brand damage.
3. **Overconfident Validation Claims:** Heuristics like OCR or visual scanning cannot provide mathematical guarantees of text absence or aesthetic compliance; treating heuristic scans as deterministic validation creates dangerous false confidence.
4. **Licensing & Compliance Boundaries:** Image processing engines (such as `libvips` through `sharp`) introduce LGPL dependencies that require formal exception review under repository license policies.
5. **Premature Automation & Infrastructure Creep:** Adding unneeded new packages or premature multi-provider complexity destabilizes the clean-room modular monolith.

---

## 2. Decision Summary

We extend the Parisian Shopper NestJS modular monolith with a dedicated **Creative Automation Engine** adhering to the following core architectural decisions:

### D1: Decoupled Staged Pipeline Anchored to ContentVersion
Creative generation is decoupled from text generation. It operates downstream on a specific, immutable **ContentVersion**:
$$\text{ContentVersion (Approved/Under Review)} \longrightarrow \text{CreativeBrief} \longrightarrow \text{CreativeProvider} \longrightarrow \text{Compositor} \longrightarrow \text{Storage} \longrightarrow \text{Validation} \longrightarrow \text{Telegram Review} \longrightarrow \text{CREATIVE\_APPROVED}$$
- A `CreativeJob` is pinned strictly to **one exact `ContentVersion`**.
- If copy is edited and a new `ContentVersion` (e.g. V2) is created, the creative generated for V1 is **not** automatically approved for V2. A distinct creative workflow must be triggered.

### D2: Package Structure Alignment with Existing Monolith
No `@parisian-shopper/domain` package is created. The architecture strictly respects the existing modular monolith:
- **`@parisian-shopper/application`:**
  - `src/modules/creative/domain/`: Pure domain types, creative entities, state machine transitions, brief schemas, and validation contracts.
  - `src/modules/creative/application/`: Creative orchestration use cases, repository ports (`creative-job.repository.port.ts`, `visual-asset.repository.port.ts`), provider port (`creative-provider.port.ts`), and storage port (`asset-storage.port.ts`).
  - `src/modules/creative/infrastructure/`: Local file storage adapter, `FakeCreativeProvider`, Sharp compositor adapter.
- **`@parisian-shopper/database`:**
  - Prisma schema models: `CreativeJob`, `VisualAsset`, `VisualValidationResult`, `VisualValidationFinding`.
  - Prisma repository implementations.
- **`@parisian-shopper/jobs`:**
  - BullMQ queue `creative-generation` and dedicated worker module.
- **`@parisian-shopper/common`:**
  - Common error classes, outbox event payloads (`CREATIVE_VALIDATION_COMPLETED`), and entity identifiers.
- **`@parisian-shopper/telegram` & Telegram application module:**
  - Outbox dispatcher for high-resolution visual cards and review callback tokens.

### D3: Hero Product Image Preservation & HeroCompositor Port
**Generative AI is strictly prohibited from synthesizing the core product packaging from scratch.**
- The canonical product image from `ProductSnapshot.images` is treated as an immutable visual truth (the "Hero").
- **Ingestion & Compositing Flow:**
  $$\text{Canonical Product Image} \longrightarrow \text{Safe Ingestion} \longrightarrow \text{Deterministic Resize/Crop} \longrightarrow \text{Deterministic Compositing}$$
- **Port Separation:**
  - `CreativeProvider`: AI ambient background generation ONLY (`generateBackground`). Zero compositing capabilities. Strictly prohibited from manipulating the product.
  - `HeroCompositor`: Dedicated port (`composite`) for deterministic local compositing (via Sharp in future PR). Places the trusted canonical product image over the verified AI background without generative alteration.
- Under no circumstances is generative in-painting or diffusion fill used on:
  - Product bottles, boxes, caps, or packaging geometry
  - Watch dials, bezels, hands, or straps
  - Brand logos, typography, or hallmark embossing
  - Volume, concentration, SKU, or price representations
- If automated background removal would materially alter product pixels or edges, source preservation is maintained and human review is required.

### D4: Text-on-Image Policy & Deterministic Typography
- **Baseline for Phase 2A:** `TEXT_ON_IMAGE=false` by default. Visual assets remain pristine lifestyle photography. All marketing copy, pricing, and CTAs reside exclusively in the post caption text.
- **Future Typography Rule:** If text overlays become enabled later for promotional campaigns, diffusion models must **never** render text. All text overlays must be generated using **deterministic vector templates** (SVG rendered via Sharp) strictly bound to verified values from `ProductSnapshot` (e.g. `promoPrice`, `discountLabel`).

### D5: Validation Boundary: Deterministic vs. Heuristic
We explicitly separate deterministic mathematical verification from heuristic safety scanning:
1. **`DeterministicVisualValidator` (Deterministic Gate):**
   - Exact pixel dimensions ($1080 \times 1080$, $1080 \times 1350$, $1080 \times 1920$ within 0px tolerance).
   - Aspect ratio conformance (1:1, 4:5, 9:16).
   - Container format (JPEG, PNG, WebP) verified via file magic bytes.
   - Byte size limit (maximum 10 MB).
   - Pixel dimension ceilings ($4096 \times 4096$ max, single frame static image).
   - Color profile normalization (sRGB profile).
   - Cryptographic SHA-256 byte digest computation.
   - Known bounding box and compositing coordinates within canvas.
   - Source product asset cryptographic match to `ProductSnapshot`.
2. **`VisualSafetyScanner` (Heuristic Gate):**
   - Unexpected text detection via OCR.
   - OCR is **not** a mathematical certainty tool. Outcomes are defined as:
     - `NO_TEXT_DETECTED`: Heuristic passed, proceed.
     - `TEXT_DETECTED`: Blocking if detected in AI-generated background; prevents auto-presentation until reviewed.
     - `TEXT_SCAN_INCONCLUSIVE`: Warning; engine error or low confidence; flags asset for mandatory human scrutiny.
   - OCR is **never** run against canonical product packaging typography (which is separately trusted from catalog source).
   - Heuristics document known risks of false positives (e.g. marble veining, botanical branches) and false negatives (e.g. stylized scripts, low contrast text).

### D6: Content-Addressable Asset Storage Strategy & Audit Immutability
Assets are stored using cryptographic SHA-256 digests calculated over **raw bytes**:
$$\text{Storage Key} = \text{sha256}(\text{imageBytes})$$
- Assets are never deduplicated merely by filename.
- Every asset is assigned an explicit **`AssetRole`**:
  - `CANONICAL_PRODUCT`: Original trusted catalog image.
  - `GENERATED_BACKGROUND`: Raw ambient scene synthesized by AI provider.
  - `COMPOSITED_CREATIVE`: Multi-layer composited final visual.
  - `PREVIEW`: Scaled/compressed preview optimized for Telegram transport.
- Metadata is tracked in PostgreSQL (`VisualAsset`): `sha256`, `mimeType`, `width`, `height`, `byteSize`, `assetRole`, `createdAt`, `sourceProvenance`.
- **Immutable Storage Access:** The application `AssetStoragePort` provides safe read/write access (`saveAsset`, `getMetadata`, `getAssetBuffer`, `assetExists`) with NO deletion methods. Assets participate in the tamper-evident audit chain. Future retention or legal purge operations are separated into an administrative port (`AssetRetentionPort` / `AssetAdministrationPort`).


### D7: Creative State Machine & Append-Only Versioning
The creative workflow is isolated from `ContentJob` status and governed by its own state machine:
```
REQUESTED
   ↓
GENERATING_BACKGROUND
   ↓
COMPOSITING
   ↓
VALIDATING
   ↓
READY_FOR_REVIEW ──(Revision Requested)──> REVISION_REQUESTED ──> GENERATING_BACKGROUND
   │
   ├──────> CREATIVE_APPROVED (Terminal for Phase 2A)
   └──────> CREATIVE_REJECTED (Terminal for Phase 2A)

[Any unrecoverable error] ──> FAILED
```
- Revisions are strictly **append-only**: `CreativeJob` $\longrightarrow$ `VisualAsset V1` $\longrightarrow$ `VisualAsset V2`. Version 1 is never overwritten.
- Full provenance is preserved: provider, model, seed (if returned), prompt version, brief version, source product digest, background digest, and final composited digest.

### D8: Telegram Review & Mandatory Human Sign-off
- Visual review is delivered via native high-resolution Telegram photo messages (`sendPhoto`) with draft metadata and inline action tokens.
- Approval targets an **exact `VisualAsset` version**. Stale approval attempts fail if a newer revision has been generated.
- `CREATIVE_APPROVED` is a terminal state in Phase 2A. **Zero automated social publishing, scheduling, or Meta Graph API interaction is implemented.**

---

## 3. Architecture Component Model

```mermaid
flowchart TD
    subgraph Content[Core Monolith Content Module]
        CV[ContentVersion\nExact Pinned Version]
        PS[ProductSnapshot\nImmutable Source]
        BR[BrandRuleVersion\nVisual Guidance]
    end

    subgraph CreativeModule[Creative Module (packages/application)]
        CBB[Creative Brief Builder]
        CP[CreativeProvider Port]
        
        subgraph Adapters[Provider Adapters]
            FAKE[FakeCreativeProvider\nDeterministic Fixtures (PR 2A-2)]
            REAL[Single Real Provider\nDeferred Flagged (PR 2A-5)]
        end

        COMP[Deterministic Compositor\nSharp / libvips (PR 2A-2)]
        AS[AssetStoragePort\nCAS SHA-256 (PR 2A-2)]
        DV[DeterministicVisualValidator\nBounds • Formats • CAS (PR 2A-3)]
        SS[VisualSafetyScanner\nHeuristic OCR Scanner (PR 2A-3)]
    end

    subgraph Persistence[Durable Storage (packages/database)]
        PG[(PostgreSQL\nCreativeJob • VisualAsset)]
        DISK[(Asset Storage\nLocal CAS / S3 MinIO)]
    end

    subgraph Review[Human Review (packages/telegram)]
        DISP[Telegram Outbox Dispatcher]
        TG[Telegram Review Interface\nExact-Version Action Tokens]
        HUMAN[Human Marketing Approver]
        TERM[Terminal State\nCREATIVE_APPROVED\nZero Auto-Publish]
    end

    CV --> CBB
    PS --> CBB
    BR --> CBB
    CBB --> CP
    CP --> Adapters
    Adapters --> COMP
    PS -.->|Canonical Hero Image| COMP
    COMP --> AS
    AS --> DISK
    AS --> DV
    DV --> SS
    SS --> PG
    PG --> DISP
    DISP --> TG
    TG --> HUMAN
    HUMAN -->|Exact Version Decision| TERM
```

---

## 4. Provider Strategy: Engineering vs. Procurement

We separate technical engineering requirements from legal/procurement requirements:

### Engineering Requirements:
- Provider-neutral contract (`CreativeProvider` port).
- Structured requests and typed responses.
- Explicit timeout controls and retry budgets.
- Cost and latency metadata returned on every call.
- Isolated in infrastructure adapters without leaking vendor SDKs into domain.
- **Initial Implementation Provider:** `FakeCreativeProvider` only. At most one real provider candidate evaluated later under a disabled-by-default feature flag.

### Legal / Procurement Requirements (Marked: TODO_LEGAL_CONFIRMATION):
- [ ] `TODO_LEGAL_CONFIRMATION`: Intellectual property ownership and commercial usage rights for provider-generated ambient backgrounds.
- [ ] `TODO_LEGAL_CONFIRMATION`: Copyright indemnification terms from generative AI vendor.
- [ ] `TODO_LEGAL_CONFIRMATION`: Enterprise data retention and training-opt-out commitments.

---

## 5. Security & Threat Mitigation Summary

1. **SSRF Ingestion Defense:**
   - Catalog product image URLs are fetched only from strictly configured allowlisted hosts (`ALLOWED_ASSET_DOMAINS`).
   - Safe DNS resolution with blocking of loopback (`127.0.0.0/8`, `::1`), link-local (`169.254.0.0/16`), RFC 1918 private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and cloud metadata IP (`169.254.169.254`).
   - Strict redirect limits (max 2 hops), revalidating every intermediate host.
   - HTTPS enforced exclusively.
   - Max response size capped at 15 MB with 5000ms socket timeout.
   - Magic bytes inspected to confirm MIME before passing to decoding engines.
   - Arbitrary Telegram/user URLs are strictly forbidden from ingestion.
2. **Decompression Bomb Defense:**
   - Max compressed input: 15 MB.
   - Max decoded pixels: 16,777,216 pixels ($4096 \times 4096$).
   - Static single-frame enforcement (animated GIFs and APNG multi-frames rejected).
   - Compositing processing timeout: 8000ms.
   - Sharp concurrency throttled to prevent CPU/memory starvation under load.
3. **Prompt Injection Defense:**
   - Creative brief generation strictly enforces structural separation between verified catalog attributes and natural language reviewer feedback.
   - System prompts isolate aesthetic parameters from executable instructions.

---

## 6. Dependency Licensing Review Summary

| Package | Version | License | Linking / Distribution | Policy Status |
|---|---|---|---|---|
| `sharp` | `^0.33.x` | Apache-2.0 | Node.js native addon | Permissive default |
| `@img/sharp-libvips-*` | `^8.15.x` | LGPL-3.0-or-later | Dynamically linked precompiled C library | **Requires Exception** (`TODO_LEGAL_CONFIRMATION`) |

- **Current Repository License Policy:** Permissive-first (`MIT`, `Apache-2.0`, `BSD`, `ISC`). LGPL is non-allowlisted and fails automated checks unless an exact exception is recorded in `license-exceptions.json`.
- **Proposed Exception Action:** Formal exception proposal documented in [`/docs/creative-license-review.md`](../creative-license-review.md) pending legal confirmation.
- **Rule:** We do not claim "fully compliant" until formal management/legal exception is approved.

---

## 7. Phased Implementation Plan

Implementation proceeds strictly via sequential, narrowly scoped PRs:

- **PR 2A-1: Data Model & Ports Only**
  - Prisma schema updates: `CreativeJob`, `VisualAsset`, `VisualValidationResult`, `VisualValidationFinding`.
  - Domain types, state machine, and repository/provider/storage interfaces in `@parisian-shopper/application`.
  - Zero image processing dependencies installed in this PR.
- **PR 2A-2: Fake Provider, Local CAS & Deterministic Compositor**
  - `FakeCreativeProvider` implementation using test fixtures.
  - Local disk content-addressable storage adapter.
  - Sharp compositing pipeline with hero preservation and contact shadows.
- **PR 2A-3: Validation Engine & Queue Workflow**
  - `DeterministicVisualValidator` and `VisualSafetyScanner` (heuristic OCR).
  - BullMQ `creative-generation` queue and worker integration in `@parisian-shopper/jobs`.
  - Outbox event `CREATIVE_VALIDATION_COMPLETED`.
- **PR 2A-4: Telegram Visual Review Handlers**
  - High-resolution visual card dispatch.
  - Action token callbacks: approve, edit, regenerate, reject.
  - Exact-version optimistic concurrency checks.
- **PR 2A-5: Single Real Provider Integration (Disabled by Default)**
  - One real provider adapter behind configuration flag `ENABLE_REAL_CREATIVE_PROVIDER=false`.
  - Activated only after business rules and legal review are complete.
