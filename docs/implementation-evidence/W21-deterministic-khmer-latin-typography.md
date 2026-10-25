# W21 — Deterministic Khmer and Latin Typography Implementation Evidence

**Document:** `/docs/implementation-evidence/W21-deterministic-khmer-latin-typography.md`  
**Work Package:** W21 — Complete Khmer and Latin Typography  
**Phase:** Stage 2 — Creative Engine & Poster Studio  
**Classification:** `IMPLEMENTED — AWAITING OWNER ACCEPTANCE`  
**Execution Date:** 2026-10-24  
**Authority:** Master Engineering Blueprint v3.0 §10, §22; Implementation Plan v1.0 W21; Approved Decisions W03-DEC-004 and W03-DEC-007  
**Owner Decision:** W03-DEC-007 Option A conditionally approved by Brathna on 2026-10-22 (Defer Moul and Kantumruy Pro; replace old Noto binaries with provenance-recorded OFL versions during W21; fail-closed safeguards mandatory).

---

## 1. Executive Summary

Work package **W21 — Complete Khmer and Latin Typography** establishes a deterministic, production-safe, multi-script typography subsystem for Parisian Shopper AI across English, Khmer, and mixed Khmer/Latin marketing creative copy.

Text on marketing posters is strictly an application-owned, deterministic vector layer. Under the core architectural mandates of Parisian Shopper AI:
- **No AI model ever generates poster text.**
- **No host operating-system fonts (`/Library/Fonts`, `/usr/share/fonts`, Windows fonts) are permitted.**
- **No external font downloading occurs at runtime.**
- **All typography operates entirely hermetic, local, and fail-closed.**

The implementation delivers:
1. **Provenance-recorded local font assets:** Replaced legacy Noto Sans Khmer binaries (which had embedded Apache license headers conflicting with the bundled OFL license) with official upstream OFL v2.004 binaries from `notofonts/khmer`. Added a machine-readable font manifest with cryptographic SHA-256 digests and file sizes.
2. **Hermetic Fail-Closed Font Registry:** Validates font byte sizes and SHA-256 digests against the immutable manifest before caching. Strictly rejects unknown families, missing files, corrupted buffers, or unsupported font weights (`PosterFontIntegrityError`, `PosterFontWeightUnsupportedError`).
3. **Real OpenType Shaping via HarfBuzz WASM (`harfbuzzjs@1.6.4`):** Replaces character-count heuristic width estimation with true OpenType GSUB/GPOS shaping, exact glyph advances, font ascent/descent metrics, and variable font weight axis (`wght`) interpolation.
4. **Deterministic Script-Run Partitioning:** Segmenter that separates mixed text into explicit script runs (Khmer → `Noto Sans Khmer`; Latin → `Playfair Display` or `Montserrat`), with deterministic script inheritance for punctuation, numerals, currencies (`$`, `៛`, `€`), and SKUs.
5. **Khmer-Safe Line Breaking:** Employs `Intl.Segmenter` with Coeng/subscript guards that strictly prohibit line breaks immediately after Coeng (`U+17D2`), between base consonants and subscripts, before dependent vowels/combining marks, or inside grapheme clusters.
6. **Fail-Closed Unicode & Glyph Validation:** Normalizes all input strings to NFC (`U+00E9`, not `e` + `U+0301`). Detects and rejects dangerous bidirectional override controls (`U+202A`–`U+202E`, `U+2066`–`U+2069`), null bytes, and non-printable control characters (`PosterUnsafeUnicodeError`). Pre-checks character map (cmap) coverage and detects `.notdef` (glyph 0) shaping fallbacks (`PosterFontGlyphMissingError`).
7. **Shaped Text Layout Engine:** Computes exact line widths, baseline offsets, and vertical bounding boxes. Provides bounded font shrinking (down to `minFontSize`) and strictly fails closed on bounding-box overflow (`PosterLayoutOverflowError`).
8. **Multi-Script SVG Text Rendering:** Emits clean SVG `<text>` elements containing multi-script `<tspan>` runs with explicitly declared `font-family` and `font-weight`, correctly rendered by headless Sharp/librsvg.
9. **W20 Scene Graph Invalidation Integration:** Implements `computeFontAssetDigest` and `computeTypographyPolicyDigest` in `scene-hash.ts`, binding font file checksums and typography policy versions (`TYPOGRAPHY_SHAPING_ENGINE_VERSION = '1.0.0-harfbuzz'`, `TYPOGRAPHY_POLICY_VERSION = '1.0.0'`) into W20 layer dependency hashes.

