# Prompt 11 workspace restoration — 2026-11-10

Reference: `/Users/macbookpro/Downloads/ParisianShopperAI_Prompt11_Project.zip`.

The ZIP is a standalone browser prototype containing fictional product/account fixtures, simulated integrations and local-storage business records. It is a design reference, not a replacement backend. Its scripts and fixture records were not installed into the application or executed as project migrations.

## Restored experience

- Prompt 11 workspace groups: Workspace, Create, Govern, Intelligence and Administration.
- Dark teal workspace bar, compact breadcrumb/search header, warm neutral backgrounds, gold accents, light/dark preference, sidebar active marker and responsive drawer.
- Dashboard with current user's saved Posts, accessible pending reviews/approved Posts and active campaigns, using existing authenticated API endpoints. Empty/loading/error states are explicit; failed requests are not displayed as zero.
- Products & Promotions entry point, saved catalog images/prices, source caveat, catalog counts, brand/category/search/stock filters and retained product-detail/asset/readiness flows.
- Creative Library combines accessible persistent Posts and historical standalone projects without converting either record type.
- Templates lists the real registered backend layouts; choosing a layout pins that template into the existing creative wizard. The icons are layout symbols, not claimed generated previews.
- Operations reads real Caption/render/publication outcome endpoints. It does not fabricate infrastructure health or restart work.
- Section navigation for Creative, Brand, Analytics, Administration, Budget, Publishing and Content.
- Known `#/module/...` and `#/studio` prototype bookmarks resolve to authenticated application routes. Existing application URLs remain intact.

| ZIP area | Application route / source |
| --- | --- |
| Overview | `/` — Post scopes and active campaign API |
| Campaigns | `/campaigns` — existing persisted campaign list/detail/wizard |
| Products & Promotions | `/products` — catalog source/snapshots and real filtering |
| Content Studio | `/content` — retained standalone Caption tools; `/posts/new` for complete Posts |
| Creative Studio | `/creative` — retained poster projects/editor/export/review services |
| Creative Library | `/creative/library` — accessible Posts and standalone projects |
| Templates | `/creative/templates` — `/v1/creative/templates` |
| Review & Approvals | `/posts/reviews`; standalone reviews remain under Additional tools |
| Brand Intelligence | `/brand/profile`, guidance/references, benchmarks and datasets |
| Publishing | `/publishing` — existing destinations and explicit capability states |
| Analytics | `/analytics` and existing detailed report endpoints |
| AI Usage & Budgets | existing `/budget/*` and `/analytics/costs` |
| Operations | `/operations` — production outcome records |
| Administration | existing team/settings/audit routes |

This restores the reference's workspace structure and visual direction; it is not a pixel-for-pixel port of every prototype sub-screen. Fictional calendar activities, Telegram simulations, fixture posters and provider billing examples have not been presented as real functionality. The actual Telegram backend remains intact.

## Backend defect fixed during verification

`GET /v1/analytics/budgets` previously attempted to create a default $20 policy using an invented all-zero actor when no policy existed. A fresh database returned HTTP 400, and viewing a report could attempt a business mutation.

The application use case now returns no policy without writing anything. The controller explicitly returns `{ "configured": false }`; the web normalizes this to an empty budget state with practical guidance. Existing configured-policy responses remain compatible. Analytics also avoids fetching cost data for users without the relevant permission. No business budget was created or approved.

## Preservation and local runtime

Recovery archives were created before implementation:

- Source/uncommitted work: `/Users/macbookpro/.codex/backups/parisian-before-prompt11-20261110-162608.zip`
- Database: `/Users/macbookpro/.codex/backups/parisian-before-prompt11-20261110-database.dump` (custom pg_dump archive; inventory verified).

The local database was five additive migrations behind the existing code. After the backup, migrations `20261107120000` through `20261108000000` were deployed. The schema now reports up to date (32 migrations). No business record was deleted, converted into an approval, reset or reseeded. Authorization and independent review rules were retained.

The normal app is running at `http://127.0.0.1:5173/`, with API on port 3000. Web, API liveness and readiness returned HTTP 200. Only API/web were started. For this review session, runtime overrides disable Telegram delivery, live Post Caption dispatch and Higgsfield MCP dispatch; persistent `.env` files were not changed. Workers were not started.

## Verification

- **211 web tests passed** across 38 files, including new backend-bound dashboard, error/retry, permission-filtered navigation, product search, registered-template and route-alias checks, plus the missing-budget state.
- **30 backend unit tests passed** for analytics/budget behavior, including no policy creation on GET and explicit controller response.
- **29 isolated Post database integration tests passed**, retaining version associations, independent approval/self-approval rejection and fake-provider image lifecycle checks.
- Backend TypeScript build, web typecheck/production build, scoped TypeScript/script lint, Prisma validation, boundaries and whitespace checks passed. The existing ESLint configuration does not cover TSX; web TypeScript and Vitest provide the checks for those files.
- Playwright used real browser navigation against an isolated application/database with fake providers. Verified login, desktop routes, mobile drawer/Escape, no mobile main-content overflow, light/dark layouts, real template listing, a saved Post/campaign association and persistence after reload. The draft was created only in the disposable database. No paid generation was started from the browser.
- `scripts/verify-prompt11-restoration.mjs` verified ten real authenticated endpoints, including the corrected missing-budget response, and unchanged budget/generation/publication row counts.
- Credits spent: **0**. External messages/publications: **0**. No real business content was approved.

Evidence: `app/output/runtime/prompt11-endpoints.json`, web/unit/integration logs and `app/output/playwright/prompt11-*.png`. The disposable test database and its services were cleaned up; the normal API/web remain running.

## Remaining limits

Restoring the design does not finish unavailable integrations. Real paid Higgsfield output was not exercised; video generation and direct publishing of complete Posts remain subject to their existing unavailable/disabled states. Approved brand guidance, product imagery/rights, freshness/stock policy and external account setup still require their actual business inputs. A production readiness claim would require separate live-provider, delivery and operational verification.

The production web bundle still emits the existing large-chunk warning. No claim is made that every prototype feature now has a production integration.
