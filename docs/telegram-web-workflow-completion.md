# Shared Telegram and web Post completion checklist

> Current planning status: see [10 November completion plan](completion-plan-2026-11-10.md). Historical migration, verification and open-checkbox statements below may have been superseded; all 32 local migrations were deployed during the Prompt 11 restoration.


Baseline verified: **7 November 2026**. Scope: implementation planning and no-cost verification, not feature implementation or production sign-off.

## Sources and preservation rules

Read the complete supplied `Parisian_Shopper_AI_Telegram_Content_System_Implementation_Plan.docx` (September 2026, 22 sections and appendices) and [the alignment review](implementation-plan-alignment-review-2026-11-07.md). Rechecked the findings against current source, migrations, local database metadata and tests. Source code and fresh observations take precedence over historical completion claims.

No `AGENTS.md` was found in the repository, including hidden paths outside ignored dependency/Git directories, or at the checked ancestors from filesystem root through the repository's parent. Recheck instructions when working in a different checkout.

The worktree contains extensive modified and untracked implementation: Post API/UI, provider adapters, migrations, product synchronization, review/export, tests and supporting documents. These are existing work, not disposable files. This baseline adds only this checklist. Do not reset, clean, overwrite, broadly format, seed, replay migrations or rewrite history to obtain a clean baseline.

Preserve existing caption/creative tools, URLs, product snapshots, media, revisions, author identities, approval decisions and audit events. New shared behavior must be additive. No fabricated business approvals, synthetic historical authorship or silent conversion of old approvals to complete-Post approvals.

## Evidence levels

- **Implemented:** inspected source/schema supports the behavior; this is not proof of successful external operation.
- **Fake-tested, fresh:** isolated no-cost tests executed during this baseline.
- **Fake-tested, historical:** earlier documented endpoint/browser/integration evidence, not rerun here.
- **Live-observed:** only the specific local service/database observation stated. This does not imply real Telegram, catalog or provider verification.
- **Live-tested:** real external operation with recorded evidence. No Telegram delivery, provider generation or publishing was live-tested in this task.

Unchecked work below is deliberately not declared complete because a related module exists.

## Current baseline and corrections to older claims

- [x] Re-read the plan and audit; inspect working changes, package scripts, relevant services, navigation, tests and SQL migrations.
- [x] Fresh unit verification: **176 tests passed in 14 suites**. Evidence: `app/output/runtime/workflow-baseline-unit-tests.log`. Coverage includes Telegram commands/tokens/formatting/recovery, visual review, factual validation, caption revision, analytics queries, Post review/export/policy/worker and freshness evaluator/policy. Passing tests do not mean the gaps below are fixed.
- [x] Web `http://127.0.0.1:5173/` returned HTTP 200; API `http://127.0.0.1:3000/health` returned `{"status":"ok"}`. No fresh browser flow was executed.
- [x] Read-only `_prisma_migrations` inspection: all **27 migration directories** have finished, non-rolled-back records locally. This is migration bookkeeping, not a full schema-drift/checksum/restore audit. No migrations were applied here.
- [x] Read-only active brand inspection: **one active rule version contains business-confirmation placeholders**. Do not treat the development defaults as approved business guidance.
- [x] **Changed observation:** local MCP connection metadata now says **CONNECTED**. Earlier statements that there is no recorded app connection are no longer an accurate description of local metadata. Token validity/refresh, authenticated tool compatibility, real balance, shared-use permission and real generation remain unverified. No encrypted credentials were printed, copied or tested externally.

### Configuration observations, without secrets

Saved `app/.env` selects `AI_PROVIDER=codex_cli`, `CREATIVE_PROVIDER=codex_cli`, `POST_IMAGE_PROVIDER=higgsfield_mcp`. Its Telegram/text/image/creative feature flags are true, while auto/Meta/Telegram-channel publishing flags are false. `HF_MCP_DISPATCH_ENABLED=false` and `HF_MCP_SHARED_USE_CONFIRMED=false`. Encryption-key and callback configuration are present; the separate image developer-API key is absent. MCP does not require treating that developer key as its credential.

