# AI captions in the shared Post workflow

Implemented and verified with no-cost fixtures on 7 November 2026. No real provider request, business brand approval, publication or linguistic-quality sign-off was performed.

## What changed

Posts now have a caption application service and their own durable caption-attempt ledger. The default **Generate caption** action uses the existing `AIContextBuilder`, content strategy registry, text-provider implementations, output schema and deterministic factual validator. It does not synthesize a catalog template and call that AI generation.

The staff flow is: save product/brief/purpose/channel/language/campaign → explicitly select an approved brand-rule version → generate and inspect a caption → prepare the poster using that exact saved wording → review the complete Post independently. Caption approval is not required before poster preparation. Caption and poster have separate progress, errors and evidence.

`Use catalog template — no AI` remains an explicit alternative. Manual writing/editing remains available. Mock, template, AI and staff-edit provenance are distinct. Image-only fake fixtures retain a labeled mock-caption compatibility path; live image adapters require a saved caption and never silently generate a template.

### Application and persistence

- `app/packages/application/src/modules/posts/post-caption.service.ts` builds the context, checks ownership/configuration/brand/prerequisites, controls one dispatch, captures responses, validates language/schema/facts, and saves or recovers a result.
- `post-caption.port.ts` defines application-owned provider/repository contracts. `app/packages/database/src/posts/prisma-post-caption.repository.ts` implements transactional source-revision association, approval evidence, dispatch claims and append-only output/version handling.
- `PostCaptionAttempt` pins Post/source revision/requester, provider/model, method, approved rule ID/digest, exact context, deadline, response/request ID, usage/provenance, checks and outcome. One source revision has at most one attempt. Changing method or brand requires an explicit new editable revision; it cannot silently replace an existing request.
- `PostRevision.captionGenerationId` associates the exact caption output; `captionProvenance` distinguishes generated text from later staff edits. Old revisions and legacy ContentVersion records are retained.
- A successful caption is a new immutable Post revision authored by its requester. It clears the old poster association because a poster must be prepared for the new wording. Previous poster/caption versions remain in history.
- Manual changes to wording clear the exact generated-caption link and record `STAFF_EDIT` with `basedOnCaptionGenerationId` where applicable. Unchanged wording retains its exact association. Language changes leave missing translations incomplete; they do not copy fields.
- The image worker consumes the saved caption and carries its generation/provenance into the completed image revision. The isolated HTTP proof checked equality between the caption output, saved Post caption and image-generation caption.
- Active or uncertain caption work blocks conflicting edits, review and image preparation in the backend. Existing independent review, contributor exclusions, revalidation and reapproval remain in force. An approved Post must first become a new editable draft before generation is allowed.

## Reused engine and trust boundaries

The caption path reuses the modular context/strategy/validation/provider components rather than invoking the legacy queue orchestrator, whose retry and automatic-fallback behavior is unsuitable for this Post dispatch contract.

Product facts, descriptions, staff brief, campaign context, reviewer feedback and previous drafts are data. Approved brand rules and controlled strategy instructions are trusted policy. The context explicitly permits style/content preferences only within verified facts and approved rules; provider serializers keep the brief and feedback in the untrusted input section.

Product spotlight, promotion and educational purposes use existing strategies and prerequisites. Gift/lifestyle use the existing engagement strategy with purpose-specific instructions; custom requests use spotlight plus the untrusted brief. **New arrival is refused without authoritative arrival-date data** rather than inventing recency. A promotion with missing/expired source promotion data fails before dispatch.

Language/schema checks reject missing requested fields, Khmer captions containing no Khmer-script text and identical bilingual fields. Latin product/brand names remain allowed. These checks detect limited defects; they do not prove fluency, translation accuracy, style or factual completeness. Deterministic factual checks also have semantic limits; human review remains required.

The legacy caption language switch now refuses missing target translations instead of placing English in Khmer or Khmer in English. Existing content is preserved, and the error directs staff to generate or write the missing translation. It also rejects a version from a different content request.

