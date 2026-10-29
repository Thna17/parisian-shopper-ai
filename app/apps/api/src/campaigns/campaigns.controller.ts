import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
  type CampaignDetail,
  type CampaignProductRecord,
  type CampaignSummary,
  type PaginatedCampaigns,
  Permission,
  type SanitizedEmployeeDto,
  AssociateCampaignProductUseCase,
  ChangeCampaignStatusUseCase,
  CreateCampaignUseCase,
  GetCampaignDetailUseCase,
  ListCampaignsUseCase,
  RemoveCampaignProductUseCase,
  UpdateCampaignUseCase,
} from '@parisian-shopper/application';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { AssociateProductDto } from './dto/associate-product.dto.js';
import {
  type CampaignDetailResponseDto,
  type CampaignProductResponseDto,
  type CampaignSummaryResponseDto,
  type PaginatedCampaignsResponseDto,
} from './dto/campaign-response.dto.js';
import { ChangeCampaignStatusDto } from './dto/change-campaign-status.dto.js';
import { CreateCampaignDto } from './dto/create-campaign.dto.js';
import { ListCampaignsQueryDto } from './dto/list-campaigns-query.dto.js';
import { UpdateCampaignDto } from './dto/update-campaign.dto.js';

@ApiTags('campaigns')
@ApiCookieAuth('ps_session')
@Controller({ path: 'campaigns', version: '1' })
@UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
export class CampaignsController {
  public constructor(
    private readonly listCampaignsUseCase: ListCampaignsUseCase,
    private readonly createCampaignUseCase: CreateCampaignUseCase,
    private readonly getCampaignDetailUseCase: GetCampaignDetailUseCase,
    private readonly updateCampaignUseCase: UpdateCampaignUseCase,
    private readonly changeCampaignStatusUseCase: ChangeCampaignStatusUseCase,
    private readonly associateCampaignProductUseCase: AssociateCampaignProductUseCase,
    private readonly removeCampaignProductUseCase: RemoveCampaignProductUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiOperation({ summary: 'List and filter campaigns with pagination' })
  @ApiOkResponse({ description: 'Paginated campaigns returned successfully' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Missing VIEW_OWN_CONTENT permission' })
  public async listCampaigns(
    @Query() query: ListCampaignsQueryDto,
    @CurrentUser() user: SanitizedEmployeeDto,
  ): Promise<PaginatedCampaignsResponseDto> {
    const result = await this.listCampaignsUseCase.execute({
      ...(query.page !== undefined ? { page: query.page } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
      ...(query.search !== undefined ? { search: query.search } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      actingUserId: user.id,
      permissions: user.permissions,
    });

    return this.toPaginatedResponse(result);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.CREATE_CONTENT)
  @ApiOperation({ summary: 'Create a new campaign in DRAFT status' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Campaign created successfully' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Missing CREATE_CONTENT permission' })
  public async createCampaign(
    @Body() dto: CreateCampaignDto,
    @CurrentUser() user: SanitizedEmployeeDto,
  ): Promise<CampaignDetailResponseDto> {
    const result = await this.createCampaignUseCase.execute({
      code: dto.code,
      name: dto.name,
      objective: dto.objective,
      description: dto.description ?? null,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      createdById: user.id,
    });

    return this.toDetailResponse(result);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiOperation({ summary: 'Get campaign details by UUID or code' })
  @ApiOkResponse({ description: 'Campaign details returned successfully' })
  @ApiNotFoundResponse({ description: 'Campaign not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Missing permission or not owner' })
  public async getCampaign(
    @Param('id') id: string,
    @CurrentUser() user: SanitizedEmployeeDto,
  ): Promise<CampaignDetailResponseDto> {
    const result = await this.getCampaignDetailUseCase.execute({
      idOrCode: id,
      actingUserId: user.id,
      permissions: user.permissions,
    });

    return this.toDetailResponse(result);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.EDIT_CONTENT)
  @ApiOperation({ summary: 'Update allowed campaign attributes' })
  @ApiOkResponse({ description: 'Campaign updated successfully' })
  @ApiNotFoundResponse({ description: 'Campaign not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Missing EDIT_CONTENT permission' })
  public async updateCampaign(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() user: SanitizedEmployeeDto,
  ): Promise<CampaignDetailResponseDto> {
    const result = await this.updateCampaignUseCase.execute({
      id,
      actingUserId: user.id,
      permissions: user.permissions,
      updates: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.objective !== undefined ? { objective: dto.objective } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.startDate !== undefined
          ? { startDate: dto.startDate ? new Date(dto.startDate) : null }
          : {}),
        ...(dto.endDate !== undefined
          ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
          : {}),
      },
    });

    return this.toDetailResponse(result);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.EDIT_CONTENT)
  @ApiOperation({ summary: 'Transition campaign lifecycle status' })
  @ApiOkResponse({ description: 'Campaign status updated successfully' })
  @ApiNotFoundResponse({ description: 'Campaign not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Permission denied for requested transition' })
  public async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeCampaignStatusDto,
    @CurrentUser() user: SanitizedEmployeeDto,
  ): Promise<CampaignDetailResponseDto> {
    const result = await this.changeCampaignStatusUseCase.execute({
      id,
      nextStatus: dto.status,
      actingUserId: user.id,
      permissions: user.permissions,
    });

    return this.toDetailResponse(result);
  }

  @Post(':id/products')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.EDIT_CONTENT)
  @ApiOperation({ summary: 'Associate a verified ProductSnapshot with campaign targets' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Product associated successfully' })
  @ApiNotFoundResponse({ description: 'Campaign or ProductSnapshot not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Missing EDIT_CONTENT permission' })
  public async addProduct(
    @Param('id') id: string,
    @Body() dto: AssociateProductDto,
    @CurrentUser() user: SanitizedEmployeeDto,
  ): Promise<CampaignProductResponseDto> {
    const result = await this.associateCampaignProductUseCase.execute({
      campaignId: id,
      productSnapshotId: dto.productSnapshotId,
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.isHero !== undefined ? { isHero: dto.isHero } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      ...(dto.targetPromoPrice !== undefined ? { targetPromoPrice: dto.targetPromoPrice } : {}),
      ...(dto.targetDiscountPercent !== undefined
        ? { targetDiscountPercent: dto.targetDiscountPercent }
        : {}),
      actingUserId: user.id,
      permissions: user.permissions,
    });

    return this.toProductResponse(result);
  }

  @Delete(':id/products/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.EDIT_CONTENT)
  @ApiOperation({ summary: 'Remove a product association from a campaign' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Product association removed successfully',
  })
  @ApiNotFoundResponse({ description: 'Campaign not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Missing EDIT_CONTENT permission' })
  public async removeProduct(
    @Param('id') id: string,
    @Param('productId') productId: string,
    @CurrentUser() user: SanitizedEmployeeDto,
  ): Promise<void> {
    await this.removeCampaignProductUseCase.execute({
      campaignId: id,
      productSnapshotIdOrAssocId: productId,
      actingUserId: user.id,
      permissions: user.permissions,
    });
  }

  private toDetailResponse(campaign: CampaignDetail): CampaignDetailResponseDto {
    return {
      id: campaign.id,
      code: campaign.code,
      name: campaign.name,
      objective: campaign.objective,
      description: campaign.description,
      status: campaign.status,
      startDate: campaign.startDate ? campaign.startDate.toISOString() : null,
      endDate: campaign.endDate ? campaign.endDate.toISOString() : null,
      createdById: campaign.createdById,
      createdByDisplayName: campaign.createdByDisplayName,
      productCount: campaign.productCount,
      heroProductSku: campaign.heroProductSku,
      heroProductTitle: campaign.heroProductTitle,
      products: campaign.products.map((p) => this.toProductResponse(p)),
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
    };
  }

  private toSummaryResponse(campaign: CampaignSummary): CampaignSummaryResponseDto {
    return {
      id: campaign.id,
      code: campaign.code,
      name: campaign.name,
      objective: campaign.objective,
      description: campaign.description,
      status: campaign.status,
      startDate: campaign.startDate ? campaign.startDate.toISOString() : null,
      endDate: campaign.endDate ? campaign.endDate.toISOString() : null,
      createdById: campaign.createdById,
      createdByDisplayName: campaign.createdByDisplayName,
      productCount: campaign.productCount,
      heroProductSku: campaign.heroProductSku,
      heroProductTitle: campaign.heroProductTitle,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
    };
  }

  private toProductResponse(p: CampaignProductRecord): CampaignProductResponseDto {
    return {
      id: p.id,
      campaignId: p.campaignId,
      productSnapshotId: p.productSnapshotId,
      sortOrder: p.sortOrder,
      isHero: p.isHero,
      notes: p.notes,
      targetPromoPrice: p.targetPromoPrice,
      targetDiscountPercent: p.targetDiscountPercent,
      createdAt: p.createdAt.toISOString(),
      productSku: p.productSku,
      productTitle: p.productTitle,
      brandName: p.brandName,
      catalogPriceUsd: p.catalogPriceUsd,
      heroAssetUrl: p.heroAssetUrl,
    };
  }

  private toPaginatedResponse(paginated: PaginatedCampaigns): PaginatedCampaignsResponseDto {
    return {
      items: paginated.items.map((item) => this.toSummaryResponse(item)),
      total: paginated.total,
      page: paginated.page,
      limit: paginated.limit,
      totalPages: paginated.totalPages,
    };
  }
}
