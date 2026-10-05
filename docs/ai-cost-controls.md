# AI Cost Controls & Model Economics

**Document:** `/docs/ai-cost-controls.md`  
**Audience:** Finance, Product Leadership, Engineering  
**System:** Parisian Shopper AI Generation Engine  

---

## 1. Supported Providers & Model Strategy

The system utilizes an abstraction layer (`AITextProvider`) supporting multiple LLM backends:

| Environment | Primary Model | Fallback Model | Use Case |
|---|---|---|---|
| **Local / CI / Acceptance** | `fake` (`FakeAITextProvider`) | None | 100% deterministic, zero cost, instant execution. |
| **Pilot (Default Recommended)** | `gpt-4o-mini` / `gemini-1.5-flash` | `gpt-4o` / `gemini-1.5-pro` | High quality, extremely low cost, sub-second latency. |
| **Production High-Complexity** | `gpt-4o` | `gpt-4o-mini` | Complex luxury copywriting and nuanced tone. |

---

## 2. Token Consumption & Cost Breakdown

### 2.1 Per-Generation Token Profiles

Based on empirical benchmarks using typical product snapshots (fragrance, watches, cosmetics):
- **Input Prompt Tokens:** ~800 to 1,200 tokens (includes product attributes, brand guidelines, formatting constraints, JSON schema instructions).
- **Output Completion Tokens:** ~350 to 500 tokens (structured JSON containing headline, Khmer caption, English caption, CTA, hashtags, facts used).
- **Total Tokens per Generation Attempt:** ~1,200 to 1,700 tokens.

### 2.2 Cost per Generation Attempt (Pricing as of 2026)

| Model | Input Cost / 1M | Output Cost / 1M | Cost per Attempt | Cost per 3-Version Job |
|---|---|---|---|---|
| **Gemini 1.5 Flash** | \$0.075 | \$0.30 | **\$0.0002** (~0.02¢) | **\$0.0006** |
| **GPT-4o-mini** | \$0.150 | \$0.60 | **\$0.0004** (~0.04¢) | **\$0.0012** |
| **GPT-4o (Full)** | \$2.500 | \$10.00 | **\$0.0075** (~0.75¢) | **\$0.0225** |

### 2.3 Internal Pilot Monthly Forecast (50 Products / Day)

Assuming a team of 5 marketing staff creating 50 draft jobs per day (average 2 versions per job = 100 generations/day):
- **Monthly Generations:** 3,000 generations / month.
- **Monthly Cost (Gemini 1.5 Flash):** ~**\$0.60 USD / month**.
- **Monthly Cost (GPT-4o-mini):** ~**\$1.20 USD / month**.
- **Monthly Cost (GPT-4o Full):** ~**\$22.50 USD / month**.

---

## 3. Technical Cost Guardrails & Controls

To prevent budget runaway, infinite loops, or denial-of-wallet attacks, the following guardrails are enforced:

1. **Attempt Timeout (`AI_ATTEMPT_TIMEOUT_MS`):**
   - Configured via environment (default: `25000` ms).
   - Any LLM API call exceeding 25 seconds is aborted via `AbortController`, preventing billing hangs on stuck sockets.
2. **Maximum Retry Cap:**
   - BullMQ worker retry limit is strictly capped at `3` attempts per job.
   - Exponential backoff prevents rapid repeated calls during provider outages.
3. **Creation Rate Limiting:**
   - Enforced per Telegram user: maximum `5` creation flows per `60` seconds (`telegram_rate_limit_buckets`).
   - Prevents automated script flooding from compromised Telegram accounts.
4. **Idempotency Deduplication:**
   - If BullMQ delivers a duplicate job message for an already completed version, `GenerateContentUseCase` immediately returns the existing version without invoking the LLM provider.
5. **Structured Schema Validation:**
   - All provider output is parsed with Zod (`aiContentOutputSchema`). Corrupted outputs fail fast before downstream processing.
