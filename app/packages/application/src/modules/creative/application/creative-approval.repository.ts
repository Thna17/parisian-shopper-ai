import { type CreativeApprovalDecision } from '../domain/creative.js';

export const CREATIVE_APPROVAL_REPOSITORY = Symbol('CREATIVE_APPROVAL_REPOSITORY');

export interface CreativeApprovalEventRecord {
  readonly id: string;
  readonly creativeJobId: string;
  readonly visualAssetId: string;
  readonly sceneVersionId?: string | undefined;
  readonly approverUserId: string;
  readonly approverDisplayName?: string | undefined;
  readonly decision: CreativeApprovalDecision;
  readonly comment?: string | undefined;
  readonly visualValidationResultId?: string | undefined;
  readonly createdAt: Date;
}

export interface RecordCreativeApprovalInput {
  readonly creativeJobId: string;
  readonly visualAssetId: string;
  readonly sceneVersionId?: string | undefined;
  readonly approverUserId: string;
  readonly decision: CreativeApprovalDecision;
  readonly comment?: string | undefined;
  readonly visualValidationResultId?: string | undefined;
}

export interface CreativeApprovalRepository {
  recordApproval(input: RecordCreativeApprovalInput): Promise<CreativeApprovalEventRecord>;
  findByJobId(creativeJobId: string): Promise<readonly CreativeApprovalEventRecord[]>;
  findByAssetId(visualAssetId: string): Promise<readonly CreativeApprovalEventRecord[]>;
  findBySceneVersionId?(sceneVersionId: string): Promise<readonly CreativeApprovalEventRecord[]>;
  findLatestApprovalByJobId?(creativeJobId: string): Promise<CreativeApprovalEventRecord | null>;
}
