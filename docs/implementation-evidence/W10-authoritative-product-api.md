# W10 — Authoritative Product API Adapter Implementation Evidence

**Document:** `/docs/implementation-evidence/W10-authoritative-product-api.md`  
**Work Package:** W10 — Implement the Authoritative Product API Adapter  
**Phase:** Stage 1 — Real Product and Campaign Truth  
**Status:** Complete & Fully Verified  
**Execution Date:** 2026-10-18 (Updated 2026-10-19)

---

## 1. Executive Summary

Work package **W10 — Implement the Authoritative Product API Adapter** has been implemented, corrected, tested, and verified in strict accordance with the Master Engineering Blueprint v3.0 (§8, §26.2, §29), the Implementation Plan v1.0 (§7), and the owner-confirmed upstream Product API contract.

Key deliverables achieved:

1. **Owner Contract Approved:** Architectural decision `W03-DEC-001` is marked **APPROVED** following explicit owner confirmation of the Mekhla Product API (`https://api.mekhla.digital`) for Auralis Trading (`X-Active-Business-Id: cmpwgnlpv0001li15e3n16uhc`) in USD (`$`). `W03-DEC-003` and `W03-DEC-004` remain `PROPOSED`.
2. **Authoritative Adapter Created:** Implemented `MekhlaProductSource` implementing the domain `ProductSource` port (`getBySku`, `search`).
3. **Identifier Policy Enforced:** Exact matching preferring `shortCode` (e.g. `G32`) as the visible product code, with active variant `barcode` fallback (preserving leading zeroes), while preserving upstream `id` as `source_record_id`. Ambiguous identifiers throw `AmbiguousProductIdentifierError` (`AMBIGUOUS_PRODUCT_IDENTIFIER` / HTTP 409). Unapproved fallbacks such as `sourceBarcode` are strictly excluded from identifier selection and matching.
4. **Bounded Multi-Page Exact Lookup:** Uses upstream maximum page size 250 in `getBySku`; validates pagination envelope; examines all pages up to safety cap (`maxLookupPages = 10`); fails closed if `totalPages > safety cap` with `ProductSourceUnavailableError`; deduplicates candidates by product `id`; detects multi-page ambiguity (`AmbiguousProductIdentifierError`); and fetches detail only after a single unique candidate is confirmed.
5. **End-to-End Request Timeout:** Timeouts cover connection establishment, header parsing, body streaming (`response.text()`), and JSON parsing (`JSON.parse()`). The timer is strictly cleared via an idempotent `clearTimer()` in a `finally` block and before retry sleeps. Stalled response bodies deterministically trigger `ProductSourceTimeoutError`.
6. **Strict API Envelope Validation:** Enforces `success: z.literal(true)` on both collection and detail responses. Upstream 200 responses with `success: false` fail fast by throwing `ProductSourceResponseInvalidError`.
7. **Data Fidelity & Schema Conformance:** Preserves upstream test price `0.1` without arbitrary validation floors. Resolves relative image URLs to secure HTTPS. Derives deterministic stock status and maps perfume profiles. All outputs validate against `NormalizedProductEnvelope` (Zod).
8. **Security & Network Hardening:** Strict HTTPS-only validation, unexpected port rejection, embedded credential rejection, host allowlisting (`api.mekhla.digital`), no redirects (`redirect: 'error'`), bounded exponential backoff with jitter (max 2 retries, 2000 ms cap), and `Retry-After` header support for 429s. Explicit boundary: adapter enforces HTTPS scheme, port 443, allowlist, and no redirects; TLS 1.3 cipher suite negotiation is the responsibility of Node.js and the OS crypto stack.
9. **Fail-Closed Environment Selection:** In production, `selectProductSource` requires `FEATURE_PRODUCT_API=true` to instantiate `MekhlaProductSource`; otherwise fails closed via `DisabledProductSource`. Silent fallback to fixtures in production is strictly prohibited.
10. **Green Verification:** All 51 unit tests in `mekhla-product-source.spec.ts`, 32 config tests in `config.spec.ts`, 6 module tests in `products.module.spec.ts`, 1 live read-only contract test against `https://api.mekhla.digital`, and the complete 61-suite unit test workspace pass with zero errors, zero warnings, and clean boundaries.

---

## 2. Git Baseline and Worktree Preservation

In compliance with repository safety rules, the pre-existing user work was completely preserved:

