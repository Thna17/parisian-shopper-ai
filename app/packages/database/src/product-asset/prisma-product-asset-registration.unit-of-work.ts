import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  type ApprovalTransactionInput,
  type ProductAsset,
  type ProductAssetApprovalEvent,
  type ProductAssetRegistrationUnitOfWork,
  type ProductAssetRightsEvent,
  type RegisterAssetTransactionInput,
  type RegisterAssetTransactionResult,
  type ReplaceAssetTransactionInput,
  type ReplaceAssetTransactionResult,
  type RightsTransactionInput,
  ProductAssetApprovalDecision,
  ProductAssetInvalidLifecycleTransitionError,
  ProductAssetInvalidValidatorVersionError,
  ProductAssetMetadataConflictError,
  ProductAssetNotFoundError,
  ProductAssetPredecessorRetiredError,
  ProductAssetRightsUnverifiedError,
  ProductAssetStaleAssessmentError,
  ProductAssetStaleEvidenceError,
} from '@parisian-shopper/application';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import {
  mapAsset,
  mapApprovalEvent,
  mapRegistration,
  mapRightsEvent,
  mapTransform,
  mapValidationAssessment,
} from './product-asset-mappers.js';

@Injectable()
export class PrismaProductAssetRegistrationUnitOfWork implements ProductAssetRegistrationUnitOfWork {
  public constructor(private readonly prisma: PrismaService) {}

