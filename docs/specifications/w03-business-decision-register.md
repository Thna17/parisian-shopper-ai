# W03 Business Decision Register

**Document:** `/docs/specifications/w03-business-decision-register.md`  
**Phase:** W03 — Foundational Specifications & Architecture  
**Status:** Canonical Decision Register for Foundational Architecture  
**Target Milestone:** W03 Review & Stage 1 Gate  
**Owner:** Product Management, Brand Director, Lead Systems Architect

---

## 1. Executive Summary & Purpose

The Parisian Shopper AI platform requires authoritative architectural and business decisions before proceeding from foundational design (W03) into production implementation (Stage 1 onwards). This consolidated Business Decision Register aggregates every unresolved business-owner, brand-governance, financial, and technical policy choice across all four foundational specifications:

1. `product-freshness-and-campaign-integrity.md` (PFC)
2. `layered-creative-scene-schema.md` (LCS)
3. `brand-intelligence-and-data-governance.md` (BID)
4. `provider-budget-and-usage-ledger.md` (PBU)

In strict accordance with the Master Engineering Blueprint v3.0, **no business choice is marked `APPROVED` without documented evidence from accepted project records**. Unresolved choices are provided with safe temporary defaults for development and testing, clear consequences and tradeoffs, an assigned owner, and an explicit blocking status. Decisions `W03-DEC-001`, `W03-DEC-004`, `W03-DEC-007`, and `W03-DEC-018` have documented approval evidence.

---

## 2. Decision Registry Matrix

| Decision ID     | Subject                                    | Affected Specs | Future Packages | Status       | Blocking? | Safe Temporary Default                                                                      |
| --------------- | ------------------------------------------ | -------------- | --------------- | ------------ | :-------: | ------------------------------------------------------------------------------------------- |
| **W03-DEC-001** | Authoritative Product API Identity & Auth  | PFC            | W10, W11        | **APPROVED** |    NO     | Mekhla Product API (`api.mekhla.digital`), Auralis Trading, USD, ShortCode priority         |
| **W03-DEC-002** | Fact Freshness TTLs & Max Staleness        | PFC            | W10, W11, W61   | **PROPOSED** |  **YES**  | Configurable FreshnessPolicy: Stock 5m, Price 15m, Attributes 24h                           |
| **W03-DEC-003** | Campaign Validity & Promotion Stacking     | PFC            | W11, W50        | **PROPOSED** |    NO     | Strict upstream precedence; single promo price; no AI discount calculations                 |
| **W03-DEC-004** | Approved Product Image Sources & Roles     | PFC, LCS       | W10, W20        | **APPROVED** |    NO     | Governed pre-clipped transparent PNG/WebP from approved sources and CAS only                |
| **W03-DEC-005** | Supported Initial Output Formats           | LCS            | W20, W21, W30   | **PROPOSED** |    NO     | Square 1:1 (1080×1080), Portrait 4:5 (1080×1350), Story 9:16 (1080×1920)                    |
| **W03-DEC-006** | Initial Five Template Families             | LCS            | W20, W21, W22   | **APPROVED** |    NO     | Option A: 5 Canonical Families (Centered Hero, Editorial Split, Khmer Seasonal, Scent Story, Promotion/CTA) with Haussmann Style Preset |
| **W03-DEC-007** | Approved Latin & Khmer Typography          | LCS, BID       | W21, W30        | **APPROVED** |    NO     | Playfair Display, Montserrat, Noto Sans Khmer (Option A conditional approval)               |
| **W03-DEC-008** | Brand Archive Licensing & Ingestion Rights | BID            | W40, W41        | **PROPOSED** |  **YES**  | Whitelist verified owned Facebook posts (2024–2026)                                         |
| **W03-DEC-009** | Visual & Copy Similarity Thresholds        | BID, LCS       | W40, W41        | **PROPOSED** |    NO     | Configurable EvaluationPolicy benchmark candidates: 0.70 text, 0.85 visual                  |
| **W03-DEC-010** | External Social Engagement Metrics         | BID            | W41, W42        | **OPEN**     |    NO     | External engagement metrics completely excluded                                             |
| **W03-DEC-011** | Provider Allocation by Environment         | PBU            | W10, W20, W50   | **PROPOSED** |  **YES**  | Capability routing; Dev: local CLI/mock; Staging/Prod: capability registry                  |
| **W03-DEC-012** | Max Image Generation Cost Ceiling          | PBU, LCS       | W20, W50        | **PROPOSED** |    NO     | Configurable ceiling under ProviderPricingVersion; prioritize \$0 templates                 |
| **W03-DEC-013** | Video Generation Feasibility & Budget      | PBU            | W50+            | **PROPOSED** |    NO     | Video generation disabled pending Phase 5                                                   |
| **W03-DEC-014** | Hard Budget Ceilings & Reservation TTL     | PBU            | W50             | **PROPOSED** |  **YES**  | Configurable BudgetPolicy: Monthly cap, daily cap, reservation TTL                          |
| **W03-DEC-015** | Provider Fallback & Degradation Rules      | PBU            | W50             | **PROPOSED** |    NO     | Fail-closed fallback; static luxury studio backdrops (\$0.00 cost)                          |
| **W03-DEC-016** | Data Retention Periods & Purge Policy      | PFC, BID, PBU  | W11, W40, W50   | **PROPOSED** |    NO*    | Safe default: no automatic destructive purge; manual cleanup only (BLOCKS purge activation) |
| **W03-DEC-017** | Production Publishing Destinations         | PFC, LCS       | W60, W61        | **PROPOSED** |    NO     | Publishing permanently fail-closed pending W61; manual download only                        |
| **W03-DEC-018** | Separation of Approval & Publish Roles     | PFC, LCS, BID  | W02, W61        | **APPROVED** |    NO     | Exact RBAC matrix from `permissions.ts` (Admin, Approver, Editor, Viewer)                   |

