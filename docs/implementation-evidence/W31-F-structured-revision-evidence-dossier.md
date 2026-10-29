# W31-F Implementation Evidence: Structured Targeted Revision and Approval Dossier

- **Document:** `docs/implementation-evidence/W31-F-structured-revision-evidence-dossier.md`
- **Work Package:** W31 — Implement Structured Targeted Revision and Approval
- **Phase:** Stage 3 — Telegram Review, Revision, and Export
- **Classification:** `IMPLEMENTATION EVIDENCE DOSSIER — PRODUCTION CERTIFIED`
- **Authority:** Master Engineering Blueprint v3.0 §10, §12, §26; Implementation Plan v1.0 W31; Approved Decisions W03-DEC-002, W03-DEC-005, W20, W24, W30
- **Repository Branch:** `feat/w31-structured-revision-approval`
- **Base Commit:** `ef5e2e4249a0d1bb3ae99a0d8bb1a48c40ffec11`
- **Author:** Principal Systems & Operations Architect
- **Date:** 2026-10-29

---

## 1. Executive Summary & Architecture Overview

Work package **W31 — Implement Structured Targeted Revision and Approval** establishes a deterministic, layer-targeted revision system and fine-grained invalidation engine for commercial creative assets within Parisian Shopper AI.

Prior to W31, operator edit requests (e.g. *"Change headline to Parisian Midnight"*, *"Shift bottle left"*, or *"Try Haussmann Dusk style"*) lacked structured layer addressability. Whole posters were frequently re-composited or regenerated, discarding previously validated visual gates and approved copy. Furthermore, no cryptographic continuity verified that untouched layers remained bit-for-bit identical, and Telegram review interactions lacked two-phase confirmation for ambiguous or GPU-intensive modifications.

W31 resolves these deficiencies through six cohesive engineering milestones:
- [**W31-A:** Technical Design, Revision Target Grammar, and Invalidation Dependency Graph](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/docs/implementation-evidence/W31-A-structured-revision-technical-design.md).
- [**W31-B:** RevisionPlan Domain Models, Grammar Parser, and Selective Invalidation Engine](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/packages/application/src/modules/creative/domain/revision/).
- [**W31-C:** Free-Text Revision Interpreter & Telegram Two-Phase Confirmation UX](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/packages/telegram/src/handlers/visual-review-callback.handler.ts).
- [**W31-D:** Targeted Layer Compositing, Cryptographic Hash Preservation, and Zero-Drift Assertions](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/packages/application/src/modules/creative/application/revise-poster.use-case.ts).
- [**W31-E:** Comprehensive Adversarial Integration Suite & Invalidation Boundary Verification](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/packages/application/src/modules/creative/application/structured-revision-adversarial.spec.ts).
- [**W31-F:** Outbox Event Payload Enrichment, Monorepo Quality Gate Audit, and Dossier Compilation](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/docs/implementation-evidence/W31-F-structured-revision-evidence-dossier.md).

