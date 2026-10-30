import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  BudgetPolicyNotFoundError,
  GetActiveBudgetUseCase,
  GetAiUsageAnalyticsUseCase,
  GetAnalyticsOverviewUseCase,
  GetCampaignAnalyticsUseCase,
  GetContentAnalyticsUseCase,
  GetCreativeAnalyticsUseCase,
  GetPublishingAnalyticsUseCase,
  InsufficientAnalyticsPermissionError,
  ListCostLedgerUseCase,
  ListUnreconciledUsageUseCase,
  ManageBudgetUseCase,
  Permission,
  ReconcileAiUsageUseCase,
  ReservationNotFoundError,
  type SanitizedEmployeeDto,
  type AnalyticsDateRangeQuery,
  type OperationalKpis,
  type ContentAnalytics,
  type CampaignAnalytics,
  type CreativeAnalytics,
  type PublishingAnalytics,
  type AiUsageAnalytics,
  type BudgetUtilizationResult,
  type AiBudgetPolicyRecord,
  type PaginatedCostLedger,
  type UnreconciledUsageRecord,
  type AiUsageRecordData,
} from '@parisian-shopper/application';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { DateRangeQueryDto } from './dto/date-range-query.dto.js';
import { CreateBudgetPolicyDto, UpdateBudgetPolicyDto } from './dto/budget.dto.js';
import { CostLedgerQueryDto } from './dto/cost-ledger-query.dto.js';
import { ReconcileUsageDto } from './dto/reconcile-usage.dto.js';

