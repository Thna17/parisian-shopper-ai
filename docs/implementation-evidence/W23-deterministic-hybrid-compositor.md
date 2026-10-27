# W23 — Deterministic Hybrid Compositor Implementation Evidence Dossier

- **Document:** `/docs/implementation-evidence/W23-deterministic-hybrid-compositor.md`
- **Work Package:** W23 — Complete the Deterministic Hybrid Compositor
- **Phase:** Stage 2 — Creative Engine & Poster Studio
- **Classification:** `COMPLETE — READY FOR REVIEW`
- **Authority:** Master Engineering Blueprint v3.0 §8.1, §11; Implementation Plan v1.0 W23; W03-DEC-005, W03-DEC-006
- **Repository Branch:** `feat/w23-hybrid-compositor`
- **Base Commit:** `b7a37c0eb023a81422b2f57c27f61593080e081d`

---

## 1. Executive Summary & Architecture

Work package **W23 — Deterministic Hybrid Compositor** resolves the historical fragmentation between `SharpHeroCompositor` and `SharpPosterCompositor` by establishing a unified, multi-layer, content-addressable, deterministic image composition engine executing in Node.js via headless `sharp` (libvips).

All six phases (W23-A through W23-F) are completed:
1. **W23-A:** Architectural audit, legacy reconciliation plan, and technical design ([`W23-A-hybrid-compositor-technical-design.md`](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/docs/implementation-evidence/W23-A-hybrid-compositor-technical-design.md)).
2. **W23-B:** Domain port contracts, metadata models, typed error hierarchy, and content-addressable render cache engine ([`hybrid-compositor.port.ts`](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/packages/application/src/modules/creative/application/hybrid-compositor.port.ts), [`compositor-render-cache.ts`](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/packages/application/src/modules/creative/infrastructure/compositor-render-cache.ts)).
3. **W23-C:** Multi-layer Sharp composition engine executing the strict 8-layer pipeline with authentic product pixel preservation and sRGB color profile normalization ([`sharp-hybrid-compositor.adapter.ts`](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/packages/application/src/modules/creative/infrastructure/sharp-hybrid-compositor.adapter.ts)).
4. **W23-D:** W20 Layered Creative Scene graph connection (`renderSceneVersion`), legacy port reconciliation without code deletion, and layer-level failure recovery ([`sharp-hero-compositor.adapter.ts`](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/packages/application/src/modules/creative/infrastructure/sharp-hero-compositor.adapter.ts), [`sharp-poster-compositor.adapter.ts`](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/packages/application/src/modules/creative/infrastructure/sharp-poster-compositor.adapter.ts), [`w23-scene-compositor-integration.spec.ts`](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/packages/application/src/modules/creative/domain/templates/w23-scene-compositor-integration.spec.ts)).
5. **W23-E:** Multi-format golden compositing matrix verifying bit-exact determinism across 5 canonical templates × 3 aspect ratios, plus review artifact generation ([`hybrid-compositor-golden.spec.ts`](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/packages/application/src/modules/creative/infrastructure/hybrid-compositor-golden.spec.ts), [`generate-w23-compositor-golden-review.mjs`](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/scripts/generate-w23-compositor-golden-review.mjs)).
6. **W23-F:** Observability instrumentation with Prometheus histograms/counters, complete quality gate verification, and evidence dossier compilation ([`prometheus-metrics.service.ts`](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/packages/jobs/src/metrics/prometheus-metrics.service.ts), [`compositor-metrics.tracker.ts`](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/packages/application/src/modules/creative/infrastructure/compositor-metrics.tracker.ts)).

```mermaid
flowchart TD
    Client[Poster Studio / Job Worker] -->|SceneVersionRecord| Port[HybridCompositor Port]
    Port --> SharpAdapter[SharpHybridCompositorAdapter]
    SharpAdapter --> Cache[CompositorRenderCache (Content-Addressable)]
    Cache -->|Cache Hit < 2ms| FastReturn[Bit-Exact Cached PNG]
    Cache -->|Cache Miss| Pipeline[Strict 8-Layer Composition Engine]
    Pipeline --> L1[Layer 1: Background CAS Texture]
    Pipeline --> L2[Layer 2: Contrast Panel / Vignette]
    Pipeline --> L3[Layer 3: Pedestal Grounding Surface]
    Pipeline --> L4[Layer 4: Synthesized Contact Shadow]
    Pipeline --> L5[Layer 5: Authentic Product Flacon (Contain, Zero-Distortion)]
    Pipeline --> L6[Layer 6: Brand Logo Clear-Space]
    Pipeline --> L7[Layer 7: HarfBuzz Shaped Vector Typography]
    Pipeline --> L8[Layer 8: Governed Haussmann Frame / Accents]
    Pipeline --> Normalize[sRGB Normalization & Metadata Stripping]
    Normalize --> Output[Bit-Exact Production PNG + Metadata Manifest]
    Output --> Metrics[CompositorMetricsTracker / Prometheus]
```

