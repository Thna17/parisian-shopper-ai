# Database conventions

## Baseline

PostgreSQL is the authoritative application store. Prisma provides the typed client and tracked migrations; production never uses schema push or automatic synchronization. Phase 1A defines only `User`, `Role`, `UserRole`, and the infrastructural `OutboxEvent`.

## Naming and types

- Prisma models/fields use `PascalCase`/`camelCase`; physical tables, columns, indexes, constraints, and foreign keys use explicit lowercase `snake_case` mappings.
- Primary keys are application-visible UUIDs backed by PostgreSQL UUID columns and `gen_random_uuid()` defaults.
- Foreign keys end in `_id` and have explicitly named constraints. Deletion is `RESTRICT` for identity/history relationships unless a later model documents another policy.
- Timestamps use `timestamptz(3)`, are stored in UTC, and end in `_at`. Applications render business timezone at the boundary.
- Mutable administrative rows use `created_at` and `updated_at`. Immutable evidence rows use creation/occurrence timestamps and no business update path.
- Money will use PostgreSQL `numeric` plus an ISO currency column; JavaScript floating point is prohibited for controlled monetary values.
- Enums are appropriate for small stable state vocabularies. Runtime-configurable business taxonomies use tables and immutable versions instead.
- JSONB needs a versioned schema and named purpose. Identifiers, relationships, workflow state, searchable protected facts, money, and timestamps remain typed columns.

## Index and constraint conventions

- Primary key: `<table>_pkey`.
- Unique key: `<table>_<columns>_key`.
- Index: `<table>_<columns_or_purpose>_idx`.
- Foreign key: `<table>_<column>_fkey`.
- Business invariants use database constraints in addition to application validation.
- Every foreign-key lookup and operational claim query receives a reviewed index; indexes are not added speculatively.

## Transactions and migrations

- Multi-record state changes and outbox insertion occur in one PostgreSQL transaction through an application transaction abstraction.
- Isolation/locking is selected per use case and documented; future state/version allocation will use expected-state checks and row/optimistic locks.
- Migration SQL is committed and immutable after it reaches a shared environment. Amendments use a new migration.
- Development uses `prisma migrate dev`; CI/production use `prisma migrate deploy`.
- Deployments run migrations as a privileged migration role. The application runtime role is least-privileged and will later deny update/delete on append-only evidence tables.
- Backups, point-in-time recovery, RPO/RTO, and restore drills are required before production and remain an operations decision.

## Baseline limitations

Telegram identities and final workflow/evidence entities are intentionally deferred to their delivery phases. Phase 1A does not guess their unresolved business details. The outbox table is present now because reliable database-to-queue/notification coordination is a cross-cutting infrastructure requirement.