**Saved configuration is not proof of a running process's effective environment.** Previous launches used explicit safe overrides; this task checked reachability, not every running override. Do not start the normal worker or load the full saved environment for a smoke test: it may activate integrations. Use explicit isolated test configuration and injected transports. No flags were changed by this task.

Recent Post-related migration files:

| Migration | Inspected protections |
|---|---|
| `20261105120000_persistent_staff_posts` | Posts/revisions/events, legacy version/media links, restrictive FKs, revision uniqueness and append-only revision/event triggers. |
| `20261105140000_post_image_generation` | Per-source-revision generation uniqueness, provider request uniqueness, immutable generation configuration/completed output, claim/lease fields. |
| `20261106010000_complete_post_review` | Review rounds, caption draft/validation, validation and campaign snapshots. |
| `20261106090000_higgsfield_server_mcp` | Encrypted connection state, append-only connection audit, separate credit estimates/actuals/quote. |
| `20261106160000_staff_content_flow` | Additive creation plan and rejected status. |

Do not edit an applied migration. Future schema changes need a new migration, historical-row compatibility and isolated upgrade verification.

## 1. One persistent Post shared by web and Telegram — IMPLEMENTED / FAKE-TESTED

Updated implementation evidence, 7 November 2026:

- `app/packages/application/src/modules/posts/post-workflow.port.ts` defines application-owned save inputs, read projections and repository ports. `PostWorkflowService` handles shared create/read/list/revise/variation/review commands and saved-image/approved-product evidence checks. Database transactions still enforce ownership, exact version links, contributors, revision/round concurrency and append-only history.
- `PostGenerationCommands` provides shared generation preparation and authorized generation-state reads using the existing ledger/provider/asset safeguards. It does not authorize spending.
- `PostsController` delegates these business commands; provider quoting/confirmation and HTTP/download transport remain web responsibilities.
- `TelegramPostWorkflow` renders the same persistent Post, saved image, full captions, campaign/facts, feedback, generation state and recorded provenance. Numeric identities resolve to the same internal user and role permissions used by the web.
- New `/create` selections are marked as complete-Post flows and pin a product snapshot. Final confirmation saves the Post using a durable flow request key without enqueuing legacy caption work or authorizing provider spending. Unmarked historical flows and old ContentJob/CreativeJob callbacks retain legacy semantics.
- `/posts`, `/posts reviews`, `/posts approved`, `/post ID`, `/postprepare ID REVISION` and revision/round-bound `/postchanges` are available. Review/submit buttons use persisted identity-bound action tokens and exact revision IDs/review rounds. Full caption/design editing, optional campaign changes, paid quote confirmation and downloads continue in the authenticated web workspace for the same Post.
- New web creation sends a stable per-form request key. A creator-scoped unique key plus transaction advisory lock returns the existing Post on identical concurrent/retried requests; changed details with the same key return a conflict. Old callers without a key remain compatible.
- Post changes and generation events append `POST_CHANGED` outbox intents in their database transaction. Delivery reads current authorized data and never invokes generation or review commands. A per-recipient acknowledgment skips recipients already delivered on retries. Telegram/network response ambiguity can still duplicate a notification; callback/business effects remain protected.
- Migration `20261107120000_shared_post_workflow` adds nullable request key/hash, a unique index and per-recipient notification acknowledgments. It does not rewrite historical records or approvals. **Applied only in disposable test databases; deployment to the normal database is pending.**

**Verification:** fresh 105 targeted unit tests, 22 disposable PostgreSQL integration tests and 192 web tests passed. Real API HTTP checks in an isolated fake-provider harness also passed: six concurrent creates produced one Post, changed reuse returned 409, and six generation prepares produced one fake submission and a saved poster/captions. No real Telegram message or provider generation was performed. Evidence and limitations are detailed in [shared workflow verification](shared-post-workflow-verification.md).

**Dependencies retained:** existing Post/legacy data, image evidence and generation safeguards. Live activation requires the additive migration, built API/worker deployment, deliberate effective configuration and a separately authorized Telegram/provider trial. Do not restart services from the saved integration-enabled environment as a test.

**Acceptance:**

