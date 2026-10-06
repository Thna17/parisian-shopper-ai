# ADR-003: Architectural Strategy for Creative & Visual Automation (Phase 2A)

- **Status:** ACCEPTED
- **Date:** 2026-10-06
- **Decision owners:** Parisian Shopper Engineering & Architecture
- **Supersedes:** None (Extends [ADR-002](ADR-002-clean-room-application-stack.md))
- **Scope:** Phase 2A Creative / Visual Generation Architecture. Strictly excludes social publishing, auto-posting, Meta Graph APIs, scheduling, and analytics.

---

## 1. Context & Business Need

In Phase 1 (MVP 0.1.0), the Parisian Shopper AI Content System established a hardened, clean-room foundation for bilingual marketing text generation, deterministic factual validation, and human review via Telegram. Content jobs advance through:
$$\text{Product} \longrightarrow \text{ProductSnapshot} \longrightarrow \text{AI Text Generation} \longrightarrow \text{Deterministic Validation} \longrightarrow \text{Telegram Review} \longrightarrow \text{APPROVED}$$

While textual copy is fully automated and factually verified, luxury social commerce (specifically in luxury retail markets across Southeast Asia and digital channels) relies heavily on high-fidelity, polished visual assets. Marketing teams currently must manually search for product photos, compose lifestyle backgrounds, format aspect ratios, and assemble multi-channel assets.

Phase 2A introduces **Creative / Image Automation** to generate on-brand, photorealistic visual assets directly grounded in verified product data and approved marketing text.

### Critical Challenges & Risks in Generative Visual AI
1. **Factual Hallucination in Visuals:** Generative image models (e.g., DALL-E, Stable Diffusion, FLUX) are notorious for synthesizing distorted text, hallucinating fictional bottle shapes, altering genuine luxury brand logos, or fabricating non-existent prices on visual cards.
2. **Packaging & Brand Integrity Distortion:** Luxury fragrance bottles, watch dials, and cosmetic packaging have exact physical proportions, typography, and glass refractions that cannot be synthesized from scratch without brand damage.
3. **Vendor Lock-In & API Evolution:** The generative image landscape is evolving rapidly. Tightly coupling application logic to a specific vendor SDK (e.g., OpenAI DALL-E, Stability AI, Midjourney via API, or self-hosted FLUX) creates significant technical debt.
4. **Licensing & Copyright Liabilities:** Diffusion models present complex intellectual property considerations regarding training provenance, commercial rights, and output asset ownership.
5. **Premature Automation:** If visual assets are generated and automatically published without human sign-off, defective visuals could reach public customer channels.

---

## 2. Decision Summary

We extend the Parisian Shopper NestJS modular monolith with a dedicated **Creative Automation Engine** adhering to the following core architectural decisions:

### D1: Decoupled Staged Pipeline
Creative generation is decoupled from text generation. It operates downstream on **approved or reviewable content versions**:
$$\text{ContentVersion (Approved/Under Review)} \longrightarrow \text{CreativeBrief} \longrightarrow \text{CreativeProvider} \longrightarrow \text{VisualAsset} \longrightarrow \text{VisualValidation} \longrightarrow \text{Telegram Review} \longrightarrow \text{CREATIVE\_APPROVED}$$
A creative asset is never generated in a vacuum; it is anchored to a specific `ContentVersion`, its immutable `ProductSnapshot`, and the active `BrandRuleVersion`.

### D2: Provider-Neutral `CreativeProvider` Port
We establish a clean-room TypeScript port (`CreativeProvider`) in `@parisian-shopper/application`. Infrastructure adapters implement this port for specific generation engines (e.g., `OpenAICreativeProvider`, `StabilityCreativeProvider`, `FakeCreativeProvider`). The domain layer never imports vendor SDKs.

### D3: Hero Product Image Preservation & Compositing Strategy
**Generative AI is strictly prohibited from synthesizing the core product packaging from scratch.** 
- The authentic, verified product image from `ProductSnapshot.images` is treated as an immutable visual truth (the "Hero").
- Generative AI is utilized exclusively for **ambient lifestyle background generation**, thematic Parisian atmospheres, mood lighting, and aesthetic staging aligned with the creative brief.
- The hero product is preserved with authentic geometry and composited onto the generated luxury scene using deterministic image compositing tools (e.g., `Sharp` / `libvips`), ensuring 100% packaging fidelity.

