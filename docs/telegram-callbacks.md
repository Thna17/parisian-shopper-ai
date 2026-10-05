# Telegram callbacks and durable interaction state

Inline callback data contains only `ps:<opaque-token>`. It never contains price, role, job state, captions, product facts, or an internal authorization decision.

## Token design

- Tokens contain 18 cryptographically random bytes encoded as 24 base64url characters.
- PostgreSQL stores only SHA-256 token hashes.
- Every record binds the action to one `TelegramIdentity`, server-side resource ID, minimal metadata, expiry, and single-use policy.
- Selection and pagination tokens are atomically consumed once. Source/validation view tokens are intentionally reusable until expiry.
- Token resolution compares the currently authenticated numeric Telegram ID with the persisted identity.
- Invalid, expired, consumed, wrong-user, and malformed tokens return safe responses without trusted state changes.

The callback's server-side action enum determines routing. Flow selection also checks its expected durable state, so an old sibling button cannot move an advanced/completed flow backward. A unique nullable `ContentJob.telegramCreateFlowId` is an additional finalization constraint.

## Update idempotency and restart safety

Every message and callback claims `update_id` by inserting an append-only `InboundTelegramUpdate`. Its unique constraint makes Telegram/webhook redelivery a no-op across process restarts. Only minimal IDs/type/timestamp are stored; the raw Telegram payload and message text are not retained.

`TelegramCreateFlow` stores the validated normalized product envelope and choices in PostgreSQL. The process can restart between buttons without losing state. Flow data expires with the action-token TTL. Phase 1G should add a scheduled retention task for expired flows, tokens, rate-limit buckets, and old inbox rows under an approved privacy policy.

