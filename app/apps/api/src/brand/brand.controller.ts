import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ActivateBrandProfileUseCase,
  AssembleBrandBriefUseCase,
  BRAND_DATASET_REPOSITORY,
  BrandDatasetNotFoundError,
  BrandProfileNotFoundError,
  CreateBrandProfileDraftUseCase,
  CurateBrandDatasetUseCase,
  DuplicateBrandDatasetVersionError,
  DuplicateBrandProfileError,
  EmptyFeedbackBatchError,
  EvaluateCandidateOriginalityUseCase,
  GetActiveBrandProfileUseCase,
  IngestBrandSourceUseCase,
  IngestReviewFeedbackUseCase,
  InsufficientBrandPermissionError,
  InvalidBrandProfileStateTransitionError,
  InvalidFeedbackRecordError,
  ListBrandProfilesUseCase,
  Permission,
  RegurgitationViolationError,
  RollbackBrandProfileUseCase,
  RunBrandBenchmarkUseCase,
  UnlicensedAssetIngestionError,
  type BenchmarkEvaluationReport,
  type BrandBrief,
  type BrandDatasetRepository,
  type BrandDatasetVersionRecord,
  type BrandProfileVersionRecord,
  type BrandSourceArchiveRecord,
  type FeedbackIngestionSummary,
  type OriginalityReport,
  type ReviewFeedbackRecord,
  type RollbackBrandProfileResult,
  type SanitizedEmployeeDto,
} from '@parisian-shopper/application';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { CreateBrandProfileDto } from './dto/create-brand-profile.dto.js';
import { IngestBrandSourceDto } from './dto/ingest-brand-source.dto.js';
import { RollbackBrandProfileDto } from './dto/rollback-brand-profile.dto.js';
import { EvaluateOriginalityDto } from './dto/evaluate-originality.dto.js';
import { RunBenchmarkDto } from './dto/run-benchmark.dto.js';
import { IngestFeedbackDto } from './dto/ingest-feedback.dto.js';
import { CreateBrandDatasetDto } from './dto/create-brand-dataset.dto.js';

