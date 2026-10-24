# Parisian Shopper application foundation

This directory contains the clean-room modular monolith through Phase 1E: the foundation, fictional Product Source and immutable snapshots, provider-neutral AI generation, deterministic validation, and a secure grammY staff draft workflow. It deliberately contains no production Product API adapter, approval/reject behavior, publishing, Meta integration, scheduling, analytics, or image generation.

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
    telegram/     grammY transport, webhook/polling adapter, notification gateway
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

Telegram remains opt-in. For safe local polling set `FEATURE_TELEGRAM=true`, `TELEGRAM_MODE=polling`, and provide `TELEGRAM_BOT_TOKEN`; webhook mode additionally requires `TELEGRAM_WEBHOOK_URL` and a random `TELEGRAM_WEBHOOK_SECRET` of at least 32 characters. Staff must already have an active numeric-ID `TelegramIdentity` and internal role. See `docs/telegram-bot.md`; tests always use the fake gateway.

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

## Local Codex CLI Integration (Development Only)

For private local development, the system supports invoking the locally installed, ChatGPT-authenticated Codex CLI without requiring `OPENAI_API_KEY` or `CODEX_API_KEY`.

> [!WARNING]
> This integration is **strictly for private local development**. It is rejected when `NODE_ENV=production`. Usage consumes the authenticated developer's ChatGPT session quota and is neither free nor unlimited.

### Preflight Check

Confirm the local Codex CLI installation and authentication status:

```bash
codex --version
codex login status
```

### Configuration (`.env`)

To enable the Codex CLI for text copy and creative background generation:

```bash
# AI Text Generation via Codex CLI
FEATURE_AI_TEXT_GENERATION=true
AI_PROVIDER=codex_cli

# Creative Background Generation via Codex CLI imagegen skill
FEATURE_AI_IMAGE_GENERATION=true
FEATURE_CREATIVE_GENERATION=true
CREATIVE_PROVIDER=codex_cli

# Process & Timeout Budgets
CODEX_CLI_TEXT_TIMEOUT_MS=120000
CODEX_CLI_IMAGE_TIMEOUT_MS=300000
CODEX_CLI_MAX_CONCURRENCY=1
```

To revert back to fast, offline mock providers:

```bash
AI_PROVIDER=fake
CREATIVE_PROVIDER=fake
```

### Running the Opt-In Live Smoke Test

The test suite never makes real external AI calls. To run a single opt-in end-to-end smoke test against the local Codex CLI:

```bash
RUN_CODEX_CLI_LIVE_TESTS=true pnpm codex:live-test
```

This script:

1. Runs a Codex CLI preflight check.
2. Selects a fictional development product fixture (`Moonlit River Eau de Parfum`).
3. Generates bilingual (Khmer & English) structured copy via `CodexCliTextProvider`.
4. Validates the copy against `aiContentOutputSchema` and language rules.
5. Generates a 1080×1080 luxury background canvas via `CodexCliCreativeProvider` (Codex `imagegen` skill).
6. Runs deterministic visual validation and visual safety scans.
7. Composites the canonical transparent product image with `SharpHeroCompositor`.
8. Saves artifacts to `.data/codex-live-test/<timestamp>/`:
   - `content.json` — Validated bilingual copy with facts and warnings.
   - `background.png` — Pure background canvas (1080×1080).
   - `final-composite.png` — Completed composite hero asset (1080×1080).
   - `metadata.json` — Timings, token usage, bounding box, and run provenance.
9. On macOS, automatically triggers the system image viewer (`open`) for visual review.

See the repository `docs/` directory for boundaries, database, jobs, outbox, errors, security, and dependency-license policy.
