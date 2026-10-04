# Immutable ProductSnapshot

## Purpose

A ProductSnapshot is the exact normalized factual record that a future generation workflow will consume. Product source changes create another snapshot; they never rewrite evidence used by an earlier workflow.

Phase 1B exposes snapshot creation only as an internal application use case. There is no public HTTP, Telegram, AI, or content-generation connection.

## Storage design

`product_snapshots` has a UUID primary key and typed columns for SKU, name, brand, category, regular/promo price, currency, stock, product URL, source metadata, lifecycle, hash, normalizer version, and timestamps. Structured bounded fields use JSONB only for discount, images, fragrance notes, concentration, size, origin, and similarity claims. The entire product is not stored as an opaque document.

Prices use `DECIMAL(19,4)`. Timestamps use `timestamptz(3)` and are interpreted as UTC. There is `created_at` but deliberately no `updated_at`.

Indexes support SKU history, hash lookup, and source record/version investigation. Hashes are indexed but not unique: two independent workflows may legitimately preserve equivalent facts as separate evidence records.

## Immutability

- `ProductSnapshotRepository` exposes only `create` and `findById`.
- `CreateProductSnapshotUseCase` validates/canonicalizes before persistence.
- No update/delete application method exists.
- PostgreSQL's `product_snapshots_immutable` trigger rejects every `UPDATE` and `DELETE`, including direct Prisma/raw SQL attempts by the normal database owner used in tests.
- Retention or legally required erasure needs a separately authorized migration/operations path, not ordinary application behavior.

Integration tests prove that Snapshot A remains 38 USD after Snapshot B records the same SKU at 35 USD.

## Snapshot hash

The digest is SHA-256 over canonical JSON containing:

```text
lifecycle_status
product.* (every present normalized product fact)
```

Object keys are recursively sorted. Array order is retained because image position, note ordering, and controlled claim ordering can be meaningful. Undefined values are omitted. Decimal values and timestamps are canonicalized by the normalized schema before hashing.

The hash excludes `retrieved_at`, source system/record/version/ETag, source update time, snapshot ID, `created_at`, and normalizer version. This makes the same factual product state hash identically even when retrieved again. All excluded evidence metadata is still stored in typed columns. A protected fact or lifecycle change produces a different hash.

The hash is an audit/deduplication signal, not a digital signature and not proof that the upstream source was honest.

## Repository mapping

The Prisma adapter validates on write and reconstructs the complete normalized envelope through Zod on read. Malformed database JSON cannot silently become an application product. SQL constraints independently enforce non-negative prices, promo price not exceeding regular price, uppercase currency, and hash format.