---

## 3. Detailed Decision Records

### W03-DEC-001: Authoritative Product API Identity, Network Endpoints, and Credentials

- **Subject:** Identity, interface protocol, hosting location, and authentication mechanism for the authoritative Parisian Shopper Product API.
- **Affected Specifications:** `product-freshness-and-campaign-integrity.md`
- **Future Work Packages:** W10 (Product API Adapter), W11 (Freshness Snapshots).
- **Context:** Previously, the system used fictional hardcoded product fixtures (`MockProductSource`, `geparlys-products.ts`, `fictional-products.ts`). The production system integrates with Parisian Shopper's verified upstream Product API.
- **Confirmed Owner Decision:**
  - **Upstream Provider:** Mekhla Product API (`https://api.mekhla.digital`)
  - **Active Business:** Auralis Trading (`X-Active-Business-Id: cmpwgnlpv0001li15e3n16uhc`)
  - **Product Currency:** USD (`$`)
  - **Identifier Resolution Policy:**
    1. Preferred visible product code: `shortCode` (e.g., `G32`).
    2. Fallback visible product code: active variant barcode (e.g., `3700134410542`).
    3. Source record identifier: upstream product `id` stored separately as `source_record_id`.
- **Consequences & Tradeoffs:** Clean HTTPS REST API decoupling with tenant-header enforcement (`X-Active-Business-Id`). Strict host allowlisting (`api.mekhla.digital`), HTTPS enforcement, no embedded credentials or unexpected ports, fail-closed in production if credentials or endpoints are unconfigured (TLS 1.3 is an infrastructure/runtime deployment requirement, not enforced directly by the adapter).
- **Safe Development Default:** In `development` and `test` environments, fixtures (`MockProductSource`) are available by configuration (`FEATURE_PRODUCT_API=false`). In `production`, fixture fallback is forbidden.
- **Blocks Implementation:** **NO (Approved for W10).**
- **Owner:** Project Owner / Lead Systems Architect.
- **Due Milestone:** Stage 1 Kickoff (W10).
- **Status:** **APPROVED**
- **Evidence / Approval Reference:** Project Owner Contract Confirmation (2026-10-18); live endpoint verification (`https://api.mekhla.digital/api/v1/products`); W10 implementation evidence.

---

### W03-DEC-002: Product Fact Freshness TTLs and Maximum Tolerable Staleness

- **Subject:** Time-to-live (TTL) and maximum staleness duration for individual product fact tiers before mandatory revalidation.
- **Affected Specifications:** `product-freshness-and-campaign-integrity.md`
- **Future Work Packages:** W10, W11, W61.
- **Context:** Different product facts have vastly different volatility. Product pricing and flash discounts change rapidly; stock levels change continuously; perfume concentrations, olfactory notes, and bottle dimensions rarely change. Treating all facts with a single expiry timestamp either causes excessive API load or allows stale prices to be published.
- **Available Options:**
  - _Option A (Tiered TTLs under versioned FreshnessPolicy):_ Volatile (Stock: 5m, Price: 15m), Promotional (Discount: 1h), Static (Attributes/Images: 24h), Hard cap: 48h.
  - _Option B (Uniform Conservative TTL):_ All facts expire after 15 minutes.
  - _Option C (Revalidate Only at Approval/Publish):_ Infinite cache during draft editing; strict recheck only at approval and export.
- **Recommended Option:** _Option A (Tiered TTLs with Mandatory Gate Revalidation under FreshnessPolicy)_.
- **Consequences & Tradeoffs:** Tiered caching minimizes upstream load while guaranteeing that financial facts (price, stock) are strictly re-verified within minutes of display and rechecked synchronously before export and delivery.
- **Safe Temporary Default:** In development, use proposed benchmark candidates in `FreshnessPolicy`: Price 15m, Stock 5m, Campaign 1h, Attributes 24h, Hard Cap 48h.
- **Blocks Implementation:** **YES (Blocks W11).**
- **Owner:** Commercial Director & Head of Merchandising.
- **Due Milestone:** W11.
- **Status:** **PROPOSED**
- **Evidence / Approval Reference:** Blueprint v3.0 §8.2; `product-api-contract-draft.md`.

---

### W03-DEC-003: Campaign Validity Windows and Promotion Stacking Rules

- **Subject:** Determination of active campaign validity windows and handling of overlapping or stacked promotional discounts.
- **Affected Specifications:** `product-freshness-and-campaign-integrity.md`, `layered-creative-scene-schema.md`
- **Future Work Packages:** W11, W50.
- **Context:** Marketing campaigns frequently feature promotional pricing that may overlap with SKU-level clearance discounts. The creative engine must know whether discounts stack, which promotion takes precedence, and how banner copy is formulated.
- **Available Options:**
  - _Option A (Strict Upstream Precedence):_ Upstream Product API calculates and provides the single authoritative `promoPrice` and `discount` object. AI engine never calculates stacked discounts.
  - _Option B (Campaign Override):_ Active Campaign parameters override catalog promo price if campaign is verified active by marketing approver.
  - _Option C (Deterministic Stacking):_ Engine computes cumulative discounts based on explicit boolean flag `allowStacking`.
