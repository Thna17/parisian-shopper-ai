# Phase 1A security controls

## Implemented baseline

- Zod validates configuration at startup. Required PostgreSQL settings fail closed; optional integration secrets are not required while disabled.
- Automatic and Meta publishing flags are hard-rejected when true. No publishing module, route, queue, SDK, credential, or state exists.
- Numeric identity/authentication is deliberately not faked in Phase 1A; future business endpoints cannot launch before the real authorization phase.
- Helmet applies secure HTTP headers. JSON/urlencoded bodies have a configurable small limit and strict JSON parsing.
- CORS is disabled without an allowlist; wildcard production CORS is rejected. Credentials are never combined with a wildcard.
- Global rate-limit middleware establishes ingress throttling. A distributed policy will be selected when authenticated user routes exist.
- Request IDs accept only a bounded safe character set or are generated as UUIDs; the ID is returned and added to structured logs.
- Global errors expose stable safe envelopes and suppress stack/infrastructure details.
- Pino emits JSON in production, supports opt-in development pretty output, and recursively redacts credential-like fields. Startup logs feature states, not secret values.
- PostgreSQL/Valkey Compose ports bind to loopback only, use persistent named volumes, health checks, pinned images, and `no-new-privileges`.
- Prisma parameterization is the default database path. Raw SQL requires parameterization/review.
- CI uses no external integration credentials and runs dependency-license, formatting, lint, boundary, type, test, migration-schema, and build gates.
- `/research` is Git-ignored and absent from workspace resolution/build inputs.
- The Phase 1A lockfile passes `pnpm audit --prod`; the root override pins patched `deepmerge-ts` because Prisma 6's configuration package otherwise resolves a vulnerable transitive major. The override must be removed or revalidated when Prisma changes.

## Configuration and secret rules

`.env` and environment variants are ignored; `.env.example` contains fictional local placeholders only. Shared/production deployments must use an approved secret mechanism and distinct read/runtime/migration privileges. Never log or place in prompts `DATABASE_URL`, Telegram token, AI key, Product API token, authorization/cookie headers, or future Meta credentials.

Enabling Telegram, AI, or Product API validates the minimum corresponding placeholder setting, but no adapter exists yet. These flags must remain false during Phase 1A. Production secret manager, TLS termination, webhook controls, database/Valkey authentication, log retention/access, backups, and incident ownership are pre-production decisions.

## Deliberately deferred

Authentication/authorization, Telegram callback integrity, Product API TLS/SSRF controls, AI prompt isolation, factual validation, append-only workflow grants, and approval concurrency belong to their planned phases. The current absence of business endpoints keeps those trust boundaries closed; it is not a claim that the controls are already implemented.
