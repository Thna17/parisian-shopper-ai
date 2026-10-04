# Transactional outbox foundation

## Problem

PostgreSQL, BullMQ/Valkey, Telegram, and future external systems cannot share one atomic transaction. Writing domain state and then directly sending a message can lose the message; sending first can publish an effect for a transaction that later rolls back.

## Pattern

```text
application transaction
  ├─ database state change
  └─ append OutboxEvent
          ↓ commit
outbox dispatcher (future)
          ↓
idempotent queue or external adapter
          ↓
mark processed / retain evidence
```

`TransactionManager.run` supplies a transaction-scoped `OutboxWriter`. The Prisma adapter writes state and outbox through the same transaction client. Phase 1A includes the data model, ports, adapter, uniqueness constraint, rollback integration test, and processing fields; it deliberately does not poll, dispatch, or handle business topics.

## Event envelope

An event has UUID `id`, controlled `topic`, positive `schemaVersion`, globally unique `idempotencyKey`, optional aggregate type/ID, JSON-compatible payload, `occurredAt`, `availableAt`, claim/process timestamps, attempt count, and sanitized last error code. Payload JSON is bounded/versioned and cannot contain credentials or the sole copy of canonical truth.

Future topics include `CONTENT_GENERATION_REQUESTED`, `CONTENT_VERSION_CREATED`, `CONTENT_APPROVED`, and `TELEGRAM_NOTIFICATION_REQUESTED`; they are examples, not active Phase 1A handlers.

## Processing rules

- A dispatcher will claim bounded batches transactionally, using PostgreSQL locking such as `FOR UPDATE SKIP LOCKED` plus a recoverable lease.
- It sends with the event ID/idempotency key, then records completion. Crashing after send but before completion may redeliver, so every handler must be idempotent.
- Queue jobs use a stable BullMQ job ID derived from the outbox event where appropriate.
- Attempts and safe error codes are durable; secrets and unrestricted response bodies are not.
- Poison events stop after a bounded policy and become operationally visible. They do not retry forever.
- Reconciliation compares durable outbox/domain state with delivery state; it never treats Valkey as authoritative.

The actual dispatcher, schedules, handler registry, leases, and business topics are deferred until a phase has a real event to deliver.
