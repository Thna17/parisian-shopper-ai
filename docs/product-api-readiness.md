# Product API Readiness & Upstream Integration Guide

**Document:** `/docs/product-api-readiness.md`  
**Audience:** Backend Engineers, Upstream Integration Team, Solution Architects  
**Phase Context:** Phase 1G (Hardened MVP Foundation) -> Phase 2 Transition  

---

## 1. Architectural Foundation & Current State

The Parisian Shopper AI system implements the Clean Architecture Ports & Adapters pattern to strictly decouple product data ingestion from AI content generation:

```
[Upstream Product Systems]
 (ERP / Shopify / Custom PIM)
              │
              ▼
┌──────────────────────────────────────────────┐
│  ProductSource Port (TypeScript Interface)   │
│  - getProductBySku(sku)                      │
│  - searchProducts(query, options)            │
└──────────────────────┬───────────────────────┘
                       │
       ┌───────────────┴───────────────┐
       ▼                               ▼
[MockProductSource]        [LiveHttpProductSource]
(Phase 1 MVP - Fictional)   (Phase 2 Production Adapter)
```

In Phase 1 MVP, all product operations execute against `MockProductSource` using validated fictional fixtures (`FICTIONAL_PRODUCTS`). The core domain and Telegram bots interact exclusively with the `NormalizedProductEnvelope` schema (`Zod`), guaranteeing that swapping the mock adapter for a live HTTP client in Phase 2 requires **zero modifications** to domain logic, validation engines, or Telegram workflows.

---

## 2. Upstream Contract Gap Analysis

Based on the contract draft specification in `/docs/product-api-contract-draft.md`, the upstream product management system (PIM/ERP) must supply the following fields:

| Field Name | Type | MVP Status | Phase 2 Requirement | Gap / Impact if Missing |
|---|---|:---:|:---:|---|
| `sku` | String (unique) | Supported | Mandatory | Primary foreign key for snapshotting. |
| `product_name` | String | Supported | Mandatory | Primary product title. |
| `brand` | String | Supported | Mandatory | Injected into brand guidelines. |
| `price` & `currency` | Decimal, ISO 4217 | Supported | Mandatory | Required for `PRICE_MISMATCH` validator. |
| `promo_price` | Decimal | Supported | Optional | If missing, promotions cannot be validated. |
| `discount` | Object | Supported | Optional | `{ percentage, start_date, end_date }`. |
| `stock_status` | Enum | Supported | Mandatory | `IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`. |
| `fragrance_notes` | Object | Supported | Mandatory (Perfumes) | Top, heart, base notes. Critical for luxury perfumes. |
| `concentration` | String / Object | Supported | Optional | EDP, EDT, Extrait de Parfum. |
| `country_of_origin` | String | Supported | Optional | Required for origin grounding. |
| `images` | Array of URLs | Supported | Mandatory (Phase 2) | High-res product images for Telegram visual cards. |

---

## 3. Upstream API Operational Requirements

To ensure high availability and prevent cascade failures, the upstream Product API must provide:

1. **HTTP Caching & ETags:**
   - Upstream endpoints must return `ETag` headers.
   - The Phase 2 adapter will send `If-None-Match` to reduce bandwidth and avoid unnecessary snapshot duplication.
2. **Deterministic Response Times:**
   - 95th percentile response time must be `< 500 ms`.
   - Upstream adapter enforces a hard timeout of `3,000 ms` with circuit breaker protection.
3. **Webhook Notifications (Recommended for Phase 2):**
   - Upstream system emits `product.updated` and `product.price_changed` webhooks.
   - Allows proactive cache invalidation rather than aggressive polling.

---

## 4. Phase 2 Migration Plan (Zero Domain Impact)

1. **Implement `HttpProductSource` Adapter:**
   - Location: `packages/application/src/modules/products/infrastructure/http-product-source.ts`.
   - Implements `ProductSource` interface using `fetch` or `axios` with Axios-Retry.
2. **Dependency Injection Binding:**
   - In `ProductModule`:
     ```ts
     {
       provide: PRODUCT_SOURCE,
       useClass: config.productApi.useLive ? HttpProductSource : MockProductSource,
     }
     ```
3. **Environment Configuration:**
   - `PRODUCT_API_BASE_URL`
   - `PRODUCT_API_KEY` or `PRODUCT_API_BEARER_TOKEN`
   - `PRODUCT_API_TIMEOUT_MS`
4. **Integration Testing:**
   - Verify upstream adapter with WireMock / mock HTTP server in CI before connecting production endpoints.