- [x] Shared application commands serve both adapters; no application import of Prisma/database implementations.
- [x] New Telegram requests use Posts; historical caption/creative flows and URLs remain available.
- [x] Telegram-created Post is read/edited in the web and reviewed through authenticated Telegram callbacks with identical product/caption/poster associations.
- [x] Actor identity, ownership, author exclusions, stale-round protection and replay rejection are enforced; link opening does not bypass web login.
- [x] Concurrent request creation, generation preparation, opposing decisions and stale writes have isolated database/endpoint evidence.
- [x] Notification intent commits with the state change; delivery failures do not replay business commands or erase decisions.
- [ ] Apply the migration and deploy built services in the intended environment with deliberate safe flags. Live Telegram behavior remains unverified and must not be labeled live-tested.

## 2. Actual AI captions and approved brand guidance — IMPLEMENTED / FAKE-TESTED; BUSINESS INPUT PENDING

Updated 7 November 2026. [Caption implementation and verification](post-ai-captions.md) contains the full contract, setup and limitations.

**Current evidence:** `PostCaptionService` reuses `AIContextBuilder`, the strategy registry, output schema, factual validator and existing text-provider implementations. A dedicated provider token disables silent mock fallback for Posts. Durable `PostCaptionAttempt` records pin the exact source revision, requested language/channel/purpose/brief, selected approved rule ID/digest, context, output, provider/request ID, authorship and provenance. A checked caption becomes a new immutable Post revision; image generation uses this exact saved caption. Captions and posters have separate status and errors.

An ACTIVE rule is no longer enough for Post AI generation: explicit administrator attestation of the exact rule digest/snapshot is required, placeholders are refused, and staff must select the approved version. No normal-database guidance was created or approved here. The separate full brand-pack authoring/reference-library work remains open.

**Verification:** 144 targeted unit tests, 26 disposable PostgreSQL integration tests and 196 web tests passed. Isolated real endpoints verified a mock caption under explicitly approved fixture rules and the exact same caption in its saved mock poster. No real AI or Khmer quality claim follows from those tests. Migrations are pending in the normal database; real caption dispatch defaults off.

**Dependencies:** deploy the additive migrations/built services; business-approved brand guidance; supported app-side text provider access/spending policy; human Khmer-language review before live staff use.

**Acceptance and remaining work:**

- [x] Post AI captions use the existing modular engine rather than an unlabeled generic template.
- [x] Exact brand/strategy/facts/context/output and author provenance are retained; caption/image outcomes remain separate.
- [x] Staff edits and explicit catalog templates remain usable and are labeled; a provider failure cannot silently become a successful mock or zero-cost real request.
- [x] Missing translations are explicitly incomplete or newly generated; no language switching copies English into Khmer or vice versa.
- [x] Promotion prerequisites and verified-source factual checks run; unsupported new-arrival claims are refused without arrival-date data.
- [x] Duplicate clicks/service replacement do not repeat uncertain charged text submissions. Saved responses can be recovered locally without provider dispatch.
- [x] Injected descriptions, brief/campaign context, feedback and previous drafts remain untrusted data in provider input.
- [x] New captions preserve previous versions and clear the old poster association; manual edits record lineage and approval continues to require the correct complete revision.
- [x] Implement versioned brand-pack drafts, explicit admin approval, reviewed source/library versions, exact Post pins and truthful reference usage; see [versioned brand guidance](versioned-brand-guidance.md). Verified with isolated fake providers and real local API endpoints.
- [ ] Supply and explicitly approve actual business guidance and rights-cleared examples. Historical poster images are not sent to the image provider; no training or fine-tuning is implemented.
- [ ] Verify real provider access, billing and output quality under separate authorization. No verified monthly hard cap is claimed.
- [ ] Run the human Khmer/English evaluation described in the implementation report. Script/field checks are not linguistic-quality proof.
- [ ] Provider-specific reconciliation for uncertain requests with no saved response remains an administrator/provider task; automatic resubmission is blocked.

## 3. Product eligibility and freshness — IMPLEMENTED / FAKE-TESTED; BUSINESS INPUT PENDING

See [shared product eligibility and freshness](product-eligibility-and-freshness.md) for architecture, release boundaries, evidence and deployment requirements.