- **Recommended Option:** _Option A (Strict Upstream Precedence)_.
- **Consequences & Tradeoffs:** Eliminates any financial calculation discrepancy between the generated poster and the retail checkout system. Prohibits AI from inventing promotional math.
- **Safe Temporary Default:** Engine renders only the single `promoPrice` directly supplied in `ProductSnapshot`. AI discount calculations and stacking are disabled.
- **Blocks Implementation:** NO.
- **Owner:** Head of Marketing.
- **Due Milestone:** W11.
- **Status:** **PROPOSED**
- **Evidence / Approval Reference:** `product-api-contract-draft.md` §Controlled Subtypes.

---

### W03-DEC-004: Approved Product Image Sources, Formats, and Cutout Policies

- **Subject:** Authorized repository, resolution standards, and background-removal policies for authentic product assets.
- **Affected Specifications:** `product-freshness-and-campaign-integrity.md`, `layered-creative-scene-schema.md`
- **Future Work Packages:** W10, W20.
- **Context:** Physical product authenticity is the core brand requirement. AI must never hallucinate product bottles or packaging. Product images must come from an approved photography repository, contain transparent alphas, or undergo validated background removal.
- **Available Options:**
  - _Option A (Pre-cut Studio PNGs Only):_ Only pre-processed static PNG or WebP assets with a decoded alpha channel hosted on Parisian Shopper CAS are accepted.
  - _Option B (Automated Removal via Local BiRefNet/RMBG):_ Ingest studio JPGs and run deterministic background cutout locally before compositing.
  - _Option C (External Removal API):_ Call external cutout APIs (e.g. Photoroom/remove.bg).
- **Recommended Option:** _Option A (Pre-cut Studio PNG/WebP in CAS) with potential future evaluation of Option B as an internal intake aid_.
- **Consequences & Tradeoffs:** Option A provides the lowest authenticity risk for perfume glass transparency, reflections, and cap details. Option B allows greater catalog ingestion speed but requires visual QA gates and GPU infrastructure. Option C incurs recurring SaaS costs and data leakage.
- **Safe Temporary Default:** Require pre-clipped alpha PNG/WebP with verified SHA-256 CAS fingerprints. Reject opaque rectangular JPEGs from being placed as hero bottles.
- **Blocks Implementation:** **NO (Approved; W20 governance gate satisfied).**
- **Owner:** Lead Photographer & Creative Director.
- **Due Milestone:** W20.
- **Status:** **APPROVED** (Option A approved; minimum-dimension requirement deferred)
- **Evidence / Approval Reference:** Project Owner Brathna approval (2026-10-22); Blueprint v3.0 §9.1; `creative-business-rules.md` §3 Decision 2; Owner Decision Brief: [`/docs/implementation-evidence/W03-DEC-004-product-image-and-cutout-decision-brief.md`](/docs/implementation-evidence/W03-DEC-004-product-image-and-cutout-decision-brief.md).

---

### W03-DEC-005: Supported Initial Social Media Output Formats and Resolutions

- **Subject:** Initial canvas dimensions, aspect ratios, and pixel densities for multi-channel export.
- **Affected Specifications:** `layered-creative-scene-schema.md`
- **Future Work Packages:** W20, W21, W30.
- **Context:** Social channels require distinct aspect ratios: Square (1:1), Portrait feed (4:5), and Story/Reel (9:16). The compositor must render high-resolution raster outputs without distortion or stretched typography.
- **Available Options:**
  - _Option A (Dual Core Feed Formats):_ 1:1 (1080×1080) and 4:5 (1080×1350) for Phase 1/2; 9:16 (1080×1920) in Phase 5.
  - _Option B (Full Triple Matrix):_ 1:1, 4:5, and 9:16 supported simultaneously from launch at standard 1080px base.
  - _Option C (High-DPI 2x Matrix):_ 2160×2160, 2160×2700, and 2160×3840 for ultra-high-definition displays.
- **Recommended Option:** _Option B (Full Triple Matrix at standard 1080px base)_:
  - Square Feed: 1080×1080 (1:1)
  - Portrait Feed: 1080×1350 (4:5)
  - Vertical Story: 1080×1920 (9:16)
- **Consequences & Tradeoffs:** Triple matrix meets all Facebook, Instagram, and Telegram requirements. Standard 1080px base maintains headless Sharp rendering efficiency on commodity CPU hardware.
- **Safe Temporary Default:** 1:1 (1080×1080) as default canvas, with 4:5 (1080×1350) and 9:16 (1080×1920) available in `PosterOutputFormat`.
- **Blocks Implementation:** NO.
- **Owner:** Social Media Lead & Digital Marketing Specialist.
- **Due Milestone:** W20.
- **Status:** **PROPOSED**
- **Evidence / Approval Reference:** Blueprint v3.0 §8.1, §9; `creative-business-rules.md` §3 Decision 4.

---

### W03-DEC-006: Initial Five Template Families and Layout Geometry

