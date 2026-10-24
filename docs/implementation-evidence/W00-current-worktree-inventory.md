# W00 — Current Worktree Inventory

## 1. Executive summary

This report executes work package **W00 — Preserve and inventory the current worktree** for the Parisian Shopper AI repository. The objective is to produce an exhaustive, evidence-backed inventory of active tracked and untracked work, establish baseline facts, map component ownership and conflicts, and define safe boundaries so that work package **W01 — Restore the green engineering baseline** can proceed without damaging active development.

The working tree reflects an active, sophisticated evolution from an initial hero-composition proof-of-concept toward an 8-layer deterministic poster studio, bilingual Khmer/Latin typography engine, local Codex CLI provider infrastructure, and structured poster revision/export capabilities.

Key findings:
- **Repository State:** Current branch is `feat/sharp-hero-compositor` at HEAD commit `be92bce6be0afe49ade297a20b967317389446a3`.
- **Working-Tree Volume:** Exactly 156 changed files: 91 modified tracked files, 65 untracked files, 0 staged files, 0 deleted files, and 0 renamed files.
- **Baseline Quality Gates:** 7 out of 8 required commands passed immediately (`typecheck`, `test:unit` [59/59 suites, 486/486 tests], `boundaries`, `lint`, `build`, `security:check`, `check:licenses`). Exactly 1 gate failed: `pnpm format:check` reported code style issues in 4 active poster/review files.
- **Critical Architectural Overlaps:** 
  1. Old `HeroCompositor` (`ps-compositor-v1`) vs. new `PosterCompositor` (`ps-poster-compositor-v2`).
  2. Automatic channel broadcast on `CREATIVE_APPROVED` in `TelegramChannelBroadcastAdapter` vs. Invariant 1/9 (publication must require explicit human `PublishIntent`).
  3. `ProductAssetValidator` rejecting synthetic placeholder PNG hashes that legacy unit fixtures still reference.
  4. Local `CodexCliCreativeProvider` / `CodexCliTextProvider` alongside cloud `OpenAICreativeProvider` / `OpenAITextProvider`.
- **Preservation Invariant:** Every existing modification and untracked file has been preserved intact. No files were reset, reverted, deleted, staged, stashed, reformatted, or committed.

---

## 2. Repository identity

| Property | Value / Evidence |
| :--- | :--- |
| **Absolute Working Directory** | `/Users/macbookpro/Desktop/Development/parisian-shopper-ai` |
| **Git Working Directory** | `/Users/macbookpro/Desktop/Development/parisian-shopper-ai` |
| **Current Git Branch** | `feat/sharp-hero-compositor` |
| **HEAD Commit Hash** | `be92bce6be0afe49ade297a20b967317389446a3` |
| **HEAD Commit Subject** | `feat(ops): harden production daemons, graceful shutdown and prometheus metrics (PR 3A-3)` |
| **HEAD Commit Author** | `Hong Than Brathna <hangbrathna10@gmail.com>` |
| **HEAD Commit Date** | `Wed Oct 14 15:22:29 2026 +0700` |
| **Git Remote Names & URLs** | `origin https://github.com/Thna17/parisian-shopper-ai.git (fetch & push)` (no embedded credentials) |
| **Declared Node Engine** | `22.22.2` (in `app/package.json` engines and `app/.nvmrc`) |
| **Declared Package Manager** | `pnpm@12.9.1` (in `app/package.json` engines and `packageManager`) |
| **Monorepo Structure** | Monorepo root code directory is `app/` configured via `app/pnpm-workspace.yaml`. Top-level workspace groups: `apps/*` (`api`, `worker`) and `packages/*` (`ai-providers`, `application`, `codex-cli`, `common`, `config`, `creative-providers`, `database`, `jobs`, `logger`, `telegram`). Outer root contains `.git/`, `.github/`, `docs/`, `research/`, `CHANGELOG.md`, and `prompt.md`. |

---

## 3. Git working-tree inventory

### 3.1 Status breakdown

- **Staged files:** 0 (`git diff --staged --name-only` returned empty)
- **Tracked modified files:** 91 (`M`)
- **Untracked files:** 65 (`??`)
- **Deleted files:** 0 (`D`)
- **Renamed files:** 0 (`R`)
- **Added files (staged):** 0 (`A`)
- **Total changed paths in Git status:** 156

### 3.2 Ignored generated and runtime files

The following files and directories are ignored via `.gitignore` but contain active generated runtime assets, caches, and fixtures:
- `app/.data/fixtures/poster-samples/` — Generated golden poster PNGs (`centered_hero-poster.png`, `editorial_split-poster.png`, `khmer_seasonal-poster.png`, `scent_story-poster.png`), debug layout visualizations (`*-debug.png`), and bounding-box manifests (`*-manifest.json`).
- `app/.data/poster-prototypes/` — Prototype renders (`pchum-ben-luxury-template-v1.png`, `luxury-background-v1.png`).
- `app/.data/assets/products/` — Authentic Geparlys perfume PNG cutouts with alpha channels (`GEP-KING-EDP-100.png`, `GEP-KING-LGD-100.png`, `GEP-KL-COU-100.png`, etc.).
- `app/.data/assets/cas/` — Content-addressed storage cache directory organized by two-digit hex prefixes.
- `app/.data/codex-live-test/` — Timestamped live test execution runs containing `background.png`, `final-composite.png`, `content.json`, and `metadata.json`.
- `app/apps/*/dist/`, `app/packages/*/dist/` — Built TypeScript artifacts.
- `app/apps/*/tsconfig.tsbuildinfo`, `app/packages/*/tsconfig.tsbuildinfo`, `app/tsconfig.test.tsbuildinfo` — Incremental compilation cache.
- `app/node_modules/`, `app/apps/*/node_modules/`, `app/packages/*/node_modules/` — Installed dependencies.
- `app/.env`, `app/.env.local`, `app/apps/api/.env`, `app/apps/worker/.env`, `app/packages/database/.env` — Environment files (untracked/ignored; strictly protected from inspection).

---

## 4. Changes grouped by system area

Every tracked modified (`M`) and untracked (`??`) file is categorized below:

