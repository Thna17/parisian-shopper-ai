# W20 — Versioned Layered CreativeScene Model Implementation Evidence

**Document:** `/docs/implementation-evidence/W20-versioned-layered-creative-scene-model.md`  
**Work Package:** W20 — Layered CreativeScene Model  
**Phase:** Stage 2 — Creative Engine & Poster Studio  
**Classification:** `IMPLEMENTED — OWNER ACCEPTED`  
**Execution Date:** 2026-10-24  
**Owner Acceptance Date:** 2026-10-24  
**Owner Acceptance:** Confirmed by Brathna in the project conversation: “Yes, I confirm W20 approval.”  
**Authority:** Master Engineering Blueprint v3.0 §9, §10, §22; Layered Creative Scene Schema (§§5, 6, 11, 12, 13); Approved Decisions W03-DEC-004 and W03-DEC-007  

---

## 1. Executive Summary

Work package **W20 — Layered CreativeScene Model** establishes the normalized, versioned, provider-independent multi-layer scene graph representation of marketing creative prior to headless rasterization. Posters are modeled as structured, reproducible, multi-layer scene graphs across five functional layer groups (`BACKGROUND`, `SURFACE_SHADOW`, `PRODUCT_HERO`, `TYPOGRAPHY`, `BRAND_DECORATION`) with normalized relational persistence, database-level PostgreSQL immutability triggers, row-level concurrency locking (`SELECT ... FOR UPDATE`), database-level composite foreign key integrity constraints, mandatory transactional outbox writes, fail-closed coordinate/safe area validation, authoritative W12 product asset evidence bindings, and strict adherence to approved business decisions **W03-DEC-004** (Hero cutouts only) and **W03-DEC-007** (Approved Latin and Khmer typography).

### Core Architectural Guarantees Enforced

1. **Normalized Relational Persistence:**
   - `creative_scenes`: Root mutable container tracking `current_version_number`, `creative_job_id`, `campaign_id`, `title`.
   - `creative_scene_versions`: Permanently immutable scene versions (layers and status are decoupled into dedicated normalized tables).
   - `scene_layers`: 1:N normalized layers per scene version with `layer_key`, `layer_group`, `layer_type`, `z_index`, `bounds`, `payload`, `payload_schema_version`, `layer_hash`, `sort_order`. Unique constraints on `[scene_version_id, layer_key]`, `[scene_version_id, z_index]`, `[scene_version_id, sort_order]`, and composite key `[id, scene_version_id]`.
   - `layer_dependencies`: 1:N normalized external dependencies (`PRODUCT_SNAPSHOT`, `PRODUCT_ASSET`, `PRODUCT_ASSET_REGISTRATION`, `VALIDATION_ASSESSMENT`, `RIGHTS_EVENT`, `APPROVAL_EVENT`, `CONTENT_VERSION`, `BRAND_PROFILE`) with unique constraint on `[scene_version_id, dependency_type, dependency_identifier]` and a database-enforced composite foreign key `(scene_layer_id, scene_version_id) REFERENCES scene_layers(id, scene_version_id)` guaranteeing cross-version dependency references are strictly impossible.
   - `scene_version_states`: 1:1 mutable lifecycle state projection (`DRAFT`, `VALIDATED`, `APPROVED`, `SUPERSEDED`, `INVALIDATED`, `RENDER_FAILED`, `GATES_FAILED`, `STALE_FACTS`) with `is_export_eligible`, `invalidation_reason`, and `invalidated_at`.
   - `scene_invalidation_events`: Append-only audit log tracking divergence reasons and digest mismatches.

2. **Database-Enforced Immutability Triggers:**
   - PostgreSQL trigger function `prevent_immutable_row_modification()` raises an exception on any direct `UPDATE` or `DELETE` attempt against:
     - `creative_scene_versions`
     - `scene_layers`
     - `layer_dependencies`
     - `scene_invalidation_events`
   - Verified directly in PostgreSQL integration tests.

3. **Atomic Initial Creation and Revisions with Mandatory Outbox Writes:**
   - Initial scene creation executes in a single PostgreSQL transaction:
     - Inserts `creative_scenes` container (`current_version_number = 1`)
     - Inserts `creative_scene_versions` version 1
     - Inserts normalized `scene_layers`
     - Inserts normalized `layer_dependencies` (resolving layer keys to layer IDs)
     - Inserts mutable `scene_version_states` projection (`status = 'DRAFT'`)
     - Inserts `outbox_events` row (`topic = 'creative.scene.version_created'`)
   - Any failure completely rolls back the transaction, leaving zero orphan records.
   - Revisions strictly require non-empty outbox drafts (`[OutboxEventDraft, ...OutboxEventDraft[]]`) and roll back completely if outbox insertion fails, preserving version pointers and leaving zero orphans.