---

## 2. Reconciled Compositor Structure & Backward Compatibility

### 2.1 Unified Delegation Pattern
Prior to W23, pixel compositing was duplicated between `SharpHeroCompositor` and `SharpPosterCompositor`. Neither compositor has been deleted; instead, both have been preserved and reconciled to delegate their core pixel pipeline to `SharpHybridCompositorAdapter`:

1. **`SharpHeroCompositor` (Hero Port):**
   - Implements `HeroCompositor` (`HERO_COMPOSITOR` symbol).
   - Maps inputs to a 3-layer `HybridCompositorInput`: `[BACKGROUND, SHADOW, PRODUCT_HERO]`.
   - Delegates composition to `SharpHybridCompositorAdapter`.
   - Preserves legacy return types (`HeroCompositeResult`) and `ps-compositor-v1` version identification.
2. **`SharpPosterCompositor` (Poster Port):**
   - Implements `PosterCompositor` (`POSTER_COMPOSITOR` symbol).
   - Uses `PosterCopyBuilder`, `ShapedTextLayoutEngine`, and `TemplateRegistry` to calculate geometric coordinates and render vector SVG overlays.
   - Delegates final rasterization and layer blending to `SharpHybridCompositorAdapter`.
   - Preserves `PosterCompositorResult` and `ps-poster-compositor-v2` compatibility.
3. **`SharpHybridCompositorAdapter` (Direct Scene Port):**
   - Implements `HybridCompositor` (`HYBRID_COMPOSITOR` symbol).
   - Directly renders W20 `CreativeSceneVersionRecord` instances via `renderSceneVersion(sceneVersion, assetResolver)`.
   - Provides native content-addressable caching, sub-pixel alignment, and fail-closed security assertions.

---

## 3. Strict 8-Layer Vertical Z-Order Specification

Every composition is assembled strictly along the Z-axis in ascending index order:

| Z-Index Range | Semantic Group | Purpose & Treatment | Fail-Closed Policy |
|---|---|---|---|
| **000–049** | `BACKGROUND` | AI-generated photographic backdrop or luxury CAS texture (`cover` or exact dimension fit). | Missing asset throws `CompositorLayerMissingAssetError`. Corrupted asset throws `CompositorCorruptedLayerAssetError`. |
| **050–099** | `SURFACE` (Contrast) | Contrast panels, subtle readability vignettes, or darkening gradients. | Optional layer. Applied with blending `over`. |
| **100–149** | `SURFACE` (Pedestal) | Grounding shelf, marble pedestal line, or architectural foundation. | Placed at pedestal baseline (e.g. 68%–72% of canvas height). |
| **150–199** | `SHADOW` | Realistic soft contact and ambient shadow synthesized directly from product cutout alpha mask (max 32% opacity, 6px Gaussian blur). | Synthesized automatically if explicit shadow layer omitted. |
| **200–299** | `PRODUCT_HERO` | Authentic product packaging cutout. Rendered with `sharp.fit.contain`, preserving exact physical flacon aspect ratio with sub-pixel pedestal alignment. | **LUXURY TRUTH RULE:** Pixel modification, cropping, or aspect ratio distortion is strictly forbidden. Disallowed overlap throws `CompositorCtaOverlapError`. |
| **300–349** | `BRAND_LOGO` | Brand wordmark / crest with enforced clear-space safety zones. | Must respect safe margin boundaries. |
| **350–449** | `TYPOGRAPHY` | HarfBuzz-shaped Khmer and Latin vector text overlays (headlines, pricing, scent notes, CTA buttons). | Violation of safe text margins throws `CompositorSafeZoneViolationError`. |
| **450–499** | `DECORATIVE` | Governed decorative accents (Haussmann gold frame `#D4AF37`, thin geometric dividers, Khmer lotus ornaments). | Must not collide with product hero or CTA buttons. |

---

## 4. Product Visual Truth & Authentic Pixel Preservation

The Parisian Shopper AI luxury standard mandates absolute fidelity to authentic product packaging. The hybrid compositor enforces this through three cryptographic and geometric invariants:

1. **Aspect Ratio Containment (`fit: 'contain'`):**
   Product cutouts are never stretched or squashed. The ratio `heroWidth / heroHeight` strictly equals `originalWidth / originalHeight` within ±0.01 tolerance.
2. **Sub-Pixel Pedestal Grounding:**
   The bottom edge of the product flacon is mathematically aligned to the pedestal baseline:
   $$\text{heroTop} = \text{pedestalY} - \text{heroHeight}$$
   preventing the bottle from floating or penetrating the pedestal.
