import {
  type ProductAsset,
  type ProductAssetApprovalEvent,
  type ProductAssetRegistration,
  type ProductAssetRightsEvent,
  type ProductAssetTransform,
  type ProductAssetValidationAssessment,
} from '../domain/product-asset.js';

export const PRODUCT_ASSET_REGISTRATION_UNIT_OF_WORK = Symbol(
  'PRODUCT_ASSET_REGISTRATION_UNIT_OF_WORK',
);

export interface ProductAssetOutboxDraft {
  readonly topic: string;
  readonly schemaVersion: number;
  readonly idempotencyKey: string;
  readonly aggregateType: string;
  readonly aggregateId?: string | undefined;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: Date;
  readonly availableAt: Date;
}

export interface RegisterAssetTransactionInput {
  readonly asset: ProductAsset;
  readonly registration: ProductAssetRegistration;
  readonly assessment: ProductAssetValidationAssessment;
  readonly rightsEvent?: ProductAssetRightsEvent | undefined;
  readonly initialApprovalEvent?: ProductAssetApprovalEvent | undefined;
  readonly transform?: ProductAssetTransform | undefined;
  readonly outboxEvents?: readonly ProductAssetOutboxDraft[] | undefined;
}

export interface RegisterAssetTransactionResult {
  readonly asset: ProductAsset;
  readonly registration: ProductAssetRegistration;
  readonly assessment: ProductAssetValidationAssessment;
  readonly rightsEvent?: ProductAssetRightsEvent | undefined;
  readonly approvalEvent?: ProductAssetApprovalEvent | undefined;
  readonly transform?: ProductAssetTransform | undefined;
}

export interface ReplaceAssetTransactionInput {
  readonly newAsset: ProductAsset;
  readonly newRegistration: ProductAssetRegistration;
  readonly newAssessment: ProductAssetValidationAssessment;
  readonly newRightsEvent?: ProductAssetRightsEvent | undefined;
  readonly newApprovalEvent?: ProductAssetApprovalEvent | undefined;
  readonly previousRegistrationRetiredEvent?: ProductAssetApprovalEvent | undefined;
  readonly outboxEvents?: readonly ProductAssetOutboxDraft[] | undefined;
}

export interface ReplaceAssetTransactionResult {
  readonly newAsset: ProductAsset;
  readonly newRegistration: ProductAssetRegistration;
  readonly newAssessment: ProductAssetValidationAssessment;
  readonly newRightsEvent?: ProductAssetRightsEvent | undefined;
  readonly newApprovalEvent?: ProductAssetApprovalEvent | undefined;
  readonly previousRegistrationRetiredEvent?: ProductAssetApprovalEvent | undefined;
}

export interface ApprovalEvidenceExpectations {
  readonly productAssetId: string;
  readonly assetSha256: string;
  readonly validationAssessmentId: string;
  readonly validatorVersion: string;
  readonly rightsEventId?: string | null | undefined;
}

export interface ApprovalTransactionInput {
  readonly approvalEvent: ProductAssetApprovalEvent;
  readonly predecessorRetiredEvent?: ProductAssetApprovalEvent | undefined;
  readonly outboxEvents?: readonly ProductAssetOutboxDraft[] | undefined;
  readonly expectedEvidence?: ApprovalEvidenceExpectations | undefined;
}

export interface RightsTransactionInput {
  readonly rightsEvent: ProductAssetRightsEvent;
  readonly outboxEvents?: readonly ProductAssetOutboxDraft[] | undefined;
}

export interface ProductAssetRegistrationUnitOfWork {
  executeRegistration(
    input: RegisterAssetTransactionInput,
  ): Promise<RegisterAssetTransactionResult>;

  executeReplacement(input: ReplaceAssetTransactionInput): Promise<ReplaceAssetTransactionResult>;

  executeApproval(input: ApprovalTransactionInput): Promise<ProductAssetApprovalEvent>;

  executeRights(input: RightsTransactionInput): Promise<ProductAssetRightsEvent>;
}
