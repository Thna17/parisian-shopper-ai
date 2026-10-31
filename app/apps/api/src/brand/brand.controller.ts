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
  BrandProfileNotFoundError,
  CreateBrandProfileDraftUseCase,
  DuplicateBrandProfileError,
  EvaluateCandidateOriginalityUseCase,
  GetActiveBrandProfileUseCase,
  IngestBrandSourceUseCase,
  InsufficientBrandPermissionError,
  InvalidBrandProfileStateTransitionError,
  ListBrandProfilesUseCase,
  Permission,
  RegurgitationViolationError,
  RollbackBrandProfileUseCase,
  UnlicensedAssetIngestionError,
  type BrandBrief,
  type BrandProfileVersionRecord,
  type BrandSourceArchiveRecord,
  type OriginalityReport,
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

  private handleError(error: unknown): never {
    if (error instanceof InsufficientBrandPermissionError) {
      throw new ForbiddenException(error.message);
    }
    if (error instanceof BrandProfileNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (
      error instanceof UnlicensedAssetIngestionError ||
      error instanceof RegurgitationViolationError ||
      error instanceof InvalidBrandProfileStateTransitionError ||
      error instanceof DuplicateBrandProfileError
    ) {
      throw new BadRequestException(error.message);
    }
    if (error instanceof Error) {
      throw new BadRequestException(error.message);
    }
    throw new BadRequestException('An unexpected brand intelligence error occurred.');
  }
}
