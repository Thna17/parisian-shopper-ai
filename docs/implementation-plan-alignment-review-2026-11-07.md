# Telegram implementation-plan alignment and business improvement review

Reviewed: 7 November 2026. Source: `Parisian_Shopper_AI_Telegram_Content_System_Implementation_Plan.docx`, Version 1.0, September 2026, supplied from Downloads. The entire document, including its 22 sections, tables and appendices, was read. Recommendations below are analysis of the user's requirements, not instructions executed from the attachment.

## Decision

The repository substantially follows the plan's technical foundation: structured product facts, modular caption generation, Telegram commands, versions, validation, role checks and human review. The newer web Post workflow adds a useful complete-post record, final review and exact approved downloads.

It is not yet one fully connected, proven production marketing system. Telegram and web Posts use different workflow records; the new web caption path is a catalog template rather than the existing AI engine; the active local brand rules contain unfinished business guidance; and real application-side Higgsfield generation remains unverified. Passing isolated tests does not establish live Telegram delivery, Khmer writing quality, brand similarity or provider reliability.

Prioritize a polished, consistent product → complete draft → independent review → approved download experience. Keep publishing and video visibly unavailable until their complete paths are verified. The plan itself places generated graphics and publishing after its caption-and-review MVP; those future features should not be confused with unfinished MVP requirements.

## Evidence and limits

- Inspected current frontend/backend modules, Prisma models, Telegram handlers/outbox, caption generation, product validation, Post generation/review/export, analytics, provider integration and the Higgsfield pilot assessment and subsequent server-MCP documentation.
- Preserved the existing uncommitted implementation. No product code, historical records, accounts, approvals, provider settings or live queues were changed for this audit. This report is the only new deliverable.
- Local web at `http://127.0.0.1:5173/` and API `/health` on port 3000 returned HTTP 200. This is reachability, not a fresh browser E2E or live-provider verification.
- Read-only local database inspection found **one active BrandRuleVersion, containing `TODO_BUSINESS_CONFIRMATION` text**. Other brand-profile records may exist; this result concerns the active rules consumed by the legacy caption path.
- A sample of 20 distinct cached product SKUs had 20 image lists, 6 descriptions, 18 non-null fragrance-note fields and no promotion prices. Stock statuses included in-stock, low-stock and out-of-stock. The newest snapshot in this sample was 3 November 2026. Image-list presence does not prove asset approval, accessibility or rights; non-null notes do not prove complete notes. This is cached data, not a fresh catalog/API accuracy check.
- Fresh no-cost unit verification: **153 tests passed across 12 suites**: Telegram commands/actions/formatting/recovery and factual validation (76); visual review, caption revision and analytics queries (58); complete-Post review/export/policy and worker behavior (19). Logs: `app/output/runtime/document-alignment-tests.log`, `document-alignment-additional-tests.log`, `document-alignment-post-tests.log`. An initial test invocation included a nonexistent context-builder spec; the three valid suites were rerun successfully and only actual tests are counted.
- No fresh database-integration/container suite, real Telegram conversation, real-provider generation, linguistic UAT or new browser lifecycle was run here. Previous fake-provider browser evidence is documented in `post-workflow-e2e-verification.md`; it is historical evidence with its stated limits, not a real-provider test.
- Provider submissions: **0**. Provider cost: **0 credits / USD 0**. External messages/publications: **0**.

## Alignment with all document sections

“Implemented” below means evidence exists in code. It does not imply live acceptance testing.