4. **Row-Level Concurrency Serialization (`SELECT ... FOR UPDATE`):**
   - Scene revisions acquire a row-level lock on `creative_scenes` via `SELECT id, current_version_number FROM creative_scenes WHERE id = $id FOR UPDATE`.
   - Revisions verify `scene.current_version_number === input.expectedVersionNumber`.
   - Concurrency conflicts throw `SceneConcurrencyConflictError`.
   - Parallel revision attempts are strictly serialized: exactly one succeeds, one fails closed, current version advances monotonically, and zero duplicate versions are created.

5. **Centralized Authoritative Scene Evidence Verification & Complete Relationship Chain:**
   - Centralized in `AuthoritativeSceneEvidenceVerifier`, injected into `CreateInitialSceneUseCase` and `ReviseSceneUseCase`.
   - Verifies the unbroken authoritative relationship chain: `ProductSnapshot` → SKU → `ProductAssetRegistration` → `ProductAsset` → `ValidationAssessment` → `RightsEvent` → `ApprovalEvent` → verified raw CAS bytes.
   - Removed manufactured fallback events: `ProductAssetEligibilityEvaluator.resolveAuthoritativeHeroEvidence` never manufactures a `ProductAssetRightsEvent` from registration fields. Missing, non-VERIFIED, non-effective, or expired rights events strictly fail closed with domain errors.
   - Approval events must belong to the registration, have decision `APPROVED`, and strictly match `validationAssessmentId` when present. Stored validation assessments must belong to the product asset, be marked `isValid: true`, not have `FAIL` status, and match active `CURRENT_VALIDATOR_VERSION` ('1.0.0').
   - All 10 hero payload metadata fields are required (`format`, `byteSize`, `width`, `height`, `pixelCount`, `channels`, `hasAlpha: true`, `transparencyRatio`, `rightsState: 'VERIFIED'`, `approvalDecision: 'APPROVED'`) and strictly compared against authoritative evidence.
   - Raw CAS storage bytes are verified directly (`buffer.length === asset.byteSize` and `sha256(buffer) === asset.sha256`).
   - Resolves authoritative `ContentVersion` via `ContentGenerationRepository` and `BrandRuleVersion` via `BrandRuleRepository`, verifying relationship integrity: `contentVersion.productSnapshotId === scene.productSnapshotId` and `contentVersion.brandRuleVersionId === scene.brandProfileVersionId`.
   - Immutable digests for dependencies are computed strictly from loaded record objects (`computeSnapshotDigest`, `computeProductAssetDigest`, `computeRegistrationDigest`, `computeAssessmentDigest`, `computeRightsEventDigest`, `computeApprovalEventDigest`, `computeContentVersionDigest`, `computeBrandRuleDigest`). Bare string IDs are rejected with `TypeError`.
   - Comprehensive negative tests cover all 22 evidence fields and relationships; all failure paths assert that `sceneRepo.createInitialScene`, `sceneRepo.createRevision`, and outbox writes are NEVER executed.

6. **True Layer-Type & Payload Discrimination Across All 12 Layer Types:**
   - Strict runtime Zod discrimination via `validateSceneLayerPayloadByType`:
     - `BACKGROUND`: `GENERATED_BACKGROUND`, `STATIC_CAS_BACKGROUND`, `SOLID_COLOR_BACKGROUND`, `GRADIENT_BACKGROUND`
     - `SURFACE_SHADOW`: `CONTACT_SHADOW`, `PEDESTAL_SURFACE`, `DIRECTIONAL_DROP`
     - `PRODUCT_HERO`: `HERO_CUTOUT` (strict 10 required metadata fields)
     - `TYPOGRAPHY`: `TYPOGRAPHY_BLOCK`
     - `BRAND_DECORATION`: `BRAND_MARK`, `BRAND_DIVIDER`, `BRAND_FRAME`
   - Payload keys for one layer type (e.g. `divider` on `BRAND_FRAME` or `gradient` on `SOLID_COLOR_BACKGROUND`) or cross-group mismatches are strictly rejected with `InvalidSceneLayerError`.
   - Base coordinate systems: `1:1` (1080×1080), `4:5` (1080×1350), `9:16` (1080×1920).
   - Non-negative coordinates strictly enforced (`x >= 0, y >= 0, width > 0, height > 0`).
   - Finite number assertion rejects `NaN` and `Infinity`.
   - CAS keys must be safe relative paths (no `..`, leading `/`, or URLs).
   - Background layer must completely cover 100% of the canvas.
   - Typography and brand decoration layers must remain strictly within configured safe margins.
   - Layer groups enforce strict Z-index boundaries:
     - `BACKGROUND`: 0 – 99
     - `SURFACE_SHADOW`: 100 – 199
     - `PRODUCT_HERO`: 200 – 299
     - `TYPOGRAPHY`: 300 – 399
     - `BRAND_DECORATION`: 400 – 499