  public async executeRegistration(
    input: RegisterAssetTransactionInput,
  ): Promise<RegisterAssetTransactionResult> {
    return this.prisma.$transaction(async (tx) => {
      if (
        input.initialApprovalEvent &&
        input.initialApprovalEvent.decision !== ProductAssetApprovalDecision.SUBMITTED
      ) {
        throw new ProductAssetInvalidLifecycleTransitionError(
          'UNREGISTERED',
          input.initialApprovalEvent.decision,
          'New registrations must enter the governed review flow as SUBMITTED',
        );
      }

      // 1. Insert-or-read ProductAsset
      const asset = await this.saveAssetInTx(tx, input.asset);

      // 2. Insert ProductAssetRegistration
      const createdReg = await tx.productAssetRegistration.create({
        data: {
          id: input.registration.id,
          productAssetId: asset.id,
          sku: input.registration.sku,
          productSnapshotId: input.registration.productSnapshotId ?? null,
          role: input.registration.role,
          sourceUrl: input.registration.sourceUrl ?? null,
          sourceSystem: input.registration.sourceSystem,
          sourceRecordId: input.registration.sourceRecordId ?? null,
          sourceImageId: input.registration.sourceImageId ?? null,
          sourceRetrievedAt: input.registration.sourceRetrievedAt ?? null,
          sourceUrlHash: input.registration.sourceUrlHash ?? null,
          sourceEtag: input.registration.sourceEtag ?? null,
          sourceChecksum: input.registration.sourceChecksum ?? null,
          originSystem: input.registration.originSystem ?? null,
          correlationId: input.registration.correlationId ?? null,
          replacesRegistrationId: input.registration.replacesRegistrationId ?? null,
          rightsState: input.registration.rightsState,
          rightsNotes: input.registration.rightsNotes ?? null,
          rightsExpiresAt: input.registration.rightsExpiresAt ?? null,
          metadata: (input.registration.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          registeredByUserId: input.registration.registeredByUserId ?? null,
          registeredAt: input.registration.registeredAt,
        },
      });
      const registration = mapRegistration(createdReg);

      // 3. Insert ValidationAssessment
      const assessmentStatus =
        input.assessment.status ?? (input.assessment.isValid ? 'PASS' : 'FAIL');
      const createdAssessment = await tx.productAssetValidationAssessment.create({
        data: {
          id: input.assessment.id,
          productAssetId: asset.id,
          validatorVersion: input.assessment.validatorVersion,
          status: assessmentStatus,
          isValid: input.assessment.isValid,
          format: input.assessment.format,
          hasAlpha: input.assessment.hasAlpha,
          transparencyRatio: new Prisma.Decimal(input.assessment.transparencyRatio),
          width: input.assessment.width,
          height: input.assessment.height,
          byteSize: input.assessment.byteSize,
          pixelCount: input.assessment.pixelCount,
          findings: [...(input.assessment.findings ?? [])],
          reasonCodes: [...(input.assessment.reasonCodes ?? [])],
          assessedAt: input.assessment.assessedAt,
        },
      });
      const assessment = mapValidationAssessment(createdAssessment);

      // 4. Insert optional RightsEvent
      let rightsEvent: ProductAssetRightsEvent | undefined;
      if (input.rightsEvent) {
        const createdRights = await tx.productAssetRightsEvent.create({
          data: {
            id: input.rightsEvent.id,
            productAssetRegistrationId: registration.id,
            rightsState: input.rightsEvent.rightsState,
            sourceReference: input.rightsEvent.sourceReference ?? null,
            permittedScope: input.rightsEvent.permittedScope ?? null,
            territory: input.rightsEvent.territory ?? null,
            effectiveAt: input.rightsEvent.effectiveAt,
            expiresAt: input.rightsEvent.expiresAt ?? null,
            verifiedByUserId: input.rightsEvent.verifiedByUserId ?? null,
            reason: input.rightsEvent.reason ?? null,
            notes: input.rightsEvent.notes ?? null,
            createdAt: input.rightsEvent.createdAt,
          },
        });
        rightsEvent = mapRightsEvent(createdRights);
      }

      // 5. Insert optional ApprovalEvent
      let approvalEvent: ProductAssetApprovalEvent | undefined;
      if (input.initialApprovalEvent) {
        const createdApp = await tx.productAssetApprovalEvent.create({
          data: {
            id: input.initialApprovalEvent.id,
            productAssetRegistrationId: registration.id,
            decision: input.initialApprovalEvent.decision,
            decidedByUserId: input.initialApprovalEvent.decidedByUserId ?? null,
            reason: input.initialApprovalEvent.reason ?? null,
            notes: input.initialApprovalEvent.notes ?? null,
            validationAssessmentId: input.initialApprovalEvent.validationAssessmentId ?? null,
            decidedAt: input.initialApprovalEvent.decidedAt,
          },
        });
        approvalEvent = mapApprovalEvent(createdApp);
      }

      // 6. Insert optional Transform
      let transform;
      if (input.transform) {
        const parametersSha256 =
          input.transform.parametersSha256 ??
          createHash('sha256')
            .update(JSON.stringify(input.transform.parameters ?? {}))
            .digest('hex');

        const createdTransform = await tx.productAssetTransform.create({
          data: {
            id: input.transform.id,
            sourceAssetId: input.transform.sourceAssetId,
            derivedAssetId: asset.id,
            transformType: input.transform.transformType,
            toolName: input.transform.toolName ?? 'governed-transform',
            toolVersion: input.transform.toolVersion ?? '1.0.0',
            parameters: (input.transform.parameters ?? {}) as Prisma.InputJsonValue,
            parametersSha256,
            validationAssessmentId: input.transform.validationAssessmentId ?? null,
            appliedByUserId: input.transform.appliedByUserId ?? null,
            appliedAt: input.transform.appliedAt,
          },
        });
        transform = mapTransform(createdTransform);
      }

      // 7. Insert outbox events atomically
      if (input.outboxEvents && input.outboxEvents.length > 0) {
        for (const draft of input.outboxEvents) {
          await tx.outboxEvent.create({
            data: {
              topic: draft.topic,
              schemaVersion: this.parseSchemaVersion(draft.schemaVersion),
              idempotencyKey: draft.idempotencyKey,
              aggregateType: draft.aggregateType,
              aggregateId: draft.aggregateId ?? null,
              payload: draft.payload as Prisma.InputJsonValue,
              occurredAt: draft.occurredAt,
              availableAt: draft.availableAt,
            },
          });
        }
      }

      return {
        asset,
        registration,
        assessment,
        rightsEvent,
        approvalEvent,
        transform,
      };
    });
  }

  public async executeReplacement(
    input: ReplaceAssetTransactionInput,
  ): Promise<ReplaceAssetTransactionResult> {
    return this.prisma.$transaction(async (tx) => {
      if (input.previousRegistrationRetiredEvent) {
        throw new ProductAssetInvalidLifecycleTransitionError(
          'APPROVED',
          ProductAssetApprovalDecision.RETIRED,
          'Replacement submission cannot retire its predecessor; retirement is atomic with dedicated replacement approval',
        );
      }
      if (
        input.newApprovalEvent &&
        input.newApprovalEvent.decision !== ProductAssetApprovalDecision.SUBMITTED
      ) {
        throw new ProductAssetInvalidLifecycleTransitionError(
          'UNREGISTERED',
          input.newApprovalEvent.decision,
          'Replacement registrations must enter the governed review flow as SUBMITTED',
        );
      }

      // 1. Insert-or-read new asset. Predecessor retirement is intentionally
      // excluded from replacement submission and happens only in executeApproval.
      const newAsset = await this.saveAssetInTx(tx, input.newAsset);

      // 2. Insert new registration (with replacesRegistrationId)
      const createdReg = await tx.productAssetRegistration.create({
        data: {
          id: input.newRegistration.id,
          productAssetId: newAsset.id,
          sku: input.newRegistration.sku,
          productSnapshotId: input.newRegistration.productSnapshotId ?? null,
          role: input.newRegistration.role,
          sourceUrl: input.newRegistration.sourceUrl ?? null,
          sourceSystem: input.newRegistration.sourceSystem,
          sourceRecordId: input.newRegistration.sourceRecordId ?? null,
          sourceImageId: input.newRegistration.sourceImageId ?? null,
          sourceRetrievedAt: input.newRegistration.sourceRetrievedAt ?? null,
          sourceUrlHash: input.newRegistration.sourceUrlHash ?? null,
          sourceEtag: input.newRegistration.sourceEtag ?? null,
          sourceChecksum: input.newRegistration.sourceChecksum ?? null,
          originSystem: input.newRegistration.originSystem ?? null,
          correlationId: input.newRegistration.correlationId ?? null,
          replacesRegistrationId: input.newRegistration.replacesRegistrationId ?? null,
          rightsState: input.newRegistration.rightsState,
          rightsNotes: input.newRegistration.rightsNotes ?? null,
          rightsExpiresAt: input.newRegistration.rightsExpiresAt ?? null,
          metadata: (input.newRegistration.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          registeredByUserId: input.newRegistration.registeredByUserId ?? null,
          registeredAt: input.newRegistration.registeredAt,
        },
      });
      const newRegistration = mapRegistration(createdReg);

      // 4. Insert new assessment
      const newAssessmentStatus =
        input.newAssessment.status ?? (input.newAssessment.isValid ? 'PASS' : 'FAIL');
      const createdAssessment = await tx.productAssetValidationAssessment.create({
        data: {
          id: input.newAssessment.id,
          productAssetId: newAsset.id,
          validatorVersion: input.newAssessment.validatorVersion,
          status: newAssessmentStatus,
          isValid: input.newAssessment.isValid,
          format: input.newAssessment.format,
          hasAlpha: input.newAssessment.hasAlpha,
          transparencyRatio: new Prisma.Decimal(input.newAssessment.transparencyRatio),
          width: input.newAssessment.width,
          height: input.newAssessment.height,
          byteSize: input.newAssessment.byteSize,
          pixelCount: input.newAssessment.pixelCount,
          findings: [...(input.newAssessment.findings ?? [])],
          reasonCodes: [...(input.newAssessment.reasonCodes ?? [])],
          assessedAt: input.newAssessment.assessedAt,
        },
      });
      const newAssessment = mapValidationAssessment(createdAssessment);

      // 5. Insert new rights event if present
      let newRightsEvent: ProductAssetRightsEvent | undefined;
      if (input.newRightsEvent) {
        const createdRights = await tx.productAssetRightsEvent.create({
          data: {
            id: input.newRightsEvent.id,
            productAssetRegistrationId: newRegistration.id,
            rightsState: input.newRightsEvent.rightsState,
            sourceReference: input.newRightsEvent.sourceReference ?? null,
            permittedScope: input.newRightsEvent.permittedScope ?? null,
            territory: input.newRightsEvent.territory ?? null,
            effectiveAt: input.newRightsEvent.effectiveAt,
            expiresAt: input.newRightsEvent.expiresAt ?? null,
            verifiedByUserId: input.newRightsEvent.verifiedByUserId ?? null,
            reason: input.newRightsEvent.reason ?? null,
            notes: input.newRightsEvent.notes ?? null,
            createdAt: input.newRightsEvent.createdAt,
          },
        });
        newRightsEvent = mapRightsEvent(createdRights);
      }

      // 6. Insert new approval event if present
      let newApprovalEvent: ProductAssetApprovalEvent | undefined;
      if (input.newApprovalEvent) {
        const createdApp = await tx.productAssetApprovalEvent.create({
          data: {
            id: input.newApprovalEvent.id,
            productAssetRegistrationId: newRegistration.id,
            decision: input.newApprovalEvent.decision,
            decidedByUserId: input.newApprovalEvent.decidedByUserId ?? null,
            reason: input.newApprovalEvent.reason ?? null,
            notes: input.newApprovalEvent.notes ?? null,
            validationAssessmentId: input.newApprovalEvent.validationAssessmentId ?? null,
            decidedAt: input.newApprovalEvent.decidedAt,
          },
        });
        newApprovalEvent = mapApprovalEvent(createdApp);
      }

      // 7. Insert outbox events atomically
      if (input.outboxEvents && input.outboxEvents.length > 0) {
        for (const draft of input.outboxEvents) {
          await tx.outboxEvent.create({
            data: {
              topic: draft.topic,
              schemaVersion: this.parseSchemaVersion(draft.schemaVersion),
              idempotencyKey: draft.idempotencyKey,
              aggregateType: draft.aggregateType,
              aggregateId: draft.aggregateId ?? null,
              payload: draft.payload as Prisma.InputJsonValue,
              occurredAt: draft.occurredAt,
              availableAt: draft.availableAt,
            },
          });
        }
      }

      return {
        newAsset,
        newRegistration,
        newAssessment,
        newRightsEvent,
        newApprovalEvent,
        previousRegistrationRetiredEvent: undefined,
      };
    });
  }

  public async executeApproval(
    input: ApprovalTransactionInput,
  ): Promise<ProductAssetApprovalEvent> {
    return this.prisma.$transaction(async (tx) => {
      const regId = input.approvalEvent.productAssetRegistrationId;
      const predId = input.predecessorRetiredEvent?.productAssetRegistrationId;

      // Deterministic row locking order to prevent deadlocks:
      const idsToLock = [regId, ...(predId ? [predId] : [])].sort();
      for (const id of idsToLock) {
        await tx.$executeRaw`SELECT id FROM product_asset_registrations WHERE id = ${id}::uuid FOR UPDATE`;
      }

      // Check registration row existence
      const targetRegistrationRow = await tx.productAssetRegistration.findUnique({
        where: { id: regId },
      });
      if (!targetRegistrationRow) {
        throw new ProductAssetNotFoundError(regId, { operation: 'executeApproval' });
      }

      // Row lock the product_assets row for the target asset
      await tx.$executeRaw`SELECT id FROM product_assets WHERE id = ${targetRegistrationRow.productAssetId}::uuid FOR UPDATE`;

      // Check current approval decision inside lock:
      const priorEvents = await tx.productAssetApprovalEvent.findMany({
        where: { productAssetRegistrationId: regId },
        orderBy: { sequence: 'desc' },
        take: 1,
      });
      const currentDecision = priorEvents[0]?.decision ?? ProductAssetApprovalDecision.SUBMITTED;

      // Idempotency check: if identical decision has already been committed, return it
      if (currentDecision === input.approvalEvent.decision) {
        return mapApprovalEvent(priorEvents[0]!);
      }

      // Verify valid lifecycle transition inside transaction:
      const isValidTransition =
        (currentDecision === ProductAssetApprovalDecision.SUBMITTED &&
          (input.approvalEvent.decision === ProductAssetApprovalDecision.APPROVED ||
            input.approvalEvent.decision === ProductAssetApprovalDecision.REJECTED)) ||
        (currentDecision === ProductAssetApprovalDecision.APPROVED &&
          input.approvalEvent.decision === ProductAssetApprovalDecision.RETIRED);

      if (!isValidTransition) {
        throw new ProductAssetInvalidLifecycleTransitionError(
          currentDecision,
          input.approvalEvent.decision,
        );
      }

      // An approval without the exact evidence observed by the application layer
      // would turn this transaction into a fail-open bypass. Reject it before any
      // retirement, approval, or outbox write can occur.
      if (
        input.approvalEvent.decision === ProductAssetApprovalDecision.APPROVED &&
        !input.expectedEvidence
      ) {
        throw new ProductAssetStaleEvidenceError(
          'expectedEvidence',
          'APPROVED transitions require an exact asset, assessment, validator, and rights evidence snapshot',
        );
      }

      // Recheck evidence inside transaction if approving:
      if (
        input.approvalEvent.decision === ProductAssetApprovalDecision.APPROVED &&
        input.expectedEvidence
      ) {
        const expected = input.expectedEvidence;

        // 1. Target registration must reference expected productAssetId
        if (targetRegistrationRow.productAssetId !== expected.productAssetId) {
          throw new ProductAssetStaleEvidenceError(
            'productAssetId',
            `Registration references asset "${targetRegistrationRow.productAssetId}", expected "${expected.productAssetId}"`,
          );
        }

        // 2. Underlying asset sha256 check
        const assetRow = await tx.productAsset.findUnique({
          where: { id: targetRegistrationRow.productAssetId },
        });
        if (!assetRow || assetRow.sha256.toLowerCase() !== expected.assetSha256.toLowerCase()) {
          throw new ProductAssetStaleEvidenceError(
            'assetSha256',
            `Asset sha256 mismatch or asset missing: expected "${expected.assetSha256}", actual "${assetRow?.sha256 ?? 'missing'}"`,
          );
        }

        // 3. Latest validation assessment check under lock
        const latestAssessments = await tx.productAssetValidationAssessment.findMany({
          where: { productAssetId: targetRegistrationRow.productAssetId },
          orderBy: { sequence: 'desc' },
          take: 1,
        });
        const latestAssessment = latestAssessments[0];
        if (!latestAssessment) {
          throw new ProductAssetStaleEvidenceError(
            'validationAssessment',
            'No validation assessment found for asset under lock',
          );
        }

        if (latestAssessment.id !== expected.validationAssessmentId) {
          throw new ProductAssetStaleAssessmentError(
            expected.validationAssessmentId,
            latestAssessment.id,
          );
        }

        if (
          !latestAssessment.isValid ||
          (latestAssessment.status !== 'PASS' && latestAssessment.status !== 'PASS_WITH_WARNINGS')
        ) {
          throw new ProductAssetStaleEvidenceError(
            'validationAssessment',
            `Latest assessment ${latestAssessment.id} status is "${latestAssessment.status}", isValid=${latestAssessment.isValid}`,
          );
        }

        if (latestAssessment.validatorVersion !== expected.validatorVersion) {
          throw new ProductAssetInvalidValidatorVersionError(
            expected.validatorVersion,
            latestAssessment.validatorVersion,
          );
        }

        // 4. Latest rights event check under lock
        const latestRightsEvents = await tx.productAssetRightsEvent.findMany({
          where: { productAssetRegistrationId: regId },
          orderBy: { sequence: 'desc' },
          take: 1,
        });
        const latestRights = latestRightsEvents[0];
        const effectiveRightsState = latestRights?.rightsState ?? targetRegistrationRow.rightsState;
        const effectiveExpiresAt = latestRights?.expiresAt ?? targetRegistrationRow.rightsExpiresAt;

        if (expected.rightsEventId) {
          if (!latestRights || latestRights.id !== expected.rightsEventId) {
            throw new ProductAssetStaleEvidenceError(
              'rightsEventId',
              `Expected rights event "${expected.rightsEventId}", but latest rights event is "${latestRights?.id ?? 'none'}"`,
            );
          }
        }

        if (effectiveRightsState !== 'VERIFIED') {
          throw new ProductAssetRightsUnverifiedError(
            targetRegistrationRow.sku,
            effectiveRightsState,
          );
        }

        // Use the time of the locked transactional recheck. The caller's earlier
        // observation time must not extend rights that expired while waiting for
        // this transaction to acquire its locks.
        const effectiveNow = new Date();
        if (latestRights && latestRights.effectiveAt > effectiveNow) {
          throw new ProductAssetRightsUnverifiedError(
            targetRegistrationRow.sku,
            'NOT_YET_EFFECTIVE',
          );
        }
        if (effectiveExpiresAt && effectiveExpiresAt <= effectiveNow) {
          throw new ProductAssetRightsUnverifiedError(targetRegistrationRow.sku, 'EXPIRED');
        }
      }

      // If predecessor retirement is requested on replacement activation:
      if (input.predecessorRetiredEvent) {
        const predEvents = await tx.productAssetApprovalEvent.findMany({
          where: { productAssetRegistrationId: predId! },
          orderBy: { sequence: 'desc' },
          take: 1,
        });
        const predDecision = predEvents[0]?.decision;
        if (predDecision !== ProductAssetApprovalDecision.APPROVED) {
          throw new ProductAssetPredecessorRetiredError(
            predId!,
            `Predecessor is in state "${predDecision ?? 'NONE'}", expected "APPROVED"`,
          );
        }

        // Verify no competing approved replacement for this predecessor:
        const competingApproved = await tx.productAssetRegistration.findFirst({
          where: {
            replacesRegistrationId: predId!,
            id: { not: regId },
            approvalEvents: {
              some: { decision: ProductAssetApprovalDecision.APPROVED },
            },
          },
        });
        if (competingApproved) {
          throw new ProductAssetPredecessorRetiredError(
            predId!,
            `Another replacement ${competingApproved.id} is already approved for predecessor`,
          );
        }

        // Create predecessor retirement event
        await tx.productAssetApprovalEvent.create({
          data: {
            id: input.predecessorRetiredEvent.id,
            productAssetRegistrationId: predId!,
            decision: ProductAssetApprovalDecision.RETIRED,
            decidedByUserId: input.predecessorRetiredEvent.decidedByUserId ?? null,
            reason: input.predecessorRetiredEvent.reason ?? null,
            notes: input.predecessorRetiredEvent.notes ?? null,
            validationAssessmentId: input.predecessorRetiredEvent.validationAssessmentId ?? null,
            decidedAt: input.predecessorRetiredEvent.decidedAt,
          },
        });
      }

      // Create new approval event
      const createdApp = await tx.productAssetApprovalEvent.create({
        data: {
          id: input.approvalEvent.id,
          productAssetRegistrationId: input.approvalEvent.productAssetRegistrationId,
          decision: input.approvalEvent.decision,
          decidedByUserId: input.approvalEvent.decidedByUserId ?? null,
          reason: input.approvalEvent.reason ?? null,
          notes: input.approvalEvent.notes ?? null,
          validationAssessmentId: input.approvalEvent.validationAssessmentId ?? null,
          decidedAt: input.approvalEvent.decidedAt,
        },
      });

      if (input.outboxEvents && input.outboxEvents.length > 0) {
        for (const draft of input.outboxEvents) {
          await tx.outboxEvent.create({
            data: {
              topic: draft.topic,
              schemaVersion: this.parseSchemaVersion(draft.schemaVersion),
              idempotencyKey: draft.idempotencyKey,
              aggregateType: draft.aggregateType,
              aggregateId: draft.aggregateId ?? null,
              payload: draft.payload as Prisma.InputJsonValue,
              occurredAt: draft.occurredAt,
              availableAt: draft.availableAt,
            },
          });
        }
      }

      return mapApprovalEvent(createdApp);
    });
  }

  public async executeRights(input: RightsTransactionInput): Promise<ProductAssetRightsEvent> {
    return this.prisma.$transaction(async (tx) => {
      // Row lock target registration to serialize against concurrent approvals:
      await tx.$executeRaw`SELECT id FROM product_asset_registrations WHERE id = ${input.rightsEvent.productAssetRegistrationId}::uuid FOR UPDATE`;

      const createdRights = await tx.productAssetRightsEvent.create({
        data: {
          id: input.rightsEvent.id,
          productAssetRegistrationId: input.rightsEvent.productAssetRegistrationId,
          rightsState: input.rightsEvent.rightsState,
          sourceReference: input.rightsEvent.sourceReference ?? null,
          permittedScope: input.rightsEvent.permittedScope ?? null,
          territory: input.rightsEvent.territory ?? null,
          effectiveAt: input.rightsEvent.effectiveAt,
          expiresAt: input.rightsEvent.expiresAt ?? null,
          verifiedByUserId: input.rightsEvent.verifiedByUserId ?? null,
          reason: input.rightsEvent.reason ?? null,
          notes: input.rightsEvent.notes ?? null,
          createdAt: input.rightsEvent.createdAt,
        },
      });

      if (input.outboxEvents && input.outboxEvents.length > 0) {
        for (const draft of input.outboxEvents) {
          await tx.outboxEvent.create({
            data: {
              topic: draft.topic,
              schemaVersion: this.parseSchemaVersion(draft.schemaVersion),
              idempotencyKey: draft.idempotencyKey,
              aggregateType: draft.aggregateType,
              aggregateId: draft.aggregateId ?? null,
              payload: draft.payload as Prisma.InputJsonValue,
              occurredAt: draft.occurredAt,
              availableAt: draft.availableAt,
            },
          });
        }
      }

      return mapRightsEvent(createdRights);
    });
  }

  private async saveAssetInTx(
    tx: Prisma.TransactionClient,
    asset: ProductAsset,
  ): Promise<ProductAsset> {
    const existing = await tx.productAsset.findUnique({
      where: { sha256: asset.sha256.toLowerCase().trim() },
    });

    if (existing) {
      this.verifyImmutableMetadata(existing, asset);
      return mapAsset(existing);
    }

    try {
      const created = await tx.productAsset.create({
        data: {
          id: asset.id,
          sha256: asset.sha256.toLowerCase().trim(),
          storageKey: asset.storageKey,
          mimeType: asset.mimeType,
          format: asset.format,
          byteSize: asset.byteSize,
          width: asset.width,
          height: asset.height,
          pixelCount: asset.pixelCount,
          channels: asset.channels,
          hasAlpha: asset.hasAlpha,
          transparencyRatio: new Prisma.Decimal(asset.transparencyRatio),
          createdAt: asset.createdAt,
        },
      });
      return mapAsset(created);
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raceExisting = await tx.productAsset.findUniqueOrThrow({
          where: { sha256: asset.sha256.toLowerCase().trim() },
        });
        this.verifyImmutableMetadata(raceExisting, asset);
        return mapAsset(raceExisting);
      }
      throw err;
    }
  }

  private verifyImmutableMetadata(
    existing: {
      byteSize: number;
      width: number;
      height: number;
      format: string;
      mimeType: string;
    },
    incoming: ProductAsset,
  ): void {
    if (existing.byteSize !== incoming.byteSize) {
      throw new ProductAssetMetadataConflictError(
        incoming.sha256,
        'byteSize',
        existing.byteSize,
        incoming.byteSize,
      );
    }
    if (existing.width !== incoming.width) {
      throw new ProductAssetMetadataConflictError(
        incoming.sha256,
        'width',
        existing.width,
        incoming.width,
      );
    }
    if (existing.height !== incoming.height) {
      throw new ProductAssetMetadataConflictError(
        incoming.sha256,
        'height',
        existing.height,
        incoming.height,
      );
    }
    if (existing.format !== incoming.format) {
      throw new ProductAssetMetadataConflictError(
        incoming.sha256,
        'format',
        existing.format,
        incoming.format,
      );
    }
    if (existing.mimeType !== incoming.mimeType) {
      throw new ProductAssetMetadataConflictError(
        incoming.sha256,
        'mimeType',
        existing.mimeType,
        incoming.mimeType,
      );
    }
  }

  private parseSchemaVersion(version: unknown): number {
    if (typeof version === 'number') return Math.floor(version);
    if (typeof version === 'string') {
      const parsed = parseInt(version, 10);
      return Number.isNaN(parsed) ? 1 : parsed;
    }
    return 1;
  }
}