## Approved brand guidance

`ACTIVE` alone is not treated as business approval. `PostCaptionBrandApproval` stores an append-only attestation by an authorized administrator over the exact rule digest and snapshot. Nothing automatically approves existing rules.

- Generation requires the explicitly selected rule ID to be active, digest-approved and free of `TODO_BUSINESS_CONFIRMATION` placeholders.
- Changed rules invalidate eligibility for the old digest. Retirement/change during generation blocks attachment until reconciled; old request context and output remain recorded.
- Administrators can inspect active rule options using `GET /v1/posts/caption/brands`. Invalid historical rule schemas are excluded from selectable options; this does not repair or approve them.
- After reviewing the complete rules and their current digest, an administrator can explicitly attest using `POST /v1/posts/caption/brands/:brandId/approve` with `{ "digest": "<current digest>", "confirmed": true }`. This endpoint requires ADMIN authorization and does not approve any Post.
- Regular staff receive selectable approved versions. The staff dropdown never silently chooses the latest version or a placeholder rule.

The normal database's unfinished brand guidance was not altered or approved by this implementation. A full brand-pack authoring/reference-library experience remains a separate checklist item. No historical poster images were used, and no model training is claimed.

## Providers, configuration and costs

`POST_CAPTION_PROVIDER` is registered by the existing AI provider module using the configured `AI_PROVIDER` and feature flag. It reuses:

- Fake text provider for explicit test mode; output says `MOCK_AI_CAPTION`.
- OpenAI text adapter with the application's configured API key/model and SDK retries disabled.
- Codex CLI adapter for supported local environments, with development mock fallback explicitly disabled for Posts. The CLI's existing production restrictions still apply.

The separate Post provider token bypasses the legacy wrappers' silent mock fallback and uncertain-charge cancellation behavior. It does not claim to implement a verified monthly hard cap. Missing OpenAI configuration yields an unavailable provider state instead of crashing application startup. Disabled/missing providers produce an actionable message; a template/manual caption remains an honest alternative.

Real Post-caption dispatch also requires **`POST_CAPTION_REAL_DISPATCH_ENABLED=true`**, default false. This task did not enable it or change the saved runtime credentials/feature flags. Before any real trial, configure app-side provider access, approved guidance and an explicit spending policy; obtain the requested fresh cost/authorization confirmation. Codex MCP authorization is not application credentials. Higgsfield MCP image credits are separate from caption-provider billing.

Fake/template costs are zero. Real cost remains unknown/null when not returned; reported token usage and provider request ID are retained when available. No fixed token-price estimate is misrepresented as an actual charge. An unexpected fake response from a requested paid provider stays uncertain with unknown cost, not a successful zero-cost fallback.

## Failure and recovery semantics

Caption generation is a single awaited application request backed by durable state, not an automatically retried queue task:

1. Persist immutable request/context and QUEUED state.
2. Claim once and mark GENERATING before contacting the provider.
3. Capture the response/request ID and provenance before local validation/attachment.
4. Save a checked caption as a new revision and mark COMPLETE atomically, or retain a BLOCKED suggestion without overwriting the saved caption.

Concurrent clicks cannot claim a second submission. An expired in-progress request becomes UNCERTAIN, including when a response was captured but the process died before attachment. A queued request that never started can fail without assuming a charge.

Timeouts, lost responses and potentially charged failures are not automatically resubmitted. `POST /v1/posts/:id/caption/recover` validates and attaches an already saved response locally without calling the provider. Wrong-provider responses cannot be recovered as successful fallbacks. If no response is saved, there is no generic provider lookup in the current text interface: the request stays blocked for administrator/provider reconciliation. A new attempt is not automatically authorized by expiry, a new button click or an API restart.

The frontend polls durable status during generation, including after its HTTP wait ends. It distinguishes caption and poster outcomes, blocks conflicting controls, and avoids refreshing over unsaved edits. Blocked suggestions can be inspected as unapproved text for manual correction; they are not described as the saved caption. Preparing another request for a failed/blocked source requires a new revision.

