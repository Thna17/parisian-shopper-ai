# Brand knowledge base

`BrandRuleVersion` is append-only and identified by `(name, version)`. Rule sections are separately stored JSONB columns for language, tone, CTA, promotion, perfume claims, platform guidance, and visual guidance. Every section is validated by Zod before persistence. Metadata (`name`, `version`, `status`, timestamps) remains relational.

Every `ContentJob` and `ContentVersion` references the exact rule version used. Existing rows cannot be updated or deleted; policy changes create N+1. This preserves historical meaning.

The development rules are fictional placeholders only:

- `TODO_BUSINESS_CONFIRMATION: Khmer tone`
- `TODO_BUSINESS_CONFIRMATION: English tone`
- `TODO_BUSINESS_CONFIRMATION: CTA style`
- `TODO_BUSINESS_CONFIRMATION: emoji policy`
- `TODO_BUSINESS_CONFIRMATION: discount urgency wording`
- `TODO_BUSINESS_CONFIRMATION: perfume longevity and similarity wording`
- `TODO_BUSINESS_CONFIRMATION: country-of-origin wording`
- `TODO_BUSINESS_CONFIRMATION: platform-specific caption length`

None is production-approved Parisian Shopper policy.
