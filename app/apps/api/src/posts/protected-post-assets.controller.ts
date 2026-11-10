import {
  Controller,
  Get,
  Inject,
  Param,
  Res,
  UseGuards,
  VERSION_NEUTRAL,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ASSET_STORAGE,
  type AssetStoragePort,
  Permission,
  type SanitizedEmployeeDto,
} from '@parisian-shopper/application';
import { PrismaPostRepository } from '@parisian-shopper/database';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
/** Keep existing CAS URLs usable as private previews; never serve creative bytes from public static middleware. */
@Controller({ path: 'assets/cas', version: VERSION_NEUTRAL })
@UseGuards(SessionAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.VIEW_OWN_CONTENT)
export class ProtectedPostAssetsController {
  constructor(
    private readonly posts: PrismaPostRepository,
    @Inject(ASSET_STORAGE) private readonly storage: AssetStoragePort,
  ) {}
  @Get(':a/:b/:file') async preview(
    @Param('a') a: string,
    @Param('b') b: string,
    @Param('file') file: string,
    @CurrentUser() actor: SanitizedEmployeeDto,
    @Res() res: Response,
  ): Promise<void> {
    const key = `cas/${a}/${b}/${file}`;
    if (
      !/^cas\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}\.(png|jpg|jpeg|webp)$/.test(key) ||
      !(await this.posts.canPreviewStorageKey(key, actor))
    )
      throw new NotFoundException('Saved image not found.');
    const bytes = await this.storage.getAssetBuffer(key);
    if (!bytes) throw new NotFoundException('Saved image not found.');
    const extension = file.split('.').at(-1);
    res.setHeader(
      'Content-Type',
      extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg',
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(bytes);
  }
}
