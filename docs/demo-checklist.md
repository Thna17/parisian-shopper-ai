# Demo Readiness Checklist

**Document:** `/docs/demo-checklist.md`  
**Purpose:** Pre-flight checklist to ensure flawless execution of management demonstrations.  
**Lead Time:** Execute 30 minutes prior to demo start.  

---

## 1. Environment & Configuration Checklist

- [ ] **`DEMO_MODE` Flag:** Verify `DEMO_MODE=true` in `app/.env` (ensures `[DEMO]` prefix is active).
- [ ] **AI Provider:** Verify `AI_PROVIDER` is set to `openai` (with valid `OPENAI_API_KEY`) or `deterministic-fixture` if conducting an offline test.
- [ ] **Telegram Mode:** Verify `TELEGRAM_MODE=polling` (for local/staging dev) or `webhook` with valid HTTPS endpoint.
- [ ] **Database Connection:** Verify PostgreSQL connectivity via `pnpm db:migrate:status`.
- [ ] **Valkey Connection:** Verify Valkey/Redis cache and BullMQ broker connectivity.

---

## 2. Data & Fixtures Checklist

- [ ] **Fictional Catalog Verification:** Ensure the 3 standard demo fixtures are available:
  - `FIC-PERF-001`: Moonlit River Eau de Parfum (\$38.00 USD, Bergamot, Pear, Jasmine).
  - `FIC-WATCH-001`: North Clock Automatic Watch (\$185.00 USD, 40mm).
  - `FIC-COS-001`: Cloud Petal Lip Tint (\$12.50 USD, 25% off promo \$9.50 USD).
- [ ] **Brand Rules Version:** Verify an active `BrandRuleVersion` exists in the database:
  ```sql
  SELECT id, version, status, name FROM brand_rule_versions WHERE status = 'ACTIVE';
  ```
- [ ] **Presenter Identity Enrollment:** Verify presenter's numeric Telegram User ID is enrolled with `MARKETING_APPROVER` role:
  ```sql
  SELECT u.display_name, ti.telegram_user_id, r.code 
  FROM users u
  JOIN telegram_identities ti ON ti.user_id = u.id
  JOIN user_roles ur ON ur.user_id = u.id
  JOIN roles r ON r.id = ur.role_id
  WHERE ti.telegram_user_id = <PRESENTER_TELEGRAM_ID>;
  ```

---

## 3. Operational Health Checks

- [ ] **Run Outbox Diagnostic:**
  ```bash
  pnpm outbox:status
  ```
  *Ensure pending backlog is 0 and no dead-letter events exist.*
- [ ] **Run Queue Diagnostic:**
  ```bash
  pnpm queue:status
  ```
  *Ensure 0 stuck jobs and workers are healthy.*
- [ ] **Dry-Run Telegram Bot Interaction:**
  - Send `/start` in Telegram. Bot must respond with greeting and available commands.
  - Send `/status`. Bot must respond without errors.

---

## 4. Live Contingency Plan

| Issue During Demo | Root Cause | Immediate Action |
|---|---|---|
| **Bot fails to respond to command** | Polling loop crashed or rate limited | Restart API process (`pnpm dev:api`). Resend command. |
| **Draft generation takes > 10s** | LLM API latency spike | Say: *"Our worker is polling the AI provider with automatic timeout..."* If needed, run `pnpm queue:status`. |
| **"Access Denied" message** | Telegram ID mismatch | Use backup test account or enroll Telegram ID via SQL script in 10 seconds. |
| **Accidental click error** | Action token expired (> 15 mins) | Run `/status`, select the job, and click the fresh action button. |