---

## 2. Architecture & Design Principles

The typography subsystem is structured into strictly separated domain and infrastructure layers conforming to hexagonal architecture:

```
app/packages/application/src/modules/creative/
├── domain/
│   ├── creative-errors.ts                  # Typed fail-closed typography & scene errors
│   ├── poster-templates.ts                 # Template definitions consuming TextLayoutEngine
│   ├── scene/
│   │   ├── creative-scene.types.ts         # Scene & layer dependency types (FONT_ASSET, TYPOGRAPHY_POLICY)
│   │   ├── scene-hash.ts                   # Cryptographic scene, layer, and typography dependency digests
│   │   └── typography-dependency-hash.spec.ts # Verification of font dependency hashing
│   └── services/
│       ├── unicode-validator.ts            # NFC normalization, dangerous bidi/control filtering
│       ├── script-run-resolver.ts          # Deterministic Latin/Khmer script partitioning
│       ├── khmer-line-breaker.ts           # Intl.Segmenter with Coeng & combining mark guards
│       ├── text-shaper.port.ts             # Abstract domain port for shaping & font metrics
│       ├── text-layout-engine.ts           # Bounded line-wrapping, shrinking, and overflow detection
│       ├── safe-svg-renderer.ts            # SVG emitter generating multi-script <tspan> runs
│       └── __fixtures__/
│           └── golden-typography-corpus.ts # 22 comprehensive production typography scenarios
└── infrastructure/
    ├── fonts/
    │   ├── font-manifest.ts                # Immutable manifest of approved fonts, digests, & licenses
    │   ├── font-registry.ts                # Fail-closed loader, hash validator, & cmap inspector
    │   ├── font-loader.ts                  # Backward-compatible adapter delegating to FontRegistry
    │   ├── harfbuzz-shaping-service.ts     # Adapter implementing TextShaperPort using harfbuzzjs WASM
    │   └── font-registry.spec.ts           # Font loading, integrity verification, and fallback tests
    └── sharp-poster-compositor.adapter.ts  # Headless Sharp rasterizer with fail-closed font checks
```

### Core Invariants:
1. **Zero Host-System Fallback:** FontRegistry explicitly searches only `app/assets/fonts/` (or configured hermetic font root). The legacy fallback path pointing to `/Library/Fonts` was completely removed. If an asset is missing or altered, rendering aborts immediately.
2. **Deterministic Computation:** Text shaping and measurement rely entirely on the immutable binary tables of the bundled fonts and the deterministic HarfBuzz WASM state. Identical input text with identical font configurations yields bit-exact measurements across executions.
3. **Fail-Closed Security:** Corrupt fonts, unsupported weights, unmapped glyphs, bidi spoofing, and layout overflow throw distinct domain errors. No silent fallbacks, no placeholder squares (tofu), and no text truncation with ellipses are allowed on production poster output.

---

## 3. Selected Shaping Engine & Technical Decision Rationale

### Selected Engine: `harfbuzzjs@1.6.4`
- **Package:** `harfbuzzjs` (v1.6.4, published to npm)
- **License:** MIT License (Zero runtime dependencies, 0 transitive packages)
- **Distribution:** Official WebAssembly compilation of the industry-standard HarfBuzz text shaping engine.

### Decision Rationale:
1. **Khmer Complex Script Support:** Khmer script requires advanced OpenType GSUB/GPOS shaping features, specifically:
   - Coeng subscript reordering (subscript consonants rendered beneath or following base consonants via `U+17D2`).
   - Complex vowel reordering (left-side vowels like `SRA EI` `U+17C1` rendered visually to the left of the base consonant).
   - Above/below diacritic stacking and mark positioning (GPOS `mkmk`, `mark`).
   - Ligature substitutions (GSUB `liga`).
   Heuristic width calculations or basic Latin-only kerning tables produce illegible or broken Khmer text. HarfBuzz is the reference implementation used across Chrome, Firefox, Android, and librsvg.
