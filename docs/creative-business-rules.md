# Creative & Visual Business Rules: Brand Governance (Phase 2A)

**Document:** `/docs/creative-business-rules.md`  
**Audience:** Brand Director, Head of Marketing, Product Management, Lead Architect  
**Status:** Architectural Review & Brand Baseline Specification  
**Phase:** Phase 2A (Creative / Visual Automation Foundation)  

---

## 1. Executive Context & Objectives

Phase 1 established strict factual validation for text generation, ensuring price, volume, origin, and fragrance notes cannot hallucinate. In Phase 2A, introducing visual automation brings high creative potential along with serious brand integrity risks.

A defective or unaligned image (e.g., misrepresenting a perfume bottle's shape, altering luxury brand colors, generating distorted typography, or depicting inappropriate cultural motifs) can inflict severe reputational damage on a luxury brand.

This document establishes:
1. An audit of visual-generation business rules and their confirmation status.
2. The complete catalog of **unresolved visual brand decisions** requiring executive sign-off.
3. The non-negotiable **visual safety and factual preservation rules** enforced by software.

---

## 2. Review of Business Confirmations (Visual Implications)

The 8 core business confirmations identified in `/docs/business-confirmations-required.md` have direct visual counterparts that must be governed:

| Confirmation Item | Text Behavior (Phase 1) | Visual Implication (Phase 2A) | Business Status |
|---|---|---|:---:|
| **1. Khmer Tone & Formality** | Respectful conversational register. | If Khmer typography appears on visual cards, it must use approved Unicode Khmer luxury font weights (e.g., *Kantumruy Pro*, *Siemreap*, *Moul*), never generic machine fonts. | **Pending Sign-Off** |
| **2. English Tone & Voice** | Parisian chic, refined adjectives. | Visual aesthetics must evoke understated Parisian elegance: natural soft lighting, Haussmannian architectural elements, marble, and warm neutral palettes. | **Pending Sign-Off** |
| **3. CTA Style & Destination** | "Learn more from verified catalogue". | Visual creatives should generally omit aggressive "SHOP NOW" badges unless explicitly formatted for promotional discount campaigns. | **Pending Sign-Off** |
| **4. Emoji & Decorative Set** | Subtle, minimal (✨, 🌸). | Visual decorative elements must be restrained: delicate foil borders, subtle gold accents, or natural floral botanical silhouettes. No cartoonish stickers. | **Pending Sign-Off** |
| **5. Promotional Urgency Wording** | Upstream promo price & % off only. | Price badges must match the exact verified discount in `ProductSnapshot`. Red "FLASH SALE" banners are prohibited; refined luxury ribbons (e.g. "Special Privilege -20%") are required. | **Pending Sign-Off** |
| **6. Fragrance Notes & Scent Claims** | Strictly grounded to Olfactory Pyramid. | Ambient backgrounds must visually reflect verified olfactory notes (e.g. jasmine, bergamot, cedarwood). Visualizing unverified notes (e.g. coconut on a floral scent) is prohibited. | **Pending Sign-Off** |
| **7. Country-of-Origin & Authenticity** | "Crafted in France" only when verified. | French flag graphics or Eiffel Tower cliches must be governed by brand rules to avoid cheapening the luxury aesthetic. | **Pending Sign-Off** |
| **8. Platform Length & Formatting** | Telegram ~400 char, Facebook ~600 char. | Platform-specific aspect ratios must be strictly enforced: **1:1** (Square feed), **4:5** (Portrait feed), and **9:16** (Stories / Reels vertical). | **Pending Sign-Off** |

---

## 3. Unresolved Visual Brand Requirements (Mandatory Sign-Offs)

Before Phase 2A creative features are activated in production, the following 8 strategic brand decisions must be formally approved by marketing leadership:

### Decision 1: Visual Style & Atmosphere Aesthetic
- **Issue:** What visual aesthetic defines the Parisian Shopper brand across social feeds?
- **Options Under Consideration:**
  - *Option A (Parisian Luxury Atelier — Recommended):* Parisian apartment interiors, herringbone parquet, warm natural window light, cream linen, Carrara marble surfaces.
  - *Option B (Modern Minimalist Studio):* Pure neutral monochromatic studio lighting, clean architectural pedestals, dramatic soft shadows.
  - *Option C (Botanical Luxury):* Rich organic flora reflecting fragrance ingredients, soft garden dew, golden-hour sunlight.
- **Required Confirmation:** Select Primary and Secondary acceptable style profiles for injection into `BrandRuleVersion.visualGuidance`.

### Decision 2: Product Image Integrity & Compositing Rules
- **Issue:** How should the physical product appear within the generated creative?
- **Mandatory Engineering Invariant:** The authentic product bottle/package from `ProductSnapshot` must NEVER be synthesized by AI.
- **Decisions Required:**
  - What is the minimum product footprint? (Recommended: Hero product must occupy between 35% and 60% of the visual canvas height).
  - Are floating / isometric angles allowed, or must the product rest naturally on a surface with cast shadow? (Recommended: Natural surface placement with photorealistic contact shadow).
  - Can the hero product be partially obscured by foreground props (e.g. flower petals in front of the bottle)? (Recommended: Strictly prohibited; 100% of product label and silhouette must remain unobstructed).

### Decision 3: Text-on-Image (Typography Overlay) Policy
- **Issue:** Should generated images contain textual typography overlays?
- **Options Under Consideration:**
  - *Option A (Pure Visuals — Recommended for High Luxury):* Zero text on images. The visual is a pristine lifestyle photograph; all copy, prices, and CTAs reside exclusively in the post caption text.
  - *Option B (Selective Promotional Typography):* Clean, luxury typography overlays allowed ONLY for `PROMOTION` content types, displaying brand name and promotional discount badge.
- **Guardrail:** If text overlays are permitted, they must be rendered via deterministic SVG/Sharp templates with verified fonts, NEVER generated via diffusion model in-painting.

### Decision 4: Aspect Ratio & Canvas Matrix per Platform
- **Issue:** Which aspect ratios must the creative engine support per platform?
- **Recommended Matrix:**
  - **Facebook Feed:** `1:1` (1080×1080 px) or `4:5` (1080×1350 px).
  - **Instagram Feed:** `4:5` (1080×1350 px) preferred; `1:1` supported.
  - **Instagram / Facebook Stories & Reels:** `9:16` (1080×1920 px).
  - **Telegram Channel Posts:** `1:1` (1080×1080 px) or `4:5` (1080×1350 px).
- **Required Confirmation:** Approve default aspect ratio per `ContentPlatform` and `ContentType`.

### Decision 5: Human Model Representation Policy
- **Issue:** Are human models, faces, or hands permitted in generated visuals?
- **Options Under Consideration:**
  - *Option A (Product-Only Stills — Safest & Recommended for Phase 2A):* Strictly product-centric still-life photography. Zero human figures, faces, or body parts.
  - *Option B (Hands Only):* Elegant human hands holding or spraying the product, with strict diversity and grooming guidelines.
  - *Option C (Full Lifestyle Models):* Full human models interacting with products. *(High risk: AI-generated human faces often produce uncanny-valley defects or brand misalignments).*
- **Engineering Recommendation:** Adopt **Option A (Product-Only Stills)** for Phase 2A to avoid anatomical defects and legal likeness complications.

### Decision 6: AI Content Disclosure & Watermarking
- **Issue:** How should Parisian Shopper disclose AI-assisted creative generation to comply with consumer transparency laws (EU AI Act, Meta AI labeling standards)?
- **Options Under Consideration:**
  - *Option A:* Cryptographic C2PA metadata embedding in image EXIF headers (`DigitalSourceType = trainedAlgorithmicMedia`).
  - *Option B:* Discreet brand watermark in bottom corner (`Parisian Shopper Studio`).
  - *Option C:* Caption-level disclosure in Telegram review preview (`Generated with Parisian Shopper AI Studio`).
- **Required Confirmation:** Approve combination of Option A (C2PA metadata) and Option C (workflow transparency).

### Decision 7: Brand Color Palette Hex Codes
- **Issue:** Exact primary, secondary, and background hex codes must be pinned in `BrandRuleVersion`:
  - Primary Brand Gold: `e.g. #D4AF37`
  - Luxury Noir: `e.g. #1A1A1A`
  - Cream / Alabaster: `e.g. #F8F6F0`
  - Deep Parisian Navy: `e.g. #0F172A`
- **Required Confirmation:** Brand director must provide official brand hex code palette.

### Decision 8: Seasonal & Campaign Overlays
- **Issue:** Guidelines for holiday/seasonal visual adaptations (e.g., Water Festival in Cambodia, Khmer New Year, French Bastille Day, Christmas/New Year):
- **Required Confirmation:** Rules governing when thematic seasonal motifs may be added to ambient backgrounds.

---

## 4. Factual Invariance & Creative Safety Guardrails

The following programmatic rules are hardcoded into the architecture and cannot be relaxed by prompt instructions:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   CREATIVE SAFETY & FACTUAL INVARIANCE                 │
├────────────────────────────────────────────────────────────────────────┤
│ 1. PRICE PRESERVATION:                                                 │
│    No price may appear on an image unless verified by ProductSnapshot. │
│ 2. PACKAGING FIDELITY:                                                 │
│    Product bottle/box packaging is composited from catalog photography; │
│    it is NEVER re-drawn or synthesized by AI.                          │
│ 3. LOGO INTEGRITY:                                                     │
│    Brand logos cannot be modified, rotated, recolored, or warped.      │
│ 4. SCENT ACCURACY:                                                     │
│    Visual ingredients in background must strictly match notes in       │
│    ProductSnapshot.fragranceNotes.                                     │
│ 5. NO DIRECT PUBLISHING:                                               │
│    Images advance to CREATIVE_APPROVED only after human review.        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Transition Path to BrandRuleVersion v2

When leadership confirms the unresolved decisions above:
1. Engineering will encode these rules into `BrandRuleVersion` v2 under the `visualGuidance` JSON schema:
   ```json
   {
     "visualGuidance": {
       "styleProfile": "PARISIAN_LUXURY_ATELIER",
       "lighting": "WARM_NATURAL_WINDOW",
       "composition": {
         "heroScaleMin": 0.35,
         "heroScaleMax": 0.60,
         "surfaceType": "CARRARA_MARBLE",
         "allowObstruction": false
       },
       "textOverlayPolicy": "PROMOTIONAL_ONLY",
       "humanPresence": "PROHIBITED",
       "aspectRatios": {
         "FACEBOOK": "4:5",
         "INSTAGRAM": "4:5",
         "TELEGRAM": "1:1"
       },
       "colorPalette": {
         "primaryGold": "#D4AF37",
         "luxuryNoir": "#1A1A1A",
         "cream": "#F8F6F0"
       }
     }
   }
   ```
2. The database will seed `BrandRuleVersion` v2 via an immutable migration.
3. All new creative generation jobs will automatically inherit verified brand rules with complete auditability.
