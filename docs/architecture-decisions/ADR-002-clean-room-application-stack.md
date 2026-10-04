# ADR-002: Select the clean-room application stack

- **Status:** ACCEPTED
- **Date:** 2026-10-04
- **Decision owners:** Parisian Shopper/Auralis management and engineering
- **Supersedes:** [ADR-001](ADR-001-open-source-foundation.md)
- **Scope:** Canonical MVP application foundation; no feature implementation is included in this decision

## Context

Management approved Option C: an independently designed Parisian Shopper application built from permissively licensed frameworks, libraries, SDKs, and infrastructure components. Postiz and every repository under `/research` may inform general concepts, workflow ideas, UX patterns, and engineering approaches, but their source is not an implementation input.

The product is a staff-facing Telegram workflow for generating Khmer and English marketing content from immutable Product API snapshots. It needs asynchronous AI work, deterministic fact validation, append-only revisions, exact-version approval, and an auditable history. The MVP stops at `APPROVED` and contains no publishing capability.

The team is expected to be small. Operational simplicity, explicit boundaries, testability, and company-controlled deployment matter more than independent scaling of individual modules.

## Decision

Build a **TypeScript modular monolith** with two runtime entry points from one codebase and one container image:

1. an HTTP/Telegram ingress process; and
2. a background worker process.

Both use the same domain and application modules. PostgreSQL is the system of record. BullMQ runs asynchronous jobs on Valkey, a permissively licensed Redis-protocol datastore. This is one application with separate process roles, not a microservice architecture.

The canonical choices are:

- NestJS on Node.js with strict TypeScript and the default Express adapter;
- PostgreSQL with Prisma ORM and tracked migrations;
- BullMQ with Valkey for queues, retries, and delayed work;
- grammY as the Telegram Bot API adapter;
- a project-owned `AITextProvider` port with an initial OpenAI adapter;
- Zod at untrusted-data and provider boundaries;
- REST APIs documented with OpenAPI through `@nestjs/swagger`;
- Pino structured JSON logging through a Nest `LoggerService` adapter;
- Jest, Supertest, and Testcontainers for unit, integration, contract, and acceptance-supporting tests;
- Docker Engine/Moby and Docker Compose for initial company-hosted deployment.

No social-publishing module, publishing credential, publishing queue, or automatic publishing route is part of the MVP.

## Options evaluated

| Area | Selected option | Alternatives considered | Decision rationale |
|---|---|---|---|
| Application framework | NestJS modular monolith | Bare Express/Fastify; separate services | Nest provides modules, dependency injection, validation hooks, testing conventions, and OpenAPI integration without requiring distributed services. |
| HTTP adapter | Express via Nest | Fastify | Express is mature and sufficient for a low-throughput staff tool. Fastify remains a reasonable later substitution if measured performance requires it. |
| Persistence | PostgreSQL + Prisma | Drizzle; TypeORM; raw SQL | Prisma gives a readable schema, generated types, migrations, and strong team ergonomics. Critical invariants still require database constraints and, where necessary, database privileges/triggers. |
| Job system | BullMQ + Valkey | BullMQ + current Redis; PostgreSQL polling; Temporal | BullMQ covers the MVP's retries, backoff, deduplication, and worker model. Valkey retains a permissive BSD license. Modern Redis releases do not meet the project's permissive-only dependency policy. Temporal is powerful but operationally excessive for this MVP. |
| Telegram adapter | grammY | Telegraf; raw HTTPS calls | grammY is TypeScript-first, MIT licensed, actively suited to Bot API middleware, and keeps transport concerns thin. Raw Bot API calls remain possible behind the same port. |
| AI integration | Thin project-owned provider port + official SDK adapter | Direct vendor calls throughout; general AI orchestration framework | A small port makes vendor replacement and local-AI adapters explicit while avoiding a large framework and hidden behavior. There is no silent provider fallback. |
| Runtime validation | Zod | JSON Schema/Ajv; class-validator | Zod provides concise TypeScript-aligned schemas for Product API and AI responses. OpenAPI DTOs may remain explicit where decorators are useful. |
| Tests | Jest + Supertest + Testcontainers | Vitest | Jest aligns with Nest's standard tooling and has mature integration support. Vitest is a valid MIT alternative if the team standardizes on it before code begins. |
| Logging | Pino | Winston | Pino supplies fast structured JSON and redaction. Application code logs through an internal abstraction so transport can change. |
| Deployment | Docker Engine/Moby + Compose | Kubernetes; serverless; Docker Desktop | Compose is understandable and adequate for initial company infrastructure. Kubernetes would add operational complexity without an MVP need. Docker Desktop has separate commercial terms and is not implied by this selection. |

## Major dependency license register

Licenses below are the upstream declared licenses reviewed for the named projects as of this ADR. Exact versions, checksums, transitive dependencies, and notices must be locked and re-audited when the project manifest is created. This is an engineering record, not legal advice.

