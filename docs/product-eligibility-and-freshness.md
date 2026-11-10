# Shared product eligibility and freshness

Implemented and verified with isolated fixtures on 7 November 2026. No live catalog verification, paid provider request, actual Telegram delivery or publication was performed.

## Staff behavior

Web and Telegram use the same Post product checks. The web's product-selection/details step and saved Post workspace show source, saved facts/as-of time, source-update time, last check, cached/test/unavailable status, missing requirements and practical alternatives. Telegram complete-Post previews show the same source/as-of and eligibility messages beside the exact saved caption/poster revision. Catalog readiness also uses the shared checks rather than treating an old `FRESH` assessment as permanently fresh.

The Post workspace offers **Check source now — no AI credits**. It fetches the configured product source and records a freshness assessment. A successful HTTP response containing old data is not fresh verification. A failed check retains the old facts/as-of timestamp and shows unavailable status; recently cached facts are not relabeled `FRESH` after failure.

When material source scopes differ—price, promotion, stock, permanent facts or images—generation/review/release is blocked. **Use latest facts in a new revision** fetches the source again and creates a separate draft revision. It clears the linked caption and poster, invalidates current approval and requires regeneration/editing and independent review. Earlier revisions, facts, files and decisions are retained. A source check never silently updates an approved Post.

Existing approved-image, rights, content-validation and independent-review checks remain in place. Product images from catalog URLs are not automatically marked rights-verified or described as registered cutouts. Generation and release still require the authoritative approved image through the existing asset evaluator. Synthetic fixtures are test images, not real product photography.

## Purpose prerequisites

- **Promotion:** a source-controlled promotional price lower than the regular price, a positive discount, explicit approval evidence and valid start/end dates are required. Start is inclusive; the end is exclusive. Unapproved, future or expired offers are excluded from staff promotional-price displays and Post caption evidence. A missing offer gives the alternative Product spotlight without a promotion.
- **Fragrance-note education:** choose the explicit **Verified fragrance notes** educational focus. The existing scent-pyramid strategy requires nonempty source notes. General education from ordinary verified facts remains available and cannot invent missing notes or benefits. Telegram scent-pyramid selections map to this same focus.
- **New arrival:** blocked because the current source schema provides no authoritative arrival date. A new import or recent snapshot is not arrival evidence. Staff can choose Product spotlight.
- **Stock:** missing inventory tracking/quantity is `unknown`, not automatically zero or available. Explicit source stock states and quantities are mapped without inventing a low-stock threshold. Marketing permission does not establish availability: captions claiming stock where it is unknown/preorder are rejected. Invented stock quantities and unsupported performance/benefit claims remain subject to factual validation.

The normalized discount schema now optionally accepts `approval: { status: "approved", approved_by, approved_at, reference }`. No existing promotion receives this evidence automatically. The current Mekhla mapper does not fabricate promotion approval from sale prices, dates or descriptions. Its source contract/catalog owner must supply real approved promotion evidence before promotion content can be supported there.

## Explicit business policy

The existing `FreshnessPolicyVersion` and append-only activation records are extended with optional marketing stock rules. No competing stock-policy table or inferred business default was introduced. `/admin/product-policy` lets an administrator enter a version, all existing TTL windows, stock decisions and explicit business confirmation. Approval records the administrator on the existing activation ledger. Content hashes include supplied stock rules; changing rules requires a new version. The API activates only the current application's environment.

For low stock, out of stock, preorder and unknown stock, a missing action blocks generation/release while leaving drafts editable. Business-approved actions are **Allow**, **Warn**, or **Block**. Discontinued/inactive products remain blocked. Known in-stock facts retain normal eligibility unless the business explicitly blocks them. An allowed out-of-stock/unknown-stock evergreen post still cannot assert invented availability or urgency.

Development/test TTL benchmarks remain labeled development benchmarks; they do not invent stock decisions or establish a production policy. Production still needs an explicitly approved freshness policy. No policy or production integration was activated in the main database during this work.

## Shared implementation and release boundaries

