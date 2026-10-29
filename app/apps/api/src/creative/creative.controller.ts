import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type SanitizedEmployeeDto,
  Permission,
  TemplateRegistry,
  ListCreativeProjectsUseCase,
  GetCreativeProjectDetailUseCase,
  CreateCreativeProjectUseCase,
  ValidateCreativeProjectUseCase,
  RenderCreativePreviewUseCase,
  ReviseSceneUseCase,
  GetSceneVersionUseCase,
  ExportPosterUseCase,
  type CreativeSceneVersionRecord,
  type SceneLayerDraft,
  type SceneLayerRecord,
  ASSET_STORAGE,
  type AssetStoragePort,
  VISUAL_ASSET_REPOSITORY,
  type VisualAssetRepository,
  CREATIVE_SCENE_REPOSITORY,
  type CreativeSceneRepository,
} from '@parisian-shopper/application';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { ListCreativeProjectsQueryDto } from './dto/list-creative-projects-query.dto.js';
import { CreateCreativeProjectDto } from './dto/create-creative-project.dto.js';
import { ReviseCreativeProjectDto } from './dto/revise-creative-project.dto.js';
import { ExportCreativeProjectDto } from './dto/export-creative-project.dto.js';
import {
  type ExportResponseDto,
  type PaginatedCreativeProjectsResponseDto,
  type CreativeProjectDetailResponseDto,
  type RenderPreviewResponseDto,
  type TemplateListResponseDto,
  type ValidationResponseDto,
} from './dto/creative-response.dto.js';

@ApiTags('creative')
@Controller({ path: 'creative', version: '1' })
export class CreativeController {
  public constructor(
    private readonly listProjectsUseCase: ListCreativeProjectsUseCase,
    private readonly getProjectDetailUseCase: GetCreativeProjectDetailUseCase,
    private readonly createProjectUseCase: CreateCreativeProjectUseCase,
    private readonly validateProjectUseCase: ValidateCreativeProjectUseCase,
    private readonly renderPreviewUseCase: RenderCreativePreviewUseCase,
    private readonly reviseSceneUseCase: ReviseSceneUseCase,
    private readonly getSceneVersionUseCase: GetSceneVersionUseCase,
    private readonly exportPosterUseCase: ExportPosterUseCase,
    @Inject(ASSET_STORAGE)
    private readonly storage: AssetStoragePort,
    @Inject(VISUAL_ASSET_REPOSITORY)
    private readonly visualAssetRepo: VisualAssetRepository,
    @Inject(CREATIVE_SCENE_REPOSITORY)
    private readonly sceneRepo: CreativeSceneRepository,
  ) {}

  @Get('templates')
  @ApiOperation({ summary: 'List approved canonical poster templates' })
  @ApiOkResponse({ description: 'List of registered approved templates' })
  public listTemplates(): TemplateListResponseDto {
    return TemplateRegistry.getInstance().getApprovedTemplates();
  }

  @Get('projects')
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiCookieAuth('ps_session')
  @ApiOperation({ summary: 'List paginated creative projects/scenes' })
  @ApiOkResponse({ description: 'Paginated list of creative projects' })
  public async listProjects(
    @CurrentUser() employee: SanitizedEmployeeDto,
    @Query() query: ListCreativeProjectsQueryDto,
  ): Promise<PaginatedCreativeProjectsResponseDto> {
    return this.listProjectsUseCase.execute({
      requesterUserId: employee.id,
      requesterRoles: employee.roles,
      query: {
        ...(query.campaignId ? { campaignId: query.campaignId } : {}),
        ...(query.search ? { search: query.search } : {}),
        ...(query.page ? { page: query.page } : {}),
        ...(query.limit ? { limit: query.limit } : {}),
      },
    });
  }

  @Post('projects')
  @UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
  @RequirePermissions(Permission.EDIT_CREATIVE)
  @HttpCode(HttpStatus.CREATED)
  @ApiCookieAuth('ps_session')
  @ApiOperation({ summary: 'Create a new creative composition project' })
  public async createProject(
    @CurrentUser() employee: SanitizedEmployeeDto,
    @Body() dto: CreateCreativeProjectDto,
  ): Promise<unknown> {
    return this.createProjectUseCase.execute({
      title: dto.title,
      productSnapshotId: dto.productSnapshotId,
      sourceContentVersionId: dto.sourceContentVersionId,
      templateId: dto.templateId,
      aspectRatio: dto.aspectRatio,
      language: dto.language,
      ...(dto.campaignId ? { campaignId: dto.campaignId } : {}),
      ...(dto.productAssetId ? { productAssetId: dto.productAssetId } : {}),
      requesterUserId: employee.id,
      requesterRoles: employee.roles,
    });
  }

  @Get('projects/:id')
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiCookieAuth('ps_session')
  @ApiOperation({ summary: 'Get creative project detail with current scene graph and snapshot' })
  public async getProjectDetail(
    @Param('id') id: string,
    @Query('versionNumber') versionNumber: string | undefined,
    @CurrentUser() employee: SanitizedEmployeeDto,
  ): Promise<CreativeProjectDetailResponseDto> {
    return this.getProjectDetailUseCase.execute({
      projectId: id,
      ...(versionNumber ? { versionNumber: parseInt(versionNumber, 10) } : {}),
      requesterUserId: employee.id,
      requesterRoles: employee.roles,
    });
  }

