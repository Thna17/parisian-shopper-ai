# AI content engine

## Deterministic validation handoff

AI output is never considered factually valid merely because it satisfies the structured-output schema. After an immutable version is created, the generation worker enqueues deterministic validation by content-version ID. `ps-factual-v1` compares claims with the version's immutable product snapshot without contacting the AI provider. A blocking or failed validation is ineligible for future approval.

**Scope:** Phase 1C creates candidates; Phase 1D validates their protected factual claims. A `DRAFT` is not approved even after it passes validation.

The application loads an immutable `ProductSnapshot` and an immutable `BrandRuleVersion`, resolves one of five strategies, builds typed context, calls `AITextProvider`, validates the canonical output, and stores append-only `ContentVersion` V1. Deterministic factual comparison then runs asynchronously. No Telegram, approval, publication, or image behavior is present.

The context version is `ps-content-v1`. Context is composed as distinct `SYSTEM RULES`, `BRAND RULES`, `CONTENT STRATEGY`, `PRODUCT FACTS`, optional `REVIEWER INSTRUCTION`, and optional `PREVIOUS DRAFT` sections. The last three are explicitly marked untrusted. Product text is never promoted to system instructions.

The output contract requires `headline`, nullable Khmer and English captions, `cta`, `hashtags`, `creative_brief`, `facts_used`, `warnings`, and `missing_information`. Language rules require Khmer for `KM`, English for `EN`, and both for `BILINGUAL`. `facts_used` is provider-reported metadata only; the Phase 1D validator compares it and all output fields with the snapshot independently.

Known limitation: schema validation proves structure, not truth, safety, translation quality, or brand approval.
