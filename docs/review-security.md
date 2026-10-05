# Review workflow security and integrity

**Status:** Implemented in Phase 1F

The review and approval system enforces multi-layered defense-in-depth across transport, domain authorization, transaction isolation, and database-level constraints.

## 1. Authentication and authorization

### Identity resolution

Every inbound Telegram update is authenticated by numeric `from.id` mapped to a provisioned internal user. Telegram usernames are purely informational and are never used for authentication. If an identity is missing, deactivated, or not provisioned, access is immediately rejected.

### Role-based permissions

Review capabilities are governed by discrete domain permissions:

| Permission           | Description                            | Permitted Roles                                   |
| -------------------- | -------------------------------------- | ------------------------------------------------- |
| `EDIT_CONTENT`       | Submit editorial revision instructions | `MARKETING_EDITOR`, `MARKETING_APPROVER`, `ADMIN` |
| `REGENERATE_CONTENT` | Request fresh draft generation         | `MARKETING_EDITOR`, `MARKETING_APPROVER`, `ADMIN` |
| `APPROVE_CONTENT`    | Formally approve content version       | `MARKETING_APPROVER`, `ADMIN`                     |
| `REJECT_CONTENT`     | Formally reject content version        | `MARKETING_APPROVER`, `ADMIN`                     |

Actors possessing only `VIEWER` or `MARKETING_EDITOR` roles cannot approve or reject content. Violations trigger `ForbiddenError` and log a structured security audit event.

## 2. Telegram interaction security

### Short-lived, single-use action tokens

Inline buttons do not encode internal IDs or raw actions in callback data. Instead, they use opaque random 24-character bearer tokens:

- **Hashing:** Only cryptographic hashes (SHA-256) are persisted in PostgreSQL.
- **Identity binding:** Tokens are tied to the recipient's `telegramIdentityId`. Updates from other users cannot activate them.
- **Time-to-live:** Tokens expire automatically after 900 seconds (configurable via `TELEGRAM_ACTION_TOKEN_TTL_SECONDS`).
- **Single-use enforcement:** Sensitive state changes (e.g. `CONFIRM_APPROVE`) mark tokens as `singleUse: true`, which are consumed atomically in a transaction.

### Durable pending review interactions

Capturing free-form reviewer input (edit instructions or rejection comments) avoids fragile in-memory session state by persisting records in `telegram_pending_review_interactions`:

- Strictly bound to the reviewer's Telegram identity, job ID, and version ID.
- Expire after 15 minutes.
- Can be aborted at any time with `/cancel` or inline `Cancel`.
- Text input is validated for boundaries (1 to 1,000 characters) before submission.

### Output rendering sanitization

All user-supplied and AI-generated text rendered in Telegram messages is sanitized:

- HTML characters (`<`, `>`, `&`) are escaped using `escapeHtml` to prevent markup injection.
- Message chunks are bounded to avoid Telegram length limit truncation.

## 3. Database constraints & immutability triggers

PostgreSQL serves as the ultimate arbiter of truth. Even if application code were compromised, database constraints enforce integrity:

### Append-only approval events

```sql
CREATE TRIGGER approval_events_append_only
BEFORE UPDATE OR DELETE ON "approval_events"
FOR EACH ROW EXECUTE FUNCTION prevent_approval_event_mutation();
```

Attempts to modify or delete an `ApprovalEvent` raise a database exception.

### Immutable revision requests

```sql
CREATE TRIGGER revision_requests_no_delete
BEFORE DELETE ON "revision_requests"
FOR EACH ROW EXECUTE FUNCTION prevent_revision_request_deletion();

CREATE TRIGGER revision_requests_core_immutable
BEFORE UPDATE ON "revision_requests"
FOR EACH ROW EXECUTE FUNCTION prevent_revision_request_core_mutation();
```

`RevisionRequest` records cannot be deleted. Core audit fields (`content_job_id`, `source_content_version_id`, `requested_by_user_id`, `type`, `instruction`, `created_at`) are unchangeable after insertion.

### Terminal decision indexes

- `approval_events_single_approved_per_job`: Unique partial index preventing more than one approval per job.
- `approval_events_single_rejected_per_job`: Unique partial index preventing more than one rejection per job.
- `revision_requests_one_pending_per_job`: Unique partial index ensuring at most one pending revision per job.
