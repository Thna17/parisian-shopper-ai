# Database Backup & Disaster Recovery Guide

**Document:** `/docs/backup-and-restore.md`  
**Audience:** Platform Engineers, Database Administrators, DevOps  
**System:** PostgreSQL 17 (Prisma ORM)  

---

## 1. Objectives & Targets

| Metric | Target | Rationale |
|---|---|---|
| **Recovery Point Objective (RPO)** | **< 1 hour** (Pilot) / **< 5 minutes** (Prod) | Periodic automated snapshots + WAL archiving. In Pilot, hourly dumps suffice. |
| **Recovery Time Objective (RTO)** | **< 15 minutes** | Automated restoration scripting with pre-tested containers or target instances. |
| **Data Integrity Standard** | **100% relational & checksum match** | All entities, foreign keys, outbox states, and JSON payloads must match post-restore. |

---

## 2. Automated Verification Pipeline (`pnpm backup:verify`)

The system includes an automated end-to-end backup and restore test suite (`scripts/verify-backup-restore.mjs`). This script uses Testcontainers to spin up a clean PostgreSQL instance, applies migrations, seeds baseline entities, executes `pg_dump`, provisions a fresh target database, executes `psql` restore, and verifies table-by-table record counts and exact cryptographic hashes.

### Running the Verification:
```bash
# From app directory:
pnpm backup:verify

# Or directly:
node scripts/verify-backup-restore.mjs
```

**What is verified automatically:**
- Schema structure and constraints (`_prisma_migrations`, enum types, table definitions).
- Core entities: `users`, `roles`, `user_roles`, `telegram_identities`, `brand_rule_versions`.
- Content entities: `product_snapshots`, `content_jobs`, `content_versions`, `generation_attempts`.
- Governance entities: `validation_results`, `validation_findings`, `approval_events`, `revision_requests`.
- Operational entities: `outbox_events`, `telegram_action_tokens`, `telegram_rate_limit_buckets`.

---

## 3. Production Backup Procedure

### 3.1 Taking a Full Database Dump
Use standard custom-format or plain-text PostgreSQL dumps:
```bash
# Format 1: Compressed Directory / Custom Archive (Recommended for large datasets)
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="/var/backups/parisian-shopper-$(date +%Y%m%d_%H%M%S).dump"

# Format 2: SQL Script (Human-readable, portable)
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --format=plain \
  --no-owner \
  --no-privileges \
  --file="/var/backups/parisian-shopper-$(date +%Y%m%d_%H%M%S).sql"
```

### 3.2 Backup Storage & Retention Policy
- **Storage:** Offsite S3-compatible encrypted bucket with versioning and immutable object locking (WORM).
- **Retention Schedule:**
  - Hourly snapshots: Retained for 48 hours.
  - Daily snapshots: Retained for 30 days.
  - Monthly archives: Retained for 12 months.

---

## 4. Production Restore Procedure

### Step 1: Prepare Clean Target Database
```bash
# Terminate existing connections (if restoring over existing database)
psql "$ADMIN_DB_URL" -c "
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = 'parisian_shopper' AND pid <> pg_backend_pid();"

# Drop and recreate database
psql "$ADMIN_DB_URL" -c "DROP DATABASE IF EXISTS parisian_shopper;"
psql "$ADMIN_DB_URL" -c "CREATE DATABASE parisian_shopper OWNER parisian_app;"
```

### Step 2: Restore from Backup
```bash
# For custom-format archive (.dump):
pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d parisian_shopper \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  /var/backups/parisian-shopper-YYYYMMDD_HHMMSS.dump

# For plain-text archive (.sql):
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d parisian_shopper \
  --file=/var/backups/parisian-shopper-YYYYMMDD_HHMMSS.sql
```

### Step 3: Verify Post-Restore Integrity
Run migration status to verify schema parity:
```bash
pnpm --filter @parisian-shopper/database prisma:migrate:status
```
Inspect table row counts:
```sql
SELECT relname AS table_name, n_live_tup AS row_count
FROM pg_stat_user_tables
ORDER BY row_count DESC;
```

### Step 4: Resume Applications
1. Start worker services (`pnpm start:worker`).
2. Start API services (`pnpm start:api`).
3. Run `pnpm queue:status` and `pnpm outbox:status` to ensure no stale leases or orphaned jobs exist.