| Package/project | Purpose | Declared license | Reason selected | Reasonable alternative |
|---|---|---|---|---|
| Node.js | Server runtime | MIT-style Node.js license plus bundled third-party notices | Stable TypeScript runtime and broad operational support | Deno (MIT) |
| TypeScript | Language and compiler | Apache-2.0 | Strict typing and excellent Node/Nest ecosystem | Java/Kotlin stack |
| pnpm | Package manager and lockfile | MIT | Deterministic, space-efficient installs and workspace support | npm (Artistic-2.0) |
| NestJS | Application framework | MIT | Modular boundaries, dependency injection, testing, and OpenAPI ecosystem | Fastify (MIT) with project-owned composition |
| Express | Nest HTTP adapter | MIT | Mature default with adequate MVP performance | Fastify (MIT) |
| PostgreSQL | Transactional database | PostgreSQL License | Strong constraints, transactions, JSONB where justified, and company-hosted operation | MariaDB (GPL-2.0; not preferred under this policy) |
| Prisma ORM | Schema, client, and migrations | Apache-2.0 | Type-safe access and approachable migrations | Drizzle ORM (Apache-2.0) |
| BullMQ | Background job queue | MIT | Retries, backoff, deterministic job IDs, worker concurrency, and operational visibility | Graphile Worker (MIT) |
| `@nestjs/bullmq` | Nest/BullMQ integration | MIT | Lifecycle and dependency-injection integration without hiding BullMQ | Direct BullMQ wiring (MIT) |
| Valkey | Redis-protocol queue datastore | BSD-3-Clause | Permissive license and operationally familiar data structures | PostgreSQL-backed Graphile Worker (MIT) |
| `@valkey/valkey-glide` | Valkey client for BullMQ adapter | Apache-2.0 | Official Valkey client and a documented BullMQ connection path | `ioredis` (MIT), after compatibility tests |
| grammY | Telegram Bot API client | MIT | TypeScript-first middleware, Bot API coverage, and thin adapter design | Telegraf (MIT) or raw Bot API HTTPS |
| OpenAI Node SDK | Initial AI-provider adapter | Apache-2.0 | Official supported client; isolated behind project-owned interfaces | Direct HTTPS adapter or another permissively licensed provider SDK |
| Zod | Runtime schema validation | MIT | TypeScript inference and strict parsing of untrusted input | Ajv (MIT) |
| `@nestjs/swagger` | OpenAPI document generation | MIT | Native Nest integration and reviewable REST contract | Hand-maintained OpenAPI plus validator tooling |
| Pino | Structured logging | MIT | JSON logs, performance, serializers, and secret redaction | Winston (MIT) |
| Jest | Unit/integration test runner | MIT | Nest ecosystem alignment and mature mocking | Vitest (MIT) |
| Supertest | HTTP integration testing | MIT | In-process REST tests with a familiar API | Undici-based test client (MIT) |
| Testcontainers for Node.js | Real PostgreSQL/Valkey integration tests | MIT | Reproducible integration and contract-test dependencies | Docker Compose test profile |
| decimal.js | Exact decimal parsing/comparison outside the database | MIT | Prevents binary floating-point changes to controlled money values | big.js (MIT) |
| Helmet | HTTP security headers | MIT | Sensible web/API response hardening | Explicit header middleware |
| `@nestjs/throttler` | Ingress rate controls | MIT | Nest guard integration for abuse protection | Reverse-proxy limits plus a project-owned guard |
| Moby/Docker Engine | OCI container build/runtime | Apache-2.0 | Common company-hosted deployment target | Podman (Apache-2.0) |
| Docker Compose | Initial multi-container orchestration | Apache-2.0 | Simple API/worker/PostgreSQL/Valkey operation | Podman Compose or systemd units |

### Verification references and time sensitivity

