# Product Source security

## Phase 1B controls

- Only fictional in-process fixtures are active outside production.
- Production never falls back to fixtures; its disabled source fails closed.
- `FEATURE_PRODUCT_API=false` remains the default. Enabling it fails because no approved HTTP adapter exists.
- Every adapter result is revalidated by the application service using the strict normalized Zod schema.
- Optional facts remain absent; descriptions never supply inferred structured facts.
- URLs are references only and must use HTTPS. The application does not fetch, resolve, probe, redirect, download, or process product/image URLs.
- Product search is bounded and does not execute SQL.
- Logs exclude query text, raw payloads, response bodies, tokens, and base URLs.
- Snapshots are append-only in application APIs and PostgreSQL.

## Future HTTP adapter requirements

The adapter may be implemented only after owner-approved raw schemas and a non-production sandbox exist. It must:

- use one configured HTTPS base URL from trusted deployment configuration;
- enforce an explicit approved hostname/port and reject embedded credentials, fragments, loopback, link-local, private, multicast, and metadata-service destinations unless an infrastructure review explicitly allows a private catalog host;
- construct paths and query parameters with `URL`/`URLSearchParams`, never accept a caller-supplied destination, and encode SKU/query values;
- validate DNS/re-resolution behavior and prevent redirect-based host escape; default to no redirects;
- apply connection and total request timeouts, response/body size bounds, content-type checks, and strict JSON parsing;
- validate TLS certificates and never log authorization headers, tokens, base URLs containing credentials, or bodies;
- parse a provider-specific Zod schema, map explicitly, then validate the normalized contract;
- map 401/403, 404, 429, timeout, network/5xx, malformed JSON, and invalid schema to stable product errors without exposing upstream internals;
- use bounded retries only for approved transient conditions, honor a validated `Retry-After`, and include jitter/idempotent-read safeguards.

## Residual risks and required decisions

HTTPS URL syntax validation does not establish that an image host is approved or safe to fetch. Signed asset expiry, DNS rebinding, private Product API hosting, certificate policy, proxy behavior, credential rotation, sanitized error fixtures, maximum payload size, timeout/retry budget, and host allowlists remain owner/security decisions. Any server-side asset fetching requires a separate reviewed component and threat-model update.
