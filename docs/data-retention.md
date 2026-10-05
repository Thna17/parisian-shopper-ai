# Data Retention & Cleanup Policy

**Document:** `/docs/data-retention.md`  
**Audience:** Data Protection Officer, Database Administrators, Compliance  
**Compliance Standard:** Retail Auditability & Operational Hygiene  

---

## 1. Data Classification & Retention Matrix

The Parisian Shopper AI system enforces a strict distinction between **Permanent Audit Records** (governance, provenance, compliance) and **Ephemeral Operational State** (transport deduplication, short-lived tokens, rate limiting).

| Entity / Table | Category | Retention Period | Rationale / Compliance Requirement |
|---|---|:---:|---|
| `product_snapshots` | Permanent Audit | **Indefinite (Never deleted)** | Cryptographic record of catalogue facts at moment of generation. |
| `content_jobs` | Permanent Audit | **Indefinite (Never deleted)** | Core business workflow records. |
| `content_versions` | Permanent Audit | **Indefinite (Never deleted)** | Full version lineage and creative copy archive. |
| `generation_attempts` | Technical Audit | **180 Days** | Provider metadata, token usage, latency metrics. |
| `approval_events` | Legal Compliance | **Indefinite (Never deleted)** | Human sign-off record (who approved what and when). |
| `revision_requests` | Audit Lineage | **Indefinite (Never deleted)** | Editorial instructions and human-in-the-loop audit trail. |
| `validation_results` & `findings` | Regulatory Compliance | **Indefinite (Never deleted)** | Proof of factual grounding and compliance verification. |
| `outbox_events` | Operational Transport | **30 Days post-processing** | Retained to verify delivery before pruning. |
| `telegram_notification_deliveries`| Operational Transport | **30 Days** | Foreign key child of `outbox_events`. |
| `telegram_inbound_updates` | Idempotency Deduplication | **7 Days** | Prevents Telegram update replay. |
| `telegram_rate_limit_buckets` | Rate Limiting | **7 Days** | Sliding window rate limits. |
| `telegram_action_tokens` | Ephemeral Security | **7 Days post-expiry** | Short-lived single-use action tokens. |

---

## 2. Automated Cleanup Procedures

For operational tables, execute the following SQL routine during off-peak hours (e.g., via weekly cron):

```sql
-- 1. Prune processed outbox events older than 30 days
-- First delete child delivery records
DELETE FROM telegram_notification_deliveries
WHERE created_at < NOW() - INTERVAL '30 days';

-- Then delete parent outbox events
DELETE FROM outbox_events
WHERE processed_at IS NOT NULL
  AND processed_at < NOW() - INTERVAL '30 days';

-- 2. Prune old Telegram inbound updates (> 7 days)
DELETE FROM telegram_inbound_updates
WHERE created_at < NOW() - INTERVAL '7 days';

-- 3. Prune old rate limit buckets (> 7 days)
DELETE FROM telegram_rate_limit_buckets
WHERE window_start < NOW() - INTERVAL '7 days';

-- 4. Prune expired action tokens (> 7 days post-expiry)
DELETE FROM telegram_action_tokens
WHERE expires_at < NOW() - INTERVAL '7 days';
```

---

## 3. Data Privacy & Redaction Standards

- **Telegram Personal Identifiers:** Telegram User IDs (`BigInt`) are stored solely to authenticate authorized staff. No customer personal data is ingested or stored.
- **Data Erasure (GDPR / Staff Offboarding):** When a staff member leaves the organization, their `TelegramIdentity` is soft-disabled (`disabled_at = NOW()`), immediately revoking access while preserving the integrity of historical approval audit logs.
