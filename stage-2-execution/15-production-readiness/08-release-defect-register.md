# STAGE 2 — PROMPT 15: DELIVERABLE 08
## RELEASE DEFECT REGISTER & REMEDIATION LOG

**Repository:** `https://github.com/Thna17/parisian-shopper-ai`  
**Classification Standards:**
- **P0 — Critical:** Security vulnerability, catastrophic data loss, unauthorized external broadcast, or unlimited financial exposure.
- **P1 — Release-Blocking:** Data integrity failure, broken authentication, or unmitigated financial risk that blocks general release.
- **P2 — Significant Operational:** Feature defect with an acceptable operational workaround.
- **P3 — Minor:** Cosmetic, styling, or documentation discrepancy.
**Assessment Date:** November 2, 2026  

---

### 1. Defect Summary Table

| Defect ID | Description | Severity | Module | Status | Release Impact |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **DEF-01** | Race condition in concurrent admin demotion/suspension leaving zero active admins | **P1** | Admin / DB | **REMEDIATED** | Resolved via PostgreSQL row locking (`SELECT FOR UPDATE`). |
| **DEF-02** | System setting allowed weakening Four-Eyes approval policies (`requireFourEyes: false`) | **P1** | Admin / Governance | **REMEDIATED** | Server-side invariant enforced (`SECURITY_POLICY_IMMUTABLE`). |
| **DEF-03** | Onboarding invitation token persisted in browser address bar and history | **P2** | Onboarding / Web | **REMEDIATED** | Stripped immediately on load with `window.history.replaceState`. |
| **DEF-04** | Fixed estimated AI reservation ($0.05/$0.10) lacks dynamic token pricing clamping | **P1** *(Paid AI)* | Analytics / AI | **MITIGATED / CONSTRAINED** | Paid AI kept disabled (`AI_MOCK_PROVIDERS=true`); safe for staging. |
| **DEF-05** | Missing `setup-after-env.cjs` causing E2E test teardown validation failure | **P2** | Testing / Infra | **REMEDIATED** | Recreated teardown script with `http.globalAgent.destroy()`. |
| **DEF-06** | Code formatting drift in demo seeding script (`seed-rich-geparlys-data.mjs`) | **P3** | Scripts | **REMEDIATED** | Re-formatted with Prettier; `format:check` passing clean. |

---

### 2. Comprehensive Defect Dossiers

#### DEF-01: Race Condition in Concurrent Administrator Demotion/Suspension
- **Affected Module:** `packages/database/src/admin/prisma-employee.repository.ts`, `UpdateEmployeeRolesUseCase`, `SuspendEmployeeUseCase`.
- **Severity:** P1 (High Integrity / Privilege Escalation Risk).
- **Reproduction:**
  Two administrators (Admin A and Admin B) issue simultaneous requests at the same millisecond to demote or suspend each other. Both use cases execute `countActiveAdmins()`, read 2 active admins, pass the check, and apply their respective updates. The system is left with zero active administrators, resulting in permanent administrative lockout.
- **Root Cause:**
  `countActiveAdmins()` was executed as an un-isolated read query outside the update transaction without locking the `roles` record for `ADMIN`.
- **Implemented Remediation:**
  Refactored `PrismaEmployeeRepository.updateRoles` and `PrismaEmployeeRepository.suspend` to run within a transaction that acquires an exclusive row-level lock on the `ADMIN` role:
  ```typescript
  await tx.$queryRaw`SELECT id FROM roles WHERE code = 'ADMIN' FOR UPDATE`;
  ```
  The active admin count is re-evaluated inside this locked transaction. If active admins $\le 1$, the transaction rolls back immediately and throws `LastActiveAdminError`.
- **Verification:** Unit tests `ADMIN-13` and `ADMIN-14` in `admin-security.spec.ts` pass cleanly.
- **Resolution Status:** **REMEDIATED**.

---

#### DEF-02: System Settings Allowed Disabling Mandatory Four-Eyes Policies
- **Affected Module:** `packages/application/src/modules/admin/application/use-cases/update-system-settings.use-case.ts`, `OrganizationSettingsPage.tsx`.
- **Severity:** P1 (Security Policy Invariant Bypass).
- **Reproduction:**
  An administrator sends a `PATCH /v1/admin/settings` payload with `key: "WORKFLOW_POLICIES"` and `value: { requireFourEyesContent: false, requireFourEyesCreative: false }`.
- **Root Cause:**
  Prompt 14 added a flexible JSON key-value store without restricting mutation of core security invariants.
- **Implemented Remediation:**
  1. Updated `UpdateSystemSettingsUseCase` to inspect `request.key === 'WORKFLOW_POLICIES'`. If either `requireFourEyesContent` or `requireFourEyesCreative` is explicitly set to `false`, the use case throws `ApplicationError({ code: 'SECURITY_POLICY_IMMUTABLE' })` (HTTP 403 Forbidden).
  2. Forced `requireFourEyesContent: true` and `requireFourEyesCreative: true` into the persisted setting record on upsert.
  3. Disabled the checkboxes in `OrganizationSettingsPage.tsx` with an "Enforced Invariant" visual badge.
- **Verification:** Unit tests `ADMIN-21` and `ADMIN-22` added to `admin-security.spec.ts`, passing with exit code 0.
- **Resolution Status:** **REMEDIATED**.

---

#### DEF-03: Onboarding Token Retention in Browser URL Bar & Navigation History
- **Affected Module:** `apps/web/src/features/admin/pages/OnboardingClaimPage.tsx`.
- **Severity:** P2 (Credential Exposure Risk).
- **Reproduction:**
  An employee visits `https://app.parisianshopper.com/onboarding?token=a1b2c3d4...`. The query parameter remains in the browser address bar throughout password creation, exposing the single-use token in browser history and potential `Referer` headers.
- **Root Cause:**
  `useSearchParams` read the token into React state without sanitizing the browser window URL.
- **Implemented Remediation:**
  Added `window.history.replaceState({}, document.title, window.location.pathname)` immediately upon loading the query parameter into component state.
- **Verification:** Frontend test suite passing (131/131 tests green).
- **Resolution Status:** **REMEDIATED**.

---

#### DEF-04: Fixed Estimated Cost Reservation Lacks Dynamic Token Clamping
- **Affected Module:** `packages/application/src/modules/content/application/generate-content.use-case.ts`, `generate-creative.use-case.ts`.
- **Severity:** P1 for Live Paid Upstream AI / P3 for Staging Pilot.
- **Root Cause:**
  Pre-generation budget reservations use fixed example costs (`$0.05` for text, `$0.10` for creative) rather than calculating `(maxInputTokens * rate + maxOutputTokens * rate)` against live model pricing tables.
- **Operational Mitigation:**
  Paid upstream AI execution remains disabled by configuration (`AI_MOCK_PROVIDERS=true` / `PAID_AI_DISABLED=true`). Deterministic local runners (`codex-cli`) and mock providers are utilized, which cost \$0.00.
- **Resolution Status:** **MITIGATED & CONSTRAINED FOR PILOT**. (A blocker for unmetered live paid AI until dynamic pricing tables are wired).