- **Subject:** Formal selection and geometry specifications for the five canonical poster template families.
- **Affected Specifications:** `layered-creative-scene-schema.md`
- **Future Work Packages:** W20, W21, W22.
- **Context:** To ensure brand consistency and avoid unstructured AI layouts, Parisian Shopper posters rely on deterministic templates. Blueprint v3.0 §11.1 and Roadmap W22 mandate five initial families.
- **Available Options:**
  - _Option A (Roadmap W22 Five Canonical Families):_
    1. `CENTERED_HERO`: Centered luxury product hero on symmetrical pedestal.
    2. `EDITORIAL_SPLIT`: Editorial split layout with hero product and typography panel.
    3. `KHMER_SEASONAL`: Khmer seasonal or cultural campaign with bilingual hierarchy.
    4. `SCENT_STORY`: Scent pyramid or educational composition for olfactory notes.
    5. `PROMOTION_PRICE_CTA`: Promotion, price and CTA composition.  
       _(Haussmann Luxe styling modeled as an optional style preset / visual treatment)_.
  - _Option B (Replace Promotion Family with Haussmann Luxe):_ Substitute Haussmann Luxe as the fifth family.
- **Recommended Option:** _Option A (Roadmap W22 Five Canonical Families with Haussmann as Style Preset)_.
- **Consequences & Tradeoffs:** Aligns strictly with roadmap W22 requirements while allowing Parisian Haussmann architectural styling to be applied across templates as a visual treatment preset.
- **Safe Temporary Default:** The five roadmap families (`CENTERED_HERO`, `EDITORIAL_SPLIT`, `KHMER_SEASONAL`, `SCENT_STORY`, `PROMOTION_PRICE_CTA`) with Haussmann gold/border preset available as an optional styling treatment.
- **Blocks Implementation:** NO.
- **Owner:** Creative Director & Brand Director.
- **Due Milestone:** W22.
- **Status:** **APPROVED** (Option A architectural selection formally approved by Project Owner on 2026-10-25; all five canonical template families v1.0.0 and immutable digests formally reviewed and approved by Project Owner Brathna on 2026-10-26 for production use)
- **Evidence / Approval Reference:** Project Owner Formal Sign-Off (2026-10-26T17:53:59+07:00 / 2026-10-26T10:53:59.000Z); Implementation Plan v1.0 §W22; Blueprint v3.0 §11.1; W22 Evidence Dossier: [`W22-five-approved-template-families.md`](../implementation-evidence/W22-five-approved-template-families.md); Golden Review Manifest: `app/.data/w22-golden-review/manifest.json`.

---

### W03-DEC-007: Approved Latin and Khmer Typography, Licensing, and Local Font Storage

- **Subject:** Official font families, weights, font file formats, and commercial open-source licenses for server-side rendering.
- **Affected Specifications:** `layered-creative-scene-schema.md`, `brand-intelligence-and-data-governance.md`
- **Future Work Packages:** W21, W30.
- **Context:** Khmer typography requires complex text shaping and Unicode compliance. Mixing fonts or using unapproved weights destroys the luxury aesthetic. Server-side SVG-to-PNG compositing requires local TTF/OTF files with verified SIL Open Font License (OFL) or commercial licenses.
- **Available Options:**
  - _Option A (Approved Google Fonts / OFL):_
    - Latin Display / Serif: _Playfair Display_ (Variable / Bold 700, Regular 400).
    - Latin Body / Sans: _Montserrat_ (SemiBold 600, Medium 500, Regular 400).
    - Khmer Primary / Modern Luxury: _Kantumruy Pro_ or _Noto Sans Khmer_ (Bold 700, Medium 500, Regular 400).
    - Khmer Heritage / Heading: _Moul_ (for traditional seasonal titles).
  - _Option B (Commercial Proprietary Typefaces):_ Custom proprietary corporate font purchased for Parisian Shopper.
- **Recommended Option:** _Option A (OFL High-Quality Curated Fonts stored in repository asset tree)_.
- **Consequences & Tradeoffs:** 100% legal compliance with zero per-seat or web-server license fees. Fully verified glyph coverage for Khmer Unicode and Latin diacritics.
- **Safe Temporary Default:** Use local font assets committed in `app/assets/fonts/`:
  - `PlayfairDisplay-Variable.ttf` (OFL)
  - `Montserrat-Variable.ttf` (OFL)
  - `NotoSansKhmer-Bold.ttf`, `NotoSansKhmer-Regular.ttf` (OFL)
- **Blocks Implementation:** **NO (Approved as conditional pilot direction; W21 governance gate cleared).**
- **Owner:** Brand Director & Legal Counsel.
- **Due Milestone:** W21.
- **Status:** **APPROVED** (Option A approved as conditional pilot typography direction; Moul and Kantumruy Pro deferred; Noto Sans Khmer binary OFL replacement and W21 safeguards required)
- **Evidence / Approval Reference:** Project Owner Brathna approval (2026-10-22); Blueprint v3.0 §26.2, §29; `creative-business-rules.md` §2; Decision Brief: [`W03-DEC-007-typography-and-font-licensing-decision-brief.md`](../implementation-evidence/W03-DEC-007-typography-and-font-licensing-decision-brief.md).

---

### W03-DEC-008: Brand Archive Licensing, Historical Ingestion Rights, and Retention

