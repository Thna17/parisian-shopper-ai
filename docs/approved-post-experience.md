# Approved Post downloads and staff navigation

Implemented 2026-11-06. Nothing was published or sent, no paid generation was submitted, and no real business record was approved during verification.

## Staff workflow

Primary navigation now contains **Create a post**, **My posts**, **Reviews**, and **Approved posts**. Products, campaigns, standalone Caption/poster/review tools, publishing history, administration and finance remain available under **Advanced tools**. Existing URLs, including `/reviews`, `/content`, `/creative`, `/publishing` and legacy caption links, remain usable. The new complete-Post review inbox is `/posts/reviews`; `/posts/approved` lists approved Posts; `/posts/all` retains the authorized all-Posts view. My posts filters by the current creator even for managers. All list scopes preserve backend visibility restrictions.

The new workflow consistently describes one final review of poster and Caption together. Older caption links explicitly identify the standalone workflow instead of telling staff they must approve a caption before preparing a complete Post.

## Exact approved downloads

An authorized user with the existing `EXPORT_CREATIVE` permission can download:

- The unchanged approved poster bytes (PNG/JPEG/WebP, matching the saved type).
- The exact approved captions as UTF-8 text or structured JSON.
- A JSON verification manifest with Post/revision/approval IDs, review round, product snapshot, frozen campaign context, channel/language, source version/artifact IDs, dimensions, byte count, and SHA-256 checksums.

Endpoint: `GET /v1/posts/:id/download/:kind?revisionId=:revisionId&reviewRound=:reviewRound`, where kind is `poster`, `caption-text`, `caption-json`, or `manifest`. Both the requested revision and review round must still be the current independent final approval. A bare APPROVED status without its matching independent decision is insufficient. Missing permissions, unapproved revisions, an edit since approval or a stale download link is rejected. Existing roles are unchanged: currently approvers and administrators have export permission; editors without it are told to ask an authorized colleague.

Before sending any file, the service validates the saved poster checksum, fully decodes it with size/pixel limits, and verifies format and dimensions against the immutable saved artifact. It also checks current governed product-photo approval/rights and image identity, and verifies the caption's factual validation. Mock exports are blocked in production. No image is resized or re-encoded for download. A final database row lock rechecks approval after asynchronous preparation and appends `APPROVED_DOWNLOAD` to the existing immutable audit history; it cannot export a revision invalidated during preparation.

Responses use attachment headers and private/no-store caching, and expose `X-Content-SHA256` and `X-Post-Revision`. The frontend recomputes the checksum and verifies the revision before creating a browser download. Failure produces a recoverable message and saves no invalid file. Unsaved edits disable downloads in the workspace. Files already downloaded cannot be revoked by a subsequent edit; that edit blocks further formal exports until reapproval.

Private draft previews remain available to authorized creators/reviewers for review. Generated/composited CAS files no longer bypass authentication through public `/assets/cas/...` static serving. Existing CAS URLs now resolve through an authorized preview controller; ordinary public catalog images remain public. Encoded, case and traversal variants are excluded from public static handling as well. Formal exports remain governed by the stricter approved-download endpoint.

## Publishing: accurate limitations

Complete Post approval is not a standalone caption approval. The existing publishing service requires standalone content/version approval and optional approved creative export; it does not accept a bundled Post artifact. The new UI therefore marks Facebook, Instagram and Telegram direct publishing as **unavailable for this Post**, and provides no misleading Publish button or fabricated legacy approval.

Where an existing publication record already matches the exact original standalone caption and visual asset, the user has publishing permission, and the caption has not diverged, the workspace offers a link to that existing record. Otherwise the legacy publishing tools remain accessible under Advanced tools without claiming they can publish a new bundled Post. There is no new publishing dispatch, external message, account connection or scheduling action in this change.

## Accessibility and recovery

Mobile navigation is mounted only when open, with a named modal, focus trapping, background inertness, Escape-to-close and focus restoration. It closes when switching to desktop width. The shell has a skip link and one main content landmark for the staff Post pages. Icon-only sign-out controls have accessible names. Primary controls have keyboard focus indicators and touch targets; download buttons wrap on narrow screens. Step/revision/list changes focus the page heading.

Unsaved caption/brief edits and review notes protect route/back navigation and browser unload. Sign-out can be canceled before the session is changed. Successful saves clear the warning; failed saves preserve input. Downloads have loading/success/error states and retry/refresh actions. Missing previews can be retried, and invalid page query values recover to page one.

## Verification

- 15 isolated PostgreSQL integration tests cover approval-bound export access, byte-identical real compositor output with disk CAS, manifest/caption associations, stale/unapproved/unauthorized downloads, post edits, independent approval, private preview access and scoped lists.
- 10 targeted API/unit tests cover export checks, missing/tampered/mis-sized/mis-typed media, revoked rights, production mocks and public-static CAS bypass variants, plus final-review safeguards.
- 177 web tests pass, including verified browser-download logic, blocked/tampered responses, approved action states, unsaved navigation and existing legacy screens. TypeScript, scoped lint, boundaries and production web build pass. The existing production build still reports its large shared JavaScript chunk; this change does not claim a mobile network performance audit.
- 37 existing caption/creative/approval API regression tests pass.
- In the user's Chrome, desktop and 390px mobile layouts were checked. The menu focus trap and Escape restoration worked; no horizontal overflow was observed. An explicitly labeled read-only local UI fixture demonstrated the approved workspace, actual browser poster/JSON downloads, checksum feedback, failed-save recovery and cancel/discard navigation. The downloaded PNG was byte-identical to the fixture (1080×1080, 25,548 bytes); caption JSON matched the displayed approved fixture revision and included Khmer. No real Post was approved to obtain those screenshots.

Screenshot: `app/output/approved-post-checks/approved-post-mobile.png`. Download evidence: `downloaded-fixture-poster.png` and `downloaded-fixture-captions.json` in the same folder. The screenshot and download artifacts are mocks, not generated business marketing content.