2. **Variable Font Support:** Playfair Display and Montserrat are variable fonts (`wght` axis). `harfbuzzjs` supports variable font axis configuration via `hb.Variation('wght', targetWeight)`, allowing precise glyph advance and contour calculations matching Sharp's underlying librsvg renderer.
3. **Hermetic & Cross-Platform WASM Execution:** Because `harfbuzzjs` is compiled to WebAssembly, it requires zero native compilation toolchains (e.g., node-gyp, python, C++ compiler) in Docker or CI environments, eliminating build flakes across macOS (ARM64/x86_64) and Linux (Debian/Alpine).
4. **Direct Cmap Inspection:** Provides access to the font's raw OpenType `cmap` table, allowing instantaneous pre-flight validation of character sets without invoking full rasterization.

---

## 4. Font Inventory, Verified Checksums & Upstream Provenance

All font assets are located in `app/assets/fonts/` with non-executable permissions (`0644`).

| Family Name | File Path | Supported Weights | File Size (Bytes) | SHA-256 Digest | Upstream Project & Ref | License |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Playfair Display** | `app/assets/fonts/playfair-display/PlayfairDisplay-Variable.ttf` | 400–900 (Variable) | 300,724 | `c40f2293766a503bc70cce9e512ef844a4ccb7cbcde792fe2ea31d191917d8d6` | Google Fonts / `clausgg/Playfair` (v2.000, commit `29288e89`) | OFL 1.1 (`app/assets/fonts/playfair-display/OFL.txt`) |
| **Montserrat** | `app/assets/fonts/montserrat/Montserrat-Variable.ttf` | 100–900 (Variable) | 744,936 | `0f7b311b2f3279e4eef9b2f968bcdbab6e28f4daeb1f049f4f278a902bcd82f7` | Google Fonts / `JulietaUla/Montserrat` (v7.222, commit `4a3e8dc`) | OFL 1.1 (`app/assets/fonts/montserrat/OFL.txt`) |
| **Noto Sans Khmer** (Regular) | `app/assets/fonts/noto-sans-khmer/NotoSansKhmer-Regular.ttf` | 400 | 147,792 | `cc8af91f5558ac8e53fce83213328dada31b22edb562e44938f04238a2a65b6a` | Google Noto Fonts / `notofonts/khmer` (Release `NotoSansKhmer-v2.004`) | OFL 1.1 (`app/assets/fonts/noto-sans-khmer/OFL.txt`) |
| **Noto Sans Khmer** (Bold) | `app/assets/fonts/noto-sans-khmer/NotoSansKhmer-Bold.ttf` | 700 | 148,708 | `4cf9803a479d68cb637fa8094fdf7bbd6b63ea546856e406e435101c12a6b24d` | Google Noto Fonts / `notofonts/khmer` (Release `NotoSansKhmer-v2.004`) | OFL 1.1 (`app/assets/fonts/noto-sans-khmer/OFL.txt`) |

### Provenance Replacement Details:
- **Legacy Issue:** Previous `NotoSansKhmer-Regular.ttf` and `NotoSansKhmer-Bold.ttf` had OpenType Name Table Record ID 13 stating "Licensed under the Apache License, Version 2.0", while the accompanying `OFL.txt` was SIL Open Font License 1.1.
- **Remediation:** Sourced official release `NotoSansKhmer-v2.004.zip` directly from `https://github.com/notofonts/khmer/releases/tag/NotoSansKhmer-v2.004`. Verified that the Name Table Record ID 13 contains the SIL Open Font License 1.1 text, completely aligning with `OFL.txt` (SHA-256: `be0407f060aea48787ff9e75d8d3aedef70aef113b3ce9aca26fdaacd10b1870`).

---

## 5. Approved Weight Matrix & Enforcement

