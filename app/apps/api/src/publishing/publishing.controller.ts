import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UnprocessableEntityException,
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
  CancelPublicationUseCase,
  ConfirmPublicationUseCase,
  ContentVersionNotApprovedError,
  CreatePublicationUseCase,
  GetPublicationDetailUseCase,
  InsufficientPublishingPermissionError,
  ListDestinationsUseCase,
  ListEligibleAssetsUseCase,
  ListPublicationsUseCase,
  Permission,
  PublicationChannelNotEnabledError,
  PublicationIdempotencyConflictError,
  PublicationNotFoundError,
  PublicationNotRetryableError,
  PublicationStatusTransitionError,
  RetryPublicationUseCase,
  type SanitizedEmployeeDto,
} from '@parisian-shopper/application';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { CancelPublicationDto } from './dto/cancel-publication.dto.js';
import { CreatePublicationDto } from './dto/create-publication.dto.js';
import { ListPublicationsQueryDto } from './dto/list-publications-query.dto.js';
import {
  type ChannelCapabilityResponseDto,
  type EligibleAssetResponseDto,
  type PaginatedPublicationsResponseDto,
  type PublicationDetailResponseDto,
  type PublicationResponseDto,
} from './dto/publishing-response.dto.js';

@ApiTags('publishing')
@ApiCookieAuth('ps_session')
@Controller({ path: 'publishing', version: '1' })
@UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
export class PublishingController {
  public constructor(
    private readonly listPublicationsUseCase: ListPublicationsUseCase,
    private readonly createPublicationUseCase: CreatePublicationUseCase,
    private readonly getPublicationDetailUseCase: GetPublicationDetailUseCase,
    private readonly confirmPublicationUseCase: ConfirmPublicationUseCase,
    private readonly retryPublicationUseCase: RetryPublicationUseCase,
    private readonly cancelPublicationUseCase: CancelPublicationUseCase,
    private readonly listEligibleAssetsUseCase: ListEligibleAssetsUseCase,
    private readonly listDestinationsUseCase: ListDestinationsUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiOperation({ summary: 'List and filter publications with pagination' })
  @ApiOkResponse({ description: 'Paginated publications returned successfully' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Missing view permissions' })
  public async listPublications(
    @Query() query: ListPublicationsQueryDto,
    @CurrentUser() user: SanitizedEmployeeDto,
  ): Promise<PaginatedPublicationsResponseDto> {
    try {
      const result = await this.listPublicationsUseCase.execute({
        ...(query.page !== undefined ? { page: query.page } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(query.channel !== undefined ? { channel: query.channel } : {}),
        actingUserId: user.id,
        permissions: user.permissions,
      });

      return {
        items: result.items.map((item) => ({
          ...item,
          scheduledAt: item.scheduledAt ? item.scheduledAt.toISOString() : null,
          publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        })),
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      };
    } catch (error) {
      this.handleDomainError(error);
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.PUBLISH_CREATIVE)
  @ApiOperation({ summary: 'Create a publication request for an approved content version' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Publication created successfully' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Missing PUBLISH_CREATIVE permission' })
  public async createPublication(
    @Body() dto: CreatePublicationDto,
    @CurrentUser() user: SanitizedEmployeeDto,
  ): Promise<PublicationResponseDto> {
    try {
      const result = await this.createPublicationUseCase.execute({
        contentVersionId: dto.contentVersionId,
        creativeExportId: dto.creativeExportId ?? null,
        destinationChannel: dto.destinationChannel,
        destinationAccountId: dto.destinationAccountId ?? null,
        idempotencyKey: dto.idempotencyKey,
        campaignId: dto.campaignId ?? null,
        actingUserId: user.id,
        permissions: user.permissions,
      });

      return {
        ...result,
        scheduledAt: result.scheduledAt ? result.scheduledAt.toISOString() : null,
        publishedAt: result.publishedAt ? result.publishedAt.toISOString() : null,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
      };
    } catch (error) {
      this.handleDomainError(error);
    }
  }

  @Get('destinations')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiOperation({ summary: 'List supported publishing destinations and readiness' })
  @ApiOkResponse({ description: 'Channel capabilities returned successfully' })
  public getDestinations(
    @CurrentUser() user: SanitizedEmployeeDto,
  ): readonly ChannelCapabilityResponseDto[] {
    try {
      return this.listDestinationsUseCase.execute({
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleDomainError(error);
    }
  }

  @Get('eligible-assets')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiOperation({ summary: 'List approved content versions eligible for distribution' })
  @ApiOkResponse({ description: 'Eligible assets returned successfully' })
  public async listEligibleAssets(
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: SanitizedEmployeeDto,
  ): Promise<{ items: readonly EligibleAssetResponseDto[]; total: number }> {
    try {
      return await this.listEligibleAssetsUseCase.execute({
        page: page !== undefined ? parseInt(page, 10) : 1,
        limit: limit !== undefined ? parseInt(limit, 10) : 20,
        actingUserId: user.id,
        permissions: user.permissions,
      });
    } catch (error) {
      this.handleDomainError(error);
    }
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiOperation({ summary: 'Get detailed publication record by ID' })
  @ApiOkResponse({ description: 'Publication detail returned successfully' })
  @ApiNotFoundResponse({ description: 'Publication not found' })
  public async getPublicationDetail(
    @Param('id') id: string,
    @CurrentUser() user: SanitizedEmployeeDto,
  ): Promise<PublicationDetailResponseDto> {
    try {
      const result = await this.getPublicationDetailUseCase.execute({
        publicationId: id,
        actingUserId: user.id,
        permissions: user.permissions,
      });

      return {
        ...result,
        scheduledAt: result.scheduledAt ? result.scheduledAt.toISOString() : null,
        publishedAt: result.publishedAt ? result.publishedAt.toISOString() : null,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
        attempts: result.attempts.map((att) => ({
          ...att,
          startedAt: att.startedAt.toISOString(),
          completedAt: att.completedAt ? att.completedAt.toISOString() : null,
          createdAt: att.createdAt.toISOString(),
        })),
      };
    } catch (error) {
      this.handleDomainError(error);
    }
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.PUBLISH_CREATIVE)
  @ApiOperation({ summary: 'Confirm and dispatch publication' })
  @ApiOkResponse({ description: 'Publication confirmed and dispatched' })
  public async confirmPublication(
    @Param('id') id: string,
    @CurrentUser() user: SanitizedEmployeeDto,
  ): Promise<PublicationResponseDto> {
    try {
      const result = await this.confirmPublicationUseCase.execute({
        publicationId: id,
        actingUserId: user.id,
        permissions: user.permissions,
      });

      return {
        ...result,
        scheduledAt: result.scheduledAt ? result.scheduledAt.toISOString() : null,
        publishedAt: result.publishedAt ? result.publishedAt.toISOString() : null,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
      };
    } catch (error) {
      this.handleDomainError(error);
    }
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.PUBLISH_CREATIVE)
  @ApiOperation({ summary: 'Retry a failed publication' })
  @ApiOkResponse({ description: 'Publication re-queued for retry' })
  public async retryPublication(
    @Param('id') id: string,
    @CurrentUser() user: SanitizedEmployeeDto,
  ): Promise<PublicationResponseDto> {
    try {
      const result = await this.retryPublicationUseCase.execute({
        publicationId: id,
        actingUserId: user.id,
        permissions: user.permissions,
      });

      return {
        ...result,
        scheduledAt: result.scheduledAt ? result.scheduledAt.toISOString() : null,
        publishedAt: result.publishedAt ? result.publishedAt.toISOString() : null,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
      };
    } catch (error) {
      this.handleDomainError(error);
    }
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.PUBLISH_CREATIVE)
  @ApiOperation({ summary: 'Cancel a pending publication' })
  @ApiOkResponse({ description: 'Publication cancelled' })
  public async cancelPublication(
    @Param('id') id: string,
    @Body() dto: CancelPublicationDto,
    @CurrentUser() user: SanitizedEmployeeDto,
  ): Promise<PublicationResponseDto> {
    try {
      const result = await this.cancelPublicationUseCase.execute({
        publicationId: id,
        reason: dto.reason,
        actingUserId: user.id,
        permissions: user.permissions,
      });

      return {
        ...result,
        scheduledAt: result.scheduledAt ? result.scheduledAt.toISOString() : null,
        publishedAt: result.publishedAt ? result.publishedAt.toISOString() : null,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
      };
    } catch (error) {
      this.handleDomainError(error);
    }
  }

  private handleDomainError(error: unknown): never {
    if (error instanceof PublicationNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (error instanceof ContentVersionNotApprovedError) {
      throw new UnprocessableEntityException(error.message);
    }
    if (error instanceof PublicationChannelNotEnabledError) {
      throw new BadRequestException(error.message);
    }
    if (
      error instanceof PublicationStatusTransitionError ||
      error instanceof PublicationNotRetryableError ||
      error instanceof PublicationIdempotencyConflictError
    ) {
      throw new ConflictException(error.message);
    }
    if (error instanceof InsufficientPublishingPermissionError) {
      throw new ForbiddenException(error.message);
    }
    throw error;
  }
}