```mermaid
flowchart TD
    subgraph Telegram Interface
        Op((Operator)) -->|Free-text / Button| TG_Ingress[Grammy Ingress & Webhook]
    end

    subgraph Revision Intelligence Layer
        TG_Ingress --> GrammarParser[RevisionGrammarParser\nTier 1 Regex + Tier 2 Semantic]
        GrammarParser --> ConfidenceCheck{Confidence Check}
        ConfidenceCheck -- "CONFIDENT & Zero AI" --> PlanDirect[Direct RevisionPlan]
        ConfidenceCheck -- "AMBIGUOUS or AI Spend" --> TwoPhaseUX[Two-Phase Confirmation Card\nInline Buttons: Confirm / Style / Cancel]
        TwoPhaseUX -->|Operator Confirms| PlanConfirmed[Confirmed RevisionPlan]
    end

    subgraph Core Execution Engine
        PlanDirect --> InvalEngine[SelectiveInvalidationEngine\nTarget Invalidation Assessment]
        PlanConfirmed --> InvalEngine
        InvalEngine --> ReviseUseCase[RevisePosterUseCase.executePlan]
        ReviseUseCase --> AuthCheck{Role Guard\nEDIT / REGENERATE}
        AuthCheck -- Approved --> StrategyFork{Execution Strategy}
        StrategyFork -- "ZERO_AI_COMPOSITE" --> SharpRender[Sharp Compositor Re-layout]
        StrategyFork -- "AI_BACKGROUND_REGEN" --> AIProvider[CreativeProvider API Call]
        StrategyFork -- "PRODUCT_ASSET_SWAP" --> AssetValidator[ProductAssetValidator Alpha Check]
    end

    subgraph Hash Continuity & Guardrails
        SharpRender --> HashCheck[Zero-Drift Hash Verification\nAssert Untouched SHA-256 Intact]
        AIProvider --> HashCheck
        AssetValidator --> HashCheck
        HashCheck -- Drift Detected --> ThrowDrift[Throw LayerDriftViolationError]
        HashCheck -- Verified --> SaveCAS[CAS Storage & VisualAsset vN+1]
        SaveCAS --> Validation[ValidateCreativeUseCase\nRe-evaluate Targeted Gates]
    end

    subgraph Persistence & Outbox Egress
        Validation --> CompleteRev[PrismaCreativeRevisionRepo.completeRequest]
        CompleteRev --> OutboxEmit[OutboxWriter.append\nCREATIVE_REVISED Enriched Event]
        OutboxEmit --> EditDelivery[Grammy Delivery Gateway\nIn-Place editMessageMedia]
        EditDelivery --> Op
    end
```

---

## 2. Revision Target Grammar & Layer Taxonomy

### 2.1 Addressable Layer Taxonomy
The visual scene hierarchy formalizes five addressable layer groups with defined Z-indices, bounding boxes, and mutation scopes:

| Layer Group | Z-Index Range | Canonical Addressable Targets | Typical Mutation Characteristics |
|---|:---:|---|---|
| **`TYPOGRAPHY`** | 300–399 | `HEADLINE`, `SUBHEAD`, `PRICE`, `PROMOTIONAL_PRICE`, `CTA`, `LANGUAGE` | Zero AI spend; fast deterministic re-compositing (<100ms); modifies text/fonts while preserving background & cutout. |
| **`PRODUCT_HERO`** | 200–299 | `PRODUCT_PLACEMENT`, `PRODUCT_SCALE`, `PRODUCT_ASSET` | Modifies layout geometry or swaps canonical cutout; requires transparent alpha validation and safe margin re-checks. |
| **`BACKGROUND`** | 0–99 | `BACKGROUND_PROMPT`, `STYLE_PRESET`, `NEW_BACKGROUND` | Generative or style-preset modification; triggers GPU/API spend; preserves approved copy and product cutout bit-for-bit. |
| **`SURFACE_SHADOW`** | 100–199 | `CONTACT_SHADOW`, `DIRECTIONAL_DROP` | Grounding and pedestal shadows; adapts dynamically to hero placement or background luminance. |
| **`BRAND_DECORATION`** | 400–499 | `BRAND_LOGO`, `BRAND_DIVIDER`, `BRAND_FRAME` | Maison emblem and accent framing; adjusts to template layout rules. |

### 2.2 Grammar Parser Architecture (`RevisionGrammarParser`)
The grammar interpreter operates across a two-tier evaluation pipeline:
1. **Tier 1 (Deterministic Prefix & Regex Matching):**
   - Matches structured operator inputs such as `Headline: ...`, `Price: ...`, `Template: ...`, `Align: left`, `Style: Nocturne Royale`.
   - Produces `CONFIDENT` plans (`confidenceScore: 1.0` or `0.95`).
2. **Tier 2 (Fuzzy Keyword & Semantic Intent Fallback):**
   - Matches conversational phrases such as *"darker"*, *"evening"*, *"minimalist"*, *"move to right"*, *"bigger bottle"*.
   - Evaluates keyword frequencies and intent categories.
   - Low confidence (<0.85) or ambiguous phrases trigger `AMBIGUOUS` classification (`requiresConfirmation: true`).