### D4: Factual Invariance & Deterministic Typography Overlays
Under no circumstances may diffusion models render price, SKU, brand name, volume, concentration, or promotional discount text directly into the image bitmap.
- Any text overlays, badges, or price tags required for promotional creatives are rendered via **deterministic vector templates** (SVG / Sharp) using exact data from `ProductSnapshot` and `ContentVersion`.
- Visual copy is guaranteed by code to match validated text.

### D5: Deterministic Visual Validation Engine (`DeterministicVisualValidator`)
Prior to human review, every generated asset undergoes automated, deterministic visual validation:
- Resolution & Dimension verification against the requested platform aspect ratio (1:1, 4:5, 9:16).
- File size, format (JPEG, PNG, WebP), and color gamut constraints.
- Aspect ratio boundaries and safe zone compliance.
- OCR / text inspection to verify that no hallucinated or unapproved text was generated by the provider.

### D6: Content-Addressable Asset Storage Strategy
Generated and composited visual assets are stored in a dedicated content-addressable storage layer (`AssetStoragePort`):
- Each asset is identified by its SHA-256 digest: `sha256(bytes)`.
- Metadata (MIME type, width, height, byte size, color profile) is recorded in PostgreSQL (`VisualAsset`).
- Development and pilot environments use local filesystem storage with static streaming. Production environments swap the adapter for S3 / MinIO object storage with pre-signed URLs.

### D7: Telegram Interactive Visual Review Flow
The Telegram transport delivers the generated visual asset using native high-resolution media messages (`sendPhoto` / `sendMediaGroup`) accompanied by draft metadata and inline keyboard action tokens:
- `✅ Approve Visual`: Advances asset state to `APPROVED`.
- `✏️ Request Visual Edit`: Allows reviewer to provide natural language styling adjustments (e.g., *"Make background more Haussmannian marble with softer morning light"*).
- `🔄 Regenerate Visual`: Requests a fresh visual candidate with new random seed.
- `❌ Reject Visual`: Rejects visual with mandatory feedback reason.

### D8: Mandatory Human Governance & Terminal State
Visual generation terminates at `CREATIVE_APPROVED` or `CREATIVE_REJECTED`. 
- Approval requires explicit human sign-off from an authorized `MARKETING_APPROVER`.
- **Strict Scope Guardrail:** Zero auto-publishing, scheduling, or Meta Graph API posting capability is introduced in Phase 2A.

---

## 3. Architecture & Component Model

```mermaid
flowchart TD
    subgraph Core[Core Content Foundation (Phase 1)]
        CV[ContentVersion\nApproved / Under Review]
        PS[ProductSnapshot\nImmutable Source]
        BR[BrandRuleVersion\nVisual Guidance]
    end

    subgraph Phase2A[Phase 2A Creative Automation Engine]
        CBB[Creative Brief Builder]
        CP[CreativeProvider Port]
        
        subgraph Adapters[Provider Adapters]
            OAI[OpenAICreativeProvider\nDALL-E 3 / GPT-Image]
            SD[StabilityCreativeProvider\nStable Diffusion 3.5]
            FAKE[FakeCreativeProvider\nDeterministic Fixtures]
        end

        COMP[Image Compositor\nSharp / libvips\nHero Preservation]
        AS[Asset Storage\nLocal / S3 MinIO\nSHA-256 Addressed]
        VV[Deterministic Visual Validator\nDimensions • Bounds • OCR]
    end

    subgraph Storage[Durable Persistence]
        PG[(PostgreSQL\nVisualAsset • CreativeJob)]
        DISK[(Object Storage\nRaw & Composited Images)]
    end

    subgraph Review[Human Governance (Telegram)]
        DISP[Telegram Outbox Dispatcher]
        TG[Telegram Bot Preview\nHigh-Res Photo Card]
        HUMAN[Human Approver\nMARKETING_APPROVER]
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
    AS --> VV
    VV --> PG
    PG --> DISP
    DISP --> TG
    TG --> HUMAN
    HUMAN -->|Approve / Reject / Edit| TERM
```

---

## 4. Options Evaluated & Trade-off Analysis

