import { Controller, Get, HttpCode, HttpStatus, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permission } from '@parisian-shopper/application';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import {
  type PaginatedProductsResponseDto,
  type ProductDetailDto,
  type ProductReadinessResponseDto,
  type VerifiedProductFactsDto,
} from './dto/product-response.dto.js';
import { ProductsService } from './products.service.js';

@ApiTags('products')
@ApiCookieAuth('ps_session')
@Controller({ path: 'products', version: '1' })
@UseGuards(SessionAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.VIEW_PRODUCTS)
export class ProductsController {
  public constructor(private readonly productsService: ProductsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List and search verified product snapshots with pagination' })
  @ApiOkResponse({ description: 'Paginated product snapshots returned successfully' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Missing VIEW_PRODUCTS permission' })
  public async searchProducts(
    @Query() query: ListProductsQueryDto,
  ): Promise<PaginatedProductsResponseDto> {
    return this.productsService.listProducts(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrieve verified product snapshot details by UUID or SKU' })
  @ApiOkResponse({ description: 'Product snapshot details returned successfully' })
  @ApiNotFoundResponse({ description: 'Product snapshot not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Missing VIEW_PRODUCTS permission' })
  public async getProductById(@Param('id') id: string): Promise<ProductDetailDto> {
    return this.productsService.getProductById(id);
  }

  @Get(':id/readiness')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Evaluate product commercial readiness and asset rights' })
  @ApiOkResponse({ description: 'Readiness evaluation returned successfully' })
  @ApiNotFoundResponse({ description: 'Product snapshot not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Missing VIEW_PRODUCTS permission' })
  public async getReadiness(@Param('id') id: string): Promise<ProductReadinessResponseDto> {
    return this.productsService.getProductReadiness(id);
  }

  @Get(':id/facts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrieve authoritative commercial facts for product' })
  @ApiOkResponse({ description: 'Verified commercial facts returned successfully' })
  @ApiNotFoundResponse({ description: 'Product snapshot not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Missing VIEW_PRODUCTS permission' })
  public async getFacts(@Param('id') id: string): Promise<VerifiedProductFactsDto> {
    return this.productsService.getProductFacts(id);
  }
}