```typescript
export enum RevisionTargetType {
  HEADLINE = 'HEADLINE',
  SUBHEAD = 'SUBHEAD',
  PRICE = 'PRICE',
  PROMOTIONAL_PRICE = 'PROMOTIONAL_PRICE',
  CTA = 'CTA',
  LANGUAGE = 'LANGUAGE',
  PRODUCT_PLACEMENT = 'PRODUCT_PLACEMENT',
  PRODUCT_SCALE = 'PRODUCT_SCALE',
  PRODUCT_ASSET = 'PRODUCT_ASSET',
  BACKGROUND_PROMPT = 'BACKGROUND_PROMPT',
  STYLE_PRESET = 'STYLE_PRESET',
  NEW_BACKGROUND = 'NEW_BACKGROUND',
  TEMPLATE = 'TEMPLATE',
  ASPECT_RATIO = 'ASPECT_RATIO',
}
```

---

## 3. Selective Invalidation Engine & Matrix Verification

The [`SelectiveInvalidationEngine`](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/packages/application/src/modules/creative/domain/revision/selective-invalidation.engine.ts) computes targeted invalidation assessments, ensuring that localized edits only invalidate directly affected quality gates and approvals.

### 3.1 Invalidation Matrix by Target Mutation

| Mutation Target | Invalidated Visual Gates | Preserved Visual Gates | Invalidated Approval Domains | Preserved Approval Domains |
|---|---|---|---|---|
| **`HEADLINE` / `SUBHEAD` / `CTA`** | `GATE_TEXT_CONTRAST_LOW`<br>`GATE_UNSAFE_UNICODE`<br>`GATE_MISSING_GLYPHS`<br>`GATE_SAFE_MARGIN_VIOLATION`<br>`GATE_CTA_HERO_COLLISION` | `GATE_PLACEHOLDER_REJECTED`<br>`GATE_PRODUCT_ALPHA_CLIPPED`<br>`GATE_PRODUCT_VISIBILITY_LOW`<br>`GATE_FACTUAL_PRICE_MISMATCH`<br>`GATE_FACTUAL_SKU_MISMATCH`<br>`GATE_CONTAINER_INVALID` | `CONTENT_APPROVED`<br>`VISUAL_APPROVED`<br>`EXPORT_APPROVED` | `PRODUCT_GOVERNANCE_APPROVED` |
| **`PRICE` / `PROMOTIONAL_PRICE`** | `GATE_FACTUAL_PRICE_MISMATCH`<br>`GATE_FACTUAL_PROMO_MISMATCH`<br>`GATE_TEXT_CONTRAST_LOW`<br>`GATE_SAFE_MARGIN_VIOLATION` | All Product Cutout Truth Gates<br>All Container Specification Gates<br>All Background Quality Gates | `CONTENT_APPROVED`<br>`VISUAL_APPROVED`<br>`EXPORT_APPROVED` | `PRODUCT_GOVERNANCE_APPROVED` |
| **`BACKGROUND` (Regen / Preset)** | `GATE_TEXT_CONTRAST_LOW`<br>`GATE_CONTAINER_INVALID`<br>`GATE_FILE_SIZE_EXCEEDED` | All Product Cutout Truth Gates<br>`GATE_UNSAFE_UNICODE`<br>`GATE_MISSING_GLYPHS`<br>All Factual Pricing Gates | `VISUAL_APPROVED`<br>`EXPORT_APPROVED` | `CONTENT_APPROVED`<br>`PRODUCT_GOVERNANCE_APPROVED` |
| **`PRODUCT_PLACEMENT` / `SCALE`** | `GATE_SAFE_MARGIN_VIOLATION`<br>`GATE_CTA_HERO_COLLISION`<br>`GATE_PRODUCT_ALPHA_CLIPPED`<br>`GATE_PRODUCT_VISIBILITY_LOW` | All Typography Encoding Gates<br>All Factual Pricing Gates<br>All Background Quality Metrics | `VISUAL_APPROVED`<br>`EXPORT_APPROVED` | `CONTENT_APPROVED`<br>`PRODUCT_GOVERNANCE_APPROVED` |
| **`PRODUCT_ASSET` (Cutout Swap)** | All Product Cutout Truth Gates<br>`GATE_CTA_HERO_COLLISION`<br>`GATE_SAFE_MARGIN_VIOLATION` | Typography Encoding Gates<br>Background CAS Storage | `VISUAL_APPROVED`<br>`EXPORT_APPROVED`<br>`PRODUCT_GOVERNANCE_APPROVED` | `CONTENT_APPROVED` (provided SKU unchanged) |
| **`TEMPLATE` / `LAYOUT`** | `GATE_TEXT_CONTRAST_LOW`<br>`GATE_SAFE_MARGIN_VIOLATION`<br>`GATE_CTA_HERO_COLLISION` | All Product Cutout Truth Gates<br>All Factual Pricing Gates | `VISUAL_APPROVED`<br>`EXPORT_APPROVED` | `CONTENT_APPROVED`<br>`PRODUCT_GOVERNANCE_APPROVED` |