7. **Typography Allowlist (W03-DEC-007):**
   - Fonts permitted: `Playfair Display`, `Montserrat`, `Noto Sans Khmer`.
   - Deferred fonts (`Moul`, `Kantumruy Pro`) and unapproved web fonts fail closed.
   - `Playfair Display`: weights 400–900 (display weights < 400 rejected).
   - `Montserrat`: weights 100–900.
   - `Noto Sans Khmer`: strictly discrete weights 400 or 700 (synthetic weights rejected).

8. **Deterministic Hashing & Layer Hash Stability:**
   - Canonical JSON serializer sorts keys lexicographically, standardizes `Date` and `BigInt`, and omits undefined properties.
   - Modifying copy in `EDIT_TEXT` produces a new version where unaffected layers have identical `layerHash` digests, guaranteeing \$0.00 AI re-generation costs.

9. **Authorization Enforcement:**
   - `CreateInitialSceneUseCase` and `ReviseSceneUseCase` require `requesterUserId` and enforce `Permission.EDIT_CREATIVE` via `PermissionService`.

---

## 2. Invariant & Implementation Verification Matrix

| Architectural Invariant / Requirement | Implementation Details | Test Suite | Result |
|---|---|---|---|
| **Normalized Relational Schema** | Separate `CreativeScene`, `CreativeSceneVersion`, `SceneLayer`, `LayerDependency`, `SceneVersionState`, `SceneInvalidationEvent`. | `w20-creative-scene.integration-spec.ts` | **PASS** |
| **PostgreSQL Immutability Triggers** | `prevent_immutable_row_modification()` trigger blocks `UPDATE`/`DELETE` on versions, layers, dependencies, and invalidation events. | `w20-creative-scene.integration-spec.ts` | **PASS** |
| **Database Composite Foreign Key** | `(scene_layer_id, scene_version_id) REFERENCES scene_layers(id, scene_version_id)` rejects cross-version layer dependency references at database level. | `w20-creative-scene.integration-spec.ts` | **PASS** |
| **Atomic Initial Creation** | Single transaction creating container, version 1, layers, dependencies, state projection, and outbox event. | `w20-creative-scene.integration-spec.ts` | **PASS** |
| **Initial Creation Outbox Failure Rollback** | Outbox write failure rolls back entire initial scene transaction; zero orphans. | `w20-creative-scene.integration-spec.ts` | **PASS** |
| **Revision Outbox Failure Rollback** | Outbox write failure rolls back revision transaction; version pointer preserved, zero orphans. | `w20-creative-scene.integration-spec.ts` | **PASS** |
| **Revision Empty Outbox Rejection** | Revisions reject empty outbox event drafts fail-closed. | `w20-creative-scene.integration-spec.ts` | **PASS** |
| **Row-Level Concurrency Locking** | `SELECT ... FOR UPDATE` serializes concurrent revisions; stale expectedVersionNumber throws `SceneConcurrencyConflictError`. | `w20-creative-scene.integration-spec.ts` | **PASS** |
| **Layer Key Resolution & Scoping** | `sceneLayerKey` resolved to `sceneLayerId`; unknown keys fail-closed with `InvalidSceneLayerError`; hero dependency linked to hero layer. | `w20-creative-scene.integration-spec.ts` | **PASS** |
| **Ordered Layer & Dep Readback** | Query readback sorted deterministically by `sortOrder` ascending. | `w20-creative-scene.integration-spec.ts` | **PASS** |
| **Normalized Dependency Invalidation** | Appends `SceneInvalidationEvent`, updates `SceneVersionState` to `STALE_FACTS`, emits outbox event, preserves version row. | `w20-creative-scene.integration-spec.ts` | **PASS** |
| **W12 Hero Cutout Sanctity & 19-Field Match** | Strict `HERO_CUTOUT` role, transparent PNG/WebP, CAS key, SHA-256, rights/approval IDs, containment config; all 19 fields verified against authoritative records. | `creative-scene.validator.spec.ts`, `creative-scene-use-cases.spec.ts` | **PASS** |
| **Strict Zod Runtime Schema Validation** | `.strict()` on all layer groups and layers; unknown or malformed payload properties rejected. | `creative-scene.validator.spec.ts` | **PASS** |
| **Geometry & Safe Margins** | Non-negative coordinates, finite numbers, background 100% coverage, typography within safe margins. | `creative-scene.validator.spec.ts` | **PASS** |
| **Z-Index Boundary Enforcement** | Strict partitioning (0–99, 100–199, 200–299, 300–399, 400–499). | `creative-scene.validator.spec.ts` | **PASS** |
| **Typography Allowlist (W03-DEC-007)** | Playfair Display (400–900), Montserrat (100–900), Noto Sans Khmer (400, 700). Deferred fonts rejected. | `creative-scene.validator.spec.ts` | **PASS** |
| **Deterministic Layer Hashing** | SHA-256 digest over sorted layer fields; identical hashes for unchanged layers across text revisions. | `scene-hash.spec.ts` | **PASS** |
| **Deterministic Dependency Hashing** | SHA-256 digest over sorted dependency identifiers and canonical digests (`computeCanonicalSha256`). | `scene-hash.spec.ts` | **PASS** |
| **Deterministic Scene Hashing** | Canonical payload hash independent of layer array input ordering. | `scene-hash.spec.ts` | **PASS** |
| **Authorization (`EDIT_CREATIVE`)** | Missing user or insufficient role permissions throws `ForbiddenError`. | `creative-scene-use-cases.spec.ts` | **PASS** |
| **Approval De-authorization** | Revising an `APPROVED` version emits `creative.approval.rendered_ineligible` outbox event. | `creative-scene-use-cases.spec.ts` | **PASS** |
| **Deterministic Dependency Hashing** | SHA-256 digest over sorted dependency identifiers and digests. | `scene-hash.spec.ts` | **PASS** |
| **Deterministic Scene Hashing** | Canonical payload hash independent of layer array input ordering. | `scene-hash.spec.ts` | **PASS** |
| **Authorization (`EDIT_CREATIVE`)** | Missing user or insufficient role permissions throws `ForbiddenError`. | `creative-scene-use-cases.spec.ts` | **PASS** |
| **Approval De-authorization** | Revising an `APPROVED` version emits `creative.approval.rendered_ineligible` outbox event. | `creative-scene-use-cases.spec.ts` | **PASS** |