3. **No Dynamic Alteration of Flacon Pixels:**
   The product flacon buffer is blended cleanly over the pedestal and shadow without color shifts, filters, or AI inpainting. The product's SHA-256 digest is validated before compositing.

---

## 5. Multi-Format Golden Compositing Matrix & Determinism Proofs

### 5.1 Canonical 15-Composite Golden Review Manifest
All 15 canonical combinations (5 template families × 3 aspect ratios) were rendered using the authentic GEP King EDP flacon (`60136f208cf5da313ea5a0f3568f1a0d6fcc6ec06275938fedea562bc7479232`) and recorded in `app/.data/w23-compositor-review/manifest.json`:

| Index | Template Family | Ratio | Dimensions | Output SHA-256 Digest | Byte Size | First Render Latency |
|---|---|---|---|---|---|---|
| 1 | `CENTERED_HERO` | `1:1` | 1080×1080 | `a115cdfc1315524282629b1da9622d80f91e76366319e76b53491c9e733bdf03` | 216,362 B | 417 ms |
| 2 | `CENTERED_HERO` | `4:5` | 1080×1350 | `2249a62c2282a6b6d0250e8c2d67f621c142484d9a970193fd5c82b70f603a4c` | 268,810 B | 437 ms |
| 3 | `CENTERED_HERO` | `9:16` | 1080×1920 | `f0a5ab7bb8986f6857691617b61fe96ec1baae9896a57596024db5d8bb3eed99` | 372,403 B | 579 ms |
| 4 | `EDITORIAL_SPLIT` | `1:1` | 1080×1080 | `c04db6cfdede9a0220030b3219da26a14f6539eac7b91525cd0036d600dca9cb` | 261,763 B | 393 ms |
| 5 | `EDITORIAL_SPLIT` | `4:5` | 1080×1350 | `f60009dd30ea560a67b1ee4b2fc501969ab32e7f6312e71e2ee35f1885157167` | 269,966 B | 411 ms |
| 6 | `EDITORIAL_SPLIT` | `9:16` | 1080×1920 | `1f8e1b1535c1e88f5568f90401e68e6d73eb45c10e52ed6be0223f9d2c832e69` | 299,888 B | 466 ms |
| 7 | `KHMER_SEASONAL` | `1:1` | 1080×1080 | `6c96619c9c22516a9980a2f354bd93a5ec100b8e4864431e4cc9ba2f9f220d54` | 211,353 B | 351 ms |
| 8 | `KHMER_SEASONAL` | `4:5` | 1080×1350 | `f4a588e2fb5b71e59d949d65cf094178b3caf83b6540f747ece440420f42ab13` | 275,217 B | 406 ms |
| 9 | `KHMER_SEASONAL` | `9:16` | 1080×1920 | `de41b2c9fcbf7046243acc295b372263c63d11b612731d0a0e6871f35f6345a4` | 364,951 B | 520 ms |
| 10 | `SCENT_STORY` | `1:1` | 1080×1080 | `5f13e551ee7adbe167cf86638c4865336e9a950766367bf806a54558453b2313` | 246,965 B | 381 ms |
| 11 | `SCENT_STORY` | `4:5` | 1080×1350 | `e2f61e2f9379824b555f8717fd4732aee26b8b939114266c3997ad7471d2b6bd` | 300,033 B | 437 ms |
| 12 | `SCENT_STORY` | `9:16` | 1080×1920 | `d94442480e666c20ef1b7048f8679d81e98713032f07d5b06eecace0839a8e89` | 272,322 B | 453 ms |
| 13 | `PROMOTION_PRICE_CTA` | `1:1` | 1080×1080 | `2e78afa362dd6b3dd3e3f7cdc4218bc8790dc354b187f095a6d25591251cf1b0` | 227,452 B | 390 ms |
| 14 | `PROMOTION_PRICE_CTA` | `4:5` | 1080×1350 | `a07a930694be7e7802fe6e473c13dfbde90fea5c5896f8d1c7d9b609b0233f08` | 278,448 B | 412 ms |
| 15 | `PROMOTION_PRICE_CTA` | `9:16` | 1080×1920 | `fc1bee067361ba37542d111f155ca18109f51a6ad994343ce52e8c212a648efb` | 379,499 B | 541 ms |

### 5.2 Determinism Proofs
In [`hybrid-compositor-golden.spec.ts`](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/packages/application/src/modules/creative/infrastructure/hybrid-compositor-golden.spec.ts):
- Every poster was composited repeatedly across distinct instances.
- Asserted `output1.sha256 === output2.sha256` and `Buffer.compare(output1.compositedBuffer, output2.compositedBuffer) === 0` across all 15 template-format permutations.
- Bit-exact determinism was verified: 100% byte-for-byte reproducibility across all runs.

