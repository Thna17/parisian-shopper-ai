# Post workflow end-to-end verification — 6 November 2026

> Update 6 November 2026: the application-side MCP adapter and no-cost fake-server verification are described in [Server-side Higgsfield MCP](higgsfield-server-mcp.md). Earlier Codex/developer-API notes below are historical or apply to the separate adapter; they do not establish a live application OAuth connection. Paid dispatch remains gated.

The complete workflow was exercised in real Google Chrome against the real Nest API, session authentication, PostgreSQL repositories, Post worker, product-image eligibility evaluator, Sharp compositor and disk storage. HTTP responses for the workflow were not mocked. The external image provider was a fake; its image and the fictional product artwork were synthetic. Suggested captions came from the catalog template, with staff edits, not a live language model. This verifies workflow behavior, not real-provider quality, billing, or brand similarity.

## Isolation

`scripts/verify-post-workflow.mjs` creates a new `post_browser_<uuid>` local database and applies real migrations. It seeds separate creator (ADMIN, deliberately testing that admin cannot self-approve) and reviewer (MARKETING_APPROVER) accounts, one fictional product, governed synthetic photo evidence and an active campaign. Only fixture photo records are approved. These test accounts exercise authorization; they do not constitute independent human review of business content.

The full lifecycle was run at 127.0.0.1:5184. A final harness smoke test confirmed sign-in and the exact 400×700 synthetic catalog image on post-test.localhost; all endpoint fault checks were rerun there. The failed-provider page was also inspected in Chrome and clearly showed the failure without a poster or review action. The API listens on loopback port 3184 and the web server uses port 5184. The reusable harness uses `post-test.localhost` to isolate browser cookies from the normal app. All external feature flags are disabled, text/image provider selection is fake, legacy enqueuers throw, and Redis is replaced by a disconnected stub. The production worker process and live queues are never used. The Post worker polls only its disposable database. Test control endpoints exist only in this standalone harness, not the application module. SIGTERM/SIGINT removes its database, storage directory and temporary account-details file.

## Browser lifecycle verified

1. Found Create a post in staff navigation; selected Moonlit River Eau de Parfum (fictional), with image, verified SKU, USD 38.00 price and facts.
2. Entered brief, Facebook, Khmer and English, and the isolated launch campaign.
3. Double-clicked generation. One saved generation and one fake provider submission resulted. The page showed queued/preparing progress, then the saved mock poster and both captions.
4. Refreshed the page. Post, brief, campaign, product, exact image and captions persisted.
5. Edited English Caption and saved revision 3. Factual validation passed; submitted the entire post for review.
6. Sent an authenticated approval request directly to the real endpoint as its creator/admin. Response: 403, with the self-approval explanation.
7. Signed in as the separate test reviewer, opened Reviews, inspected the saved post and approved revision 3 through the UI.
8. Downloaded PNG, Caption JSON, plain text and verification manifest through Chrome. Read the actual files from Downloads. PNG equaled the authenticated saved-image response byte for byte, decoded at 1080×1080, 105050 bytes, SHA-256 `5e7e70152375ba08d2c3514b59a5bae1b435639ced03fdaee57055f34a7a39dc`. JSON equaled the approved Caption object; text checksum and manifest revision links matched. Provenance says mock and no historical poster references.
9. Returned as creator and edited the approved CTA. New revision 4 was Draft. Approval history and old versions remained. Old approved-image download and stale approval requests each returned 409. No download controls were offered for the changed draft.
10. Verified desktop and 390×844 phone layout, no horizontal document overflow, loaded 1080px poster, keyboard product selection, heading focus, mobile focus trap, Shift+Tab wrap, Escape close and focus restoration. Checked uncertain-state recovery UI and paused editing. The existing unsaved-change and failed-save tests also pass; the previous fixture-only browser verification documented in approved-post-experience.md covers canceled navigation preserving typed text.
11. Direct publishing destinations were explicitly unavailable. No publishing or external sending action was invoked.

Final main lifecycle fixture: Post `b31c0638-661e-4c5e-8ecc-0b5b6d81df77`; approved revision `f4f795fa-6282-4e6b-9b6d-2defbae407f9`. These IDs belong only to the disposable database, not production records. Evidence JSON and screenshots are in `app/output/playwright/`; fixture IDs become unavailable after cleanup.

