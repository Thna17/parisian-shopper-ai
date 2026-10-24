export const ProductAssetRole = {
  ORIGINAL_SOURCE: 'ORIGINAL_SOURCE',
  HERO_CUTOUT: 'HERO_CUTOUT',
  PACKAGING_FRONT: 'PACKAGING_FRONT',
  PACKAGING_BACK: 'PACKAGING_BACK',
  DETAIL: 'DETAIL',
  SWATCH: 'SWATCH',
  MASK: 'MASK',
} as const;

export type ProductAssetRole = (typeof ProductAssetRole)[keyof typeof ProductAssetRole];

export const ProductAssetRightsState = {
  UNKNOWN: 'UNKNOWN',
  VERIFIED: 'VERIFIED',
  RESTRICTED: 'RESTRICTED',
  EXPIRED: 'EXPIRED',
} as const;

export type ProductAssetRightsState =
  (typeof ProductAssetRightsState)[keyof typeof ProductAssetRightsState];

export const ProductAssetApprovalDecision = {
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RETIRED: 'RETIRED',
} as const;

export type ProductAssetApprovalDecision =
  (typeof ProductAssetApprovalDecision)[keyof typeof ProductAssetApprovalDecision];

export const ProductAssetTransformType = {
  BACKGROUND_REMOVAL: 'BACKGROUND_REMOVAL',
  TRIM: 'TRIM',
  RESIZE: 'RESIZE',
  COLOR_CORRECTION: 'COLOR_CORRECTION',
  OPTIMIZATION: 'OPTIMIZATION',
} as const;

export type ProductAssetTransformType =
  (typeof ProductAssetTransformType)[keyof typeof ProductAssetTransformType];

export const ProductAssetValidationStatus = {
  PASS: 'PASS',
  PASS_WITH_WARNINGS: 'PASS_WITH_WARNINGS',
  FAIL: 'FAIL',
} as const;

export type ProductAssetValidationStatus =
  (typeof ProductAssetValidationStatus)[keyof typeof ProductAssetValidationStatus];

export interface AuthenticatedActor {
  readonly userId: string;
  readonly roles: readonly string[];
  readonly correlationId?: string;
}

export interface ProductAsset {
  readonly id: string;
  readonly sha256: string;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly format: string;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly channels: number;
  readonly hasAlpha: boolean;
  readonly transparencyRatio: number;
  readonly createdAt: Date;
}

export interface ProductAssetRegistration {
  readonly id: string;
  readonly sequence?: bigint;
  readonly productAssetId: string;
  readonly sku: string;
  readonly productSnapshotId?: string | null;
  readonly role: ProductAssetRole;
  readonly sourceUrl?: string | null;
  readonly sourceSystem: string;
  readonly sourceRecordId?: string | null;
  readonly sourceImageId?: string | null;
  readonly sourceRetrievedAt?: Date | null;
  readonly sourceUrlHash?: string | null;
  readonly sourceEtag?: string | null;
  readonly sourceChecksum?: string | null;
  readonly originSystem?: string | null;
  readonly correlationId?: string | null;
  readonly replacesRegistrationId?: string | null;
  readonly rightsState: ProductAssetRightsState;
  readonly rightsNotes?: string | null;
  readonly rightsExpiresAt?: Date | null;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
  readonly registeredByUserId?: string | null;
  readonly registeredAt: Date;
}

export interface ProductAssetValidationAssessment {
  readonly id: string;
  readonly sequence?: bigint;
  readonly productAssetId: string;
  readonly validatorVersion: string;
  readonly status: ProductAssetValidationStatus;
  readonly isValid: boolean;
  readonly format: string;
  readonly hasAlpha: boolean;
  readonly transparencyRatio: number;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly pixelCount: number;
  readonly findings: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly assessedAt: Date;
}

export interface ProductAssetApprovalEvent {
  readonly id: string;
  readonly sequence?: bigint;
  readonly productAssetRegistrationId: string;
  readonly decision: ProductAssetApprovalDecision;
  readonly decidedByUserId?: string | null;
  readonly reason?: string | null;
  readonly notes?: string | null;
  readonly validationAssessmentId?: string | null;
  readonly decidedAt: Date;
}

export interface ProductAssetRightsEvent {
  readonly id: string;
  readonly sequence?: bigint;
  readonly productAssetRegistrationId: string;
  readonly rightsState: ProductAssetRightsState;
  readonly sourceReference?: string | null;
  readonly permittedScope?: string | null;
  readonly territory?: string | null;
  readonly effectiveAt: Date;
  readonly expiresAt?: Date | null;
  readonly verifiedByUserId?: string | null;
  readonly reason?: string | null;
  readonly notes?: string | null;
  readonly createdAt: Date;
}

export interface ProductAssetTransform {
  readonly id: string;
  readonly sequence?: bigint;
  readonly sourceAssetId: string;
  readonly derivedAssetId: string;
  readonly transformType: ProductAssetTransformType;
  readonly toolName: string;
  readonly toolVersion: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly parametersSha256: string;
  readonly validationAssessmentId?: string | null;
  readonly appliedByUserId?: string | null;
  readonly appliedAt: Date;
}

export interface CreateProductAssetInput {
  readonly sha256: string;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly format: string;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly channels: number;
  readonly hasAlpha: boolean;
  readonly transparencyRatio: number;
}

export interface RegisterProductAssetInput {
  readonly productAssetId: string;
  readonly sku: string;
  readonly productSnapshotId?: string | null;
  readonly role: ProductAssetRole;
  readonly sourceUrl?: string | null;
  readonly sourceSystem: string;
  readonly sourceRecordId?: string | null;
  readonly sourceImageId?: string | null;
  readonly sourceRetrievedAt?: Date | null;
  readonly sourceUrlHash?: string | null;
  readonly sourceEtag?: string | null;
  readonly sourceChecksum?: string | null;
  readonly originSystem?: string | null;
  readonly correlationId?: string | null;
  readonly replacesRegistrationId?: string | null;
  readonly rightsState?: ProductAssetRightsState;
  readonly rightsNotes?: string | null;
  readonly rightsExpiresAt?: Date | null;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
  readonly registeredByUserId?: string | null;
}
