# AI security

## Trust model

System rules, validated brand rules, and registered content strategy are trusted application policy. Catalogue fields, descriptions, reviewer instructions, previous drafts, and provider responses are untrusted. The context builder retains these boundaries, and the OpenAI adapter sends trusted policy separately from an explicitly labelled untrusted-data message.

Defense in depth includes bounded Zod schemas, strict controlled enums, strategy prerequisites, provider timeouts, bounded queue retries, no silent fallback, no prompt/content logging by default, secret redaction, immutable source/rule/version evidence, and Phase 1D deterministic validation before any future approval.

Prompt injection cannot be claimed impossible. A malicious catalogue description may influence generated prose despite separation. Therefore generated output is only an unvalidated `DRAFT`; `facts_used` is not trusted; and Phase 1D remains mandatory.

Provider keys and authorization headers are never persisted or logged. Provider diagnostics stored in `GenerationAttempt` are stable codes plus sanitized metadata, not SDK exceptions or full requests. No application endpoint exposes generation in Phase 1C.