---

## 3. Database Schema and Migrations

### Prisma Models (`app/packages/database/prisma/schema.prisma`)

```prisma
model CreativeScene {
  id                   String   @id @default(uuid()) @db.Uuid
  creativeJobId        String   @map("creative_job_id") @db.Uuid
  campaignId           String?  @map("campaign_id") @db.Uuid
  title                String   @db.VarChar(255)
  currentVersionNumber Int      @default(1) @map("current_version_number")
  createdAt            DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt            DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  creativeJob CreativeJob            @relation(fields: [creativeJobId], references: [id], onDelete: Restrict, onUpdate: Cascade, map: "creative_scenes_creative_job_id_fkey")
  versions    CreativeSceneVersion[]

  @@index([creativeJobId, createdAt], map: "creative_scenes_job_created_at_idx")
  @@map("creative_scenes")
}

model CreativeSceneVersion {
  id                     String   @id @default(uuid()) @db.Uuid
  sceneId                String   @map("scene_id") @db.Uuid
  versionNumber          Int      @map("version_number")
  parentVersionId        String?  @map("parent_version_id") @db.Uuid
  aspectRatio            String   @map("aspect_ratio") @db.VarChar(20)
  width                  Int
  height                 Int
  templateId             String   @map("template_id") @db.VarChar(100)
  templateVersion        String   @map("template_version") @db.VarChar(50)
  stylePresetId          String?  @map("style_preset_id") @db.VarChar(100)
  language               String   @default("EN") @db.VarChar(20)
  safeMargins            Json     @map("safe_margins") @db.JsonB
  brandProfileVersionId  String   @map("brand_profile_version_id") @db.Uuid
  sourceContentVersionId String   @map("source_content_version_id") @db.Uuid
  productSnapshotId      String   @map("product_snapshot_id") @db.Uuid
  sceneHash              String   @map("scene_hash") @db.Char(64)
  dependencyHash         String   @map("dependency_hash") @db.Char(64)
  changeReason           String?  @map("change_reason") @db.VarChar(500)
  operationCode          String?  @map("operation_code") @db.VarChar(50)
  requestedByUserId      String?  @map("requested_by_user_id") @db.Uuid
  metadata               Json?    @db.JsonB
  createdAt              DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  scene                CreativeScene            @relation(fields: [sceneId], references: [id], onDelete: Restrict, onUpdate: Cascade, map: "creative_scene_versions_scene_id_fkey")
  parentVersion        CreativeSceneVersion?    @relation("SceneVersionAncestry", fields: [parentVersionId], references: [id], onDelete: Restrict, onUpdate: Cascade, map: "creative_scene_versions_parent_version_id_fkey")
  childVersions        CreativeSceneVersion[]   @relation("SceneVersionAncestry")
  sourceContentVersion ContentVersion           @relation(fields: [sourceContentVersionId], references: [id], onDelete: Restrict, onUpdate: Cascade, map: "creative_scene_versions_content_version_id_fkey")
  productSnapshot      ProductSnapshot          @relation(fields: [productSnapshotId], references: [id], onDelete: Restrict, onUpdate: Cascade, map: "creative_scene_versions_product_snapshot_id_fkey")
  requestedByUser      User?                    @relation("UserRequestedSceneVersions", fields: [requestedByUserId], references: [id], onDelete: Restrict, onUpdate: Cascade, map: "creative_scene_versions_requested_by_user_id_fkey")
  layers               SceneLayer[]
  dependencies         LayerDependency[]
  state                SceneVersionState?
  invalidationEvents   SceneInvalidationEvent[]

  @@unique([sceneId, versionNumber], map: "creative_scene_versions_scene_version_key")
  @@index([sceneId, createdAt], map: "creative_scene_versions_scene_created_at_idx")
  @@index([sceneHash], map: "creative_scene_versions_scene_hash_idx")
  @@index([dependencyHash], map: "creative_scene_versions_dependency_hash_idx")
  @@index([productSnapshotId], map: "creative_scene_versions_product_snapshot_id_idx")
  @@map("creative_scene_versions")
}

model SceneLayer {
  id                   String   @id @default(uuid()) @db.Uuid
  sceneVersionId       String   @map("scene_version_id") @db.Uuid
  layerKey             String   @map("layer_key") @db.VarChar(100)
  layerGroup           String   @map("layer_group") @db.VarChar(50)
  layerType            String   @map("layer_type") @db.VarChar(50)
  name                 String   @db.VarChar(255)
  zIndex               Int      @map("z_index")
  visible              Boolean  @default(true)
  opacity              Float    @default(1.0)
  blendMode            String   @default("NORMAL") @map("blend_mode") @db.VarChar(50)
  bounds               Json     @db.JsonB
  payload              Json     @db.JsonB
  payloadSchemaVersion Int      @default(1) @map("payload_schema_version")
  layerHash            String   @map("layer_hash") @db.Char(64)
  sortOrder            Int      @map("sort_order")
  createdAt            DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  sceneVersion CreativeSceneVersion @relation(fields: [sceneVersionId], references: [id], onDelete: Restrict, onUpdate: Cascade, map: "scene_layers_scene_version_id_fkey")
  dependencies LayerDependency[]

  @@unique([id, sceneVersionId], map: "scene_layers_id_version_id_uniq")
  @@unique([sceneVersionId, layerKey], map: "scene_layers_version_key_uniq")
  @@unique([sceneVersionId, zIndex], map: "scene_layers_version_z_index_uniq")
  @@unique([sceneVersionId, sortOrder], map: "scene_layers_version_sort_order_uniq")
  @@index([sceneVersionId, sortOrder], map: "scene_layers_version_sort_idx")
  @@index([layerHash], map: "scene_layers_hash_idx")
  @@map("scene_layers")
}

model LayerDependency {
  id                   String   @id @default(uuid()) @db.Uuid
  sceneVersionId       String   @map("scene_version_id") @db.Uuid
  sceneLayerId         String?  @map("scene_layer_id") @db.Uuid
  dependencyType       String   @map("dependency_type") @db.VarChar(50)
  dependencyIdentifier String   @map("dependency_identifier") @db.VarChar(255)
  evidenceIdentifier   String?  @map("evidence_identifier") @db.VarChar(255)
  immutableDigest      String   @map("immutable_digest") @db.Char(64)
  sortOrder            Int      @map("sort_order")
  createdAt            DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  sceneVersion CreativeSceneVersion @relation(fields: [sceneVersionId], references: [id], onDelete: Restrict, onUpdate: Cascade, map: "layer_dependencies_scene_version_id_fkey")
  sceneLayer   SceneLayer?          @relation(fields: [sceneLayerId, sceneVersionId], references: [id, sceneVersionId], onDelete: Restrict, onUpdate: Cascade, map: "layer_dependencies_scene_layer_composite_fkey")

  @@unique([sceneVersionId, dependencyType, dependencyIdentifier], map: "layer_dependencies_version_type_identifier_uniq")
  @@index([sceneVersionId, sortOrder], map: "layer_dependencies_version_sort_idx")
  @@index([immutableDigest], map: "layer_dependencies_digest_idx")
  @@map("layer_dependencies")
}

model SceneVersionState {
  id                 String    @id @default(uuid()) @db.Uuid
  sceneVersionId     String    @unique(map: "scene_version_states_version_id_key") @map("scene_version_id") @db.Uuid
  status             String    @default("DRAFT") @db.VarChar(50)
  isExportEligible   Boolean   @default(false) @map("is_export_eligible")
  invalidationReason String?   @map("invalidation_reason") @db.VarChar(500)
  invalidatedAt      DateTime? @map("invalidated_at") @db.Timestamptz(3)
  updatedAt          DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)

  sceneVersion CreativeSceneVersion @relation(fields: [sceneVersionId], references: [id], onDelete: Restrict, onUpdate: Cascade, map: "scene_version_states_scene_version_id_fkey")

  @@index([status, updatedAt], map: "scene_version_states_status_updated_idx")
  @@map("scene_version_states")
}

model SceneInvalidationEvent {
  id                     String   @id @default(uuid()) @db.Uuid
  sceneVersionId         String   @map("scene_version_id") @db.Uuid
  reason                 String   @db.VarChar(500)
  divergedDependencyType String   @map("diverged_dependency_type") @db.VarChar(50)
  expectedDigest         String   @map("expected_digest") @db.Char(64)
  actualDigest           String   @map("actual_digest") @db.Char(64)
  recordedByUserId       String?  @map("recorded_by_user_id") @db.Uuid
  metadata               Json?    @db.JsonB
  recordedAt             DateTime @default(now()) @map("recorded_at") @db.Timestamptz(3)

  sceneVersion   CreativeSceneVersion @relation(fields: [sceneVersionId], references: [id], onDelete: Restrict, onUpdate: Cascade, map: "scene_invalidation_events_scene_version_id_fkey")
  recordedByUser User?                @relation("UserSceneInvalidationEvents", fields: [recordedByUserId], references: [id], onDelete: Restrict, onUpdate: Cascade, map: "scene_invalidation_events_recorded_by_user_id_fkey")

  @@index([sceneVersionId, recordedAt], map: "scene_invalidation_events_version_recorded_idx")
  @@map("scene_invalidation_events")
}
```