- **Branch:** `feat/sharp-hero-compositor`
- **Initial HEAD:** `be92bce6be0afe49ade297a20b967317389446a3`
- **Tracked Modified Baseline:** 93 pre-existing user files preserved untouched.
- **Untracked Baseline:** 47 pre-existing user directories and files preserved untouched.
- **Staged Changes:** 0 files staged during execution (`git diff --cached --name-only` empty).

### Modified Files for W10:

- `app/packages/common/src/errors/application-error.ts` (added `AMBIGUOUS_PRODUCT_IDENTIFIER`)
- `app/packages/application/src/modules/products/domain/product-errors.ts` (added `AmbiguousProductIdentifierError`)
- `app/packages/config/src/environment.schema.ts` (added Mekhla config and strict URL validation)
- `app/packages/config/src/app-config.service.ts` (added `ProductApiConfig` and getter)
- `app/packages/config/test/config.spec.ts` (added config schema tests)
- `app/.env.example` (documented Mekhla environment variables)
- `app/apps/api/src/http/global-exception.filter.ts` (mapped `AMBIGUOUS_PRODUCT_IDENTIFIER` to `HttpStatus.CONFLICT`)
- `app/packages/application/src/index.ts` (exported `MekhlaProductSource` and error)
- `app/packages/application/src/modules/products/products.module.ts` (wired `selectProductSource` with `FEATURE_PRODUCT_API`)
- `app/packages/application/src/modules/products/products.module.spec.ts` (module provider tests)
- `docs/specifications/w03-business-decision-register.md` (updated `W03-DEC-001` to `APPROVED`)
- `docs/implementation-plan-v1.md` (updated W10 status to `Complete`)

### New Files Created for W10:

- `app/packages/application/src/modules/products/infrastructure/mekhla-product-source.ts`
- `app/packages/application/src/modules/products/infrastructure/mekhla-product-source.spec.ts`
- `app/packages/application/src/modules/products/infrastructure/mekhla-product-source.live.spec.ts`
- `docs/implementation-evidence/W10-authoritative-product-api.md` (this report)

---

## 3. Owner-Confirmed Contract & Architectural Decisions

| Parameter                    | Confirmed Value                                                                                                  | Technical Implementation                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Upstream Provider**        | Mekhla Product API                                                                                               | `MekhlaProductSource` adapter                                        |
| **Base Origin**              | `https://api.mekhla.digital`                                                                                     | `PRODUCT_API_BASE_URL` with HTTPS check                              |
| **Tenant Identification**    | `X-Active-Business-Id: cmpwgnlpv0001li15e3n16uhc`                                                                | Injected on every HTTP request                                       |
| **Confirmed Business**       | Auralis Trading                                                                                                  | Business tenant context                                              |
| **Collection Query**         | `/api/v1/products?page=1&limit=250&sort=newest&status=ACTIVE&type=PERFUME&includeCounts=false&summaryMode=false` | Upstream max page size 250 in `getBySku`; 50 max for `search`        |
| **Detail Query**             | `/api/v1/products/:id`                                                                                           | Strict URI-encoded product ID lookup                                 |
| **Currency**                 | USD (`$`)                                                                                                        | Default `USD`, validated ISO 4217                                    |
| **Visible Product Code**     | `shortCode` (priority 1), active variant `barcode` (priority 2)                                                  | `extractNormalizedSku(item)`; `sourceBarcode` excluded               |
| **Source Record Identifier** | Upstream product `id`                                                                                            | Preserved in `source_record_id`                                      |
| **Ambiguity Handling**       | Reject ambiguous matches across pages                                                                            | Deduplicates by `id`, throws `AmbiguousProductIdentifierError`       |
| **Pagination Safety Cap**    | Max 10 pages examined during SKU lookup                                                                          | Fails closed with `ProductSourceUnavailableError` if exceeded        |
| **End-to-End Timeout**       | Covers connection, headers, body streaming, and parsing                                                          | AbortController + timer active through `JSON.parse()`, `finally` clr |
| **Envelope Requirement**     | Strict `success: true` literal required                                                                          | `success: z.literal(true)`; 200 with `false` throws InvalidError     |
| **Test Data Fidelity**       | Price `0.1` is intentional test data                                                                             | Preserved exactly via decimal parser; no artificial floor            |

---