- [x] Reuse source schemas, snapshots, dependency hashes, freshness policies/evaluator, assessment repository, strategy prerequisites and approved image/rights checks.
- [x] Show source/as-of and cached/test/unavailable status with alternatives in web and complete-Post Telegram previews; correct catalog readiness so old assessments do not remain freshly verified indefinitely.
- [x] Require approved current promotions and valid dates/prices; verified notes for note-based education; block unsupported new-arrival claims. Do not fabricate stock, discounts or benefits.
- [x] Implement explicit versioned business stock decisions on the existing policy ledger, with an administrator preview/confirmation screen. Missing special-stock decisions block affected actions rather than inventing policy.
- [x] Recheck before generation, review, approved export, publication/scheduling intent, confirmation/retry and the existing manual Telegram release boundary. No publishing integration was enabled.
- [x] Material source changes preserve prior facts/approvals, block release and require a separate editable revision and independent review.
- [x] Add advisory recent-product/concept and same-campaign repeat warnings separately from technical idempotency. They do not block intentional repeats or invent a cadence policy.
- [x] Isolated verification: 237 targeted unit tests, 28 database integration tests, 204 web tests and real local API checks using fake sources. No paid generation, live source verification or external messages.
- [ ] Apply reviewed pending migrations/builds to the intended application environment.
- [ ] Supply actual business-approved TTL/stock policies, real promotion approval evidence, canonical catalog configuration and human language/brand acceptance. New-arrival evidence and live-provider/production sign-off remain unverified.

## 4. Reliable Telegram interactions — IMPLEMENTED CORE, FAKE-TESTED; LIVE TRIAL PENDING

**Current evidence:** Telegram projects the shared Post revision and saved poster/Caption, provides creator field edits, persisted feedback proposals, independent review and authenticated approved-download links. The legacy in-memory selected-field Map is removed. The additive interaction migration persists actor, field, exact revision/review round, intended action, payload, expiration and expiring reply claims. New wizard callbacks pin their expected step; bound token and inbound-update deduplication remain active. `/newproducts` and `/promo` give honest source limitations; Promotion choices require approved current data.

**Verification:** 60 targeted unit tests, a broader 130-test Telegram regression run (overlapping), and 29 isolated Post integration tests passed. The fake Telegram transport exercised fresh application/repository instances, durable selected-field recovery, lost-claim recovery, concurrent replies, stale replies following web edits, cross-user/expired/replayed tokens, duplicate updates and zero generation dispatches for feedback. Existing integration cases cover independent review and exact fake-provider PNG projection. No live bot message was sent. See [Telegram experience evidence](telegram-shared-post-experience.md).

**Dependencies:** shared Post services, product eligibility, approved guidance/assets, matching additive migrations, configured app-side providers and existing spending authorization.

- [x] Persist complete pending Post action, field, actor, revision, expiration and expected review state.
- [x] Render the saved complete Post and link to the same web workspace.
- [x] Use Caption/Poster language and truthful generation states; suppress approval if saved image preview is unavailable.
- [x] Handle unsupported promotion/new-arrival discovery honestly.
- [x] Persist feedback proposals without automatic paid generation.
- [x] Reject duplicate, expired, cross-user and stale actions with practical recovery instructions.
- [x] Verify conversation persistence and callback replay with fake transport and isolated real database/application services.
- [ ] Apply pending migrations/build in the intended runtime; main/business database was not migrated here.
- [ ] Conduct a separately controlled live bot/device usability trial. Brand selection/AI Caption preparation, cost confirmation and downloads currently continue in the web. An exclusively Telegram generation/download flow is not claimed.

## 5. App-side Higgsfield image generation — IMPLEMENTED ADAPTER, LIVE OUTPUT UNVERIFIED

**Current evidence:** `app/packages/creative-providers/src/mcp/higgsfield-mcp.service.ts` implements app-owned OAuth, encrypted connection state and tool interaction; `higgsfield-mcp-image-provider.ts` provides image operations. `post-image-providers.module.ts` selects fake, MCP, separate REST or disabled providers. `PostImageProvider` already separates submit/status/download. Durable generation repository/worker stores claim state, quote/authorization, request IDs, images and provenance; ambiguous submissions enter UNCERTAIN. Generation uniqueness and immutability are protected by migrations.

The local connection record is CONNECTED, while saved dispatch/shared-use gates are false. A connection label does not establish usable tokens, account balance, live tool contract or billing behavior. Codex authorization and the separate developer API are not interchangeable with this app connection. Image settings in the current port are constrained to square/1k/low; do not advertise unsupported options. Staff Video remains planning-only.