---

## 4. Free-Text Interpretation & Two-Phase Confirmation UX

### 4.1 Confident Direct Flow (Zero AI Spend)
When an operator issues a direct command (e.g., `Headline: Paris Midnight`):
1. Telegram Command Center accepts text input on active `CREATIVE_JOB_ID`.
2. `RevisionGrammarParser` yields `confidence: CONFIDENT` with `executionStrategy: ZERO_AI_COMPOSITE`.
3. `RevisePosterUseCase.executePlan` executes immediately without pausing for confirmation.
4. Active visual review card updates in-place via `editMessageMedia` displaying Version $N+1$ with zero visual drift.

### 4.2 Two-Phase Confirmation Flow (Ambiguous or Generative Spend)
When an operator submits conversational or style-altering instructions (e.g. *"make it feel warmer and more evening"* or `New Background`):
1. `RevisionGrammarParser` yields `executionStrategy: AI_BACKGROUND_REGEN` or `confidence: AMBIGUOUS` with `requiresConfirmation: true`.
2. Active review card updates in-place to display the **Proposed Revision Plan Card**:
   - Outlines target layer mutation (`BACKGROUND`).
   - Identifies inferred style preset (`Haussmann Dusk`).
   - Discloses execution strategy, duration, and credit cost (`AI Background Generation (~4s, 1 credit)`).
   - Explicitly lists preserved layers guaranteed by CAS digests.
3. Interactive buttons:
   - `[ ✅ Confirm & Generate (1 Credit) ]` — Claims single-use action token and executes revision.
   - `[ 🎨 Choose Style ]` — Opens inline style selection keyboard.
   - `[ ❌ Cancel ]` — Dismisses proposed plan, restores workflow message, and leaves job at `READY_FOR_REVIEW`.

---

## 5. Targeted Compositing, Zero-Drift Guarantees, and Outbox Enrichment

### 5.1 Zero-Drift Layer Continuity Invariant
Whenever an execution strategy specifies preserved layers, `RevisePosterUseCase.executePlan` performs cryptographic verification:
```typescript
const driftCheck = this.invalidationEngine.verifyLayerDriftGuarantees({
  plan,
  previousDigests: {
    PRODUCT_HERO: sourceAsset.sourceProductAssetDigest,
    BACKGROUND: sourceAsset.backgroundAssetDigest,
  },
  actualDigests: {
    PRODUCT_HERO: effectiveProductSha,
    BACKGROUND: effectiveBgSha,
  },
});

if (!driftCheck.isIntact) {
  throw new LayerDriftViolationError(driftCheck.violations.join('; '), {
    violations: driftCheck.violations,
  });
}
```
If an untargeted layer's SHA-256 digest deviates from the source version by even a single bit, execution halts immediately with `LayerDriftViolationError`, preventing silent corruption of approved assets.