## 4. Technical Architecture: Ports & Adapters

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Application Layer                               │
│                                                                        │
│   [GetProductBySkuUseCase]                   [SearchProductsUseCase]   │
│             │                                           │              │
│             ▼                                           ▼              │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                     ProductSource Port                         │   │
│   │  • getBySku(sku: string): Promise<NormalizedProductEnvelope>   │   │
│   │  • search(input: SearchInput): Promise<ProductSearchResult>    │   │
│   └────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           ▼                        ▼                        ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│  MekhlaProductSource │ │   MockProductSource  │ │DisabledProductSource │
│  (Live HTTP Adapter) │ │ (Dev/Test Fixtures)  │ │ (Prod Fail-Closed)   │
│                      │ │                      │ │                      │
│ • HTTPS (Port 443)   │ │ • Fictional products │ │ • Throws             │
│ • Tenant Header      │ │ • Deterministic      │ │   ProductSource-     │
│ • Strict Host Allow  │ │ • Zero network calls │ │   UnavailableError   │
│ • Bounded Retries    │ └──────────────────────┘ └──────────────────────┘
│ • Zod Normalization  │
└──────────────────────┘
```

---

## 5. Security & Network Hardening Specifications

1. **Protocol & Port Enforcement:**
   - Enforces `parsedUrl.protocol === 'https:'`. HTTP URLs trigger immediate `ProductSourceUnavailableError`.
   - Enforces standard port (empty or `443`). Explicit custom ports (e.g., `:8443`) are rejected.
2. **Host Allowlisting:**
   - Hostname must match configured `allowedHosts` (default: `['api.mekhla.digital']`). Unrecognized hosts are rejected before any socket is opened.
3. **Embedded Credentials Prohibition:**
   - URL `username` or `password` presence causes immediate rejection.
4. **Redirect Prohibition:**
   - Fetch requests specify `redirect: 'error'`. Transparent redirects to unverified origins are disallowed.
5. **TLS Responsibility Boundary:**
   - The adapter enforces HTTPS scheme, standard port 443, host allowlisting, and redirect prohibition. Negotiation of cryptographic cipher suites, certificate validation, and TLS protocol versions (such as TLS 1.3) is the responsibility of Node.js and the operating system's underlying crypto subsystem (OpenSSL), not application-level adapter code.
6. **End-to-End Request Timeout Architecture:**
   - `executeFetch` initializes an `AbortController` and an active timeout timer before initiating `fetch()`.
   - The timer remains active across connection establishment, header parsing, body reading (`response.text()`), and `JSON.parse()`.
   - The timer is guaranteed to be cleared via an idempotent `clearTimer()` function in a `finally` block and explicitly before any retry backoff sleep.
   - Stalled response bodies deterministically trigger an `AbortError`, which maps to `ProductSourceTimeoutError`.
7. **Secret Redaction:**
   - Bearer tokens (when configured) are passed via headers and never interpolated into log statements or exception messages.

---

## 6. Resilience, Retries, and Error Handling

| Scenario                  | HTTP Status / Condition         | Adapter Action                                    | Resulting Domain Error              |
| ------------------------- | ------------------------------- | ------------------------------------------------- | ----------------------------------- |
| **Success**               | `200 OK` (success: true)        | Parse JSON, validate schema, normalize            | Returns `NormalizedProductEnvelope` |
| **Envelope Failure**      | `200 OK` (success: false)       | Fail fast without retrying                        | `ProductSourceResponseInvalidError` |
| **Bad Request**           | `400 Bad Request`               | Fail fast without retrying                        | `ProductSourceResponseInvalidError` |
| **Unauthorized**          | `401 Unauthorized`              | Fail fast without retrying                        | `ProductSourceAuthFailedError`      |
| **Forbidden**             | `403 Forbidden`                 | Fail fast without retrying                        | `ProductSourceAuthFailedError`      |
| **Not Found**             | `404 Not Found`                 | Fail fast; returns null on SKU lookup             | `null`                              |
| **Rate Limited**          | `429 Too Many Requests`         | Extract `Retry-After`, backoff, retry up to limit | `ProductSourceRateLimitedError`     |
| **Server Error**          | `500`, `502`, `503`, `504`      | Exponential backoff with jitter (max 2), cap 2s   | `ProductSourceUnavailableError`     |
| **Network Timeout**       | Abort after `timeoutMs`         | Exponential backoff with jitter (max 2)           | `ProductSourceTimeoutError`         |
| **Stalled Response Body** | Body streaming stalls           | Timer fires, aborts request                       | `ProductSourceTimeoutError`         |
| **Ambiguous Match**       | Multiple items match query      | Refuse arbitrary selection                        | `AmbiguousProductIdentifierError`   |
| **Safety Cap Exceeded**   | `totalPages > maxLookupPages`   | Refuse unbounded pagination; fail closed          | `ProductSourceUnavailableError`     |
| **Malformed JSON**        | Invalid syntax / schema failure | Fail fast without retrying                        | `ProductSourceResponseInvalidError` |

---

## 7. Verification Evidence

### 7.1 Unit Tests (`mekhla-product-source.spec.ts`)

```
PASS unit packages/application/src/modules/products/infrastructure/mekhla-product-source.spec.ts
  MekhlaProductSource
    configuration & host safety
      ✓ rejects missing or empty baseUrl
      ✓ rejects non-HTTPS baseUrl
      ✓ rejects embedded credentials in baseUrl
      ✓ rejects unexpected port in baseUrl
      ✓ rejects hostile or unapproved hosts
      ✓ rejects missing business ID
    getBySku lookup
      ✓ successfully looks up product by shortCode and fetches detail
      ✓ performs case-insensitive exact matching for shortCode
      ✓ successfully looks up product by variant barcode
      ✓ prefers shortCode over barcode for normalized SKU
      ✓ falls back to barcode when shortCode is missing
      ✓ fails validation when both shortCode and active barcode are missing
      ✓ fails closed when multiple distinct products match the same exact identifier
      ✓ returns null when product collection returns no matching items
      ✓ returns null when detail endpoint returns 404
      ✓ looks up exact shortCode match on page 2
      ✓ looks up exact barcode match on page 2
      ✓ returns null when no match found after all reported pages are examined
      ✓ duplicate copies of the same product ID across pages do not create false ambiguity
      ✓ different matching product IDs across different pages produce AmbiguousProductIdentifierError
      ✓ pagination exceeding the safety cap fails closed with ProductSourceUnavailableError
      ✓ malformed pagination fails validation with ProductSourceResponseInvalidError
      ✓ page requests never exceed the configured safety boundary
    search behavior
      ✓ successfully searches products with summaryMode=true and bounds limit
      ✓ bounds requested limit to maximum 50
    headers, security, and credentials
      ✓ sends X-Active-Business-Id and Accept headers
      ✓ sends Authorization header when token is explicitly configured
      ✓ enforces redirect: error to prevent host escape
    data mapping & normalization
      ✓ preserves test price of 0.1 without imposing arbitrary minimum
      ✓ derives stock status accurately across all conditions
      ✓ resolves relative image URLs against base URL and enforces HTTPS
      ✓ rejects HTTP image URLs as insecure
      ✓ maps perfume notes, concentration, and size cleanly
      ✓ safely omits size if sizeLabel is unparseable
    failure behavior and retries
      ✓ throws ProductSourceAuthFailedError on 401 and does not retry
      ✓ throws ProductSourceAuthFailedError on 403 and does not retry
      ✓ throws ProductSourceResponseInvalidError on 400 bad request without retrying
      ✓ retries on retryable 500 error and succeeds
      ✓ retries on 429 and parses Retry-After header
      ✓ throws ProductSourceRateLimitedError on 429 retry exhaustion
      ✓ throws ProductSourceUnavailableError on 5xx retry exhaustion
      ✓ retries on network failure and throws ProductSourceUnavailableError on exhaustion
      ✓ throws ProductSourceTimeoutError when request times out and retries are exhausted
      ✓ throws ProductSourceResponseInvalidError on malformed JSON
      ✓ throws ProductSourceResponseInvalidError on malformed success envelope
      ✓ times out when server returns headers but body reading stalls
      ✓ throws ProductSourceResponseInvalidError when collection returns 200 with success: false
      ✓ throws ProductSourceResponseInvalidError when detail returns 200 with success: false
      ✓ rejects product when only sourceBarcode is present
      ✓ inactive variant barcodes cannot become the normalized SKU
      ✓ active variant barcode remains the valid fallback when shortCode is missing
