# Production readiness audit and implementation prompts

Assessment: 2026-11-04. Scope is the current working tree, including uncommitted changes. This is a targeted code and configuration review, not proof that every feature or live workflow has been tested. Previous stage reports are historical claims and are not a substitute for fresh evidence. Do not deploy to production based on them.

## Decision and evidence

**Production: NO-GO pending implementation and verification.** Pilot readiness is also unverified for this worktree. Existing product areas include employee authentication and administration, products, campaigns, AI content, creative projects, approvals, publishing, analytics, brand and budget screens. Their existence does not establish that all flows work end to end.

Current checks: `pnpm typecheck` passed; `pnpm test:web` passed (150 tests); `pnpm build:web` passed with a large JavaScript bundle warning (921.92 kB before gzip). `pnpm test:e2e` failed (9 suites, 104 tests failed; 1 suite and test passed). A focused health test reproduced `TypeError: this.valkey.createDedicatedClient is not a function` during product catalog queue initialization. This points to a test/bootstrap dependency mismatch; its effect on production startup requires separate verification. The frontend tests primarily use mocked APIs, so they do not establish full-stack behavior.

Confirmed findings:

1. The API E2E suite fails during queue initialization as described above; the previously reported green suite does not apply to this worktree.
2. `app/docker-compose.staging.yml` gives PostgreSQL the default password `staging_secure_pass_2026` and database `parisian_shopper_staging`, but the API and worker default to `local_only_change_me` and `parisian_shopper`. An unconfigured fresh deployment will not connect. Existing volumes can mask this and PostgreSQL initialization variables do not reset existing credentials.
3. The same Compose file uses `NODE_ENV=development`, `DEMO_MODE=true`, fake AI providers, and disabled publishing. It is not evidence for a production configuration or real integrations.
4. `app/packages/ai-providers/src/budget-aware-text-provider.ts` and `app/packages/creative-providers/src/openai/budget-aware-creative-provider.ts` use fixed cost estimates and settlement values; their budget dependencies are optional, so the wrappers can call live providers without making a reservation. Ambiguous provider failures are cancelled, potentially releasing money for a request that was charged. These paths need review and tests before paid use.
5. A Meta gateway exists in the untracked `app/packages/publishing` package, but a repository search found no consumer of `MetaPublishingModule` or the `PUBLISHING_GATEWAY` token outside that package. Its presence alone is not evidence the existing publishing workflow dispatches through it.
6. The working tree contains many modified and untracked files, including new synchronization, provider-budget, publishing, brand and finance features. Previous test counts and approvals do not validate these changes. Preserve them while auditing.

External evidence remains needed for the actual production environment, migrations and restoration, security, employee acceptance, provider budgets, external publishing, live catalog data, and operational ownership. Exact launch requirements and enabled channels must be agreed with the business; Meta publishing is a blocker only if it is in launch scope.

## How to use these prompts

Run them sequentially in a coding agent with this repository open. Each prompt should inspect the present code before changing it, preserve unrelated changes, implement and test its scope, and report evidence and unresolved issues. Do not claim production readiness merely because a prompt is complete. Keep live publishing and paid calls disabled until their own gates are met. External credentials, DNS, spending and public posts require the appropriate owner and explicitly authorized action.

### Prompt 1 — Establish a reproducible baseline

> Audit the current worktree without discarding or overwriting uncommitted work. Inventory applications, services, all routes, API endpoints, integrations, feature flags, migrations and tests, and map each user-facing feature to backend implementation and tests. Record commit, dirty state, versions and exact commands. Run install verification with the lockfile, typecheck, lint, format check, builds, unit, frontend, API E2E, database integration, security audit and license checks as the environment permits. Record actual counts, skips, errors and prerequisites, without describing unrun checks as passed. Diagnose and fix current failures within this scope, keeping database or network actions safe and isolated. Create a traceable release-blocker register and update stale claims. Provide commands and evidence.

### Prompt 2 — Repair staging and deployment foundations

> Fix inconsistent database credentials and database names in `app/docker-compose.staging.yml` so a clean deployment works with explicit, validated configuration; avoid usable default production passwords. Check API and worker configuration parity, migrations, health/readiness, assets, networking and least privilege. Create a distinct production configuration that rejects demo mode, unsafe defaults and inappropriate mock or CLI providers, with secrets injected securely. Test a fresh isolated stack, migration, restart and recovery; do not destroy existing volumes. Document required variables and record proof. Do not provision production infrastructure without authorization.

### Prompt 3 — Secure identity and authorization across all flows

> Trace authentication, session lifecycle, onboarding, password management, employee deactivation, role changes, CSRF, CORS and authorization from each frontend action to every backend endpoint and worker. Verify object-level ownership, tenant/business boundaries where applicable, four-eyes approval, replay and race protections, audit trails and safe error handling. Fix concrete gaps with server-side enforcement and regression tests covering allowed and denied roles, stale sessions and concurrent changes. Review demo/test shortcuts for production bypasses. Document threats, residual risk and any independent security review still needed.

