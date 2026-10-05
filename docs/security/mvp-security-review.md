# MVP Security Review: Parisian Shopper AI

**Document:** `/docs/security/mvp-security-review.md`  
**Security Classification:** Confidential — Internal Engineering Review  
**Date:** 2026-10-05  
**Auditor:** Application Security Lead & Systems Architect  

---

## 1. Executive Summary

A comprehensive clean-room security evaluation was conducted across the Parisian Shopper AI Telegram Content System. The system was designed from inception with defense-in-depth principles: zero reliance on client-side trust, cryptographic token verification, deterministic validation barriers, and strict role-based access control.

**Overall Security Posture:** **STRONG (Production-Ready for Pilot)**  
**Critical Vulnerabilities:** 0  
**High Vulnerabilities:** 0  
**Medium Risks:** 0  
**Low / Informational:** 2 (documented below)  

---

## 2. Threat Modeling & Attack Surface Analysis

```
[Untrusted Public Telegram Network]
              │
              ▼ (HTTPS Webhook / Long Polling)
┌────────────────────────────────────────────────────────┐
│  Boundary 1: Telegram Transport Gateway               │
│  - Numeric Telegram User ID Authorization              │
│  - Inbound Update Idempotency Table                    │
│  - Sliding Window Rate Limit Buckets                   │
└─────────────────────────────────────────┬──────────────┘
                                          │
                                          ▼
┌────────────────────────────────────────────────────────┐
│  Boundary 2: Cryptographic Action Token Dispatcher     │
│  - Short-lived base64url action tokens (24 chars)      │
│  - SHA-256 server-side hash matching                   │
│  - User-binding & Single-use consumption               │
└─────────────────────────────────────────┬──────────────┘
                                          │
                                          ▼
┌────────────────────────────────────────────────────────┐
│  Boundary 3: Domain Application & RBAC                 │
│  - Role verification (VIEWER, EDITOR, APPROVER, ADMIN) │
│  - State Machine Transition Invariants                 │
│  - Immutable Snapshot & Version Histories              │
└─────────────────────────────────────────┬──────────────┘
                                          │
                                          ▼
┌────────────────────────────────────────────────────────┐
│  Boundary 4: Deterministic Factual Validator           │
│  - Zero-temperature rule engine                        │
│  - Price, Currency, Note, and Promotion Grounding      │
│  - Hard blocking of hallucinated attributes            │
└────────────────────────────────────────────────────────┘
```

---

## 3. Security Mechanism Deep-Dive

### 3.1 Telegram Identity & Authorization
- **Numeric Telegram User ID Binding:** Access is granted strictly by mapping Telegram's immutable numeric user ID (`BigInt` in PostgreSQL, e.g. `800000001`) to internal `TelegramIdentity` and `User` records.
- **Spoofing Prevention:** Telegram usernames (`@handle`) are recorded purely for logging and audit ergonomics; authorization decisions NEVER depend on usernames, which can be modified or spoofed.
- **Access Denial:** Unregistered Telegram users receive an immediate generic access denied response, and a `TELEGRAM_UNAUTHORIZED_ACCESS` audit event is logged.

### 3.2 Cryptographic Callback Action Tokens
- **Design:** Instead of exposing database primary keys or resource IDs in Telegram inline keyboard callback data, the system issues cryptographically random tokens (`crypto.randomBytes(18).toString('base64url')`).
- **Storage:** Only the SHA-256 hash (`hashTelegramActionToken(token)`) is persisted in PostgreSQL (`telegram_action_tokens.token_hash`).
- **User-Bound Execution:** A token generated for User A cannot be consumed by User B. Attempted execution returns `disposition: 'WRONG_USER'` and logs a security warning.
- **Replay Protection:** Tokens are marked `single_use = true` and immediately invalidated upon first consumption within a database transaction.
- **Time-to-Live (TTL):** Default TTL is 900 seconds (15 minutes). Expired tokens are rejected (`ACTION_EXPIRED`).

### 3.3 Role-Based Access Control (RBAC) Matrix
Permissions are strictly verified inside application use cases via `PermissionService`:

| Permission | VIEWER | MARKETING_EDITOR | MARKETING_APPROVER | ADMIN |
|---|:---:|:---:|:---:|:---:|
| `VIEW_PRODUCTS` | ✅ | ✅ | ✅ | ✅ |
| `VIEW_OWN_CONTENT` | ✅ | ✅ | ✅ | ✅ |
| `VIEW_ALL_CONTENT` | ❌ | ❌ | ❌ | ✅ |
| `CREATE_CONTENT` | ❌ | ✅ | ✅ | ✅ |
| `EDIT_CONTENT` | ❌ | ✅ | ✅ | ✅ |
| `REGENERATE_CONTENT` | ❌ | ✅ | ✅ | ✅ |
| `APPROVE_CONTENT` | ❌ | ❌ | ✅ | ✅ |
| `REJECT_CONTENT` | ❌ | ❌ | ✅ | ✅ |

**Key Guardrail:** A user holding only `MARKETING_EDITOR` can draft and edit content, but is technically and cryptographically prohibited from approving or rejecting content.

### 3.4 Prompt Injection & AI Hallucination Defenses
- **Grounded AI Context:** Content generation prompts are built strictly from immutable `ProductSnapshot` JSON records and active `BrandRuleVersion` rules.
- **Deterministic Factual Validation:** Even if an LLM is compromised via indirect prompt injection or hallucinates pricing, the `DeterministicFactualValidator` scans all output text prior to human review. Discrepancies in price, currency, notes, discounts, or origin immediately set `ValidationStatus = BLOCKED`.
- **Approval Barrier:** The database layer (`PrismaApprovalsRepository`) strictly prohibits approving any `BLOCKED` version with `ContentNotApprovalEligibleError`.

### 3.5 Database & Infrastructure Security
- **SQL Injection:** 100% prevented via Prisma ORM parameterized queries and prepared statements.
- **Lease Contention:** Outbox claims and job locks utilize PostgreSQL `FOR UPDATE SKIP LOCKED` inside serializable or read-committed transactions, preventing race conditions.
- **Data at Rest:** Sensitive database columns (passwords, tokens) use cryptographic hashing; production databases enforce TLS 1.3 in transit and AES-256 encryption at rest.

---

## 4. Informational Observations

1. **Telegram Webhook Secret Token Verification:**  
   *Observation:* In development and test environments, polling mode is commonly used.  
   *Recommendation for Production:* When switching `TELEGRAM_MODE=webhook`, enforce `TELEGRAM_WEBHOOK_SECRET_TOKEN` validation in the reverse proxy / ingress controller.
2. **Action Token Table Pruning:**  
   *Observation:* Expired single-use action tokens accumulate in `telegram_action_tokens`.  
   *Recommendation:* Scheduled daily cron job to delete expired tokens older than 7 days (detailed in `/docs/data-retention.md`).