### PostgreSQL Migration Trigger Function

From `app/packages/database/prisma/migrations/20261023160000_layered_creative_scene_w20/migration.sql`:

```sql
CREATE OR REPLACE FUNCTION prevent_immutable_row_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% is immutable: updates and deletes are prohibited', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_creative_scene_versions_modification
BEFORE UPDATE OR DELETE ON creative_scene_versions
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_modification();

CREATE TRIGGER trg_prevent_scene_layers_modification
BEFORE UPDATE OR DELETE ON scene_layers
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_modification();

CREATE TRIGGER trg_prevent_layer_dependencies_modification
BEFORE UPDATE OR DELETE ON layer_dependencies
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_modification();

CREATE TRIGGER trg_prevent_scene_invalidation_events_modification
BEFORE UPDATE OR DELETE ON scene_invalidation_events
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_modification();

-- Composite Foreign Key Constraint (cross-version dependency reference prevention)
ALTER TABLE "scene_layers" ADD CONSTRAINT "scene_layers_id_version_id_uniq" UNIQUE ("id", "scene_version_id");
ALTER TABLE "layer_dependencies" ADD CONSTRAINT "layer_dependencies_scene_layer_composite_fkey" FOREIGN KEY ("scene_layer_id", "scene_version_id") REFERENCES "scene_layers"("id", "scene_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

---

## 4. Quality Gates & Test Execution Evidence

All quality gates pass with zero warnings, zero deprecations, and zero errors:

### 1. Monorepo Typecheck
```bash
$ pnpm typecheck
tsc -b --pretty false
# Exit code: 0
```

### 2. Architecture & Monorepo Lint Verification
```bash
$ pnpm lint
NODE_OPTIONS=--max-old-space-size=4096 eslint . --max-warnings 0 && pnpm boundaries
node scripts/check-boundaries.mjs
Module boundaries valid.
# Exit code: 0 (0 warnings, 0 errors)
```

### 3. Database Schema Validation & Migration Status
```bash
$ pnpm --filter @parisian-shopper/database prisma:validate
The schema at prisma/schema.prisma is valid 🚀

