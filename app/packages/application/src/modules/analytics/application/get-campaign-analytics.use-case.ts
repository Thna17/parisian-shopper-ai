import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '../../auth/domain/permissions.js';
import { InsufficientAnalyticsPermissionError } from '../domain/analytics-errors.js';
import type { AnalyticsDateRangeQuery, CampaignAnalytics } from '../domain/analytics.types.js';
import { ANALYTICS_REPOSITORY, type AnalyticsRepository } from './analytics.repository.js';

export interface GetCampaignAnalyticsInput {
  readonly query?: AnalyticsDateRangeQuery;
  readonly permissions: readonly string[];
}

@Injectable()
export class GetCampaignAnalyticsUseCase {
  public constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly analyticsRepo: AnalyticsRepository,
  ) {}

  public async execute(input: GetCampaignAnalyticsInput): Promise<CampaignAnalytics> {
    const hasPermission =
      input.permissions.includes(Permission.VIEW_OPERATIONAL_ANALYTICS) ||
      input.permissions.includes(Permission.VIEW_ALL_CONTENT) ||
      input.permissions.includes(Permission.VIEW_OWN_CONTENT);

    if (!hasPermission) {
      throw new InsufficientAnalyticsPermissionError(Permission.VIEW_OPERATIONAL_ANALYTICS);
    }

    return this.analyticsRepo.getCampaignAnalytics(input.query ?? {});
  }
}
