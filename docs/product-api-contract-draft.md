# Product API contract draft

**Project:** Parisian Shopper AI Telegram Content System  
**Status:** Draft for Product API owner review  
**Environment:** Contract design only; no production connection authorized  
**Data in examples:** Entirely fictional

## Purpose

This contract defines the normalized product data the content system needs from the existing Parisian Shopper product database/API. The upstream system remains the factual source of truth. The content system may cache an immutable snapshot for a generation request, but it may not correct, enrich, or overwrite canonical product facts with AI output.

## Classification model

- **REQUIRED:** every active product response must contain a non-null valid value.
- **OPTIONAL:** may be absent or `null`; generated content must not invent it.
- **CONDITIONAL:** required only when its stated condition is true; otherwise absent or `null`.
- **CONTROLLED:** an authoritative marketing fact. Only the Product API or an explicitly authorized deterministic rule may set it. AI and Telegram edits cannot modify it.

`CONTROLLED` is a governance classification, not a presence classification. A field can therefore be both `CONDITIONAL` and `CONTROLLED`.

## Normalized fields

| Field | JSON type | Presence | Controlled | Validation and meaning |
|---|---|---|---:|---|
| `sku` | string | **REQUIRED** | Yes | Stable, unique, case-preserving SKU; trim surrounding whitespace; recommended pattern `^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$` |
| `product_name` | string | **REQUIRED** | Yes | Official display name; 1–300 Unicode characters; must not be translated or rewritten in the canonical snapshot |
| `brand` | string | **REQUIRED** | Yes | Official brand display name; 1–120 characters |
| `category` | string | **REQUIRED** | Yes | Canonical category code or approved label from a documented taxonomy; not free-form AI output |
| `price` | decimal string | **REQUIRED** | Yes | Regular/base selling price in major currency units; non-negative; string format such as `"128.00"` to avoid binary floating-point errors |
| `currency` | string | **REQUIRED** | Yes | ISO 4217 uppercase code, for example `USD` or `KHR`; defines `price` and `promo_price` |
| `promo_price` | decimal string or null | **CONDITIONAL** | Yes | Required when a promotion is active; same currency and precision as `price`; must be non-negative and normally not exceed `price` |
| `discount` | object or null | **CONDITIONAL** | Yes | Required when a promotion is active or an approved discount claim is displayed; structure defined below; must reconcile deterministically with prices or carry an explicit upstream calculation method |
| `description` | string or null | **OPTIONAL** | Yes | Approved source description; maximum agreed length; AI may use it as source context but may not treat unsupported prose as structured facts |
| `images` | array of objects | **OPTIONAL** | Yes | Approved product assets only; each item includes HTTPS URL, role, position, and optional checksum/alt text; empty array is valid |
| `stock_status` | string | **REQUIRED** | Yes | Enum: `in_stock`, `low_stock`, `out_of_stock`, `preorder`, `discontinued`, or `unknown`; never infer quantity from this field |
| `product_url` | string or null | **OPTIONAL** | Yes | Canonical HTTPS product page URL on an approved host |
| `fragrance_notes` | object or null | **CONDITIONAL** | Yes | Required only for fragrance categories when curated note data exists; structured top/heart/base arrays; preserve source wording |
| `concentration` | object or null | **CONDITIONAL** | Yes | Required when concentration is a defined product attribute, especially fragrances; use code plus approved label, not model inference |
| `size` | object or null | **CONDITIONAL** | Yes | Required when the SKU represents a size/volume variant; decimal string plus controlled unit |
| `country_of_origin` | object or null | **OPTIONAL** | Yes | ISO 3166-1 alpha-2 code plus approved display name; distinguish manufacturing origin from brand origin if both are ever added |
| `similarity_claims` | array of objects | **CONDITIONAL** | Yes | Present only for explicitly reviewed and approved claims; each claim needs text, approval status/source, and optional expiry; empty array means no permitted claim |

## Controlled subtypes

### `discount`

```json
{
  "type": "percentage",
  "value": "20",
  "label": "20% off",
  "calculation_method": "upstream",
  "starts_at": "2026-10-01T00:00:00+07:00",
  "ends_at": "2026-10-31T23:59:59+07:00"
}
```

