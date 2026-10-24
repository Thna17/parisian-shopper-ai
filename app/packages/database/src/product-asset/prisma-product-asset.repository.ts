import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  type ProductAsset,
  type ProductAssetApprovalEvent,
  ProductAssetApprovalDecision,
  type ProductAssetRegistration,
  type ProductAssetRepository,
  type ProductAssetRightsEvent,
  ProductAssetRightsState,
  type ProductAssetRole,
  type ProductAssetTransform,
  type ProductAssetValidationAssessment,
  ProductAssetMetadataConflictError,
  selectActiveHeroCutoutCandidate,
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
export class PrismaProductAssetRepository implements ProductAssetRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async saveAsset(asset: ProductAsset): Promise<ProductAsset> {
    const existing = await this.prisma.productAsset.findUnique({
      where: { sha256: asset.sha256.toLowerCase().trim() },
    });

    if (existing) {
      this.verifyImmutableMetadata(existing, asset);
      return mapAsset(existing);
    }

    try {
      const created = await this.prisma.productAsset.create({
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
        const raceExisting = await this.prisma.productAsset.findUniqueOrThrow({
          where: { sha256: asset.sha256.toLowerCase().trim() },
        });
        this.verifyImmutableMetadata(raceExisting, asset);
        return mapAsset(raceExisting);
      }
      throw err;
    }
  }

  public async findAssetById(id: string): Promise<ProductAsset | null> {
    const row = await this.prisma.productAsset.findUnique({
      where: { id },
    });
    return row ? mapAsset(row) : null;
  }

  public async findAssetBySha256(sha256: string): Promise<ProductAsset | null> {
    const row = await this.prisma.productAsset.findUnique({
      where: { sha256: sha256.toLowerCase().trim() },
    });
    return row ? mapAsset(row) : null;
  }

