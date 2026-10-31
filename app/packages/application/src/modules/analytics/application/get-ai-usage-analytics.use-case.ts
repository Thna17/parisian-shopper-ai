import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '../../auth/domain/permissions.js';
import { InsufficientAnalyticsPermissionError } from '../domain/analytics-errors.js';
import type { AnalyticsDateRangeQuery, AiUsageAnalytics } from '../domain/analytics.types.js';
import { ANALYTICS_REPOSITORY, type AnalyticsRepository } from './analytics.repository.js';

export interface GetAiUsageAnalyticsInput {
  readonly query?: AnalyticsDateRangeQuery;
  readonly permissions: readonly string[];
}

@Injectable()
export class GetAiUsageAnalyticsUseCase {
  public constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly analyticsRepo: AnalyticsRepository,
  ) {}

  public async execute(input: GetAiUsageAnalyticsInput): Promise<AiUsageAnalytics> {
    const hasPermission =
      input.permissions.includes(Permission.VIEW_AI_COSTS) ||
      input.permissions.includes(Permission.VIEW_ALL_CONTENT);

    if (!hasPermission) {
      throw new InsufficientAnalyticsPermissionError(Permission.VIEW_AI_COSTS);
    }

    return this.analyticsRepo.getAiUsageAnalytics(input.query ?? {});
  }
}
