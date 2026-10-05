import { Inject, Injectable } from '@nestjs/common';
import { type ContentReviewState } from '../domain/approval.js';
import { APPROVALS_REPOSITORY, type ApprovalsRepository } from './approvals.repository.js';

@Injectable()
export class GetContentReviewStateQuery {
  public constructor(
    @Inject(APPROVALS_REPOSITORY) private readonly repository: ApprovalsRepository,
  ) {}

  public async execute(contentJobId: string): Promise<ContentReviewState | null> {
    return this.repository.getReviewState(contentJobId);
  }
}