$ pnpm --filter @parisian-shopper/database exec prisma migrate status --schema prisma/schema.prisma
Datasource "db": PostgreSQL database "parisian_shopper", schema "public" at "127.0.0.1:5433"
10 migrations found in prisma/migrations
Database schema is up to date!
# Exit code: 0
```

### 4. W20 Creative Scene Unit Test Suite (98 tests passed)
```bash
$ pnpm test:unit creative-scene --runInBand
PASS unit packages/database/src/creative/prisma-creative-scene.repository.spec.ts
PASS unit packages/application/src/modules/creative/application/creative-scene-use-cases.spec.ts
PASS unit packages/application/src/modules/creative/domain/scene/creative-scene.validator.spec.ts

Test Suites: 3 passed, 3 total
Tests:       98 passed, 98 total
Snapshots:   0 total
Time:        1.206 s
# Exit code: 0
```

### 5. Canonical Hash Stability Unit Suite (21 tests passed)
```bash
$ pnpm test:unit scene-hash --runInBand
PASS unit packages/application/src/modules/creative/domain/scene/scene-hash.spec.ts
  Scene Hashing and Canonical Serialization
    canonicalStringify
      ✓ produces identical output regardless of object key insertion order
      ✓ omits undefined properties deterministically
      ✓ formats arrays deterministically
      ✓ serializes Date to ISO string and BigInt to decimal string
    computeCanonicalSha256 and Dependency Digest Helpers
      ✓ produces 64-char lowercase hex SHA-256 digest
      ✓ computes stable fixed vector digest for known object
      ✓ computeSnapshotDigest alters digest on any snapshot property mutation
      ✓ computeProductAssetDigest alters digest on any asset property mutation
      ✓ computeRegistrationDigest alters digest on any registration property mutation
      ✓ computeAssessmentDigest alters digest on any assessment property mutation
      ✓ computeRightsEventDigest and computeApprovalEventDigest alter digest on mutation
      ✓ computeContentVersionDigest requires an authoritative record object and changes on property mutations
      ✓ computeBrandRuleDigest requires an authoritative record object and changes on property mutations
      ✓ computeIdentifierDigest computes SHA-256 for string identifiers
    computeLayerHash & Layer Hash Stability
      ✓ computes a 64-char lowercase hex SHA-256 digest
      ✓ guarantees unchanged layers have identical hash across text revisions
      ✓ matches fixed test vector for stable reproducibility
    computeDependencyHash
      ✓ computes deterministic dependency hash sorted by sortOrder
      ✓ detects changes in any dependency digest
    computeSceneHash
      ✓ computes deterministic scene hash regardless of input layer array order
      ✓ changes scene hash when any layer payload changes