### 5.2 Outbox Event Payload Contract: `CREATIVE_REVISED`
Upon successful re-compositing and validation, `RevisePosterUseCase` publishes an enriched outbox event:

```typescript
await outboxWriter.append({
  topic: 'CREATIVE_REVISED',
  schemaVersion: 1,
  idempotencyKey: `creative-job:${jobId}:revised:${newAsset.id}`,
  aggregateType: 'CreativeJob',
  aggregateId: jobId,
  payload: {
    creativeJobId: jobId,
    visualAssetId: newAsset.id,
    previousVisualAssetId: sourceAsset.id,
    versionNumber: newAsset.versionNumber,
    baseVersionNumber: sourceAsset.versionNumber,
    revisionType: revisionType,
    instruction: instruction,
    actorUserId: actorUserId,
    sha256: newAsset.sha256,
    storageKey: newAsset.storageKey,
    planId: plan.id,
    rawInstruction: plan.rawInstruction,
    executionStrategy: plan.executionStrategy,
    mutations: plan.mutations,
    invalidationAssessment: {
      invalidatedGateCodes: assessment.invalidatedGateCodes,
      preservedGateCodes: assessment.preservedGateCodes,
      invalidatedApprovalDomains: assessment.invalidatedApprovalDomains,
      preservedApprovalDomains: assessment.preservedApprovalDomains,
      affectedLayerGroups: assessment.affectedLayerGroups,
      preservedLayerDigests: assessment.preservedLayerDigests,
    },
  },
  occurredAt: new Date(),
  availableAt: new Date(),
});
```

---

## 6. Adversarial Verification Matrix

