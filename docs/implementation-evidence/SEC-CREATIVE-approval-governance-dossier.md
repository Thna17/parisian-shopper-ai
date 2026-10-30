# Creative Scene Approval & Four-Eyes Governance — Production Dossier

> **Security & Governance Specification:** `SEC-CREATIVE-01` through `SEC-CREATIVE-20`  
> **Branch:** `feat/creative-approval-governance`  
> **Date:** 2026-10-30  
> **Status:** ✅ All quality gates passed — verified and ready for merge  

---

## 1. Executive Summary

This production dossier details the technical implementation, security controls, and verification evidence for **Creative Scene Approval & Four-Eyes Governance (`SEC-CREATIVE-01` through `SEC-CREATIVE-20`)**.

Following the completion and merge of multi-format export pipeline (W32), the creative studio requires immutable, tamper-resistant governance separating visual generation, scene revision, and publication authority. The core requirements mandate:
1. **Four-Eyes Principle:** Strict prohibition of self-approval by the original creator or any revision author—enforced unconditionally, including for users possessing the `ADMIN` role.
2. **Exact-Scene Version Binding:** Approval events are strictly bound to an immutable `scene_version_id` and `creative_job_id`. Approving version $N$ never authorizes version $N+1$, and approvals on superseded scene versions are rejected.
3. **Multi-Stage Gate Authorization:** Hard visual gates, asset rights verification, and commercial factual consistency must all pass before an approval record can be committed.
4. **Export & Publishing Desk Authorization:** The multi-format export engine and the multi-channel publishing desk strictly require an approved, active scene version with verified cryptographic ledger and approval event binding before rendering or dispatching downstream.

---

## 2. Architecture Overview & Four-Eyes Governance Flow

```
                               ┌────────────────────────────────┐
                               │  Actor requests scene approval  │
                               │  (ApproveCreativeUseCase)      │
                               └───────────────┬────────────────┘
                                               │
                                               ▼
                              ┌──────────────────────────────────┐
                              │  RBAC Check:                      │
                              │  User has APPROVE_CREATIVE perm? │
                              └────────┬─────────────────────────┘
                                       │ Yes
                                       ▼
                     ┌─────────────────────────────────────────────────┐
                     │  FOUR-EYES GOVERNANCE CHECK:                    │
                     │  Is actor the original creator (creativeJob)?    │
                     │  Is actor any revision author (creativeRevision)?│
                     │  *Unconditional — applies even to ADMIN role*   │
                     └─────────────────┬───────────────────────────────┘
                                       │ Independent Reviewer
                                       ▼
                     ┌─────────────────────────────────────────────────┐
                     │  EXACT-SCENE VERSION & STATE BINDING:           │
                     │  - Job is in READY_FOR_REVIEW status?           │
                     │  - Target scene is the CURRENT active version?  │
                     │  - Target visualAssetId matches target scene?   │
                     └─────────────────┬───────────────────────────────┘
                                       │ Valid
                                       ▼
                     ┌─────────────────────────────────────────────────┐
                     │  HARD QUALITY GATES:                            │
                     │  - Visual gates: score >= 0.80, 0 hard failures │
                     │  - Asset rights: LICENSED, not expired          │
                     │  - Commercial validation: factual snapshot hash │
                     └─────────────────┬───────────────────────────────┘
                                       │ All Gates Pass
                                       ▼
                     ┌─────────────────────────────────────────────────┐
                     │  ATOMIC PERSISTENCE:                            │
                     │  - Append immutable CreativeApprovalEvent       │
                     │  - Transition CreativeJob to CREATIVE_APPROVED  │
                     │  - Update CreativeScene approvedVersionId       │
                     └─────────────────┬───────────────────────────────┘
                                       │
                        ┌──────────────┴──────────────┐
                        ▼                             ▼
            ┌───────────────────────┐     ┌───────────────────────┐
            │  Multi-Format Export  │     │  Publishing Desk      │
            │  (ExportPosterUseCase)│     │  (PublicationUseCase) │
            │  - Verifies exact     │     │  - Verifies approved  │
            │    version approval   │     │    export in ledger   │
            └───────────────────────┘     └───────────────────────┘
```

---

## 3. Database Schema & Migration Specification

### Migration: `20261029040000_creative_scene_approval_binding`

The PostgreSQL schema links creative approvals directly to scenes and specific scene versions, preventing version ambiguity:

```prisma
model CreativeApprovalEvent {
  id             String                 @id @default(uuid())
  creativeJobId  String                 @map("creative_job_id")
  sceneId        String?                @map("scene_id")
  sceneVersionId String?                @map("scene_version_id")
  visualAssetId  String?                @map("visual_asset_id")
  decision       CreativeApprovalDecision
  rejectionReason String?               @map("rejection_reason")
  reviewerUserId String                 @map("reviewer_user_id")
  metadataJson   Json?                  @map("metadata_json")
  createdAt      DateTime               @default(now()) @map("created_at")

  creativeJob    CreativeJob            @relation(fields: [creativeJobId], references: [id], onDelete: Cascade)
  scene          CreativeScene?         @relation(fields: [sceneId], references: [id], onDelete: SetNull)
  sceneVersion   CreativeSceneVersion?  @relation(fields: [sceneVersionId], references: [id], onDelete: SetNull)

  @@index([creativeJobId, createdAt])
  @@index([sceneId, sceneVersionId])
  @@index([reviewerUserId])
  @@map("creative_approval_events")
}
```

---

## 4. SEC-CREATIVE-01 through SEC-CREATIVE-20 Requirements Matrix

| ID | Security & Governance Requirement | Implementation Mechanism | Test Assertion | Result |
|---|---|---|---|---|
| **SEC-CREATIVE-01** | Independent approval succeeds when reviewer is independent and all gates pass | `ApproveCreativeUseCase.execute()` checks reviewer identity, evaluates gates, and commits approval record | `creative-approval-security.spec.ts#L104` | ✅ PASSED |
| **SEC-CREATIVE-02** | Original creator self-approval prohibited | Compares `reviewerUserId` against `creativeJob.createdById`; throws `SelfApprovalProhibitedError` | `creative-approval-security.spec.ts#L125` | ✅ PASSED |
| **SEC-CREATIVE-03** | Revision author self-approval prohibited | Queries `creativeRevisionRepo` for all authors of revisions on the scene; throws `SelfApprovalProhibitedError` if reviewer matches | `creative-approval-security.spec.ts#L138` | ✅ PASSED |
| **SEC-CREATIVE-04** | ADMIN role cannot bypass Four-Eyes self-approval | Four-Eyes check evaluates identity before role checks; explicit test verifies ADMIN creator cannot approve | `creative-approval-security.spec.ts#L154` | ✅ PASSED |
| **SEC-CREATIVE-05** | Unauthorized employee without `APPROVE_CREATIVE` permission is denied | Permission validation guard checks actor permissions against `Permission.APPROVE_CREATIVE`; throws `ForbiddenError` | `creative-approval-security.spec.ts#L169` | ✅ PASSED |
| **SEC-CREATIVE-06** | Wrong scene version or asset from different job is denied | Validates asset belongs to `targetJobId` and `sceneVersionId` matches active version | `creative-approval-security.spec.ts#L182` | ✅ PASSED |
| **SEC-CREATIVE-07** | Superseded scene approval is denied when newer revision exists | Verifies `sceneVersion.versionNumber === scene.currentVersionNumber`; throws `ValidationError` if superseded | `creative-approval-security.spec.ts#L198` | ✅ PASSED |
| **SEC-CREATIVE-08** | Blocking visual gate prevents approval | Inspects visual gate score and hard failure count; score `< 0.80` or hard failures block approval | `creative-approval-security.spec.ts#L214` | ✅ PASSED |
| **SEC-CREATIVE-09** | Asset rights failure blocks approval | Evaluates product asset usage rights; non-`LICENSED` or expired assets block approval | `creative-approval-security.spec.ts#L230` | ✅ PASSED |
| **SEC-CREATIVE-10** | Commercial validation failure blocks approval on factual snapshot divergence | Checks product snapshot hash consistency against original content generation snapshot | `creative-approval-security.spec.ts#L247` | ✅ PASSED |
| **SEC-CREATIVE-11** | Duplicate decision prevented if already approved or rejected | Checks existing approval events for scene version; rejects duplicate approval/rejection attempt | `creative-approval-security.spec.ts#L265` | ✅ PASSED |
| **SEC-CREATIVE-12** | Concurrent approval remains atomic and rejects duplicate event | Concurrency control via repository atomic checks prevents parallel race condition approvals | `creative-approval-security.spec.ts#L282` | ✅ PASSED |
| **SEC-CREATIVE-13** | Approval and revision race handled safely via version check | Mid-flight revision increments version, causing concurrent approval of previous version to fail version match | `creative-approval-security.spec.ts#L299` | ✅ PASSED |
| **SEC-CREATIVE-14** | Approved V1 does not authorize V2 export | `ExportPosterUseCase` checks approval record against requested asset version; V1 approval cannot export V2 | `creative-approval-security.spec.ts#L318` | ✅ PASSED |
| **SEC-CREATIVE-15** | Direct status escalation prohibited when job is not in `READY_FOR_REVIEW` | Enforces state machine transition rule: only jobs in `READY_FOR_REVIEW` can transition to `CREATIVE_APPROVED` | `creative-approval-security.spec.ts#L338` | ✅ PASSED |
| **SEC-CREATIVE-16** | Audit history is immutable and captures exact version attribution | Appends append-only event record containing `sceneVersionId`, `reviewerUserId`, timestamp, and metadata | `creative-approval-security.spec.ts#L354` | ✅ PASSED |
| **SEC-CREATIVE-17** | No outbox side effects occur when approval is rejected or fails | Outbox events are only dispatched on confirmed approval commits; failures perform zero outbox writes | `creative-approval-security.spec.ts#L370` | ✅ PASSED |
| **SEC-CREATIVE-18** | Publishing Desk rejects publication of unapproved creative exports | `CreatePublicationUseCase` validates export against approval ledger; unapproved exports are rejected | `creative-approval-security.spec.ts#L389` | ✅ PASSED |
| **SEC-CREATIVE-19** | Private render-cache headers enforce private, no-store caching | Studio preview and export controllers set `Cache-Control: private, no-store, max-age=0` | `creative-approval-security.spec.ts#L407` | ✅ PASSED |
| **SEC-CREATIVE-20** | No external publication occurs upon approval | Creative approval transitions job to `CREATIVE_APPROVED` but does not trigger external distribution | `creative-approval-security.spec.ts#L418` | ✅ PASSED |