### Prompt 4 — Make paid AI budgets enforceable

> Audit all live text and image provider dispatches, especially both budget-aware wrappers. Require budget controls and durable reservations before every paid request; fail closed when controls are unavailable. Use versioned, configurable provider/model/modality pricing and conservative bounds based on actual request limits, including image options; treat uncertain billing and timeouts as unresolved holds pending reconciliation, not automatic free cancellations. Use stable idempotency keys, atomic concurrency-safe caps and durable settlement. Make fallback behavior explicit to users and policy-controlled. Test missing dependencies, parallel reservations, retries, provider timeouts, settlement failures, cost changes and reconciliation. Keep paid providers disabled until approved rates and limits are configured and validated.

### Prompt 5 — Verify product data and campaign integrity

> Trace catalog synchronization and product selection through campaign creation, text generation, creative rendering, review and publish. Verify authoritative API contract, authentication, pagination, idempotency, deletions, errors, freshness, currency, inventory, price and promotion snapshots. Reject stale, missing or changed material facts at appropriate transition points and surface actionable errors. Test full sync, partial failure, retries, duplicate jobs, source outages and product changes after approval. Use fixtures and an authorized sandbox; do not invent product facts or call a live service with unknown permissions.

### Prompt 6 — Finish the core content and creative workflow

> Exercise campaign creation, AI content generation, editing, factual validation, creative composition, Khmer/Latin typography, image handling, preview, revision, versioning, approval, rejection and multi-format export end to end. Verify permissions, accessibility, responsive layouts, error/loading/empty states, validation and stale concurrent edits. Fix functional gaps and add meaningful integration and browser tests against a real test backend. Validate asset provenance, font and image licensing, export quality and realistic Khmer content with qualified human review. Record remaining UAT requirements rather than claiming subjective quality is proven by tests.

### Prompt 7 — Complete and safely integrate publishing

> Determine the business-approved launch channels and trace existing publication creation, scheduling, approval, queueing, dispatch, history and reconciliation. Investigate whether `MetaPublishingModule` and `PUBLISHING_GATEWAY` are wired into the real workflow; integrate or remove unused code as appropriate. Ensure server-side approval and content-version/freshness checks immediately before dispatch, per-channel feature flags defaulting off, idempotency, safe retries, duplicate prevention, ambiguous timeout reconciliation and clear failure states. Test with provider simulators and private authorized test destinations only. Document external account permissions, token management and the precise manual release gate; do not send public posts.

### Prompt 8 — Harden background jobs, Telegram and recovery

> Review all queues, outbox dispatch, product sync and Telegram actions for transactional consistency, authorization, idempotency, retries, dead letters, poison messages, duplicate delivery, scheduling, timeouts, restart recovery and graceful shutdown. Test worker crashes at transaction and dispatch boundaries and webhook replay or invalid signatures/tokens. Add observability and operator recovery procedures for stuck jobs. Keep external messages in private test destinations and do not send messages without explicit authorization.

### Prompt 9 — Complete frontend and accessibility verification

> Inventory every route and user role, then exercise primary and failure paths using the running full stack. Verify data contracts, permission-specific navigation, responsive phone/tablet/desktop layout, keyboard operation, screen-reader labels, focus management, contrast, validation, loading and empty states, browser refresh and session expiry. Fix confirmed defects, including brand and budget screens, and add focused browser/accessibility regression tests. Capture representative screenshots and list browser/device combinations actually tested. Do not claim visual or language acceptance without real user review.

### Prompt 10 — Production operations and resilience

> Design and implement the deployment/runbook for the selected hosting environment: TLS, domain, secure secrets and rotation, managed database and queue, migration strategy, persistent creative assets, access control, retention, backups and restore, monitoring, alerts, logs without secrets, incident response, rollback and capacity limits. Test backup restoration including assets in an isolated environment and demonstrate recovery objectives; test dependency outages, health checks and graceful rollout. Specify owners and costs. Do not claim infrastructure is provisioned or restoration verified without evidence.

### Prompt 11 — Independent release verification and acceptance

> Re-run the complete release gates against the exact candidate commit and production-equivalent configuration, including all automated suites, dependency/security/license checks, migrations from clean and previous versions, isolated recovery, role-based end-to-end flows, accessibility and performance/load checks with agreed targets. Organize human pilot acceptance for each employee role, Khmer language and branding, plus privacy and licensing review. Maintain a dated blocker register with owner, severity, evidence and status. Issue separate GO/NO-GO decisions for pilot, internal production, paid AI and each external channel. Mark unavailable credentials, reviews and infrastructure as pending; no fabricated sign-offs or test results. Require explicit business authorization before enabling live spend or publishing.
