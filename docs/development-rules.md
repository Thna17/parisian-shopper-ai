# Development rules

**Applies to:** all Parisian Shopper application, migrations, tests, deployment files, prompts, and operational tooling

These rules enforce the accepted clean-room architecture. Exceptions require a documented review; changes to an architectural invariant require a new or superseding ADR.

## Clean-room and licensing

1. Implement from Parisian Shopper requirements, accepted ADRs, public protocols, and official documentation.
2. Do not copy, mechanically translate, line-by-line rewrite, or preserve unique implementation structure from Postiz or any `/research` repository.
3. `/research` is excluded from package resolution, build contexts, containers, test fixtures, prompts used to generate code, and source commits for the application.
4. Add a dependency only after recording its declared license, purpose, maintenance/security posture, and exact pinned version. MIT, BSD-2/3-Clause, Apache-2.0, ISC, PostgreSQL License, and equivalently permissive terms are the default allowlist.
5. Copyleft, source-available, custom, missing, or ambiguous licenses require a new explicit decision before use. Transitive dependencies and container base images count.
6. Commit the package-manager lockfile, dependency notices where required, migration files, and an SBOM in release artifacts. Run automated license and vulnerability checks in CI.

## Language, structure, and boundaries

1. TypeScript strict mode is mandatory. Do not use unbounded `any`; `unknown` external input must be parsed before use.
2. Follow the modular-monolith dependency rules in `system-architecture.md`. Domain code imports no Nest, Prisma, grammY, BullMQ, or vendor SDK types.
3. External systems are behind project-owned interfaces: Product API, AI text/image providers, Telegram transport, queue, clock, and future social providers.
4. Telegram handlers and REST controllers parse/authenticate/present only. They do not implement state transitions, authorization policy, prompts, validation, or persistence.
5. Avoid circular dependencies. Enforce module import direction with architecture tests/lint rules.
6. Do not add a service, table, queue, abstraction, or JSON field without a named responsibility and lifecycle.

## Facts, AI, and content

1. The Product API/database is the sole factual source of truth. Development uses fictional fixtures; no production Product API is used during early phases.
2. A generation uses an immutable `ProductSnapshot`. Later source changes create a new snapshot/workflow; they never mutate reviewed evidence.
3. AI cannot update canonical product facts or create promotion, price, discount, stock, origin, fragrance, concentration, size, or similarity values.
4. No silent AI fallback is permitted. Provider/model choice is explicit, logged, and visible on failure; a different provider requires deliberate configuration and contract qualification.
5. Context has separate system, brand, strategy, product-data, and reviewer-instruction sections. Product/reviewer text is untrusted data and cannot override protected rules.
6. All provider output is strict-schema parsed, size-bounded, and deterministically fact-validated. AI self-reported `facts_used` is evidence only.
7. A version with a failed `BLOCKING` validation cannot be approved through any interface, administrative route, or retry.

## State, history, and database

1. State transitions are explicit, centralized, allowlisted, and transactionally compare the expected current state/lock version. Direct state assignment outside the transition service is prohibited.
2. Content revisions are append-only. V1 is never overwritten by V2. Version allocation uses a database constraint and concurrency control.
3. Approval/rejection/revision events and validation evidence are append-only, actor-attributed, timestamped, and reference an exact content version.
4. The runtime database role cannot update/delete evidence tables. Database constraints and privileges are tested with real PostgreSQL.
5. Migrations are tracked, reviewed, forward-tested, and restore/rollback strategy is documented. Never edit a migration that has been applied to a shared environment.
6. Use timezone-aware UTC timestamps; render locale/timezone at the boundary. Use exact database decimals/decimal library for money, never JavaScript binary floating point.
7. Do not store everything in JSON. Identifiers, money, state, joins, timestamps, protected searchable facts, and constraints use typed columns. JSONB needs a versioned schema and justification.
8. Normal application deletion is soft disable for identities/configuration where appropriate; content, snapshots, approvals, and audit evidence are not soft-deleted.

