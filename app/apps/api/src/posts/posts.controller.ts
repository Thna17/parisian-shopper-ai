import { PostCaptionService } from '@parisian-shopper/application';
import { PostGenerationCommands } from '@parisian-shopper/application';
import { PostsModule } from '@parisian-shopper/application';
import { PostWorkflowService } from '@parisian-shopper/application';
import type {
  PostDetailRecord,
  PostListResult,
  PostCandidatesResult,
} from '@parisian-shopper/database';
import { ProtectedPostAssetsController } from './protected-post-assets.controller.js';
import type { Response } from 'express';
import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  NotFoundException,
  Optional,
  BadRequestException,
  Res,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsEnum,
  IsArray,
  IsInt,
  IsNumber,
  IsObject,
  ValidateIf,
  IsISO8601,
  MinLength,
  Equals,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ASSET_STORAGE,
  POST_IMAGE_PROVIDER,
  type PostImageProvider,
  type PostCreationPlan,
  CreativeModule,
  ProductsModule,
  type AssetStoragePort,
  type AIContentOutput,
  Permission,
  PRODUCT_ASSET_ELIGIBILITY_EVALUATOR,
  ProductAssetEligibilityEvaluator,
  type SanitizedEmployeeDto,
} from '@parisian-shopper/application';
import {
  DatabaseModule,
  PrismaPostRepository,
  PrismaPostGenerationRepository,
} from '@parisian-shopper/database';
import { AppConfigService } from '@parisian-shopper/config';
import {
  HiggsfieldMcpService,
  PostImageProvidersModule,
} from '@parisian-shopper/creative-providers';
import { ConflictError } from '@parisian-shopper/common';
import {
  ApprovedPostExportService,
  type ApprovedDownloadKind,
} from './approved-post-export.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';

