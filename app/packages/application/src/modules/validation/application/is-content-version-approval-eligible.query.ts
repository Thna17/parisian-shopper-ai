import { Inject, Injectable } from '@nestjs/common';

import { ValidationStatus } from '../domain/validation.js';
import { VALIDATION_REPOSITORY, type ValidationRepository } from './validation.repository.js';

@Injectable()
export class IsContentVersionApprovalEligibleQuery {
  public constructor(
    @Inject(VALIDATION_REPOSITORY) private readonly results: ValidationRepository,
  ) {}

  public async execute(contentVersionId: string): Promise<boolean> {
    const result = await this.results.findLatestByContentVersion(contentVersionId);
    return (
      result !== null &&
      result.blockingCount === 0 &&
      (result.status === ValidationStatus.PASSED ||
        result.status === ValidationStatus.PASSED_WITH_WARNINGS)
    );
  }
}
