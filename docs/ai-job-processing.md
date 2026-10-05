# AI job processing

Queue: `content-generation`; job name: `GENERATE_CONTENT`; payload: `{ contentJobId }`. Job names are centralized. The stable BullMQ job ID is `generate-<contentJobId>`; snapshots, prompts, output, and credentials never enter queue payloads.

The API/runtime queue producer and worker are separate Nest providers. The worker is registered only by the worker entrypoint. When AI text generation is disabled, neither producer nor consumer opens this queue.

Default retry policy is `AI_MAX_RETRIES + 1` total attempts with one-second exponential backoff. Timeout, network/provider temporary failures, and rate limits are retryable. Authentication, configuration, strategy prerequisites, invalid requests, and malformed outputs are permanent. BullMQ `UnrecoverableError` prevents permanent failures from consuming retries.

Idempotency does not rely on BullMQ alone. The job row is locked before an attempt starts; a live `GENERATING` lease makes duplicate delivery retryable; `DRAFT` suppresses completed duplicate delivery; and attempt/version uniqueness is enforced in PostgreSQL. `AI_ATTEMPT_STALE_AFTER_MS` exceeds the provider timeout and matches the worker lock duration. After a crashed worker lease expires, the repository closes the abandoned attempt with `AI_ATTEMPT_ABANDONED` before starting a new attempt. Phase 1G still needs an operational dead-job/reconciliation command and alerting.

`CONTENT_GENERATION_REQUESTED` and `CONTENT_VERSION_CREATED` are persisted through the outbox with ID-only payloads. Phase 1C does not implement Telegram or publication handlers. The existing outbox dispatcher foundation will later route the request event to `ContentGenerationQueue`.
