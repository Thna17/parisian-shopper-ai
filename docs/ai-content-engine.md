# AI content engine

**Scope:** Phase 1C candidate generation only. A `DRAFT` is schema-valid, not fact-validated or approved.

The application loads an immutable `ProductSnapshot` and an immutable `BrandRuleVersion`, resolves one of five strategies, builds typed context, calls `AITextProvider`, validates the canonical output, and stores append-only `ContentVersion` V1. No Telegram, approval, publication, image, or Phase 1D factual comparison is present.

The context version is `ps-content-v1`. Context is composed as distinct `SYSTEM RULES`, `BRAND RULES`, `CONTENT STRATEGY`, `PRODUCT FACTS`, optional `REVIEWER INSTRUCTION`, and optional `PREVIOUS DRAFT` sections. The last three are explicitly marked untrusted. Product text is never promoted to system instructions.

The output contract requires `headline`, nullable Khmer and English captions, `cta`, `hashtags`, `creative_brief`, `facts_used`, `warnings`, and `missing_information`. Language rules require Khmer for `KM`, English for `EN`, and both for `BILINGUAL`. `facts_used` is provider-reported metadata only; Phase 1D must independently compare all claims to the snapshot.

Known limitation: schema validation proves structure, not truth, safety, translation quality, or brand approval.