`ProductMarketingEligibilityService` reuses the normalized source schema, `ProductSource`, immutable snapshot repository, dependency hashes, `FreshnessEvaluator`, freshness-policy repository, assessment repository, existing promotion/scent-pyramid strategies and factual validator. It adds application-level purpose eligibility, current-offer evidence, explicit stock decisions, alternatives and advisory history. Existing standalone source-revalidation/outbox behavior is preserved.

Freshness checks guard:

- Post caption preparation and poster request preparation.
- Worker execution immediately before image submission, so waiting in the queue does not bypass fact checks.
- Complete-Post submission and independent approval in both web and Telegram.
- Approved Post downloads, including reused saved files. Export manifests include the release check, exact policy/hash and assessment ID.
- Standalone approved poster export, including cached-export reuse.
- Publication creation/scheduling intent, confirmation and retry.
- The existing Telegram manual-publication adapter before any dispatch, if that integration is separately enabled.

Direct Post publishing and unsupported destinations remain unavailable. No scheduler, external channel or provider integration was enabled. Future publishing workers must use the same check immediately before dispatch; checking when a schedule is created does not make future facts permanently fresh.

Material changes create candidate snapshots and append assessments; network requests are not performed inside a transaction that changes approved Post content. Post revision changes retain the existing optimistic concurrency and authorization checks. Source-check retries are separate from potentially charged media-request reconciliation.

The normalizer is versioned `phase-1b-v2` for the corrected inventory interpretation, and the factual validator is `ps-factual-v2` for stock-claim safeguards. Historical rows are not rewritten to these versions.

## Repetition warnings

The service considers up to ten recent accessible Posts for the same SKU, one current revision per Post. It warns about the same normalized brief/purpose, recent use of the product and intentional same-campaign repeats. Unicode combining marks, including Khmer, are preserved during comparison. These are deterministic advisory signals, not semantic AI similarity scores or a business cooldown rule.

Warnings never prevent intentional repeats and never alter technical request keys, generation dispatch claims or idempotency. Users see only history accessible under the existing ownership/reviewer permissions. No arbitrary publication frequency policy was invented.

## Verification

- **237 targeted unit tests**: source mapping, freshness/time boundaries, policy hashes, product/offer/notes prerequisites, outages, immutable source facts, stock rules, unsupported claims, current-offer filtering, intentional repeats, release/retry guards and existing Telegram behavior.
- **28 integration tests** in a disposable PostgreSQL database, including real application services, fake image/catalog sources, independent review, exact approved downloads, source-price changes blocking release, a new editable facts revision with preserved historical approval, source outage and a fake Telegram projection of the same Post/source state.
- **204 web tests**, including missing facts/outage alternatives, new-facts revision actions, advisory campaign repeats and explicit blank business-policy inputs.
- `scripts/verify-product-eligibility-endpoints.mjs` exercised real Nest endpoints against `scripts/verify-post-workflow.mjs --caption`: cached vs checked facts, source failures, catalog readiness not falsely fresh, immutable prior revision, new facts revision, explicit policy approval, unauthorized policy changes, and low/out-of-stock decisions. It refuses normal application ports/databases. The harness uses a controllable fake product source and disabled live queues; its database, media and session file were cleaned up afterward.
- Relevant TypeScript build, scoped ESLint, module boundaries, Prisma schema validation and whitespace checks were run. Evidence is under `app/output/runtime/product-eligibility-*`.

These checks use fake sources/media and component tests. They are not a fresh Chrome/mobile usability session, live catalog trial or real provider verification. Costs: zero provider credits. External messages and publications: zero.

## Deployment and business inputs still needed

The additive `20261107220000_product_marketing_policy` migration adds one nullable JSON column. It was exercised in disposable databases and has not been applied to the main local/business database. Deploy the reviewed pending migrations and matching API/worker/web builds together before using this feature in the main app.

The business must provide:

1. The authoritative catalog configuration and ownership of price, stock, notes and imagery corrections.
2. Approved freshness windows and explicit low/out-of-stock, preorder and unknown-stock marketing decisions. Existing approved versions must be preserved.
3. A source contract carrying real promotion approval evidence and valid dates/prices. No approval is inferred from a discount field.
4. Verified arrival-date evidence if New arrival is to become available; otherwise it remains unavailable.
5. Human acceptance of the resulting captions, imagery and Khmer/English quality before a controlled staff pilot.
