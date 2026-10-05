# Content strategies

The `ContentStrategyRegistry` owns the five MVP strategies. Strategies define objectives, inputs, context instructions, and generation eligibility; they do not perform Phase 1D factual validation.

| Strategy | Eligibility |
|---|---|
| `PRODUCT_SPOTLIGHT` | Core identity and price facts exist |
| `PROMOTION` | Source has `promo_price`, `discount`, and explicit start/end semantics; no discount is calculated |
| `SCENT_PYRAMID` | Verified structured top/heart/base notes exist; notes are never derived from description |
| `EDUCATIONAL` | Core product identity/category exists; unsupported performance, medical, origin, award, or similarity claims are prohibited |
| `ENGAGEMENT` | Core identity exists; questions/hooks may be creative but product attributes may not be invented |

Missing prerequisites return `MISSING_REQUIRED_PRODUCT_DATA` before a provider call. Platform values are `FACEBOOK`, `INSTAGRAM`, `TELEGRAM`, and `GENERIC`; they affect strategy only and do not publish content. Languages are `KM`, `EN`, and `BILINGUAL`.
