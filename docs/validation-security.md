# Validation security

The validator treats AI output and product text as untrusted data. It executes no embedded instructions, performs no template evaluation, makes no network request, and does not use an AI model as a judge. Regexes are bounded to short, persisted structured-output fields and avoid user-controlled dynamic expressions.

Security controls:

- The content version selects its snapshot by immutable foreign key; callers cannot substitute current catalogue data.
- Raw upstream product data must already have crossed the Phase 1B schema boundary.
- All content fields and `facts_used` are checked; bilingual output is not allowed to hide a mismatch in one language.
- Validation results and findings are append-only at application and PostgreSQL trigger levels.
- `(contentVersionId, validatorVersion)` is unique and protected by a transaction-scoped advisory lock.
- Completion and its outbox message commit atomically.
- Queue messages contain only a UUID and use a stable versioned job ID.
- No client endpoint can override a blocker or mark content valid.
- Findings avoid credentials and upstream payload dumps; expected/actual values are bounded by previously validated schemas.

Residual risks include paraphrases outside v1 patterns, language ambiguity, regex performance regressions, and a compromised database administrator. Mitigations are adversarial fixtures, bounded schemas, performance tests as the corpus grows, versioned rule reviews, database access control, and immutable audit retention.