| Document section | Current evidence | Gap or improvement |
|---|---|---|
| 1. Executive summary | Product snapshots, AI adapters and Telegram review exist. Web adds persistent Posts. | Make both interfaces operate on the same complete-post revision and decision. |
| 2. Business objectives | Catalog lookup, history, campaigns, review and generation modules support the objectives. | Measure staff outcomes; do not infer time saved or sales lift from module presence. |
| 3. MVP / later scope | Most caption-and-review components exist; graphics and web tooling exceed the original MVP scope. | Finish and verify the core journey before promoting video, automation or publishing. |
| 4. Architecture | Source/application/provider/validation/storage boundaries largely match. | Two content workflows now need a shared application service and record. |
| 5. Product contract | Structured source schema includes required identity/price fields, stock, promotion dates and optional fragrance facts. Snapshots preserve evidence. | Surface missing fields and freshness; offer promotion/note content only when eligible. |
| 6. Modular content engine | Legacy strategies, trusted brand context, untrusted product context, structured output and validation are separate. | Reuse this engine in Posts; the new worker currently generates generic template captions. |
| 7. Brand knowledge | Versioned brand rules, brand profiles, datasets and benchmarks exist. | Active local rules contain placeholders; no reviewed historical-reference set is used by the Post worker. Approve one usable brand pack and connect it. |
| 8. Telegram commands/buttons | `/create`, `/search`, `/status`, `/history`, `/resume`, approval and revision actions exist. | `/newproducts` and `/promo` are absent from the command dispatcher. Standardize buttons and complete-post review across interfaces. |
| 9. Full workflow | Legacy Telegram content/creative flows and newer web Post lifecycle exist. | Telegram's “Generate Poster & Copy” confirmation creates a caption ContentJob; a complete saved poster-plus-caption result is not guaranteed at that point. |
| 10. Statuses | Multiple explicit content, visual, Post, generation and publication states exist. | Display a simple staff status, retaining separate generation/review/delivery states internally. The document's printed chain is not a literal linear state machine. |
| 11. Data model | Products/snapshots, jobs, versions, decisions, brand rules, assets and publications exist; Posts link exact versions. | Use the Post revision as the shared authority while retaining legacy records and URLs. |
| 12. Access/security | Numeric Telegram identity resolution, role permissions, identity-bound actions and audit mechanisms exist. | Production credential, retention and restore checks remain necessary. Remove the predictable publishing-proof secret fallback before enabling publishing. |
| 13. Guardrails | Product-aware deterministic checks, controlled similarity claims, generation safeguards and human review exist. | Regex checks do not prove all claims true. Add language-quality, freshness and recent-concept checks; retain independent human review. |
| 14. Technology/operations | Backend, Telegram package, Postgres, queues, media storage, provider abstractions and operational metrics exist. | Verify unattended provider auth, durable storage/backup, actual delivery and recovery under a controlled pilot. |
| 15. API semantics | Product lookup, generation, revision, review, history and Post endpoints cover the intended concepts. | Telegram and web should call the same Post commands instead of diverging semantics. |
| 16. Natural-language revision | Legacy caption edit/regenerate and visual editing actions exist; web preserves revision history. | One instruction spanning design and Khmer text needs a single structured change proposal, exact new revision and fresh paid consent where needed. |
| 17. Delivery phases | Repository includes work from multiple phases. | Re-sequence releases by proven staff journeys rather than exposing every partially finished module. |
| 18. Acceptance criteria | Many criteria have unit-test evidence; detailed matrix below. | Live Telegram/provider and staff acceptance are not established by this audit. |
| 19. Testing/UAT | Substantial fake/unit/integration/browser infrastructure exists; 153 targeted tests passed freshly. | Run the specified 20-real-product evaluation and one-week staff UAT, with explicit quality and safety gates. |
| 20. KPIs | Legacy analytics counts content, creative jobs, approvals, usage and publications. | Include Posts/MCP activity; add approval turnaround, first-pass approval, revisions and verified cost per approved asset. |
| 21. Management decisions | Technical controls support several decisions, but business guidance is unfinished. | Assign brand/source/reviewer owners, approved examples, scope and spending policy. |
| 22. First sprint | Much more than the initial narrow spotlight slice is implemented. | Demonstrate one dependable spotlight journey before expanding the surface further. |
| Appendix A. Definition of done | Immutable facts, media safeguards, versions and human approval align. | Add current-fact checks and actual visual/Khmer quality acceptance; no absolute “all facts verified” claim. |
| Appendix B. Future opportunities | Campaign, analytics, visual and publishing foundations exist. | Campaign bundles, stock-aware suggestions and measured feedback can add value later; sales/Meta learning is not currently proven. |

## Original MVP acceptance criteria

| Criterion | Telegram assessment | New web Post assessment |
|---|---|---|
| A1. Authorized search/select | Implemented; command tests pass; live bot not exercised. | Product selection exists; prior isolated browser evidence, not freshly repeated. |
| A2. Source facts visible | Product snapshot/source display paths exist. | Selected snapshot/facts accompany the saved post. Cached freshness must be explicit. |
| A3. At least five content types | Five strategy classes exist: spotlight, promotion, scent pyramid, educational and engagement; prerequisites differ. | Seven purpose labels exist, but labels do not establish seven specialized AI outputs. |
| A4. Bilingual AI caption and facts metadata | Actual provider path and structured output exist; real Khmer quality not verified. | Current worker uses staff draft or `catalog-template-v1`; this is not equivalent to AI writing. |
| A5. Automatic fact checks | Deterministic validation exists and targeted tests pass. | Validation and approved-image safeguards exist; semantic completeness is not guaranteed. |
| A6. Approve/reject/regenerate/natural edits | Legacy actions exist; restart issue described below. | Complete-post actions/revisions exist; unified Telegram/web behavior remains incomplete. |
| A7. Version/original linkage | Job/version/snapshot linkage exists. | Persistent Post revision associations exist. |
| A8. Approver/time recorded | Approval records and audit history exist. | Final-review decisions/history exist; independence checks are stronger than the document's basic requirement. |
| A9. Unauthorized blocked | Numeric identities, roles and bound tokens exist; no live adversarial bot test in this audit. | Backend access and review policy have targeted tests. |
| A10. Recoverable errors | Persisted workflow/recovery mechanisms exist, but not all interaction details are durable. | Durable image dispatch/uncertain states have fake-test evidence; real provider recovery unverified. |
| A11. No default autopublishing | Feature/capability controls exist; no external sending was attempted. | Complete-Post direct publishing is unavailable and should remain honestly labeled. |

