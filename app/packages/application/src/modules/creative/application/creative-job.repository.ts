import { type ContentPlatform } from '../../content/domain/content.js';
import { type CreativeJobStatus } from '../domain/creative.js';

export const CREATIVE_JOB_REPOSITORY = Symbol('CREATIVE_JOB_REPOSITORY');

export interface CreativeJobRecord {
  readonly id: string;
  readonly contentVersionId: string;
  readonly productSnapshotId: string;
  readonly brandRuleVersionId: string;
  readonly requestedByUserId?: string;
  readonly status: CreativeJobStatus;
  readonly targetPlatform: ContentPlatform;
  readonly aspectRatio: string;
  readonly creativeProfile: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateCreativeJobInput {
  readonly contentVersionId: string;
  readonly productSnapshotId: string;
  readonly brandRuleVersionId: string;
  readonly requestedByUserId?: string;
  readonly targetPlatform?: ContentPlatform;
  readonly aspectRatio?: string;
  readonly creativeProfile?: string;
}

export interface CreativeJobRepository {
  createJob(input: CreateCreativeJobInput): Promise<CreativeJobRecord>;
  findById(id: string): Promise<CreativeJobRecord | null>;
  findByContentVersionId(contentVersionId: string): Promise<readonly CreativeJobRecord[]>;
  transitionStatus(
    id: string,
    expectedCurrent: CreativeJobStatus,
    target: CreativeJobStatus,
  ): Promise<CreativeJobRecord>;
}
