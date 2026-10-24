# W10 — Product API Readiness and Contract Gate Report

**Document:** `/docs/implementation-evidence/W10-product-api-readiness.md`  
**Work Package:** W10 — Implement the Authoritative Product API Adapter  
**Phase:** Stage 1 — Real Product and Campaign Truth  
**Status:** Readiness Assessment Gate Completed  
**Recommendation:** `W10 BLOCKED — OWNER-CONFIRMED PRODUCT API CONTRACT REQUIRED`  
**Execution Date:** 2026-10-18

---

## 1. Executive Summary & Purpose

This document provides the formal contract discovery, architectural assessment, and readiness gate evaluation for work package **W10 — Implement the Authoritative Product API Adapter** in Parisian Shopper AI.

In accordance with the project instructions, Master Engineering Blueprint v3.0 (§8, §26.2, §29), Implementation Plan v1.0 (§7), and foundational specification `product-freshness-and-campaign-integrity.md`, **W10 cannot begin runtime implementation without an owner-confirmed Product API contract**. Architectural decision `W03-DEC-001` remains `PROPOSED` and explicitly blocks W10 until verifiable business and technical sign-off is documented.

This task is strictly a contract discovery and readiness assessment gate:

- **Zero runtime application code, tests, schemas, or configurations were modified.**
- **The pre-existing dirty worktree (93 tracked modified files, 0 staged files) has been 100% preserved.**
- **No external network requests or speculative API calls were executed.**
- **No secret values are exposed or logged.**
- **The gate concludes with Outcome B: `W10 BLOCKED — OWNER-CONFIRMED PRODUCT API CONTRACT REQUIRED`.**

---

## 2. Git Baseline and Worktree Preservation

The assessment was performed on the existing active branch and commit HEAD without altering any tracked or untracked user work:

- **Current Branch:** `feat/sharp-hero-compositor`
- **Commit HEAD:** `be92bce6be0afe49ade297a20b967317389446a3`
- **Staged Changes (`git diff --cached --name-only`):** `0 files` (empty)
- **Tracked Modified Files (`git status --porcelain | grep '^ M'`):** `93 files` (pre-existing user work completely preserved)
- **Untracked Entries (`git status --porcelain | grep '^\?\?'`):** `47 entries` (completely preserved)
- **Authorized Modification:** Exactly one file (`docs/implementation-evidence/W10-product-api-readiness.md`)

---

## 3. Documents and Code Artifacts Inspected

The following authoritative specifications, blueprints, application sources, schemas, and configurations were thoroughly inspected:

### 3.1 Authoritative Specifications & Architecture Guides

1. `docs/master-engineering-blueprint-v3.md` (§8, §10, §22, §26.2, §29)
2. `docs/implementation-plan-v1.md` (§4, §7, §15)
3. `docs/specifications/product-freshness-and-campaign-integrity.md` (Sections 1–22)
4. `docs/specifications/w03-business-decision-register.md` (`W03-DEC-001`, `W03-DEC-002`, `W03-DEC-003`, `W03-DEC-004`)
5. `docs/implementation-evidence/W03-foundational-specifications.md`
6. `docs/product-source.md`
7. `docs/product-source-security.md`
8. `docs/product-api-readiness.md`
9. `docs/product-api-contract-draft.md`
10. `docs/product-snapshot.md`

### 3.2 Application Code, Schemas, Ports, and Adapters

1. `app/packages/application/src/modules/products/application/product-source.port.ts`
2. `app/packages/application/src/modules/products/domain/product.schema.ts`
3. `app/packages/application/src/modules/products/domain/product-errors.ts`
4. `app/packages/application/src/modules/products/domain/product-input.ts`
5. `app/packages/application/src/modules/products/infrastructure/disabled-product-source.ts`
6. `app/packages/application/src/modules/products/infrastructure/mock-product-source.ts`
7. `app/packages/application/src/modules/products/infrastructure/normalization-boundary.ts`
8. `app/packages/application/src/modules/products/products.module.ts`
9. `app/packages/application/src/modules/products/testing/fictional-products.ts`
10. `app/packages/application/src/modules/products/testing/product-source.contract.ts`
11. `app/packages/application/src/modules/products/testing/geparlys-products.ts`
12. `app/packages/config/src/environment.schema.ts`
13. `app/packages/config/src/app-config.service.ts`
14. `app/packages/database/prisma/schema.prisma` (`model ProductSnapshot`)