---

## 5. Web UI Governance Controls (`WEB-CREATIVE-SEC-01` to `15`)

The web workstation (`apps/web/src/features/creative/`) implements full client-side visual governance mirroring server-side invariants:

1. **State & Version Badge:** Displays exact version number (`v1`, `v2`, etc.) and status banner (`READY_FOR_REVIEW`, `CREATIVE_APPROVED`, `SUPERSEDED`).
2. **Four-Eyes Button Shielding:** The "Approve" button is dynamically disabled with explanatory tooltip ("Four-Eyes Governance: You created or revised this project and cannot approve it") when current user ID matches creator or reviser ID.
3. **Mandatory Rejection Reason:** Rejection modal enforces non-empty feedback string before submit action is enabled.
4. **Visual Findings Inspector:** Displays gate breakdown (composition balance, text legibility, contrast, CTA positioning).
5. **Superseded Scene Lockout:** Reviewing an older scene version hides all action buttons and displays an alert indicating a newer version exists.
6. **Export Activation Gate:** The "Export Poster" button remains locked until a valid approval record is present.

---

## 6. Full Monorepo Quality Gate Verification

All verification commands executed cleanly on branch `feat/creative-approval-governance`:

### 6.1 TypeScript Compilation (`pnpm -C app run typecheck`)
```bash
$ tsc -b --pretty false && pnpm --filter @parisian-shopper/web typecheck
# Result: 0 errors across 7 backend packages and web application
```

### 6.2 ESLint & Boundaries (`pnpm -C app run lint`)
```bash
$ NODE_OPTIONS=--max-old-space-size=4096 eslint . --max-warnings 0 && pnpm boundaries
$ node scripts/check-boundaries.mjs
# Result: 0 errors, 0 warnings across monorepo
# Result: Module boundaries valid
```

### 6.3 Prettier Formatting (`pnpm -C app run format:check`)
```bash
$ prettier --check .
# Result: All matched files use Prettier code style!
```

### 6.4 Test Suites Execution
```
Test Suite                                    | Passed / Total | Status
----------------------------------------------|----------------|-------
creative-approval-security.spec.ts (SEC 1-20) | 20 / 20        | ✅ PASS
export-poster.spec.ts                         | 25 / 25        | ✅ PASS
publishing.use-cases.spec.ts                  | 23 / 23        | ✅ PASS
creative-approval-workflow.test.tsx           | 15 / 15        | ✅ PASS
analytics-dashboard.test.tsx                  | 15 / 15        | ✅ PASS
```

---

## 7. Strict Invariant Status

- **Branch:** `feat/creative-approval-governance`
- **Staged files:** Exactly **0 staged files** (`git diff --cached --stat` reports empty).
- **Working tree:** Clean compilation, 0 lint warnings, all tests passing.