@ApiTags('Analytics & FinOps')
@ApiCookieAuth('session')
@Controller('v1/analytics')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class AnalyticsController {
  public constructor(
    private readonly overviewUseCase: GetAnalyticsOverviewUseCase,
    private readonly contentAnalyticsUseCase: GetContentAnalyticsUseCase,
    private readonly campaignAnalyticsUseCase: GetCampaignAnalyticsUseCase,
    private readonly creativeAnalyticsUseCase: GetCreativeAnalyticsUseCase,
    private readonly publishingAnalyticsUseCase: GetPublishingAnalyticsUseCase,
    private readonly aiUsageAnalyticsUseCase: GetAiUsageAnalyticsUseCase,
    private readonly activeBudgetUseCase: GetActiveBudgetUseCase,
    private readonly manageBudgetUseCase: ManageBudgetUseCase,
    private readonly listCostLedgerUseCase: ListCostLedgerUseCase,
    private readonly listUnreconciledUsageUseCase: ListUnreconciledUsageUseCase,
    private readonly reconcileAiUsageUseCase: ReconcileAiUsageUseCase,
  ) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Get operational KPIs overview across content, campaigns, creative, and distribution',
  })
  @ApiOkResponse({ description: 'Aggregated operational KPIs' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Requires operational analytics view permission' })
  @RequirePermissions(Permission.VIEW_OPERATIONAL_ANALYTICS)
  public async getOverview(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Query() query: DateRangeQueryDto,
  ): Promise<OperationalKpis> {
    try {
      return await this.overviewUseCase.execute({
        query: this.toDateRangeQuery(query),
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get('content')
  @ApiOperation({ summary: 'Get content production activity and review outcomes' })
  @ApiOkResponse({ description: 'Content production analytics' })
  @RequirePermissions(Permission.VIEW_OPERATIONAL_ANALYTICS)
  public async getContent(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Query() query: DateRangeQueryDto,
  ): Promise<ContentAnalytics> {
    try {
      return await this.contentAnalyticsUseCase.execute({
        query: this.toDateRangeQuery(query),
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'Get marketing campaign status and asset associations' })
  @ApiOkResponse({ description: 'Campaign operations analytics' })
  @RequirePermissions(Permission.VIEW_OPERATIONAL_ANALYTICS)
  public async getCampaigns(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Query() query: DateRangeQueryDto,
  ): Promise<CampaignAnalytics> {
    try {
      return await this.campaignAnalyticsUseCase.execute({
        query: this.toDateRangeQuery(query),
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get('creative')
  @ApiOperation({ summary: 'Get creative studio rendering, approval, and export metrics' })
  @ApiOkResponse({ description: 'Creative operations analytics' })
  @RequirePermissions(Permission.VIEW_OPERATIONAL_ANALYTICS)
  public async getCreative(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Query() query: DateRangeQueryDto,
  ): Promise<CreativeAnalytics> {
    try {
      return await this.creativeAnalyticsUseCase.execute({
        query: this.toDateRangeQuery(query),
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get('publishing')
  @ApiOperation({ summary: 'Get distribution and publishing delivery status metrics' })
  @ApiOkResponse({ description: 'Publishing distribution analytics' })
  @RequirePermissions(Permission.VIEW_OPERATIONAL_ANALYTICS)
  public async getPublishing(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Query() query: DateRangeQueryDto,
  ): Promise<PublishingAnalytics> {
    try {
      return await this.publishingAnalyticsUseCase.execute({
        query: this.toDateRangeQuery(query),
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get('ai-usage')
  @ApiOperation({ summary: 'Get AI token counts, latency, and estimated/confirmed costs' })
  @ApiOkResponse({ description: 'AI provider usage and cost metrics' })
  @RequirePermissions(Permission.VIEW_AI_COSTS)
  public async getAiUsage(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Query() query: DateRangeQueryDto,
  ): Promise<AiUsageAnalytics> {
    try {
      return await this.aiUsageAnalyticsUseCase.execute({
        query: this.toDateRangeQuery(query),
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get('budgets')
  @ApiOperation({ summary: 'Get current monthly budget policy and live utilization' })
  @ApiOkResponse({ description: 'Budget policy and utilization headroom' })
  @RequirePermissions(Permission.VIEW_AI_COSTS)
  public async getBudgetUtilization(
    @CurrentUser() user: SanitizedEmployeeDto,
  ): Promise<BudgetUtilizationResult> {
    try {
      return await this.activeBudgetUseCase.execute({
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('budgets')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new AI budget policy (Admin only)' })
  @RequirePermissions(Permission.MANAGE_AI_BUDGETS)
  public async createBudget(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Body() dto: CreateBudgetPolicyDto,
  ): Promise<AiBudgetPolicyRecord> {
    try {
      const { effectiveFrom, effectiveTo, ...rest } = dto;
      return await this.manageBudgetUseCase.create({
        ...rest,
        ...(effectiveFrom ? { effectiveFrom: new Date(effectiveFrom) } : {}),
        ...(effectiveTo ? { effectiveTo: new Date(effectiveTo) } : {}),
        actorUserId: user.id,
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Patch('budgets/:id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Update an AI budget policy (Admin only)' })
  @RequirePermissions(Permission.MANAGE_AI_BUDGETS)
  public async updateBudget(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Param('id') policyId: string,
    @Body() dto: UpdateBudgetPolicyDto,
  ): Promise<AiBudgetPolicyRecord> {
    try {
      const { effectiveTo, ...rest } = dto;
      return await this.manageBudgetUseCase.update({
        policyId,
        ...rest,
        ...(effectiveTo ? { effectiveTo: new Date(effectiveTo) } : {}),
        actorUserId: user.id,
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get('cost-ledger')
  @ApiOperation({ summary: 'List immutable AI cost ledger items with pagination' })
  @RequirePermissions(Permission.VIEW_AI_COSTS)
  public async getCostLedger(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Query() query: CostLedgerQueryDto,
  ): Promise<PaginatedCostLedger> {
    try {
      return await this.listCostLedgerUseCase.execute({
        query: {
          page: query.page ?? 1,
          limit: query.limit ?? 20,
          ...(query.provider !== undefined ? { provider: query.provider } : {}),
          ...(query.model !== undefined ? { model: query.model } : {}),
          ...(query.startDate ? { startDate: new Date(query.startDate) } : {}),
          ...(query.endDate ? { endDate: new Date(query.endDate) } : {}),
        },
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get('unreconciled')
  @ApiOperation({ summary: 'List unreconciled reservations requiring administrative review' })
  @RequirePermissions(Permission.VIEW_AI_COSTS)
  public async getUnreconciled(
    @CurrentUser() user: SanitizedEmployeeDto,
  ): Promise<readonly UnreconciledUsageRecord[]> {
    try {
      return await this.listUnreconciledUsageUseCase.execute({
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('cost-ledger/:id/reconcile')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manually reconcile an unknown/unreconciled AI usage entry (Admin only)',
  })
  @RequirePermissions(Permission.MANAGE_AI_BUDGETS)
  public async reconcile(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Param('id') recordId: string,
    @Body() dto: ReconcileUsageDto,
  ): Promise<AiUsageRecordData> {
    try {
      return await this.reconcileAiUsageUseCase.execute({
        recordId,
        reservationId: recordId, // maps to reservation ID or record ID
        resolution: dto.resolution,
        ...(dto.confirmedCost !== undefined ? { confirmedCost: dto.confirmedCost } : {}),
        notes: dto.notes,
        actorUserId: user.id,
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  private toDateRangeQuery(query: DateRangeQueryDto): AnalyticsDateRangeQuery {
    return {
      ...(query.startDate ? { startDate: new Date(query.startDate) } : {}),
      ...(query.endDate ? { endDate: new Date(query.endDate) } : {}),
      ...(query.timezone !== undefined ? { timezone: query.timezone } : {}),
    };
  }

  private handleError(error: unknown): never {
    if (error instanceof InsufficientAnalyticsPermissionError) {
      throw new ForbiddenException(error.message);
    }
    if (error instanceof BudgetPolicyNotFoundError || error instanceof ReservationNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (error instanceof Error) {
      throw new BadRequestException(error.message);
    }
    throw new BadRequestException('An unexpected analytics error occurred.');
  }
}
