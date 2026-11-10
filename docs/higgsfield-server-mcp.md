# Server-side Higgsfield MCP implementation and verification

> Later update: [Staff content flow redesign](staff-content-flow-redesign.md) documents the five-stage web journey, saved creative direction and feedback loop. Local OAuth settings are now staged, with spending still disabled; the earlier statement that local configuration was unchanged describes the previous verification run. No real application OAuth or generation has been completed.

6 November 2026. No real generation was submitted, including the previously quoted 0.25-credit request. No real account was connected by this implementation, no business record was approved, and nothing was published or sent. The existing Codex authorization was not read or copied.

## Result and readiness

There is now a dedicated application-side MCP client, OAuth connection flow, image adapter, exact-credit confirmation, durable Post dispatch and existing final-review/download integration. An isolated real-Chrome lifecycle and real HTTP endpoints were verified against a loopback **fake MCP server**. This is sufficient for an isolated staff usability demonstration. It does **not** establish live Higgsfield compatibility, permission for shared internal use, unattended token renewal in the real account, real image quality, brand similarity, or production readiness. Paid dispatch defaults off.

The main local app environment was not changed to enable paid dispatch or given provider credentials. Public metadata verification is separate from completing application OAuth. Administrators must finish the setup and verification below before a real provider pilot.

## Contract: documented, observed, and still unverified

Official references consulted:

- [Higgsfield MCP overview](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-higgsfield-mcp): hosted MCP and account-credit billing. This is distinct from the developer API and its dollar balance.
- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization): protected-resource discovery, OAuth, PKCE and resource binding.
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), including its Streamable HTTP client and authentication implementation.

Anonymous, read-only requests to the actual server established:

- `https://mcp.higgsfield.ai/mcp` responds to unauthenticated initialization with 401 and protected-resource discovery metadata.
- Its resource metadata identifies that exact resource and `https://clerk.higgsfield.ai` as authorization server, with `openid email offline_access` scopes.
- The issuer metadata advertises authorization, token, dynamic registration and revocation endpoints, authorization-code/refresh grants and S256 PKCE. These URLs are obtained from validated metadata, not guessed at dispatch time. Only the fixed resource/issuer origins are permitted; redirects are rejected.

No real client registration, consent, code exchange, token refresh, authenticated direct-server tool listing, upload or generation was performed. Advertised registration does not prove that this application will be accepted. Provider confirmation of shared internal business use and unattended operation remains required. `HF_MCP_SHARED_USE_CONFIRMED` is an operator gate, **not** evidence of provider permission.

The image adapter implements the provisional tool contract exposed by the connected Higgsfield tool catalog: `balance`, `list_workspaces`, `get_preferences`, `models_get`, `estimate_image_cost`, `generate_image`, and `jobs_wait`. The app discovers actual tool names on every new transport session and refuses operations when the required tools/results are unavailable. It expects structured JSON and does not scrape text into a purported successful image. A real app-side Check connection and a fresh exact quote must verify compatibility; the Codex plugin catalog alone does not verify identical direct-server schemas.

The supported initial request is one `gpt_image_2_6` background, square 1:1, 1k, low quality, PNG, count/batch size one. There is no model substitution. Unsupported price adjustments, missing workspace selection, unavailable exact cost/balance, or automatic project creation prevent quoting/dispatch. Workspace preferences and the exact price/balance are checked again before submission.

Uploads and historical reference input are deliberately **not implemented or claimed verified**. This path sends a background brief without image references, then composites the governed product photograph locally. A future reference-upload implementation needs verified direct-server schemas, rights checks, approved reference selection and exact reference-bound consent. No historical poster was used, and no model training occurred.

## Implementation