## Important gaps, with code evidence

### 1. One business post currently has two workflow implementations

Telegram's `telegram-command-center.ts` confirms generation through `CreateContentJobUseCase`, while `telegram-outbox.dispatcher.ts` handles legacy content and creative events. The newer web workflow uses Post/PostRevision and its own generation worker. A web post and a Telegram draft are not demonstrated to be the same editable/reviewable entity.

**Fix:** keep Post as the authority for new complete-post requests; expose the same commands to web and Telegram. Preserve ContentJob/CreativeJob and historical decisions through explicit links/adapters, never by rewriting approval history. A draft started in Telegram should open in the web with the same ID, media, caption revision, feedback and review state. An edit must invalidate any older review of the changed revision in both interfaces.

Evidence: `app/packages/application/src/modules/telegram/application/telegram-command-center.ts:1023`, `app/packages/telegram/src/telegram-outbox.dispatcher.ts`, `app/apps/worker/src/post-generation.worker.ts` and `app/packages/database/prisma/schema.prisma`.

### 2. New web captions bypass the useful existing AI engine

`post-generation.worker.ts:84–123` identifies captions as staff drafts or catalog templates and builds generic name/brand/price text. The legacy AI path already separates strategy, brand rules, product facts and generation.

**Fix:** share the modular caption engine with Posts. Freeze the chosen brand-rule version, strategy, facts, language and generated result into the Post revision. Keep factual checks and independent review. A disabled/missing text provider should show a clearly named manual/template fallback, never “AI completed.” Purpose selection must affect the actual content brief and output.

### 3. Brand consistency has not been completed by adding brand-related tables

The active local BrandRuleVersion includes unfinished business-confirmation values. Post provenance explicitly records no historical poster references. The presence of brand profiles, datasets or example URLs does not establish their use in generation.

**Fix:** approve a versioned brand pack: logos and usage rights, palette, Khmer/English fonts, tone, terminology, CTA/contact details, platform layouts, claims policy, and 10–20 representative rights-cleared posters annotated with what to reuse. Retrieve a few suitable approved examples per purpose, record exactly which images were sent, and assess similarity and product fidelity. This is reference-guided generation, not model training. Start with controlled layouts and the authentic product image; use generated backgrounds where appropriate.

### 4. Language switching can produce the wrong language

`revise-content.use-case.ts:101` fills a missing Khmer caption with the existing English caption/headline (and vice versa). Required-field validation does not translate or prove linguistic quality.

**Fix before bilingual staff use:** request translation/rewrite explicitly, or leave the missing language incomplete with a clear action. Require appropriate Khmer-script coverage while allowing product/brand names in Latin script. Use a Khmer-speaking reviewer and a business-approved terminology set. Test against real mixed-language perfume names and editing transitions.

### 5. A Telegram editing detail is lost on restart

`telegram-command-center.ts:136,204,1619` stores the chosen field for a pending edit in an in-memory Map, although a generic pending interaction is persisted. After restart, a reply to a field-specific question can lose that field context and follow the generic edit path.

**Fix:** persist the exact action, target revision and field, expiration and interaction ownership. Test a process replacement between “Edit Khmer caption” and the staff reply. Reject stale interactions with a practical resume action.

### 6. Real provider and video capability must stay distinct from mocks

The server-side Higgsfield MCP client/image adapter and durable Post dispatch exist. Later documentation supersedes the original assessment's “no app adapter” statement. However, fake-server tests and Codex's account authorization do not prove the application has a functioning live OAuth connection, real output access or approved shared/unattended usage. No price/balance was fetched here, and the old 0.25-credit quote is not reusable.