## HTTP interfaces

All inherit existing session/CSRF/permission controls:

- `GET /v1/posts/caption/brands`
- `POST /v1/posts/caption/brands/:brandId/approve` — administrator attestation, exact digest/confirmation
- `GET /v1/posts/:id/caption` — authorized durable status
- `POST /v1/posts/:id/caption` — `{ expectedRevision, method: "AI", brandRuleVersionId }`, or explicit `method: "TEMPLATE"`
- `POST /v1/posts/:id/caption/recover` — saved-response recovery only

## Verification evidence

- **144 unit tests in 11 targeted suites passed.** Includes trust boundaries, brand selection, missing promotion/arrival facts, wrong price, missing Khmer, missing credentials, explicit templates, provider identity mismatch, timeout deduplication, local recovery, legacy language transitions, strict CLI behavior and saved-caption image compositing.
- **26 tests passed** against a disposable PostgreSQL database with all migrations. New cases cover concurrent one-time dispatch, exact brand/output/revision associations, old-version preservation, staff-edit lineage, immutable outputs, unsafe rule approval rejection, process replacement with an uncertain request and recovery after a captured response/expired attachment deadline.
- **196 web tests in 35 files passed.** New caption-panel tests cover explicit brand selection, labeled templates, uncertain-state controls and unsaved-edit protection. Image/caption status labels were updated to reflect their separate roles.
- API/worker/web/provider TypeScript builds, targeted lint, Prisma schema validation, module boundaries and whitespace checks passed.
- The disposable HTTP harness (`node scripts/verify-post-workflow.mjs --caption`) overrides only the caption provider with a fake; legacy queues and Redis remain disabled, live caption dispatch remains false, and all data/storage are disposable. An administrator fixture explicitly approved synthetic rules through real endpoints. A bilingual mock caption was generated, pinned to revision 2, then preserved exactly through mock image generation into revision 3. Saved-image SHA-256 matched the image-generation record.
- Evidence: `app/output/runtime/caption-unit.log`, `caption-integration.log`, `caption-web-tests.log`, `caption-build.log`, `caption-lint.log`, `caption-schema-validation.log`, `caption-boundaries.log`, `caption-http-harness.log`, `caption-http-proof.json`.

No fresh real-browser lifecycle or live text-provider quality evaluation was performed. Existing full-Post approval/export tests remain regression evidence; this is not a new business-content approval or publication.

## Human Khmer evaluation still required

Use the approved business guidance and a representative set of real products, covering Khmer-only, English-only and bilingual posts, mixed Latin product names, sparse descriptions, verified fragrance notes, gift requests, promotions and corrections. Obtain separate spending authorization before real provider calls.

A Khmer-speaking marketing reviewer should assess natural phrasing and spelling, approved terminology, tone for the target customers, English/Khmer agreement, factual preservation, clear CTA, platform length and readable rendering in the actual poster/font. Check that transliterated names remain recognizable and that no urgency, availability, origin, performance or promotion is invented. Record the exact versions, corrections and approval results; compare with staff-written examples. Script presence and mock tests are not a language-quality score or a substitute for this review.

## Deployment and remaining gates

Additive migration `20261107180000_post_ai_captions` creates caption attempts, explicit brand approvals and nullable revision associations/provenance. It does not rewrite old captions, revisions or approvals. It and the preceding shared-Post migration were tested in disposable databases only; deployment to the normal app database is pending. Deploy compatible built API/worker code after the normal reviewed migration procedure, keeping external dispatch off until configuration and business approval are ready.

Pending: real approved brand content, live provider credentials/compatibility/cost verification, human Khmer evaluation, provider-specific reconciliation for requests with no saved response, and the broader staff pilot. The image/video/reference-learning/publishing readiness claims are unchanged.

**Real provider requests: 0. Actual provider cost: 0 credits / USD 0. Real Telegram messages, business Post approvals and publications: 0.**