### 4.1 API (`app/apps/api`)
- `M  app/apps/api/package.json` — API entrypoint dependency configurations.
- `M  app/apps/api/src/app.module.ts` — NestJS root module wiring for API.
- `M  app/apps/api/test/e2e/health.e2e-spec.ts` — API health check E2E tests.
- `M  app/apps/api/tsconfig.json` — API TypeScript configuration.

### 4.2 Worker (`app/apps/worker`)
- `M  app/apps/worker/src/__tests__/worker-health.service.spec.ts` — Worker health unit test.
- `M  app/apps/worker/src/worker-health.service.ts` — Worker health and metrics reporting service.

### 4.3 Application / Core Domain (`app/packages/application`)
- `M  app/packages/application/src/index.ts` — Public export barrel for application module.
- `M  app/packages/application/src/modules/validation/domain/normalization.spec.ts` — Data normalization spec.
- `M  app/packages/application/src/modules/validation/domain/normalization.ts` — String and money normalization rules.

### 4.4 Product Source (`app/packages/application/src/modules/products`)
- `M  app/packages/application/src/modules/products/infrastructure/mock-product-source.ts` — Mock product catalog source adapter.
- `M  app/packages/application/src/modules/products/testing/fictional-products.ts` — Fictional perfume catalog fixtures.
- `?? app/packages/application/src/modules/products/testing/geparlys-products.ts` — Geparlys catalog fixtures with real fragrance profiles, notes, pricing, and authentic PNG asset paths.

### 4.5 Content Generation (`app/packages/application/src/modules/content`)
- `M  app/packages/application/src/modules/content/application/content-generation.repository.ts` — Repository port for content versions and jobs.
- `M  app/packages/application/src/modules/content/content.module.ts` — Content module wiring.
- `?? app/packages/application/src/modules/content/application/revise-content.spec.ts` — Unit test for targeted content revision use case.
- `?? app/packages/application/src/modules/content/application/revise-content.use-case.ts` — Use case for revising existing content versions without re-generating unchanged fields.

### 4.6 Creative / Poster System (`app/packages/application/src/modules/creative`)
- `M  app/packages/application/src/modules/creative/application/approve-creative.use-case.ts` — Creative approval use case.
- `M  app/packages/application/src/modules/creative/application/creative-provider.port.ts` — Port interface for creative background generation.
- `M  app/packages/application/src/modules/creative/application/generate-creative.use-case.spec.ts` — Unit tests for creative generation pipeline.
- `M  app/packages/application/src/modules/creative/application/generate-creative.use-case.ts` — Core creative generation orchestrator.
- `M  app/packages/application/src/modules/creative/application/hero-compositor.port.ts` — Legacy HeroCompositor port (`ps-compositor-v1`).
- `M  app/packages/application/src/modules/creative/application/index.ts` — Exports for creative application ports and use cases.
- `M  app/packages/application/src/modules/creative/application/outbox-relay.repository.ts` — Outbox relay interface for creative events.
- `M  app/packages/application/src/modules/creative/application/validate-creative.use-case.spec.ts` — Validation use case test.
- `M  app/packages/application/src/modules/creative/application/validate-creative.use-case.ts` — Creative validation use case.
- `M  app/packages/application/src/modules/creative/creative.module.ts` — Creative module wiring.
- `M  app/packages/application/src/modules/creative/domain/creative-errors.ts` — Domain error definitions.
- `M  app/packages/application/src/modules/creative/domain/deterministic-visual-validator.spec.ts` — Tests for visual checks.
- `M  app/packages/application/src/modules/creative/domain/index.ts` — Domain barrel.
- `M  app/packages/application/src/modules/creative/domain/services/deterministic-visual-validator.ts` — Visual validator service.
- `M  app/packages/application/src/modules/creative/domain/services/visual-safety-scanner.ts` — Visual safety checks.
- `M  app/packages/application/src/modules/creative/domain/visual-validation.ts` — Visual validation domain types.
- `M  app/packages/application/src/modules/creative/infrastructure/fixtures/fake-product-fixtures.ts` — Synthetic PNG product fixtures.
- `M  app/packages/application/src/modules/creative/infrastructure/sharp-hero-compositor.adapter.ts` — Sharp adapter for legacy hero compositing.
- `M  app/packages/application/src/modules/creative/infrastructure/sharp-hero-compositor.spec.ts` — Hero compositor unit tests.
- `?? app/packages/application/src/modules/creative/application/export-poster.spec.ts` — Tests for poster export.
- `?? app/packages/application/src/modules/creative/application/export-poster.use-case.ts` — Poster multi-format export use case (1:1, 4:5, 9:16).
- `?? app/packages/application/src/modules/creative/application/poster-compositor.port.ts` — New 8-layer PosterCompositor port (`ps-poster-compositor-v2`).
- `?? app/packages/application/src/modules/creative/application/relayout-poster.spec.ts` — Zero-AI relayout tests.
- `?? app/packages/application/src/modules/creative/application/relayout-poster.use-case.ts` — Zero-AI deterministic relayout use case.
- `?? app/packages/application/src/modules/creative/application/revise-poster.spec.ts` — Poster revision unit tests.
- `?? app/packages/application/src/modules/creative/application/revise-poster.use-case.ts` — Targeted poster revision use case.
- `?? app/packages/application/src/modules/creative/domain/layout-intent.spec.ts` — Layout intent validation tests.
- `?? app/packages/application/src/modules/creative/domain/layout-intent.ts` — Spatial composition, lighting direction, and negative-space intent.
- `?? app/packages/application/src/modules/creative/domain/poster-spec.spec.ts` — Poster specification schema tests.
- `?? app/packages/application/src/modules/creative/domain/poster-spec.ts` — PosterSpec domain schema and validation.
- `?? app/packages/application/src/modules/creative/domain/poster-templates.ts` — Template renderer implementation for 4 templates.
- `?? app/packages/application/src/modules/creative/domain/poster-tokens.ts` — Design tokens (spacing, typography scale, safe margins).
- `?? app/packages/application/src/modules/creative/domain/product-asset-validator.spec.ts` — Product asset validator tests.
- `?? app/packages/application/src/modules/creative/domain/services/background-quality-validator.spec.ts` — Background quality tests.
- `?? app/packages/application/src/modules/creative/domain/services/background-quality-validator.ts` — Background edge density and contrast validator.
- `?? app/packages/application/src/modules/creative/domain/services/poster-copy-builder.ts` — Deterministic copy builder combining facts and content.
- `?? app/packages/application/src/modules/creative/domain/services/product-asset-validator.ts` — Product asset authenticity and transparency validator.
- `?? app/packages/application/src/modules/creative/domain/services/safe-svg-renderer.ts` — Safe XML/SVG rendering for ornaments and text.
- `?? app/packages/application/src/modules/creative/domain/services/text-layout-engine.ts` — Typography measurement, Khmer segmentation, and wrapping engine.
- `?? app/packages/application/src/modules/creative/domain/style-presets.spec.ts` — Style presets unit tests.
- `?? app/packages/application/src/modules/creative/domain/style-presets.ts` — Category-generic prompt definitions and style presets.
- `?? app/packages/application/src/modules/creative/infrastructure/fonts/font-loader.ts` — Base64 TTF font loader and CSS generator.
- `?? app/packages/application/src/modules/creative/infrastructure/sharp-poster-compositor.adapter.ts` — Sharp 8-layer poster compositor adapter.
- `?? app/packages/application/src/modules/creative/infrastructure/sharp-poster-compositor.spec.ts` — Sharp poster compositor unit tests.

