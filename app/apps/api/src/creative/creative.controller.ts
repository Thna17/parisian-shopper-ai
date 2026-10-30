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
import { ForbiddenError } from '@parisian-shopper/common';
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
  ApproveCreativeUseCase,
  RejectCreativeUseCase,
  type CreativeSceneVersionRecord,
  type SceneLayerDraft,
  type SceneLayerRecord,
  ASSET_STORAGE,
  type AssetStoragePort,
  VISUAL_ASSET_REPOSITORY,
  type VisualAssetRepository,
  CREATIVE_SCENE_REPOSITORY,
  type CreativeSceneRepository,
  CREATIVE_JOB_REPOSITORY,
  type CreativeJobRepository,
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
import { ApproveCreativeProjectDto } from './dto/approve-creative-project.dto.js';
import { RejectCreativeProjectDto } from './dto/reject-creative-project.dto.js';
import {
  type ExportResponseDto,
  type PaginatedCreativeProjectsResponseDto,
  type CreativeProjectDetailResponseDto,
  type RenderPreviewResponseDto,
  type TemplateListResponseDto,
  type ValidationResponseDto,
  type CreativeApprovalResponseDto,
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
    private readonly approveCreativeUseCase: ApproveCreativeUseCase,
    private readonly rejectCreativeUseCase: RejectCreativeUseCase,
    @Inject(ASSET_STORAGE)
    private readonly storage: AssetStoragePort,
    @Inject(VISUAL_ASSET_REPOSITORY)
    private readonly visualAssetRepo: VisualAssetRepository,
    @Inject(CREATIVE_SCENE_REPOSITORY)
    private readonly sceneRepo: CreativeSceneRepository,
    @Inject(CREATIVE_JOB_REPOSITORY)
    private readonly jobRepo: CreativeJobRepository,
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
  public async streamRenderFile(
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser() employee: SanitizedEmployeeDto,
  ): Promise<void> {
    const asset = await this.visualAssetRepo.findById(id);
    if (!asset) {
      throw new NotFoundException(`Visual asset "${id}" not found.`);
    }

    if (
      !employee.roles.includes('ADMIN') &&
      !employee.permissions.includes(Permission.VIEW_ALL_CONTENT)
    ) {
      const job = await this.jobRepo.findById(asset.creativeJobId);
      if (job && job.requestedByUserId && job.requestedByUserId !== employee.id) {
        throw new ForbiddenError({ publicMessage: 'Permission denied: Cannot view this render.' });
      }
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

  @Post('projects/:id/approve')
  @UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
  @RequirePermissions(Permission.APPROVE_CREATIVE)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('ps_session')
  @ApiOperation({ summary: 'Approve exact creative scene version (enforces Four-Eyes)' })
  public async approveProject(
    @Param('id') id: string,
    @CurrentUser() employee: SanitizedEmployeeDto,
    @Body() dto?: ApproveCreativeProjectDto,
  ): Promise<CreativeApprovalResponseDto> {
    const scene = await this.sceneRepo.findById(id);
    if (!scene) {
      throw new NotFoundException(`Creative project "${id}" not found.`);
    }

    try {
      const result = await this.approveCreativeUseCase.execute({
        creativeJobId: scene.creativeJobId,
        ...(dto?.visualAssetId ? { visualAssetId: dto.visualAssetId } : {}),
        ...(dto?.sceneVersionId ? { sceneVersionId: dto.sceneVersionId } : {}),
        approvedBy: employee.id,
        approverRoles: employee.roles,
        ...(dto?.comment ? { comment: dto.comment } : {}),
      });

      return {
        approvalEventId: result.approvalEvent.id,
        creativeJobId: result.approvalEvent.creativeJobId,
        visualAssetId: result.approvalEvent.visualAssetId,
        ...(result.approvalEvent.sceneVersionId
          ? { sceneVersionId: result.approvalEvent.sceneVersionId }
          : {}),
        decision: result.approvalEvent.decision,
        approverUserId: result.approvalEvent.approverUserId,
        ...(result.approvalEvent.approverDisplayName
          ? { approverDisplayName: result.approvalEvent.approverDisplayName }
          : { approverDisplayName: employee.displayName }),
        ...(result.approvalEvent.comment ? { comment: result.approvalEvent.comment } : {}),
        createdAt: result.approvalEvent.createdAt.toISOString(),
      };
    } catch (err: unknown) {
      if (err instanceof ForbiddenError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(message);
    }
  }

  @Post('projects/:id/reject')
  @UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
  @RequirePermissions(Permission.REJECT_CREATIVE)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('ps_session')
  @ApiOperation({ summary: 'Reject creative scene version with mandatory reason' })
  public async rejectProject(
    @Param('id') id: string,
    @CurrentUser() employee: SanitizedEmployeeDto,
    @Body() dto: RejectCreativeProjectDto,
  ): Promise<CreativeApprovalResponseDto> {
    const scene = await this.sceneRepo.findById(id);
    if (!scene) {
      throw new NotFoundException(`Creative project "${id}" not found.`);
    }

    try {
      const result = await this.rejectCreativeUseCase.execute({
        creativeJobId: scene.creativeJobId,
        ...(dto.visualAssetId ? { visualAssetId: dto.visualAssetId } : {}),
        ...(dto.sceneVersionId ? { sceneVersionId: dto.sceneVersionId } : {}),
        rejectedBy: employee.id,
        rejecterRoles: employee.roles,
        comment: dto.reason,
      });

      return {
        approvalEventId: result.approvalEvent.id,
        creativeJobId: result.approvalEvent.creativeJobId,
        visualAssetId: result.approvalEvent.visualAssetId,
        ...(result.approvalEvent.sceneVersionId
          ? { sceneVersionId: result.approvalEvent.sceneVersionId }
          : {}),
        decision: result.approvalEvent.decision,
        approverUserId: result.approvalEvent.approverUserId,
        ...(result.approvalEvent.approverDisplayName
          ? { approverDisplayName: result.approvalEvent.approverDisplayName }
          : { approverDisplayName: employee.displayName }),
        ...(result.approvalEvent.comment ? { comment: result.approvalEvent.comment } : {}),
        createdAt: result.approvalEvent.createdAt.toISOString(),
      };
    } catch (err: unknown) {
      if (err instanceof ForbiddenError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(message);
    }
  }

  @Post('projects/:id/submit')
  @UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
  @RequirePermissions(Permission.EDIT_CREATIVE)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('ps_session')
  @ApiOperation({ summary: 'Submit creative scene version for independent review' })
  public async submitProject(
    @Param('id') id: string,
    @CurrentUser() _employee: SanitizedEmployeeDto,
    @Body() _dto?: { versionNumber?: number },
  ): Promise<{ status: string }> {
    const scene = await this.sceneRepo.findById(id);
    if (!scene) {
      throw new NotFoundException(`Creative project "${id}" not found.`);
    }

    const job = await this.jobRepo.findById(scene.creativeJobId);
    if (!job) {
      throw new NotFoundException(`Creative job for project "${id}" not found.`);
    }

    if (job.status !== 'READY_FOR_REVIEW') {
      await this.jobRepo.transitionStatus(job.id, job.status, 'READY_FOR_REVIEW');
    }

    const latestVersion = await this.sceneRepo.findLatestVersionBySceneId(scene.id);
    if (latestVersion && this.sceneRepo.updateVersionState) {
      await this.sceneRepo.updateVersionState(latestVersion.id, {
        status: 'READY_FOR_REVIEW',
        isExportEligible: false,
      });
    }

    return { status: 'READY_FOR_REVIEW' };
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
        ...(dto.visualAssetId ? { visualAssetId: dto.visualAssetId } : {}),
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