The new staff Video option is planning-only; a separate developer-SDK video adapter does not establish a working MCP-backed Post video lifecycle.

**Fix:** validate the application's own supported authentication/tool contract and storage first. Then present fresh exact settings, references, quote and balance for one explicitly confirmed live image request. Prove image retrieval, compositing, status/provenance, final review and download. Treat video as a separate acceptance milestone with its own settings, rights, identity checks and costs. No verified USD 20 monthly hard cap should be claimed.

Evidence: `docs/higgsfield-poster-pilot-assessment.md`, `docs/higgsfield-server-mcp.md`, `app/packages/creative-providers/src/mcp/`, `app/apps/worker/src/post-generation.worker.ts`.

### 7. Product facts need freshness and eligibility, not just a validation badge

Legacy validation compares a pinned snapshot; cached data may be stale. A promotion is only legitimate with approved current price and dates. A note-based explanation needs actual verified notes. Technical request deduplication is not a check for repetitive marketing concepts.

**Fix:** show source/as-of time; check current stock, price and promotion before scheduling/publishing and flag changes during approved export/release. Material changes require a new revision and reapproval. Do not mutate the already-approved snapshot. Add a recent SKU/channel/concept history warning and suggest a different angle, without silently blocking intentional campaign repeats. Reuse the legacy strategy prerequisites in the web flow.

### 8. Operations and analytics can give a misleading business picture

The current analytics repository counts legacy jobs/creative/publications, not the full Post/MCP lifecycle. A legacy manual-export confirmation directly marks a publication PUBLISHED; this is not evidence that Facebook or another destination actually received content. The Meta gateway/config also allow a predictable publishing-proof secret fallback, which must be removed before live publishing is enabled.

**Fix:** count approved Posts and actual delivery separately; use Downloaded/Exported versus Published with external evidence. Record generation duration separately from request-to-approved time. Include MCP credits and USD costs as separate units until a verified conversion/accounting rule exists; retain unknown costs as unknown. Require explicit secure publishing configuration and fail closed. Keep paid retries under provider-specific reconciliation: the text queue still allows retries, while creative generation uses one attempt and Posts have durable dispatch safeguards.

Evidence: `app/packages/database/src/analytics/prisma-analytics.repository.ts:35`, `app/packages/application/src/modules/publishing/application/confirm-publication.use-case.ts:52`, `app/packages/publishing/src/meta-publishing.gateway.ts:43`, `app/packages/config/src/environment.schema.ts:66`, `app/packages/jobs/src/content-generation.queue.ts:30`, `app/packages/jobs/src/creative-generation.queue.ts:40`.

### 9. Documentation needs one dated capability matrix

Older Telegram documents describe earlier phases, while a historical dossier uses “PRODUCTION CERTIFIED.” Neither statement should override current code and observed tests. Maintain one dated matrix of implemented, fake-tested, live-tested and disabled capabilities. Correct outdated caption-first instructions for new Posts without erasing historical workflow documentation.

## Recommended staff experience

1. **Choose a product.** See its authentic photo, name, verified price and stock/source time. Missing facts reduce the available content options.
2. **Choose the purpose.** Start with Product spotlight, Gift idea and Educational when supported; Promotion requires an active approved promotion. Ask for channel, Khmer/English and a short optional brief; campaign is optional.
3. **Prepare the complete draft.** Generate an image and useful captions within the same saved post, with honest separate progress. Confirm paid work against a current quote. Keep the product image intact where compositing is used.
4. **Preview and improve.** Show the actual poster plus channel caption, readable Khmer, editable text and simple actions: Edit caption, Change design, Regenerate. Distinguish a local edit from another paid generation.
5. **Send for review.** One complete revision goes to an authorized independent colleague. Web and Telegram point to that same revision. The creator/requester/revision authors cannot approve it, including administrators; a second account controlled by the same person is not an independent review.
6. **Use the approved result.** Download the exact approved image and captions; expose publishing only for destinations whose authenticated complete-post integration is working. Editing creates a new revision requiring fresh validation and approval.

For feedback such as “make it minimal, enlarge the bottle and shorten the Khmer caption,” show a proposed change list first: layout update, product placement update, Khmer rewrite. Preserve the source photo and old revision. Ask for a fresh paid confirmation only if the proposed operation actually submits another paid request.

## Phased implementation and measurable exit gates