**Verification:** fresh worker unit tests pass; earlier fake-MCP endpoint/browser/integration evidence is in [server-MCP documentation](higgsfield-server-mcp.md). No new authenticated external checks, quotes, balances or generation were requested.

**Dependencies:** items 1–3; supported app authentication/tool contract and permitted business use; approved product image; durable shared storage; explicit paid consent.

**Remaining work and acceptance:**

- [ ] Verify app-side token renewal/tool compatibility, output download allowlist and business-use requirements without assuming a CONNECTED row proves them.
- [ ] Test failure/timeout/response-loss/concurrent click/restart recovery with the fake server; no POST replay for an uncertain charged request.
- [ ] Persist actual selected brand/reference evidence and distinguish generated background plus authentic product, mock and imported media.
- [ ] Verify durable saved bytes, product fidelity, settings and cost/provenance association with the resulting Post revision.
- [ ] A future real test requires fresh exact prompt/settings/assets/references/quote/balance and explicit user confirmation. At most one submission; no old 0.25-credit quote.
- [ ] Keep unknown actual costs unknown and MCP credits separate from developer-API USD; do not claim a verified USD 20 monthly hard cap.
- [ ] Give video its own implementation/acceptance gate; do not imply the separate video SDK completes an MCP-backed Post video flow.

## 6. Complete-post review and approved downloads — IMPLEMENTED CORE, SHARED FLOW INCOMPLETE

**Current evidence:** `app/packages/application/src/modules/posts/post-policy.ts`, Post repository transitions/contributor checks and `app/apps/api/src/posts/approved-post-export.service.ts` enforce review/version/export behavior. Submitted revisions require poster/caption evidence. The new Post path does not require standalone caption approval first. Creator/requester/revision-contributor exclusions include administrators. Expected revision/review round and transaction checks address stale decisions. Append-only history and exact approved media/caption export mechanisms exist.

**Verification:** fresh Post policy/review/export tests pass. Earlier isolated browser evidence covers self-approval rejection, separate fixture reviewer, downloads and reapproval. No business record was approved and no new browser/download lifecycle was run here. Shared Telegram Post review is not yet established.

**Dependencies:** item 1 identity/commands/events; items 2–3 pinned content/facts; item 5 saved media; an actual independent business reviewer for pilot.

**Remaining work and acceptance:**

- [ ] Both interfaces show the same exact poster/captions/facts/campaign/channel and revision before Approve or Request changes.
- [ ] Keep backend contributor exclusions, expected revision/round and transaction protection; preserve every old decision and legacy caption approval.
- [ ] Explain why self-review is unavailable and that a second account controlled by the same person is not independent review.
- [ ] Request changes restores editability with feedback. Any approved-content change becomes a new draft requiring validation/reapproval.
- [ ] Rerun lifecycle/concurrency tests and exact byte/hash/dimension/caption association checks against isolated real endpoints.
- [ ] Keep unapproved exports restricted. Preserve old URLs and distinguish Downloaded/Exported from externally Published.
- [ ] Expose direct Post publishing only for actually connected complete-Post destinations; currently do not claim it works.

## 7. Accurate business reporting and operations — PARTIAL

**Current evidence:** `app/packages/database/src/analytics/prisma-analytics.repository.ts` queries legacy ContentJob/CreativeJob/approval/usage/publication records, not a complete Post/MCP rollup. `publishing/application/confirm-publication.use-case.ts` marks manual export PUBLISHED; it is not evidence of external delivery. Publishing config/gateway still permit a predictable proof-secret fallback. This is a pre-enable fix, not evidence that a live publishing attack occurred.

**Verification:** fresh analytics-query tests pass for current semantics; no live reporting accuracy, restore or publishing verification in this task.

**Dependencies:** shared events/revision semantics from items 1 and 6; cost/provenance from item 5; explicit KPI definitions and retention/backup owners.

**Remaining work and acceptance:**

