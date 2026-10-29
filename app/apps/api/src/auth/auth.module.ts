import { Module } from '@nestjs/common';
import { AuthModule as CoreAuthModule } from '@parisian-shopper/application';
import { AppConfigModule } from '@parisian-shopper/config';
import { AuthController } from './auth.controller.js';
import { CsrfGuard } from './guards/csrf.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { SessionAuthGuard } from './guards/session-auth.guard.js';

@Module({
  imports: [CoreAuthModule, AppConfigModule],
  controllers: [AuthController],
  providers: [SessionAuthGuard, PermissionsGuard, CsrfGuard],
  exports: [SessionAuthGuard, PermissionsGuard, CsrfGuard, CoreAuthModule],
})
export class AuthModule {}
