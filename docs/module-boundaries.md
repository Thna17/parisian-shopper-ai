# Module boundaries

## Purpose

The Phase 1A application is a modular monolith. API and worker are runtime entrypoints, not independent business services. Feature behavior will be added to shared modules without allowing transports or vendors to become the domain model.

## Workspace dependency direction

```text
apps/api ───────┐
apps/worker ────┼──> application ──> config + common
                ├──> database ─────> application ports/types + common
                ├──> jobs ─────────> config
                ├──> logger ───────> config + common
                └──> config
```

- `common/domain` is framework-free and may depend only on the language/runtime.
- `common/application` owns project interfaces such as transaction/outbox ports.
- `application` owns feature boundaries and later orchestration. It cannot import Prisma, BullMQ, Valkey, Telegram, OpenAI, Express, database, jobs, or logger implementations.
- `database`, `jobs`, and `logger` are infrastructure adapters. Database may implement narrowly exported application repository ports but application can never import database.
- API controllers/middleware may call application-facing services but cannot import Prisma, BullMQ, or Valkey directly.
- Telegram will be a transport inside its boundary, not an authorization, persistence, or workflow engine.

The `products` module now owns normalized product types, Product Source/snapshot ports, and Phase 1B application services. Other feature modules remain empty boundaries. Environment-based source selection is confined to Nest composition; product domain/use-case files do not parse environment variables.

## Enforcement

`pnpm lint` applies type-aware `no-restricted-imports` rules. `pnpm boundaries` independently scans source imports and the workspace package graph, rejecting forbidden imports and package dependency cycles. CI runs both. Adding an alias or re-export to bypass these rules is a boundary violation.

When domain/application services are introduced, their tests should import only public module interfaces. Cross-feature database access must go through an exported application port rather than another module's Prisma repository.

## Allowed exceptions

There is no informal exception. A needed boundary change requires a documented reason, updated diagram/rules/tests, and architecture review. Domain imports of vendor types are never accepted merely for convenience.
