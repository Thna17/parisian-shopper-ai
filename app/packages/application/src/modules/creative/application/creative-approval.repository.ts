import { type CreativeApprovalDecision } from '../domain/creative.js';

export const CREATIVE_APPROVAL_REPOSITORY = Symbol('CREATIVE_APPROVAL_REPOSITORY');

export interface CreativeApprovalEventRecord {
  readonly id: string;
  readonly creativeJobId: string;
  readonly visualAssetId: string;
  readonly approverUserId: string;
  readonly decision: CreativeApprovalDecision;
  readonly comment?: string;
  readonly visualValidationResultId?: string;
  readonly createdAt: Date;
}

export interface RecordCreativeApprovalInput {
  readonly creativeJobId: string;
  readonly visualAssetId: string;
  readonly approverUserId: string;
  readonly decision: CreativeApprovalDecision;
  readonly comment?: string;
  readonly visualValidationResultId?: string;
}

export interface CreativeApprovalRepository {
  recordApproval(input: RecordCreativeApprovalInput): Promise<CreativeApprovalEventRecord>;
  findByJobId(creativeJobId: string): Promise<readonly CreativeApprovalEventRecord[]>;
  findByAssetId(visualAssetId: string): Promise<readonly CreativeApprovalEventRecord[]>;
}
