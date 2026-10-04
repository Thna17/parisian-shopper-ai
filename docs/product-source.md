# Product Source

## Scope

Phase 1B establishes a stable Product Source boundary using fictional fixtures only. It implements exact-SKU lookup and bounded lexical search. New-product and promotion-list operations remain absent until the Product API owner defines authoritative ordering, lifecycle, and promotion activation semantics.

No HTTP Product API adapter, production connection, Telegram handler, public product endpoint, AI behavior, or content workflow exists in this phase.

## Application port

`ProductSource` exposes:

```text
getBySku(sku) -> NormalizedProductEnvelope | null
search({ query, limit }) -> { items }
```

Application services depend on this port and validate adapter output again before returning it. Raw provider structures cannot cross the adapter boundary. A reusable `normalizeExternalProduct` pipeline requires a provider-specific Zod schema, an explicit mapper, and final normalized-schema validation.

`GetProductBySkuUseCase` trims and validates the SKU, calls the port, validates the result, and maps absence to `PRODUCT_NOT_FOUND`. `SearchProductsUseCase` validates the query/limit, checks every returned item, and rejects an adapter that exceeds the requested limit.

## Normalized contract

The envelope contains contract/source metadata and a product object. Field names follow the Product API draft's snake-case wire representation. `source_updated_at` is used instead of the draft's ambiguous `updated_at` name to distinguish the source modification time from snapshot creation time.

| Classification | Fields |
|---|---|
| Required | `sku`, `product_name`, `brand`, `category`, `price`, `currency`, `stock_status` |
| Recommended | `description`, `images`, `product_url`, `country_of_origin` |
| Conditional | `promo_price`, `discount`, `fragrance_notes`, `concentration`, `size`, `similarity_claims` |
| Controlled | Every canonical product fact, including all fields above |

Images remain recommended rather than required because the Product API owner has not guaranteed an asset for every active SKU. An explicit empty array means the source confirmed no approved image; absence means no image value was supplied. Phase 1B validates HTTPS references but never fetches them.

Missing optional or controlled values remain absent. Normalization does not derive origin, concentration, notes, promotion, discount, similarity, or any other fact from names or descriptions.

## Money and promotions

The application boundary uses non-negative decimal strings with at most four decimal places and a separate uppercase ISO 4217 currency code. Decimal strings are canonicalized (`"38.00"` becomes `"38"`) without converting through JavaScript floating point. PostgreSQL stores prices as `DECIMAL(19,4)` through Prisma `Decimal` semantics.

Promotion fields are source-declared. Phase 1B preserves `promo_price`, the controlled discount object, calculation method, and optional start/end timestamps. It checks that promo price does not exceed regular price and that end does not precede start, but it does not decide whether a promotion is currently active, compute discounts, or reconcile conflicting upstream claims.

## Stock, fragrance, origin, and similarity

The controlled stock vocabulary is `in_stock`, `low_stock`, `out_of_stock`, `preorder`, `discontinued`, and `unknown`, matching the draft contract. Unknown external values fail normalization; adapters must not guess a mapping.

Fragrance notes contain independent `top`, `heart`, and `base` arrays. Concentration remains a source code plus approved label rather than an assumed exhaustive enum. Non-fragrance products need neither field.

Country of origin and similarity claims are highly controlled. Similarity entries must use the approved claim structure; absent source claims remain absent. Expiry-use semantics still require business confirmation and will be enforced before AI generation/approval, not inferred here.

## Validation and search behavior

- SKU is trimmed, 1–64 characters, and rejects whitespace/control characters while permitting broader punctuation and Unicode. Exact lookup is case-sensitive until the API owner confirms uniqueness/casing rules.
- Search is trimmed, 2–120 characters, defaults to 20 results, and caps at 50.
- The mock searches SKU, product name, and brand using case-insensitive substring matching, sorts by SKU, and applies the limit.
- Cursor pagination, fuzzy matching, Khmer normalization, ranking, and lifecycle filtering are not invented in the mock contract.

## Adapters and selection

- `MockProductSource`: deterministic fictional local/test adapter with eight products.
- `DisabledProductSource`: production-safe adapter that returns `PRODUCT_SOURCE_UNAVAILABLE`.
- `HttpProductSource`: deliberately not implemented because the real response schema, authentication, host, and owner-approved semantics are unresolved.

When `FEATURE_PRODUCT_API=false`, development/test use the mock; production uses the disabled adapter and never silently serves fixtures. Setting `FEATURE_PRODUCT_API=true` fails startup because Phase 1B has no approved HTTP adapter.

## Errors, retries, and observability

Stable errors are `PRODUCT_NOT_FOUND`, `INVALID_PRODUCT_DATA`, `PRODUCT_SOURCE_UNAVAILABLE`, `PRODUCT_SOURCE_TIMEOUT`, `PRODUCT_SOURCE_AUTH_FAILED`, `PRODUCT_SOURCE_RATE_LIMITED`, and `PRODUCT_SOURCE_RESPONSE_INVALID`. Public messages contain no upstream body, host, credential, or schema payload.

A future HTTP adapter may retry bounded network resets, selected temporary 5xx responses, and 429 only when `Retry-After` policy is confirmed. It must not retry 400, 401, 403, 404, or invalid schemas. No retry library or speculative behavior is included now.

Product operations log structured operation name, adapter, duration, SKU where appropriate, query length, and result count. They never log query text, credentials, or upstream payloads. `ProductMetrics` is a lightweight port with hooks for lookup/search outcome, latency, invalid response, and snapshot creation; Phase 1B supplies a no-op implementation rather than a monitoring dependency.

## Fictional fixture catalog

Fixtures cover a normal perfume, promoted perfume, perfume without notes, out-of-stock perfume, low-stock perfume, watch, cosmetic, and minimal accessory. All brands, names, records, claims, URLs, and timestamps are fictional and deterministic.

## Open Product API questions

The authoritative unresolved list remains in `product-api-contract-draft.md`. Blocking items for a real adapter include SKU case/uniqueness, decimal scale/currency semantics, promotion activation, stock meanings/freshness, image hosts/lifetime, raw response shape, source update/version signal, lifecycle/tombstones, search/pagination, authentication, rate limits, retry policy, and API versioning.
