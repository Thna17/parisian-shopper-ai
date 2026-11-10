# Versioned brand guidance and reviewed references

Implemented 7 November 2026. Verification uses disposable databases, synthetic assets and fake providers. No real business brand approval, paid generation, Facebook ingestion, Telegram delivery or publishing was performed.

## Business workflow

Administrators open **Advanced tools → Brand guidance and references**, or `/brand/guidance`. Existing `/brand`, `/brand/profile`, benchmark and dataset URLs remain usable.

1. Upload actual PNG/JPEG/WebP reference files (up to 500 KB each), and record the original source/document URL, owner, license/permission evidence, caption and tags. URLs are recorded; this action does not fetch or scrape them. Tag an approved PNG `logo` to make it eligible as a logo.
2. Preview each reference. A copyright declaration is not approval. An administrator must explicitly confirm rights and record review notes. Rejection and permission revocation are retained as separate decisions. Stale review screens cannot overwrite a more recent decision. Editing a source creates a new, unreviewed reference version.
3. Create a brand draft using actual business decisions: English/Khmer tone, terminology, formality, capitalization, emoji policy, CTA, contacts, claims restrictions, colors, lighting, supported fonts, logo or explicit text-only identity, and selected channel layouts. There are no pre-approved official Parisian Shopper rules.
4. Preview the exact version, effective caption rules, selected source versions, fonts, colors, logo, channel layout choices and available benchmark evidence. Confirm business review before approving. A draft or legacy activation alone is insufficient. Existing benchmarks are supporting heuristics; a passing score does not establish brand approval or Khmer quality.
5. Staff explicitly select the active approved pack when preparing a caption, and optionally choose its approved historical text examples. The Post saves the exact pack/rule/dataset IDs, approval, source versions, rights review IDs, media hashes and guidance. The image worker uses this saved guidance, channel palette/layout/CTA and verified logo bytes while preserving the approved product image through composition.
6. Independent complete-Post review remains required. Reference permission changes block further generation, submission/approval and approved downloads through the application services until the draft is reconciled. Existing Post snapshots, decisions and files are retained.

The renderer currently supports Playfair Display, Noto Sans Khmer and Montserrat. Its existing templates use square 1080×1080 output and fixed safe-margin logo placement; uploaded logo colors and aspect ratio are preserved. The admin preview explains these constraints. Other fonts, aspect ratios or bespoke logo rules need renderer work before they can be promised.

## Reuse and version safety

This extends the existing `BrandProfileVersion`, `BrandRuleVersion`, `BrandSourceArchive` and `BrandDatasetVersion` rather than introducing a separate brand identity. `BrandGuidanceService` coordinates application behavior; the Prisma adapter enforces transactional approval and source eligibility. `BrandGuidanceModule` reuses the existing brand and creative/CAS modules.

A managed draft links immutable caption rules and a versioned reference collection. Existing caption rules are append-only: business approval records eligibility without changing their historical status/content. Managed profile activation is gated by explicit `BrandProfileApproval`; the legacy activation endpoint cannot bypass it. Managed content and source archives cannot be rewritten; new versions and review decisions are additive. Historical legacy records receive no manufactured approval.

`PostRevision.brandSnapshot`, caption attempt provenance, image attempt evidence and approved export manifests retain the exact versions actually used. New brand approvals retire earlier packs for new captions without rewriting their Post snapshots. Retired, approved versions may finish existing drafts while their rights remain valid. Revoked/re-reviewed permissions require reconciliation, not silent replacement. Benchmark evidence is frozen at business approval; later heuristic reruns do not rewrite saved provenance.

## What historical references actually do

**Caption text examples:** explicitly selected, approved, rights-reviewed sources are supplied to the text provider as untrusted style examples. Product facts and instructions embedded in these examples are not authoritative. Their exact source/review/media identities are pinned.

**Poster image references:** the current app-side image-provider contract does not accept image-reference inputs. No historical poster image is sent to Higgsfield or another image model by this workflow. Image provenance records `imageInputReferences: []`, `referenceGuidedImage: false`, and `historicalPostersUsed: false`. The approved logo is a separately verified compositor input, not an image-model reference. Approved palette/layout instructions are not a claim of visual similarity to historical posters.

This is reference-guided caption generation and brand-guided composition. It is **not training or fine-tuning**. Historical image similarity and brand/Khmer quality have not been validated by a real provider or human panel.

## Verification evidence

Relevant checks passed: **123 unit tests, 27 database integration tests, 200 web tests**, plus the isolated HTTP endpoint assertions. These are no-cost checks, not live-provider verification.

- `app/output/runtime/brand-guidance-unit.log`: brand/source/dataset/benchmark governance, source-byte/permission validation, forged pins, caption providers, review/export and compositor regression tests.
- `app/output/runtime/brand-guidance-integration.log`: disposable PostgreSQL migration and complete Post lifecycle; unreviewed references, permissions, stale decisions, exact pinning, immutable history, changed benchmark evidence, new pack/source versions, revocation, fake caption generation, real local PNG composition with selected logo/palette, approved manifest and restricted downloads after revocation.
- `app/output/runtime/brand-guidance-web.log`: admin preview/confirmation/reference review and staff selection tests, plus existing web regression suite. Component tests are not a fresh Chrome/mobile usability session.
- `app/output/runtime/brand-guidance-endpoints.json`: real Nest endpoints in the isolated fake-provider harness: sessions/CSRF routes, rights confirmation, stale review conflicts, unauthorized mutation rejection, explicit brand approval and exact caption/Post provenance. Harness database/assets/test sessions were removed afterward.
- `app/output/runtime/brand-guidance-build.log`, `brand-guidance-lint.log`, `brand-guidance-schema.log`, `brand-guidance-boundaries.log`: relevant TypeScript, scoped lint, Prisma validation and architecture checks.

Reproduce endpoint verification by building the services, starting `node scripts/verify-post-workflow.mjs --caption`, then running `node scripts/verify-brand-guidance-endpoints.mjs`. This script refuses ordinary application ports/databases and requires the fake harness. Stop the harness afterward so it drops its disposable database/assets. Never use these fixtures to seed business approvals.

## Deployment and business inputs still required

The additive `20261107200000_versioned_brand_guidance` migration is provided and exercised in disposable databases. It has **not** been applied to the main local/business database. Earlier pending shared-Post/caption migrations are prerequisites. Review/apply them in normal dependency order and deploy matching API/worker/web builds before using this screen on the primary app. No provider dispatch flag or production integration was enabled.

The business must supply and approve:

- Actual logo files and usage rights, or explicit approval of text-only branding; acceptance of the available fonts/layout constraints.
- Palette, channel layouts, Khmer/English tone and terminology, capitalization/formality and emoji preferences.
- Store contact details and accepted CTAs; permitted claims, promotions and prohibited wording.
- Representative poster files, source links, ownership/permission evidence and the versions that may be used as examples. A Facebook URL alone is insufficient.
- An authorized business approver and independent Post reviewers; human Khmer/English assessment and brand-quality acceptance before a staff pilot.

No real provider output or marketing-quality acceptance is claimed. Costs incurred: zero provider credits; external messages/publications: zero.
