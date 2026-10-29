import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
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
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  BRAND_RULE_REPOSITORY,
  CONTENT_GENERATION_ENQUEUER,
  CONTENT_GENERATION_REPOSITORY,
  CreateContentJobUseCase,
  GetContentJobDetailUseCase,
  ListContentJobsUseCase,
  Permission,
  ReviseContentUseCase,
  SubmitContentForReviewUseCase,
  VALIDATION_REPOSITORY,
  type BrandRuleRepository,
  type ContentGenerationEnqueuer,
  type ContentGenerationRepository,
  type ContentJob,
  type ContentVersion,
  type GenerationAttempt,
  type PersistedValidationResult,
  type SanitizedEmployeeDto,
  type ValidationRepository,
} from '@parisian-shopper/application';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import {
  type ContentJobDetailResponseDto,
  type ContentJobResponseDto,
  type ContentVersionResponseDto,
  type GenerationAttemptResponseDto,
  type PaginatedContentJobsResponseDto,
  type ValidationResultResponseDto,
} from './dto/content-response.dto.js';
import { CreateContentJobDto } from './dto/create-content-job.dto.js';
import { ListContentJobsQueryDto } from './dto/list-content-jobs-query.dto.js';
import { ManualReviseContentDto } from './dto/manual-revise-content.dto.js';
import { SubmitForReviewDto } from './dto/submit-review.dto.js';

@ApiTags('content')
@ApiCookieAuth('ps_session')
@Controller({ path: 'content', version: '1' })
export class ContentController {
  public constructor(
    private readonly createContentJob: CreateContentJobUseCase,
    private readonly listContentJobs: ListContentJobsUseCase,
    private readonly getContentJobDetail: GetContentJobDetailUseCase,
    private readonly reviseContent: ReviseContentUseCase,
    private readonly submitContentForReview: SubmitContentForReviewUseCase,
    @Inject(CONTENT_GENERATION_REPOSITORY)
    private readonly repository: ContentGenerationRepository,
    @Inject(VALIDATION_REPOSITORY)
    private readonly validationRepository: ValidationRepository,
    @Inject(BRAND_RULE_REPOSITORY)
    private readonly brandRules: BrandRuleRepository,
    @Optional()
    @Inject(CONTENT_GENERATION_ENQUEUER)
    private readonly enqueuer?: ContentGenerationEnqueuer,
  ) {}