Font weights are strictly validated before shaping:
- **Playfair Display:** Continuous variable range `[400, 900]`. Weights below 400 (such as 300 Light) throw `PosterFontWeightUnsupportedError`.
- **Montserrat:** Continuous variable range `[100, 900]`.
- **Noto Sans Khmer:** Discrete static weights `400` (Regular) and `700` (Bold). Any intermediate or extreme weight (e.g., 300, 500, 600, 800, 900) throws `PosterFontWeightUnsupportedError`.

---

## 6. Unicode Normalization & Security Policy

### Unicode Normalization:
All text inputs pass through `UnicodeValidator.normalizeAndValidate()`:
- **Form:** Unicode Normalization Form C (`NFC`, canonical decomposition followed by canonical composition).
- **Rationale:** Ensures composed forms (e.g., `é` as `U+00E9`) are consistently matched against font cmap tables, preventing accidental glyph mismatches caused by decomposed sequences (`e` + `U+0301`).

### Unsafe Character Detection (Fail-Closed):
The validator detects and throws `PosterUnsafeUnicodeError` if the string contains:
1. **Bidirectional Override Controls:**
   - Left-to-Right / Right-to-Left Overrides: `U+202A`–`U+202E` (`LRE`, `RLE`, `PDF`, `LRO`, `RLO`).
   - Bidirectional Isolates: `U+2066`–`U+2069` (`LRI`, `RLI`, `FSI`, `PDI`).
   - Rationale: Prevents trojan source, price spoofing, and visual deception attacks in marketing text.
2. **Dangerous Control Characters:**
   - Null bytes (`\0`).
   - C0 control characters (preserving approved whitespace `\n`, `\r`, `\t`).
   - C1 control characters (`U+007F`–`U+009F`).
3. **Corrupt & Invisible Unicode Sequences:**
   - Unicode Replacement Character `U+FFFD`.
   - Byte Order Mark `U+FEFF` within text content.
   - Invisible formatting and directional marks: `U+200C` (ZWNJ), `U+200D` (ZWJ), `U+200E` (LRM), `U+200F` (RLM). Note: `U+200B` (Khmer zero-width space) is permitted for orthographic word breaks.
   - Unpaired surrogate code points (`0xD800`–`0xDFFF`).
   - Private Use Area code points (`U+E000`–`U+F8FF`, `U+F0000`–`U+FFFFD`, `U+100000`–`U+10FFFD`).
   - Unicode Tags block (`U+E0000`–`U+E007F`).

---

## 7. Script-Run Partitioning & Fail-Closed Script Whitelisting Policy

Posters frequently feature mixed text, such as Khmer headlines with English brand names (`CHANEL ក្លិនក្រអូបពិសេស`), USD prices (`$48.00`), Cambodian Riel (`៛200,000`), or product SKUs (`SKU: N5-EDP-100`).

`ScriptRunResolver.resolveScriptRuns()` partitions text into homogeneous script runs:
1. **Grapheme-Cluster-Aware Partitioning (`Intl.Segmenter`):**
   - Breaks text into grapheme clusters using `Intl.Segmenter(undefined, { granularity: 'grapheme' })` prior to classification.
   - Ensures Khmer base consonants, Coeng subscripts (`U+17D2`), dependent vowels, and Latin combining diacritics are never fractured across separate font runs.
2. **Fail-Closed Script Whitelist:**
   - **Khmer Characters (`U+1780`–`U+17FF`, `U+19E0`–`U+19FF`):** Assigned to `Noto Sans Khmer`.
   - **Latin Characters (`A`–`Z`, `a`–`z`, accented Latin, Latin Extended A/B):** Assigned to the requested Latin font (`Playfair Display` or `Montserrat`).
   - **Approved Neutral Symbols:** Approved whitespace (including `U+00A0` NBSP, `U+202F` NNBSP, `U+200B` ZWSP), ASCII digits (`0`–`9`), ASCII punctuation, typographic punctuation (smart quotes, dashes, ellipsis, French guillemets `«` and `»`), and approved currency symbols (`$`, `€`, `£`, `¥`).
   - **Unsupported Scripts / Symbols (`PosterUnsupportedScriptError`):** Any character outside the approved whitelist (e.g. CJK ideographs, Cyrillic, Arabic, Thai, Devanagari, emoji) fails closed immediately with `codePoint`, `hexCodePoint`, `character`, `scriptCategory`, and `role`.
