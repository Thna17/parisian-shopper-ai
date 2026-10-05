# Business Confirmations Required: Brand & Editorial Guidelines

**Document:** `/docs/business-confirmations-required.md`  
**Audience:** Brand Director, Head of Marketing, Product Management  
**Status:** Open for Business Approval Prior to Production  

---

## 1. Executive Context

The Phase 1 MVP currently uses development-only placeholders for brand voice, copywriting conventions, and platform formatting. In the database, brand rules are versioned as append-only records (`BrandRuleVersion`).

Before deploying to external retail production, the marketing leadership must formally approve the resolution for each item below. Once confirmed, engineering will publish **BrandRuleVersion v2**, which will immediately take effect for all subsequent content generation jobs with zero system downtime.

---

## 2. Business Confirmation Registry

### Item 1: Khmer Tone & Formality Level
- **Placeholder Rule:** `TODO_BUSINESS_CONFIRMATION: Khmer tone`
- **Current Development Behavior:** Uses neutral conversational Khmer (`មាតិកាសាកល្បង...`).
- **Business Decision Required:**
  - *Option A (Recommended for Luxury):* Polite, elegant, and aspirational register using respectful pronouns (e.g., លោកអ្នក, ភាពទាក់ទាញ).
  - *Option B (Trendy / Casual):* Warm, energetic social media register popular among Gen Z luxury shoppers.
- **Impact:** Injected into system prompt for Khmer caption generation.

### Item 2: English Tone & Voice
- **Placeholder Rule:** `TODO_BUSINESS_CONFIRMATION: English tone`
- **Current Development Behavior:** Standard descriptive commercial tone.
- **Business Decision Required:**
  - *Option A (Parisian Chic):* Understated elegance, evocative imagery, refined adjectives, minimal hyperbole.
  - *Option B (Direct Retail):* Fast-paced, benefit-oriented promotional copy.

### Item 3: Call to Action (CTA) Style & Destination
- **Placeholder Rule:** `TODO_BUSINESS_CONFIRMATION: CTA style`
- **Current Development Behavior:** "Learn more from the verified product catalogue."
- **Business Decision Required:**
  - Should the CTA direct customers to:
    1. A Telegram boutique concierge (`Send us a message to order`)?
    2. An e-commerce web link (`Shop online at...`)?
    3. In-store boutique visit (`Discover at our flagship store...`)?
- **Urgency Standard:** Should CTAs include scarcity language (e.g., "Limited stock available")?

### Item 4: Emoji Policy & Permissible Set
- **Placeholder Rule:** `TODO_BUSINESS_CONFIRMATION: emoji policy`
- **Current Development Behavior:** Minimal emojis (e.g. ✨, 🌸).
- **Business Decision Required:**
  - *Option A (High-End Luxury):* Zero or maximum 1 subtle emoji per post (✨).
  - *Option B (Social Engagement):* Moderate emojis (2–4 per post) reflecting product notes (🌹, 🌿, 💎).

### Item 5: Promotional & Discount Urgency Wording
- **Placeholder Rule:** `TODO_BUSINESS_CONFIRMATION: discount urgency wording`
- **Current Development Behavior:** "Save X% off for \$Y.YY USD".
- **Business Decision Required:**
  - Permissible promotional phrases (e.g., "Special Introductory Offer", "Seasonal Privilege", vs "Flash Sale").
  - Policy on expiry dates: Must expiration dates be included in the caption if available in snapshot?

### Item 6: Fragrance Claims, Longevity & Similarity Language
- **Placeholder Rule:** `TODO_BUSINESS_CONFIRMATION: perfume and similarity wording`
- **Current Development Behavior:** Strictly grounds notes to verified olfactory pyramid (top, heart, base). Prohibits unsupported "smells like [Designer]" claims.
- **Business Decision Required:**
  - Confirm policy on "Inspired by" or similarity claims: Maintain strict prohibition, or allow approved brand similarity notes?
  - Longevity claims (e.g., "Long-lasting 8-hour wear"): Allowed only if substantiated in product snapshot? *(Engineering recommendation: Prohibit unsubstantiated longevity claims).*

### Item 7: Country-of-Origin & Authenticity Claims
- **Placeholder Rule:** `TODO_BUSINESS_CONFIRMATION: country-of-origin wording`
- **Current Development Behavior:** "Made in [Country]" only when present in snapshot.
- **Business Decision Required:**
  - Preferred phrasing: "Crafted in France", "Imported from France", or "Made in France"?
  - Authenticity assurances: Is "100% Guaranteed Authentic" permitted in copy?

### Item 8: Platform-Specific Caption Length Limits
- **Placeholder Rule:** `TODO_BUSINESS_CONFIRMATION: Facebook caption length / Telegram formatting`
- **Current Development Behavior:** Telegram target ~400 characters; Facebook target ~600 characters.
- **Business Decision Required:**
  - Maximum character count targets for Telegram channel feeds vs Facebook public posts.
  - Hashtag standard: Minimum and maximum hashtags per post (recommended: 3–5 branded tags).

---

## 3. Approval & Deployment Workflow

1. Marketing leadership reviews this document and records approved decisions.
2. Product Manager creates an issue referencing each decision.
3. Engineering prepares `BrandRuleVersion` v2 JSON payload.
4. Activation executed via database migration or administrative CLI:
   ```bash
   pnpm db:seed:brand-rules-v2
   ```
5. All new drafts automatically adopt v2; all historical versions retain their original v1 grounding.