- `type`: controlled enum `percentage`, `fixed_amount`, or `none`.
- `value`: decimal string; interpretation depends on `type`.
- `label`: optional approved display label. AI may omit the claim but cannot rewrite its value.
- `calculation_method`: `upstream` or a named approved deterministic rule.
- `starts_at` and `ends_at`: ISO 8601 timestamps including offset; nullable only if the promotion truly has no boundary.

### `images[]`

```json
{
  "url": "https://static.example.invalid/products/PS-FIC-001/front.jpg",
  "role": "primary",
  "position": 1,
  "alt_text": "Fictional perfume bottle front view",
  "sha256": "b2a3f1c8d4e5a69700112233445566778899aabbccddeeff0011223344556677"
}
```

- `role`: controlled enum `primary`, `gallery`, `packaging`, or `swatch`.
- Only HTTPS URLs from configured hosts are accepted.
- A checksum is recommended when snapshots must prove which asset version was used.

### `fragrance_notes`

```json
{
  "top": ["Fictional bergamot", "Fictional pear"],
  "heart": ["Fictional jasmine"],
  "base": ["Fictional cedar", "Fictional musk"]
}
```

Each array contains curated labels. The content system may change sentence structure around them but cannot add, remove, substitute, or reclassify notes while claiming to describe the product.

### `concentration`

```json
{
  "code": "EDP",
  "label": "Eau de Parfum"
}
```

The code must come from an agreed enumeration such as `EDT`, `EDP`, `PARFUM`, or a non-fragrance value defined by the Product API owner.

### `size`

```json
{
  "value": "75",
  "unit": "ml",
  "display": "75 ml"
}
```

Allowed units must be documented, for example `ml`, `g`, `kg`, `piece`, or `set`. Conversion is not allowed unless a deterministic approved rule is added to the contract.

### `country_of_origin`

```json
{
  "code": "FR",
  "name": "France"
}
```

The field means manufacturing/product origin unless the API owner explicitly defines another meaning. AI must not infer origin from brand identity.

### `similarity_claims[]`

```json
{
  "claim_id": "claim-fictional-001",
  "text": "Fictional approved similarity statement for demonstration only",
  "status": "approved",
  "approved_by": "fictional-merchandising-review",
  "approved_at": "2026-09-15T10:00:00+07:00",
  "expires_at": null
}
```

Only entries with `status: "approved"` and no expired `expires_at` may appear in generated content. An absent or empty array expressly prohibits similarity claims.

## Proposed read endpoints

Endpoint names are illustrative and must be aligned with the existing API rather than imposed on it.

### Fetch one product by exact SKU

```http
GET /v1/products/{url_encoded_sku}
Accept: application/json
```

Expected behavior:

- `200` with one normalized product envelope;
- `304` when `If-None-Match` matches, if ETags are supported;
- `404` when the SKU does not exist or is not visible to the caller;
- `409` if the upstream system detects ambiguous/duplicate SKU data;
- `429` with `Retry-After` for rate limiting;
- stable structured `5xx` errors with a correlation ID and no sensitive internals.

### Search products

```http
GET /v1/products?query={url_encoded_query}&cursor={opaque_cursor}&limit=20
Accept: application/json
```

Search should return compact records containing at least `sku`, `product_name`, `brand`, `category`, `price`, `currency`, `promo_price`, `stock_status`, and the primary image when available. Selection must be confirmed by exact SKU before generation.

## Product envelope

The normalized product should be wrapped in source metadata used to create an immutable snapshot:

```json
{
  "schema_version": "1.0",
  "source_system": "fictional-parisian-product-catalog",
  "source_record_id": "fictional-record-10001",
  "source_version": "fictional-version-42",
  "retrieved_at": "2026-10-04T09:30:00+07:00",
  "updated_at": "2026-10-03T16:45:00+07:00",
  "etag": "\"fictional-etag-v42\"",
  "product": {
    "sku": "PS-FIC-001",
    "product_name": "Rivière de Lune",
    "brand": "Maison Exemple",
    "category": "fragrance",
    "price": "128.00",
    "currency": "USD",
    "promo_price": "102.40",
    "discount": {
      "type": "percentage",
      "value": "20",
      "label": "20% off",
      "calculation_method": "upstream",
      "starts_at": "2026-10-01T00:00:00+07:00",
      "ends_at": "2026-10-31T23:59:59+07:00"
    },
    "description": "A fictional floral-woody fragrance created only as contract-test data.",
    "images": [
      {
        "url": "https://static.example.invalid/products/PS-FIC-001/front.jpg",
        "role": "primary",
        "position": 1,
        "alt_text": "Fictional Rivière de Lune bottle",
        "sha256": "b2a3f1c8d4e5a69700112233445566778899aabbccddeeff0011223344556677"
      }
    ],
    "stock_status": "in_stock",
    "product_url": "https://shop.example.invalid/products/PS-FIC-001",
    "fragrance_notes": {
      "top": ["Fictional bergamot", "Fictional pear"],
      "heart": ["Fictional jasmine"],
      "base": ["Fictional cedar", "Fictional musk"]
    },
    "concentration": {
      "code": "EDP",
      "label": "Eau de Parfum"
    },
    "size": {
      "value": "75",
      "unit": "ml",
      "display": "75 ml"
    },
    "country_of_origin": {
      "code": "FR",
      "name": "France"
    },
    "similarity_claims": []
  }
}
```

All names, identifiers, URLs, descriptions, prices, images, notes, and timestamps in this example are fictional. The reserved `.invalid` domain prevents accidental production use.

## Snapshot requirements

For every generation request, the content system must store an immutable snapshot containing:

- normalized product envelope;
- schema version and source system;
- source record/version/ETag when supplied;
- retrieval timestamp;
- canonical JSON digest such as SHA-256;
- adapter version that performed normalization;
- validation result and any missing optional/conditional fields;
- request correlation ID, without storing credentials.

A later product update creates a new snapshot. It never alters a snapshot already associated with a content revision or approval.

## Deterministic validation rules

Before a content revision can enter approval:

1. Every required field passes type and constraint validation.
2. Active promotion fields are internally consistent.
3. Exact controlled strings/numbers used in generated content match the snapshot or an explicitly approved locale representation.
4. Currency formatting is deterministic and locale-aware without changing the amount.
5. Stock claims map only from the controlled `stock_status` vocabulary.
6. Notes, concentration, size, origin, and similarity claims are prohibited when their source field is absent or null.
7. Similarity claims must reference a currently approved claim record.
8. Product URLs and image URLs pass scheme and host allowlists; fetching media must include SSRF protections.
9. Validation failure produces a blocked revision with machine-readable reasons; an LLM cannot override it.

## Authentication and operational requirements to confirm

- Machine-to-machine authentication method: preferably short-lived OAuth2 client credentials or workload identity; static keys only if securely rotated.
- Least-privilege read-only scope for catalog access.
- TLS required; certificate validation may not be disabled.
- Documented rate limits, burst limits, timeout budget, and `Retry-After` behavior.
- Pagination with opaque cursors and stable sort semantics.
- Idempotent reads and correlation IDs.
- API versioning and deprecation notice period.
- Availability and freshness SLOs, especially for price, promotions, and stock.
- Redacted structured logs and approved data-retention period.
- Non-production sandbox or fixtures; production credentials must not be used for development.

## Open decisions for the Product API owner

1. Are `brand` and `category` guaranteed for every active SKU?
2. Is `price` tax-inclusive, and how many decimal places are valid for each supported currency?
3. Is `discount` authoritative, derived, or both? Which value wins if price math and label disagree?
4. What exactly does each `stock_status` mean, and can copy say “available now” for `low_stock` or `preorder`?
5. Are Khmer and English approved names/descriptions available as separate controlled fields? If so, add explicit locale objects rather than letting AI translate canonical names.
6. Are fragrance notes curated per SKU or inherited from a parent product?
7. Does `country_of_origin` mean manufacturing origin, formulation origin, brand origin, or customs origin?
8. Who approves similarity claims, and what evidence, territory, channel, and expiry restrictions apply?
9. Are image URLs stable, signed, expiring, or access-controlled?
10. Can the API supply `source_version`, `updated_at`, or ETag data for snapshot freshness and change detection?

The contract is structurally sufficient for architecture and test planning, but it is **not integration-ready** until the Product API owner resolves these decisions and supplies sanitized representative fixtures.
