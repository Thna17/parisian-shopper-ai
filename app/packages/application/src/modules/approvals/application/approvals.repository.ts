import {
  type ApprovalDecision,
  type ApprovalEventRecord,
  type ApprovalStatusView,
  type ContentReviewState,
  type PendingReviewAction,
  type PendingReviewInteractionRecord,
  type RevisionRequestRecord,
  type RevisionRequestType,
} from '../domain/approval.js';

export const APPROVALS_REPOSITORY = Symbol('APPROVALS_REPOSITORY');

export interface CreateRevisionRequestInput {
  contentJobId: string;
  sourceContentVersionId: string;
  requestedByUserId: string;
  type: RevisionRequestType;
  instruction?: string;
}

export interface CreateApprovalInput {
  contentJobId: string;
  contentVersionId: string;
  approverUserId: string;
  decision: ApprovalDecision;
  comment?: string;
  validationResultId?: string;
}

export interface CreatePendingInteractionInput {
  telegramIdentityId: string;
  contentJobId: string;
  contentVersionId: string;
  action: PendingReviewAction;
  expiresAt: Date;
}

export interface ApprovalsRepository {
  createRevisionRequest(input: CreateRevisionRequestInput): Promise<RevisionRequestRecord>;
  findActiveRevisionRequest(contentJobId: string): Promise<RevisionRequestRecord | null>;
  findRevisionRequestsByJobId(contentJobId: string): Promise<readonly RevisionRequestRecord[]>;
  createApproval(input: CreateApprovalInput): Promise<ApprovalEventRecord>;
  findApprovalEventByJobId(contentJobId: string): Promise<ApprovalEventRecord | null>;
  getReviewState(contentJobId: string): Promise<ContentReviewState | null>;
  getApprovalStatus(contentJobId: string): Promise<ApprovalStatusView | null>;
  createPendingInteraction(
    input: CreatePendingInteractionInput,
  ): Promise<PendingReviewInteractionRecord>;
  findActivePendingInteraction(
    telegramIdentityId: string,
    now: Date,
  ): Promise<PendingReviewInteractionRecord | null>;
  completePendingInteraction(id: string, now: Date): Promise<void>;
  cancelPendingInteraction(id: string, now: Date): Promise<void>;
}