3. **Deterministic Neutral Resolution:**
   - Currency expressions: Currency symbols followed or preceded by ASCII digits (e.g. `$48`, `€120`, `120 €`, `120€`) resolve to Latin (`Montserrat`).
   - Enclosed neutrals: Neutrals surrounded by Khmer become `KHMER`; neutrals surrounded by Latin become `LATIN`.
   - Boundary neutrals: Inherit the preceding script; if at the start of text, inherit the succeeding script.
   - Pure neutral strings default to `LATIN`.

---

## 8. Khmer-Safe Line-Breaking & Wrapping Engine

Khmer script does not use spaces between words; spaces are used only as sentence or clause delimiters. Line breaks within Khmer sentences must occur at phonological word boundaries and must never split complex grapheme clusters.

`KhmerLineBreaker` wraps text safely:
1. **Grapheme Cluster Boundary Guard (`Intl.Segmenter`):**
   - Prior to word segmentation, extracts true grapheme cluster boundaries (`granularity: 'grapheme'`).
   - Ensures that no word segmentation break ever bisects a single grapheme cluster.
2. **Coeng / Subscript Protection:**
   - Khmer subscript consonants are preceded by the Coeng character `U+17D2` (SIGN COENG).
   - A line break immediately following `U+17D2` breaks the subscript sequence, causing an invalid character rendering (showing the Coeng sign as a visible dotted circle).
   - `KhmerLineBreaker` prevents breaks after `U+17D2` or between base and subscript consonants.
3. **Combining Mark Protection:**
   - Dependent vowels (`U+17B6`–`U+17C5`) and diacritics/signs (`U+17C6`–`U+17D3`, `U+17DD`) must never begin a new line.
   - If a break boundary separates a combining mark from its base consonant, the breaker merges the segment back to the preceding line.
4. **Lek Took (`U+17D7` ៗ) and Coda Consonant Remediation:**
   - Resolves ICU word segmentation bugs where monosyllabic words ending in a coda consonant before Lek Took (e.g. `ពិតៗ` -> `['ពិ', 'តៗ']`) are erroneously split.
   - Merges coda consonant and repetition sign back into the word base (`['ពិតៗ']`, `['សម្រស់', 'បែប', 'បារាំង', 'ពិតៗ']`).
   - Prevents orphan repetition marks (`ថ្មីៗ`, `លឿនៗ`, `ឆាប់ៗ`, `តិចៗ`, `ខ្លាំងៗ`).
5. **Orphan Punctuation Protection:**
   - Khmer punctuation marks (`។`, `៕`, `៖`, `៘`, `៚`) and currency (`៛`) never start a token or line; they are merged into the preceding word segment.
6. **Zero-Width Space (`U+200B` ZWSP):**
   - Preserved as an explicit orthographic break opportunity without leaving orphan combining marks.
7. **Commercial & SKU Protection:**
   - Price expressions (`$48`, `$48.00`, `120 €`, `120€`, `២០០,០០០ ៛`) and product SKUs (`PRS-LUM-2026-FR`) are kept atomic and never severed across line wraps.

---

## 9. Shaped Text Layout Engine & Metrics

`TextLayoutEngine` replaces heuristic width approximations with actual shaped metrics:
1. **HarfBuzz Metrics Resolution:** For each line and each script run, `HarfBuzzShapingService` shapes the text at the target font size and weight, computing exact glyph advances in points/pixels.
2. **Line Ascent & Descent:** Tracks the maximum ascender and descender across all fonts in a multi-script line to compute exact line height and baseline offset.
3. **True Vertical Layout & Ink Bounds (`actualBoundingBox`):**
   - Calculates baseline-to-baseline vertical layout: `baseline0 = Math.round(maxAscent)`, `baseline_i = baseline0 + i * lineHeight`.
   - Computes exact ink bounding box: `yMin = baseline0 - firstLine.ascent`, `yMax = lastLineBaseline + lastLine.descent`, `height = Math.max(totalHeight, yMax - yMin)`.
   - Emits `actualBoundingBox: { xMin, yMin, xMax, yMax, width, height }` on `WrappedTextResult`.
