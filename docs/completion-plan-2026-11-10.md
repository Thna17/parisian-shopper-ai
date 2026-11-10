# Parisian Shopper AI completion plan — 10 November 2026

Goal: marketing or retail staff choose a real product, describe a post, prepare a professional poster and Khmer/English Caption, edit it, obtain independent approval, and download the exact approved output. Telegram and web use the same saved Post. Video and direct publishing need separate acceptance gates.

This is a planning update, not permission to generate paid content, send messages, approve business records or enable integrations. No feature code was changed during this planning task.

## Evidence and present readiness

Fresh read-only checks: web and API readiness returned HTTP 200. The normal database contains **0 BrandProfileApproval records, 0 PostCaptionBrandApproval records, 0 BrandSourceReview records and 0 PostGeneration records**. Higgsfield connection metadata says CONNECTED; no token refresh, balance or external generation was checked today. Counts describe this local database, not every past export, standalone creative job or external account.

The previous restoration deployed all 32 local migrations after code/database backups. Older checklists that still say those migrations are pending describe their earlier baseline.

Most recent recorded verification: **211 web tests, 30 targeted analytics/backend unit tests and 29 isolated Post database integration tests passed**. Real browser verification used real application endpoints and disposable fixtures; provider generation evidence remains fake-provider evidence. Those suites were not rerun during today's planning inspection and are not a complete production certification.

**Decision:** suitable for continued internal development and guided demonstrations; not yet signed off for an unattended staff production rollout. A narrow poster pilot is the next release target.

## What is implemented

| Capability | What is done | Verification limit |
| --- | --- | --- |
| Workspace | ZIP-inspired navigation, responsive shell, search, dashboard, library, registered templates and operations views | Not a pixel-perfect copy of every prototype sub-screen |
| Accounts and permissions | Authentication, role checks, staff administration and protected routes | Real pilot staff/reviewer access still needs checking |
| Product data | API-backed catalog, snapshots, imagery, facts and filtering | Real source correctness/freshness and product-image approval need business verification |
| Shared Post | Product, brief, purpose/channel/language/campaign, exact Caption/image associations, revisions and history | Main business setup has not produced a Post image-generation attempt |
| Captions | Modular AI caption path, language checks, manual editing, truthful template/mock labels and approved-rule pinning | Real Khmer/English quality and approved brand setup are not accepted yet |
| Poster pipeline | App-side image adapters, worker/ledger, durable media, product-image compositing, progress/failure/uncertain states | A real application-to-Higgsfield output has not been accepted |
| Brand administration | Versioned guidance, explicit approval, reviewed reference records and exact provenance | Approval/library records are empty locally |
| Review and downloads | Complete-post decisions, creator/contributor self-approval rejection, revision/round checks, approved-version downloads and reapproval | Isolated lifecycle evidence; needs actual independent colleague UAT |
| Product safeguards | Promotion/notes prerequisites, explicit stock/freshness policy support, release rechecks and repeat warnings | Needs approved operational policy and real source evidence |
| Telegram | Shared Post display, saved Caption edits, feedback proposals, durable prompts and replay/stale protection | Fake transport verification; some actions intentionally hand off to the web |
| Reporting | Existing analytics, new Post dashboard counts and read-only missing-budget state | Legacy analytics still omit important complete-Post/MCP measures |
| Local operations | Code/database backup, applied migrations, running API/web and isolated test harness | Production deployment, restore drills and operational ownership are not signed off |

“Implemented” does not mean externally live-tested. The original ZIP's simulated data/actions were not substituted for real backend functions.

## Blockers, work remaining and owners