### 4.7 AI Providers (`app/packages/ai-providers` and `app/packages/codex-cli`)
- `M  app/packages/ai-providers/package.json` — Package manifest for ai-providers.
- `M  app/packages/ai-providers/src/ai-providers.module.ts` — Module configuration.
- `M  app/packages/ai-providers/src/index.ts` — AI providers barrel.
- `M  app/packages/ai-providers/tsconfig.json` — TypeScript config.
- `?? app/packages/ai-providers/src/__tests__/ai-providers.module.spec.ts` — Module wiring test.
- `?? app/packages/ai-providers/src/__tests__/codex-cli-text-provider.spec.ts` — Codex CLI text provider unit tests.
- `?? app/packages/ai-providers/src/codex-cli-text-provider.ts` — AITextProvider implementation wrapping local Codex CLI.
- `?? app/packages/codex-cli/package.json` — New monorepo package for Codex CLI process management.
- `?? app/packages/codex-cli/src/__tests__/codex-cli-preflight.spec.ts` — Preflight authentication/binary checks spec.
- `?? app/packages/codex-cli/src/__tests__/codex-cli-runner.spec.ts` — Process runner tests with timeout/concurrency mocks.
- `?? app/packages/codex-cli/src/codex-cli-errors.ts` — Error taxonomy for CLI execution.
- `?? app/packages/codex-cli/src/codex-cli-preflight.ts` — Environment and auth verification for CLI.
- `?? app/packages/codex-cli/src/codex-cli-runner.ts` — Isolated runner with argument sanitization and timeout.
- `?? app/packages/codex-cli/src/codex-cli-types.ts` — Type definitions for CLI input/output.
- `?? app/packages/codex-cli/src/concurrency-limiter.ts` — Concurrency gate for CLI executions.
- `?? app/packages/codex-cli/src/index.ts` — Codex CLI barrel export.
- `?? app/packages/codex-cli/src/process-spawner.ts` — Node.js child_process wrapper.
- `?? app/packages/codex-cli/src/sanitize.ts` — Shell and argument sanitizer.
- `?? app/packages/codex-cli/tsconfig.json` — TypeScript config.

### 4.8 Creative Providers (`app/packages/creative-providers`)
- `M  app/packages/creative-providers/package.json` — Manifest for creative-providers.
- `M  app/packages/creative-providers/src/creative-providers.module.ts` — Module definition.
- `M  app/packages/creative-providers/src/factory.ts` — Provider factory.
- `M  app/packages/creative-providers/src/index.ts` — Provider barrel.
- `M  app/packages/creative-providers/src/openai/__tests__/openai-creative-provider.spec.ts` — OpenAI creative provider tests.
- `M  app/packages/creative-providers/src/openai/openai-creative-provider.ts` — OpenAI image generator adapter.
- `M  app/packages/creative-providers/tsconfig.json` — TypeScript config.
- `?? app/packages/creative-providers/src/__tests__/creative-providers.module.spec.ts` — Module resolution tests.
- `?? app/packages/creative-providers/src/codex-cli/__tests__/codex-cli-creative-provider.spec.ts` — Codex CLI image generator tests.
- `?? app/packages/creative-providers/src/codex-cli/codex-cli-creative-provider.ts` — CreativeProvider adapter using local Codex CLI.

### 4.9 Telegram (`app/packages/telegram` and `modules/telegram`)
- `M  app/packages/application/src/modules/telegram/application/telegram-channel-broadcast.port.ts` — Port for channel publishing.
- `M  app/packages/application/src/modules/telegram/application/telegram-command-center.spec.ts` — Command center spec.
- `M  app/packages/application/src/modules/telegram/application/telegram-command-center.ts` — Command center orchestrator.
- `M  app/packages/application/src/modules/telegram/application/telegram-formatters.ts` — Markdown formatting utilities.
- `M  app/packages/application/src/modules/telegram/application/telegram-visual-callback.port.ts` — Callback port for visual review actions.
- `M  app/packages/application/src/modules/telegram/application/telegram-workflow.repository.ts` — Workflow repository port.
- `M  app/packages/application/src/modules/telegram/domain/telegram.ts` — Telegram domain types.
- `M  app/packages/telegram/src/__tests__/channel-broadcast.spec.ts` — Broadcast adapter tests.
- `M  app/packages/telegram/src/__tests__/visual-review-workflow.spec.ts` — Visual review workflow tests.
- `M  app/packages/telegram/src/channel-broadcast/telegram-channel-broadcast.adapter.ts` — Outbox dispatcher broadcasting approved creatives.
- `M  app/packages/telegram/src/grammy-bot.adapter.ts` — Bot setup and command listener.
- `M  app/packages/telegram/src/grammy-telegram.gateway.ts` — Grammy messaging gateway.
- `M  app/packages/telegram/src/handlers/visual-review-callback.handler.ts` — Visual review callback handler.
- `M  app/packages/telegram/src/keyboards/visual-review.keyboard.ts` — Inline keyboards for visual review actions.
- `M  app/packages/telegram/src/renderers/visual-review-card.renderer.ts` — Renders review card with product/visual details.
- `M  app/packages/telegram/src/telegram-delivery.gateway.ts` — Delivery gateway interface.
- `M  app/packages/telegram/src/telegram-outbox.dispatcher.ts` — Telegram outbox worker dispatcher.

