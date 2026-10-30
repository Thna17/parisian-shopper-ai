import { Module } from '@nestjs/common';
import { GetAnalyticsOverviewUseCase } from './application/get-analytics-overview.use-case.js';
import { GetContentAnalyticsUseCase } from './application/get-content-analytics.use-case.js';
import { GetCampaignAnalyticsUseCase } from './application/get-campaign-analytics.use-case.js';
import { GetCreativeAnalyticsUseCase } from './application/get-creative-analytics.use-case.js';
import { GetPublishingAnalyticsUseCase } from './application/get-publishing-analytics.use-case.js';
import { GetAiUsageAnalyticsUseCase } from './application/get-ai-usage-analytics.use-case.js';
import { GetActiveBudgetUseCase } from './application/get-active-budget.use-case.js';
import { ManageBudgetUseCase } from './application/manage-budget.use-case.js';
import { ReserveAiBudgetUseCase } from './application/reserve-ai-budget.use-case.js';
import { SettleAiUsageUseCase } from './application/settle-ai-usage.use-case.js';
import { ListCostLedgerUseCase } from './application/list-cost-ledger.use-case.js';
import { ListUnreconciledUsageUseCase } from './application/list-unreconciled-usage.use-case.js';
import { ReconcileAiUsageUseCase } from './application/reconcile-ai-usage.use-case.js';

@Module({
  providers: [
    GetAnalyticsOverviewUseCase,
    GetContentAnalyticsUseCase,
    GetCampaignAnalyticsUseCase,
    GetCreativeAnalyticsUseCase,
    GetPublishingAnalyticsUseCase,
    GetAiUsageAnalyticsUseCase,
    GetActiveBudgetUseCase,
    ManageBudgetUseCase,
    ReserveAiBudgetUseCase,
    SettleAiUsageUseCase,
    ListCostLedgerUseCase,
    ListUnreconciledUsageUseCase,
    ReconcileAiUsageUseCase,
  ],
  exports: [
    GetAnalyticsOverviewUseCase,
    GetContentAnalyticsUseCase,
    GetCampaignAnalyticsUseCase,
    GetCreativeAnalyticsUseCase,
    GetPublishingAnalyticsUseCase,
    GetAiUsageAnalyticsUseCase,
    GetActiveBudgetUseCase,
    ManageBudgetUseCase,
    ReserveAiBudgetUseCase,
    SettleAiUsageUseCase,
    ListCostLedgerUseCase,
    ListUnreconciledUsageUseCase,
    ReconcileAiUsageUseCase,
  ],
})
export class AnalyticsModule {}
