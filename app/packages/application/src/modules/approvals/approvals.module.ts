import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ApproveContentVersionUseCase } from './application/approve-content-version.use-case.js';
import { GetApprovalStatusQuery } from './application/get-approval-status.query.js';
import { GetContentReviewStateQuery } from './application/get-content-review-state.query.js';
import { GetReviewDeskDetailUseCase } from './application/get-review-desk-detail.use-case.js';
import { ListReviewQueueUseCase } from './application/list-review-queue.use-case.js';
import { RejectContentVersionUseCase } from './application/reject-content-version.use-case.js';
import { RequestContentEditUseCase } from './application/request-content-edit.use-case.js';
import { RequestContentRegenerationUseCase } from './application/request-content-regeneration.use-case.js';

@Module({
  imports: [AuthModule],
  providers: [
    RequestContentEditUseCase,
    RequestContentRegenerationUseCase,
    ApproveContentVersionUseCase,
    RejectContentVersionUseCase,
    GetContentReviewStateQuery,
    GetApprovalStatusQuery,
    ListReviewQueueUseCase,
    GetReviewDeskDetailUseCase,
  ],
  exports: [
    RequestContentEditUseCase,
    RequestContentRegenerationUseCase,
    ApproveContentVersionUseCase,
    RejectContentVersionUseCase,
    GetContentReviewStateQuery,
    GetApprovalStatusQuery,
    ListReviewQueueUseCase,
    GetReviewDeskDetailUseCase,
  ],
})
export class ApprovalsModule {}