```

**Total:** 51 passing tests.

### 7.2 Configuration Tests (`config.spec.ts`)

```
PASS unit packages/config/test/config.spec.ts
  configuration validation
    ✓ uses safe feature defaults
    ✓ parses the string false as false
    ✓ rejects malformed required configuration
    ✓ does not require future secrets while their features are disabled
    ✓ allows explicitly enabled fake AI without a secret outside production
    ✓ requires an OpenAI key only when enabled with the OpenAI provider
    ✓ does not silently use fake AI in production
    ✓ does not silently use fake creative provider in production
    ✓ requires Higgsfield credentials only when creative generation and the provider are enabled
    ✓ rejects unknown Higgsfield models and product image-to-video activation
    ✓ requires a Telegram token only when Telegram is enabled
    ✓ requires webhook URL and a strong secret when Telegram webhook mode is enabled
    ✓ permits explicit local polling without webhook settings
    ✓ refuses to enable FEATURE_AUTO_PUBLISHING during Phase 1A
    ✓ refuses to enable FEATURE_META_PUBLISHING during Phase 1A
    ✓ rejects wildcard CORS in production
    ✓ uses safe Codex CLI configuration defaults
    ✓ rejects AI_PROVIDER=codex_cli in production
    ✓ rejects CREATIVE_PROVIDER=codex_cli in production
    ✓ permits codex_cli providers outside production when required feature flags are set
    ✓ rejects CREATIVE_PROVIDER=codex_cli when FEATURE_CREATIVE_GENERATION is not enabled
    ✓ rejects CREATIVE_PROVIDER=codex_cli when FEATURE_AI_IMAGE_GENERATION is not enabled
    ✓ does not require OPENAI_API_KEY when CREATIVE_PROVIDER=codex_cli
    ✓ requires OPENAI_API_KEY when CREATIVE_PROVIDER=openai and creative generation is enabled
    ✓ does not require OPENAI_API_KEY or OPENAI_MODEL when AI_PROVIDER=codex_cli
    product api configuration validation
      ✓ accepts valid product API configuration
      ✓ rejects missing PRODUCT_API_BASE_URL when FEATURE_PRODUCT_API=true
      ✓ rejects non-HTTPS PRODUCT_API_BASE_URL
      ✓ rejects embedded credentials in PRODUCT_API_BASE_URL
      ✓ rejects unexpected port in PRODUCT_API_BASE_URL
      ✓ rejects host not in PRODUCT_API_ALLOWED_HOSTS
      ✓ rejects missing PRODUCT_API_BUSINESS_ID when FEATURE_PRODUCT_API=true