  @Patch('projects/:id')
  @UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
  @RequirePermissions(Permission.EDIT_CREATIVE)
  @ApiCookieAuth('ps_session')
  @ApiOperation({ summary: 'Save canvas layer revisions and properties' })
  public async reviseProject(
    @Param('id') id: string,
    @CurrentUser() employee: SanitizedEmployeeDto,
    @Body() dto: ReviseCreativeProjectDto,
  ): Promise<CreativeSceneVersionRecord> {
    return this.reviseSceneUseCase.execute({
      sceneId: id,
      expectedVersionNumber: dto.expectedVersionNumber,
      changeReason: dto.changeReason,
      operationCode: dto.operationCode,
      layers: dto.layers,
      ...(dto.safeMargins ? { safeMargins: dto.safeMargins } : {}),
      requesterUserId: employee.id,
      requesterRoles: employee.roles,
    });
  }

  @Get('projects/:id/versions')
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiCookieAuth('ps_session')
  @ApiOperation({ summary: 'List version revision history for a creative project' })
  public async listProjectVersions(
    @Param('id') id: string,
    @CurrentUser() _employee: SanitizedEmployeeDto,
  ): Promise<unknown> {
    return this.getSceneVersionUseCase.listVersions(id);
  }

  @Post('projects/:id/validate')
  @UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
  @RequirePermissions(Permission.EDIT_CREATIVE)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('ps_session')
  @ApiOperation({
    summary: 'Validate current canvas scene graph against hard visual gates & truth',
  })
  public async validateProject(
    @Param('id') id: string,
    @CurrentUser() employee: SanitizedEmployeeDto,
    @Body()
    body?: {
      layers?: readonly (SceneLayerDraft | SceneLayerRecord)[];
      versionNumber?: number;
    },
  ): Promise<ValidationResponseDto> {
    return this.validateProjectUseCase.execute({
      projectId: id,
      ...(body?.versionNumber ? { versionNumber: body.versionNumber } : {}),
      ...(body?.layers ? { layers: body.layers } : {}),
      requesterUserId: employee.id,
      requesterRoles: employee.roles,
    });
  }

  @Post('projects/:id/render')
  @UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
  @RequirePermissions(Permission.REGENERATE_CREATIVE)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('ps_session')
  @ApiOperation({ summary: 'Render high-fidelity server preview using Sharp compositor' })
  public async renderPreview(
    @Param('id') id: string,
    @CurrentUser() employee: SanitizedEmployeeDto,
    @Body() body?: { versionNumber?: number },
  ): Promise<RenderPreviewResponseDto> {
    return this.renderPreviewUseCase.execute({
      projectId: id,
      ...(body?.versionNumber ? { versionNumber: body.versionNumber } : {}),
      requesterUserId: employee.id,
      requesterRoles: employee.roles,
    });
  }

  @Get('renders/:id')
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiCookieAuth('ps_session')
  @ApiOperation({ summary: 'Get visual asset render metadata' })
  public async getRenderMetadata(@Param('id') id: string): Promise<Record<string, unknown>> {
    const asset = await this.visualAssetRepo.findById(id);
    if (!asset) {
      throw new NotFoundException(`Rendered visual asset "${id}" not found.`);
    }
    return {
      id: asset.id,
      creativeJobId: asset.creativeJobId,
      versionNumber: asset.versionNumber,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      sha256: asset.sha256,
      createdAt: asset.createdAt,
      previewUrl: `/v1/creative/renders/${asset.id}/file`,
    };
  }

  @Get('renders/:id/file')
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.VIEW_OWN_CONTENT)
  @ApiCookieAuth('ps_session')
  @ApiOperation({
    summary: 'Download or view rendered raster image bytes (authenticated, private no-store)',
  })
  public async streamRenderFile(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const asset = await this.visualAssetRepo.findById(id);
    if (!asset) {
      throw new NotFoundException(`Visual asset "${id}" not found.`);
    }

    const buffer = await this.storage.getAssetBuffer(asset.storageKey);
    if (!buffer) {
      throw new NotFoundException(`Asset buffer for storage key "${asset.storageKey}" not found.`);
    }

    res.setHeader('Content-Type', asset.mimeType || 'image/png');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(buffer);
  }

  @Post('projects/:id/export')
  @UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
  @RequirePermissions(Permission.EXPORT_CREATIVE)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('ps_session')
  @ApiOperation({ summary: 'Export multi-format high-res asset (requires CREATIVE_APPROVED)' })
  public async exportProject(
    @Param('id') id: string,
    @CurrentUser() employee: SanitizedEmployeeDto,
    @Body() dto: ExportCreativeProjectDto,
  ): Promise<ExportResponseDto> {
    const scene = await this.sceneRepo.findById(id);
    if (!scene) {
      throw new NotFoundException(`Creative project "${id}" not found.`);
    }

    try {
      const result = await this.exportPosterUseCase.execute({
        creativeJobId: scene.creativeJobId,
        format: dto.format,
        encoding: dto.encoding,
        ...(dto.quality !== undefined ? { quality: dto.quality } : {}),
        actorUserId: employee.id,
        actorRoles: employee.roles,
      });

      return {
        ...(result.exportId ? { exportId: result.exportId } : {}),
        ...(result.storageKey ? { storageKey: result.storageKey } : {}),
        filename: result.filename,
        width: result.width,
        height: result.height,
        sha256: result.sha256,
        byteSize: result.byteSize,
        mimeType: result.mimeType,
        downloadUrl: `/v1/creative/exports/${result.exportId ?? id}/download`,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(message);
    }
  }

  @Get('exports/:id/download')
  @ApiOperation({ summary: 'Direct authorized download of exported poster asset' })
  public async downloadExport(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const asset = await this.visualAssetRepo.findById(id);
    if (asset) {
      const buffer = await this.storage.getAssetBuffer(asset.storageKey);
      if (buffer) {
        res.setHeader('Content-Type', asset.mimeType || 'image/png');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="parisian-creative-${asset.id.slice(0, 8)}.png"`,
        );
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
        return;
      }
    }

    throw new NotFoundException(`Export "${id}" not found or file expired.`);
  }
}
