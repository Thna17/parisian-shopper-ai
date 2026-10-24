import {
  type ProductAsset,
  type ProductAssetApprovalDecision,
  type ProductAssetApprovalEvent,
  type ProductAssetRegistration,
  type ProductAssetRightsEvent,
  type ProductAssetRightsState,
  type ProductAssetRole,
  type ProductAssetTransform,
  type ProductAssetTransformType,
  type ProductAssetValidationAssessment,
  type ProductAssetValidationStatus,
} from '@parisian-shopper/application';
import { type Prisma } from '@prisma/client';

export function mapAsset(row: {
  id: string;
  sha256: string;
  storageKey: string;
  mimeType: string;
  format: string;
  byteSize: number;
  width: number;
  height: number;
  pixelCount: number;
  channels: number;
  hasAlpha: boolean;
  transparencyRatio: Prisma.Decimal;
  createdAt: Date;
}): ProductAsset {
  return {
    id: row.id,
    sha256: row.sha256.trim(),
    storageKey: row.storageKey,
    mimeType: row.mimeType,
    format: row.format,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    pixelCount: row.pixelCount,
    channels: row.channels,
    hasAlpha: row.hasAlpha,
    transparencyRatio: Number(row.transparencyRatio.toString()),
    createdAt: row.createdAt,
  };
}

export function mapRegistration(row: {
  id: string;
  sequence?: bigint;
  productAssetId: string;
  sku: string;
  productSnapshotId: string | null;
  role: string;
  sourceUrl: string | null;
  sourceSystem: string;
  sourceRecordId?: string | null;
  sourceImageId?: string | null;
  sourceRetrievedAt?: Date | null;
  sourceUrlHash?: string | null;
  sourceEtag?: string | null;
  sourceChecksum?: string | null;
  originSystem?: string | null;
  correlationId?: string | null;
  replacesRegistrationId?: string | null;
  rightsState: string;
  rightsNotes: string | null;
  rightsExpiresAt: Date | null;
  metadata: Prisma.JsonValue | null;
  registeredByUserId: string | null;
  registeredAt: Date;
}): ProductAssetRegistration {
  return {
    id: row.id,
    ...(row.sequence !== undefined ? { sequence: row.sequence } : {}),
    productAssetId: row.productAssetId,
    sku: row.sku,
    productSnapshotId: row.productSnapshotId,
    role: row.role as ProductAssetRole,
    sourceUrl: row.sourceUrl,
    sourceSystem: row.sourceSystem,
    sourceRecordId: row.sourceRecordId ?? null,
    sourceImageId: row.sourceImageId ?? null,
    sourceRetrievedAt: row.sourceRetrievedAt ?? null,
    sourceUrlHash: row.sourceUrlHash ?? null,
    sourceEtag: row.sourceEtag ?? null,
    sourceChecksum: row.sourceChecksum ?? null,
    originSystem: row.originSystem ?? null,
    correlationId: row.correlationId ?? null,
    replacesRegistrationId: row.replacesRegistrationId ?? null,
    rightsState: row.rightsState as ProductAssetRightsState,
    rightsNotes: row.rightsNotes,
    rightsExpiresAt: row.rightsExpiresAt,
    metadata: row.metadata as Record<string, unknown> | null,
    registeredByUserId: row.registeredByUserId,
    registeredAt: row.registeredAt,
  };
}

export function mapValidationAssessment(row: {
  id: string;
  sequence?: bigint;
  productAssetId: string;
  validatorVersion: string;
  status: string;
  isValid: boolean;
  format: string;
  hasAlpha: boolean;
  transparencyRatio: Prisma.Decimal;
  width: number;
  height: number;
  byteSize: number;
  pixelCount: number;
  findings: string[];
  reasonCodes: string[];
  assessedAt: Date;
}): ProductAssetValidationAssessment {
  return {
    id: row.id,
    ...(row.sequence !== undefined ? { sequence: row.sequence } : {}),
    productAssetId: row.productAssetId,
    validatorVersion: row.validatorVersion,
    status: row.status as ProductAssetValidationStatus,
    isValid: row.isValid,
    format: row.format,
    hasAlpha: row.hasAlpha,
    transparencyRatio: Number(row.transparencyRatio.toString()),
    width: row.width,
    height: row.height,
    byteSize: row.byteSize,
    pixelCount: row.pixelCount,
    findings: row.findings,
    reasonCodes: row.reasonCodes,
    assessedAt: row.assessedAt,
  };
}

export function mapApprovalEvent(row: {
  id: string;
  sequence?: bigint;
  productAssetRegistrationId: string;
  decision: string;
  decidedByUserId: string | null;
  reason: string | null;
  notes: string | null;
  validationAssessmentId: string | null;
  decidedAt: Date;
}): ProductAssetApprovalEvent {
  return {
    id: row.id,
    ...(row.sequence !== undefined ? { sequence: row.sequence } : {}),
    productAssetRegistrationId: row.productAssetRegistrationId,
    decision: row.decision as ProductAssetApprovalDecision,
    decidedByUserId: row.decidedByUserId,
    reason: row.reason,
    notes: row.notes,
    validationAssessmentId: row.validationAssessmentId,
    decidedAt: row.decidedAt,
  };
}

export function mapRightsEvent(row: {
  id: string;
  sequence?: bigint;
  productAssetRegistrationId: string;
  rightsState: string;
  sourceReference: string | null;
  permittedScope: string | null;
  territory: string | null;
  effectiveAt: Date;
  expiresAt: Date | null;
  verifiedByUserId: string | null;
  reason: string | null;
  notes: string | null;
  createdAt: Date;
}): ProductAssetRightsEvent {
  return {
    id: row.id,
    ...(row.sequence !== undefined ? { sequence: row.sequence } : {}),
    productAssetRegistrationId: row.productAssetRegistrationId,
    rightsState: row.rightsState as ProductAssetRightsState,
    sourceReference: row.sourceReference,
    permittedScope: row.permittedScope,
    territory: row.territory,
    effectiveAt: row.effectiveAt,
    expiresAt: row.expiresAt,
    verifiedByUserId: row.verifiedByUserId,
    reason: row.reason,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

export function mapTransform(row: {
  id: string;
  sequence?: bigint;
  sourceAssetId: string;
  derivedAssetId: string;
  transformType: string;
  toolName: string;
  toolVersion: string;
  parameters: Prisma.JsonValue;
  parametersSha256: string;
  validationAssessmentId: string | null;
  appliedByUserId: string | null;
  appliedAt: Date;
}): ProductAssetTransform {
  return {
    id: row.id,
    ...(row.sequence !== undefined ? { sequence: row.sequence } : {}),
    sourceAssetId: row.sourceAssetId,
    derivedAssetId: row.derivedAssetId,
    transformType: row.transformType as ProductAssetTransformType,
    toolName: row.toolName,
    toolVersion: row.toolVersion,
    parameters: row.parameters as Record<string, unknown>,
    parametersSha256: row.parametersSha256.trim(),
    validationAssessmentId: row.validationAssessmentId,
    appliedByUserId: row.appliedByUserId,
    appliedAt: row.appliedAt,
  };
}