- **Subject:** Legal rights, consent verification, and retention policy for historical social posts used in Brand Intelligence training.
- **Affected Specifications:** `brand-intelligence-and-data-governance.md`
- **Future Work Packages:** W40, W41.
- **Context:** Ingesting past marketing posts for retrieval and style analysis requires verified intellectual property rights. Ingesting unlicensed imagery or third-party influencer content could introduce copyright liabilities.
- **Available Options:**
  - _Option A (Full Ingestion):_ Ingest all historical Facebook posts from page creation to present.
  - _Option B (Whitelisted Owned Archive):_ Ingest only posts from 2024–2026 that have been verified by marketing as 100% company-owned photography, text, and graphics.
  - _Option C (Text-Only Ingestion):_ Ingest historical captions and copy, but completely exclude historical imagery.
- **Recommended Option:** _Option B (Whitelisted Owned Archive)_.
- **Consequences & Tradeoffs:** Protects against copyright infringement. Ensures the AI learns only from the brand's contemporary luxury voice rather than legacy uncurated campaigns.
- **Safe Temporary Default:** No automated scraping. Ingestion occurs only via explicit, audited administrative import scripts with verified copyright declarations.
- **Blocks Implementation:** **YES (Blocks W40).**
- **Owner:** General Counsel & Marketing Operations Lead.
- **Due Milestone:** W40.
- **Status:** **PROPOSED**
- **Evidence / Approval Reference:** Blueprint v3.0 §11.1, §16, §29.

---

### W03-DEC-009: Visual and Copy Similarity Thresholds and Plagiarism Prevention

- **Subject:** Numerical cosine and string similarity thresholds used to detect and prevent regurgitation of historical assets or unauthorized competitor copying.
- **Affected Specifications:** `brand-intelligence-and-data-governance.md`, `layered-creative-scene-schema.md`
- **Future Work Packages:** W40, W41.
- **Context:** Blueprint v3.0 §11.2 mandates that the system must learn brand style without copying past posters or duplicating captions. Generative output must be fresh and original while conforming to brand rules.
- **Available Options:**
  - _Option A (Configurable EvaluationPolicy):_ Thresholds reside in versioned `EvaluationPolicy` records. Benchmark candidates: text normalized Levenshtein similarity max = 0.70; max 4-gram overlap = 40%; visual embedding cosine similarity max = 0.85.
  - _Option B (Static Global Hardcoded Constants):_ Hardcode 0.70 and 0.85 into application logic.
- **Recommended Option:** _Option A (Configurable EvaluationPolicy with Benchmark Candidates)_.
- **Consequences & Tradeoffs:** Enables calibration of novelty thresholds per campaign without requiring code redeployments.
- **Safe Temporary Default:** Use proposed benchmark candidates (0.70 text, 0.85 visual) as safe defaults in development evaluation policies.
- **Blocks Implementation:** NO.
- **Owner:** Brand Director & AI Ethics Reviewer.
- **Due Milestone:** W41.
- **Status:** **PROPOSED**
- **Evidence / Approval Reference:** Blueprint v3.0 §9.2, §11.2, §19.

---

### W03-DEC-010: Permissibility and Governance of Social Engagement Metrics

- **Subject:** Whether external post performance data (Facebook likes, shares, comments, sales attribution) may be ingested into Brand Intelligence preference ranking.
- **Affected Specifications:** `brand-intelligence-and-data-governance.md`
- **Future Work Packages:** W41, W42.
- **Context:** Luxury brands prioritize brand prestige and aesthetic elegance over viral clickbait metrics. Ingesting unvetted engagement data risks degrading luxury brand tone.
- **Available Options:**
  - _Option A (Exclude Social Metrics):_ Base preference ranking strictly on internal human reviewer approval rates, revision distance, and structured editorial ratings.
  - _Option B (Weighted Engagement Ingestion):_ Blend internal editorial score with normalized social conversion/engagement metrics.
- **Recommended Option:** _Option A (Exclude Social Metrics for Stages A–C; re-evaluate in Stage D)_.
- **Consequences & Tradeoffs:** Prevents clickbait degradation of the luxury brand aesthetic. Eliminates the complexity of tracking external social API changes and privacy concerns.
- **Safe Temporary Default:** Social engagement data is completely excluded from the learning pipeline.
- **Blocks Implementation:** NO.
- **Owner:** Managing Director & Head of Marketing.
- **Due Milestone:** W41.
- **Status:** **OPEN**
- **Evidence / Approval Reference:** Blueprint v3.0 §11.3, §29.

---

### W03-DEC-011: Provider Allocation and Routing Policy by Environment

- **Subject:** Authorized AI provider models, local CLI tools, and cloud provider selection across development, staging, and production.
- **Affected Specifications:** `provider-budget-and-usage-ledger.md`
- **Future Work Packages:** W10, W20, W50.
- **Context:** To ensure financial control, reproducible tests, and vendor independence, the platform must not be locked into a single provider (such as OpenAI). Local developers should utilize CLI tools or mocks without billing corporate API keys.
- **Available Options:**
  - _Option A (Capability-Based Neutral Routing):_
    - `development`: Local CLI tools (`CodexCliCreativeProvider`), mock providers, or zero-cost local fixtures.
    - `staging`: Capability-registered sandboxes (e.g. Google Gemini, local models, or approved API endpoints).
    - `production`: Primary capability registry with automated budget reservations, supporting multi-vendor dispatch (Gemini, local, future engines).
  - _Option B (Single Vendor Locked):_ Restrict all routing to a single cloud API vendor.
