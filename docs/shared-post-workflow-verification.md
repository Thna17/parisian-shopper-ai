# Shared Post workflow implementation and verification

7 November 2026. This completes the shared-record/application-service implementation slice from [the checklist](telegram-web-workflow-completion.md). It is not live Telegram, live-provider or production acceptance.

## Result

New web and Telegram requests use the existing persistent Post, immutable revisions and generation ledger. Shared application services own creation, listing, reading, editing, variations, generation preparation and review preflight. The repositories retain their existing transactional ownership, association, contributor and stale-decision checks. No new parallel content aggregate was introduced.

### Implementation map

| Component | Responsibility |
|---|---|
| `app/packages/application/src/modules/posts/post-workflow.port.ts` | Application-owned save inputs, Post projections and repository interface; no Prisma dependency. |
| `post-workflow.service.ts` | Shared commands, common input validation, authorized reads, revision-bound preview/integrity checks, current approved-product-photo review preflight and decision delegation. |
| `post-generation.commands.ts` | Shared preparation and authorized generation status reads through existing ledger/provider ports; preparation does not confirm spending. |
| `posts.module.ts` | Exposes the shared services using existing product and media safeguards. |
| `app/packages/database/src/posts/prisma-post.repository.ts` | Implements the Post port; existing atomic policies retained; creator-scoped creation deduplication added. |
| `app/packages/database/src/posts/post-outbox.ts` | Appends a Post event and notification intent in the same database transaction. |
| `app/apps/api/src/posts/posts.controller.ts` | Existing URLs/DTOs/guards preserved; delegates shared commands. Provider quote/confirmation and HTTP/download handling remain here. |
| `app/packages/application/src/modules/telegram/application/telegram-post-workflow.ts` | Resolves the same Post view and invokes the same commands using internal user IDs and server-resolved roles. Renders saved media, full captions, facts, campaign snapshot, reviewer feedback and generation provenance/status. |
| Telegram command center and module | Mark new wizard selections as complete-Post requests; pin product snapshot; save one Post on confirmation. Persisted legacy flows retain old semantics. |
| Telegram outbox dispatcher/repository | Projects committed Post changes to authorized creator/reviewer identities; records successful delivery per recipient so partial retries skip acknowledged recipients. |

`PostRepository` remains generic over its read result so API consumers keep the richer existing view without importing database implementation types into application services. The concrete adapter continues to return original versions, events and associations. This is an incremental extraction, not a rewrite of every legacy repository.

## Staff behavior

- New `/create SKU` selections follow the existing choice wizard and finish with **Save complete post draft**. A successful save is not described as generated media and does not call the legacy caption queue.
- Existing legacy flows that were already persisted without the new marker still create legacy caption jobs. `/status`, `/history`, old callbacks and old web URLs remain usable; no historical approval is converted into a final Post approval.
- `/posts`, `/posts reviews`, `/posts approved` list shared Posts; `/post ID` opens a current saved Post, including one created through the web.
- The card links to the same authenticated web workspace using a configured application CORS origin. This does not create a public share link or bypass login. A localhost origin is only useful on the machine hosting the app; production needs its reachable staff web origin.
- Full caption/design editing, optional campaign changes, paid quote/consent and approved downloads continue in that web workspace. Telegram displays those changes when opened/refreshed.
- `/postprepare ID REVISION` prepares the existing generation record. Spending still requires the web's valid quote and authorization. No paid request is submitted by the command adapter.
- Ready drafts offer Send complete post for review; eligible reviewers can approve the whole saved revision or request changes. Feedback uses `/postchanges ID REVISION REVIEW_ROUND Your feedback`, which survives process replacement because it does not depend on an in-memory pending chat state.
- Submit/decision actions bind Post ID, revision ID/number, review round and recipient identity. Creator/requester/author exclusions, including administrators, remain backend rules. A second account controlled by the creator is not independent human review.
- Long captions are split into messages instead of silently truncated. Missing poster previews are disclosed and review decisions still require saved-image integrity/product-image evidence.

## Idempotency and transaction boundaries

Migration `20261107120000_shared_post_workflow` adds nullable `posts.request_key`, `request_hash`, a creator/request-key unique index, and `post_telegram_deliveries` with per-event/identity acknowledgment.