```

**Total:** 32 passing tests.

### 7.3 Module Wiring Tests (`products.module.spec.ts`)

```
PASS unit packages/application/src/modules/products/products.module.spec.ts
  Product Source selection
    ✓ uses fictional fixtures in development when disabled
    ✓ uses fictional fixtures in test when disabled
    ✓ never silently uses fixtures in production when disabled
    ✓ fails closed when product API is enabled without complete configuration
    ✓ selects MekhlaProductSource when product API is enabled with valid config
    ✓ selects MekhlaProductSource in production when product API is enabled with valid config
```

**Total:** 6 passing tests.

### 7.4 Live Contract Test (`mekhla-product-source.live.spec.ts`)

Executed against live endpoint `https://api.mekhla.digital` with tenant `cmpwgnlpv0001li15e3n16uhc`:

```
PASS unit packages/application/src/modules/products/infrastructure/mekhla-product-source.live.spec.ts
  MekhlaProductSource (live read-only contract test)
    ✓ verifies live Mekhla API envelope and fetches an active product (1897 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```

### 7.5 Full Workspace Verification Gates

- **TypeScript Check:** `tsc -b --pretty false` $\to$ Code 0 (zero errors).
- **ESLint Check:** `eslint . --max-warnings 0` $\to$ Code 0 (zero errors, zero warnings).
- **Architecture Boundaries:** `pnpm boundaries` $\to$ Code 0 (`Module boundaries valid`).
- **Complete Unit Test Suite:** `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.unit.config.cjs --runInBand` $\to$ **61 passed, 1 skipped (live test), 580 passed, 0 failures**.

---

## 8. Rollback and Disaster Recovery Notes

If upstream Mekhla Product API experiences prolonged outages or contract breaks:

1. **Zero Domain Modification Required:** The application domain interacts exclusively with `ProductSource` and `NormalizedProductEnvelope`.
2. **Production Safeguard:** Setting `FEATURE_PRODUCT_API=false` immediately switches the runtime to `DisabledProductSource`, which fails closed with recoverable user messages while preserving all existing drafts, approvals, and snapshots.
3. **Test/Dev Decoupling:** Development and test environments remain independent and can run completely offline using `MockProductSource`.

---

## 9. Next Steps

Work package **W10 is complete**. The next authorized work package on the roadmap is:

- **W11 — Freshness-Aware Snapshots and Dependency Hashes** (Stage 1).