| Area | Option Selected | Alternatives Considered | Decision Rationale & Trade-offs |
|---|---|---|---|
| **Pipeline Timing** | **Decoupled Downstream Generation** (Triggered from approved/reviewable copy) | End-to-end monolithic generation (generate text + image simultaneously) | Monolithic generation wastes expensive GPU/API cycles creating images for copy that might fail factual validation or be rejected by editors. Decoupling ensures images are only generated for valid copy. |
| **Product Representation** | **Hero Preservation + Ambient Scene Compositing** | Pure text-to-image synthesis (AI draws bottle from scratch) | Pure synthesis consistently mutates luxury packaging, distorts trademarked logos, and hallucinates labels. Preserving the catalog image ensures 100% packaging fidelity. |
| **Provider Abstraction** | **Pluggable `CreativeProvider` Port** | Direct OpenAI SDK calls throughout codebase | The generative image space is evolving faster than text LLMs. A vendor-neutral port allows switching from OpenAI to Stability, FLUX, or self-hosted ComfyUI with zero domain changes. |
| **Typography on Creatives** | **Deterministic SVG / Sharp Template Overlays** | Diffusion model in-painting / text rendering | Diffusion text generation is non-deterministic and prone to catastrophic price/spelling errors. Deterministic vector rendering guarantees factual mathematical precision. |
| **Asset Storage** | **Content-Addressable Storage (SHA-256 Digest)** | Storing raw binary blobs in PostgreSQL (`bytea`) | PostgreSQL `bytea` bloats database backups and degrades I/O. Content-addressable storage on filesystem/S3 provides deduplication, high throughput, and CDN readiness. |
| **Visual Validation** | **Programmatic Metric & Bounds Inspection + Safe Zone Check** | LLM Multimodal Vision-as-judge (e.g. GPT-4o inspecting image) | Vision LLMs are non-deterministic, expensive, and slow. Programmatic inspection (Sharp metadata, pixel bounds, aspect ratio) provides instant, deterministic verification. |

---

## 5. Provider-Neutral Port Specification

The `CreativeProvider` port is defined in `@parisian-shopper/application`:

```typescript
export interface CreativeJobRequest {
  readonly creativeJobId: string;
  readonly productSnapshot: NormalizedProductEnvelope;
  readonly creativeBrief: string;
  readonly stylePrompt: string;
  readonly negativePrompt?: string;
  readonly dimensions: ImageDimensions;
  readonly aspectRatio: AspectRatio;
  readonly heroProductImageUrl?: string;
  readonly seed?: number;
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

export interface CreativeProvider {
  readonly providerName: string;
  readonly defaultModel: string;
  generateScene(request: CreativeJobRequest): Promise<CreativeJobResult>;
}
```

---

## 6. Security, Threat Modeling & Licensing Analysis

### 6.1 Security & Threat Mitigation
1. **Prompt Injection via Creative Brief:**  
   *Threat:* Malicious user input injected into revision instructions altering image model behavior.  
   *Mitigation:* Context builder strictly separates trusted product catalog facts from untrusted reviewer feedback. Image prompts use template-based structural constraints.
2. **SSRF & Malicious Image Uploads:**  
   *Threat:* Hero product URLs pointing to internal loopback or malicious payloads.  
   *Mitigation:* Product images are ingested exclusively from verified catalog snapshot domains. Image files are strictly decoded and sanitized via `Sharp` prior to storage.
3. **Storage Exhaustion / Resource Exhaustion (DoS):**  
   *Threat:* Excessive image generation bloating disk space.  
   *Mitigation:* Strict rate limiting per Telegram identity (maximum 3 image generations per minute), hard timeout limits (30 seconds per generation), and automated retention policies.

### 6.2 Dependency License Compliance
- `sharp` / `libvips`: Apache-2.0 / LGPL-3.0. Note: `sharp` is Apache-2.0. In accordance with `/docs/dependency-license-policy.md`, pre-built Sharp binaries utilize Apache-2.0 / BSD / MIT dependencies without requiring proprietary or restrictive licensing.
- Official `openai` SDK: Apache-2.0 (already evaluated and approved in Phase 1C).
- Stability AI / Replicate clients: Permissively licensed (MIT / Apache-2.0).
- Zero code copied from `/research/muse` or `/research/nichebot`.

---

## 7. Operational & Governance Guardrails

1. **Mandatory Human Sign-off:** No creative asset is marked `CREATIVE_APPROVED` without explicit confirmation by an authenticated `MARKETING_APPROVER`.
2. **Strict Publishing Isolation:** The creative pipeline contains zero integrations with Facebook Graph API, Instagram Graph API, Meta Business Suite, or scheduling queues.
3. **Immutable Provenance:** Every `VisualAsset` records the exact `ContentVersion` ID, `ProductSnapshot` ID, `BrandRuleVersion` ID, generation parameters, latency, and approver identity.