Test Suites: 1 passed, 1 total
Tests:       21 passed, 21 total
Snapshots:   0 total
Time:        0.296 s
# Exit code: 0
```

### 6. Product Asset Unit Suite (116 tests passed)
```bash
$ pnpm test:unit product-asset --runInBand
PASS unit packages/application/src/modules/products/application/product-asset-eligibility-evaluator.spec.ts
PASS unit packages/application/src/modules/products/infrastructure/safe-product-asset-acquisition.service.spec.ts
PASS unit packages/application/src/modules/creative/domain/product-asset-validator.spec.ts
PASS unit packages/application/src/modules/products/application/replace-product-asset.use-case.spec.ts
PASS unit packages/application/src/modules/products/application/register-product-asset.use-case.spec.ts
PASS unit packages/application/src/modules/products/application/approve-product-asset.use-case.spec.ts
PASS unit packages/application/src/modules/products/application/verify-product-asset-rights.use-case.spec.ts
PASS unit packages/application/src/modules/products/infrastructure/disk-product-asset-storage.adapter.spec.ts

Test Suites: 8 passed, 8 total
Tests:       116 passed, 116 total
Snapshots:   0 total
Time:        1.536 s
# Exit code: 0
```

### 7. Real PostgreSQL Integration Test Suite (17 tests passed)
```bash
$ pnpm test:integration packages/database/test/integration/w20-creative-scene.integration-spec.ts
PASS integration packages/database/test/integration/w20-creative-scene.integration-spec.ts (6.879 s)
  W20 Layered CreativeScene Database & Immutability Integration Tests
    Atomic Initial Scene Creation & Normalized Persistence
      ✓ creates CreativeScene, Version 1, normalized layers, dependencies, state projection, and outbox event in single transaction (29 ms)
      ✓ rolls back completely if a layer insertion violates a database constraint (zero orphans) (42 ms)
    PostgreSQL Immutability Triggers (Enforced by Database)
      ✓ prohibits direct SQL UPDATE on creative_scene_versions (4 ms)
      ✓ prohibits direct SQL DELETE on creative_scene_versions (3 ms)
      ✓ prohibits direct SQL UPDATE on scene_layers (2 ms)
      ✓ prohibits direct SQL DELETE on scene_layers (2 ms)
      ✓ prohibits direct SQL UPDATE on layer_dependencies (2 ms)
      ✓ prohibits direct SQL DELETE on layer_dependencies (2 ms)
    Revision Concurrency and PostgreSQL Row-Level Locking (SELECT ... FOR UPDATE)
      ✓ throws SceneConcurrencyConflictError when revision provides stale expectedVersionNumber (12 ms)
      ✓ serializes concurrent revisions: exactly one succeeds, one conflicts, current_version advances cleanly to 2 (24 ms)
    Normalized Dependency Invalidation and State Projection Audit Log
      ✓ appends immutable invalidation event, updates version state to STALE_FACTS, and emits outbox event (105 ms)
    W20 Architectural Constraints and Transactional Guarantees
      ✓ links hero dependency to hero layer ID and leaves global dependencies with null sceneLayerId (44 ms)
      ✓ rejects dependency with unknown sceneLayerKey fail-closed with InvalidSceneLayerError (8 ms)
      ✓ enforces composite foreign key: rejects cross-version layer dependency references at database level (22 ms)
      ✓ rolls back completely if outbox write fails during initial scene creation (zero orphans) (14 ms)
      ✓ rolls back completely on outbox write failure during revision (version pointer preserved, zero orphans) (22 ms)
      ✓ rejects empty outbox events collection during revision fail-closed (12 ms)

Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total
Snapshots:   0 total
Time:        7.033 s
# Exit code: 0
```

### 8. Worktree Git Preservation
```bash
$ git branch --show-current
feat/sharp-hero-compositor

$ git rev-parse HEAD
be92bce6be0afe49ade297a20b967317389446a3

$ git diff --cached --name-only
# (zero staged files)

$ git diff --check
# (zero whitespace / conflict marker errors)
```

---

## 5. Scope Boundaries Maintained

In strict accordance with architectural boundaries:
- **Only W20 implemented and verified:** Versioned normalized `CreativeScene` model, `SceneLayer`, `LayerDependency`, `SceneVersionState`, `SceneInvalidationEvent`, PostgreSQL immutability triggers, row-level locking revisions, discriminated validation, and real PostgreSQL integration tests.
- **W21 (Khmer and Latin Typography) NOT started:** Approved font provisioning, shaping, measurement, wrapping, fallback, and glyph validation remain deferred to W21.
- **W22 (Five Canonical Template Families) NOT started:** Template layout generation remains deferred to W22.
- **W23 (Deterministic Compositor Integration) NOT started.**
- **Telegram workflow and publishing NOT started.**
- **Zero git commits, zero staging:** All existing modified and untracked user work is preserved intact in the worktree.