- [ ] Add Post-inclusive backlog, request-to-approval, first-pass approval, revisions and failure/uncertain metrics without double counting linked legacy records.
- [ ] Include known costs with currency/unit and completeness; separate MCP credits, USD, estimates and actuals. Define subscription allocation separately.
- [ ] Distinguish actual external delivery from approved/downloaded/exported output; require external IDs/evidence for publishing claims.
- [ ] Remove predictable publishing-secret fallbacks; absent required secure configuration fails closed. Do not enable publishing as part of this change.
- [ ] Document generation kill switches, disconnect, durable media, backup/restore and uncertain-request operating procedures.
- [ ] Test metric definitions, empty periods, repeat submissions/revisions, linked records, unknown costs and access controls.
- [ ] Claim time savings only against a measured manual baseline; claim sales impact only with attribution.

## 8. Isolated E2E verification and controlled staff pilot — HISTORICAL FAKE EVIDENCE, NEW GATES OPEN

**Current evidence:** `app/scripts/verify-post-workflow.mjs` creates a disposable local database/storage, fixture users and fake providers/transports, replaces legacy queues and provides a separate browser origin. MCP mode injects a fake MCP server. Endpoint/fault/download scripts and `packages/database/test/integration/posts.integration-spec.ts` cover real application persistence. [Prior E2E report](post-workflow-e2e-verification.md) records a fake-provider browser lifecycle; later MCP/staff-flow documents record subsequent work. This is not one freshly rerun verification of all current work.

**Verification:** 176 fresh unit tests; no new integration/browser/UAT, real provider generation or live Telegram trial. Temporary fixture users, if created in later isolated tests, are authorization fixtures, not independent humans reviewing business output.

**Dependencies:** items 1–7 for functional gates; separately confirmed live-provider test; brand owner, staff and independent reviewer availability for UAT.

**Remaining work and acceptance:**

- [ ] Review the harness before running; explicit isolated credentials/DB/storage, fake network dependencies and queues, disabled external destinations. Fail closed if any live provider/transport can be selected accidentally.
- [ ] Browser-test creation, generation, refresh, editing, validation, submit, creator rejection, fixture reviewer approval, exact downloads and post-approval edit/reapproval.
- [ ] Add fake Telegram start/continue/review cases for the same Post and durable selected-field editing across restarts.
- [ ] Exercise failure, uncertain submission, concurrent callbacks/clicks, process replacement, database interruption and reconciliation without duplicate submission. Distinguish worker-instance replacement from OS/host failure.
- [ ] Check phone layout, keyboard/focus, Khmer typography, loading/recoverable errors and unsaved changes with no external publishing.
- [ ] Separately verify one authorized real poster before claiming real-provider readiness; a fake image is not a real generation.
- [ ] Evaluate 20 real products, including missing facts/images/notes, varied imagery, stock states and promotion boundaries. Agree spending and factual-error release blockers before paid evaluation.
- [ ] Run one-week staff UAT; record assistance needed, time-to-approval, first-pass quality, common edits, factual/language issues and costs. Do not fabricate results or assume a fixed passing time target.
- [ ] Record a controlled pilot decision with specific blockers. Production additionally requires effective configuration, storage recovery, operational ownership and live-provider acceptance evidence.

## Smallest reusable architecture for subsequent implementation

Do not replace the stack, add a second bot/backend or create a new content aggregate. Extend the existing layers:

```text
Web controllers                 Telegram commands/callbacks
       \                         /
        Shared Post application commands + authorization
          | immutable Post revisions / review rounds
          | generation ledger + transactional Post events
          | product revalidation + approved-image eligibility
          | existing strategy/brand/AI caption engine
          v
  Existing Prisma repositories and isolated worker
          | app-owned provider adapters + durable media
          v
  Post event/outbox delivery -> web status / Telegram transport
```

### Extraction boundaries

