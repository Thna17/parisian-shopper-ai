# Parisian Shopper application foundation

This directory contains the clean-room modular-monolith foundation, Phase 1B's fictional Product Source/immutable ProductSnapshot boundary, and Phase 1C's provider-neutral asynchronous content-generation pipeline. It deliberately contains no Telegram commands, production Product API adapter, factual validation, approvals, publishing, Meta integration, or image generation.

## Requirements

- Node.js `22.22.2` (pinned in `.nvmrc`)
- pnpm `9.15.1` (pinned in `packageManager`)
- Docker Engine/Moby or compatible OCI runtime with Docker Compose

Docker Desktop is separately licensed; confirm company entitlement or use a Linux Docker Engine/Podman-compatible workflow.

## Workspace

```text
app/
  apps/
    api/          HTTP, health, OpenAPI, request security/error handling
    worker/       non-HTTP background-process entrypoint
  packages/
    application/ domain/application modules, product source, and content-generation ports
    ai-providers/ optional OpenAI infrastructure adapter and provider composition
    common/       framework-free errors, domain primitives, application ports
    config/       Zod environment validation and feature flags
    database/     Prisma, PostgreSQL health, migration and outbox transaction adapter
    jobs/         Valkey connection and BullMQ queue/worker registries
    logger/       Pino, redaction and request correlation
  scripts/        boundary and dependency-license policy checks
```

The applications are separate process roles from one codebase, not microservices.

## First-time setup

```bash
cd app
corepack enable
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm dev
```

The example credentials are fictional local-only values. Change them for any shared environment. Compose binds PostgreSQL and Valkey to `127.0.0.1`; it does not deploy application containers.

API defaults to `http://127.0.0.1:3000`. Infrastructure endpoints are:

- `GET /health/live` — process liveness only;
- `GET /health/ready` — PostgreSQL and Valkey readiness;
- `GET /health` — readiness alias;
- `/docs` — OpenAPI UI only when `APP_SWAGGER_ENABLED=true`.

All optional integration flags default to false. Local startup needs no Telegram, OpenAI, Product API, Meta, or publishing credential. `FEATURE_AUTO_PUBLISHING=true` and `FEATURE_META_PUBLISHING=true` are rejected at startup in this MVP foundation.

To exercise Phase 1C locally with fictional content, set `FEATURE_AI_TEXT_GENERATION=true` and `AI_PROVIDER=fake`. This enables the `content-generation` queue without external AI calls. It does not expose a public generation endpoint. OpenAI is opt-in with `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and an explicitly selected `OPENAI_MODEL`; automated tests never call it.

## Commands

```bash
pnpm dev                 # API and worker
pnpm dev:api
pnpm dev:worker

pnpm db:generate
pnpm db:migrate          # development migration workflow
pnpm db:migrate:deploy   # apply tracked migrations
pnpm db:migrate:status
pnpm db:studio
pnpm prisma:format
pnpm prisma:validate

pnpm test
pnpm test:unit
pnpm test:integration    # starts real PostgreSQL and Valkey containers
pnpm test:e2e

pnpm format:check
pnpm lint
pnpm boundaries
pnpm boundaries:check
pnpm typecheck
pnpm build
pnpm license:check
pnpm security:audit
pnpm security:check
```

Tests never contact OpenAI, Telegram, the Parisian Shopper Product API, or Meta. Integration tests use fictional data and disposable Testcontainers.

## Safe operational behavior

- PostgreSQL and Valkey are required infrastructure; readiness fails without them.
- Startup logs feature status but never credential values or `DATABASE_URL`.
- Production logs are JSON. Pretty logs are development-only and opt-in.
- CORS is disabled when no origins are configured and wildcard origin is rejected in production.
- The worker has no public HTTP server.
- The business queue is registered only when AI text generation is enabled. Queue messages carry only a content-job ID; PostgreSQL remains authoritative.
- Development/test select eight fictional products while `FEATURE_PRODUCT_API=false`. Production selects a disabled source and never falls back to fixtures. No product HTTP endpoint is exposed.
- Do not point early development at production Product API or provider accounts.

See the repository `docs/` directory for boundaries, database, jobs, outbox, errors, security, and dependency-license policy.