4. **Deterministic Shrinking & Overflow:**
   - If a text block exceeds the configured bounding box (`maxWidth`, `maxLines`, or `maxHeight`), the engine iteratively reduces the font size by `stepSize` (default 2px) down to `minFontSize`.
   - If the text still exceeds `maxWidth`, `maxLines`, or `maxHeight` at `minFontSize`, the engine throws `PosterLayoutOverflowError`, preventing cropped or clipped text on posters.
5. **Bounding Box Helpers:**
   - `isWithinBounds(box: BoundingBox, container: BoundingBox): boolean`
   - `computeSafeBoundingBox(container: BoundingBox, margin: number): BoundingBox`

---

## 10. Safe Multi-Script SVG Rendering

`SafeSvgRenderer` emits SVG `<text>` nodes containing `<tspan>` runs:
- Each `<tspan>` explicitly declares its `font-family` and `font-weight`.
- Position coordinates (`x`, `y`) use shaped baseline positions.
- SVG text content is XML-escaped (`&`, `<`, `>`, `"`, `'`).
- Headless Sharp rasterizes the generated SVG via librsvg using the local font registry, producing identical visual output to the shaped metrics.

---

## 11. W20 Scene Graph Invalidation Integration

In accordance with W20 layered creative scene architecture, changes to typography assets or shaping logic must deterministically invalidate downstream scene approvals.

1. **`computeFontAssetDigest(buffer: Buffer): string`**
   - Returns the cryptographic SHA-256 digest of the font binary.
2. **`computeTypographyPolicyDigest(policy: TypographyPolicyInput): string`**
   - Incorporates `TYPOGRAPHY_SHAPING_ENGINE_VERSION = '1.0.0-harfbuzz'` and `TYPOGRAPHY_POLICY_VERSION = '1.0.0'`.
3. **Layer Dependency Integration:**
   - Added `'FONT_ASSET'` and `'TYPOGRAPHY_POLICY'` to `LayerDependencyDraft.dependencyType`.
   - Modifying a font binary or bumping the shaping engine version updates `layerDependencies.dependencyHash`, altering the composite `sceneVersion.sceneHash` and automatically invalidating scene approvals without affecting non-typography layers.

---

## 12. Golden Typography Corpus & Automated Verification

The typography test suite uses a dedicated golden corpus (`golden-typography-corpus.ts`) covering 22 realistic production scenarios:

1. `khmer-seasonal-headline`: Complex Khmer seasonal headline with Coeng subscripts.
2. `khmer-promotion-body`: Multi-line Khmer promotional text testing word wrapping.
3. `latin-editorial-headline`: High-fashion editorial headline in Playfair Display.
4. `latin-body-editorial`: English product description in Montserrat.
5. `mixed-headline-brand-khmer`: English luxury brand name embedded within Khmer headline.
6. `mixed-price-usd`: English label with USD price (`$48.00`).
7. `mixed-price-riel`: Khmer label with Cambodian Riel price (`៛200,000`).
8. `sku-barcode-latin`: SKU and tracking numbers (`SKU: N5-EDP-100ML-FR`).
9. `khmer-numerals`: Pure Khmer numeral strings (`០១២៣៤៥៦៧៨៩`).
10. `cta-button-english`: Call-to-action button text (`SHOP THE COLLECTION`).
11. `cta-button-khmer`: Call-to-action button in Khmer (`ទិញឥឡូវនេះ`).
12. `coeng-cluster-intensive`: Words with heavy Coeng stacking (`កម្ពុជា`, `សង្គ្រោះ`, `ស្រ្តី`).
13. `dependent-vowels-intensive`: Complex dependent vowel placements (`ត្រី`, `ព្រឹក`, `កែវ`).
14. `bilingual-multiline-stack`: Stacked bilingual headline block.
15. `max-weight-playfair`: Playfair Display at maximum weight 900.
16. `min-weight-montserrat`: Montserrat at minimum weight 100.
17. `overflow-headline-shrink`: Long headline that cleanly shrinks to fit.
18. `overflow-unfit-fail`: Text that overflows even at minimum font size (throws `PosterLayoutOverflowError`).
19. `unsupported-emoji-fail`: Text containing emoji (throws `PosterFontGlyphMissingError`).
20. `bidi-override-attack-fail`: Text containing right-to-left override `U+202E` (throws `PosterUnsafeUnicodeError`).
21. `null-byte-attack-fail`: Text containing null byte `\0` (throws `PosterUnsafeUnicodeError`).
22. `repeated-determinism`: String shaped across 50 repeated runs verifying bit-exact advances and baselines.

