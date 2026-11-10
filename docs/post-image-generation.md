# Persistent Post image generation

> Update 6 November 2026: the application-side MCP adapter and no-cost fake-server verification are described in [Server-side Higgsfield MCP](higgsfield-server-mcp.md). Earlier Codex/developer-API notes below are historical or apply to the separate adapter; they do not establish a live application OAuth connection. Paid dispatch remains gated.

Implemented 2026-11-05. No paid request has been submitted or live provider result verified for this implementation.

## What is connected

The staff workspace at `/posts/:id` prepares a poster and bilingual caption in one saved operation. Captions are explicitly **catalog-based suggested captions** (`catalog-template-v1`), not claimed LLM output. The background comes from the configured image service. The approved catalog photograph is never sent to the provider: the existing governed asset evaluator verifies its approval, rights, validation and digest, and the deterministic poster compositor places those actual bytes over the background with product name and snapshot price.

The new `post_generations` ledger saves the source Post revision, frozen prompt/settings/references, provider/model, provider request ID, estimated and known actual USD costs, caption, checks, product-image evidence, image digest and content-addressed storage key. Completion atomically creates a new immutable Post revision referencing the complete caption/poster artifact through `generation_id`. Existing caption versions, creative scenes, links and reviews are retained. Completed generation artifacts cannot be updated or deleted through the database.

The real adapter uses Higgsfield's documented asynchronous REST interface: POST `/marketing-studio/image`, then GET `/requests/:id/status`. It has no automatic POST retries. It uses one background request with `resolution=1k`, `aspect_ratio=1:1`, `quality=low`, `enhance_prompt=false`. The final composited poster is a 1080×1080 PNG. Model documentation: [Quick start](https://open.higgsfield.ai/quick-start), [Marketing Studio image API](https://open.higgsfield.ai/models/marketing-studio/image/api-reference).

No historical posters are used. External reference inputs are the frozen empty list. The local product photo is recorded separately in provenance. This is compositing, not model training or reference-guided generation from historical examples. The mock provider is clearly labelled and prohibited in production. Imported legacy work remains available in the existing tools; this new path does not relabel imported media as AI generation.

## Required application setup

Defaults leave this feature disabled. No Codex MCP credential or Pro-plan balance is copied into the application.

- `POST_IMAGE_PROVIDER=disabled|fake|higgsfield` (default `disabled`). Use `fake` only for development/testing.
- Live dispatch also respects `FEATURE_AI_IMAGE_GENERATION=true` and `FEATURE_CREATIVE_GENERATION=true`. Turning either off prevents a new paid submission; existing request status can still be reconciled.
- `HF_POSTER_API_KEY`: the complete **server-side Higgsfield developer API** key used with `Authorization: Key …`. This is deliberately separate from the existing video SDK's `HF_CREDENTIALS` and from MCP OAuth. Never put it in a browser/Vite variable, chat, screenshots or logs.
- `HF_POSTER_ASSET_HOSTS`: comma-separated exact public hostnames for the developer API's output images, confirmed from the provider; no URLs, IP addresses or wildcards. Redirects are rejected; downloads have a timeout, supported MIME allowlist and 15 MB streaming limit. A host failure triggers reconciliation/recovery, never another paid POST.
- `CREATIVE_ASSET_STORAGE_ROOT`: API and worker must use the **same absolute directory on durable shared storage**. The existing CAS adapter writes atomically and checks SHA-256 on reads. Back up this directory with the database; ephemeral container storage is insufficient.
- Run migrations and build/restart the API and worker. The new worker reads the durable database ledger every three seconds and does not rely on Redis job delivery for deduplication.

Currently the local environment has no poster developer API key or output-host allowlist, and `POST_IMAGE_PROVIDER` remains disabled. The adapter and no-cost pipeline are implemented; live-provider compatibility, exact account pricing and available developer API balance remain unverified.

## Before the first paid request

