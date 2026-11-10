import {
  BadRequestException,
  Body,
  Controller,
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
  BUDGET_POLICY_REPOSITORY,
  CancelReservationUseCase,
  Permission,
  ProviderRouterService,
  ReconcileHeldReservationUseCase,
  ReserveBudgetUseCase,
  SettleReservationUseCase,
  USAGE_LEDGER_REPOSITORY,
  type BudgetPolicyRecord,
  type BudgetPolicyRepository,
  type QuotaStatusReport,
  type SanitizedEmployeeDto,
  type UsageLedgerEntryRecord,
  type UsageLedgerRepository,
  type UsageReservationRecord,
} from '@parisian-shopper/application';
import { Inject } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import {
  CreateW50BudgetPolicyDto,
  ReconcileW50HeldReservationDto,
  ReleaseW50ReservationDto,
  ReserveW50BudgetDto,
  RouteCapabilityQueryDto,
  SettleW50ReservationDto,
  UpdateW50BudgetPolicyDto,
} from './dto/budget-routing.dto.js';

@ApiTags('AI Provider Budget & Usage Ledger')
@ApiCookieAuth('session')
@Controller('ai')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class BudgetController {
  public constructor(
    private readonly reserveBudgetUseCase: ReserveBudgetUseCase,
    private readonly settleReservationUseCase: SettleReservationUseCase,
    private readonly cancelReservationUseCase: CancelReservationUseCase,
    private readonly reconcileHeldUseCase: ReconcileHeldReservationUseCase,
    private readonly routerService: ProviderRouterService,
    @Inject(BUDGET_POLICY_REPOSITORY)
    private readonly budgetPolicyRepo: BudgetPolicyRepository,
    @Inject(USAGE_LEDGER_REPOSITORY)
    private readonly usageLedgerRepo: UsageLedgerRepository,
  ) {}

  @Get('budget/active')
  @RequirePermissions(Permission.VIEW_AI_COSTS)
  @ApiOperation({ summary: 'Get active budget policy and current quota utilization' })
  @ApiOkResponse({ description: 'Active policy and quota report' })
  @ApiUnauthorizedResponse({ description: 'Session invalid or expired' })
  @ApiForbiddenResponse({ description: 'Missing VIEW_AI_COSTS permission' })
  public async getActiveBudget(): Promise<{
    readonly policy: BudgetPolicyRecord | null;
    readonly quota: QuotaStatusReport | null;
  }> {
    const policy = await this.budgetPolicyRepo.getActivePolicy();
    if (!policy) {
      return { policy: null, quota: null };
    }

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    );

    const [spentMonth, spentDay, activeExposure] = await Promise.all([
      this.usageLedgerRepo.getAggregateSpend(
        policy.scopeType,
        policy.scopeId,
        monthStart,
        now,
        policy.currency,
      ),
      this.usageLedgerRepo.getAggregateSpend(
        policy.scopeType,
        policy.scopeId,
        dayStart,
        now,
        policy.currency,
      ),
      this.usageLedgerRepo.getActiveReservedExposure(
        policy.scopeType,
        policy.scopeId,
        now,
        policy.currency,
      ),
    ]);

    const totalCommittedMonth = spentMonth + activeExposure;
    const totalCommittedDay = spentDay + activeExposure;
    const remainingMonthlyHeadroom = Math.max(0, policy.monthlyCeiling - totalCommittedMonth);
    const remainingDailyHeadroom = Math.max(0, policy.dailyCeiling - totalCommittedDay);

    const isSoftAlertTriggered =
      policy.monthlyCeiling > 0
        ? totalCommittedMonth / policy.monthlyCeiling >= policy.softAlertThreshold
        : false;

    const quota: QuotaStatusReport = {
      policyId: policy.id,
      policyVersion: policy.version,
      scopeType: policy.scopeType,
      scopeId: policy.scopeId,
      currency: policy.currency,
      monthlyCeiling: policy.monthlyCeiling,
      dailyCeiling: policy.dailyCeiling,
      perOperationMax: policy.perOperationMax,
      softAlertThreshold: policy.softAlertThreshold,
      totalSettledSpendMonth: spentMonth,
      totalSettledSpendDay: spentDay,
      activeReservedExposure: activeExposure,
      remainingMonthlyHeadroom,
      remainingDailyHeadroom,
      isMonthlyCeilingExhausted: remainingMonthlyHeadroom <= 0,
      isDailyCeilingExhausted: remainingDailyHeadroom <= 0,
      isSoftAlertTriggered,
      asOf: now.toISOString(),
    };

    return { policy, quota };
  }

  @Get('budget/policies')
  @RequirePermissions(Permission.VIEW_AI_COSTS)
  @ApiOperation({ summary: 'List all budget policy versions' })
  public async listPolicies(): Promise<readonly BudgetPolicyRecord[]> {
    return this.budgetPolicyRepo.listPolicies();
  }

  @Post('budget/policies')
  @RequirePermissions(Permission.MANAGE_AI_BUDGETS)
  @ApiOperation({ summary: 'Create a new budget policy revision' })
  public async createPolicy(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Body() dto: CreateW50BudgetPolicyDto,
  ): Promise<BudgetPolicyRecord> {
    return this.budgetPolicyRepo.createPolicy({
      ...dto,
      createdById: user.id,
      approvedByUserId: user.id,
    });
  }

  @Patch('budget/policies/:id')
  @RequirePermissions(Permission.MANAGE_AI_BUDGETS)
  @ApiOperation({ summary: 'Update an existing budget policy' })
  public async updatePolicy(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Param('id') id: string,
    @Body() dto: UpdateW50BudgetPolicyDto,
  ): Promise<BudgetPolicyRecord> {
    const existing = await this.budgetPolicyRepo.getPolicyById(id);
    if (!existing) {
      throw new NotFoundException(`Budget policy ${id} not found.`);
    }

    return this.budgetPolicyRepo.updatePolicy(id, {
      ...dto,
      approvedByUserId: user.id,
    });
  }

  @Post('budget/reservations')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_AI_COSTS)
  @ApiOperation({ summary: 'Create an atomic temporary budget hold' })
  public async reserveBudget(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Body() dto: ReserveW50BudgetDto,
  ): Promise<UsageReservationRecord> {
    const result = await this.reserveBudgetUseCase.execute({
      ...dto,
      userId: user.id,
    });
    return result.reservation;
  }

  @Post('budget/reservations/:id/release')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_AI_COSTS)
  @ApiOperation({ summary: 'Release an unused or cancelled reservation hold' })
  public async releaseReservation(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Param('id') id: string,
    @Body() dto: ReleaseW50ReservationDto,
  ): Promise<UsageReservationRecord> {
    const result = await this.cancelReservationUseCase.execute({
      reservationId: id,
      reason: dto.reason,
      actorUserId: user.id,
      isConfirmedZeroCharge: dto.isConfirmedZeroCharge,
    });
    return result.reservation;
  }

  @Post('budget/reservations/:id/settle')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_AI_COSTS)
  @ApiOperation({ summary: 'Settle a completed reservation and post usage to ledger' })
  public async settleReservation(
    @Param('id') id: string,
    @Body() dto: SettleW50ReservationDto,
  ): Promise<UsageLedgerEntryRecord> {
    const result = await this.settleReservationUseCase.execute({
      reservationId: id,
      ...dto,
    });
    return result.ledgerEntry;
  }

  @Get('ledger/entries')
  @RequirePermissions(Permission.VIEW_AI_COSTS)
  @ApiOperation({ summary: 'List immutable usage ledger entries' })
  public async listLedger(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<{
    readonly items: readonly UsageLedgerEntryRecord[];
    readonly total: number;
  }> {
    const parsedLimit = limit ? Number(limit) : 50;
    const parsedOffset = offset ? Number(offset) : 0;
    return this.usageLedgerRepo.listLedgerEntries(parsedLimit, parsedOffset);
  }

  @Get('ledger/unreconciled')
  @RequirePermissions(Permission.VIEW_AI_COSTS)
  @ApiOperation({ summary: 'List reservations held for reconciliation' })
  public async listUnreconciled(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<readonly UsageReservationRecord[]> {
    const parsedLimit = limit ? Number(limit) : 50;
    const parsedOffset = offset ? Number(offset) : 0;
    return this.usageLedgerRepo.listHeldReservations(parsedLimit, parsedOffset);
  }

  @Post('ledger/reconcile/:reservationId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MANAGE_AI_BUDGETS)
  @ApiOperation({ summary: 'Reconcile a held reservation with confirmed charge or zero release' })
  public async reconcileReservation(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Param('reservationId') reservationId: string,
    @Body() dto: ReconcileW50HeldReservationDto,
  ): Promise<UsageLedgerEntryRecord> {
    const result = await this.reconcileHeldUseCase.execute({
      reservationId,
      settlementKey: dto.settlementKey,
      confirmedAmount: dto.confirmedAmount,
      isCharged: dto.isCharged,
      reconciliationRef: dto.reconciliationRef,
      costKnowledge: dto.costKnowledge,
      actorUserId: user.id,
      notes: dto.notes,
    });
    return result.ledgerEntry;
  }

  @Get('router/capabilities')
  @RequirePermissions(Permission.VIEW_AI_COSTS)
  @ApiOperation({ summary: 'Evaluate provider capability routing and cost' })
  public async routeCapability(@Query() query: RouteCapabilityQueryDto): Promise<unknown> {
    try {
      return await this.routerService.selectProvider({
        modality: query.modality,
        capability: query.capability,
        preferredProviderId: query.preferredProviderId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(msg);
    }
  }
}
