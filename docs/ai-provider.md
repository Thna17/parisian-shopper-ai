# AI text provider

`AITextProvider.generate(context, signal)` is the only application-facing provider port. SDK response objects never cross it.

| Provider | Use | External calls | Notes |
|---|---|---:|---|
| `fake` | tests and explicit local demos | No | Deterministic development copy, visibly warned as not marketing-approved |
| `openai` | optional configured runtime | Yes | Official Apache-2.0 TypeScript SDK; Responses API structured output; canonical Zod validation still runs |
| `disabled` | feature flag off | No | Fails closed if invoked |

Configuration is centralized: `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_REQUEST_TIMEOUT_MS`, `AI_ATTEMPT_STALE_AFTER_MS`, and `AI_MAX_RETRIES`. The OpenAI key and model are required only when text generation is enabled and provider is `openai`. Production fake use requires the explicit `AI_ALLOW_FAKE_IN_PRODUCTION=true` escape hatch and should be operationally reviewed.

There is no automatic provider fallback. Authentication and invalid requests are permanent failures; timeouts, 429s, network failures, and temporary provider failures may be retried within queue bounds. The SDK performs zero internal retries so the job policy remains observable and centralized.

The adapter follows the official [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs) and validates the parsed result again. Automated tests never call OpenAI. A real-provider smoke test has deliberately not been added because there is no approved test credential/budget in Phase 1C.
