import { Inject, Injectable } from '@nestjs/common';
import { type ApprovalStatusView } from '../domain/approval.js';
import { APPROVALS_REPOSITORY, type ApprovalsRepository } from './approvals.repository.js';

@Injectable()
export class GetApprovalStatusQuery {
  public constructor(
    @Inject(APPROVALS_REPOSITORY) private readonly repository: ApprovalsRepository,
  ) {}

  public async execute(contentJobId: string): Promise<ApprovalStatusView | null> {
    return this.repository.getApprovalStatus(contentJobId);
  }
}
