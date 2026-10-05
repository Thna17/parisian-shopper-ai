# Incident Response & Escalation Plan

**Document:** `/docs/incident-response.md`  
**Audience:** Site Reliability Engineers, DevOps, On-Call Engineers, Product Leads  
**Classification:** Operational Security & Reliability Protocol  

---

## 1. Incident Severity Classification

| Severity Level | Definition | Impact Examples | Response SLA | Target Resolution |
|---|---|---|---|---|
| **P1 — Critical** | Total outage or critical security / factual failure. | Telegram bot offline for all users; factual validator allows incorrect pricing; database unreachable. | **< 15 minutes** | **< 2 hours** |
| **P2 — Major** | Partial service degradation or queue blockage. | AI generation failing on specific models; outbox delivery backlog > 100 events; worker crash loops. | **< 30 minutes** | **< 4 hours** |
| **P3 — Moderate** | Non-blocking operational issue or degraded performance. | Individual user experiencing token expiration; rate limit threshold hit; transient 429 warnings. | **< 2 hours** | **< 24 hours** |
| **P4 — Minor** | Cosmetic issue, enhancement request, or minor bug. | Formatting alignment issue in Telegram message; minor typo in /help documentation. | **< 1 business day** | Next release |

---

## 2. Incident Response Workflow

```
[Alert Fired / User Report]
           │
           ▼
[Step 1: Triage & Classify Severity (P1-P4)]
           │
           ▼
[Step 2: Declare Incident & Open War Room (Slack / Telegram)]
           │
           ▼
[Step 3: Containment & Stabilization (Rollback, Fallback Model, Queue Reset)]
           │
           ▼
[Step 4: Root Cause Remediation]
           │
           ▼
[Step 5: Post-Mortem & Blameless Review (within 48 hours)]
```

---

## 3. Emergency Playbooks

### Playbook 1: Total Bot Unresponsiveness (P1)
1. **Check Process Status:**
   ```bash
   ps aux | grep -E "apps/api|apps/worker"
   ```
2. **Verify Database & Valkey Connectivity:**
   ```bash
   curl -I http://localhost:3000/api/health
   ```
3. **Check Telegram Webhook / Polling:**
   - If using polling: inspect logs for Telegram network disconnects (`Telegram network connection reset`).
   - If using webhook: verify SSL certificate validity on ingress domain and check reverse proxy logs.
4. **Restart Services:**
   ```bash
   pnpm start:api &
   pnpm start:worker &
   ```

### Playbook 2: AI Provider Outage or Massive Latency (P2)
1. **Inspect Generation Failures:**
   ```bash
   node scripts/queue-operations.mjs --failed
   ```
2. **Switch AI Provider:**
   - In `app/.env`: change `AI_PROVIDER=openai` to `AI_PROVIDER=gemini` (or vice versa).
   - Restart worker: `pnpm start:worker`.
3. **Drain / Retry Queue:**
   - Failed attempts will automatically re-attempt with the newly configured provider.

### Playbook 3: Outbox Delivery Jam / Telegram 429 Flood (P2)
1. **Inspect Backlog:**
   ```bash
   pnpm outbox:status
   ```
2. **Handle Telegram 429 Flood:**
   - Do NOT force retry immediately. Telegram rate limits are enforced per bot token (30 messages/sec globally, 1 message/sec per chat).
   - The dispatcher automatically respects `retry_after` headers. Allow the queue to drain naturally over 5 minutes.
3. **If Backlog is Stuck with Leases:**
   ```bash
   node scripts/outbox-operations.mjs --retry
   ```

---

## 4. Post-Mortem Template

Every P1 and P2 incident requires a blameless post-mortem document stored in `/docs/post-mortems/`:

```markdown
# Incident Post-Mortem: [TITLE]
- **Date & Duration:** YYYY-MM-DD (HH:MM to HH:MM UTC)
- **Severity:** P1 / P2
- **Lead Responder:** [Name]
- **Impact Summary:** [Number of users / jobs affected]

## Timeline (UTC)
- HH:MM — Event occurred / alert triggered
- HH:MM — Responder acknowledged incident
- HH:MM — Mitigation applied
- HH:MM — Full recovery verified

## Root Cause Analysis
[Detailed technical explanation of what failed and why]

## What Went Well / What Could Be Improved
- Well: ...
- Improved: ...

## Corrective Action Items
- [ ] Action item 1 (Owner, Due Date)
- [ ] Action item 2 (Owner, Due Date)
```