@ApiTags('Brand Intelligence & Governance')
@ApiCookieAuth('session')
@Controller('v1/brand')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class BrandController {
  public constructor(
    private readonly getActiveProfileUseCase: GetActiveBrandProfileUseCase,
    private readonly listProfilesUseCase: ListBrandProfilesUseCase,
    private readonly createDraftUseCase: CreateBrandProfileDraftUseCase,
    private readonly activateProfileUseCase: ActivateBrandProfileUseCase,
    private readonly rollbackProfileUseCase: RollbackBrandProfileUseCase,
    private readonly ingestSourceUseCase: IngestBrandSourceUseCase,
    private readonly evaluateOriginalityUseCase: EvaluateCandidateOriginalityUseCase,
    private readonly assembleBrandBriefUseCase: AssembleBrandBriefUseCase,
    private readonly runBrandBenchmarkUseCase: RunBrandBenchmarkUseCase,
    private readonly ingestReviewFeedbackUseCase: IngestReviewFeedbackUseCase,
    private readonly curateBrandDatasetUseCase: CurateBrandDatasetUseCase,
    @Inject(BRAND_DATASET_REPOSITORY)
    private readonly brandDatasetRepo: BrandDatasetRepository,
  ) {}

  @Get('profiles/active')
  @ApiOperation({ summary: 'Get currently active and authoritative BrandProfileVersion' })
  @ApiOkResponse({ description: 'Active brand profile record or null if unconfigured' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  public async getActive(): Promise<BrandProfileVersionRecord | null> {
    return this.getActiveProfileUseCase.execute();
  }

  @Get('profiles')
  @ApiOperation({ summary: 'List all historical and drafted BrandProfileVersions' })
  @ApiOkResponse({ description: 'List of brand profile records' })
  public async listProfiles(): Promise<readonly BrandProfileVersionRecord[]> {
    return this.listProfilesUseCase.execute();
  }

  @Post('profiles')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new BrandProfileVersion in DRAFT status (Admin only)' })
  @RequirePermissions(Permission.ADMIN)
  public async createProfile(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Body() dto: CreateBrandProfileDto,
  ): Promise<BrandProfileVersionRecord> {
    try {
      return await this.createDraftUseCase.execute({
        name: dto.name,
        evaluationPolicyId: dto.evaluationPolicyId,
        languagePolicy: dto.languagePolicy,
        toneRules: dto.toneRules,
        visualAestheticRules: dto.visualAestheticRules,
        typographyRules: dto.typographyRules,
        logoRules: dto.logoRules,
        approvedExampleIds: dto.approvedExampleIds,
        prohibitedPatterns: dto.prohibitedPatterns,
        approvedByUserId: user.id,
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('profiles/:id/activate')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Atomically activate BrandProfileVersion, retiring prior active (Admin only)',
  })
  @RequirePermissions(Permission.ADMIN)
  public async activateProfile(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Param('id') id: string,
  ): Promise<BrandProfileVersionRecord> {
    try {
      return await this.activateProfileUseCase.execute({
        profileId: id,
        authorizedUserId: user.id,
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('profiles/rollback')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Emergency rollback to a specific previously approved version (Admin only)',
  })
  @RequirePermissions(Permission.ADMIN)
  public async rollbackProfile(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Body() dto: RollbackBrandProfileDto,
  ): Promise<RollbackBrandProfileResult> {
    try {
      return await this.rollbackProfileUseCase.execute({
        targetVersionId: dto.targetVersionId,
        reason: dto.reason,
        authorizedUserId: user.id,
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('sources/ingest')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Ingest historical brand collateral with copyright verification (Admin only)',
  })
  @RequirePermissions(Permission.ADMIN)
  public async ingestSource(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Body() dto: IngestBrandSourceDto,
  ): Promise<BrandSourceArchiveRecord> {
    try {
      return await this.ingestSourceUseCase.execute({
        sourceSystem: dto.sourceSystem,
        ...(dto.externalPostId !== undefined ? { externalPostId: dto.externalPostId } : {}),
        captionText: dto.captionText,
        copyrightDeclared: dto.copyrightDeclared,
        copyrightOwner: dto.copyrightOwner,
        licenseReference: dto.licenseReference,
        ...(dto.mediaCasKeys !== undefined ? { mediaCasKeys: dto.mediaCasKeys } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        actorUserId: user.id,
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('originality/evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Evaluate candidate copy against anti-regurgitation guardrails' })
  public async evaluateOriginality(
    @Body() dto: EvaluateOriginalityDto,
  ): Promise<OriginalityReport> {
    try {
      const policy = {
        ...(dto.maxNgramOverlapThreshold !== undefined
          ? { maxNgramOverlapThreshold: dto.maxNgramOverlapThreshold }
          : {}),
        ...(dto.maxLevenshteinSimilarityThreshold !== undefined
          ? { maxLevenshteinSimilarityThreshold: dto.maxLevenshteinSimilarityThreshold }
          : {}),
      };
      return await this.evaluateOriginalityUseCase.execute({
        candidateText: dto.candidateText,
        ...(Object.keys(policy).length > 0 ? { policy } : {}),
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get('brief')
  @ApiOperation({ summary: 'Assemble runtime BrandBrief payload for generation context' })
  public async getBrandBrief(): Promise<BrandBrief> {
    return this.assembleBrandBriefUseCase.execute();
  }

  @Post('profiles/:id/benchmark')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run benchmark evaluation against a brand profile' })
  @RequirePermissions(Permission.ADMIN)
  public async runBenchmark(
    @Param('id') id: string,
    @Body() dto: RunBenchmarkDto,
  ): Promise<BenchmarkEvaluationReport> {
    try {
      return await this.runBrandBenchmarkUseCase.execute({
        profileId: id,
        testDatasetId: dto.testDatasetId,
        policyId: dto.policyId,
        testCases: dto.testCases,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('feedback/ingest')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ingest batch of human review feedback for dataset curation' })
  public async ingestFeedback(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Body() dto: IngestFeedbackDto,
  ): Promise<FeedbackIngestionSummary> {
    try {
      return await this.ingestReviewFeedbackUseCase.execute({
        feedbackBatch: dto.feedbackBatch,
        targetDatasetVersionId: dto.targetDatasetVersionId,
        actorUserId: user.id,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('datasets')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Curate a new BrandDatasetVersion partition (Admin only)' })
  @RequirePermissions(Permission.ADMIN)
  public async createDataset(
    @CurrentUser() user: SanitizedEmployeeDto,
    @Body() dto: CreateBrandDatasetDto,
  ): Promise<BrandDatasetVersionRecord> {
    try {
      return await this.curateBrandDatasetUseCase.execute({
        name: dto.name,
        versionString: dto.versionString,
        status: dto.status,
        gitCommitHash: dto.gitCommitHash,
        approvedByUserId: user.id,
        initialFeedbackIds: dto.initialFeedbackIds,
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get('datasets')
  @ApiOperation({ summary: 'List curated brand dataset versions' })
  public async listDatasets(): Promise<readonly BrandDatasetVersionRecord[]> {
    return this.brandDatasetRepo.listDatasets();
  }

  @Get('feedback')
  @ApiOperation({ summary: 'List ingested review feedback records' })
  public async listFeedback(): Promise<readonly ReviewFeedbackRecord[]> {
    return this.brandDatasetRepo.listFeedback();
  }

  private handleError(error: unknown): never {
    if (error instanceof InsufficientBrandPermissionError) {
      throw new ForbiddenException(error.message);
    }
    if (error instanceof BrandProfileNotFoundError || error instanceof BrandDatasetNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (
      error instanceof UnlicensedAssetIngestionError ||
      error instanceof RegurgitationViolationError ||
      error instanceof InvalidBrandProfileStateTransitionError ||
      error instanceof DuplicateBrandProfileError ||
      error instanceof DuplicateBrandDatasetVersionError ||
      error instanceof EmptyFeedbackBatchError ||
      error instanceof InvalidFeedbackRecordError
    ) {
      throw new BadRequestException(error.message);
    }
    if (error instanceof Error) {
      throw new BadRequestException(error.message);
    }
    throw new BadRequestException('An unexpected brand intelligence error occurred.');
  }
}