### 4.10 Database and Migrations (`app/packages/database`)
- `M  app/packages/database/src/content/prisma-content-generation.repository.ts` — Prisma implementation of content generation repository.
- `M  app/packages/database/src/database.module.ts` — Database module wiring.
- `M  app/packages/database/src/outbox/prisma-transaction.manager.ts` — Outbox transaction manager.
- `M  app/packages/database/src/prisma.service.ts` — Prisma client lifecycle management.
- `M  app/packages/database/src/telegram/prisma-telegram-workflow.repository.ts` — Prisma workflow repository.
- `M  app/packages/database/test/integration/acceptance-golden-path.integration-spec.ts` — Golden path E2E integration test.
- `M  app/packages/database/test/integration/golden-path-creative.integration-spec.ts` — Creative golden path integration test.
- `M  app/packages/database/test/integration/telegram-workflow.integration-spec.ts` — Telegram workflow integration test.

### 4.11 Jobs and Queues (`app/packages/jobs`)
- `M  app/packages/jobs/package.json` — Jobs package manifest.
- `M  app/packages/jobs/src/__tests__/creative-generation.worker.spec.ts` — Creative worker unit tests.
- `M  app/packages/jobs/src/__tests__/outbox-relay.worker.spec.ts` — Outbox relay worker tests.
- `M  app/packages/jobs/src/__tests__/prometheus-metrics.service.spec.ts` — Metrics service tests.
- `M  app/packages/jobs/src/creative-generation-worker.module.ts` — Worker module definition.
- `M  app/packages/jobs/src/creative-generation.queue.ts` — Queue definitions.
- `M  app/packages/jobs/src/creative-generation.worker.ts` — BullMQ worker executing creative pipeline.
- `M  app/packages/jobs/src/index.ts` — Jobs barrel export.
- `M  app/packages/jobs/src/metrics/ai-metrics.tracker.ts` — Tracker for AI latency, cost, and tokens.
- `M  app/packages/jobs/src/metrics/prometheus-metrics.service.ts` — Prometheus metric exporter.
- `M  app/packages/jobs/src/outbox-relay.worker.ts` — Outbox relay worker implementation.
- `M  app/packages/jobs/src/queue-names.ts` — Queue name constants.

### 4.12 Configuration (`app/packages/config` and repo root)
- `M  .gitignore` — Root ignore file.
- `M  app/.env.example` — Documented environment template with safe non-secret placeholders.
- `M  app/package.json` — Monorepo root package.json.
- `M  app/packages/config/src/app-config.service.ts` — Config service reading typed variables.
- `M  app/packages/config/src/environment.schema.ts` — Zod schema validating runtime environment.
- `M  app/packages/config/test/config.spec.ts` — Configuration validation tests.
- `M  app/pnpm-lock.yaml` — Pinned dependency lockfile.
- `M  app/tsconfig.json` — Root TypeScript build configuration.

### 4.13 Tests
- Included in their respective module listings above. Unit tests run via `pnpm test:unit` (59 suites, 486 tests).

### 4.14 Scripts (`app/scripts`)
- `M  app/scripts/seed-demo-data.mjs` — Demo data seeder script.
- `?? app/scripts/codex-live-test.mjs` — Live test harness executing local Codex CLI end-to-end.
- `?? app/scripts/generate-background-gallery.mjs` — Script generating gallery of backgrounds across style presets.
- `?? app/scripts/generate-golden-posters.mjs` — Generates 4 golden poster samples and manifests into `.data/fixtures/poster-samples/`.
- `?? app/scripts/generate-haussmann-poster.mjs` — Generates Atelier Haussmann perfume poster.
- `?? app/scripts/generate-nocturne-poster.mjs` — Generates Nocturne Royale perfume poster.
- `?? app/scripts/generate-scent-pyramid-poster.mjs` — Generates Scent Pyramid poster.

### 4.15 Assets and Fonts (`app/assets/fonts`)
- `?? app/assets/fonts/montserrat/Montserrat-Variable.ttf` — Latin body variable font.
- `?? app/assets/fonts/montserrat/OFL.txt` — Open Font License for Montserrat.
- `?? app/assets/fonts/noto-sans-khmer/NotoSansKhmer-Bold.ttf` — Khmer bold font.
- `?? app/assets/fonts/noto-sans-khmer/NotoSansKhmer-Regular.ttf` — Khmer regular font.
- `?? app/assets/fonts/noto-sans-khmer/OFL.txt` — Open Font License for Noto Sans Khmer.
- `?? app/assets/fonts/playfair-display/OFL.txt` — Open Font License for Playfair Display.
- `?? app/assets/fonts/playfair-display/PlayfairDisplay-Variable.ttf` — Latin luxury display variable font.

### 4.16 Documentation (`docs/`)
- `M  app/README.md` — Updated application developer guide.
- `M  docs/delivery-plan.md` — Historical delivery plan (marked historical).
- `?? docs/implementation-plan-v1.md` — Authoritative 16-stage AI implementation plan.
- `?? docs/master-engineering-blueprint-v3.md` — Authoritative unified master engineering blueprint v3.0.
- `?? docs/assets/master-engineering-blueprint/centered-hero-compositor-sample.png` — Centered hero layout visual sample.
- `?? docs/assets/master-engineering-blueprint/khmer-seasonal-compositor-sample.png` — Khmer seasonal layout visual sample.
- `?? docs/assets/master-engineering-blueprint/luxury-background-prototype.png` — Luxury marble background visual prototype.
- `?? docs/assets/master-engineering-blueprint/pchum-ben-background-prototype.png` — Pchum Ben cultural background visual prototype.

---

## 5. Active poster-development component map

