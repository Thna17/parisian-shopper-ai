# Telegram interface to shared Posts

Implemented and verified with isolated fixtures on 2026-11-08. No real Telegram messages, provider requests, credits, approvals of business records, or publications were involved.

## Staff journey

1. `/create SKU` or `/search NAME` selects a catalog product. The existing saved wizard collects purpose, language, channel/format and visual direction. Saving creates one persistent Post; it does not claim that a poster or Caption has been generated.
2. Open the same Post in the web to select approved brand guidance and prepare its Caption. Image preparation is available from Telegram once a Caption exists. Settings, quotes and any paid authorization remain in the existing web experience. Telegram has no new spending bypass.
3. `/posts` lists saved Posts. `/post ID` displays the exact current revision, saved poster bytes, full Caption, campaign, catalog source/as-of information, factual limitations and reviewer feedback. Long captions are split instead of silently truncated. Provider internals are replaced by staff-facing progress and recovery instructions.
4. The creator can choose a Caption field and reply with exact replacement text. Saving goes through the shared Post revision service, preserving old versions and invalidating approval. The old poster link is cleared: wording embedded in an old poster may not match the edited Caption. Prepare the new poster before review.
5. Suggest a change saves an identity-bound feedback prompt. Feedback is classified as a **proposed** Caption edit, layout change or paid regeneration using simple keyword rules. This is not AI understanding or an automatic edit. The proposal and original text persist. No proposal dispatches generation. Continue in the web for layout/paid changes, or choose an exact Caption field in Telegram.
6. Send the complete Post for independent review. Reviewers can Approve or Request changes. These call the same backend service and exact revision/review-round checks as the web. A missing poster preview suppresses Telegram approval/submission buttons; reviewers must inspect the image in the web. Creator/requester/revision-author exclusions, including administrators, remain enforced. Another account controlled by the author is not independent review.
7. Approved posts provide an authenticated web link to the exact approved downloads. Telegram does not automatically export, publish or send a file to an external channel.

`/status` and `/history SKU` preserve legacy Caption-job behavior. `/posts`, `/posts reviews` and `/posts approved` address complete Posts. `/resume` recovers a pending Post edit/proposal or the saved wizard; otherwise it directs staff to `/posts`. `/cancel` ends the pending prompt without generation.

`/newproducts` explains that verified arrival dates are absent. `/promo` explains the missing complete promotion feed and offers product search. The wizard only offers Promotion for explicitly approved, current promotion data. Neither command invents arrival dates or discounts.

## Durable interaction and safety design

The additive `20261108000000_telegram_post_interactions` migration extends the existing pending-interaction table. No historical interaction or approval is converted into a complete-Post approval. Legacy target IDs are nullable only to support the explicitly constrained new Post target.

Post prompts persist identity, internal actor, Post ID, exact revision ID/number, review round, field, intended action, payload and expiry. Creating a prompt serializes on its identity row and replaces the preceding active interaction. An atomic, expiring claim prevents concurrent replies from applying twice. Shared Post optimistic concurrency is a second fence: if the process dies after saving but before completing the prompt, retrying cannot write a second revision from the stale expected revision. A lost pre-save claim can be recovered after its 60-second lease. Unsuccessful validation releases the claim so staff can correct their reply.

The former legacy `pendingEditFields` Map is removed. Selected fields now survive application service replacement in the existing database record, and the internal actor is recorded for new prompts. Legacy unstructured edit instructions no longer automatically enqueue a paid Caption regeneration; staff receive a proposal and explicit field-edit alternatives.

Inbound update IDs and single-use identity-bound action tokens retain their existing atomic deduplication. Post callbacks additionally pin revision ID, revision number and review round. Wizard callbacks check owner, expiry/completion and, for newly rendered selections, expected step. Old records and URLs remain usable. Expired/replayed/stale actions require reopening the current saved Post or `/resume`.

## Verification

- 60 targeted unit tests passed across seven Telegram command, Post projection, token, formatter, domain, persistence and adversarial-recovery suites. A broader Telegram regression run passed 130 tests across 14 suites; these counts overlap.
- 29 isolated Post database integration tests passed, including the new restart/concurrency conversation using real Post/repository/token services and `FakeTelegramGateway`. Covered saved-field recovery, actor mismatch, stale replies after web revision changes, expired prompts, lost-claim recovery, duplicate inbound updates, duplicate/cross-user/expired tokens, persisted feedback classification and zero generation dispatches.
- The same integration suite verifies independent review, self-approval rejection, exact version associations, reapproval and fake-provider PNG projection. Those are fake-provider checks, not a live Higgsfield or Telegram trial.
- TypeScript build, scoped lint, Prisma validation, module boundaries and whitespace checks passed.

## Remaining setup and limits

Apply pending migrations in the intended environment before deploying the matching application build. This task applied them only to disposable integration databases, not the main local/business database.

Approved brand guidance, catalog/stock policy, product image eligibility and configured app-side providers remain prerequisites inherited from the shared Post flow. Telegram AI Caption selection, paid cost confirmation and approved downloads deliberately continue in the web; there is no claim of an exclusively Telegram generation/export journey. A live authenticated bot trial, delivery behavior under Telegram outages, device usability and human Khmer-language review still need separately controlled verification. No production integration was enabled.