export class SavePostDto {
  @IsOptional() @IsString() @MaxLength(160) requestKey?: string;
  @IsOptional() @IsObject() creationPlan?: PostCreationPlan | null;
  @IsOptional() @IsUUID() generationId?: string | null;
  @IsOptional() @IsObject() captionDraft?: AIContentOutput | null;
  @IsUUID() productSnapshotId!: string;
  @IsString() @MaxLength(2000) brief!: string;
  @IsEnum(['FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'GENERIC']) channel!:
    'FACEBOOK' | 'INSTAGRAM' | 'TELEGRAM' | 'GENERIC';
  @IsEnum(['KM', 'EN', 'BILINGUAL']) language!: 'KM' | 'EN' | 'BILINGUAL';
  @IsOptional() @IsUUID() campaignId?: string | null;
  @IsOptional() @IsUUID() captionVersionId?: string | null;
  @IsOptional() @IsUUID() posterVersionId?: string | null;
  @IsOptional() @IsUUID() visualAssetId?: string | null;
}
export class RevisePostDto extends SavePostDto {
  @IsInt() @Min(1) expectedRevision!: number;
}
export class PostActionDto {
  @ValidateIf((dto: PostActionDto) => dto.action !== 'SUBMIT')
  @IsInt()
  @Min(0)
  expectedReviewRound?: number;
  @IsInt() @Min(1) expectedRevision!: number;
  @IsEnum(['SUBMIT', 'APPROVE', 'REQUEST_CHANGES', 'REJECT']) action!:
    'SUBMIT' | 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}
class PostVariationDto {
  @IsInt() @Min(1) expectedRevision!: number;
  @IsEnum(['REGENERATE', 'NEW_DESIGN']) intent!: 'REGENERATE' | 'NEW_DESIGN';
  @IsEnum(['LUXURY', 'MINIMAL', 'FESTIVE', 'EDITORIAL']) style!: PostCreationPlan['style'];
  @IsString() @MinLength(3) @MaxLength(1000) feedback!: string;
}
class PostImageQueryDto {
  @IsOptional() @IsUUID() revisionId?: string;
}
class GeneratePostDto {
  @IsInt() @Min(1) expectedRevision!: number;
}
class ConfirmImageDto {
  @IsUUID() generationId!: string;
  @IsNumber() @Min(0.000001) expectedCostUsd!: number;
  @IsNumber() @Min(0) currentBalanceUsd!: number;
  @IsString() @MinLength(10) @MaxLength(1000) evidence!: string;
  @IsISO8601() verifiedAt!: string;
  @Equals(true) confirmed!: true;
}
class McpConfirmDto {
  @IsUUID() generationId!: string;
  @IsString() @MinLength(64) @MaxLength(64) fingerprint!: string;
  @Equals(true) confirmed!: true;
}
class DownloadPostDto {
  @IsUUID() revisionId!: string;
  @Type(() => Number) @IsInt() @Min(0) reviewRound!: number;
}
class DownloadKindDto {
  @IsEnum(['poster', 'caption-text', 'caption-json', 'manifest']) kind!: ApprovedDownloadKind;
  @IsUUID() id!: string;
}
class CaptionRequestDto {
  @IsOptional() @IsUUID() brandProfileVersionId?: string;
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) referenceSourceIds?: string[];
  @IsInt() @Min(1) expectedRevision!: number;
  @IsEnum(['AI', 'TEMPLATE']) method!: 'AI' | 'TEMPLATE';
  @IsOptional() @IsUUID() brandRuleVersionId?: string;
}
class ApproveCaptionBrandDto {
  @IsString() @MinLength(64) @MaxLength(64) digest!: string;
  @Equals(true) confirmed!: true;
}
class ListPostsDto {
  @IsOptional() @IsEnum(['all', 'mine', 'reviews', 'approved']) scope?:
    'all' | 'mine' | 'reviews' | 'approved';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
}

@Controller({ path: 'posts', version: '1' })
@UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
@RequirePermissions(Permission.VIEW_OWN_CONTENT)
export class PostsController {
  private readonly postGeneration: PostGenerationCommands;
  private readonly workflow: PostWorkflowService<
    PostDetailRecord,
    PostListResult,
    PostCandidatesResult
  >;
  constructor(
    private readonly posts: PrismaPostRepository,
    private readonly generations: PrismaPostGenerationRepository,
    private readonly config: AppConfigService,
    @Inject(PRODUCT_ASSET_ELIGIBILITY_EVALUATOR)
    private readonly heroes: ProductAssetEligibilityEvaluator,
    @Inject(ASSET_STORAGE) private readonly storage: AssetStoragePort,
    private readonly approvedDownloads: ApprovedPostExportService,
    @Optional() private readonly mcp?: HiggsfieldMcpService,
    @Optional()
    @Inject(POST_IMAGE_PROVIDER)
    private readonly imageProvider?: PostImageProvider | null,
    @Optional() sharedGeneration?: PostGenerationCommands,
    @Optional()
    sharedWorkflow?: PostWorkflowService<PostDetailRecord, PostListResult, PostCandidatesResult>,
    @Optional() private readonly captions?: PostCaptionService,
  ) {
    this.workflow = sharedWorkflow ?? new PostWorkflowService(posts, heroes, storage);
    this.postGeneration =
      sharedGeneration ??
      new PostGenerationCommands(this.workflow, generations, config, heroes, imageProvider);
  }
  private captionService(): PostCaptionService {
    if (!this.captions)
      throw new ConflictError({
        publicMessage:
          'Caption generation is unavailable. Ask an administrator to deploy its application services.',
      });
    return this.captions;
  }
  @Get('caption/brands') captionBrands(
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<unknown> {
    return this.captionService().brands(actor);
  }
  @Post('caption/brands/:brandId/approve')
  @RequirePermissions(Permission.ADMIN)
  async approveCaptionBrand(
    @Param('brandId', ParseUUIDPipe) id: string,
    @Body() dto: ApproveCaptionBrandDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<void> {
    await this.captionService().approveBrand(id, dto.digest, actor);
  }
  @Get(':id/caption') captionState(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<unknown> {
    return this.captionService().state(id, actor);
  }
  @Get(':id/product-check')
  productCheck(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<PostWorkflowService['productCheck']> {
    return this.workflow.productCheck(id, actor);
  }
  @Post(':id/product-check')
  @RequirePermissions(Permission.EDIT_CONTENT)
  recheckProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<PostWorkflowService['productCheck']> {
    return this.workflow.productCheck(id, actor, true);
  }
  @Post(':id/refresh-product')
  @RequirePermissions(Permission.EDIT_CONTENT)
  refreshProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GeneratePostDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<PostWorkflowService['refreshProductFacts']> {
    return this.workflow.refreshProductFacts(id, dto.expectedRevision, actor);
  }
  @Post(':id/caption')
  @RequirePermissions(Permission.EDIT_CONTENT)
  caption(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CaptionRequestDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<unknown> {
    return this.captionService().generate(id, dto, actor);
  }
  @Post(':id/caption/recover')
  @RequirePermissions(Permission.EDIT_CONTENT)
  recoverCaption(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<unknown> {
    return this.captionService().recover(id, actor);
  }
  @Get() list(
    @Query() query: ListPostsDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<PrismaPostRepository['list']> {
    return this.workflow.list(actor, query.page, query.scope);
  }
  @Post()
  @RequirePermissions(Permission.CREATE_CONTENT)
  create(
    @Body() dto: SavePostDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<PrismaPostRepository['create']> {
    return this.workflow.create(dto, actor);
  }
  @Get(':id/generation') async generation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<unknown> {
    const post = await this.workflow.get(id, actor);
    const latest = await this.generations.latest(id);
    const row =
      latest &&
      (latest.sourceRevisionNumber === post.revisionNumber ||
        post.currentRevision.generationId === latest.id)
        ? latest
        : null;
    const { claimToken: _token, leaseUntil: _lease, ...safe } = row ?? {};
    return {
      generation: row
        ? {
            ...safe,
            spendingConfirmed: Boolean(row.authorization),
            canRecover: Boolean(row.backgroundKey),
          }
        : null,
      provider: this.config.postImages.provider,
      setupMessage:
        this.config.postImages.provider === 'disabled'
          ? 'Poster creation is not connected. Configure an application image provider.'
          : this.config.postImages.provider === 'higgsfield_mcp'
            ? 'Higgsfield MCP: prepare the exact background request, check its credit quote, then confirm spending. Prepare an AI caption, a labeled template or staff text separately before creating the poster.'
            : this.config.postImages.provider === 'fake'
              ? 'Test mode: mock background; caption generation has its own status. No image-provider charge.'
              : 'Paid generation needs a verified developer API quote, current balance and explicit confirmation. MCP credits are separate.',
      currentBalanceUsd: null,
      mcpConnection:
        this.config.postImages.provider === 'higgsfield_mcp' ? await this.mcp?.status() : undefined,
      expectedCostUsd: row?.estimatedCostUsd ?? null,
      historicalPostersUsed: false,
    };
  }
  @Post(':id/generation')
  @RequirePermissions(Permission.EDIT_CONTENT, Permission.EDIT_CREATIVE)
  async generate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GeneratePostDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<unknown> {
    await this.postGeneration.prepare(id, dto.expectedRevision, actor);
    return this.generation(id, actor);
  }
  @Post(':id/generation/quote')
  @RequirePermissions(Permission.EDIT_CONTENT, Permission.EDIT_CREATIVE)
  async quoteMcp(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<PostsController['generation']> {
    const post = await this.workflow.get(id, actor);
    if (post.creatorUserId !== actor.id)
      throw new ConflictError({ publicMessage: 'Ask the post creator to prepare this quote.' });
    const row = await this.generations.latest(id);
    if (
      !row ||
      row.provider !== 'higgsfield_mcp' ||
      row.status !== 'AWAITING_CONFIRMATION' ||
      !this.mcp
    )
      throw new ConflictError({ publicMessage: 'Prepare a current MCP image request first.' });
    if (!this.config.postImages.assetHosts.length)
      throw new BadRequestException(
        'Ask an administrator to configure verified Higgsfield output hosts before quoting a generation.',
      );
    try {
      const quote = await this.mcp.quote(row.prompt);
      await this.generations.saveCreditQuote(row.id, actor, { ...quote });
    } catch {
      throw new BadRequestException(
        'Could not verify an exact MCP quote and balance. Check the Higgsfield connection and tool contract. Nothing was generated.',
      );
    }
    return this.generation(id, actor);
  }
  @Post(':id/generation/confirm-credits')
  @RequirePermissions(Permission.MANAGE_AI_BUDGETS)
  async confirmMcp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: McpConfirmDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<PostsController['generation']> {
    await this.workflow.get(id, actor);
    const row = await this.generations.latest(id);
    if (!row || row.id !== dto.generationId || row.provider !== 'higgsfield_mcp')
      throw new ConflictError({
        publicMessage: 'The request changed. Refresh its quote before confirming.',
      });
    const settings = this.config.higgsfieldMcp;
    if (
      !settings.dispatchEnabled ||
      !settings.sharedUseConfirmed ||
      !this.config.featureFlags.AI_IMAGE_GENERATION ||
      !this.config.featureFlags.CREATIVE_GENERATION
    )
      throw new ConflictError({
        publicMessage:
          'Paid MCP generation is disabled pending administrator setup and deployment verification.',
      });
    await this.generations.authorizeCredits(row.id, actor, dto.fingerprint);
    return this.generation(id, actor);
  }
  @Post(':id/generation/confirm')
  @RequirePermissions(Permission.MANAGE_AI_BUDGETS)
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmImageDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<unknown> {
    await this.workflow.get(id, actor);
    const row = await this.generations.latest(id);
    if (!row) throw new ConflictError({ publicMessage: 'Prepare the exact image request first.' });
    if (row.id !== dto.generationId)
      throw new ConflictError({
        publicMessage:
          'The image request changed. Inspect the exact new configuration before confirming.',
      });
    const { generationId: _id, confirmed: _confirmed, ...quote } = dto;
    await this.generations.authorize(row.id, actor, quote);
    return this.generation(id, actor);
  }
  @Post(':id/generation/reconcile')
  @RequirePermissions(Permission.EDIT_CONTENT)
  async reconcile(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<unknown> {
    const post = await this.workflow.get(id, actor);
    if (post.creatorUserId !== actor.id)
      throw new ConflictError({ publicMessage: 'Ask the post creator to check the request.' });
    const row = await this.generations.latest(id);
    if (row) await this.generations.reconcile(row.id);
    return this.generation(id, actor);
  }
  @Post(':id/generation/cancel')
  @RequirePermissions(Permission.EDIT_CONTENT)
  async cancelGeneration(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<unknown> {
    await this.workflow.get(id, actor);
    const row = await this.generations.latest(id);
    if (row) await this.generations.cancelUnsubmitted(row.id, actor);
    return this.generation(id, actor);
  }
  @Get(':id/download/:kind')
  @RequirePermissions(Permission.EXPORT_CREATIVE)
  async download(
    @Param() path: DownloadKindDto,
    @Query() query: DownloadPostDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.approvedDownloads.prepare(
      path.id,
      query.revisionId,
      query.reviewRound,
      path.kind,
      actor,
    );
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Length', String(file.bytes.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Content-SHA256', file.sha256);
    res.setHeader('X-Post-Revision', file.revisionId);
    res.send(file.bytes);
  }
  @Get(':id') get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<PrismaPostRepository['get']> {
    return this.workflow.get(id, actor);
  }
  @Get(':id/image') async image(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: SanitizedEmployeeDto,
    @Res() res: Response,
    @Query() query: PostImageQueryDto,
  ): Promise<void> {
    const asset = await this.posts.image(id, actor, query.revisionId);
    const buffer = await this.storage.getAssetBuffer(asset.storageKey);
    if (!buffer) throw new NotFoundException('Saved poster image is unavailable.');
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  }
  @Get(':id/candidates') candidates(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<PrismaPostRepository['candidates']> {
    return this.workflow.candidates(id, actor);
  }
  @Patch(':id')
  @RequirePermissions(Permission.EDIT_CONTENT)
  revise(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevisePostDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<PrismaPostRepository['revise']> {
    const { expectedRevision, ...input } = dto;
    return this.workflow.revise(id, expectedRevision, input, actor);
  }
  @Post(':id/variations')
  @RequirePermissions(Permission.EDIT_CONTENT, Permission.EDIT_CREATIVE)
  variation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PostVariationDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<PrismaPostRepository['prepareVariation']> {
    return this.workflow.variation(
      id,
      dto.expectedRevision,
      actor,
      dto.intent,
      dto.style,
      dto.feedback,
    );
  }
  @Post(':id/actions') async action(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PostActionDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<PrismaPostRepository['transition']> {
    return this.workflow.decide(id, dto, actor);
  }
}
@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    CreativeModule,
    ProductsModule,
    PostImageProvidersModule,
    PostsModule,
  ],
  controllers: [PostsController, ProtectedPostAssetsController],
  providers: [ApprovedPostExportService],
})
export class PostsApiModule {}