  public async saveRegistration(
    registration: ProductAssetRegistration,
  ): Promise<ProductAssetRegistration> {
    const created = await this.prisma.productAssetRegistration.create({
      data: {
        id: registration.id,
        productAssetId: registration.productAssetId,
        sku: registration.sku,
        productSnapshotId: registration.productSnapshotId ?? null,
        role: registration.role,
        sourceUrl: registration.sourceUrl ?? null,
        sourceSystem: registration.sourceSystem,
        sourceRecordId: registration.sourceRecordId ?? null,
        sourceImageId: registration.sourceImageId ?? null,
        sourceRetrievedAt: registration.sourceRetrievedAt ?? null,
        sourceUrlHash: registration.sourceUrlHash ?? null,
        sourceEtag: registration.sourceEtag ?? null,
        sourceChecksum: registration.sourceChecksum ?? null,
        originSystem: registration.originSystem ?? null,
        correlationId: registration.correlationId ?? null,
        replacesRegistrationId: registration.replacesRegistrationId ?? null,
        rightsState: registration.rightsState,
        rightsNotes: registration.rightsNotes ?? null,
        rightsExpiresAt: registration.rightsExpiresAt ?? null,
        metadata: (registration.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        registeredByUserId: registration.registeredByUserId ?? null,
        registeredAt: registration.registeredAt,
      },
    });

    return mapRegistration(created);
  }

  public async findRegistrationById(id: string): Promise<ProductAssetRegistration | null> {
    const row = await this.prisma.productAssetRegistration.findUnique({
      where: { id },
    });
    return row ? mapRegistration(row) : null;
  }

  public async findRegistrationsBySku(sku: string): Promise<readonly ProductAssetRegistration[]> {
    const rows = await this.prisma.productAssetRegistration.findMany({
      where: { sku },
      orderBy: { sequence: 'desc' },
    });
    return rows.map((r) => mapRegistration(r));
  }

  public async findAllHeroCutoutRegistrations(
    sku: string,
  ): Promise<readonly ProductAssetRegistration[]> {
    const rows = await this.prisma.productAssetRegistration.findMany({
      where: { sku, role: 'HERO_CUTOUT' },
      orderBy: { sequence: 'desc' },
    });
    return rows.map((r) => mapRegistration(r));
  }

  public async findRegistrationsBySkuAndRole(
    sku: string,
    role: ProductAssetRole,
  ): Promise<readonly ProductAssetRegistration[]> {
    const rows = await this.prisma.productAssetRegistration.findMany({
      where: { sku, role },
      orderBy: { sequence: 'desc' },
    });
    return rows.map((r) => mapRegistration(r));
  }

  public async findApprovedHeroCutoutBySku(sku: string): Promise<ProductAssetRegistration | null> {
    const rows = await this.prisma.productAssetRegistration.findMany({
      where: {
        sku,
        role: 'HERO_CUTOUT',
      },
      include: {
        approvalEvents: {
          orderBy: { sequence: 'desc' },
          take: 1,
        },
        rightsEvents: {
          orderBy: { sequence: 'desc' },
          take: 1,
        },
      },
      orderBy: { sequence: 'desc' },
    });

    const items = rows.map((r) => {
      const reg = mapRegistration(r);
      const latestDecision =
        (r.approvalEvents[0]?.decision as ProductAssetApprovalDecision) ??
        ProductAssetApprovalDecision.SUBMITTED;
      const latestRights = r.rightsEvents[0];
      const latestRightsState =
        (latestRights?.rightsState as ProductAssetRightsState) ?? reg.rightsState;
      const expiresAt = latestRights?.expiresAt ?? reg.rightsExpiresAt;
      const effectiveAt = latestRights?.effectiveAt;
      return {
        registration: reg,
        latestDecision,
        latestRightsState,
        expiresAt,
        effectiveAt,
      };
    });

    const candidate = selectActiveHeroCutoutCandidate(items);
    if (!candidate || candidate.latestDecision !== ProductAssetApprovalDecision.APPROVED) {
      return null;
    }

    if (candidate.latestRightsState !== ProductAssetRightsState.VERIFIED) {
      return null;
    }

    const now = new Date();
    if (candidate.effectiveAt && candidate.effectiveAt > now) {
      return null;
    }

    if (candidate.expiresAt && candidate.expiresAt <= now) {
      return null;
    }

    return candidate.registration;
  }

  public async findRegistrationByReplacedId(
    replacesRegistrationId: string,
  ): Promise<ProductAssetRegistration | null> {
    const row = await this.prisma.productAssetRegistration.findFirst({
      where: { replacesRegistrationId },
      orderBy: { sequence: 'desc' },
    });
    return row ? mapRegistration(row) : null;
  }

  public async saveValidationAssessment(
    assessment: ProductAssetValidationAssessment,
  ): Promise<ProductAssetValidationAssessment> {
    return this.prisma.$transaction(async (tx) => {
      // Row lock product_assets row to serialize against concurrent approvals:
      await tx.$executeRaw`SELECT id FROM product_assets WHERE id = ${assessment.productAssetId}::uuid FOR UPDATE`;

      const status = assessment.status ?? (assessment.isValid ? 'PASS' : 'FAIL');
      const created = await tx.productAssetValidationAssessment.create({
        data: {
          id: assessment.id,
          productAssetId: assessment.productAssetId,
          validatorVersion: assessment.validatorVersion,
          status,
          isValid: assessment.isValid,
          format: assessment.format,
          hasAlpha: assessment.hasAlpha,
          transparencyRatio: new Prisma.Decimal(assessment.transparencyRatio),
          width: assessment.width,
          height: assessment.height,
          byteSize: assessment.byteSize,
          pixelCount: assessment.pixelCount,
          findings: [...(assessment.findings ?? [])],
          reasonCodes: [...(assessment.reasonCodes ?? [])],
          assessedAt: assessment.assessedAt,
        },
      });

      return mapValidationAssessment(created);
    });
  }

  public async findLatestValidationAssessment(
    productAssetId: string,
  ): Promise<ProductAssetValidationAssessment | null> {
    const row = await this.prisma.productAssetValidationAssessment.findFirst({
      where: { productAssetId },
      orderBy: { sequence: 'desc' },
    });
    return row ? mapValidationAssessment(row) : null;
  }

  public async saveApprovalEvent(
    event: ProductAssetApprovalEvent,
  ): Promise<ProductAssetApprovalEvent> {
    const created = await this.prisma.productAssetApprovalEvent.create({
      data: {
        id: event.id,
        productAssetRegistrationId: event.productAssetRegistrationId,
        decision: event.decision,
        decidedByUserId: event.decidedByUserId ?? null,
        reason: event.reason ?? null,
        notes: event.notes ?? null,
        validationAssessmentId: event.validationAssessmentId ?? null,
        decidedAt: event.decidedAt,
      },
    });

    return mapApprovalEvent(created);
  }

  public async findApprovalEventsByRegistration(
    registrationId: string,
  ): Promise<readonly ProductAssetApprovalEvent[]> {
    const rows = await this.prisma.productAssetApprovalEvent.findMany({
      where: { productAssetRegistrationId: registrationId },
      orderBy: { sequence: 'desc' },
    });
    return rows.map((r) => mapApprovalEvent(r));
  }

  public async findLatestApprovalEvent(
    registrationId: string,
  ): Promise<ProductAssetApprovalEvent | null> {
    const row = await this.prisma.productAssetApprovalEvent.findFirst({
      where: { productAssetRegistrationId: registrationId },
      orderBy: { sequence: 'desc' },
    });
    return row ? mapApprovalEvent(row) : null;
  }

  public async saveRightsEvent(event: ProductAssetRightsEvent): Promise<ProductAssetRightsEvent> {
    const created = await this.prisma.productAssetRightsEvent.create({
      data: {
        id: event.id,
        productAssetRegistrationId: event.productAssetRegistrationId,
        rightsState: event.rightsState,
        sourceReference: event.sourceReference ?? null,
        permittedScope: event.permittedScope ?? null,
        territory: event.territory ?? null,
        effectiveAt: event.effectiveAt,
        expiresAt: event.expiresAt ?? null,
        verifiedByUserId: event.verifiedByUserId ?? null,
        reason: event.reason ?? null,
        notes: event.notes ?? null,
        createdAt: event.createdAt,
      },
    });

    return mapRightsEvent(created);
  }

  public async findRightsEventsByRegistration(
    registrationId: string,
  ): Promise<readonly ProductAssetRightsEvent[]> {
    const rows = await this.prisma.productAssetRightsEvent.findMany({
      where: { productAssetRegistrationId: registrationId },
      orderBy: { sequence: 'desc' },
    });
    return rows.map((r) => mapRightsEvent(r));
  }

  public async findLatestRightsEvent(
    registrationId: string,
  ): Promise<ProductAssetRightsEvent | null> {
    const row = await this.prisma.productAssetRightsEvent.findFirst({
      where: { productAssetRegistrationId: registrationId },
      orderBy: { sequence: 'desc' },
    });
    return row ? mapRightsEvent(row) : null;
  }

  public async saveTransform(transform: ProductAssetTransform): Promise<ProductAssetTransform> {
    const parametersSha256 =
      transform.parametersSha256 ??
      createHash('sha256')
        .update(JSON.stringify(transform.parameters ?? {}))
        .digest('hex');

    const created = await this.prisma.productAssetTransform.create({
      data: {
        id: transform.id,
        sourceAssetId: transform.sourceAssetId,
        derivedAssetId: transform.derivedAssetId,
        transformType: transform.transformType,
        toolName: transform.toolName ?? 'governed-transform',
        toolVersion: transform.toolVersion ?? '1.0.0',
        parameters: (transform.parameters ?? {}) as Prisma.InputJsonValue,
        parametersSha256,
        validationAssessmentId: transform.validationAssessmentId ?? null,
        appliedByUserId: transform.appliedByUserId ?? null,
        appliedAt: transform.appliedAt,
      },
    });

    return mapTransform(created);
  }

  public async findTransformsByDerivedAsset(
    derivedAssetId: string,
  ): Promise<readonly ProductAssetTransform[]> {
    const rows = await this.prisma.productAssetTransform.findMany({
      where: { derivedAssetId },
      orderBy: { sequence: 'desc' },
    });
    return rows.map((r) => mapTransform(r));
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
}