---

## 4. Current Product Source Architecture

The application currently enforces a strict Clean Architecture Ports & Adapters boundary for product catalog data:

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
          ┌─────────────────────────┴────────────────────────┐
          ▼                                                  ▼
┌───────────────────────────────┐          ┌───────────────────────────────────┐
│     MockProductSource         │          │       DisabledProductSource       │
│  • Used in: development, test │          │  • Used in: production            │
│  • Data: 8 fictional items    │          │  • Fails closed with:             │
│  • In-memory search & lookup  │          │    PRODUCT_SOURCE_UNAVAILABLE     │
└───────────────────────────────┘          └───────────────────────────────────┘
```

### 4.1 Key Architecture Invariants in Place

1. **Ports & Adapters Boundary:** All application use cases (`GetProductBySkuUseCase`, `SearchProductsUseCase`, `CreateProductSnapshotUseCase`) depend exclusively on the abstract `ProductSource` interface (`product-source.port.ts`).
2. **Normalized Domain Envelope:** Upstream data must be normalized into `NormalizedProductEnvelope` (`product.schema.ts`) using Zod. No raw upstream provider structures are permitted to leak into the application domain.
3. **Environment-Specific Factory (`selectProductSource` in `products.module.ts`):**
   - In `development` and `test`: Returns `MockProductSource` (with deterministic fixtures).
   - In `production`: Returns `DisabledProductSource` which immediately rejects queries with `ProductSourceUnavailableError`. Production **never silently falls back to fixtures**.
   - If `FEATURE_PRODUCT_API=true`: Throws `ProductSourceUnavailableError('HTTP Product Source is not implemented in Phase 1B')` because no approved HTTP adapter exists.
4. **Immutable Snapshots in PostgreSQL:** `ProductSnapshot` (`schema.prisma`) stores append-only historical records identified by UUID and SHA-256 `snapshotHash`.

---

## 5. Contract Evidence Matrix

Every contract item required for W10 implementation readiness has been evaluated against repository evidence and classified according to the canonical decision procedure:

- **CONFIRMED:** Supported by owner-approved repository evidence.
- **OBSERVED:** Exists in code or configuration but has no owner approval evidence.
- **PROPOSED:** Specified as a recommendation, draft, or safe temporary default.
- **MISSING:** No repository evidence found.
- **CONFLICTING:** Multiple incompatible definitions exist.

| Category                    | Contract Item                      |         Status          | Repository Evidence & Analysis                                                                                                                                                                                                                                                                                 |
| :-------------------------- | :--------------------------------- | :---------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Source Identity**      | Catalog System Name & Owner        |      **PROPOSED**       | In `w03-business-decision-register.md`, `W03-DEC-001` identifies owner as Retail Operations Lead / Lead Systems Architect, but remains `PROPOSED`. In `product-api-contract-draft.md`, system is generically called "existing Parisian Shopper product database/API". Specific system name/vendor unconfirmed. |
|                             | Protocol / Transport               |      **PROPOSED**       | `W03-DEC-001` lists Option A (HTTPS REST API over TLS 1.3), Option B (PostgreSQL replica), Option C (SFTP flat file). Option A is recommended, but no owner decision confirms it.                                                                                                                              |
|                             | Production Endpoint / Identity     |       **MISSING**       | No production host, domain, or IP exists in configuration, blueprints, or code.                                                                                                                                                                                                                                |
|                             | Sandbox / Staging Availability     |       **MISSING**       | No staging URL, sandbox environment, or test credentials exist in the repository.                                                                                                                                                                                                                              |
|                             | Approved Host Allowlist            |       **MISSING**       | `product-source-security.md` requires strict host allowlisting; no allowlist is configured in `AppConfigService` or environment schema.                                                                                                                                                                        |
| **2. Auth & Transport**     | Authentication Mechanism           |      **PROPOSED**       | `W03-DEC-001` and draft docs recommend OAuth2 client credentials, workload identity, or static API key/Bearer token. Unconfirmed by owner.                                                                                                                                                                     |
|                             | Credential Identifiers / Headers   | **OBSERVED / PROPOSED** | `PRODUCT_API_TOKEN` is declared as an optional environment secret in `environment.schema.ts`, but exact header formatting (`Authorization: Bearer` vs `X-API-Key`) is unconfirmed.                                                                                                                             |
|                             | TLS Requirements                   |      **PROPOSED**       | TLS 1.3 with certificate verification is specified in `product-source-security.md` and Blueprint §29, but upstream server capability is unconfirmed.                                                                                                                                                           |
|                             | Credential Rotation Policy         |       **MISSING**       | No rotation cadence, key-versioning scheme, or ownership procedure is documented.                                                                                                                                                                                                                              |
|                             | Network Boundaries (mTLS, IP, VPN) |      **PROPOSED**       | `W03-DEC-001` suggests internal retail VPC or IP allowlisting; network boundary architecture is unconfirmed.                                                                                                                                                                                                   |
| **3. Product Lookup**       | Lookup by Exact SKU                |      **OBSERVED**       | Local domain defines `ProductSource.getBySku(sku)`. Upstream endpoint path (e.g. `GET /v1/products/{sku}`) is illustrative only (`product-api-contract-draft.md`).                                                                                                                                             |
|                             | Search / Catalog Endpoint          |      **OBSERVED**       | Local domain defines `ProductSource.search({ query, limit })`. Upstream endpoint path, query parameters, and capabilities are unconfirmed.                                                                                                                                                                     |
|                             | HTTP Method & Path                 |      **PROPOSED**       | `GET` is proposed in drafts; exact upstream path structure is unconfirmed.                                                                                                                                                                                                                                     |
|                             | Pagination Mechanism               |      **PROPOSED**       | Opaque cursor pagination is proposed in `product-api-contract-draft.md` (§20); not implemented in existing port or fixtures.                                                                                                                                                                                   |
|                             | Maximum Page Size                  |      **OBSERVED**       | Capped at 50 in `SearchProductsUseCase`; upstream limit and default page size are unconfirmed.                                                                                                                                                                                                                 |
|                             | Sorting and Filtering Semantics    |      **OBSERVED**       | Mock sorts lexicographically by SKU; upstream sort orders, filter flags, and lifecycle filtering are unconfirmed.                                                                                                                                                                                              |
| **4. Response Schema**      | Normalized Domain Schema           |      **CONFIRMED**      | `NormalizedProductEnvelope` is fully confirmed as the **internal domain schema** (`product.schema.ts`, `schema.prisma`), but NOT as the upstream wire schema.                                                                                                                                                  |
|                             | Upstream Wire Schema Mapping       |       **MISSING**       | No upstream raw JSON schema, OpenAPI specification, or mapping function (`normalizeExternalProduct` mapper) exists.                                                                                                                                                                                            |
|                             | SKU Semantics & Casing             |      **PROPOSED**       | Regex `^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$` proposed; case-sensitivity and global uniqueness across channels are unconfirmed (Question 1 in draft).                                                                                                                                                             |
|                             | Product Title, Brand, Category     |      **OBSERVED**       | Required in local schema; upstream category taxonomy and versioning are unconfirmed (Question 2 in draft).                                                                                                                                                                                                     |
|                             | Price & Currency                   |      **OBSERVED**       | Canonical decimal string and ISO 4217 currency enforced locally; tax inclusion, rounding, and KHR rules upstream are unconfirmed (Questions 3 & 4 in draft).                                                                                                                                                   |
|                             | Promotional Pricing & Disount      |      **PROPOSED**       | `W03-DEC-003` proposes strict upstream precedence for `promoPrice`; upstream promotion calculation and stacking rules remain unconfirmed.                                                                                                                                                                      |
|                             | Stock Status & Quantity            |      **OBSERVED**       | Controlled enum (`in_stock`, `low_stock`, `out_of_stock`, `preorder`, `discontinued`, `unknown`) defined locally; quantity is not stored; upstream status mapping unconfirmed.                                                                                                                                 |
|                             | Fragrance Notes & Attributes       |      **OBSERVED**       | Top/heart/base arrays and concentration object defined locally; upstream presence and curation unconfirmed.                                                                                                                                                                                                    |
|                             | Product Images & Rights            |      **PROPOSED**       | `W03-DEC-004` proposes catalog transparent PNGs but remains `PROPOSED` (blocks W20); asset lifetime, signing, and host guarantees unconfirmed.                                                                                                                                                                 |
|                             | Provenance (ETag, UpdatedAt)       |      **OBSERVED**       | `source_updated_at`, `source_version`, `etag` modeled in schema; upstream ETag and timestamp availability unconfirmed (Question 10 in draft).                                                                                                                                                                  |
|                             | Lifecycle & Tombstones             |      **OBSERVED**       | `active`, `discontinued`, `deleted` modeled locally; upstream representation of deletions unconfirmed (Question 11 in draft).                                                                                                                                                                                  |
| **5. Operational Behavior** | Latency & Timeout Budget           |      **PROPOSED**       | Target `< 500ms` p95 and `3000ms` hard timeout proposed in `product-api-readiness.md`; upstream latency SLO unconfirmed.                                                                                                                                                                                       |
|                             | Retries & Idempotency              |      **PROPOSED**       | 3 attempts with exponential backoff (250ms–2000ms) proposed in `product-freshness-and-campaign-integrity.md` §14; idempotent read semantics unconfirmed.                                                                                                                                                       |
|                             | Rate Limits & Headers              | **PROPOSED / MISSING**  | `Retry-After` handling proposed; rate limits (requests per minute, burst) and response headers unconfirmed (Question 18 in draft).                                                                                                                                                                             |
|                             | Error Status Mapping               |      **OBSERVED**       | `401/403`, `404`, `429`, timeout, invalid response mapped to domain errors in `product-errors.ts`; upstream error payload format unconfirmed.                                                                                                                                                                  |
|                             | Outage & Stale Fallback            |      **PROPOSED**       | `SOURCE_UNAVAILABLE` assessment state and fail-closed gate proposed; stale cache fallback prohibited for prices.                                                                                                                                                                                               |
| **6. Governance**           | Product Owner Sign-off             |       **MISSING**       | `product-api-contract-draft.md` is explicitly labeled "Draft for Product API owner review; no production connection authorized".                                                                                                                                                                               |
|                             | Technical / Security Sign-off      |       **MISSING**       | Residual risks documented in `product-source-security.md` require owner and security sign-off.                                                                                                                                                                                                                 |
|                             | Decision Register Approval         |      **PROPOSED**       | `W03-DEC-001` is `PROPOSED` in `w03-business-decision-register.md` and explicitly blocks W10.                                                                                                                                                                                                                  |
|                             | Image Source Policy Sign-off       |      **PROPOSED**       | `W03-DEC-004` is `PROPOSED` in `w03-business-decision-register.md` and blocks W20.                                                                                                                                                                                                                             |

---

## 6. Analysis of Findings

### 6.1 Confirmed Information

- **Internal Domain Contract:** The internal application port (`ProductSource`), normalized domain schema (`NormalizedProductEnvelope`), immutable database schema (`ProductSnapshot`), and stable domain errors (`ProductNotFoundError`, `ProductSourceUnavailableError`, `ProductSourceTimeoutError`, `ProductSourceAuthFailedError`, `ProductSourceRateLimitedError`, `ProductSourceResponseInvalidError`) are fully implemented, tested, and green.
- **Fail-Closed Factory:** `selectProductSource` in `products.module.ts` strictly prevents production from serving mock fixtures and fails closed if `FEATURE_PRODUCT_API=true`.
- **Normalization Boundary:** `normalizeExternalProduct<Raw>()` in `normalization-boundary.ts` defines a two-step validation pipeline ready to parse raw upstream payloads against a raw Zod schema before mapping to the domain envelope.

### 6.2 Missing, Proposed, and Conflicting Information

- **No Authoritative Upstream Contract:** Zero owner-confirmed specifications exist for upstream identity, base URL, endpoints, raw payload structure, authentication headers, error envelopes, or host allowlists.
- **Decision W03-DEC-001 is PROPOSED:** In `w03-business-decision-register.md`, the decision governing Product API identity, network endpoints, and credentials is formally marked `PROPOSED` and explicitly marked `BLOCKS W10: YES`.
- **Draft Status of Contract Documents:** `docs/product-api-contract-draft.md` explicitly states:
  > _"Status: Draft for Product API owner review"_  
  > _"Environment: Contract design only; no production connection authorized"_  
  > _"The contract is sufficient for Phase 1B domain modeling, fictional adapters, immutable snapshots, and reusable contract tests. It is not sufficient for a real Product API adapter or integration exit until the Product API owner resolves the decisions above, approves the normalized schema, and supplies sanitized representative and error fixtures."_
- **20 Unresolved Open Questions:** The 20 questions in `product-api-contract-draft.md` §OPEN PRODUCT API QUESTIONS remain unanswered by catalog owners.

---

## 7. Security and Secret-Handling Findings

1. **Environment Configuration Audit:**
   - `PRODUCT_API_BASE_URL` is defined as `optionalUrl` in `environment.schema.ts`.
   - `PRODUCT_API_TOKEN` is defined as `optionalSecret` in `environment.schema.ts`.
   - In `app/.env.example`, both variables are commented out.
   - In active configuration files (`app/.env`, `app/.env.local`), neither variable is set.
   - `FEATURE_PRODUCT_API` is set to `false`.
   - **No secret values are configured, exposed, or leaked.**
2. **SSRF and Transport Safeguards:**
   - `docs/product-source-security.md` establishes that any future HTTP adapter must enforce strict host allowlists, reject non-HTTPS URLs, block private/loopback/metadata IP ranges, and disable redirects.
   - In the absence of an approved host allowlist, any live HTTP client would introduce critical SSRF and supply-chain vulnerabilities.
3. **Log Sanitization:**
   - Log formatters and application use cases strictly prohibit logging query strings, raw payloads, authorization tokens, or external URLs containing credentials.

---

## 8. Exact Blockers for W10 Implementation

Implementation of W10 is strictly blocked by the following six verifiable conditions:

1. **Unresolved Architectural Decision `W03-DEC-001`:** Decision status is `PROPOSED`. Owner sign-off from Retail Operations Lead and Lead Systems Architect is required to select Option A, B, or C.
2. **Missing Authoritative Host & Endpoints:** No confirmed base URL, production endpoint, staging endpoint, or approved hostname allowlist exists.
3. **Missing Authentication Specification:** Protocol (OAuth2 vs API Key vs mTLS), credential rotation responsibility, and header naming conventions are unconfirmed.
4. **Missing Raw Upstream Schema & Field Mappings:** Upstream field names, JSON nesting, decimal representations, and stock enum values are unknown; no mapping pipeline can be implemented without guessing.
5. **Missing Upstream Operational Specifications:** Exact HTTP response codes, error envelope format, rate limits, burst thresholds, and `Retry-After` header formats are unconfirmed.
6. **Missing Representative Sanitized Fixtures:** No real or sanitized test fixtures from the actual upstream system exist to validate contract tests.

---

## 9. Owner Questionnaire

To unblock W10, the following questionnaire must be submitted to the Retail Operations Lead, Head of Merchandising, and Lead Systems Architect. Questions are strictly separated into required gate blockers and optional operational improvements.

### 9.1 Required Decisions (Mandatory to Unblock W10)

1. **System Identity & Transport:**
   - What is the authoritative catalog system (e.g. ERP, Shopify Plus, Custom PIM, POS database)?
   - What are the staging/sandbox and production base URLs?
   - What is the canonical hostname for the network host allowlist?
2. **Authentication & Security:**
   - What authentication mechanism is required (e.g. HTTP Bearer Token, OAuth2 Client Credentials, API Key header)?
   - What is the exact header name (e.g. `Authorization: Bearer <token>`, `X-API-Key: <key>`)?
   - Is mTLS, static IP allowlisting, or private VPC networking required?
3. **Lookup Endpoints & Parameters:**
   - What is the exact HTTP endpoint path for looking up a single product by SKU (e.g. `GET /v1/products/{sku}`)?
   - What is the exact HTTP endpoint path and parameter structure for product search/catalog listing?
   - Is SKU lookup strictly case-sensitive?
4. **Upstream Schema & Field Mappings:**
   - Can you provide sanitized JSON responses for:
     a) A standard in-stock product
     b) A discounted product with active promotion
     c) An out-of-stock product
   - What are the upstream field names for regular price, promotional price, currency, and stock status?
   - What are the exact string values or codes used for stock availability?
5. **Pricing & Currency Semantics:**
   - Are prices tax-inclusive or tax-exclusive?
   - What decimal scale is used for USD and KHR?
   - How should KHR rounding and display formatting be handled?
6. **Promotion & Discount Authority (`W03-DEC-003`):**
   - Does the upstream API supply the authoritative `promoPrice` and discount percentage, or is the content system expected to compute discounts? (Specification recommendation: upstream precedence, no AI calculations).

### 9.2 Optional Operational Improvements (Non-blocking for Initial Adapter)

1. **Pagination Semantics:** What pagination mechanism is supported for full catalog listing (opaque cursor vs page/limit, max page size)?
2. **Caching & ETags:** Does the API emit `ETag` or `Last-Modified` headers, or support `If-None-Match` conditional requests?
3. **Webhooks / Event Stream:** Does upstream support event notifications (e.g. `product.price_changed`, `product.stock_depleted`) for proactive cache invalidation?
4. **Rate Limits & SLOs:** What are the steady-state and burst requests-per-minute limits, and does the upstream API return `Retry-After` on HTTP 429?
5. **Lifecycle & Deletions:** How are discontinued, archived, or deleted products identified (tombstones vs HTTP 404)?

---

## 10. Safe Development Boundaries (Allowed Work While Blocked)

While W10 remains blocked awaiting owner confirmation, engineering may safely proceed with the following activities:

1. **Fixture-Based Local Development:** Continue testing application services, validation logic, and workflows using deterministic in-process fixtures (`MockProductSource`, `fictional-products.ts`, `geparlys-products.ts`) in `development` and `test` environments.
2. **Downstream Package Scaffolding:** Work on downstream packages that consume the stable `ProductSnapshot` contract (e.g. W20 Layered CreativeScene models, W21 typography, W22 template families) using fixture snapshots.
3. **Contract Test Harness Preparation:** Refine test harnesses (`product-source.contract.ts`) that can immediately run against mock, sandbox, or future HTTP adapters once a contract is supplied.
4. **Normalization Boundary Refinement:** Author unit tests verifying `normalizeExternalProduct` error handling under various synthetic malformed JSON inputs.

---

## 11. Production Work Prohibited While Blocked

The following actions remain strictly prohibited until owner sign-off is documented:

1. **No Runtime Adapter Authoring:** Do not write speculative HTTP clients, endpoint paths, or field mappers for unconfirmed APIs.
2. **No Promotion of Decision W03-DEC-001:** Do not mark `W03-DEC-001` as `APPROVED` in `w03-business-decision-register.md`.
3. **No Production Feature Enabling:** Do not set `FEATURE_PRODUCT_API=true` in staging or production environments.
4. **No Production Fixture Fallbacks:** Do not modify `selectProductSource` to serve mock or fictional data in production.
5. **No External Network Probing:** Do not make network calls, DNS requests, or curl commands to suspected or unverified external endpoints.
6. **No Production Publishing:** Publishing remains permanently fail-closed pending W61.

---

## 12. Verification and Quality Audit

- **Runtime Code Invariant:** Verified that zero application source code, tests, schemas, or migrations were modified during this gate.
- **Git State Invariant:** Verified that zero files were staged (`git diff --cached --name-only` is empty) and all 93 pre-existing modified files remain completely intact.
- **Secret Protection Invariant:** Verified that no secret keys, tokens, or credential values are displayed or recorded in this document.
- **Single File Invariant:** The only file created or updated is `docs/implementation-evidence/W10-product-api-readiness.md`.

---

## 13. Final Readiness Verdict

```
W10 BLOCKED — OWNER-CONFIRMED PRODUCT API CONTRACT REQUIRED
```
