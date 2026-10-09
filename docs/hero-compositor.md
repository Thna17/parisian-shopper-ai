# Deterministic Hero Product Compositor Specification (Phase 2A)

**Document:** `/docs/hero-compositor.md`  
**Status:** IMPLEMENTED & VERIFIED  
**Version:** `ps-compositor-v1`  
**Author:** `HONG THAN BRATHNA — TECHNICAL DEVELOPER`  

---

## 1. Architectural Overview & Separation of Concerns

The Parisian Shopper AI Creative Automation pipeline follows a strict staged boundary separating probabilistic generative synthesis from deterministic pixel composition:

```text
CANONICAL_PRODUCT (ProductSnapshot catalog truth)
        +
GENERATED_BACKGROUND (CreativeProvider ambient synthesis)
        ↓
SharpHeroCompositor (Local deterministic image compositor adapter)
        ↓
COMPOSITED_CREATIVE (Normalized sRGB PNG)
        ↓
AssetStoragePort.saveAsset()
        ↓
DiskAssetStorageAdapter (Content-Addressable Storage / CAS)
```

### Core Invariants:
1. **Port Separation:**
   - `CreativeProvider`: Ambient generative background synthesis ONLY (`generateBackground`). Zero knowledge of or capability to manipulate product imagery.
   - `HeroCompositor`: Deterministic local composition port (`composite`) implemented by `SharpHeroCompositor`. Strictly prohibits generative manipulation.
2. **Storage Decoupling:** `SharpHeroCompositor` operates purely in memory on input buffers and returns a `CompositeVisualResult` containing `compositedBuffer`. It never writes directly to disk or creates database entities (`CreativeJob`, `VisualAsset`). Storing to disk is handled exclusively via `AssetStoragePort`.

---

## 2. Product Identity Invariant (Visual Truth)

The canonical product image is treated as authoritative, immutable brand visual truth.

### 2.1 Permitted Operations:
- Safe container decode
- Deterministic Lanczos3 proportional resizing
- Source aspect ratio preservation
- Deterministic positioning within computed safe margins
- Alpha compositing over the background (`blend: 'over'`)
- Cryptographic SHA-256 digest verification

### 2.2 Strictly Forbidden Operations:
- **No** hue, saturation, brightness, contrast, or tint changes
- **No** creative color grading or LUTs
- **No** blur, sharpening, or edge softening
- **No** AI relighting or diffusion blending
- **No** generative inpainting or outpainting
- **No** alteration or recreation of packaging logos, dials, volume text, or fonts

---

## 3. Product Alpha Transparency Policy

Phase 2A strictly requires canonical product imagery to provide usable alpha transparency:
- The product image must contain an alpha channel (`hasAlpha: true`).
- The image must contain actual transparent pixels (alpha < 250).
- If the canonical product image is opaque (e.g. standard JPEG or RGB PNG without alpha), `SharpHeroCompositor` rejects the request with `CreativeAlphaRequiredError` (`CREATIVE_ALPHA_REQUIRED`).
- **Zero Generative Background Removal:** The system never attempts AI background removal, heuristic edge carving, or fake segmentation.

---

## 4. Supported Formats & Geometry Controls

### 4.1 Input Formats:
- **Background:** PNG, JPEG, WebP.
- **Canonical Product:** PNG, WebP (with alpha channel).
- **Unsupported:** SVG, animated GIFs, multi-page APNG/WebP are strictly rejected before full decoding.

### 4.2 Safe Decode & Decompression Bomb Defenses:
- **Max Input Byte Size:** 15 MB (`CreativeInputTooLargeError`).
- **Max Decoded Pixels:** 16,777,216 pixels (16 MP) via `sharp({ limitInputPixels: 16777216 })`.
- **Max Dimension Ceilings:** 4096 px per axis.
- **Single-Frame Static Enforcement:** Multi-page/animated inputs are rejected.

### 4.3 Output Format:
- **PNG exclusively** (`image/png`), compression level 9, adaptive filtering, sRGB color space.
- Metadata is completely stripped (zero EXIF, GPS, camera model, or upstream tags retained).
- Cryptographic digests computed: `productDigest`, `backgroundDigest`, `outputDigest`.

### 4.4 Canvas Profiles & Scaling:
- Standard visual profiles: `1:1` (1080x1080), `4:5` (1080x1350), `9:16` (1080x1920).
- **Hero Scaling:** Default `heroHeightRatio = 0.55` (55% canvas height), preserving source aspect ratio.
- **Safe Margins:** Enforces minimum 5% margin (`safeLeft`, `safeRight`, `safeTop`, `safeBottom`). Hero bounding box must reside fully within safe margins, else fails with `CreativeInvalidLayoutError`.

---

## 5. Sharp Resource Management & Concurrency Controls

- `sharp.concurrency(2)`: Process-wide concurrency throttle preventing CPU starvation under high load.
- `sharp.cache({ memory: 128, files: 20, items: 100 })`: Explicit LRU cache ceiling preventing unconstrained memory growth.

---

## 6. Known Limitations & Scope Boundaries

1. **Phase 2A Scope:** Single-hero centered product compositing. Complex multi-product layouts, vector typography overlays, and contact shadows remain deferred to future iterations.
2. **Production Runtime Status:** Remains `UNRESOLVED / REQUIRES RE-REVIEW`.
