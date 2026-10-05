# Content persistence

## Phase 1D validation records

Each immutable `ContentVersion` can have one immutable `ValidationResult` per validator version. Findings are normalized child rows rather than an opaque status blob. Count constraints ensure the stored total equals blocking, warning, and information counts. PostgreSQL triggers reject updates and deletes for both result and finding rows. A validation transaction also creates the idempotent `CONTENT_VALIDATION_COMPLETED` outbox event.

`ContentJob` links one immutable product snapshot and one brand-rule version to a content type, language, and platform. Phase 1C transitions are explicit: `REQUESTED -> GENERATING -> DRAFT`, `GENERATING -> FAILED`, and retry `FAILED -> GENERATING`. `DRAFT` is terminal in this phase.

`GenerationAttempt` records every provider call: sequential attempt number, provider, model, prompt version, status, timestamps, latency, nullable token counts/cost, and sanitized failure metadata. Prompts and content are not copied into attempt telemetry.

`ContentVersion` is append-only. It references the job, snapshot, brand rules, and exact successful attempt; stores structured output plus bounded provider metadata; and has database uniqueness on `(content_job_id, version_number)` and `generation_attempt_id`. A database trigger rejects update/delete. V1/V2 allocation is row-locked in a serializable transaction.

Transaction A locks the job, verifies the state, moves it to `GENERATING`, and creates an attempt. The provider call occurs with no open database transaction. Transaction B locks again, verifies the active attempt, creates the version, finishes the attempt, moves the job to `DRAFT`, and appends `CONTENT_VERSION_CREATED`. Failure closes the attempt and moves the job to `FAILED`; no version or completion event is created.
