import { type RevisionRequestStatus } from '../../approvals/domain/approval.js';
import { type CreativeRevisionType } from '../domain/creative.js';

export const CREATIVE_REVISION_REPOSITORY = Symbol('CREATIVE_REVISION_REPOSITORY');

export interface CreativeRevisionRequestRecord {
  readonly id: string;
  readonly creativeJobId: string;
  readonly sourceVisualAssetId: string;
  readonly requestedByUserId: string;
  readonly instruction?: string;
  readonly type: CreativeRevisionType;
  readonly status: RevisionRequestStatus;
  readonly resultingVisualAssetId?: string;
  readonly createdAt: Date;
}

export interface CreateCreativeRevisionInput {
  readonly creativeJobId: string;
  readonly sourceVisualAssetId: string;
  readonly requestedByUserId: string;
  readonly instruction?: string;
  readonly type: CreativeRevisionType;
}

export interface CreativeRevisionRepository {
  createRequest(input: CreateCreativeRevisionInput): Promise<CreativeRevisionRequestRecord>;
  findById(id: string): Promise<CreativeRevisionRequestRecord | null>;
  findActiveByJobId(creativeJobId: string): Promise<CreativeRevisionRequestRecord | null>;
  completeRequest(
    id: string,
    resultingVisualAssetId: string,
  ): Promise<CreativeRevisionRequestRecord>;
  cancelRequest(id: string): Promise<CreativeRevisionRequestRecord>;
}
