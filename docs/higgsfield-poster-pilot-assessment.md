# Higgsfield poster pilot assessment

> Update 6 November 2026: the application-side MCP adapter and no-cost fake-server verification are described in [Server-side Higgsfield MCP](higgsfield-server-mcp.md). Earlier Codex/developer-API notes below are historical or apply to the separate adapter; they do not establish a live application OAuth connection. Paid dispatch remains gated.

Verified 2026-11-05, without submitting a generation or changing the Higgsfield account.

## Connection and pricing

The Codex Higgsfield MCP connection answered a read-only balance request: 606.4 credits, Pro plan. This is a snapshot, not a spending limit or evidence of the separate developer API balance. The MCP model catalog lists image-reference support for Nano Banana and Marketing Studio, but returned no per-image credit cost. An Ads Studio quote for one square concept was refused because the account needs an Ads Studio brand; no brand was created. A quote for that workflow cannot be substituted for a different MCP model.

Higgsfield's developer API is a separate product and prepaid balance: https://open.higgsfield.ai/terms-of-service. Its Marketing Studio Image page lists $0.0121 per image for 1k, low quality, auto aspect ratio, and $0.0162 standard price, but the public pages display differing promotions and this is not a quote for MCP credits or for another configuration: https://open.higgsfield.ai/models/marketing-studio/image. Confirm the exact rate and balance for the selected interface and settings before dispatch.

## Current poster path

The creative provider port produces backgrounds only. The generation use case checks validated content and a canonical product asset, generates a background, composites the real product, stores the asset, and advances it to validation. The editor provides preview and review/approval controls. The Higgsfield SDK adapter implements a separate text-to-video provider; it is not an image provider or an end-to-end video flow. Codex MCP OAuth does not provide the app with an API credential or an operating account.

No historical poster collection was found in the tracked project files. Existing brand source ingestion is metadata, not a reviewed reference library; the prior discovery notes do not establish rights or a complete archive. Input images would guide a particular generation, not train or fine-tune a model. Do not transmit unreviewed historical media or infer current prices from it.

## Blocking work before paid image dispatch

- Establish an app-side interface, credentials, exact model contract, price and API balance, independent of the Codex MCP session. Add a bounded image adapter with safe output retrieval, validation and durable storage; preserve the background-only/product-compositing boundary.
- Implement a shared, atomic, fail-closed USD budget reservation covering all providers and existing commitments. Record actual or conservatively estimated charges, hold ambiguous outcomes until reconciled, and account for taxes and external usage. Existing reservations are optional, use fixed estimates and can release on errors after dispatch. They do not verify a $20 monthly hard limit.
- Prevent duplicate paid submissions: the creative queue currently requests three attempts, and the use case creates a job during execution. Persist a stable dispatch identity and provider state, avoid retries after an uncertain submission, and provide a reconciliation path. A timeout is not proof that a request was uncharged.
- Ingest and review rights-cleared historical examples, select and pin approved references, and document provider data handling. Add a user-visible preflight, generation progress, actionable errors, preview and review using the existing approval controls.
- Exercise the pipeline with a no-cost fake, including uncertain outcomes, duplicate delivery, budget exhaustion and review; obtain an exact quote and explicit user confirmation before a real generation. Do not publish or share the result.

Until these prerequisites are implemented and verified, the app cannot safely create a Higgsfield poster under the requested pilot constraints. No live generation was tested in this assessment.

## Implementation follow-up

A separate persistent-Post background-image adapter and dispatch ledger are now implemented and verified with a no-cost fake provider. See [Post image generation](post-image-generation.md) for current behavior and setup. The initial assessment above describes the earlier state, not proof of a live test. The app still needs its own developer API credential, verified output hosts, an exact quote/current developer balance and explicit one-request confirmation. The monthly hard-limit and historical-reference-library gaps remain.
