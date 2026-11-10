# Staff content workflow redesign — 6 November 2026

The supplied Telegram diagram is adapted to a web-first, five-stage workflow:

1. **Choose product:** read the catalog snapshot, actual catalog photo, brand, SKU, price and verified facts. The separate “Choose another product” button avoids making “Change” look like part of the product name.
2. **Plan content:** choose Poster + captions or a clearly labeled video brief; choose Product spotlight, Promotion, New arrival, Educational, Gift guide, Lifestyle or Custom idea; choose Luxury, Minimal, Festive or Editorial style. Save a brief, channel, language and optional campaign. A local suggested brief is available and is not presented as an AI generation. Purpose choices do not substantiate discounts, arrival dates, notes or other claims. Comparison is unavailable until a verified second-product workflow exists.
3. **Create & preview:** one action prepares the persistent image request and obtains the current credit quote, without submitting generation. Explicit authorization for that exact request remains separate. The draft displays the saved poster beside the captions. Editing is opened deliberately and can be canceled without changing saved data. Advanced links and activity are collapsed. Existing caption/creative tools and old URLs remain usable.
4. **Team review:** send the complete saved Post to the web Reviews queue. An independent authorized reviewer can Approve, Request changes, or Reject this version. Feedback is shown to the creator. Regenerate poster keeps the style; New design changes it. Both prepare a new immutable revision and require fresh quotation/consent before another generation. Earlier captions/posters and decisions remain available in history. Submission does not send anything to Telegram or publish externally.
5. **Ready to share:** authorized downloads contain the exact approved image and captions. Publishing destinations remain unavailable where no real integration exists. Edits after approval still invalidate approval and require revalidation/reapproval.

## Backend and preservation

The additive `20261106160000_staff_content_flow` migration adds nullable `post_revisions.creation_plan` JSONB and the `REJECTED` Post status. Historical rows are not rewritten or deleted. The plan is validated against a strict shared schema; only supported format/purpose/style/intent values and bounded feedback are accepted. It is copied to generated output revisions and provenance. Plans are governed by the existing revision immutability rules.

`POST /v1/posts/:id/variations` is a creator-only, optimistic-concurrency operation. It preserves the selected product/campaign/captions, clears the new revision's poster associations, and records the chosen direction and feedback. It does not call a paid provider. Busy/uncertain requests block changes. Style and feedback are pinned into the actual background prompt; the selected design takes priority over a conflicting older brief. The existing quote fingerprint and confirmation path cover that exact prompt.

Generation status now refers to the current revision or its explicitly linked generation. A superseded completed request is not displayed as a newly completed image. Confirmed work continues polling even while the database row is briefly awaiting worker pickup; it does not ask for another confirmation. Existing posters must use the revision/variation path before requesting another image.

Rejection preserves audit/history, requires feedback and the same independent authorization as other review decisions, and blocks resubmission until a new draft revision is saved. Creators, requesters and contributing authors—including administrators—remain excluded from approving their own work. Another account controlled by the same person is not independent human review.

## What is still unavailable

This is **not a completed live image-and-video system**.

- **Real MCP generation:** local server-only encryption/callback configuration is now staged in the git-ignored, permission-restricted `.env`, and the new Post provider selects `higgsfield_mcp`. No OAuth client was registered or real account connected during this work. The administrator must complete Connect Higgsfield, verify the direct tool contract, shared internal-business/unattended support, governed product photos and output hosts. Paid/shared-use dispatch gates remain false. See [server MCP setup and verification](higgsfield-server-mcp.md).
- **Video:** a video brief can be saved and edited. Image dispatch and image approval are blocked for a video brief in the backend. There is no staff MCP video adapter/upload pipeline, durable video artifact, complete video review or video export yet. The separate developer-API video adapter is not substituted for MCP and is not presented as this feature.
- **Captions:** generated suggestions are catalog templates or saved staff edits, not an active LLM integration. Choosing a content purpose does not make the template understand an arbitrary creative brief. Staff can edit both languages before review.
- **Brand learning:** styles are presets. No historical poster library was uploaded, used as references or trained on. Approved references/brand-rule application and real output similarity evaluation remain required.
- **Automation:** the primary trigger here is staff creation. Scheduled generation, new-product automatic generation, Telegram notifications and direct publishing were not enabled. No verified $20 monthly hard limit exists.

## Verification

An isolated database, media directory, loopback fake MCP server and separate synthetic creator/reviewer accounts were used. Real API endpoints, the actual worker, image compositor and durable storage were exercised. No live queue or provider account was used, and no real business post was approved.

Chrome lifecycle:

- Keyboard product selection; saved Facebook/bilingual/campaign with Gift guide and Minimal style.
- One-action preparation/quote, explicit **fake-only** confirmation, saved mock poster and captions.
- Caption edit saved as revision 3, complete review submission, and creator/admin backend self-approval rejected with 403.
- Separate test reviewer rejected revision 3 with feedback.
- Creator saw the feedback and selected Editorial under New design. Revision 4 preserved the history/caption, had no saved poster, and did not display the old request as complete. There was still only one fake submission before new consent.
- A fresh quote/consent produced the second fake image and revision 5. It was resubmitted and independently approved under review round 2.
- Chrome downloaded the PNG, caption JSON/text and verification manifest. Bytes matched the authenticated saved image; captions and manifest matched approved revision 5. PNG 1080×1080, 106645 bytes, SHA-256 `75ee926c28e3ecb43e9c8a9c2c8cb49b142de9ec18fb8b01726b898151a1b825`.
- At 390×844, document width and scroll width were both 390; product/poster images loaded. Keyboard selection/approval worked. Existing focus, unsaved-change, download and review tests remain included.
- Actual local port 5173 was inspected using Paris Arty Mind, its real catalog image and price. No business draft was saved during this read-only UI check. The new planning page was left open in Chrome.

Evidence: `app/output/playwright/content-flow-feedback-proof.json`, `content-flow-download-proof.json`, `content-flow-live-planning.png`, `content-flow-live-planning-mobile.png`, and approved desktop/mobile screenshots. `scripts/verify-content-flow-download.mjs` verifies actual browser downloads in the isolated MCP harness.

Real generation requests: **0**. Real credits spent: **0**. Publishing/external messages: **0**. The two fake submissions are not evidence of real provider billing or image quality. Fixture accounts test authorization, not independent human review of business content.

The workflow is ready for an isolated usability demo. A real-provider staff pilot and production readiness remain blocked by the live provider, video, caption/brand and operational gaps above.

## Final check results

- Full frontend suite: **192 passed**. The final product-summary markup and legacy-version handling also passed their focused wizard/workspace checks.
- Isolated PostgreSQL Post/MCP integration suite: **20 passed**, rerun after the final backend changes.
- Targeted creative-plan, Post policy, complete review and worker unit suites: **18 passed**.
- Application typecheck, production web build, focused backend/script lint, module boundaries and whitespace checks passed. The existing large frontend bundle warning remains. These checks do not certify every legacy feature/test fixture or production operation.
- Local additive migration was applied successfully. API/web were restarted/checked with paid generation, Telegram and publishing disabled; the real worker remains paused. The disposable fake MCP environment was stopped and cleaned up.