| Phase | Work | Exit gate |
|---|---|---|
| 1. Finish the dependable core | Connect Telegram/web to shared Posts; reuse the AI caption/strategy engine; approve active brand rules; fix language switching and durable edit context; standardize complete-post review. Preserve legacy records. | Same post can be started in one interface and continued in the other; exact revision reviewed; self-approval/stale decisions rejected; restart preserves edit intent; missing configuration gives an honest fallback. All verified with isolated no-cost tests. |
| 2. Prove one real poster | Validate app-side provider connection and supported usage; approved photo, durable media, fresh quote/consent, one live generation, review/download, failure reconciliation. | One saved real image and captions correctly associated; image quality/product identity checked by staff; actual provider evidence and cost recorded; no duplicate submission or external publishing. A fake test alone does not satisfy this gate. |
| 3. Controlled staff pilot | Evaluate 20 real products covering missing descriptions, out-of-stock, varied imagery, notes, language and promotion cases; conduct one-week UAT with staff and an independent reviewer. | Product/price/claim violations are release blockers; all approved outputs have valid review; staff can complete the journey with recorded assistance and error rates. Define turnaround, first-pass quality and spending targets before testing. |
| 4. Campaign productivity | Approved feed/Story/channel caption bundles, calendar suggestions, stock/promotion eligibility, reference retrieval, reusable layouts and Post-inclusive management reporting. | Variants retain the correct product and facts, disclose references and cost, preserve exact review scope and demonstrably reduce staff work. |
| 5. Video and controlled publishing | Finish real MCP video lifecycle and then destination-specific publishing, freshness, expiry and external delivery reconciliation. | Independent acceptance per provider/channel; duration/resolution/audio/rights and cost known; real output/delivery evidence; no auto-resubmit of uncertain charged work. |

Do not force a calendar estimate until provider access, brand ownership and the shared workflow are confirmed. This sequence reuses working functionality instead of replacing the repository.

## Benefits worth showing management

| Real staff use case | Useful outcome | Evidence to collect |
|---|---|---|
| New fragrance arrival | One source of facts produces a polished poster and natural bilingual caption without tool switching. | Request-to-approved minutes; steps requiring help; product fidelity and caption quality. |
| Staff receives “make it a gift idea” feedback | New complete revision with the original preserved; reviewer sees exactly what changed. | Revision count, feedback turnaround, stale approval rejection. |
| Promotion expires or stock changes | System warns before reuse/release rather than advertising unsupported information. | Prevented stale-price/availability incidents, never invented discounts. |
| Same product needs several channels | Approved channel variants and reusable brand layout reduce repetitive work. | Time per usable variant; readability and fact consistency per channel. |
| Manager reviews the week's work | Clear queue, responsibility, approved assets and costs; no mistaken export-as-publication counts. | First-pass approval, backlog age, actual cost per approved asset with unknown amounts disclosed. |

Do not invent ROI or claim sales lift without attribution. Establish a manual baseline on the same product tasks, then compare assisted completion time and quality. Learn from reviewer feedback through approved rules/examples and measured retrieval; do not imply that storing history automatically trains a model.

## A credible management demonstration

After the core/live-image gates pass, demonstrate one actual verified product in roughly 5–8 minutes: select its facts and photo → explain the content purpose → produce a brand-guided poster and bilingual caption → make one understandable revision → have an independent colleague review → download the exact approved assets → show the truthful history and costs. Show a promotion-ineligible or self-approval case briefly to demonstrate a practical safeguard.

If using a mock for a rehearsal, label it visibly and say which part remains unverified. Hide or clearly label unfinished video/publishing controls. The impressive outcome should be that an unfamiliar staff member understands the next action and obtains usable, consistent work—not a large menu of technical modules.

## Business decisions to settle

- **Brand owner:** approve the tone, Khmer terms, logo/contact details and representative historical posters; confirm rights and which older designs should not be copied.
- **Catalog owner:** confirm the authoritative API and refresh expectations, promotion dates and handling of low/out-of-stock products.
- **Initial scope:** recommend complete product posters with Khmer/English captions first; treat video as a separate delivery gate rather than promising it is ready.
- **Review responsibility:** nominate an actual independent manager/colleague and define availability/escalation. Do not solve this with another account for the creator.
- **Budget definition:** clarify whether USD 20 means incremental app/API spending or includes the existing subscription; define separate credit controls and handling of unknown charges. A configured number alone is not a verified monthly hard cap.
- **Pilot scorecard and retention:** agree acceptable quality/turnaround targets, product coverage, access, storage/retention and backup ownership before onboarding the whole team.

**Readiness:** suitable for continuing isolated usability testing and targeted implementation. Not yet signed off for unattended production or a real-content staff rollout. A live provider proof, approved brand guidance, unified interface behavior, language fixes and staff UAT remain essential.