1. Configure the app-side credential and verified output hosts. Do not enable an exact request yet.
2. In a saved draft, prepare an image request. This requires both caption editing and creative editing permissions and an approved product photo. A live request is saved as `AWAITING_CONFIRMATION`; preparing it does not call the provider.
3. Read `GET /v1/posts/:id/generation`. Present the **exact generation ID, frozen model/settings/prompt, empty external references, local product-image evidence, expected USD cost and current developer API balance** to the user. Obtain an exact quote/balance from the developer API account; public promotional prices and MCP credits are not substitutes. This adapter has no documented balance or quote endpoint and returns those as unverified until independently checked.
4. Wait for explicit confirmation. An authorized budget administrator can then record it with authenticated, CSRF-protected `POST /v1/posts/:id/generation/confirm` containing `generationId`, `confirmed: true`, `expectedCostUsd`, `currentBalanceUsd`, ISO `verifiedAt`, and `evidence` describing the account/quote source without secrets. The generation ID must still match the inspected record. This is a recorded administrator attestation, not an automatic balance check. The verification/authorization expires five minutes after `verifiedAt`.
5. Only after that confirmation, enable **that one generation UUID** with `POST_IMAGE_CONFIRMED_REQUEST_ID` in the worker environment and restart/reload its configuration. Both this exact-ID gate and the unexpired recorded authorization are required before POST. Another generation has a different UUID and cannot inherit the authorization.
6. Check the saved provider request's status and review its result. Do not publish. Remove the exact-ID setting after the test. A completed request is immutable and cannot be submitted again.

Estimated cost is not actual cost. The provider's documented image status response does not expose a verified actual USD charge, so live actual cost remains null/unknown. Fake completed requests record zero. **No verified $20 monthly hard cap exists** in this implementation; it does not account for other tools, external account usage, taxes, or all legacy provider paths.

## Failure and restart behavior

- Requests are unique per source Post revision. A Post row lock serializes enqueue against edits; competing workers use atomic claims and fencing tokens. Active or uncertain requests block changes/new image requests for that Post.
- The `SUBMITTING` marker commits before a paid POST. A crash or timeout before saving the request ID becomes `UNCERTAIN`, even if it may have been charged. A worker must never move that record back to submission.
- With a saved request ID, subsequent work only polls GET status, downloads the existing result, or repeats local compositing. Poll/network errors remain uncertain. No new POST is used to recover them.
- `POST /v1/posts/:id/generation/reconcile` schedules a read-only status check for a known ID. If a background was saved but local rendering failed, it retries local compositing without image generation.
- Without a saved request ID, the request remains blocked. Contact the provider to establish the outcome and charge; no automatic "uncharged" reset or guessed request-ID attachment is provided. A provider-supported lookup or verified administrative reconciliation process is needed for that exceptional case.
- Before submission begins, the creator can cancel a queued/awaiting request with `/generation/cancel`. It cannot cancel an already-dispatched request or assume a refund.
- Completed drafts remain subject to independent review. The creator cannot approve them. An edit creates a new revision and invalidates approval. Generated artifacts require successful deterministic image/safety checks and valid caption structure before review. Automated checks do not establish that an AI background is visually flawless; the reviewer must inspect it.

## Validation

Automated verification uses a fake provider, synthetic product-photo/evidence fixtures, an isolated temporary PostgreSQL database, the real poster compositor and real temporary disk CAS storage. It covers complete caption/image persistence and reload, duplicate requests and competing workers, uncertain submission/restarts, failed request-ID persistence, quote/enablement gates, immutable output, self-approval rejection and independent approval. Frontend tests cover missing setup, uncertain-state reconciliation, honest mock/cost labels and the saved workspace. No live provider call, real business approval or external publication is part of these tests.

The older caption/scene editors still work. This new bundled artifact does not create a parallel legacy scene or standalone caption job, and it does not yet offer a separate caption editor or export/publishing integration for its output. Do not claim those legacy actions automatically apply to this new artifact.

## Final review follow-up

Bundled captions can now be edited in immutable Post revisions and retained when preparing a poster before human approval. There is one final Post review of the saved poster, captions, product facts, campaign context and channel; standalone caption approval is not a prerequisite. See [Complete Post review](complete-post-review.md). This supersedes the earlier caption-editor limitation above; export/publication integration is still separate.

## Approved download follow-up

Complete Posts now support verified downloads of the approved poster and exact captions, independent of legacy exports. See [Approved Post experience](approved-post-experience.md). This supersedes the earlier export limitation; direct publishing of complete Posts still has no supported integration.