| Component | Files Involved | Status Classification | Description & Invariants |
| :--- | :--- | :--- | :--- |
| **Existing Hero Compositor** | `application/.../hero-compositor.port.ts`<br/>`infrastructure/sharp-hero-compositor.adapter.ts`<br/>`infrastructure/sharp-hero-compositor.spec.ts` | Modified implementation | Compositor v1 (`ps-compositor-v1`). Sharp-based 2-3 layer compositing: canonical product, background, and contact shadow. Does not render typography or decorative frames. |
| **New Poster Compositor** | `application/.../poster-compositor.port.ts`<br/>`infrastructure/sharp-poster-compositor.adapter.ts`<br/>`infrastructure/sharp-poster-compositor.spec.ts` | New untracked implementation | Compositor v2 (`ps-poster-compositor-v2`). Deterministic 8-layer compositor: background, contrast overlay, decorative graphics, contact shadow, hero product, logo, typography SVG, and legal text. |
| **Poster Specification** | `domain/poster-spec.ts`<br/>`domain/poster-spec.spec.ts` | New untracked implementation | Zod schema validating `PosterSpec`: templateId, outputFormat (1:1, 4:5, 9:16), language, headline, price, CTA, product/text placement, palette, decorativeSelection, backgroundArtDirection. Limits major text groups to 5. |
| **Layout Intent** | `domain/layout-intent.ts`<br/>`domain/layout-intent.spec.ts` | New untracked implementation | Derives spatial bounding boxes (productZone, textZone, pedestalZone, reservedNegativeSpace, lightingDirection) for template-guided AI background generation. |
| **Templates** | `domain/poster-templates.ts` | New untracked implementation | Computes SVG overlays, product bounds, and `PosterLayoutManifest` for 4 template families: `EDITORIAL_SPLIT`, `CENTERED_HERO`, `SCENT_STORY`, `KHMER_SEASONAL`. |
| **Design Tokens** | `domain/poster-tokens.ts`<br/>`domain/style-presets.ts`<br/>`domain/style-presets.spec.ts` | New untracked implementation | Spacing scale (8 to 64px), safe margins (6% horiz, 7% vert), typography scale (displayLarge to label), and 4 category-generic style presets (Parisian Morning, Nocturne Obsidian, Scent Story, Cambodian Ivory). |
| **Typography / Text-Layout Engine** | `domain/services/text-layout-engine.ts`<br/>`domain/services/safe-svg-renderer.ts`<br/>`domain/services/poster-copy-builder.ts` | New untracked implementation | `Intl.Segmenter` for Khmer word breaks, width estimation, auto font downscaling, line wrapping, and XML escaping. Throws `PosterLayoutOverflowError` on overflow. |
| **Khmer & Latin Fonts** | `infrastructure/fonts/font-loader.ts`<br/>`app/assets/fonts/*` | New untracked implementation | Base64 font loader injecting Noto Sans Khmer (400, 700), Playfair Display (100-900), and Montserrat (100-900) into SVG `@font-face` blocks for deterministic Sharp rendering. |
| **Product-Asset Validator** | `domain/services/product-asset-validator.ts`<br/>`domain/product-asset-validator.spec.ts` | New untracked implementation | Enforces authentic PNG/WebP product images: requires alpha channel, verifies visible ratio (5%-98%), trims bounds, rejects known synthetic placeholders (`KNOWN_PLACEHOLDER_HASHES`). |
| **Background-Quality Validator** | `domain/services/background-quality-validator.ts`<br/>`domain/services/background-quality-validator.spec.ts` | New untracked implementation | Analyzes raw greyscale pixels for edge density in negative space, pedestal baseline gradient step, and text zone luminance contrast. |
| **Creative Generation Use Case** | `application/generate-creative.use-case.ts`<br/>`application/generate-creative.use-case.spec.ts` | Modified implementation | Orchestrates product retrieval, asset validation, background generation with LayoutIntent, quality checks, and compositing. Currently calls `HeroCompositor`. |
| **Poster Revision Use Case** | `application/revise-poster.use-case.ts`<br/>`application/revise-poster.spec.ts`<br/>`content/.../revise-content.use-case.ts` | New untracked implementation | Supports targeted revisions (`editText`, `editLayout`, `changeStyle`, `newBackground`, `replaceProductAsset`) without regenerating unaffected layers. |
| **Poster Relayout Use Case** | `application/relayout-poster.use-case.ts`<br/>`application/relayout-poster.spec.ts` | New untracked implementation | Executes zero-AI deterministic re-layouts across templates and typography variants. |
| **Poster Export Use Case** | `application/export-poster.use-case.ts`<br/>`application/export-poster.spec.ts` | New untracked implementation | Re-layouts approved scenes to 1:1, 4:5, and 9:16 export formats and encodes to PNG/JPEG with fresh validation. |
| **Codex CLI Integration** | `packages/codex-cli/*`<br/>`ai-providers/.../codex-cli-text-provider.ts`<br/>`creative-providers/.../codex-cli-creative-provider.ts` | New untracked implementation | Monorepo package and adapters enabling local offline text and image generation via Codex CLI child process. Strictly blocked in production (`NODE_ENV === 'production'`). |
| **Creative Provider Adapters** | `creative-providers/.../openai-creative-provider.ts`<br/>`creative-providers/.../factory.ts` | Modified implementation | Adapters for OpenAI DALL-E image generation with size/format validation. |
| **Telegram Visual-Review Workflow** | `telegram/src/handlers/visual-review-callback.handler.ts`<br/>`telegram/src/keyboards/visual-review.keyboard.ts`<br/>`telegram/.../telegram-channel-broadcast.adapter.ts` | Modified implementation | Review card rendering, callback handling, and outbox broadcasting. |
| **Poster Generation Scripts** | `app/scripts/generate-*.mjs`<br/>`app/scripts/codex-live-test.mjs` | Prototype or experimental script | Standalone evaluation scripts for generating test posters, backgrounds, and golden samples. |
| **Poster Fixtures & Prototypes** | `modules/products/testing/geparlys-products.ts`<br/>`app/.data/fixtures/poster-samples/*`<br/>`docs/assets/master-engineering-blueprint/*` | Mixed (Untracked code, runtime data, documentation) | Real Geparlys catalog fixtures, generated golden PNG samples with manifests, and blueprint documentation image references. |

---

## 6. Overlaps and possible conflicts

The following potential contradictions and architectural overlaps were identified:

