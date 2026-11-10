# One final review of a complete Post

> Update 6 November 2026: the application-side MCP adapter and no-cost fake-server verification are described in [Server-side Higgsfield MCP](higgsfield-server-mcp.md). Earlier Codex/developer-API notes below are historical or apply to the separate adapter; they do not establish a live application OAuth connection. Paid dispatch remains gated.

The staff workflow is now: prepare the product post, edit/save the complete draft, send it to an independent reviewer, then receive Approve or Request changes for that saved revision. There is no prerequisite human caption approval in the persistent Post workflow. The standalone caption/creative approval workflows and their historical records are unchanged.

## Saved content and editing

- A Post revision pins its product snapshot, brief, intended channel/language, campaign identity/context, exact caption and exact saved poster. New revisions capture campaign name, code, objective and description, so later changes to a campaign do not silently change an approved Post.
- Staff can write or edit captions in the Post workspace. `caption_draft` is an immutable part of the Post revision; editing does not overwrite a standalone `ContentVersion`, an original provider result, or its approval history. An existing caption is copied into the staff editor and saved as a Post-specific revision.
- Generated posters remain pinned through `generation_id`. Staff caption edits retain the saved poster when product/channel/language match. They do not change text printed on the image; the editor explains this. A different poster can be prepared before submission. The worker retains a saved staff caption instead of replacing it with its suggested template caption.
- Caption structure/language and deterministic factual rules are checked against the immutable product snapshot. Drafts with factual findings can be saved for correction, but cannot be submitted or approved until blocking findings are resolved. Required-field/schema errors return an understandable validation error. Checks run again at submission and approval, and their result is recorded with the decision.
- Image previews use `/v1/posts/:id/image?revisionId=:revisionId`. The revision must belong to the authorized Post. An old review tab cannot accidentally fetch a new revision's poster. Saved versions and their exact captions/posters remain accessible from History.

## Final decision and independence

The reviewer sees the saved poster and captions together, product facts, brief, intended channel/language and saved campaign context. The UI waits for the poster to load before enabling Approve. Request changes remains available when the image needs repair.

Backend checks apply regardless of the buttons or administrator role:

1. The creator, source content/creative requesters and revision authors cannot approve their own contribution. Both caption and creative approval permissions are required for a final Post decision. A second account operated by the same person is **not** an independent human review; the application cannot establish human independence from different account IDs alone.
2. Submission/approval checks the saved image bytes and digest and current governed product-photo approval/usage rights. A missing/tampered poster or changed/unapproved product photo cannot be approved. Existing image validation checks must also pass. Older preview renders that cannot establish authentic product-image provenance must be rebuilt; they are not silently accepted as complete posters.
3. A decision must match both `expectedRevision` and `expectedReviewRound`. Every submission increments `review_round`, including resubmission without edits. A stale reviewer cannot approve a later submission just because its content revision number is unchanged.
4. The Post row is locked for decisions. Status, revision and review round are checked again atomically before the immutable decision event is appended. Competing decisions cannot both succeed.
5. Request changes requires feedback and returns the Post to an editable state for its creator. Submitted Posts cannot be edited until changes are requested. Edits after approval append a new revision, set Draft, record approval invalidation and require fresh factual checks and another independent review. Previous versions, approvals and comments remain intact.

Only Post decisions change. Approving a Post does not forge a standalone caption/creative approval, publish externally, or grant legacy exports automatically.

## API compatibility

`PATCH /v1/posts/:id` additionally accepts `generationId` (only a completed artifact from this same Post) and `captionDraft` (the strict caption structure). Existing caption/poster/image source IDs remain supported. The server records validation and campaign snapshots; clients cannot supply trusted validation results.

`POST /v1/posts/:id/actions` accepts `expectedRevision`, `action`, optional `comment`, and **requires `expectedReviewRound` for Approve/Request changes**. Read the token from the latest Post response; do not guess it. Older decision clients without the token fail safely. Existing standalone approval endpoints are unchanged.

Additive migration: `20261106010000_complete_post_review`. Existing append-only protections continue to cover new revision/event fields. No historical records are backfilled or rewritten. Older revisions with a campaign link but no saved campaign context must be saved as a new revision before final approval, preserving the original record.

## Verification scope

Tests use isolated temporary PostgreSQL fixtures and fake providers, with real compositing/disk storage for the complete generation/review case. They cover unapproved draft captions before poster creation, caption edits, factual blocking, exact image links, independent approval, requester/author/administrator self-approval rejection, request changes, reapproval after edits, stale submissions, concurrent conflicting decisions, frozen campaign context and preservation of legacy approvals. Controller tests cover missing/tampered posters, revoked/replaced product photos and mandatory review tokens. UI tests cover editing, saved previews, load-dependent approval, feedback and the independence explanation.

No real business record is approved, no paid generation is submitted and nothing is published by these tests. Live image-provider credentials/pricing and publication/export integration are separate concerns documented in [Post image generation](post-image-generation.md).

## Approved experience follow-up

Approval-bound poster/caption downloads and the simplified staff navigation are now implemented. See [Approved Post experience](approved-post-experience.md). Exporting a complete Post does not require fabricating legacy approvals; direct publishing of bundled Posts remains unavailable.
