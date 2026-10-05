# Telegram notifications

## Delivery path

Generation and validation remain background work. A successful validation transaction writes `CONTENT_VALIDATION_COMPLETED`; terminal generation failure writes `CONTENT_GENERATION_FAILED`. `TelegramOutboxDispatcher` leases only those topics with PostgreSQL `FOR UPDATE SKIP LOCKED`, resolves the requester from authoritative records, and sends through `TelegramDeliveryGateway`.

`TelegramNotificationDelivery` is unique by outbox event. It records recipient identity, attempts, status, safe error code, and sent time. A sent event is not sent again if its outbox lease is reclaimed. Telegram delivery failure never changes `ContentJob`, `ContentVersion`, or `ValidationResult`.

## Draft UX

The notification shows short job/version references, product, content type, language, target platform, generated structured fields, and a prominent validation banner:

- `PASSED`: facts checked; no blocking findings;
- `PASSED_WITH_WARNINGS`: warnings visible for review;
- `BLOCKED` or `FAILED`: clearly states the draft cannot be approved.

Buttons are limited to **View Source** and **View Validation**. Phase 1E deliberately has no Approve or publishing action. Output is sent as plain text rather than Markdown/HTML, preventing formatting injection. Unicode-aware splitting keeps each message below 3,900 characters; buttons are attached only to the last chunk.

## Failure and retry policy

- Telegram `429` respects `retry_after` when supplied.
- Network/HTTP failures retry after a bounded delay.
- Telegram `400`, `403`, invalid recipient/payload, and five exhausted attempts are terminal.
- Operational logs contain outbox ID, safe error code, attempt number, and terminal flag—not bot tokens, callback bearer values, or captions.

There remains an unavoidable crash window after Telegram accepts a message but before the database records `SENT`; Telegram offers no general idempotency key for `sendMessage`. This can cause a duplicate notification, never duplicate workflow state or AI generation.