- `app/packages/creative-providers/src/mcp/higgsfield-mcp.service.ts`: official SDK Streamable HTTP client; dedicated OAuth client; PKCE, one-use ten-minute state and issuer/resource checks; serialized token refresh and connection changes; sanitized failures; exact model/credit/workspace preflight and single submission.
- `app/apps/api/src/posts/higgsfield-mcp.controller.ts`: admin-only connection, read-only check and disconnect. Callback is authorized by the expiring server-held state/PKCE and rechecks the initiating administrator's current account status/permission. It does not depend on a cross-site session cookie, which is important for SameSite=Strict production cookies. Replays fail. Callback responses are no-store/no-referrer. The provided nginx exact callback location disables access logging; any additional proxy/APM must also redact query codes/state.
- Additive migration `20261106090000_higgsfield_server_mcp`: encrypted connection state, connection epoch, append-only connection audit, estimated/actual credit columns and saved quote on the existing ledger. Existing Post/review/version records remain intact. The local migration was deployed successfully.
- AES-256-GCM protects OAuth credentials and pending PKCE material at rest, with random IV and authenticated application context. The encryption key is server configuration, never a Vite variable. Disconnect clears local credentials and increments the epoch before best-effort remote revocation; network failure cannot restore them. Connect/refresh/disconnect/dispatch coordinate through a database row lock. Key rotation requires planned re-encryption or reconnect; no automatic key-rotation feature is claimed.
- `POST_IMAGE_PROVIDER=higgsfield_mcp` selects this adapter. `higgsfield` remains the separate developer REST image adapter; existing video SDK and old URLs remain available. Codex CLI and browser automation are not application workers.
- Staff prepare a request from their persistent Post, obtain the exact credit quote and authorize that fingerprint through a user with `MANAGE_AI_BUDGETS`. Creator-only quote preparation prevents another user changing the brief. A budget manager can authorize an accessible prepared Post without becoming its content reviewer. Changes to the quote, request, expiry or connection invalidate consent.
- The existing worker uses a saved ledger and claim tokens. One generation row is created per source revision under locks. The claim is committed before a potentially charged call. There is no automatic paid POST retry. Known IDs are persisted and reused for polling; an accepted request whose response/ID is lost stays uncertain. Provider timeout or worker death cannot authorize a replacement request. Recovery needs reconciliation of the original ID; unknown IDs remain blocked rather than guessed. No provider-side idempotency guarantee is claimed.
- The background and final PNG are saved in content-addressed durable storage, with governed product-photo evidence and digest. The final 1080×1080 poster and captions become a new immutable Post revision. Refresh/worker restart do not rely on the staff browser staying open. API and worker still need the same durable storage and database to operate after deployment.
- Captions are **catalog-template suggestions or saved staff edits**, not Higgsfield image-model text generation. The initial template is simple bilingual product/price/CTA text; it does not fully interpret a creative brief. Existing caption tools remain usable. Natural-language caption quality needs further product work or a separately verified LLM integration.
- The exact saved poster and caption revision undergo final independent review. Creator, requester and submitted revision contributors, including administrators, remain excluded. Another login controlled by the same person is not independent review. Revisions after approval invalidate approval; stale decisions/downloads fail. Standalone approvals are untouched.
- Provenance records provider/model/settings, frozen prompt, empty external reference list, approved local photo evidence, provider request ID, credit estimate/quote, unknown actual cost where unavailable, and catalog/staff caption source. Fake MCP images are labeled mock based on provenance. MCP credits never masquerade as developer API USD.

There is **no verified monthly dollar or credit hard cap**, including the earlier $20 preference. Exact per-request consent does not enforce total spending across account website use, other tools, taxes, exchange rates or legacy adapters. Actual MCP charges remain unknown when the provider does not supply a verified per-request charge; balance deltas are not treated as attribution.

## Administrator setup

