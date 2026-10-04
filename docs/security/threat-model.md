# Security threat model

**Scope:** Parisian Shopper MVP from Telegram ingress through `APPROVED`

**Method:** Trust-boundary and misuse-case review

**Status:** Architecture baseline; must be updated before production and whenever a new integration is added

## Assets and security objectives

The highest-value assets are canonical product facts, immutable snapshots and versions, approval authority/history, staff identity mappings, AI and Product API credentials, provider spend, and business content. The primary objectives are:

- only mapped active users perform authorized actions;
- no unverified or changed fact becomes approvable;
- every approved result identifies one immutable version and snapshot;
- retries and concurrency cannot duplicate cost or corrupt state;
- credentials and sensitive operational data never enter prompts, callbacks, or logs;
- the MVP has no technical path to publish content.

## Trust boundaries

Telegram users, Telegram delivery, the Product API, AI providers, image URLs, and future web clients are outside the application trust boundary. Telegram numeric user IDs are identity inputs, not proof of an internal authorization role until mapped. Catalog prose and reviewer feedback are untrusted text. PostgreSQL is the authoritative application store; Valkey is non-authoritative delivery infrastructure.

Likelihood ratings assume a small internal deployment exposed to Telegram and internet APIs: **Low**, **Medium**, or **High**. Residual risk is the expected risk after the listed mitigations, not a guarantee.

## Threat register