The register was checked against upstream license files/package metadata, including [NestJS](https://github.com/nestjs/nest/blob/master/LICENSE), [TypeScript](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt), [Prisma](https://github.com/prisma/prisma/blob/main/LICENSE), [BullMQ](https://github.com/taskforcesh/bullmq/blob/master/LICENSE), [Valkey](https://github.com/valkey-io/valkey/blob/unstable/COPYING), [Valkey GLIDE](https://github.com/valkey-io/valkey-glide/blob/main/LICENSE), [grammY](https://github.com/grammyjs/grammY/blob/main/LICENSE), [OpenAI Node SDK](https://github.com/openai/openai-node/blob/main/LICENSE), [Zod](https://github.com/colinhacks/zod/blob/main/LICENSE), [Pino](https://github.com/pinojs/pino/blob/main/LICENSE), [Jest](https://github.com/jestjs/jest/blob/main/LICENSE), [PostgreSQL](https://www.postgresql.org/about/licence/), and [Moby](https://github.com/moby/moby/blob/master/LICENSE). These branch links can change; Phase 1A must capture license files for the exact tags actually pinned.

Framework licensing does not establish security suitability. The exact NestJS version selected in Phase 1A must be checked against [current NestJS security advisories](https://github.com/nestjs/nest/security/advisories) and pinned to releases that remediate advisories applicable to the HTTP stack. The MVP does not enable Nest microservice transports merely because they are available.

### Redis licensing boundary

The architecture uses the Redis wire protocol but selects **Valkey**, not a current Redis server release. [Redis's official license table](https://redis.io/legal/licenses/) states that Redis through 7.2 used BSD-3-Clause, 7.4–7.8 use RSALv2/SSPLv1, and Redis 8+ adds an AGPLv3 option. The latter license sets are outside this project's permissive-only server dependency policy. An implementation manifest must not substitute a `redis` container tag for the pinned Valkey image without a new license review and ADR amendment.

### Container tooling boundary

Docker Engine/Moby and Compose are open-source projects under Apache-2.0. Docker Desktop is a separately licensed product. Developers or the company must confirm their entitlement before using Docker Desktop; Podman or a company-provided Linux Docker Engine is an acceptable alternative.

## Why this stack fits

- **Small team:** one language, one repository, one domain model, conventional modules, and a small infrastructure set reduce coordination and deployment cost.
- **Telegram workflows:** grammY handles transport details while Nest application services own identity, permissions, state changes, and idempotency.
- **AI generation:** asynchronous workers isolate latency and outages; the provider port prevents vendor calls from spreading through business logic.
- **Background jobs:** BullMQ supplies operational queue semantics while PostgreSQL remains authoritative for job and content state.
- **PostgreSQL:** transactions, constraints, row locks, and append-only controls support version and approval integrity.
- **Future Meta integrations:** official Meta API adapters can be added behind outbound ports in a later, separately approved publishing bounded context.
- **Maintainability:** explicit module dependencies and database-backed state avoid Telegram handlers, prompts, or queue payloads becoming the business model.
- **Company infrastructure:** OCI containers and Compose run on a conventional Linux host without a managed-platform dependency.
- **Future local AI:** another `AITextProvider` adapter can call a local inference service after schema, quality, security, and capacity testing.
- **Future admin web:** the same authenticated REST/OpenAPI application layer can serve a separately built dashboard without moving rules into the UI.

## Architecture and dependency rules

1. Domain modules may not import Telegram, OpenAI, Prisma, BullMQ, or HTTP framework types.
2. Application services depend on project-owned ports; infrastructure adapters implement them.
3. Transport adapters perform parsing and presentation only.
4. PostgreSQL is authoritative for domain state; Valkey/BullMQ data is disposable delivery state.
5. Queue messages contain identifiers and version metadata, not canonical product or content truth.
6. External payloads are schema-validated before entering application services.
7. No dynamic or transitive dependency may be introduced without license, security, and maintenance review.
8. Production dependency versions and images are pinned; lockfiles, migration files, notices, and an SBOM are retained.
9. Licenses in the approved set (MIT, BSD-2/3-Clause, Apache-2.0, ISC, PostgreSQL License, or equivalently permissive terms) may proceed after normal review. Copyleft, source-available, missing, custom, or ambiguous terms require a new decision before adoption.
10. Research repositories are not package or code dependencies and are excluded from build context and source provenance.

## Consequences

### Positive

- Company-specific code can remain private subject to the licenses of the chosen permissive components.
- The architecture is shaped around immutable facts, revisions, and approvals rather than retrofitted into a social scheduler.
- Provider and transport boundaries preserve future choices.
- A modular monolith can later split only where measured operational needs justify it.

### Costs and risks

- Social publishing, analytics, calendar, and media features must be designed independently in later phases.
- Prisma alone cannot guarantee every append-only rule; database privileges and/or triggers will be required and tested.
- BullMQ and PostgreSQL cannot share a transaction. A transactional outbox is required to avoid lost enqueue/notification events.
- Valkey client compatibility with the selected BullMQ version must be proven by integration and failure-recovery tests before production.
- Dependency licenses and terms can change; version pinning and recurring scans are necessary.

## Clean-room provenance rule

Requirements, public protocols, official API documentation, general patterns, and independently authored designs are valid inputs. Source code from Postiz, AGPL repositories, unlicensed repositories, or any `/research` checkout is not. Engineers must not perform line-by-line rewrites, mechanical translations, preserve unique restricted structures, or paste research snippets into tickets, prompts, tests, or application code. Any uncertain provenance stops review until resolved.

## Follow-up decisions

- The Product API owner must close the contract questions and provide sanitized fixtures before Phase 1B integration.
- Exact pinned dependency/image versions will be recorded in the implementation manifest during Phase 1A.
- Production hosting, backups, recovery targets, secret management, and observability destinations require an operations decision before deployment.
- Any future publishing bounded context requires a new ADR and explicit management authorization; it is not activated by this ADR.
