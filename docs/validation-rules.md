# Validation rules

`ps-factual-v1` uses independently testable rules registered in a deterministic order.

| Rule | Protected facts | Principal finding codes | Severity |
|---|---|---|---|
| Identity | SKU, explicitly labelled product name and brand | `SKU_MISMATCH`, `PRODUCT_NAME_MISMATCH`, `BRAND_MISMATCH` | BLOCKING |
| Money | Price, promo price, currency | `PRICE_MISMATCH`, `CURRENCY_MISMATCH` | BLOCKING |
| Promotion | Source discount and promotion presence | `UNSUPPORTED_DISCOUNT`, `DISCOUNT_MISMATCH` | BLOCKING; generic unsupported offer language is WARNING |
| Stock | Stock and lifecycle state | `STOCK_CONTRADICTION` | BLOCKING; source-backed low-stock urgency is WARNING |
| Size | Numeric value and unit | `SIZE_MISMATCH` | BLOCKING |
| Concentration | EDP, EDT, Parfum controlled aliases | `CONCENTRATION_MISMATCH` | BLOCKING |
| Fragrance notes | Top, heart, and base tier membership | `UNSUPPORTED_FRAGRANCE_NOTE` | BLOCKING |
| Origin | Explicit English/Khmer origin claims | `UNSUPPORTED_ORIGIN`, `ORIGIN_MISMATCH` | BLOCKING |
| Similarity | Approved source claim target and strength | `UNSUPPORTED_SIMILARITY_CLAIM`, `SIMILARITY_WORDING_EXCEEDS_APPROVAL` | BLOCKING |
| Performance | Unsupported longevity, waterproof, or clinical claims | `UNSUPPORTED_PERFORMANCE_CLAIM` | BLOCKING |

An INFO `VALIDATION_COMPLETED` finding records a clean execution. An unexpected rule failure yields `FAILED` with `VALIDATOR_INTERNAL_ERROR`; failure never makes content approval-eligible.

Rules do not infer a discount from prices, activate a promotion, derive fragrance notes from descriptions, infer origin from a brand, or look up similarity claims. Product lifecycle and stock availability can prohibit availability language. Exact numeric comparisons use canonical decimal strings, never floating-point arithmetic.