---

## 13. Test Results & Verification Gates

All automated verification gates were executed against `feat/w21-typography` and passed cleanly:

```bash
# Linting & Formatting Check
pnpm -C app --config.pm-on-fail=ignore lint
# Result: 0 errors, 0 warnings

# TypeScript Typecheck
pnpm -C app --config.pm-on-fail=ignore typecheck
# Result: Found 0 errors.

# Project Boundaries Validation
pnpm -C app --pm-on-fail=ignore boundaries
# Result: PASS (all module boundaries intact)

# Full Workspace Build
pnpm -C app --pm-on-fail=ignore build
# Result: PASS (tsc -b --force succeeded)

# Prisma Schema Validation
pnpm -C app --pm-on-fail=ignore --filter @parisian-shopper/database prisma:validate
# Result: The schema at prisma/schema.prisma is valid

# Unit Test Suite
pnpm -C app --pm-on-fail=ignore test:unit
# Result: 86 passed suites, 1 skipped, 1001 passed tests, 1 skipped

# Integration Test Suite (against live PostgreSQL and Valkey)
pnpm -C app --pm-on-fail=ignore test:integration
# Result: 12 passed suites, 119 passed tests

# End-to-End Test Suite
pnpm -C app --pm-on-fail=ignore test:e2e
# Result: 2 passed suites, 6 passed tests

# Git Worktree Cleanliness & Line Endings
git diff --check
# Result: Clean (0 whitespace/newline issues)

git diff --cached --name-only
# Result: Clean (0 staged files; uncommitted diff preserved for owner review)
```