- **Recommended Option:** _Option A (Capability-Based Neutral Routing)_.
- **Consequences & Tradeoffs:** Zero cost during local test suites and CI runs. Clean abstraction layer prevents vendor lock-in and respects owner preference not to base the project on OpenAI GPT.
- **Safe Temporary Default:** Router selects capability providers based on environment configuration. Fails closed if production lacks verified capability keys.
- **Blocks Implementation:** **YES (Blocks W50).**
- **Owner:** Lead Systems Architect & DevOps Lead.
- **Due Milestone:** W50.
- **Status:** **PROPOSED**
- **Evidence / Approval Reference:** Blueprint v3.0 §15; `creative-providers/src/factory.ts`.

---

### W03-DEC-012: Acceptable Cost Ceilings per Generated Visual Creative

- **Subject:** Maximum allowable expenditure for AI background synthesis and creative asset generation per approved poster.
- **Affected Specifications:** `provider-budget-and-usage-ledger.md`, `layered-creative-scene-schema.md`
- **Future Work Packages:** W20, W50.
- **Context:** Automated background generation costs money per API call. If users regenerate backgrounds excessively, costs escalate rapidly.
- **Available Options:**
  - _Option A (Template-First Free Tier with Per-Asset Ceiling):_ Prioritize deterministic SVG/CSS templates with pre-rendered approved backdrops (\$0.00 cost); enforce a configurable ceiling per generation attempt under `ProviderPricingVersion`.
  - _Option B (Unlimited Generation):_ Allow unmetered background generations.
- **Recommended Option:** _Option A (Template-First Free Tier with Configurable Cost Ceilings)_.
- **Consequences & Tradeoffs:** Reduces average production cost to near zero for standard template updates. Enforces hard financial stop before runaway costs occur.
- **Safe Temporary Default:** Pricing governed by versioned `ProviderPricingVersion` records; maximum 3 regenerations per creative job in development.
- **Blocks Implementation:** NO.
- **Owner:** Chief Financial Officer & Marketing Operations.
- **Due Milestone:** W50.
- **Status:** **PROPOSED**
- **Evidence / Approval Reference:** Blueprint v3.0 §15, §29; `ai-cost-controls.md`.

---

### W03-DEC-013: Video Generation Feasibility, Operational Timing, and Budget Limits

- **Subject:** Feasibility, provider selection (e.g. Higgsfield, Runway, Luma), and operational activation timing for promotional video generation.
- **Affected Specifications:** `provider-budget-and-usage-ledger.md`
- **Future Work Packages:** Deferred to Phase 5 (W50+).
- **Context:** The repository contains experimental prototypes for video generation (`HiggsfieldVideoProvider`). However, video generation is significantly more expensive, has high latency, and carries higher hallucination risks.
- **Available Options:**
  - _Option A (Immediate Activation):_ Enable video generation in Phase 2.
  - _Option B (Deferred Milestone):_ Keep video ports and ledger schemas ready, but defer production activation to Phase 5 after static poster workflows are green and proven.
- **Recommended Option:** _Option B (Deferred to Phase 5)_.
- **Consequences & Tradeoffs:** Focuses engineering resources on high-volume static social posters. Prevents budget blowout during early pilot phases.
- **Safe Temporary Default:** Video generation flag `ENABLE_VIDEO_GENERATION=false`. All video requests fail closed with a descriptive configuration error.
- **Blocks Implementation:** NO.
- **Owner:** Product Management.
- **Due Milestone:** Phase 5 Planning.
- **Status:** **PROPOSED**
- **Evidence / Approval Reference:** Blueprint v3.0 §5.2, §21, §28.

---

### W03-DEC-014: Hard Budget Ceilings, Alert Thresholds, and Reservation Timeouts

- **Subject:** Daily, monthly, and project-level monetary budget ceilings, warning alert thresholds, and reservation timeout durations.
- **Affected Specifications:** `provider-budget-and-usage-ledger.md`
- **Future Work Packages:** W50.
- **Context:** To ensure financial safety, the system must reserve estimated funds in a durable ledger before calling external AI providers. If a reservation is abandoned or times out, the funds must be automatically restored.
- **Available Options:**
  - _Option A (Multi-tiered Thresholds under BudgetPolicy):_ Configurable monthly cap, daily cap, warning alert threshold (e.g. 80%), and reservation TTL (e.g. 300s).
  - _Option B (Permissive Warning Only):_ Alert on threshold breach, but do not block operations.
- **Recommended Option:** _Option A (Multi-tiered Hard Ceilings with Fail-Closed Blocking under BudgetPolicy)_.
- **Consequences & Tradeoffs:** Guarantees expenditure can never exceed approved limits even in the event of an automated loop or denial-of-wallet attack.
- **Safe Temporary Default:** Proposed development defaults in `BudgetPolicy`: Monthly Cap \$250.00 USD; Daily Cap \$10.00 USD; Soft Warning 80%; Reservation TTL 300 seconds.
- **Blocks Implementation:** **YES (Blocks W50).**
- **Owner:** Financial Controller & Head of Operations.
- **Due Milestone:** W50.
- **Status:** **PROPOSED**
- **Evidence / Approval Reference:** Blueprint v3.0 §15; `ai-cost-controls.md`.

---

### W03-DEC-015: Provider Fallback, Circuit Breaking, and Quality Degradation Rules