### 6.1 Old Hero Compositor vs. New Poster Compositor
- **Files:** `app/packages/application/src/modules/creative/application/hero-compositor.port.ts` vs. `app/packages/application/src/modules/creative/application/poster-compositor.port.ts`
- **Evidence:** `GenerateCreativeUseCase` line 88 injects `HERO_COMPOSITOR` (`ps-compositor-v1`) as required and `POSTER_COMPOSITOR` (`ps-poster-compositor-v2`) as optional. At line 365, it calls `this.compositor.composite()`, generating only a 2-3 layer product+background image without typography. Meanwhile, `RevisePosterUseCase`, `RelayoutPosterUseCase`, and `ExportPosterUseCase` exclusively use `PosterCompositor`.
- **Impact:** System currently maintains two parallel compositing pipelines. Work package **W23 — Complete the deterministic hybrid compositor** must reconcile these without discarding user work.

### 6.2 Old Creative Schema vs. New Poster Specification
- **Files:** `app/packages/application/src/modules/creative/application/hero-compositor.port.ts` (`CompositeVisualInput`) vs. `app/packages/application/src/modules/creative/domain/poster-spec.ts` (`PosterSpec`)
- **Evidence:** `CompositeVisualInput` accepts simple fields (`heroPlacement`, `pedestalYPercent`), whereas `PosterSpec` enforces strict structured definitions (`templateId`, `PosterPalette`, `PosterDecorativeSelection`, `PosterBackgroundArtDirection`, text limits).
- **Impact:** Persisted `VisualAssetRecord` entities store generic metadata and do not yet reflect the full `CreativeScene` schema required by Blueprint Section 9. Handled in **W20**.

### 6.3 Approval vs. Automatic Channel Broadcasting
- **Files:** `app/packages/telegram/src/channel-broadcast/telegram-channel-broadcast.adapter.ts` lines 68-103
- **Evidence:** The adapter listens for `CREATIVE_APPROVED` events from the transactional outbox and, if `FeatureFlag.TELEGRAM_CHANNEL_PUBLISHING` is enabled, immediately posts the approved card and photo to the Telegram channel.
- **Violation:** Invariant 1 and 9 of `master-engineering-blueprint-v3.md` and Rule 78 of `development-rules.md`: `APPROVED` is terminal in the MVP. Approval must never trigger external broadcast without an independent, authorized `PublishIntent`. Handled in **W02**.

### 6.4 Placeholder Rejection vs. Legacy Test Fixtures
- **Files:** `app/packages/application/src/modules/creative/domain/services/product-asset-validator.ts` lines 15-20 vs. `app/packages/application/src/modules/creative/infrastructure/fixtures/fake-product-fixtures.ts`
- **Evidence:** `ProductAssetValidator` hardcodes `KNOWN_PLACEHOLDER_HASHES` (`119f6d45...`, `1f811e16...`) to strictly reject synthetic solid rectangular blocks generated by legacy test helpers.
- **Impact:** Any test or workflow invoking `ProductAssetValidator` with legacy synthetic fixtures will fail with `KnownPlaceholderRejectedError`. New tests correctly use `geparlys-products.ts` and authentic cutout PNGs in `.data/assets/products/`.

### 6.5 Multiple Provider Implementations for the Same Capability
- **Files:** `packages/ai-providers/src/codex-cli-text-provider.ts` vs. `OpenAITextProvider`; `packages/creative-providers/src/codex-cli/codex-cli-creative-provider.ts` vs. `OpenAICreativeProvider`
- **Evidence:** Both provider packages contain parallel implementations for OpenAI cloud APIs and local Codex CLI subprocesses. `CodexCliCreativeProvider` guards against production execution via `process.env.NODE_ENV === 'production'`.
- **Impact:** Configuration and factory resolution in `factory.ts` must maintain strict environment boundaries so production never attempts local CLI execution and development does not fail when external API keys are absent.

### 6.6 Four Implemented Templates vs. Five Blueprint Families
- **Files:** `app/packages/application/src/modules/creative/domain/poster-spec.ts` line 5 vs. `docs/master-engineering-blueprint-v3.md` Section 8
- **Evidence:** `poster-spec.ts` defines 4 templates: `EDITORIAL_SPLIT`, `CENTERED_HERO`, `SCENT_STORY`, `KHMER_SEASONAL`. Blueprint Section 8 mandates 5 templates: the fifth being "Promotion, price, and CTA composition".
- **Impact:** The fifth template family is currently missing from domain types and must be implemented during **W22**.

### 6.7 Mutable Poster Revisions vs. Immutable Creative Versions
- **Files:** `app/packages/application/src/modules/creative/application/revise-poster.use-case.ts`
- **Evidence:** `RevisePosterUseCase` creates a new visual asset record linked by parent ID, but database schema does not yet represent full immutable `CreativeSceneVersion` and `SceneLayer` entities. Handled in **W20/W31**.

---

## 7. Change ownership and safety map

| System Area | Important Files | Current Status | Likely Purpose | Risk of Modification | Recommended Owner / Work Package | Safe to touch during W01? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **API Entrypoint** | `app/apps/api/src/app.module.ts`, `package.json` | Tracked Modified | Runtime entrypoint wiring | Medium | W01 / Infrastructure | **Requires Review** (only if typecheck/build requires) |
| **Worker Entrypoint** | `app/apps/worker/src/worker-health.service.ts` | Tracked Modified | Worker process health & metrics | Medium | W51 (Observability) | **No** |
| **Formatting Fix Targets** | `revise-content.spec.ts`<br/>`export-poster.spec.ts`<br/>`revise-poster.spec.ts`<br/>`visual-review-callback.handler.ts` | Untracked & Tracked Modified | Active poster & callback tests/handlers | Low | **W01** | **Yes** (Safe to format with Prettier) |
| **Typography & Fonts** | `text-layout-engine.ts`, `font-loader.ts`, `app/assets/fonts/*` | Untracked | Deterministic bilingual text engine | High | W21 (Typography) | **No** (Do not touch) |
| **Poster Specs & Templates** | `poster-spec.ts`, `poster-templates.ts`, `poster-tokens.ts`, `layout-intent.ts` | Untracked | 8-layer layout and template rules | High | W03 / W20 / W22 | **No** (Do not touch) |
| **Validators** | `product-asset-validator.ts`, `background-quality-validator.ts` | Untracked | Asset authenticity & background QC | High | W12 / W24 | **No** (Do not touch) |
| **Compositors** | `sharp-poster-compositor.adapter.ts`, `sharp-hero-compositor.adapter.ts` | Untracked & Tracked Modified | Deterministic Sharp rendering | High | W23 (Compositor) | **No** (Do not touch) |
| **Codex CLI System** | `packages/codex-cli/*`, `*-provider.ts` | Untracked | Local offline dev generation | Medium | W50 (Provider Policy) | **No** (Do not touch) |
| **Telegram Review** | `visual-review-callback.handler.ts`, `visual-review.keyboard.ts`, `card.renderer.ts` | Tracked Modified | Visual review UX in Telegram | High | W02 / W30 | **Requires Review** (Only format handler) |
| **Publishing / Broadcast** | `telegram-channel-broadcast.adapter.ts` | Tracked Modified | Auto channel broadcast logic | Critical | W02 (Safety Gaps) | **No** (Do not touch in W01) |
| **Product Fixtures** | `geparlys-products.ts`, `.data/assets/products/*` | Untracked | Authentic perfume product test data | Low | W10 / W12 | **No** (Do not touch) |
| **Generator Scripts** | `app/scripts/generate-*.mjs`, `codex-live-test.mjs` | Untracked | Prototype generation & verification | Low | Developer prototypes | **No** (Do not touch) |
| **Documentation** | `master-engineering-blueprint-v3.md`, `implementation-plan-v1.md` | Untracked | Authoritative product direction | High | Architecture / User | **No** (Do not modify) |

