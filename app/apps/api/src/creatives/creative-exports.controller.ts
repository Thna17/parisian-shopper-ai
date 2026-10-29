import {
  Controller,
  Get,
  Inject,
  Optional,
  Param,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ASSET_STORAGE,
  CREATIVE_EXPORT_REPOSITORY,
  CreativeExportNotFoundError,
  EXPORT_DOWNLOAD_TOKEN_SERVICE,
  GetCurrentEmployeeUseCase,
  hasAnyRolePermission,
  Permission,
  UnauthorizedSessionError,
  type AssetStoragePort,
  type CreativeExportRepository,
  type ExportDownloadTokenService,
} from '@parisian-shopper/application';
import { ForbiddenError, NotFoundError } from '@parisian-shopper/common';
import { type Request, type Response } from 'express';

import { extractSessionToken } from '../auth/auth-cookie.util.js';
import { DownloadExportQueryDto } from './dto/download-export-query.dto.js';

@ApiTags('creatives')
@Controller({ path: 'creatives', version: '1' })
export class CreativeExportsController {
  public constructor(
    @Inject(CREATIVE_EXPORT_REPOSITORY)
    private readonly exportRepo: CreativeExportRepository,
    @Inject(ASSET_STORAGE)
    private readonly storage: AssetStoragePort,
    @Inject(EXPORT_DOWNLOAD_TOKEN_SERVICE)
    private readonly tokenService: ExportDownloadTokenService,
    @Optional()
    @Inject(GetCurrentEmployeeUseCase)
    private readonly getCurrentEmployeeUseCase?: GetCurrentEmployeeUseCase,
  ) {}

  @Get('exports/:id/download')
  @ApiOperation({
    summary:
      'Stream validated multi-format creative export binary with short-lived token or active session',
  })
  @ApiProduces('image/png', 'image/jpeg')
  @ApiOkResponse({ description: 'File binary stream with attachment headers' })
  @ApiUnauthorizedResponse({ description: 'Authentication required when no token is provided' })
  @ApiForbiddenResponse({
    description: 'Token expired, tampered, or user lacks export permission',
  })
  @ApiNotFoundResponse({ description: 'Export record or CAS binary not found' })
  public async downloadExport(
    @Param('id') exportId: string,
    @Query() query: DownloadExportQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // 1. Authorization: Validate Short-Lived Token OR User Session
    if (query.token) {
      const verification = this.tokenService.verifyToken(query.token, exportId);
      if (!verification.isValid) {
        if (verification.reason === 'EXPIRED') {
          throw new ForbiddenError({ publicMessage: 'Download token has expired.' });
        }
        if (verification.reason === 'EXPORT_MISMATCH') {
          throw new ForbiddenError({
            publicMessage: 'Download token is not valid for this export.',
          });
        }
        throw new ForbiddenError({ publicMessage: 'Invalid or tampered download token.' });
      }
    } else {
      const sessionToken = extractSessionToken(req);
      if (!sessionToken || !this.getCurrentEmployeeUseCase) {
        throw new UnauthorizedSessionError('Authentication or download token required.');
      }

      const user = await this.getCurrentEmployeeUseCase.execute({ rawSessionToken: sessionToken });
      if (!hasAnyRolePermission(user.roles, Permission.EXPORT_CREATIVE)) {
        throw new ForbiddenError({
          publicMessage: 'You do not have permission to export creative assets.',
        });
      }
    }

    // 2. Fetch Export Record from PostgreSQL Ledger
    const exportRecord = await this.exportRepo.findById(exportId);
    if (!exportRecord) {
      throw new CreativeExportNotFoundError(exportId);
    }

    // 3. Fetch Binary Buffer from Content Addressable Storage (CAS)
    const buffer = await this.storage.getAssetBuffer(exportRecord.storageKey);
    if (!buffer) {
      throw new NotFoundError({
        publicMessage: `Asset binary for export "${exportId}" not found in storage.`,
      });
    }

    // 4. Resolve Content-Type, Filename, and Caching Headers
    const isPng = exportRecord.encoding === 'PNG';
    const contentType = isPng ? 'image/png' : 'image/jpeg';
    const extension = isPng ? 'png' : 'jpg';
    const filename = `creative-export-${exportRecord.format.toLowerCase()}-${exportRecord.id.slice(0, 8)}.${extension}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.setHeader('Cache-Control', 'private, max-age=3600, immutable');
    res.setHeader('ETag', `"${exportRecord.sha256}"`);

    return new StreamableFile(buffer);
  }
}