1. Confirm with Higgsfield that a business-owned OAuth client may serve this shared staff application and renew access unattended. Obtain any required client registration/approved redirect arrangement. Do not reuse an employee's Codex tokens. The app can use advertised dynamic public-client registration or a pre-registered confidential client; real acceptance is still unverified.
2. Apply migrations, install the locked dependencies, build and restart the API and worker. Set `POST_IMAGE_PROVIDER=higgsfield_mcp` in **server** configuration. Keep `HF_MCP_DISPATCH_ENABLED=false` and `HF_MCP_SHARED_USE_CONFIRMED=false` until verification is complete.
3. Supply `HF_MCP_ENCRYPTION_KEY` as a securely generated 32-byte lowercase hex key through secrets management. Supply `HF_MCP_REDIRECT_URI` using the exact staff reverse-proxy callback, e.g. `http://127.0.0.1:5173/v1/integrations/higgsfield-mcp/callback` locally or `https://staff.example.com/v1/integrations/higgsfield-mcp/callback` in production. HTTPS is required except development loopback. Register this exact URI with the provider. Restrict secret access, redact callback logs and back up encrypted credentials together with a protected key-recovery plan.
4. If using a pre-registered client, set `HF_MCP_CLIENT_ID`, `HF_MCP_CLIENT_SECRET` and `HF_MCP_CLIENT_AUTH_METHOD=client_secret_post|client_secret_basic` as required by its registration. Otherwise the app attempts advertised dynamic registration with a public client and S256 PKCE. Missing/unsupported registration fails without generation.
5. An administrator opens Advanced tools → Connect Higgsfield (`/settings/higgsfield`), completes provider consent themselves, then uses Check connection and credit balance. Select the intended business workspace in the provider; this implementation does not automatically create or switch a workspace/project. Confirm automatic project creation is off. Check missing-tool/contract errors before enabling dispatch.
6. Set `HF_POSTER_ASSET_HOSTS` to exact verified provider image-output hostnames; no wildcards, IPs or arbitrary redirects. This setting is shared with the separate REST image adapter but does not share credentials or balances. Confirm secure download of real outputs before the live pilot. Configure `CREATIVE_ASSET_STORAGE_ROOT` as a durable **shared absolute path** for API and worker, with database/media backup and restore verification.
7. Ensure each selected product has governed, rights-cleared approved image evidence. A catalog thumbnail alone is insufficient. Do not auto-approve real product photos or historical references for convenience.
8. Only after provider support/contract checks, set the shared-use gate, image/creative feature flags and paid-dispatch flag. For the first real generation, obtain a **fresh** exact model/prompt/settings/reference quote and current balance, then the user's explicit confirmation. Submit at most once. No old quote carries over.

## No-cost verification and evidence

Run `node scripts/verify-post-workflow.mjs --mcp` from `app/` after building. It creates a random disposable PostgreSQL database and media directory, synthetic governed product photo/campaign and separate test creator/reviewer accounts. It overrides MCP network access with a loopback fake server that blocks other hosts, replaces Redis/legacy queues, and displays an isolated-test banner on `http://post-test.localhost:5184`. The normal app at 5173 and live provider queues are not used. Test controls exist only in this harness. SIGTERM/SIGINT cleans its fixture resources.

`node scripts/verify-server-mcp-endpoints.mjs` runs real HTTP permission, quoting, concurrent-click, timeout, lost-response, failure and restart checks against that harness. It asserts fake MCP mode first. The bootstrap verifies admin-initiated OAuth, a valid callback **without a session cookie** (303) and replay rejection (400).

Verified in actual Google Chrome:

1. Keyboard-select synthetic Moonlit River Eau de Parfum; save brief, Facebook, bilingual language and campaign.
2. Prepare request; obtain fake exact quote and fake balance; explicitly confirm only the fake request. One MCP-shaped submission; saved mock background/product composite and captions.
3. Refresh; image, captions, campaign and product persist. Edit CTA; save revision 3; caption validation passes.
4. Submit complete post; creator/admin approval endpoint returns 403. Sign in as separate fixture reviewer, find Reviews, inspect complete saved draft and approve through keyboard.
5. Download PNG, caption text/JSON and manifest through Chrome. Actual Downloads files match the authenticated saved image bytes and approved caption object. PNG: 1080×1080, 106645 bytes, SHA-256 `75ee926c28e3ecb43e9c8a9c2c8cb49b142de9ec18fb8b01726b898151a1b825`.
6. Edit approved CTA as creator. Unsaved navigation shows a confirmation; dismissing retains edits. Saving creates draft revision 4, retains four versions and history, disables exports, and rejects old download/stale decision with 409.
7. At 390×844: both images loaded, document width/scroll width both 390, mobile menu opens by keyboard with focus on Close and closes with Escape. Desktop and phone proof screenshots saved.
8. Admin settings route displays server-owned connection, fake credit balance from the app-side transport, and honest video/dispatch information. No real consent screen was used in this test.

Real HTTP fault checks confirm eight concurrent prepare clicks produce one row; no dispatch before exact consent; wrong fingerprint/non-budget user blocked; polling timeout recovers across worker restart with the same provider ID and one submission; lost response stays uncertain without a replacement; terminal failure remains failed after restart. Backend integration tests cover token encryption, PKCE/state/replay, refresh serialization/failure, disconnect/revocation outage, quote invalidation on price/epoch change, review conflicts and versioned downloads.

Check results and remaining suite limitations are recorded in the final implementation report. Evidence: `app/output/playwright/server-mcp-*.json`, `server-mcp-approved-desktop.png`, `server-mcp-approved-mobile.png`, `download-proof.json`, `reapproval-proof.json`. Fixture IDs are disposable and disappear on cleanup.

## Video and deployment gaps

The existing Higgsfield video adapter uses the **separate developer API SDK**. It is not wired to this MCP poster flow or a completed staff video editor/review/download lifecycle. Staff video creation remains unavailable. Reuse this OAuth transport/consent/ledger pattern only after verifying video schemas, duration/resolution pricing, input-video/image rights, output allowlists, durable video storage, review and one-request recovery semantics.

Before a real controlled staff pilot: complete actual business app OAuth, authenticated tool/schema checks, supported refresh/shared-use verification, governed real photos, verified output hosts and a user-approved one-request live test. Before production: operational TLS/secrets/backup/restore/monitoring, measured concurrency and long-running refresh behavior, and an agreed spending policy are still required. This implementation is not a claim that all project features or legacy test suites are production-ready.

## Final checks

- Full frontend suite: **187 tests passed**, 34 files.
- Targeted worker, provider, configuration, complete-Post review and export unit suites: **56 passed**, five suites.
- Disposable PostgreSQL Post/MCP integration suite: **18 passed**, including real SDK transport against the fake HTTP server.
- Application `pnpm typecheck`, production web build, focused backend/integration-test/script ESLint and module boundaries passed. The production web build still warns about its existing large main JavaScript chunk; code splitting remains a performance follow-up.
- The spending checkbox is bound to the generation ID and exact quote fingerprint. A quote replaced by another browser clears effective consent; a dedicated frontend test verifies this. Missing output-host setup blocks quotes/dispatch before spending.
- Broader `tsc --noEmit -p tsconfig.test.json` is **not green**: older authentication/approval/creative test fixtures still report interface/type mismatches. This focused implementation did not repair every legacy test fixture or run every repository suite, and does not claim whole-repository production certification. The test path mapping was corrected to resolve source index files consistently rather than mixing source and built private class types.
- Real provider requests submitted: **0**. Real costs incurred: **0**. Live business approvals/publications/external sends: **0**.

The final HTTP fault run was repeated after the last changes and passed with three fake submissions and zero real charges. Fixture monitoring was moved ahead of the production rate limiter in the **test harness only**, so status inspection does not exhaust the normal API quota; real application routes keep their limiter. The disposable harness cleanup was made idempotent and its database, media and temporary account file removal were verified. The ordinary web/API services were not running at the final local reachability check; restart them after administrator configuration. No live worker or provider queue was started for these tests.