---

## 8. Quality-gate commands and observed evidence

All 8 quality gates declared in `app/package.json` and `docs/implementation-plan-v1.md` were executed from directory `/Users/macbookpro/Desktop/Development/parisian-shopper-ai/app`:

| Gate Command | Exit Code | Duration | Status | Observed Findings / Failing Targets | Poster Work Relevance |
| :--- | :---: | :---: | :---: | :--- | :--- |
| `pnpm format:check` | **1** | ~3.8s | **FAILING** | Code style issues in 4 files:<br/>1. `packages/application/src/modules/content/application/revise-content.spec.ts`<br/>2. `packages/application/src/modules/creative/application/export-poster.spec.ts`<br/>3. `packages/application/src/modules/creative/application/revise-poster.spec.ts`<br/>4. `packages/telegram/src/handlers/visual-review-callback.handler.ts` | **Directly related** to newly authored poster use cases, specs, and Telegram callbacks. |
| `pnpm typecheck` | **0** | ~1.2s | **PASSING** | Full composite project typecheck passed clean (`tsc -b --pretty false`). | None. |
| `pnpm test:unit` | **0** | 16.58s | **PASSING** | **59 passed, 59 total suites; 486 passed, 486 total tests.** All new poster tests passed clean (including `sharp-poster-compositor.spec.ts`, `relayout-poster.spec.ts`, `background-quality-validator.spec.ts`, `product-asset-validator.spec.ts`, `codex-cli-runner.spec.ts`, `export-poster.spec.ts`, etc.). | Verified all active poster unit test suites pass. |
| `pnpm boundaries` | **0** | ~1.1s | **PASSING** | "Module boundaries valid." Architecture scanner verified package import boundaries and dependency graph. | None. |
| `pnpm lint` | **0** | ~20.0s | **PASSING** | ESLint verified all files with `--max-warnings 0` followed by boundary check. Zero warnings or errors. | None. |
| `pnpm build` | **0** | ~6.2s | **PASSING** | Force build (`tsc -b --force`) compiled all apps and packages into `dist/` without errors. | None. |
| `pnpm security:check` | **0** | ~1.8s | **PASSING** | "PASS — 0 unreviewed findings, 3 reviewed temporary exceptions (GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w)". | None. |
| `pnpm check:licenses` | **0** | ~1.1s | **PASSING** | "Dependency license policy passed for 12 license groups." All pinned dependencies conform to permissive allowlist. | None. |

### Diagnostic Summary
The engineering baseline is **NOT green** because `pnpm format:check` failed on 4 files. However, all domain logic, types, unit tests, boundaries, lints, and builds are fully functional.

---

## 9. Dependencies and unresolved decisions

### 9.1 Existing changes W01 must preserve
- The entire `app/packages/codex-cli` monorepo package.
- All new poster use cases: `revise-poster.use-case.ts`, `relayout-poster.use-case.ts`, `export-poster.use-case.ts`, `revise-content.use-case.ts`.
- All new domain specifications and services: `poster-spec.ts`, `layout-intent.ts`, `poster-templates.ts`, `poster-tokens.ts`, `text-layout-engine.ts`, `safe-svg-renderer.ts`, `poster-copy-builder.ts`, `product-asset-validator.ts`, `background-quality-validator.ts`, `style-presets.ts`.
- Embedded TTF font files and loader in `app/assets/fonts/` and `font-loader.ts`.
- Authentic product cutout PNGs in `app/.data/assets/products/`.
- Generated golden poster sample assets in `app/.data/fixtures/poster-samples/`.
- Prototype generation scripts in `app/scripts/`.

### 9.2 Missing business and architectural decisions (from Blueprint Section 29)
1. **Authoritative Product API Contract:** Production endpoint specification, auth mechanism, and live catalog credentials have not been supplied (W10 blocked until confirmed).
2. **Font & Brand Licensing:** Commercial server-side distribution and rendering rights for Noto Sans Khmer, Playfair Display, and Montserrat must be explicitly approved (W21).
3. **Approval & Publishing Policy:** Confirmation that auto-broadcast on `CREATIVE_APPROVED` must be permanently disconnected and replaced by an explicit `PublishIntent` (W02).
4. **Disaster Recovery Objectives:** Business sign-off on 24h RPO and 4h RTO (W52).
5. **Brand Intelligence Ownership:** Selection of initial brand rules, tone guides, and authorized historical Facebook corpus (W40/W41).

---

## 10. Recommended scope for W01

Work package **W01 — Restore the green engineering baseline** should be strictly bounded to:
1. **Formatting Remediation:**
   Apply Prettier formatting exclusively to the 4 files flagged by `pnpm format:check`:
   - `app/packages/application/src/modules/content/application/revise-content.spec.ts`
   - `app/packages/application/src/modules/creative/application/export-poster.spec.ts`
   - `app/packages/application/src/modules/creative/application/revise-poster.spec.ts`
   - `app/packages/telegram/src/handlers/visual-review-callback.handler.ts`
