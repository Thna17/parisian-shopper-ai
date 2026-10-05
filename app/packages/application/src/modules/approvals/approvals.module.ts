import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ApproveContentVersionUseCase } from './application/approve-content-version.use-case.js';
import { GetApprovalStatusQuery } from './application/get-approval-status.query.js';
import { GetContentReviewStateQuery } from './application/get-content-review-state.query.js';
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
  ],
  exports: [
    RequestContentEditUseCase,
    RequestContentRegenerationUseCase,
    ApproveContentVersionUseCase,
    RejectContentVersionUseCase,
    GetContentReviewStateQuery,
    GetApprovalStatusQuery,
  ],
})
export class ApprovalsModule {}
