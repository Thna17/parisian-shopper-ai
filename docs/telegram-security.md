# Telegram security review

**Scope:** Phase 1E ingress, callbacks, staff reads, generation requests, and notifications.

| Risk | Implemented control | Residual risk / follow-up |
|---|---|---|
| Username impersonation | Numeric Telegram ID is the unique authorization key; username changes only metadata. | Telegram account takeover still impersonates that numeric account; use staff offboarding and Telegram account security. |
| Unknown/disabled user | Deny by default before command routing; safe response and audit event. | Unknown-ID rate limiting at the reverse proxy is still recommended because no internal identity exists for a per-user bucket. |
| Forged callback / IDOR | Random hashed token, identity binding, server-side resource/action, authorization on every read. | A stolen token plus the bound Telegram account is usable until expiry. |
| Callback replay/stale buttons | Atomic single-use consume, expiry, expected flow state, unique job per flow. | Read-only view tokens are deliberately reusable until expiry. |
| Duplicate Telegram updates | Unique append-only `update_id` claim before business logic. | Define inbox retention longer than the practical retry window before production. |
| AI cost abuse | Editor permission, five create starts per identity/minute, callback limits, stable BullMQ job ID, unique flow/job, generation lease. | Add global budget/circuit-breaker monitoring in Phase 1G. |
| Webhook spoofing | grammY webhook registration uses Telegram secret token; endpoint compares the header in constant time and returns 403 on mismatch. | Terminate TLS at trusted infrastructure and restrict ingress where feasible. |
| Bot/API token leakage | Environment-only secrets; config validation; redacted structured logger; no token/callback logging. | Use a production secret manager and rotation runbook. |
| Markdown/HTML injection | Messages use Telegram plain-text mode; user/provider output is never passed with `parse_mode`. | Confusable Unicode remains a human-review concern. |
| Oversized message | Unicode-aware 3,900-character chunks and bounded command/search inputs. | Telegram albums/media are out of scope. |
| Outbox duplicate delivery | Row lease, unique delivery record, sent check, bounded retry. | Crash after remote acceptance and before `SENT` can duplicate a message. |
| Generation/validation failure | Safe failure message; content state remains authoritative in PostgreSQL. | Operators need dead-delivery visibility and alerting in Phase 1G. |

The webhook accepts only the expected secret and is version-neutral. OpenAPI contains no secret examples. Production should place body-size and network rate limits at the existing API/reverse-proxy boundary as well as the application command limits.

