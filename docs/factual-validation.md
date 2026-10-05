# Deterministic factual validation

Phase 1D validates every immutable `ContentVersion` against the exact immutable `ProductSnapshot` referenced by that version. The implementation is local, deterministic, versioned as `ps-factual-v1`, and performs no AI or network calls.

Generation completion enqueues `VALIDATE_CONTENT_VERSION` on the `content-validation` queue using the stable job key `validate-<contentVersionId>-ps-factual-v1`. The worker loads the version and snapshot, executes every registered rule, persists one immutable `ValidationResult` plus its immutable findings, and writes `CONTENT_VALIDATION_COMPLETED` to the transactional outbox in the same database transaction. Duplicate delivery returns the existing result.

Statuses are `PASSED`, `PASSED_WITH_WARNINGS`, `BLOCKED`, and `FAILED`. A future approval operation is eligible only when the latest persisted result is `PASSED` or `PASSED_WITH_WARNINGS` and has zero blocking findings. Phase 1D exposes this as a read-only application query; it does not implement approval or an override.

The validator examines headline, Khmer caption, English caption, CTA, each hashtag, creative brief, and every `facts_used` entry. Findings retain the relevant content path. Rules aggregate findings instead of stopping after the first error.

Known limitations: rules recognize controlled claim forms, not arbitrary natural-language entailment. Khmer coverage is deliberately narrow and documented in the normalization guide. A missed unsupported paraphrase is possible; expanding patterns requires fixtures and a validator version decision. False positives are treated as rule defects, not silently downgraded. Blocking results cannot be manually marked valid.
