# Release Verification & Deployment Checklist

**Document:** `/docs/release-checklist.md`  
**Audience:** Release Engineers, Tech Leads, DevOps  
**Version:** 0.1.0 (MVP Release)  

---

## 1. Automated Quality Gates Verification

Prior to any staging or pilot deployment, all 10 automated quality gates must pass without warnings:

```bash
# 1. Code Formatting
pnpm format:check

# 2. Static Analysis & Linting (Zero Warnings Permitted)
pnpm lint

# 3. Clean-Room Architectural Boundaries
pnpm boundaries:check

# 4. Strict TypeScript Typecheck
pnpm typecheck

# 5. Unit Test Suite (100% Pass)
pnpm test:unit

# 6. Integration Test Suite (Testcontainers PostgreSQL + Valkey)
pnpm test:integration

# 7. End-to-End API Test Suite
pnpm test:e2e

# 8. Dependency License Compliance
pnpm license:check

# 9. Security Audit
pnpm security:check

# 10. Monorepo Project Reference Build
pnpm build
```

---

## 2. Database Migration Deployment

1. **Verify Migration Status:**
   ```bash
   pnpm db:migrate:status
   ```
2. **Apply Migrations in Target Environment:**
   ```bash
   pnpm db:migrate:deploy
   ```
3. **Verify Seed Data (Roles, Brand Rules):**
   ```bash
   psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM roles;"
   psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM brand_rule_versions WHERE status = 'ACTIVE';"
   ```

---

## 3. Environment & Infrastructure Readiness

- [ ] Node.js version verified: `node -v` returns `v22.x`.
- [ ] Valkey/Redis instance responsive: `redis-cli ping` returns `PONG`.
- [ ] PostgreSQL connection pool configured (`connection_limit` tuned for API & Worker).
- [ ] Egress HTTPS connectivity to Telegram API (`api.telegram.org`) verified.
- [ ] Egress HTTPS connectivity to AI provider (`api.openai.com` / Google AI) verified.

---

## 4. Post-Deployment Smoke Test (5 Minutes)

1. **Health Endpoint:**  
   `curl -f http://localhost:3000/api/health` -> returns `{"status":"ok"}`.
2. **Telegram Bot Initialization:**  
   Send `/start` in Telegram -> bot responds with welcome menu.
3. **Operational Diagnostic:**  
   `pnpm outbox:status` -> returns 0 pending dead-letter events.  
   `pnpm queue:status` -> returns clean queue report.
4. **End-to-End Draft Test:**  
   Execute `/create FIC-PERF-001` -> select options -> verify V1 draft is delivered within 5 seconds with `✅ Facts checked` banner.

---

## 5. Rollback Procedure

If a critical P1 defect is identified post-deployment:
1. **Stop Worker and API:**
   ```bash
   kill -TERM $(pgrep -f "apps/api|apps/worker")
   ```
2. **Roll Back Code / Container Image:**
   Deploy previous stable commit / container tag.
3. **Database Migration Rollback (if necessary):**
   - Prisma migrations are designed to be strictly backward-compatible.
   - If emergency restore is required, follow `/docs/backup-and-restore.md`.
4. **Restart Services and Verify Smoke Test.**