- **Subject:** Operational rules governing automated failover when a primary AI provider experiences an outage or elevated error rate.
- **Affected Specifications:** `provider-budget-and-usage-ledger.md`
- **Future Work Packages:** W50.
- **Context:** If a primary image provider fails, the system could fall back to an alternate provider. However, different providers produce drastically different aesthetic styles, which may violate brand consistency.
- **Available Options:**
  - _Option A (Fail-Closed on Quality Boundaries):_ Circuit breaker trips after consecutive failures. System fails closed and alerts the user rather than silently switching to an unvetted alternate provider.
  - _Option B (Transparent Fallback to Pre-Approved Backdrops):_ If AI generation fails, fallback to verified static luxury backdrop assets stored in CAS (\$0.00 cost).
  - _Option C (Silent Multi-Provider Failover):_ Automatically route to secondary paid API.
- **Recommended Option:** _Option B, with Option A if static assets cannot fulfill the brief_.
- **Consequences & Tradeoffs:** Protects brand integrity. Prevents jarring aesthetic shifts from unvetted models while maintaining high user uptime via pre-approved studio templates.
- **Safe Temporary Default:** No silent model failover. Return clear error: `Creative provider unavailable; please select a static studio preset.`
- **Blocks Implementation:** NO.
- **Owner:** Lead Systems Architect & Brand Director.
- **Due Milestone:** W50.
- **Status:** **PROPOSED**
- **Evidence / Approval Reference:** Blueprint v3.0 §15, §17.

---

### W03-DEC-016: Multi-Tiered Data Retention, Asset Expiration, and Purge Policies

- **Subject:** Retention schedules and purge mechanisms for intermediate drafts, rejected assets, visual masks, access logs, and audit records.
- **Affected Specifications:** `product-freshness-and-campaign-integrity.md`, `brand-intelligence-and-data-governance.md`, `provider-budget-and-usage-ledger.md`
- **Future Work Packages:** W11, W40, W50.
- **Context:** Storing large uncompressed PNGs and high-resolution backgrounds indefinitely incurs massive disk storage costs. Data protection regulations also require purging personal access tokens and transient interaction logs.
- **Available Options:**
  - _Option A (Configurable Tiered Retention Policy):_
    - Transient review tokens / intermediate masks: 7 days.
    - Rejected / unapproved draft assets: 30 days.
    - Approved final creative assets & CAS renders: 2 years.
    - Financial ledger & security audit events: 7 years.
  - _Option B (Indefinite Storage):_ Keep all generated drafts indefinitely.
- **Recommended Option:** _Option A (Configurable Tiered Retention Policy with Automated Pruning Jobs)_.
- **Consequences & Tradeoffs:** Drastically reduces storage overhead. Ensures compliance with corporate audit requirements while preventing orphaned disk waste.
- **Safe Temporary Default:**
  - No automatic destructive purge;
  - Storage usage monitoring and operational alerts;
  - Authorized manual cleanup only;
  - Referenced, approved, audit, ledger, and legal-hold records strictly protected from deletion;
  - Development-only disposable fixtures may be cleaned only when explicitly marked disposable.
- **Governance & Purge Safety Invariants:**
  - No automated purge job may be enabled until retention periods are formally approved by the business owner, legal/compliance, and operations.
  - Retention policies must be versioned.
  - Every purge execution must produce an immutable audit record.
  - CAS assets may be deleted only after a reference-count or reachability check proves they are not referenced by any historical snapshot, scene, asset, or audit record.
  - Legal hold overrides retention expiry.
  - Backup retention must be coordinated with primary-data deletion.
  - Deletion must be recoverable when policy requires a grace period.
- **Blocks Implementation:** **NO for schema design; BLOCKS automatic destructive purge activation until APPROVED.**
- **Owner:** Compliance Officer & Infrastructure Engineer.
- **Due Milestone:** W50.
- **Status:** **PROPOSED**
- **Evidence / Approval Reference:** Blueprint v3.0 §7, §16; `data-retention.md`.

---

### W03-DEC-017: Production Publishing Destinations and Channel Governance

- **Subject:** Allowlisted social publishing endpoints, webhook destinations, and delivery protocols.
- **Affected Specifications:** `product-freshness-and-campaign-integrity.md`, `layered-creative-scene-schema.md`
- **Future Work Packages:** W60, W61.
- **Context:** W02 established that automated publishing is permanently fail-closed. Future publishing (W61) requires explicit immutable `PublishIntent` entities. The destination channels (Facebook Page, Telegram Channel, Instagram Graph API) must be formally approved.
- **Available Options:**
  - _Option A (Download / Manual Export Only):_ The platform renders and exports finalized graphics; marketing staff manually upload to social networks.
  - _Option B (Automated Publishing via Authorized Intent):_ Authorized Admins submit a signed `PublishIntent` to dispatch via verified official APIs.
- **Recommended Option:** _Option A for Stage 1–3; Option B only upon successful completion and acceptance of W61_.
- **Consequences & Tradeoffs:** Maximum safety. Completely eliminates accidental publication of draft or unverified marketing material.
- **Safe Temporary Default:** Publishing disabled. `TelegramChannelBroadcastAdapter` throws `PublishDisabledError`. Export produces downloadable assets.
- **Blocks Implementation:** NO.
- **Owner:** Commercial Director & Brand Lead.
- **Due Milestone:** W60.
- **Status:** **PROPOSED**
- **Evidence / Approval Reference:** Blueprint v3.0 §14; W02 Evidence Report.

---