| Priority | Gap | Business input / dependency | Implementation or verification needed | Finish condition |
| --- | --- | --- | --- | --- |
| P0 | No approved business brand pack or Caption rules | Brand owner supplies logo, colors, fonts, tone, CTA/contact details and prohibited claims | Enter/version/review actual guidance through existing approval screens | An authorized owner approves exact versions; generation pins them |
| P0 | Real poster path unproven | Approved product/photo, supported business account, valid app authorization, exact settings/quote/balance and explicit spending confirmation | Verify effective configuration and recovery gates, then submit at most one separately confirmed real request | Correct real product, saved poster, Caption association and truthful provenance survive refresh/download |
| P0 | Historic poster style matching is incomplete | Rights-cleared examples selected by the brand owner | Import/review examples; extend the image-provider reference contract and provenance; test eligibility | Only approved selected images are actually sent; similarity accepted by humans; no training claim |
| P0 | Real product readiness not accepted | Catalog owner confirms source, as-of/freshness rules, stock policy and promotion approval evidence | Verify synchronization, source outages, image rights and release-time drift with representative products | Product facts/image are traceable; missing data blocks the relevant claim and offers alternatives |
| P0 | Caption/design quality unproven | Native Khmer reviewer and marketing owner | Evaluate real bilingual outputs, typography, line breaks, facts, layout and product identity; correct findings | Agreed sample set accepted by humans, with factual/linguistic defects resolved |
| P0 | No end-to-end staff acceptance | Creator and a different authorized human reviewer | Observe the full journey, feedback/revision, approval, exact downloads and changes after approval | Staff complete it without developer/database intervention; no self-approval bypass |
| P0 before paid rollout | Spending controls are not a verified account-wide monthly hard cap | Define monthly allowance, MCP credits versus USD, subscription allocation and escalation owner | Audit all paid text/image routes, reservations, concurrency, uncertain outcomes and reconciliation | Written tested spending policy; unknown costs remain unknown and retries cannot duplicate charges |
| P1 | Telegram live behavior unverified | Authorized test chat/identities and permission to send a specific controlled message | Test private-chat creation/continuity, saved media, restart/replay and independent review; make web handoffs explicit | Same revision/status in both interfaces; recoverable delivery and no feedback-triggered charges |
| P1 | Reporting needs complete-Post semantics | Agree definitions for approved, downloaded, externally published and cost completeness | Add Post/MCP-inclusive metrics without double counting; separate exports from delivered publications | Counts reconcile to saved records; credits/estimates/actuals remain distinct |
| P1 before publishing | Publishing semantics/security gaps | Actual destination/account access and explicit activation scope | Stop treating manual export as external PUBLISHED; remove predictable proof-secret fallback; require real delivery IDs and uncertainty recovery | No publication claim without delivery evidence; missing configuration fails closed |
| P1 before production | Deployment/recovery not accepted | Hosting, storage, backup retention and operational owners | Reproducible release, secrets, durable media, DB restore drill, monitoring, rollback and kill-switch runbook | Recovery demonstrated; owner can diagnose/reconcile failures; no uncontrolled live queue dispatch |
| P1 | Large uncommitted worktree / reproducibility | Agree release scope | Review and commit the preserved work in coherent changes; run a release gate from a clean checkout | Reproducible reviewed release; recoverable previous version |
| P2 / separate release | Video is not connected to the shared Post MCP workflow | Choose supported model, formats, audio/rights, expected cost and approved product media | Dedicated video adapter, ledger/status/recovery, durable video preview, review/download tests | One confirmed real video passes the same factual/cost/review safeguards |
| P2 / separate release | Direct complete-Post publishing is not connected | Business priority and platform authorization | Build each destination separately with tokens, scheduling rechecks, audit and duplicate-delivery handling | One separately authorized controlled delivery per supported destination, with recorded external ID |

Brand references require two distinct steps: the reviewed library exists in code, but the library is empty locally; additionally, the current Post image-generation contract still records `externalReferences: []` and `historicalPostersUsed: false`. An approved palette or prompt alone is not evidence that historical images were used, and none of this is model training/fine-tuning.

Telegram is usable as a shared interface, but AI brand selection/preparation, paid confirmation and approved downloads currently continue in the web. “Entirely inside Telegram” is an additional implementation scope, not current completion.

Two source-confirmed pre-publishing issues remain: manual-export confirmation uses PUBLISHED status, and the Meta gateway has a predictable secret fallback. Publishing is not to be enabled before resolving them. This is a pre-enable engineering gap, not a claim that a live breach occurred.

## Recommended delivery order

1. **Define the poster pilot.** Agree one main creation path and keep existing tools as compatible secondary routes. Produce an acceptance list from product selection through approved download. Freeze unrelated redesigns while validating it.
2. **Supply business setup.** Approve actual brand rules/assets, a small rights-cleared reference collection, product source/stock/freshness policy and the independent reviewer. Do not invent those values in code.
3. **Prove one real poster.** Fix any remaining setup/integration issue; confirm an exact fresh quote/settings/assets/balance; obtain separate permission; submit once; inspect/save/download the result. No old quote is valid authorization.
4. **Improve brand fidelity and output quality.** Connect approved image references if required, then evaluate representative products and real Khmer/English/design quality. Fix problems in the smallest existing services.
5. **Complete the browser lifecycle and Telegram trial.** Exercise edits, feedback, independent approval, immutable downloads, changed facts, failures and uncertain recovery. Use isolated fixtures before any authorized live trial.
6. **Run a controlled staff pilot.** Suggested scope: two creators, one genuinely independent reviewer and an agreed set of about ten representative products. Measure assistance needed, factual/language errors, revisions, time to approval and actual costs. Do not fabricate target results.
7. **Production gate.** Close pilot defects; finish Post-inclusive reporting, verified spending controls, release review, durable storage/recovery and operational ownership. Keep external publishing disabled until its own gate passes.
8. **Then add video and direct publishing** as separately accepted capabilities, if the business chooses them. They are optional for a poster/download pilot; they are required if “finished system” includes those original goals.

## Decisions to settle during planning

- First deliverable: poster + bilingual Caption + independent review + approved download, or a larger first release including video/publishing? Recommended: the narrow poster pilot first.
- Name the person who approves brand guidance and the person who independently reviews posts.
- Identify the authoritative product source, approved product photos and a small representative product set.
- Select/clear historical references and define what “similar to the brand” means with examples.
- Define spending units/allowance and who may approve paid tests or handle uncertain charges.
- Choose the pilot channel (web first recommended), success criteria and operational owner.

No completion percentage or delivery date is assigned: external provider compatibility, business approvals and human output quality have not yet been accepted. Estimate individual implementation items after these dependencies are resolved.