2. **Verification of Quality Gates:**
   Re-run all 8 commands to verify that 100% of quality gates pass green:
   ```bash
   pnpm format:check
   pnpm typecheck
   pnpm test:unit
   pnpm boundaries
   pnpm lint
   pnpm build
   pnpm security:check
   pnpm check:licenses
   ```
3. **Integration Test Environment Assessment:**
   Evaluate Docker/Testcontainers prerequisites for PostgreSQL integration tests without modifying database migrations or schemas.
4. **Prohibitions for W01:**
   - Do NOT mass-format files outside the 4 identified targets.
   - Do NOT delete, rename, or reorganize any existing tracked or untracked poster file.
   - Do NOT modify domain logic or disable assertions to make checks pass.
   - Do NOT implement feature work from W02 through W80.

---

## 11. Files W01 must not modify without review

The following files represent high-risk active work and must **NOT** be modified during W01:
- `app/packages/application/src/modules/creative/domain/poster-spec.ts`
- `app/packages/application/src/modules/creative/domain/poster-templates.ts`
- `app/packages/application/src/modules/creative/domain/poster-tokens.ts`
- `app/packages/application/src/modules/creative/domain/layout-intent.ts`
- `app/packages/application/src/modules/creative/domain/services/text-layout-engine.ts`
- `app/packages/application/src/modules/creative/domain/services/safe-svg-renderer.ts`
- `app/packages/application/src/modules/creative/domain/services/product-asset-validator.ts`
- `app/packages/application/src/modules/creative/domain/services/background-quality-validator.ts`
- `app/packages/application/src/modules/creative/infrastructure/sharp-poster-compositor.adapter.ts`
- `app/packages/application/src/modules/creative/infrastructure/sharp-hero-compositor.adapter.ts`
- `app/packages/application/src/modules/creative/infrastructure/fonts/font-loader.ts`
- `app/packages/telegram/src/channel-broadcast/telegram-channel-broadcast.adapter.ts`
- `app/packages/codex-cli/**/*`
- `app/scripts/**/*`
- `docs/master-engineering-blueprint-v3.md`
- `docs/implementation-plan-v1.md`

---

## 12. W00 acceptance-criteria evidence

| Acceptance Criterion | Verification Evidence |
| :--- | :--- |
| **1. Branch and HEAD recorded** | Branch: `feat/sharp-hero-compositor`, HEAD: `be92bce6be0afe49ade297a20b967317389446a3` (Section 2). |
| **2. Full working-tree inventory accounted for** | Accounted for 91 tracked modified files, 65 untracked files, 0 staged files, 0 deleted files, 0 renamed files, and relevant ignored `.data/` assets (Sections 3 & 4). |
| **3. Active poster work mapped by component and status** | 19 distinct poster components mapped and classified across 7 lifecycle categories (Section 5). |
| **4. Potential overlapping implementations identified without changes** | 7 material architectural overlaps documented with exact file and line references (Section 6). |
| **5. Conservative file-safety map included** | Table categorizing risk, owner, and W01 safety classification created (Section 7). |
| **6. Clear, limited recommended scope for W01** | Bounded scope focusing exclusively on formatting the 4 identified files and verifying quality gates (Section 10). |
| **7. No existing user file modified** | Verified via Git diff comparison: zero existing tracked or untracked files were edited. |
| **8. No destructive operations executed** | No `reset`, `checkout`, `clean`, `stash`, `rm`, `add`, or `commit` commands were run. |
| **9. Only created file is report** | Exactly one file created: `docs/implementation-evidence/W00-current-worktree-inventory.md`. |
| **10. Final Git status compared with initial** | Final Git status confirms only the new report was added to the untracked set (Section 13). |

---

## 13. Commands executed

All commands were executed in read-only diagnostic mode:

1. `git status` — Checked working tree status and branch name.
2. `git status --porcelain=v1 -uall` — Inspected full non-truncated status list.
3. `git status --porcelain=v1 -uall | wc -l` — Verified total file count (156).
4. `git diff --staged --name-only` — Verified 0 staged changes.
5. `git branch -a && git rev-parse HEAD && git log -1 --pretty=fuller && git remote -v && git stash list` — Recorded branch, commit metadata, remotes, and stashes.
6. `cat app/package.json` — Read declared package manager, Node version, scripts, and dependencies.
7. `cat app/.nvmrc` — Verified Node engine pin (`22.22.2`).
8. `cat .gitignore` — Read repository ignore rules.
9. `find app/.data -maxdepth 3` — Inventoried ignored runtime poster assets, fixtures, and prototypes.
10. `find app/assets -type f` — Inventoried font assets and licenses.
11. `find docs/assets -type f` — Inventoried blueprint reference images.
12. `git diff --name-status` — Categorized all 91 modified tracked files.
13. `git ls-files --others --exclude-standard` — Categorized all 65 untracked files.
14. `git status --ignored -s` — Verified ignored files and build outputs.
15. Quality gate commands in `app/`:
    - `pnpm format:check` — Exit code 1 (3.8s, failed on 4 files).
    - `pnpm prettier --check .` — Isolated exact failing filenames.
    - `pnpm typecheck` — Exit code 0 (1.2s, passed).
    - `pnpm test:unit` — Exit code 0 (16.58s, 59 suites / 486 tests passed).
    - `pnpm boundaries` — Exit code 0 (1.1s, passed).
    - `pnpm lint` — Exit code 0 (20.0s, passed).
    - `pnpm build` — Exit code 0 (6.2s, passed).
    - `pnpm security:check` — Exit code 0 (1.8s, passed).
    - `pnpm check:licenses` — Exit code 0 (1.1s, passed).
16. `docker info` — Verified local container daemon availability for future integration testing.

---

## 14. Limitations and unknowns

1. **Docker Integration Tests Not Run:** Docker daemon was confirmed running, but `test:integration` (PostgreSQL testcontainers) was intentionally omitted during W00 to avoid long-running database container initialization; unit tests (`test:unit`) ran completely and passed.
2. **Production Product API Unavailable:** The real upstream Product API schema and credentials remain unverified; current tests use fictional fixtures or Geparlys prototypes.
3. **Font Server Rendering Clearance:** While fonts are licensed under OFL, commercial server-side rendering clearance must be formally reviewed by company legal.
4. **Telegram Bot Token Execution:** Live Telegram end-to-end tests require live bot credentials; all Telegram validation in W00 was conducted via unit tests and mock gateways.