### W03-DEC-018: Separation of Duties, Approval Roles, and Publication Authorization Matrix

- **Subject:** Formal role-based access control (RBAC) boundaries separating content generation, visual revision, approval, and publishing.
- **Affected Specifications:** `product-freshness-and-campaign-integrity.md`, `layered-creative-scene-schema.md`, `brand-intelligence-and-data-governance.md`
- **Future Work Packages:** W02 (Accepted), W61.
- **Context:** Strict segregation of duties prevents a single user from generating, approving, and publishing content without review. The authorization matrix was formally implemented, tested, and accepted in work package W02.
- **Available Options:**
  - _Option A (Accepted W02 RBAC Matrix):_ Strict role separation using exact `Permission` constants defined in `permissions.ts`.
  - _Option B (Permissive Single-Role Admin):_ Combine authoring and approval permissions into a single marketing role.
- **Recommended Option:** _Option A (Accepted W02 RBAC Matrix)_.
- **Exact Implemented Permission Matrix (`app/packages/application/src/modules/auth/domain/permissions.ts`):**

  ```typescript
  // Exact RoleCode constants:
  RoleCode.VIEWER;
  RoleCode.MARKETING_EDITOR;
  RoleCode.MARKETING_APPROVER;
  RoleCode.ADMIN;

  // Exact Role Permissions:
  VIEWER: [Permission.VIEW_PRODUCTS, Permission.VIEW_OWN_CONTENT];

  MARKETING_EDITOR: [
    Permission.VIEW_PRODUCTS,
    Permission.VIEW_OWN_CONTENT,
    Permission.CREATE_CONTENT,
    Permission.EDIT_CONTENT,
    Permission.REGENERATE_CONTENT,
    Permission.EDIT_CREATIVE,
    Permission.REGENERATE_CREATIVE,
  ];

  MARKETING_APPROVER: [
    Permission.VIEW_PRODUCTS,
    Permission.VIEW_OWN_CONTENT,
    Permission.CREATE_CONTENT,
    Permission.EDIT_CONTENT,
    Permission.REGENERATE_CONTENT,
    Permission.APPROVE_CONTENT,
    Permission.REJECT_CONTENT,
    Permission.EDIT_CREATIVE,
    Permission.REGENERATE_CREATIVE,
    Permission.APPROVE_CREATIVE,
    Permission.REJECT_CREATIVE,
    Permission.EXPORT_CREATIVE,
  ];

  ADMIN: [
    Permission.VIEW_PRODUCTS,
    Permission.VIEW_OWN_CONTENT,
    Permission.VIEW_ALL_CONTENT,
    Permission.CREATE_CONTENT,
    Permission.EDIT_CONTENT,
    Permission.REGENERATE_CONTENT,
    Permission.APPROVE_CONTENT,
    Permission.REJECT_CONTENT,
    Permission.EDIT_CREATIVE,
    Permission.REGENERATE_CREATIVE,
    Permission.APPROVE_CREATIVE,
    Permission.REJECT_CREATIVE,
    Permission.EXPORT_CREATIVE,
    Permission.PUBLISH_CREATIVE,
  ];
  ```

- **Consequences & Tradeoffs:** Guarantees two-person integrity on external marketing publications. Editors cannot self-approve. Approval of the W02 authorization matrix does NOT approve future publication destinations or W61 workflow behavior, which remain locked fail-closed.
- **Safe Temporary Default:** Enforced via `PermissionService` across all application boundaries.
- **Blocks Implementation:** NO (Already fully implemented and tested in W02).
- **Owner:** Lead Systems Architect & Security Reviewer.
- **Due Milestone:** W02 (Accepted).
- **Status:** **APPROVED**
- **Evidence / Approval Reference:** Accepted W02 Evidence Report (`docs/implementation-evidence/W02-authorization-and-publishing-safety.md`); `app/packages/application/src/modules/auth/domain/permissions.ts`.

---

## 4. Cross-Specification Traceability Matrix

| Specification                              | Mandatory Decisions Required to Implement   | Non-Blocking Open Decisions                                               |
| ------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------- |
| **Product Freshness & Campaign Integrity** | `W03-DEC-001`, `W03-DEC-002`, `W03-DEC-004` | `W03-DEC-003`, `W03-DEC-016`, `W03-DEC-017`, `W03-DEC-018`                |
| **Layered Creative Scene Schema**          | `W03-DEC-004`, `W03-DEC-007`                | `W03-DEC-005`, `W03-DEC-006`, `W03-DEC-009`, `W03-DEC-012`, `W03-DEC-018` |
| **Brand Intelligence & Data Governance**   | `W03-DEC-007`, `W03-DEC-008`                | `W03-DEC-009`, `W03-DEC-010`, `W03-DEC-016`, `W03-DEC-018`                |
| **Provider Budget & Usage Ledger**         | `W03-DEC-011`, `W03-DEC-014`                | `W03-DEC-012`, `W03-DEC-013`, `W03-DEC-015`, `W03-DEC-016`, `W03-DEC-018` |

---

## 5. Review & Change Management Protocol

1. Any modification to a decision in this register requires formal review by the Lead Systems Architect and the designated business owner.
2. Changes to `Status` from `PROPOSED` to `APPROVED` must cite signed business documentation, board resolutions, or accepted implementation evidence.
3. When a decision is approved, the corresponding specification and environment configuration must be updated synchronously, triggering a configuration revision event.