| Threat | Impact | Likelihood | Mitigation | Residual risk |
|---|---|---:|---|---|
| Unauthorized Telegram user | Catalog exposure or unauthorized generation/approval | High | Map numeric Telegram ID to an active internal user; deny by default; role policies in application services; rate limit unknown IDs; audit denials. Never authorize by username. | Low; Telegram account takeover remains possible and needs staff offboarding/reporting. |
| Telegram callback replay | Repeated revision, rejection, approval attempt, or duplicate spend | High | Opaque random single-use callback token bound to expected actor/job/version/action with expiry; atomic consume; unique source action ID; idempotent service response. | Low; a stolen unexpired token from the same compromised account remains usable once. |
| Duplicate updates from Telegram | Duplicate jobs, messages, and AI charges | High | Persist unique numeric `update_id` before processing; transactional inbox status; deterministic request/job keys; return prior outcome on duplicates. | Low; retention must exceed Telegram's practical retry window. |
| Forged callback data | Actor targets another job/version or invents an action | High | Callback contains only an opaque token, never trusted state; server loads bound action and rechecks actor, authorization, expected state, latest version, and expiry. HMAC signing is defense in depth, not a replacement for storage. | Low. |
| Prompt injection through catalogue descriptions | Catalog text instructs the model to ignore rules, leak data, or invent facts | High | Mark product payload as untrusted data; separate context sections; never place credentials or unrelated records in context; schema output; deterministic validators; adversarial contract fixtures. | Medium; model behavior is probabilistic, but invalid factual output remains unapprovable. |
| Prompt injection through reviewer feedback | Reviewer asks to alter price/origin/claims or reveal system instructions | High | Treat feedback as subordinate untrusted data; allowlisted task framing; no secret-bearing prompts; validate all output; record actor/instruction; permission and length/rate limits. | Medium; harmful style content may need human moderation beyond factual validation. |
| AI secret leakage | API key exposed in output, errors, telemetry, or repository | High | Secret manager/environment injection; provider adapter only; no key in prompt; log redaction; output scanning; scoped key, spend limits, rotation and incident procedure; secret scanning in CI. | Low to Medium depending on provider/host controls. |
| Product/API secret leakage | Catalog credential or response metadata exposed via logs/Telegram | Medium | Read-only least-privilege credential; TLS; centralized adapter; header/body allowlist logging; redact URLs/query secrets; never persist auth headers; rotate and audit access. | Low. |
| Wrong approval authorization | Editor/viewer approves, or role changes are ignored | High | Central policy service and transaction-time role/status lookup; `APPROVER`/`ADMIN` only; no UI-only checks; role-assignment audit; tests for every role. | Low; malicious authorized approver remains an insider risk. |
| Approval of obsolete content version | V1 approved after V2 exists or concurrent edit races approval | High | Approval transaction locks/optimistically checks job, requires target equals latest version, expected state `UNDER_REVIEW`, no blocking results, and atomically appends event/state. Token binds version. | Low. |
| Race conditions in state/version allocation | Two V2 records, conflicting approve/reject, lost transition | High | Unique `(job_id, version_number)`; row lock or compare-and-swap `lock_version`; explicit transition service; transaction boundaries; concurrency integration tests. | Low. |
| Duplicate AI generation/cost | Retries or worker crashes trigger repeated billable requests | High | Deterministic execution ID, pre-call `GenerationAttempt`, BullMQ unique job ID, lease/heartbeat, bounded retry, provider idempotency where supported, cost limits and reconciliation of uncertain timeouts. | Medium because providers may charge a timed-out request without idempotency support. |
| Product API spoofing or tampering | False price/stock/product facts enter a trusted snapshot | Medium | TLS with certificate verification; approved base URL/DNS/network egress; optional mTLS/signatures; strict schema; source/version metadata; read-only account; correlation/audit and contract tests. | Low to Medium; compromised authoritative source remains trusted and needs upstream controls. |
| SSRF via product/image URLs | Access to metadata services or internal network; data exfiltration | High | Do not fetch assets in MVP unless required; HTTPS and hostname allowlist; reject IP literals/private/reserved ranges; re-resolve/validate redirects; size/type/time limits; isolated egress proxy. Rendering a Telegram URL should use approved source hosts only. | Low if no server-side fetch; Medium when media fetching is introduced. |
| SQL injection | Data theft, mutation, approval tampering | Medium | Prisma parameterization; no string-built SQL; tightly reviewed parameterized raw SQL only; input bounds; least-privilege runtime DB role; security tests. | Low. |
| Malformed AI response | Crash, truncated content, hidden fields, validation bypass | High | Strict Zod schema with unknown fields rejected, size/depth limits, Unicode handling, local parsing, no persistence as eligible version until validation completes; sanitized provider error. | Low. |
| Denial-of-service/rate abuse | Bot unavailable, queue flooded, provider spend exhausted | High | Per-user/global command limits, bounded search/results/input, queue concurrency and quotas, AI budget alerts/circuit breaker, webhook/reverse-proxy limits, unknown-user throttling, backpressure. | Medium; Telegram/provider-wide outages remain external. |
| Accidental publishing | Unreviewed or approved content reaches a social channel | Low in MVP, severe impact | No publishing code, routes, queues, credentials, SDKs, or network permissions in MVP; `APPROVED` terminal; build/architecture tests forbid publication modules; later publishing requires new ADR and authorization. | Very Low in MVP. |
| Logging sensitive credentials | Credentials, callback tokens, prompts, or catalog details leak to log store | Medium | Pino allowlist serializers/redaction, log safe IDs and hashes instead of bodies, never log headers/tokens/raw prompts, access/retention controls, automated canary-secret tests. | Low. |
| Product fact changes after snapshot | Reviewer assumes content reflects current price/stock though snapshot is old | High | Display snapshot retrieval/update time; immutable source view; freshness policy by field; optional pre-approval recheck that creates a new snapshot/job rather than mutating; block stale price/promo/stock according to owner-approved thresholds. | Medium until Product API freshness semantics are confirmed. |
| Validation evasion by wording, Khmer, Unicode, or images | Unsupported claim escapes deterministic patterns | Medium to High | Normalize Unicode; validate both languages and every textual field; structured facts-used references are evidence only; adversarial Khmer/English fixtures; conservative block on ambiguous protected-fact wording; manual review. | Medium; natural-language completeness cannot be mathematically guaranteed. |
| Queue payload tampering or stale delivery | Worker performs old/unauthorized work | Medium | Private Valkey network, authentication/TLS where supported, ID-only payloads, worker reloads PostgreSQL state and expected execution ID, stale messages become no-ops. | Low. |
| Supply-chain or license compromise | Malicious package, vulnerable image, or prohibited license enters build | Medium | Pinned lockfile/images/digests, trusted registries, minimal dependencies, SBOM, vulnerability/license scans, reviewed updates, no `/research` resolution/build context, reproducible CI. | Medium; upstream zero-days remain possible. |
| Insider data/approval abuse | Authorized staff creates misleading content or approves improperly | Medium | Least privilege, separation of editor/approver where staffing permits, immutable actor/timestamp evidence, review source facts, anomaly monitoring, prompt/action retention policy. | Medium; governance and supervision are required. |
| Audit/evidence deletion | History is altered to hide an action | Low to Medium | Append-only runtime DB grants/triggers, restricted migration/owner credentials, backups/PITR, off-host log/export integrity, audited break-glass process. | Low to Medium against privileged infrastructure administrators. |

## Security controls by phase

- **Phase 1A:** secret/config validation, dependency/SBOM policy, database roles, structured redaction, transition and authorization foundations.
- **Phase 1B–1D:** Product API TLS/schema/SSRF controls, immutable snapshot digest, prompt boundary, strict AI schema, deterministic validators, adversarial fixtures.
- **Phase 1E–1F:** Telegram inbox deduplication, opaque callbacks, rate limits, role policies, exact-version transaction, append-only enforcement.
- **Phase 1G:** concurrency/chaos tests, restore exercise, key rotation drill, threat-model review, penetration testing proportionate to exposure, and operational runbooks.

## Required pre-production decisions

- Product snapshot freshness thresholds for price, promotion, and stock.
- Production webhook network controls and secret-token handling.
- Secret manager, log destination/retention/access, backup RPO/RTO, and incident owner.
- Whether approval requires separation of duties or permits an editor who also holds the approver role.
- Data retention for reviewer instructions, AI outputs, Telegram metadata, and provider request evidence.

No future image generation, social publishing, admin dashboard, or local-model service is covered by this threat model. Each changes trust boundaries and requires an update before implementation.
