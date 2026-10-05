# Content persistence

## Phase 1D validation records

Each immutable `ContentVersion` can have one immutable `ValidationResult` per validator version. Findings are normalized child rows rather than an opaque status blob. Count constraints ensure the stored total equals blocking, warning, and information counts. PostgreSQL triggers reject updates and deletes for both result and finding rows. A validation transaction also creates the idempotent `CONTENT_VALIDATION_COMPLETED` outbox event.

## Phase 1F review and revision records

### RevisionRequest

Every revision request (editorial edit or regeneration) persists a `RevisionRequest` row:

- **Fields:** `contentJobId`, `sourceContentVersionId`, `requestedByUserId`, `type` (`EDIT`, `REGENERATE`), `instruction` (max 1000 chars), `status` (`PENDING`, `COMPLETED`, `FAILED`, `CANCELLED`), and `resultingContentVersionId`.
- **Integrity:** Enforced by partial unique index `revision_requests_one_pending_per_job` on `content_job_id WHERE status = 'PENDING'`.
- **Triggers:** Deletion is blocked by `prevent_revision_request_deletion`. Core fields (`content_job_id`, `source_content_version_id`, `requested_by_user_id`, `type`, `instruction`, `created_at`) are immutable via `prevent_revision_request_core_mutation`.

### ApprovalEvent

Terminal approval and rejection events are append-only audit records in `approval_events`:

- **Fields:** `contentJobId`, `contentVersionId`, `approverUserId`, `decision` (`APPROVED`, `REJECTED`), `comment` (max 1000 chars), `validationResultId`, and `createdAt`.
- **Integrity:** Partial unique indexes `approval_events_single_approved_per_job` and `approval_events_single_rejected_per_job` guarantee exactly one approved and/or rejected outcome per job.
- **Trigger:** Update and delete are blocked by `prevent_approval_event_mutation`.

### TelegramPendingReviewInteraction

Durable conversational state for multi-step text inputs (edit instructions, rejection comments):

- **Fields:** `telegramIdentityId`, `contentJobId`, `contentVersionId`, `action` (`EDIT`, `REJECT`), `expiresAt`, `completedAt`, `cancelledAt`.
- Expired or cancelled interactions are automatically invalidated.

## ContentJob and ContentVersion lifecycle

`ContentJob` links one immutable product snapshot and one brand-rule version to a content type, language, and platform. Transitions follow the strict state machine:
`REQUESTED -> GENERATING -> DRAFT -> UNDER_REVIEW -> REVISION_REQUESTED -> GENERATING -> DRAFT -> UNDER_REVIEW -> APPROVED | REJECTED`.
`APPROVED` and `REJECTED` are terminal.

`ContentVersion` is append-only. It references the job, snapshot, brand rules, generation attempt, and optional `revisionRequestId`. Database uniqueness on `(content_job_id, version_number)` and `generation_attempt_id` prevents duplicates. Product snapshot and brand rule version are permanently pinned across all revisions.