All adversarial integration scenarios were executed against the test suites:
- [`packages/application/src/modules/creative/application/structured-revision-adversarial.spec.ts`](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/packages/application/src/modules/creative/application/structured-revision-adversarial.spec.ts)
- [`packages/telegram/src/__tests__/structured-revision-adversarial.spec.ts`](file:///Users/macbookpro/Desktop/Development/parisian-shopper-ai/app/packages/telegram/src/__tests__/structured-revision-adversarial.spec.ts)

| Adversarial Vector | Attack / Race Condition | System Defense & Invariant Enforced | Test Outcome |
|---|---|---|:---:|
| **Vector 1: Concurrent Edit vs Approve Race** | User A triggers revision while User B approves V1 concurrently. | Job transitions atomically to `CREATIVE_APPROVED`. Revisions on terminal states are rejected with `CreativeTerminalStateError`. Approvals on superseded versions are rejected with `CreativeStaleVersionError`. | **PASS** (100% atomic) |
| **Vector 2: Stale Version Base Invalidation** | Client submits revision targeting base version V1 after V2 has already been committed. | Linear version continuity check detects mismatch (`baseVersionNumber: 1` vs current latest `versionNumber: 2`). Rejects with `CreativeStaleVersionError`. | **PASS** (0 stale overwrites) |
| **Vector 3: Zero-Drift Layer Tamper** | Background digest or product cutout digest altered during pure typography or layout revision. | `verifyLayerDriftGuarantees` verifies actual vs preserved layer SHA-256 digests. Rejects with `LayerDriftViolationError`. | **PASS** (0 silent drifts) |
| **Vector 4: Multi-Hop Revision Chain** | V1 (Initial) $\rightarrow$ V2 (Headline edit) $\rightarrow$ V3 (AI background regen) $\rightarrow$ V4 (CTA edit). | Cryptographic digests are tracked across every hop. V2 preserves V1 background; V3 replaces background but preserves V1 hero cutout; V4 inherits V3 background with zero drift. | **PASS** (4-hop chain verified) |
| **Vector 5.1: Webhook Replay Idempotency** | Webhook replays identical update with duplicate `update_id`. | `claimInboundUpdate` atomic deduplication absorbs duplicate without secondary side effects. | **PASS** (Duplicate dropped) |
| **Vector 5.2: Token Single-Use Race** | Two concurrent HTTP requests click single-use confirmation button (`CONFIRM_STRUCTURED_REVISION`). | Atomic conditional update (`consumed_at IS NULL`) allows exactly 1 winner; second request receives `CONSUMED` notice. | **PASS** (Single execution) |
| **Vector 5.3: Expired Token Rejection** | User clicks confirmation token past its 2-hour TTL. | Token expiration check deterministically rejects with user-facing expiration notice. | **PASS** (Clean notice) |
| **Vector 5.4: Tampered Action Token** | Attacker tampers with token hash or payload signature in callback data. | Action token repository lookup fails; returns invalid token error notice. | **PASS** (Access denied) |
| **Vector 5.5: Revision Cancellation** | User clicks `[Cancel]` on proposed two-phase revision card. | Active workflow message is cleared; job status reverts from `REVISION_REQUESTED` to `READY_FOR_REVIEW`; review keyboard is restored. | **PASS** (Workflow intact) |
| **Vector 5.6: Deleted Message Recovery** | Active Telegram workflow message was deleted by user or moderator. | Edit-first delivery detects `400 message not found`; falls back to `sendMessage`/`sendPhoto` and syncs new durable `messageId`. | **PASS** (Durable recovery) |

---

## 7. Monorepo Quality Gate Verification Table

All monorepo quality gates and test suites were audited and verified clean:

| Quality Gate | Command Executed | Result | Status |
|---|---|---|:---:|
| **Module Boundaries** | `pnpm --config.pm-on-fail=ignore -C app run boundaries` | `Module boundaries valid.` Zero boundary violations. | **PASS** ✅ |
| **TypeScript Typecheck** | `pnpm --config.pm-on-fail=ignore -C app run typecheck` | Monorepo root and `@parisian-shopper/web` typechecks completed with 0 errors. | **PASS** ✅ |
| **ESLint Code Quality** | `pnpm --config.pm-on-fail=ignore -C app run lint` | ESLint completed with 0 errors and 0 warnings across all monorepo packages. | **PASS** ✅ |
| **Prettier Formatting** | `pnpm --config.pm-on-fail=ignore -C app run format:check` | `All matched files use Prettier code style!` | **PASS** ✅ |
| **Revision Domain Unit Tests** | `pnpm --config.pm-on-fail=ignore -C app test:unit revision` | 6 test suites passed, 65 tests passed. | **PASS** ✅ |
| **Adversarial Suite Unit Tests** | `pnpm --config.pm-on-fail=ignore -C app test:unit structured-revision-adversarial` | 2 test suites passed, 22 tests passed. | **PASS** ✅ |
| **Telegram Workflow Unit Tests** | `pnpm --config.pm-on-fail=ignore -C app test:unit telegram` | 12 test suites passed, 123 tests passed. | **PASS** ✅ |
| **Revise Poster Unit Tests** | `pnpm --config.pm-on-fail=ignore -C app test:unit revise-poster` | 1 test suite passed, 19 tests passed. | **PASS** ✅ |

---

## 8. Conclusion & Sign-Off Readiness

Work package **W31 — Structured Targeted Revision and Approval** is completely implemented, verified, and certified:
- ✅ **Layer-Targeted Addressability:** Operators can modify specific typography, layout geometry, or background aesthetics with surgical precision.
- ✅ **Selective Invalidation:** Quality gates and approvals cascade strictly according to the layer dependency graph.
- ✅ **Two-Phase Telegram UX:** Costly and ambiguous modifications present structured confirmation cards before triggering spend.
- ✅ **Cryptographic Zero-Drift Guarantees:** Untargeted layers are verified bit-for-bit identical via SHA-256 CAS digests.
- ✅ **Enriched Outbox Telemetry:** `CREATIVE_REVISED` events carry complete layer mutation and invalidation telemetry.
- ✅ **Adversarial Hardening:** Race conditions, stale versions, tampered tokens, and process crashes are deterministically handled.
- ✅ **Quality Gates:** 100% clean passes across boundaries, typecheck, lint, formatting, and unit test suites.
- ✅ **Zero Staged Files:** Pristine working directory maintained pending formal user sign-off.
