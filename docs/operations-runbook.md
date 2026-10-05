# Operations Runbook: Daily Maintenance & Service Management

**Document:** `/docs/operations-runbook.md`  
**Audience:** Site Reliability Engineers, DevOps, On-Call Operators  
**System:** Parisian Shopper AI Content System (API, Worker, PostgreSQL, Valkey)  

---

## 1. Service Management & Architecture

The application runs as two primary Node.js 22 processes:
- **API Server (`apps/api`):** Handles Telegram webhooks/polling, administrative queries, and REST endpoints.
- **Worker Process (`apps/worker`):** Consumes BullMQ jobs for LLM content generation and factual validation.

### Starting and Stopping Services

```bash
# Production Start:
pnpm start:api      # Starts API server (Port 3000)
pnpm start:worker   # Starts background BullMQ worker

# Development Start:
pnpm dev:api
pnpm dev:worker
```

---

## 2. Health Monitoring & Verification

### 2.1 Health Check Endpoints
The API service exposes structured health checks:
```bash
curl -f http://localhost:3000/api/health
```
**Expected Response (200 OK):**
```json
{
  "status": "ok",
  "database": "connected",
  "valkey": "connected",
  "timestamp": "2026-10-05T15:00:00.000Z"
}
```

### 2.2 Operational Health CLIs
Execute these daily or integrate them into automated monitoring:
```bash
# Check Outbox Backlog & Delivery Lag:
pnpm outbox:status

# Check BullMQ Worker & Stuck Job Status:
pnpm queue:status

# Verify PostgreSQL Database Migrations:
pnpm db:migrate:status
```

---

## 3. Log Analysis & Observability

All services output structured JSON logs with correlation metadata:

```json
{
  "level": "info",
  "timestamp": "2026-10-05T15:00:00.000Z",
  "action": "telegram_draft_delivered",
  "outboxEventId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "contentJobId": "c13dfabe-4496-4993-905b-48ec228d5095",
  "versionNumber": 1,
  "recipientTelegramUserId": "800000001"
}
```

### Key Action Tags for Log Filtering:
- `telegram_unauthorized_access`: Unauthorized user attempted to interact with the bot.
- `telegram_rate_limited`: Inbound command throttled due to sliding window bucket limit.
- `ai_generation_succeeded` / `ai_generation_failed`: Generation attempt lifecycle.
- `factual_validation_completed`: Validation outcome with finding counts.
- `telegram_notification_failed`: Transient or terminal outbox delivery failure.

---

## 4. Routine Maintenance Procedures

### 4.1 Daily Maintenance
- Run `pnpm outbox:status` to ensure dead-letter backlog is 0.
- Run `pnpm queue:status` to ensure no attempts have been stuck in `RUNNING` state > 2 minutes.

### 4.2 Weekly Maintenance
- Run `pnpm backup:verify` to confirm full restoration capability.
- Clean expired rate limit buckets:
  ```sql
  DELETE FROM telegram_rate_limit_buckets 
  WHERE window_start < NOW() - INTERVAL '7 days';
  ```
- Clean expired action tokens:
  ```sql
  DELETE FROM telegram_action_tokens 
  WHERE expires_at < NOW() - INTERVAL '7 days';
  ```