## Fault and recovery verification

`scripts/verify-post-faults.mjs` uses real authenticated endpoints and the disposable worker. Eight concurrent generation calls produced one row and one provider submit. A status-poll timeout saved UNCERTAIN with its request ID. Replacing the worker, expiring only fixture leases and restoring provider status resumed the original request to COMPLETE without another submit. A lost submit response without an ID stayed UNCERTAIN; five repeated clicks, worker replacement and a reconciliation attempt could not submit it again. Reconciliation returned 409 with a practical explanation. A terminal provider failure persisted FAILED across worker replacement and was never resubmitted.

These are fake submission counters and zero-cost results, not evidence about a real provider's charging behavior. Worker replacement is a new worker instance against persisted state; this is not an operating-system crash/host-loss chaos test. Worker unit tests additionally cover losing the saved request-ID write after successful submission and preventing POST replay.

## Defects fixed

- Eligible reviewers were told to ask another colleague; their next action now tells them to review and decide.
- Active and uncertain generation displayed editable fields and the wrong next step. Editing and submission now pause while an existing outcome is unresolved, with appropriate wait/reconciliation instructions.
- Approved posts still offered generation and Send for review. Those actions are now withheld until a changed revision is saved as a draft; editing itself remains available.
- The workspace's fictional `.invalid` catalog image URL did not use the local demo-image fallback already used by the product catalog. It now follows the same fallback. The reusable harness serves synthetic photo bytes before ordinary public assets; no real catalog files are written.

## Checks

- Full web suite: **180 tests in 33 files passed**.
- Targeted API/export/private-assets/review, Post worker and Higgsfield adapter unit suites: **19 tests in 5 suites passed**, without external calls.
- Disposable PostgreSQL Post integration suite: **15 tests passed**.
- TypeScript build for API, web and worker, module boundaries, script lint and diff whitespace checks passed.
- Production web build passed. Existing approximately 983 kB JS bundle still raises the build's large-chunk warning; no performance readiness claim is made.
- Browser lifecycle plus endpoint/fault assertions passed as described above. These are additional to the test counts above.

## Reproduce

From `app/`, build API/worker dependencies with `pnpm exec tsc -b apps/api apps/web apps/worker`. Run `node scripts/verify-post-workflow.mjs`. It needs local PostgreSQL database-create permission; it reads only the local database URL from `.env` (or POST_TEST_ADMIN_DATABASE_URL), not live provider credentials. Open the printed test URL and use the temporary account details written to `output/playwright/isolated-environment.json`.

Complete the browser flow through submitted revision 3, then `node scripts/verify-post-endpoints.mjs --self-only`. Approve as reviewer and download all four files. Run `node scripts/verify-post-endpoints.mjs` to check the downloaded files. Edit to revision 4 and run `node scripts/verify-post-reapproval.mjs`. `node scripts/verify-post-faults.mjs` runs the additional endpoint fault scenarios. The file verifier expects the actual browser downloads in this Mac's Downloads folder and the documented revision sequence; it is a guided harness, not a portable one-command browser test runner. Stop the server with Ctrl+C for cleanup.

## Pilot decision and real-provider gap

Ready for a controlled **no-cost staff usability pilot** with fictional/mock content and a facilitator: the complete persistent generation/review/download/reapproval loop is demonstrated. This is not a production or real-content-generation sign-off.

The normal app's `.env` and `.env.local` have no POST_IMAGE_PROVIDER selection, HF_POSTER_API_KEY, asset-host allowlist or confirmed request configured. Real Higgsfield image generation is therefore unverified and unavailable in that setup. The app needs its own developer API credential; Codex MCP OAuth/credits do not supply it. No current price or developer balance was queried or asserted. Before a real test, obtain the exact settings/references, quote and current balance and the user's explicit confirmation; submit at most once. The documented monthly hard-limit gap and absent reviewed historical-reference library remain. Direct complete-Post publishing remains unavailable.

**Real provider requests: 0. Provider cost: USD 0 / 0 credits. Real business approvals: 0. Published or externally sent: 0.**
