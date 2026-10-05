# Job & Outbox Recovery Runbook

**Document:** `/docs/job-recovery.md`  
**Audience:** Platform Engineers, Site Reliability Engineers, DevOps, On-Call Operators  
**System:** Parisian Shopper AI Content Processing Engine (BullMQ + Valkey + PostgreSQL Outbox)  

---

## 1. Overview & Architecture

The Parisian Shopper AI Content System uses an asynchronous two-tier processing model:
1. **Job Queue (BullMQ + Valkey Glide):** Dispatches asynchronous AI content generation and factual validation requests (`ContentGenerationQueue`).
2. **Transactional Outbox (PostgreSQL):** Stores downstream notification delivery events (`outbox_events`) emitted atomically during database transactions to guarantee at-least-once delivery to Telegram.

```
[Telegram Request]
       │
       ▼ (DB Transaction)
┌─────────────────────────┐
│ Create ContentJob       │ ──Enqueues BullMQ Job──► [Valkey / BullMQ Queue]
│ (Status: GENERATING)    │                                  │
└─────────────────────────┘                                  ▼
                                                    [Worker Process]
                                                    ┌─────────────────────────┐
                                                    │ 1. AI Generation        │
                                                    │ 2. Factual Validation   │
                                                    │ 3. Atomic Outbox Event  │
                                                    └─────────────────────────┘
                                                                 │
                                                                 ▼
[Telegram Gateway] ◄──Leases Events (SKIP LOCKED)─── [PostgreSQL Outbox Events]
```

---

## 2. Queue Operational Recovery (`queue-operations.mjs`)

### 2.1 Queue Health Inspection
Inspect the active status of ContentJobs, BullMQ queues, GenerationAttempts, and ValidationResults:
```bash
# Via npm script:
pnpm queue:status

# Directly with detailed options:
node scripts/queue-operations.mjs --status
```
**Sample Output:**
```
=============================================================
  PARISIAN SHOPPER AI — QUEUE & CONTENT JOB STATUS REPORT
=============================================================
ContentJob Summary:
  - UNDER_REVIEW : 4
  - APPROVED     : 12
  - REJECTED     : 2
  - GENERATING   : 0
  - Total Jobs   : 18

Recent Stuck / Failed Jobs (> 120s): None detected.
BullMQ Queue Health: Clean
=============================================================
```

### 2.2 Identifying Stuck or Zombie Jobs
A job is defined as "stuck" if:
1. `ContentJob.status` is `GENERATING` or `REVISION_REQUESTED`.
2. The latest `GenerationAttempt` was created more than `AI_ATTEMPT_STALE_AFTER_MS` ago (default: 120,000 ms / 2 minutes) with status `RUNNING`.
3. The BullMQ worker crashed, timed out, or disconnected.

To scan specifically for stuck jobs:
```bash
node scripts/queue-operations.mjs --detect-stuck
```

### 2.3 Safe Job Retry Procedure
To re-enqueue a stuck job:
```bash
node scripts/queue-operations.mjs --retry <CONTENT_JOB_ID>
```

#### Strict Safety Guardrails
The recovery CLI enforces strict state invariants:
- **Terminal Jobs Refusal:** If a job has status `APPROVED` or `REJECTED`, the CLI will throw an error and refuse to re-enqueue:
  ```
  [ERROR] Cannot retry job <id>: Job is in terminal state 'APPROVED'. Re-generation prohibited.
  ```
- **Under-Review Jobs Protection:** If a job is already `UNDER_REVIEW`, it will not be restarted unless explicitly forced, preventing clobbering active human reviews.
- **Atomic Reset:** When retried, a new `GenerationAttempt` is registered, preventing duplicate version generation.

---

## 3. Outbox Operational Recovery (`outbox-operations.mjs`)

The Transactional Outbox delivers Telegram notifications for draft reviews, validation outcomes, approvals, and rejections.

### 3.1 Outbox Backlog & Health Check
Inspect the status of the notification outbox:
```bash
# Via npm script:
pnpm outbox:status

# Directly with detail:
node scripts/outbox-operations.mjs --status
```
**Key Metrics to Monitor:**
- **Pending Events:** Should remain < 50 under normal operation.
- **Oldest Pending Event Age:** If > 60 seconds, investigate outbox dispatcher process or Telegram API rate limits.
- **Dead-Letter Events:** Events with `terminal = true` or `attempt_count >= 5`.

### 3.2 Inspecting Dead-Letter / Failed Events
```bash
# List all dead-lettered events:
node scripts/outbox-operations.mjs --dead-letter

# List events with recent failure codes:
node scripts/outbox-operations.mjs --failed
```
**Common Telegram Failure Classifications:**
| Error Code | Classification | Automated Handling | Operator Action |
|---|---|---|---|
| `TELEGRAM_429` | Transient Rate Limit | Exponential backoff using `retry_after` | Monitor backlog; do not force retry immediately. |
| `TELEGRAM_NETWORK` | Transient Network | Retries up to 5 times | Ensure egress internet connectivity. |
| `USER_BLOCKED_BOT` | Permanent | Marked dead-letter (`terminal = true`) | Contact user or disable identity via admin script. |
| `CHAT_NOT_FOUND` | Permanent | Marked dead-letter (`terminal = true`) | Verify user has executed `/start` in Telegram bot. |

### 3.3 Safe Outbox Event Retry
To reset and retry a specific failed outbox event:
```bash
node scripts/outbox-operations.mjs --retry --id <OUTBOX_EVENT_ID>
```
To retry all non-permanent failed events whose retry window has elapsed:
```bash
node scripts/outbox-operations.mjs --retry
```

---

## 4. Emergency Database Intervention

If automated recovery scripts are unavailable, run these SQL queries via `psql`:

### 4.1 Release Leased Outbox Events
If an outbox dispatcher crashed while holding leases on events:
```sql
UPDATE outbox_events
SET claimed_at = NULL
WHERE processed_at IS NULL
  AND claimed_at < NOW() - INTERVAL '5 minutes';
```

### 4.2 Reset a Stuck Content Job
```sql
-- Step 1: Mark stalled attempt as FAILED
UPDATE generation_attempts
SET status = 'FAILED',
    completed_at = NOW(),
    error_message = 'Manual operator reset after worker termination'
WHERE content_job_id = '<JOB_UUID>'
  AND status = 'RUNNING';

-- Step 2: Set job back to UNDER_REVIEW (if previous version exists) or REVISION_REQUESTED
UPDATE content_jobs
SET status = 'UNDER_REVIEW'
WHERE id = '<JOB_UUID>'
  AND status = 'GENERATING';
```