  @Post('jobs')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
  @RequirePermissions(Permission.CREATE_CONTENT)
  @ApiOperation({ summary: 'Create a content generation job and enqueue background generation' })
  @ApiResponse({ status: 201, description: 'Content job created and queued' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  public async createJob(
    @Body() dto: CreateContentJobDto,
    @CurrentUser() employee: SanitizedEmployeeDto,
  ): Promise<ContentJobResponseDto> {
    const activeBrandRule = await this.brandRules.findActive();
    if (!activeBrandRule) {
      throw new BadRequestException('No active brand rule version found for generation.');
    }

    const job = await this.createContentJob.execute({
      productSnapshotId: dto.productSnapshotId,
      brandRuleVersionId: activeBrandRule.id,
      requesterUserId: employee.id,
      contentType: dto.contentType,
      language: dto.language,
      platform: dto.platform,
      ...(dto.campaignId ? { campaignId: dto.campaignId } : {}),
      ...(dto.campaignContext ? { campaignContext: dto.campaignContext } : {}),
    });

    if (this.enqueuer) {
      try {
        await this.enqueuer.enqueue(job.id);
      } catch {
        // Enqueue error logged; job remains in REQUESTED status for retry
      }
    }

    return toJobResponse(job);
  }

  @Get('jobs')
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiOperation({ summary: 'List content generation jobs with status and ownership filtering' })
  @ApiOkResponse({ description: 'Paginated list of content jobs' })
  public async listJobs(
    @Query() query: ListContentJobsQueryDto,
    @CurrentUser() employee: SanitizedEmployeeDto,
  ): Promise<PaginatedContentJobsResponseDto> {
    const result = await this.listContentJobs.execute({
      actorUserId: employee.id,
      actorRoles: employee.roles,
      query: {
        page: query.page,
        limit: query.limit,
        status: query.status,
        productSnapshotId: query.productSnapshotId,
        campaignId: query.campaignId,
      },
    });

    return {
      items: result.items.map(toJobResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };
  }

  @Get('jobs/:id')
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiOperation({ summary: 'Get content job detail including attempts, versions, and validation' })
  @ApiOkResponse({ description: 'Content job detail' })
  @ApiNotFoundResponse({ description: 'Content job not found' })
  public async getJobDetail(
    @Param('id') id: string,
    @CurrentUser() employee: SanitizedEmployeeDto,
  ): Promise<ContentJobDetailResponseDto> {
    const detail = await this.getContentJobDetail.execute({
      contentJobId: id,
      actorUserId: employee.id,
      actorRoles: employee.roles,
    });

    return {
      job: toJobResponse(detail.job),
      product: detail.productSnapshot
        ? {
            id: detail.productSnapshot.id,
            sku: detail.productSnapshot.product.product.sku,
            title: detail.productSnapshot.product.product.product_name,
            brand: detail.productSnapshot.product.product.brand,
            priceUsd: Number(detail.productSnapshot.product.product.price) || 0,
            category: detail.productSnapshot.product.product.category,
          }
        : null,
      campaign: detail.campaign
        ? {
            id: detail.campaign.id,
            code: detail.campaign.code,
            name: detail.campaign.name,
            status: detail.campaign.status,
          }
        : null,
      attempts: detail.attempts.map(toAttemptResponse),
      versions: detail.versions.map(toVersionResponse),
      currentVersion: detail.currentVersion ? toVersionResponse(detail.currentVersion) : null,
      latestValidationResult: detail.latestValidationResult
        ? toValidationResultResponse(detail.latestValidationResult)
        : null,
    };
  }

  @Get('jobs/:id/versions')
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiOperation({ summary: 'Get version history for a content job' })
  @ApiOkResponse({ description: 'Array of content versions' })
  public async getJobVersions(
    @Param('id') id: string,
    @CurrentUser() employee: SanitizedEmployeeDto,
  ): Promise<ContentVersionResponseDto[]> {
    const detail = await this.getContentJobDetail.execute({
      contentJobId: id,
      actorUserId: employee.id,
      actorRoles: employee.roles,
    });

    return detail.versions.map(toVersionResponse);
  }

  @Get('versions/:id')
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiOperation({ summary: 'Get single version details and validation findings' })
  @ApiOkResponse({ description: 'Content version and validation' })
  @ApiNotFoundResponse({ description: 'Content version not found' })
  public async getVersion(@Param('id') id: string): Promise<{
    version: ContentVersionResponseDto;
    validationResult: ValidationResultResponseDto | null;
  }> {
    const version = await this.repository.findVersionById(id);
    if (!version) {
      throw new NotFoundException('Content version not found.');
    }

    const validationResult = await this.validationRepository.findLatestByContentVersion(id);

    return {
      version: toVersionResponse(version),
      validationResult: validationResult ? toValidationResultResponse(validationResult) : null,
    };
  }

  @Post('jobs/:id/revise/manual')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
  @RequirePermissions(Permission.EDIT_CONTENT)
  @ApiOperation({ summary: 'Revise copy manually, creating an immutable new content version' })
  @ApiOkResponse({ description: 'New content version and factual validation outcome' })
  public async reviseManual(
    @Param('id') id: string,
    @Body() dto: ManualReviseContentDto,
    @CurrentUser() employee: SanitizedEmployeeDto,
  ): Promise<{
    version: ContentVersionResponseDto;
    validationResult: ValidationResultResponseDto;
  }> {
    const result = await this.reviseContent.editField({
      contentJobId: id,
      contentVersionId: dto.currentVersionId,
      field: dto.field,
      newValue: dto.newValue,
      actorUserId: employee.id,
      actorRoles: employee.roles,
    });

    return {
      version: toVersionResponse(result.version),
      validationResult: toValidationResultResponse(result.validationResult),
    };
  }

  @Post('jobs/:id/submit-for-review')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
  @RequirePermissions(Permission.CREATE_CONTENT)
  @ApiOperation({ summary: 'Submit an eligible content version for four-eyes review' })
  @ApiOkResponse({ description: 'Job transitioned to UNDER_REVIEW' })
  public async submitForReview(
    @Param('id') id: string,
    @Body() dto: SubmitForReviewDto,
    @CurrentUser() employee: SanitizedEmployeeDto,
  ): Promise<ContentJobResponseDto> {
    const result = await this.submitContentForReview.execute({
      contentJobId: id,
      contentVersionId: dto.contentVersionId,
      actorUserId: employee.id,
      actorRoles: employee.roles,
    });

    return toJobResponse(result.job);
  }
}

function toJobResponse(job: ContentJob): ContentJobResponseDto {
  return {
    id: job.id,
    productSnapshotId: job.productSnapshotId,
    brandRuleVersionId: job.brandRuleVersionId,
    requesterUserId: job.requesterUserId,
    campaignId: job.campaignId ?? null,
    contentType: job.contentType,
    language: job.language,
    platform: job.platform,
    campaignContext: job.campaignContext ?? null,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function toAttemptResponse(attempt: GenerationAttempt): GenerationAttemptResponseDto {
  return {
    id: attempt.id,
    contentJobId: attempt.contentJobId,
    attemptNumber: attempt.attemptNumber,
    provider: attempt.provider,
    model: attempt.model,
    promptVersion: attempt.promptVersion,
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    completedAt: attempt.completedAt ? attempt.completedAt.toISOString() : null,
    errorCode: attempt.errorCode ?? null,
  };
}

function toVersionResponse(version: ContentVersion): ContentVersionResponseDto {
  return {
    id: version.id,
    contentJobId: version.contentJobId,
    versionNumber: version.versionNumber,
    provider: version.provider,
    model: version.model,
    promptVersion: version.promptVersion,
    structuredOutput: {
      headline: version.structuredOutput.headline,
      english_caption: version.structuredOutput.english_caption ?? null,
      khmer_caption: version.structuredOutput.khmer_caption ?? null,
      cta: version.structuredOutput.cta,
      hashtags: [...version.structuredOutput.hashtags],
      facts_used: version.structuredOutput.facts_used
        ? [...version.structuredOutput.facts_used]
        : [],
    },
    revisionRequestId: version.revisionRequestId ?? null,
    createdAt: version.createdAt.toISOString(),
  };
}

function toValidationResultResponse(
  result: PersistedValidationResult,
): ValidationResultResponseDto {
  return {
    id: result.id,
    contentVersionId: result.contentVersionId,
    validatorVersion: result.validatorVersion,
    status: result.status,
    findingCount: result.findingCount,
    blockingCount: result.blockingCount,
    warningCount: result.warningCount,
    infoCount: result.infoCount,
    findings: result.findings.map((f) => ({
      id: f.id,
      field: f.field,
      severity: f.severity,
      code: f.code,
      message: f.message,
      expectedValue: f.expectedValue,
      actualValue: f.actualValue,
    })),
    createdAt: result.createdAt.toISOString(),
  };
}
