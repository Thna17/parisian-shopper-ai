# Job and queue conventions

## Authority and naming

PostgreSQL owns domain state. Valkey/BullMQ is delivery infrastructure and may be rebuilt from durable state/outbox records. Queue payloads will carry identifiers and schema/version metadata, never the only copy of canonical product or content data.

All production queue names must be declared in `packages/jobs/src/queue-names.ts`. Phase 1A declares none. `QueueRegistry` and `WorkerRegistry` centralize lifecycle; code must not scatter `new Queue`, `new Worker`, or string queue names through feature modules.

## Retry policy

Phase 1C registers `content-generation` / `GENERATE_CONTENT` with stable `generate-<contentJobId>` IDs, bounded attempts from `AI_MAX_RETRIES`, and exponential backoff. Permanent generation errors become BullMQ `UnrecoverableError`; only explicitly retryable provider failures consume retries. PostgreSQL state remains the idempotency authority.

- Workers are idempotent and reload expected state from PostgreSQL.
- Retries are bounded. Transient network, rate-limit, and selected 5xx failures use exponential backoff with jitter.
- Permanent schema, authorization, invariant, or validation failures fail immediately.
- Jobs use stable IDs whenever replay could duplicate a state change or provider cost.
- Expensive AI calls require a durable generation-attempt/execution ID before invocation and may not be blindly repeated after an uncertain timeout.
- Timeouts, attempt counts, and final error classifications are explicit configuration and structured log fields.
- Exhausted jobs create a durable failed domain/operational record; a BullMQ failed set is not the only evidence.

## Lifecycle and operations

- Worker shutdown stops intake and closes workers/queues/Valkey connections gracefully.
- Queue handlers acknowledge only after the durable database transaction commits.
- Stale queue messages and duplicate deliveries become safe no-ops after expected-state/idempotency checks.
- Queue concurrency is bounded per job class; provider and cost limits take precedence over throughput.
- A future dead-job runbook must cover inspect, retry authorization, and reconciliation without editing queue internals by hand.

The integration suite creates one uniquely named harmless probe queue to prove BullMQ/Valkey compatibility. It runs only in tests, removes its job, and closes all resources. No demo/probe worker is registered by either production entrypoint.
