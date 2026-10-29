import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApproveContentVersionUseCase,
  GetReviewDeskDetailUseCase,
  ListReviewQueueUseCase,
  Permission,
  RejectContentVersionUseCase,
  type SanitizedEmployeeDto,
} from '@parisian-shopper/application';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { ApproveVersionDto } from './dto/approve-version.dto.js';
import { ListReviewQueueQueryDto } from './dto/list-review-queue-query.dto.js';
import { RejectVersionDto } from './dto/reject-version.dto.js';
import {
  type ApprovalDecisionResponseDto,
  type PaginatedReviewQueueResponseDto,
  type ReviewDeskDetailResponseDto,
} from './dto/review-response.dto.js';

@ApiTags('approvals')
@ApiCookieAuth('ps_session')
@Controller({ path: 'approvals', version: '1' })
export class ApprovalsController {
  public constructor(
    private readonly listReviewQueue: ListReviewQueueUseCase,
    private readonly getReviewDeskDetail: GetReviewDeskDetailUseCase,
    private readonly approveContentVersion: ApproveContentVersionUseCase,
    private readonly rejectContentVersion: RejectContentVersionUseCase,
  ) {}

  @Get()
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiOperation({ summary: 'List review queue items with Four-Eyes eligibility calculation' })
  @ApiOkResponse({ description: 'Paginated review queue items' })
  public async getQueue(
    @Query() query: ListReviewQueueQueryDto,
    @CurrentUser() employee: SanitizedEmployeeDto,
  ): Promise<PaginatedReviewQueueResponseDto> {
    const result = await this.listReviewQueue.execute({
      actorUserId: employee.id,
      actorRoles: employee.roles,
      query: {
        ...(query.page !== undefined ? { page: query.page } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        status: query.status ?? 'UNDER_REVIEW',
        ...(query.productSnapshotId ? { productSnapshotId: query.productSnapshotId } : {}),
        ...(query.campaignId ? { campaignId: query.campaignId } : {}),
        ...(query.search ? { search: query.search } : {}),
      },
    });

    return {
      items: result.items.map((item) => {
        const { latestApproval, ...rest } = item;
        return {
          ...rest,
          submittedAt: item.submittedAt.toISOString(),
          ...(latestApproval
            ? {
                latestApproval: {
                  decision: latestApproval.decision,
                  approverUserId: latestApproval.approverUserId,
                  ...(latestApproval.approverDisplayName
                    ? { approverDisplayName: latestApproval.approverDisplayName }
                    : {}),
                  ...(latestApproval.comment ? { comment: latestApproval.comment } : {}),
                  decidedAt: latestApproval.decidedAt.toISOString(),
                },
              }
            : {}),
          isEligibleToApprove: item.isEligibleToApprove ?? false,
          isEligibleToReject: item.isEligibleToReject ?? false,
          ineligibilityReasons: item.ineligibilityReasons ?? [],
        };
      }),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };
  }

  @Get('pending')
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiOperation({ summary: 'List pending review items requiring Four-Eyes approval' })
  @ApiOkResponse({ description: 'Paginated pending review queue' })
  public async getPending(
    @Query() query: ListReviewQueueQueryDto,
    @CurrentUser() employee: SanitizedEmployeeDto,
  ): Promise<PaginatedReviewQueueResponseDto> {
    return this.getQueue({ ...query, status: 'UNDER_REVIEW' }, employee);
  }

  @Get('history')
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiOperation({ summary: 'List historical approval and rejection decisions' })
  @ApiOkResponse({ description: 'Paginated approval decision history' })
  public async getHistory(
    @Query() query: ListReviewQueueQueryDto,
    @CurrentUser() employee: SanitizedEmployeeDto,
  ): Promise<PaginatedReviewQueueResponseDto> {
    return this.getQueue({ ...query, status: 'HISTORY' }, employee);
  }

  @Get(':id')
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiOperation({ summary: 'Get detailed review desk state for a content job' })
  @ApiOkResponse({
    description: 'Full review desk detail including factual checks and eligibility',
  })
  @ApiNotFoundResponse({ description: 'Content job not found' })
  public async getDetail(
    @Param('id') id: string,
    @CurrentUser() employee: SanitizedEmployeeDto,
    @Query('versionId') versionId?: string,
  ): Promise<ReviewDeskDetailResponseDto> {
    const detail = await this.getReviewDeskDetail.execute({
      contentJobId: id,
      ...(versionId !== undefined ? { versionId } : {}),
      actorUserId: employee.id,
      actorRoles: employee.roles,
    });

    return {
      job: {
        id: detail.job.id,
        contentType: detail.job.contentType,
        language: detail.job.language,
        platform: detail.job.platform,
        ...(detail.job.campaignContext ? { campaignContext: detail.job.campaignContext } : {}),
        status: detail.job.status,
        requesterUserId: detail.job.requesterUserId,
        createdAt: detail.job.createdAt.toISOString(),
        updatedAt: detail.job.updatedAt.toISOString(),
      },
      productSnapshot: detail.productSnapshot,
      ...(detail.campaign ? { campaign: detail.campaign } : {}),
      versions: detail.versions.map((v) => ({
        ...v,
        createdAt: v.createdAt.toISOString(),
      })),
      targetVersion: {
        ...detail.targetVersion,
        createdAt: detail.targetVersion.createdAt.toISOString(),
      },
      ...(detail.validationResult ? { validationResult: detail.validationResult } : {}),
      approvalEvents: detail.approvalEvents.map((ev) => ({
        id: ev.id,
        contentJobId: ev.contentJobId,
        contentVersionId: ev.contentVersionId,
        approverUserId: ev.approverUserId,
        ...(ev.approverDisplayName ? { approverDisplayName: ev.approverDisplayName } : {}),
        decision: ev.decision,
        ...(ev.comment ? { comment: ev.comment } : {}),
        createdAt: ev.createdAt.toISOString(),
      })),
      eligibility: detail.eligibility,
    };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
  @RequirePermissions(Permission.APPROVE_CONTENT)
  @ApiOperation({ summary: 'Approve an exact content version under Four-Eyes enforcement' })
  @ApiOkResponse({ description: 'Approval decision recorded' })
  @ApiForbiddenResponse({ description: 'Self-approval prohibited or missing permission' })
  public async approve(
    @Param('id') id: string,
    @Body() dto: ApproveVersionDto,
    @CurrentUser() employee: SanitizedEmployeeDto,
  ): Promise<ApprovalDecisionResponseDto> {
    const event = await this.approveContentVersion.execute({
      contentJobId: id,
      contentVersionId: dto.versionId,
      approverUserId: employee.id,
      approverRoles: employee.roles,
      ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
    });

    return {
      id: event.id,
      contentJobId: event.contentJobId,
      contentVersionId: event.contentVersionId,
      approverUserId: event.approverUserId,
      ...(event.approverDisplayName ? { approverDisplayName: event.approverDisplayName } : {}),
      decision: event.decision,
      ...(event.comment ? { comment: event.comment } : {}),
      createdAt: event.createdAt.toISOString(),
    };
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
  @RequirePermissions(Permission.REJECT_CONTENT)
  @ApiOperation({ summary: 'Reject an exact content version with mandatory reason' })
  @ApiOkResponse({ description: 'Rejection decision recorded' })
  public async reject(
    @Param('id') id: string,
    @Body() dto: RejectVersionDto,
    @CurrentUser() employee: SanitizedEmployeeDto,
  ): Promise<ApprovalDecisionResponseDto> {
    const event = await this.rejectContentVersion.execute({
      contentJobId: id,
      contentVersionId: dto.versionId,
      approverUserId: employee.id,
      approverRoles: employee.roles,
      comment: dto.reason,
    });

    return {
      id: event.id,
      contentJobId: event.contentJobId,
      contentVersionId: event.contentVersionId,
      approverUserId: event.approverUserId,
      ...(event.approverDisplayName ? { approverDisplayName: event.approverDisplayName } : {}),
      decision: event.decision,
      ...(event.comment ? { comment: event.comment } : {}),
      createdAt: event.createdAt.toISOString(),
    };
  }
}
