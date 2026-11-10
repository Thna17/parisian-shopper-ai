# AI text provider

`AITextProvider.generate(context, signal)` is the only application-facing provider port. SDK response objects never cross it.

| Provider | Use | External calls | Notes |
|---|---|---:|---|
| `fake` | tests and explicit local demos | No | Deterministic development copy, visibly warned as not marketing-approved |
| `deepseek` | production / cost-effective runtime | Yes | Official OpenAI-compatible Chat Completions API (`https://api.deepseek.com`); JSON object structured output mode with strict prompt framing and canonical Zod validation; recommended model `deepseek-chat` (DeepSeek-V3) |
| `openai` | optional configured runtime | Yes | Official Apache-2.0 TypeScript SDK; Responses API structured output; canonical Zod validation still runs |
| `codex_cli` | local private runner | No | Runs locally via Codex CLI (non-production only) |
| `disabled` | feature flag off | No | Fails closed if invoked |

Configuration is centralized: `AI_PROVIDER`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` (default `deepseek-chat`), `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`), `OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_REQUEST_TIMEOUT_MS`, `AI_ATTEMPT_STALE_AFTER_MS`, and `AI_MAX_RETRIES`. Credentials are required only when text generation is enabled for the selected provider (`deepseek` or `openai`). For Post captions, `POST_CAPTION_REAL_DISPATCH_ENABLED=true` is also required. Production fake use requires the explicit `AI_ALLOW_FAKE_IN_PRODUCTION=true` escape hatch and should be operationally reviewed.

There is no automatic provider fallback. Authentication and invalid requests are permanent failures; timeouts, 429s, network failures, and temporary provider failures may be retried within queue bounds. The SDK performs zero internal retries so the job policy remains observable and centralized.

The adapter follows the official [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs) and validates the parsed result again. Automated tests never call OpenAI. A real-provider smoke test has deliberately not been added because there is no approved test credential/budget in Phase 1C.