1. Define Post repository/transaction and generation ports in `packages/application` next to existing Post policies. Move application DTO/types there incrementally; do not import Prisma or concrete database repositories into the application layer. Keep HTTP DTO validation at the API boundary.
2. Extract the current behavior into shared commands for create/get/list/revise/submit/decide/prepare generation/confirm/reconcile/export eligibility. Retain established database constraints and transaction ownership; service extraction must not split atomic transitions.
3. Map web sessions and numeric Telegram identities into the same PostActor/permissions. Resolve real identities at the edge; never trust a callback-supplied role or author ID.
4. Use existing Post/PostRevision/PostEvent/PostGeneration as authority. Keep linked legacy caption/scene/media IDs where relevant; preserve inline caption drafts for compatibility. New brand/strategy/reference pins require additive fields or explicit versioned metadata on new revisions, not updates to append-only historical rows.
5. Reuse `AIContextBuilder`, strategy registry, provider abstractions and factual validator for caption preparation; reuse `RevalidateProductSnapshotUseCase`, freshness policies and `ProductAssetEligibilityEvaluator` for product safeguards. Do not copy these rules into Telegram and React.
6. Reuse `PostImageProvider`, durable ledger/worker and compositor/storage. Do not introduce a second image-dispatch queue or bypass immutable configuration/uncertain-state rules. Add caption dispatch tracking where necessary before enabling charged text retries.
7. Append Post notifications to the existing outbox in the same transaction as the committed state change. Telegram should render existing data, not generate content while delivering a notification. Bind actions to actor, revision and review round; delivery retries must not repeat business commands.
8. Preserve existing endpoints/routes as adapters. Add tests before redirecting new requests; keep historical legacy behavior explicitly accessible. No backfill of Post approval from separate old caption/image approvals without a separately designed migration/review policy.

### Implementation order and release gates

| Order | Deliverable | Required gate |
|---|---|---|
| A | Shared Post commands/ports + Telegram continuity | Cross-interface isolated tests, unchanged legacy records/URLs and authorization. |
| B | AI captions, brand pins, language fix, eligible/fresh facts | Fake-provider tests plus approved business guidance; no false language/generation labels. |
| C | Durable Telegram editing/delivery + shared complete review | Restart/replay/stale/concurrency tests; exact revision and independent approval. |
| D | App-side image proof and approved exports | Fake MCP fault tests first; fresh confirmation before any one real generation; exact durable output/download evidence. |
| E | Post-inclusive reporting, usability and UAT | Accurate metrics, fresh browser lifecycle, real-output proof and one-week staff evaluation. |
| Later | Video, campaign bundles, automated publishing | Separate explicit acceptance for each provider/destination, costs and operational safeguards. |

Business dependencies to obtain without inventing them: approved brand assets/rules/examples and rights; canonical catalog owner/refresh policy; content-purpose mapping and stock policy; an independent reviewer; actual provider support/business-use requirements; spending definition and retention/backup ownership.

## Completion record for this baseline task

- [x] Checklist created with current evidence, dependencies, gaps and acceptance gates for all eight requested areas.
- [x] Existing work and local database preserved; no migration/seed or account/approval mutation.
- [x] External generation, messages and publishing not requested. **Cost incurred: 0 credits / USD 0.**
- [x] Fresh unit results and local reachability recorded; fake versus live capability distinguished.
- [x] Shared Post application services, new Telegram request continuity and isolated verification implemented in the follow-up task; see item 1 and the verification report.
- [x] Modular Post AI captions, language-copy prevention, explicit brand-rule approval evidence and isolated no-cost verification implemented; see item 2.
- [ ] Real approved brand content, linguistic-quality acceptance, complete freshness/release integration, legacy field-edit durability, real provider/video/publishing and staff UAT remain unfinished gates.


## Brand-guidance implementation follow-up — 7 November 2026

- Implemented: existing profiles/rules/source archives/datasets extended with explicit profile approvals, append-only rights reviews and source versions, verified CAS uploads, admin previews, approved pack/example selection, immutable Post snapshots and approved export provenance. Existing standalone URLs/data remain.
- Fake-tested: reference eligibility, stale review conflicts, unauthorized changes, exact version associations, later profile/source versions, permission revocation, unmodified past provenance, selected-logo/palette composition, independent review and approved manifests. Real isolated Nest endpoint checks passed; see the linked report for logs.
- Limits: current image-provider contract accepts no historical image references. Caption examples are untrusted style data; image provenance never claims they were sent. No live generation, actual business approval, linguistic sign-off, external messages or publishing occurred.
- Remaining: apply reviewed pending migrations/builds to the intended environment; obtain actual business assets/rules/permissions and human language/brand acceptance. The brand workflow implementation does not establish production readiness or a live-provider quality result.