## Telegram and asynchronous work

1. Authenticate Telegram users by numeric Telegram user ID mapped to an active internal user. Usernames are display metadata only.
2. Persist and deduplicate Telegram `update_id`. Callback payloads use opaque, expiring, single-use tokens bound to actor/action/job/version; never trust state encoded by the client.
3. Telegram handling, application requests, outbox delivery, BullMQ jobs, and worker attempts are idempotent at their own boundaries.
4. PostgreSQL is authoritative. Queue payloads contain identifiers/schema metadata, not canonical truth. Use a transactional outbox for database-to-queue and database-to-notification delivery.
5. Retries are bounded and classify transient versus permanent failures. Use timeouts and exponential backoff with jitter. No infinite retries or silent failure.
6. Worker restart, duplicate delivery, and transaction failure must not create duplicate content versions, approvals, or avoidable provider cost.

## Security and secrets

1. No secrets, real customer data, production tokens, `.env` contents, or signed production URLs are committed. Commit an example environment file with names and safe descriptions only during implementation.
2. Use a secret manager or deployment environment. Validate required configuration at startup without logging values.
3. Structured logs are mandatory. Log allowlisted IDs, states, durations, result codes, and correlation IDs; redact authorization headers, API keys, callback tokens, raw prompts/responses, and sensitive catalog payloads.
4. Apply least privilege to database, Product API, network, filesystem, and cloud/provider credentials. Production database and Valkey are not public.
5. Validate all boundary input with strict schemas and size limits. Permit raw SQL only when parameterized, isolated, reviewed, and tested.
6. Server-side URL fetching is denied by default. Any later media fetch uses HTTPS/host allowlists, private-address and redirect defenses, and size/type/time limits.
7. Follow `security/threat-model.md`; new trust boundaries require a threat-model update before implementation.

## Testing and quality gates

1. Unit-test domain rules, transitions, authorization, validation, prompt/context composition, formatting, and idempotency decisions.
2. Integration-test persistence, migrations, constraints, append-only privileges, transactions, outbox, and queue behavior against real PostgreSQL/Valkey containers.
3. Contract-test Product API and AI adapters with fictional fixtures, including malformed, timeout, versioning, and injection cases.
4. Run acceptance tests in `testing/mvp-acceptance-test-plan.md`, including concurrency and stale-version approval tests.
5. Tests do not make live billable AI calls by default. Any explicit provider smoke test is isolated, budget-capped, secret-safe, and never an acceptance-test dependency.
6. A change that affects protected facts, approval, authentication, state transitions, or append-only history requires negative and concurrency tests.

## Deployment and feature flags

1. Use pinned OCI images and tracked Docker Compose configuration initially. Development and production configuration differ by values, not code branches.
2. Environment feature flags are typed, documented, validated at startup, default-safe, and audited when security-relevant. Flags do not replace authorization or remove server-side safety boundaries.
3. There is no publishing in the MVP: no publishing module, API route, state transition, queue, provider SDK, credential, or egress authorization. `APPROVED` is terminal.
4. Future local AI, image generation, admin UI, Meta publishing, scheduling, or analytics starts only after its phase/ADR, threat model, licensing, and acceptance criteria are approved.
5. Health endpoints reveal no secrets. Readiness checks dependencies without generating AI content or fetching production catalog records.

## Review checklist

Every pull request must answer, where relevant:

- Does this preserve factual source, immutable snapshot/version, and exact approval evidence?
- Is every external input strictly parsed and every output safe to log/render?
- Is the operation authorized, idempotent, transactional, and concurrency-safe?
- Are failures explicit, bounded, recoverable, and covered by tests?
- Does it add a dependency/license, secret, egress target, trust boundary, table, queue, or state transition that needs review?
- Can the same result be achieved without introducing a publication path or research-code provenance risk?
