# Open-source foundation analysis

**Project:** Parisian Shopper AI Telegram Content System  
**Research snapshot:** 2026-10-03 (Asia/Phnom_Penh)  
**Technical recommendation at research stage:** **Postiz**, subject to an explicit management/licensing decision. This is not a finalized foundation selection; see [`licensing-decision.md`](licensing-decision.md) and ADR-001. Treat every other repository as a reference only.

> This is an engineering assessment, not legal advice. Counsel should confirm the AGPL deployment plan and any future code reuse before production release.

## Scope and method

The six upstream repositories were cloned into `research/` and inspected in place. They were not edited. The review covered repository structure, current commit, license artifacts, manifests and lockfiles, framework and database choices, Telegram and AI flows, approval and scheduling behavior, social integrations, background execution, Docker configuration, environment-variable surfaces, API design, security posture, and visible maintenance history.

| Repository | Local path | Inspected commit |
|---|---|---|
| [Postiz](https://github.com/gitroomhq/postiz-app) | `research/postiz` | `ce9cb27a6aa8c400b6d6ff4f79a066ee408592df` |
| [Ngocphamnek/agent](https://github.com/Ngocphamnek/agent) | `research/agent` | `33fb3d6383b21cfb5bbaf0f6803a2dee15ca9ca8` |
| [NicheBot](https://github.com/eminemrre/nichebot) | `research/nichebot` | `697aacc4d055403ab0bde226d7c6ea4671f9e3c7` |
| [ai-social-media-bot](https://github.com/ketansharma1411/ai-social-media-bot) | `research/ai-social-media-bot` | `3dd755cf221845ccb6b24190d1b619af0ec4295f` |
| [Muse](https://github.com/amitayks/Muse) | `research/muse` | `cc4b44231a80a66cecdf9d91daa0f0a71c1d764b` |
| [MAX2](https://github.com/samerai2020/MAX2-AI-Content-Automation) | `research/max2` | `332c5fe3a9cd28f9020bc90cefa59070a49ea36e` |

Commit activity is only a maintenance signal, not a quality guarantee. Counts below come from the cloned Git history at the snapshot date.

## Comparison table

| Repository | License | Main stack | Useful components | Components we should NOT copy | Architecture lessons | Possible integration ideas | License compatibility risk | Security concerns | Maintenance/activity concerns |
|---|---|---|---|---|---|---|---|---|---|
| **Postiz** | **AGPL-3.0** in root `LICENSE` and package metadata | Node 22; pnpm 10 workspaces; TypeScript; Next.js 16/React 19; NestJS 11; Prisma 6/PostgreSQL; Redis; Temporal; Docker Compose; S3/R2 or local media | Mature account/organization model, team roles and comments; draft/calendar UI; media library; official Facebook/Instagram and many other providers; OAuth/token-refresh patterns; public API/webhooks; Temporal workflows with retry/heartbeat; Docker deployment | Do not treat its Telegram publishing provider as a staff-facing bot; do not reuse order-marketplace approval fields as content approval; do not enable autopost, billing, marketplace, or unrelated integrations for the MVP; do not copy default Compose secrets into production | Use a durable workflow engine for generation and later publishing; keep providers behind adapters; preserve Postgres as the transactional source for content state; maintain idempotent external calls | Add a Parisian Shopper bounded context and Telegram inbound adapter; create approved content in the Postiz domain only after review; later use its official Meta providers, calendar, analytics, media, and Temporal orchestration | **High and explicit.** Modifying and serving Postiz over a network invokes AGPL source-offer obligations for the modified covered work. A private proprietary fork is not a safe assumption. Obtain legal review or a commercial license if corresponding-source disclosure is unacceptable | Large dependency and secret surface; OAuth/social tokens; media URL and webhook SSRF risks; public API/API-key management; registration must be disabled; self-hosted operators own backups and patching; Compose includes example credentials and several stateful services; pin images and harden networks | Strongest project: 3,192 commits, 1,269 in the last 365 days, 518 in the last 90 days, multiple maintainers, current releases through `v2.25.0`. Rapid upstream change increases upgrade/merge work |
| **Ngocphamnek/agent** | **No usable license grant found.** README says MIT and links `LICENSE`, but the checked-out repository has no `LICENSE` file. Default copyright restrictions therefore apply unless clarified with the owner | Python 3.11; FastAPI; SQLAlchemy with SQLite default/PostgreSQL option; Celery + Redis + Celery Beat; React/Vite/MUI dashboard; FFmpeg; Playwright; Docker Compose; pip/`requirements.txt` plus npm | Sequential pipeline with checkpoints; pause-before-publisher concept; Telegram inline approve/reject; Celery task split; schedule API and setup wizard; video pipeline decomposition | No code until a real license grant exists; never copy Playwright-based “login once” social publishing; do not copy approve-immediately-publishes behavior, weak callback authorization, filesystem JSON checkpoints, or exception text sent to Telegram | A generation pipeline should checkpoint expensive stages, but approval must be a persisted domain transition, not an in-memory pause; publishing needs a separate policy gate | Reimplement the checkpoint/resume concept on Temporal; use its simple preview/button flow as UX research only | **Critical/unknown.** A README badge is not a substitute for license text. Also shown as a fork, so provenance needs checking | Callback handler does not visibly restrict approver user/chat; predictable callback prefixes carry raw job IDs; approval immediately enqueues publishing; browser automation can violate platform terms and exposes sessions; raw error text can leak details; default SQLite and local job artifacts are fragile | Very small history: 7 commits, one contributor, no tags; 0 commits in the last 90 days at snapshot. Treat as a prototype |
| **NicheBot** | MIT (`LICENSE` present) | Node 18+ CommonJS; npm lockfile; `node-telegram-bot-api`; OpenAI-compatible LLM access; `better-sqlite3`; `node-cron`; `twitter-api-v2`; Docker | Telegram-first command UX; allowed-user check; rate limiting; input/Markdown sanitization; quality scoring and prompt-version metadata; operational health/metrics; backups and release checks; tests including mocked end-to-end flows | Do not copy its global `pendingPost` state, single-user assumptions, SQLite schema, in-process cron, or scheduled auto-publish path; its overwrite/status model is not revision or approval history | Telegram needs explicit authorization, safe rendering, rate limits, and recoverable conversation state; quality gates are useful but cannot certify product facts | Reimplement command ergonomics, safe-send fallback, allowlisted staff access, quality metadata, health checks, and backup discipline | **Low** for MIT-licensed code, with normal notice/attribution obligations. Prefer reimplementation because its design is too small for the target | Global mutable pending state can cross conversations; user ID alone is insufficient for richer roles; scheduler can publish without human approval; generated text is not checked against authoritative facts; long polling and local SQLite limit HA | 22 authored commits plus Dependabot history, three tags through `v1.3.0`; 0 commits in the last 90 days. Better engineering hygiene than its size suggests, but still a small/single-maintainer project |
| **ai-social-media-bot** | **No usable license grant found.** README states “MIT License © 2025,” but there is no `LICENSE` file or full license notice | One n8n workflow JSON; Google Drive; Gemini nodes; Telegram nodes; X/Twitter nodes; no package manager, app database, Docker, or conventional API | Compact visual example of generate → preview → approve/regenerate/discard; product-image handoff; easy-to-understand branching | Do not copy/import the workflow until licensing is fixed; do not use image analysis as product truth; do not copy direct approve-to-publish, credential bindings, or a workflow with no durable revision/audit model | A visible workflow is useful for stakeholder communication, but orchestration configuration is not a substitute for domain integrity and audit data | Use the branch names and Telegram button sequence as a disposable UX prototype, not runtime architecture | **Critical/unknown** for repository content. Running n8n also introduces n8n's separate fair-code/Sustainable Use License considerations | Image-derived product facts can hallucinate; no approver identity model, replay/idempotency design, immutable versions, or audit log; imported n8n credentials must be rebound and inspected; direct X publishing conflicts with MVP | Two commits from one author; last visible commit 2025-09-19; no tests, releases, or runtime documentation. Reference only |
| **Muse** | MIT (`LICENSE` present) | TypeScript; npm; Cloudflare Workers; D1 SQLite; R2; Worker cron; React/Vite web app; Telegram webhooks/WebApp; Gemini and Claude; X, Instagram, LinkedIn, GitHub; separate render worker | Best Telegram interaction reference: webhook routing, per-user ownership checks, onboarding, inline navigation, natural-language refinement, schedule UI, multi-platform result tracking, token encryption, Telegram WebApp `initData` verification, webhook signing, idempotent publish jobs | Do not copy its GitHub/X-specific product model; do not carry over auto-approve/direct-publish defaults; do not adopt Cloudflare/D1 lock-in merely for convenience; draft edits overwrite content and therefore do not meet immutable revision requirements | Persist conversation state per user; verify webhook/WebApp authenticity; scope every query by owner/organization; make publishing idempotent; track partial provider results; edits must create a new immutable revision rather than update in place | Reimplement its Telegram router, draft cards, natural-language edit interaction, auth checks, encrypted credentials, and idempotent job ideas in the Postiz/Nest/Temporal stack | **Low** under MIT with notice/attribution, but copied code would introduce Cloudflare-specific coupling; clean-room adaptation is preferred | Per-user API keys create a high-value encrypted store; cron fan-out and public setup/migration routes require hardening; D1/R2 identifiers are configuration; auto-approval and publishing must be removed; current source-overwrite behavior loses evidence | 52 commits, essentially one maintainer, all within the last year but 0 in the last 90 days at snapshot; no tagged releases observed. Substantial reference, not a platform foundation |
| **MAX2** | MIT (`LICENSE` present) | One large n8n workflow JSON; Notion; Telegram; Gemini; LinkedIn; RSS/HTTP/image providers; no package manager or Docker in repository | Human-in-loop branching; bilingual path; text/image/infographic choices; natural-language rewrite/topic flows; Notion status board; Telegram wait-for-response patterns | Do not import the 217 KB monolithic workflow as the application; do not use Notion as product or audit source of truth; do not enable LinkedIn publishing; do not copy embedded provider-specific assumptions or opaque code nodes without review | Approval, copy refinement, and visual review are separate decisions; business users value explicit status feedback; large visual workflows become hard to test, migrate, and review | Recreate its approve/reject/rewrite/visual-choice UX as typed application states; consider n8n only for non-critical peripheral automations later | **Low** for repository code under MIT. The n8n runtime is fair-code, not OSI open source; confirm Sustainable Use/Enterprise terms for the intended deployment and offering | Monolithic workflow has broad third-party data egress; Notion and n8n credential stores expand the trust boundary; callback/replay and audit guarantees are unclear; workflow activates publishing paths that conflict with MVP | 9 commits from one author, all on one day near the snapshot; early release, no conventional tests or app runtime. Useful process sketch only |

## Detailed architecture findings

### 1. Postiz

- **Repository/package manager:** pnpm monorepo with `apps/backend`, `apps/frontend`, `apps/orchestrator`, `apps/commands`, `apps/extension`, and `apps/sdk`, plus shared libraries.
- **Frameworks:** Next.js frontend, NestJS backend, Prisma, React, Temporal workers, and several AI frameworks/SDKs including OpenAI, AI SDK, LangChain/LangGraph, and Mastra.
- **Database/runtime:** PostgreSQL is the application database. Redis is configured for shared runtime concerns. Temporal has its own PostgreSQL and Elasticsearch services in the supplied full Compose stack.
- **Telegram:** implemented as a **social publishing provider**. It connects to a chat/channel and sends posts. It is not an inbound staff assistant and has no approve/edit/regenerate/reject conversation workflow.
- **Approval/versioning:** team comments and a marketplace/order approval enum exist, but there is no suitable immutable content-revision ledger or Parisian Shopper approval event model. `Post.content` is mutable and cannot be the required audit history by itself.
- **Scheduling/jobs:** `Post` has `DRAFT`, `QUEUE`, `PUBLISHED`, and `ERROR` states plus `publishDate`; versioned Temporal workflows perform durable publishing and other background work.
- **Social integrations:** broad official-provider coverage, including Facebook and Instagram, makes it the best path for later phases.
- **Docker/environment:** comprehensive Compose stack, but operationally heavy. Required configuration includes database, Redis, JWT, URLs, storage, Temporal, and provider credentials. Production must replace all examples, pin images, isolate networks, enable backups, and disable open registration.
- **API:** NestJS controllers, Swagger annotations, organization-aware services, API keys, webhooks, SDK/MCP surfaces, and public integration endpoints. The Parisian product API should be accessed through a new anti-corruption adapter, not mixed into social-provider code.

### 2. Ngocphamnek/agent

- **Repository/package manager:** Python backend (`requirements.txt`, `pyproject.toml`) and npm dashboard.
- **Frameworks/database:** FastAPI, SQLAlchemy, Celery, Redis, React/Vite; SQLite by default with a PostgreSQL option.
- **Telegram:** background long-polling thread with inline approve/reject callbacks. It records a job status but does not persist the approver as a first-class audit event.
- **AI:** sequential specialized pipeline for fetching, analysis, scripts, voice, video, review, notification, and publishing. Filesystem checkpoints allow resume.
- **Scheduling/jobs:** Celery worker + Beat + Redis. Approval directly queues the publisher.
- **Publishing:** YouTube/TikTok/Facebook uploaders include Playwright browser automation. That is operationally fragile and should not be used in this project; official APIs are required.
- **API/Docker/environment:** FastAPI v1 endpoints, dashboard, and Compose for API/worker/Beat/Redis. Environment includes AI, media, Telegram, and platform credentials.
- **Blocking issue:** absent license file means no code reuse.

### 3. NicheBot

- **Repository/package manager:** compact npm/CommonJS application with lockfile and good operational scripts.
- **Database:** local SQLite/WAL tables for niches, posts, schedules, settings, and profile analyses.
- **Telegram:** command-first bot with one allowlisted user, rate limiting, input sanitization, safe Markdown fallback, approve, reject/regenerate, and text-edit patterns.
- **AI:** OpenAI-compatible provider abstraction and prompt templates; stores prompt version and quality metadata, but not authoritative fact provenance.
- **Scheduling/publishing:** in-process `node-cron`; scheduled jobs can publish automatically to X after a quality threshold, which violates the MVP rule.
- **Docker/environment/API:** simple Docker packaging; environment-driven tokens and provider selection; no business HTTP API beyond observability/operational endpoints.
- **Scale limitation:** global in-memory pending post state and single-user assumptions make it unsuitable as the foundation.

### 4. ai-social-media-bot

- **Repository/package manager:** only a README and a 20 KB n8n export. No application manifest or lockfile.
- **Flow:** Google Drive image trigger → Gemini image analysis/caption → Telegram preview → approve/regenerate/discard → X publish.
- **Database/versioning:** none represented beyond n8n execution state. No durable revision or approval ledger.
- **Docker/environment/API:** delegated to an external n8n installation and its credential manager; not documented in the repository.
- **Blocking issue:** missing license text and unsuitable reliance on image inference for product facts.

### 5. Muse

- **Repository/package manager:** npm packages for a Cloudflare Worker bot, rendering worker, and React web app.
- **Database/runtime:** Cloudflare D1, R2, Worker cron, service bindings, and migration files. Durable publish rows use retry/attempt/next-run fields.
- **Telegram:** webhook-based, multi-user bot with explicit authorization, per-user database scoping, callback routing, WebApp signature validation, onboarding, draft browsing, natural-language refinement, scheduling, and platform toggles.
- **AI:** Gemini and Claude adapters, prompt/skill structure, identity/persona context, image/video generation paths.
- **Approval/versioning:** drafts have statuses including approved/scheduled, but `updateDraftContent` overwrites the current JSON. Version fields found in the schema apply to prompts/overviews, not immutable draft revisions.
- **Publishing:** X, Instagram, and LinkedIn with partial result tracking and idempotent/background publish tables. Auto-approval exists and must not be carried into MVP.
- **Docker/environment/API:** Cloudflare-native rather than Docker; secrets through Wrangler and per-user encrypted keys; REST/webhook routes plus a web app.

### 6. MAX2

- **Repository/package manager:** README, governance files, and a 217 KB n8n workflow. No app package manager or Docker setup. Some docs described in the README are absent from the inspected tree.
- **Flow:** scheduled/RSS intelligence → Gemini → Notion record → Telegram wait/review → optional visual generation → approve/reject/rewrite → LinkedIn publish → Notion status update. A Telegram-triggered branch also supports rewriting and topic ideation.
- **Database/versioning:** Notion is used as the status board. The workflow does not establish immutable content revisions and append-only approval events with transaction guarantees.
- **Jobs/API/environment:** n8n supplies scheduling, waiting, retries, credentials, and node APIs; `.env.example` names Notion, Telegram, AI/image, and LinkedIn settings.
- **Fit:** good workflow-discovery material, but too monolithic and operationally opaque for the core system.

## Licensing conclusions

1. **Postiz is usable only with an AGPL strategy.** Section 13 of AGPL-3.0 requires a modified network-interactive version to offer its corresponding source to remote users. Internal organizational use may be treated differently from distribution, but the precise deployment/users and the boundary of a combined work require legal review. Keep notices, preserve the license, document modifications, and provide the required source offer if deploying the modified covered work. See the [GNU AGPL text](https://www.gnu.org/licenses/agpl-3.0.en.html) and [GNU licensing FAQ](https://www.gnu.org/licenses/gpl-faq.html#UnreleasedModsAGPL).
2. **MIT references are permissive, not attribution-free.** NicheBot, Muse, and MAX2 include MIT text; retain copyright and permission notices when copying substantial code. Clean-room adaptation is still preferable because their data models do not fit the required guarantees.
3. **No license means no permission to copy.** `agent` and `ai-social-media-bot` do not contain a license file at the inspected commits. Their README claims do not provide a complete dependable grant. Use only uncopyrightable ideas/patterns or obtain a written license clarification.
4. **n8n is a separate dependency decision.** MAX2 and ai-social-media-bot workflow files may be MIT/unknown respectively, while the n8n runtime is described by n8n as fair-code under its Sustainable Use License. Internal automation may fit, but embedding/hosting it as a product or charging for access needs a separate terms review. It is not selected for the canonical core.
5. **License separation is not a magic shield.** Calling a modified AGPL application through an API does not by itself determine whether another component is or is not part of a combined covered work. Architecture should be chosen for sound boundaries, and counsel should evaluate the actual distribution/deployment.

## Prior technical foundation recommendation (not final)

From a purely technical perspective, **Postiz is the preferred foundation**. Implementation remains blocked until management selects a licensing/architecture option and ADR-001 leaves `PROPOSED` status.

No inspected technical issue blocks its use if Parisian Shopper accepts the AGPL obligations (or obtains alternative commercial terms). It is the only candidate with a mature multi-user application, PostgreSQL, organization/role concepts, durable jobs, production deployment assets, broad official social integrations, a calendar, media handling, analytics, and meaningful maintenance activity. Rebuilding those capabilities around a small Telegram bot or an n8n workflow would create more operational and security risk.

This recommendation does **not** authorize a fork or merging repositories. If management selects the AGPL or alternative-license path, the project would then use a documented Postiz fork or tracked upstream derivative. Otherwise Postiz remains architecture research only. The other five repositories stay under `research/` and contribute only evaluated patterns. No code should be copied from them during the preparation phase.

## Target architecture direction

The MVP should extend Postiz with a clearly bounded **Verified Content** domain:

1. **Telegram staff adapter**
   - Webhook-based bot, not long polling in production.
   - Map Telegram user IDs to active Parisian staff records and organization roles.
   - Verify Telegram webhook secret; use short opaque callback tokens, expiration, idempotency, and replay protection.
   - Support product search/SKU selection, generation, approve, natural-language edit, regenerate, reject, and revision browsing.

2. **Product gateway and immutable snapshots**
   - Parisian Shopper's existing API remains the product source of truth.
   - Normalize only documented fields and record the upstream product identifier, retrieval time, source version/ETag when available, raw-response digest, and a canonical fact snapshot for each content request.
   - Never silently “correct” or infer locked facts. Missing facts remain missing. Similarity claims are allowed only when explicitly present in an approved source field.

3. **Controlled AI generation**
   - Separate immutable facts from creative instructions.
   - Ask the model for typed Khmer and English content, not product records.
   - Validate every generated claim against the fact snapshot before showing it to staff. Exact fields such as SKU, price, discount, stock, size, concentration, origin, notes, and similarity claims require deterministic checks; a second LLM is not the authority.
   - Store model/provider, model version, prompt/template version, temperature, source snapshot ID, validation result, and generation trace metadata.

4. **Append-only revision and approval model**
   - `content_request`: product, requester, channel, current state.
   - `product_snapshot`: immutable verified source payload/digest.
   - `content_revision`: immutable version number, parent revision, Khmer/English content, edit instruction, generation metadata, fact-validation result, creator and timestamps.
   - `approval_event`: append-only actor, action, revision ID, timestamp, Telegram update/callback correlation, and optional reason.
   - Edit and regenerate always create a new revision. They never overwrite an earlier revision. Approval applies to an exact revision and becomes stale if a newer revision is created.

5. **Durable orchestration**
   - Use Postiz's Temporal infrastructure for product fetch/generation/validation and future publish jobs.
   - Make activities idempotent, retry only transient failures, and avoid putting secrets or excessive product payloads into Temporal history.
   - Redis may support throttling/cache needs; PostgreSQL remains the domain record.

6. **MVP publishing prohibition**
   - Do not connect approval to any social publish activity.
   - Disable/hide publishing and scheduling in the Parisian workflow with server-side authorization and configuration, not UI alone.
   - Store `APPROVED` as an internal terminal state for MVP. Any later `PUBLISH_REQUESTED` transition requires a separate ADR, role permission, provider credential setup, audit event, idempotency key, and rollout flag.

## Useful ideas by project

- **Postiz:** application shell, organization model, comments, Postgres/Prisma conventions, Temporal workflows, media, official Meta adapters, calendar, analytics, Docker operations.
- **agent:** checkpoint/resume stages, pause-before-publisher, simple inline approval previews, and task separation—ideas only due to missing license.
- **NicheBot:** Telegram command ergonomics, staff allowlisting, safe formatting, rate limiting, quality metadata, metrics, backup checks, and end-to-end bot testing.
- **ai-social-media-bot:** minimal approve/regenerate/discard interaction map—idea only due to missing license.
- **Muse:** strongest reference for Telegram routing, per-user state, natural-language draft refinement, callback UX, WebApp authentication, encrypted credentials, idempotent publish jobs, and partial provider results.
- **MAX2:** explicit human checkpoints across text and visuals, bilingual choice, rewrite loops, and business-facing status feedback.

## Major risks and mitigations

| Risk | Impact | Required mitigation before implementation |
|---|---|---|
| AGPL obligations are incompatible with business expectations | Legal/release blocker | Obtain management and counsel sign-off on AGPL source-offer/compliance, or negotiate commercial terms with Postiz before building on the fork |
| AI changes or invents product facts | Customer harm, pricing/stock errors, reputational and regulatory exposure | Immutable source snapshots, locked-field schema, typed output, deterministic fact validation, visible “data unavailable,” and tests with adversarial edits |
| Approval is attached to mutable text instead of an exact revision | Invalid audit trail and accidental approval of changed content | Immutable revisions, approval events referencing revision IDs/digests, optimistic concurrency, stale-approval invalidation |
| Auto-publishing is accidentally reachable | Violates explicit MVP requirement | No publish transition from the Telegram workflow, server-side policy denial, feature flag off by default, no MVP platform credentials, negative integration tests |
| Telegram callback spoofing/replay or unauthorized staff action | Unauthorized approval/rejection | Secret webhook header, Telegram user-to-staff mapping, organization/role checks on every action, opaque expiring callbacks, update dedupe, audit events |
| Product API is unavailable or schema changes | Wrong/stale content or blocked operations | Versioned adapter contract, timeout/retry/circuit breaker, schema validation, display snapshot age, never fall back to model-invented data |
| Upstream Postiz changes rapidly | Merge conflicts and security drift | Pin an upstream release, maintain a small patch surface, record upstream SHA, automate tests/migrations, schedule controlled upstream merges |
| Large infrastructure footprint | Higher cost and operations burden | Define a minimal production Compose/deployment profile, managed PostgreSQL where appropriate, backups, secret manager, observability, recovery drills |
| Social/API tokens and product data leak | Account compromise and business data exposure | Least-privilege credentials, encryption at rest, secret manager, redacted logs, outbound allowlists, rotation, retention rules, no secrets in Temporal history |
| Reference-project code is copied despite unclear/incompatible licensing | Copyright/compliance exposure | Keep `research/` read-only, require provenance notes in PRs, maintain a third-party notice inventory, prohibit copying from the two unlicensed repositories |
| Khmer quality is treated as fact correctness | Fluent but wrong copy | Separate language QA from deterministic fact checks; require native-speaker acceptance criteria and representative Khmer fixtures |

## Next recommended implementation step

Before writing feature code, run a short **foundation inception** step:

1. Obtain written AGPL/commercial-license disposition and record it as an ADR addendum.
2. Pin the chosen Postiz release/commit and document the upstream-update strategy.
3. Obtain the Parisian Shopper product API contract plus sanitized example payloads for every locked field.
4. Write the domain specification and threat model: state machine, immutable tables, fact-lock rules, staff roles, Telegram webhook trust boundary, and the hard MVP publishing prohibition.
5. Define acceptance tests first, especially “AI cannot change facts,” revision immutability, approval-to-exact-revision, callback replay, concurrency, and “no publish call is possible.”

Only after those artifacts are approved should implementation begin with the product gateway and immutable product snapshot/revision schema—not with AI prompts or social publishing.