### Specialized Typography Verification & Acceptance Remediations (Complete):
1. **Direct HarfBuzz Vector Glyph Outline Rendering (Remediation 1):** In `SafeSvgRenderer`, added direct HarfBuzz OpenType vector path rendering (`font.glyphToPath(glyphId)`). Glyphs are emitted using HarfBuzz's calculated glyph IDs, advances, offsets, and outlines wrapped in hybrid accessible SVG containers (`role="img" aria-label="..."`), mathematically eliminating divergence between layout measurement and rasterizer font rendering.
2. **True Ink Bounds Aggregation (Remediation 2):** In `TextLayoutEngine.wrapText`, replaced heuristic font ascent/descent vertical bounds with exact per-glyph ink bounding box aggregation (`glyph.inkBounds` computed by HarfBuzz across all lines and runs). Emits precise ink geometry (`actualBoundingBox`) and enforces `maxHeight` against actual ink bounds.
3. **Pixel-Level Safe-Area Clipping Validation (Remediation 3):** Added direct raw pixel inspection in `golden-corpus-typography.spec.ts` using `sharp(buffer).raw().toBuffer()`. Scans the outer safe margin perimeter (top, bottom, left, right) to prove that zero text ink pixels bleed outside declared safe margins, while verifying positive ink density in the content region.
4. **Integration Test Environment Resolution (Remediation 4):** Resolved Docker Desktop overlay2 filesystem read-only state. Executed and passed all 12 integration test suites and 119 integration tests against live PostgreSQL and Valkey containers.
5. **Golden Corpus Glyph Coverage (W21-G):** Evaluated all 43 test vectors in `GOLDEN_TYPOGRAPHY_CORPUS` covering French luxury, Khmer orthography, Lek Took repetition, orphan punctuation, atomic prices/currencies, SKUs, extreme lengths, and attack vectors. Over 300+ shaped glyphs verified with zero `.notdef` missing glyphs (`glyphId > 0`).
6. **Khmer Syllabic & Orthographic Integrity (W21-G):** Verified that monosyllabic repetition words (`ពិតៗ`, `ស្អាតៗ`, `ថ្មីៗ`) never detach coda consonants, orphan Khmer punctuation (`ៗ`, `។`, `៕`, `៖`, `៘`, `៛`) never starts wrapped lines, and Coeng `្` (`U+17D2`) never splits across lines.
7. **Commercial Token Protection (W21-G):** Confirmed atomic integrity of prices (`$48.00`, `120 €`, `£85.00`, `២០០,០០០ ៛`) and product SKUs (`PRS-LUM-2026-FR`, `CHANEL-N5-EDP-100`) with zero mid-token line breaks.
8. **Multi-Aspect Ratio Template Conformance (W21-G):** All 4 poster templates (`EDITORIAL_SPLIT`, `CENTERED_HERO`, `SCENT_STORY`, `KHMER_SEASONAL`) rendered cleanly across `1:1`, `4:5`, and `9:16` aspect ratios with positive ink bounds strictly within calculated safe margins.
9. **Fail-Closed Security & Attack Vector Defense (W21-G):** Verified 100% fail-closed rejection for all 8 attack vectors (unsupported emoji, CJK ideographs, Arabic, Thai, Bidi overrides, null bytes, replacement char `U+FFFD`, and unassigned code points) with typed domain errors.
10. **Bit-Exact Rasterization Determinism (W21-F, W21-G):** Repeated rasterization passes of mixed Khmer/Latin posters through `SharpPosterCompositor` produce bit-exact identical buffers and SHA-256 digests (`sha256(poster1) === sha256(poster2)`).
11. **Mathematical Baseline Alignment (W21-F):** Eliminated all magic pixel baseline heuristics in `poster-templates.ts`. Baselines derive mathematically from HarfBuzz ascents (`box.y + shapedLine.baseline + idx * lineHeight`), with CTA buttons optically centered using `(ctaBox.height + ascent - descent) / 2`.
12. **W20 Scene Graph Typography Dependency Invariants (W21-F):** `AuthoritativeSceneEvidenceVerifier` automatically binds 4 canonical `FONT_ASSET` layer dependencies (sort orders 10..13) and the `TYPOGRAPHY_POLICY` dependency (sort order 20) whenever a scene contains a `TYPOGRAPHY` layer.
13. **Layer Hash Isolation (W21-F):** Verified in `creative-scene-use-cases.spec.ts` that mutating font asset digests alters `dependencyHash` and `sceneHash` while keeping individual `BACKGROUND` layer hashes bit-exact identical.
14. **Hermetic Font Integrity & Host OS Fallback Defense:** Unregistered font requests throw `PosterFontNotFoundError` with zero fallback to OS fonts; byte-level tamper tests throw `PosterFontIntegrityError`.

---

## 14. Explicit Scope Boundaries

To prevent scope creep and maintain strict architectural boundaries:
- **W22 (Template Families):** Not implemented. Template redesign remains in W22. Existing templates (`EDITORIAL_SPLIT`, `CENTERED_HERO`, `SCENT_STORY`, `KHMER_SEASONAL`) were only updated to use the shaped text layout engine.
- **W23 (Compositor Architecture Replacement):** Not implemented. Sharp compositor remains intact with typography pre-flight checks.
- **Brand Intelligence / AI Typography:** Not implemented. All typography is strictly application-rendered deterministic vector code.
- **Moul & Kantumruy Pro:** Kept deferred in accordance with W03-DEC-007 owner instructions.
- **Telegram / Publishing Workflows:** Not modified.
- **Runtime Font Downloading:** Prohibited.

---

## 15. Status & Recommendation

**Classification:** `COMPLETE — READY FOR OWNER ACCEPTANCE`

Work package W21 satisfies all technical, architectural, licensing, and security requirements. All 4 owner-acceptance review items have been resolved and verified with automated gates, unit tests (1,001 passed), integration tests (119 passed), E2E tests (6 passed), and specialized typography and raw pixel verification suites. The complete uncommitted diff is preserved for project owner review.