- New web forms send a stable per-form key; Telegram uses its persisted creation-flow ID. A PostgreSQL transaction advisory lock serializes matching creator/key requests. Identical retry returns the existing Post; changed input with the same key returns 409. Different creators do not share the key namespace. Legacy clients without keys remain compatible; a new key represents a new request.
- Existing row locks, expected revision/round checks, revision uniqueness, append-only triggers and generation-ledger uniqueness remain intact. Replayed callbacks cannot record another decision or dispatch another generation.
- Post and generation mutations append outbox intent in their state-change transaction. Notification delivery only reads/render data; it never performs a decision, creates a revision or submits a provider request.
- Partial-delivery retries skip recipients whose success was acknowledged. Telegram has no universal exactly-once delivery guarantee: a lost response or a crash between sending and acknowledgment can duplicate a notification. This does not duplicate business decisions or paid dispatch. No exactly-once notification claim is made.

## Fresh verification

All tests used fake providers/transports or disposable fixtures. No normal app queue or business approval was used.

| Check | Result / scope |
|---|---|
| Targeted backend/Telegram suites | **105 tests passed, 12 suites.** Includes new adapter and notification retry tests plus existing policy/review/export/worker/legacy Telegram regressions. |
| Final adapter/notification rerun | **31 tests passed in 3 suites** after final rendering/readiness and preserved visual-direction changes; these are part of the targeted count, not additional unique tests. |
| Disposable PostgreSQL Post integration | **22 tests passed.** New creation deduplication and cross-interface tests plus existing generation, permissions, exact associations, contributor exclusion, stale/competing decisions, edits/reapproval and export tests. All migrations applied in the disposable database; it was removed afterward. |
| Full web suite | **192 tests passed in 34 files.** Creation expectation updated for the new request key. |
| TypeScript | API, worker, web and Telegram project builds passed. |
| Lint and module boundaries | Targeted backend/adapter/API/database files passed; boundary check passed. Frontend TSX is outside the root ESLint matching configuration; web build/tests cover it. |
| Isolated real HTTP endpoints | Application module booted with fake providers, disabled Redis/live queues, disposable database/storage and separate origin. Six concurrent create requests returned one Post; altered reuse returned 409. Six generation preparations produced one fake-provider submission, saved captions and a generated fixture image. |
| Saved mock image | Authenticated HTTP image response returned 200; SHA-256 equaled the linked generation's saved hash; PNG decoded at **1080×1080**. This was a fake-provider image, not real Higgsfield output. |

The cross-interface database test uses actual Post application services, actual web controller methods, actual Telegram command/callback handling, actual database identities/roles/tokens and the same database records. A Telegram-created Post is edited via the web adapter, then read and independently approved through Telegram. Wrong-user token use, creator approval, callback replay, stale revision and unauthorized editing are rejected. Caption/poster/image IDs are asserted; no legacy ContentJob is created by the new Post request. This is adapter/database integration evidence, not a real Telegram network or new real-browser test.

The isolated HTTP harness additionally verifies Nest module wiring and actual endpoint behavior. Its temporary accounts are authorization fixtures, not independent humans approving business content. No fresh browser UI lifecycle was run in this slice; the full web component suite and earlier browser evidence have different scopes.

Evidence files under `app/output/runtime/`:

- `shared-post-unit.log`, `shared-post-adapter-tests.log`
- `shared-post-integration.log`, `shared-post-web-tests.log`
- `shared-post-build.log`, `shared-post-lint.log`, `shared-post-final-lint.log`, `shared-post-boundaries.log`
- `shared-post-harness.log`, `shared-post-http-proof.json`

Initial checks caught an unsupported Prisma void result from the advisory-lock query, an accidental duplicate test import, and the old frontend expectation missing the request key. These were corrected and affected checks rerun successfully; failed runs are not reported as passes.

## Deployment and remaining work

The new migration was applied **only to disposable databases**. The normal app database and running integrations were not migrated/restarted or enabled by this task. Before deploying this code, back up the intended database, review/apply the additive migration using the normal deployment procedure, regenerate/build the applications and deploy compatible API/worker code together. Keep external feature flags deliberately disabled during verification; do not launch workers blindly from the integration-enabled saved environment.

The prior 27 migration records remain untouched. The new nullable fields preserve old Posts and do not backfill approvals or authorship. This is not a completed backup/restore or production upgrade rehearsal.

Separate checklist gates remain open: actual AI captions instead of templates, approved brand rules/references, complete freshness/release policy, durable selected-field editing in the legacy caption conversation, live app-side provider compatibility/quality/cost, video, direct Post publishing and real staff UAT. The optional campaign and detailed edit controls remain web-first for new Posts. None of these are silently claimed complete by sharing the record.

**External provider submissions: 0. Provider cost: 0 credits / USD 0. Actual Telegram messages sent: 0. Business approvals or publications: 0.**