### 5.3 Cache Benchmark & Performance
- **First Render Latency (Cold):** 350 ms – 580 ms (including HarfBuzz shaping, rasterization, and PNG compression).
- **Cached Render Latency (Hot):** **< 2 ms** (instant return of cached buffer via cryptographic lookup key).
- **Cache Invalidation:** Modifying any layer buffer (background, product, or typography) immediately triggers a cache miss and produces a new unique SHA-256 digest.

---

## 6. Observability & Prometheus Metrics Architecture

Compositor operational health is monitored via real-time Prometheus metrics exported at `/metrics`:

### 6.1 Histogram: Render Duration
- **Metric:** `creative_compositor_render_duration_seconds{template_id, format, cache_status}`
- **Type:** `histogram`
- **Buckets:** `0.005`, `0.01`, `0.025`, `0.05`, `0.1`, `0.25`, `0.5`, `1`, `2.5`, `5`, `10`, `+Inf`
- **Exposition:**
  ```text
  # HELP creative_compositor_render_duration_seconds Latency of creative compositor render operations in seconds
  # TYPE creative_compositor_render_duration_seconds histogram
  creative_compositor_render_duration_seconds_bucket{template_id="CENTERED_HERO",format="1:1",cache_status="HIT",le="0.005"} 12
  creative_compositor_render_duration_seconds_bucket{template_id="CENTERED_HERO",format="1:1",cache_status="MISS",le="0.5"} 1
  creative_compositor_render_duration_seconds_sum{template_id="CENTERED_HERO",format="1:1",cache_status="MISS"} 0.417000
  creative_compositor_render_duration_seconds_count{template_id="CENTERED_HERO",format="1:1",cache_status="MISS"} 1
  ```

### 6.2 Counter: Cumulative Renders
- **Metric:** `creative_compositor_renders_total{template_id, format, cache_status, status}`
- **Type:** `counter`
- **Exposition:**
  ```text
  # HELP creative_compositor_renders_total Total number of creative hybrid compositor render operations
  # TYPE creative_compositor_renders_total counter
  creative_compositor_renders_total{template_id="CENTERED_HERO",format="1:1",cache_status="HIT",status="success"} 42
  creative_compositor_renders_total{template_id="EDITORIAL_SPLIT",format="4:5",cache_status="MISS",status="success"} 15
  ```

### 6.3 Counter: Layer Processing Failures
- **Metric:** `creative_compositor_layer_failures_total{layer_group, error_code}`
- **Type:** `counter`
- **Exposition:**
  ```text
  # HELP creative_compositor_layer_failures_total Total number of individual layer processing failures in compositor
  # TYPE creative_compositor_layer_failures_total counter
  creative_compositor_layer_failures_total{layer_group="PRODUCT_HERO",error_code="COMPOSITOR_CORRUPTED_LAYER"} 0
  ```

---

## 7. Quality Gate Audit Results

Every quality gate mandated by the Parisian Shopper AI repository was executed:

| Quality Gate | Command | Result | Details |
|---|---|---|---|
| **Module Boundaries** | `pnpm -C app boundaries` | **PASS** | Validated strict dependency layering across all packages. |
| **TypeScript Typecheck** | `pnpm -C app typecheck` | **PASS** | `tsc -b --pretty false` exited with 0 across all workspaces. |
| **ESLint Static Analysis** | `pnpm -C app lint` | **PASS** | 0 warnings, 0 errors across entire repository. |
| **Unit Test Suite** | `pnpm -C app test:unit` | **PASS** | 90 test suites passed, 1,168 tests passed. |
| **End-to-End Suite** | `pnpm -C app test:e2e` | **PASS** | Health and Telegram webhook E2E specs passed. |
| **Monorepo Build** | `pnpm -C app build` | **PASS** | Clean build for all library packages and applications. |
| **Prettier Formatting** | `pnpm -C app format:check` | **PASS** | 100% compliant with project Prettier code style. |
| **Git Diff Whitespace** | `git diff --check` | **PASS** | Zero whitespace or carriage return issues. |
| **Git Staged Files** | `git diff --cached --name-only` | **PASS** | 0 files staged (worktree clean for review). |

---

## 8. Artifacts & Master Review Bundle

All visual verification artifacts are generated and accessible on disk:
- **Master Contact Sheet (5 Families Side-by-Side):**
  `app/.data/w23-compositor-review/contact-sheets/contact-sheet-5-families-side-by-side.png` (1.1 MB)
- **15 Canonical Composites:**
  `app/.data/w23-compositor-review/composites/*.png`
- **Cryptographic Manifest:**
  `app/.data/w23-compositor-review/manifest.json`
- **Interactive Review Gallery:**
  `app/.data/w23-compositor-review/index.html`
