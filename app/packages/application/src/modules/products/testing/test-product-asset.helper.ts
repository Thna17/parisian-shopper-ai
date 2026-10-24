import {
  type AuthenticatedActor,
  type ProductAsset,
  type ProductAssetApprovalEvent,
  ProductAssetApprovalDecision,
  type ProductAssetRegistration,
  type ProductAssetRightsEvent,
  ProductAssetRightsState,
  ProductAssetRole,
  type ProductAssetValidationAssessment,
  ProductAssetValidationStatus,
} from '../domain/product-asset.js';
import { CURRENT_VALIDATOR_VERSION } from '../../creative/domain/services/product-asset-validator.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('test-product-asset helper cannot be used in production environment');
}

export function assertTestOnlyEnvironment(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('test-product-asset helper cannot be used in production environment');
  }
}

export interface CreateTestProductAssetOptions {
  readonly id?: string;
  readonly sha256?: string;
  readonly storageKey?: string;
  readonly mimeType?: string;
  readonly format?: string;
  readonly byteSize?: number;
  readonly width?: number;
  readonly height?: number;
  readonly pixelCount?: number;
  readonly channels?: number;
  readonly hasAlpha?: boolean;
  readonly transparencyRatio?: number;
  readonly createdAt?: Date;
}

export function createTestProductAsset(options?: CreateTestProductAssetOptions): ProductAsset {
  assertTestOnlyEnvironment();
  const width = options?.width ?? 600;
  const height = options?.height ?? 600;
  const sha256 =
    options?.sha256 ?? 'a'.repeat(64);

  return {
    id: options?.id ?? crypto.randomUUID(),
    sha256,
    storageKey: options?.storageKey ?? `cas/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}.png`,
    mimeType: options?.mimeType ?? 'image/png',
    format: options?.format ?? 'png',
    byteSize: options?.byteSize ?? 10240,
    width,
    height,
    pixelCount: options?.pixelCount ?? width * height,
    channels: options?.channels ?? 4,
    hasAlpha: options?.hasAlpha ?? true,
    transparencyRatio: options?.transparencyRatio ?? 0.45,
    createdAt: options?.createdAt ?? new Date(),
  };
}

export interface CreateTestRegistrationOptions {
  readonly id?: string;
  readonly productAssetId: string;
  readonly sku?: string;
  readonly role?: ProductAssetRole;
  readonly sourceSystem?: string;
  readonly sourceRecordId?: string;
  readonly sourceImageId?: string;
  readonly replacesRegistrationId?: string;
  readonly rightsState?: ProductAssetRightsState;
  readonly registeredByUserId?: string;
  readonly registeredAt?: Date;
}

export function createTestRegistration(
  options: CreateTestRegistrationOptions,
): ProductAssetRegistration {
  assertTestOnlyEnvironment();
  return {
    id: options.id ?? crypto.randomUUID(),
    productAssetId: options.productAssetId,
    sku: options.sku ?? 'TEST-SKU-001',
    role: options.role ?? ProductAssetRole.HERO_CUTOUT,
    sourceSystem: options.sourceSystem ?? 'TEST_SUITE',
    sourceRecordId: options.sourceRecordId ?? 'test-rec-1',
    sourceImageId: options.sourceImageId ?? 'test-img-1',
    replacesRegistrationId: options.replacesRegistrationId ?? null,
    rightsState: options.rightsState ?? ProductAssetRightsState.VERIFIED,
    registeredByUserId: options.registeredByUserId ?? 'test-user-admin',
    registeredAt: options.registeredAt ?? new Date(),
  };
}

export function createTestValidationAssessment(
  productAssetId: string,
  overrides?: Partial<ProductAssetValidationAssessment>,
): ProductAssetValidationAssessment {
  assertTestOnlyEnvironment();
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    productAssetId,
    validatorVersion: overrides?.validatorVersion ?? CURRENT_VALIDATOR_VERSION,
    status: overrides?.status ?? ProductAssetValidationStatus.PASS,
    isValid: overrides?.isValid ?? true,
    format: overrides?.format ?? 'png',
    hasAlpha: overrides?.hasAlpha ?? true,
    transparencyRatio: overrides?.transparencyRatio ?? 0.45,
    width: overrides?.width ?? 600,
    height: overrides?.height ?? 600,
    byteSize: overrides?.byteSize ?? 10240,
    pixelCount: overrides?.pixelCount ?? 360000,
    findings: overrides?.findings ?? [],
    reasonCodes: overrides?.reasonCodes ?? [],
    assessedAt: overrides?.assessedAt ?? new Date(),
  };
}

export function createTestApprovalEvent(
  registrationId: string,
  decision: ProductAssetApprovalDecision = ProductAssetApprovalDecision.APPROVED,
  overrides?: Partial<ProductAssetApprovalEvent>,
): ProductAssetApprovalEvent {
  assertTestOnlyEnvironment();
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    productAssetRegistrationId: registrationId,
    decision,
    decidedByUserId: overrides?.decidedByUserId ?? 'test-approver-user',
    reason: overrides?.reason ?? 'TEST_APPROVAL',
    notes: overrides?.notes ?? 'Approved in unit/integration test',
    validationAssessmentId: overrides?.validationAssessmentId ?? null,
    decidedAt: overrides?.decidedAt ?? new Date(),
  };
}

export function createTestRightsEvent(
  registrationId: string,
  rightsState: ProductAssetRightsState = ProductAssetRightsState.VERIFIED,
  overrides?: Partial<ProductAssetRightsEvent>,
): ProductAssetRightsEvent {
  assertTestOnlyEnvironment();
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    productAssetRegistrationId: registrationId,
    rightsState,
    sourceReference: overrides?.sourceReference ?? 'Brand License Agreement 2026',
    permittedScope: overrides?.permittedScope ?? 'MARKETING_ALL',
    territory: overrides?.territory ?? 'GLOBAL',
    effectiveAt: overrides?.effectiveAt ?? new Date(Date.now() - 86400000),
    expiresAt: overrides?.expiresAt ?? new Date(Date.now() + 365 * 86400000),
    verifiedByUserId: overrides?.verifiedByUserId ?? 'test-rights-verifier',
    reason: overrides?.reason ?? 'TEST_RIGHTS_VERIFICATION',
    notes: overrides?.notes ?? 'Verified for testing',
    createdAt: overrides?.createdAt ?? new Date(),
  };
}

export const TEST_ACTOR_APPROVER: AuthenticatedActor = Object.freeze({
  userId: 'user-approver-001',
  roles: ['MARKETING_APPROVER'],
  correlationId: 'test-corr-approver',
});

export const TEST_ACTOR_EDITOR: AuthenticatedActor = Object.freeze({
  userId: 'user-editor-001',
  roles: ['MARKETING_EDITOR'],
  correlationId: 'test-corr-editor',
});

export const TEST_ACTOR_VIEWER: AuthenticatedActor = Object.freeze({
  userId: 'user-viewer-001',
  roles: ['VIEWER'],
  correlationId: 'test-corr-viewer',
});

export const TEST_ACTOR_ADMIN: AuthenticatedActor = Object.freeze({
  userId: 'user-admin-001',
  roles: ['ADMIN'],
  correlationId: 'test-corr-admin',
});
