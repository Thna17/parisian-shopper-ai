import {
  Controller,
  Inject,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
  Module,
  BadRequestException,
  Body,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  Permission,
  USER_ACCOUNT_REPOSITORY,
  type UserAccountRepository,
  type SanitizedEmployeeDto,
} from '@parisian-shopper/application';
import {
  HiggsfieldMcpService,
  PostImageProvidersModule,
  McpBeforeSubmitError,
} from '@parisian-shopper/creative-providers';
import { AuthModule } from '../auth/auth.module.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
class CallbackDto {
  @IsOptional() @IsString() @MaxLength(2048) code?: string;
  @IsOptional() @IsString() @MaxLength(256) state?: string;
  @IsOptional() @IsString() @MaxLength(256) iss?: string;
  @IsOptional() @IsString() @MaxLength(100) error?: string;
}
class WorkspaceDto {
  @IsString() @MaxLength(200) workspaceId!: string;
}
@Controller({ path: 'integrations/higgsfield-mcp', version: '1' })
@UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
@RequirePermissions(Permission.ADMIN)
export class HiggsfieldMcpController {
  constructor(private readonly mcp: HiggsfieldMcpService) {}
  @Get() status(): ReturnType<HiggsfieldMcpService['status']> {
    return this.mcp.status();
  }
  @Get('workspaces') workspaces(): ReturnType<HiggsfieldMcpService['workspaces']> {
    return this.mcp.workspaces();
  }
  @Post('workspace') async selectWorkspace(
    @CurrentUser() actor: SanitizedEmployeeDto,
    @Body() dto: WorkspaceDto,
  ): ReturnType<HiggsfieldMcpService['selectWorkspace']> {
    try {
      return await this.mcp.selectWorkspace(actor.id, dto.workspaceId);
    } catch (error) {
      throw new BadRequestException(
        error instanceof McpBeforeSubmitError
          ? error.message
          : 'The workspace could not be selected. Check the connection and try again.',
      );
    }
  }
  @Post('connect') async connect(
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<HiggsfieldMcpService['connect']> {
    try {
      return await this.mcp.connect(actor.id);
    } catch {
      throw new BadRequestException(
        'Could not connect Higgsfield. Check server encryption, registered callback URL and application-client support.',
      );
    }
  }
  @Post('check') async check(): ReturnType<HiggsfieldMcpService['connectionCheck']> {
    try {
      return await this.mcp.connectionCheck();
    } catch (error) {
      if (error instanceof McpBeforeSubmitError) throw new BadRequestException(error.message);
      throw new BadRequestException(
        'The MCP connection or required tool contract could not be verified. Reconnect or ask an administrator to check setup.',
      );
    }
  }
  @Post('disconnect') async disconnect(
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<{ disconnected: boolean }> {
    await this.mcp.disconnect(actor.id);
    return { disconnected: true };
  }
}
// OAuth callback is authorized by one-use, expiring server-held state + PKCE, not an ambient browser cookie.
// Production staff cookies are SameSite=Strict and are absent on a cross-site OAuth redirect.
@Controller({ path: 'integrations/higgsfield-mcp', version: '1' })
export class HiggsfieldMcpCallbackController {
  constructor(
    private readonly mcp: HiggsfieldMcpService,
    @Inject(USER_ACCOUNT_REPOSITORY) private readonly accounts: UserAccountRepository,
  ) {}
  @Get('callback') async callback(
    @Query() query: CallbackDto,
    @Res() response: Response,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (query.error || !query.code || !query.state)
      throw new BadRequestException(
        'Higgsfield authorization was not completed. Start Connect Higgsfield again.',
      );
    try {
      const actorId = await this.mcp.callbackActor(query.state);
      const actor = await this.accounts.findById(actorId);
      if (!actor || actor.status !== 'ACTIVE' || !actor.permissions.includes(Permission.ADMIN))
        throw new Error('Administrator authorization is no longer active.');
      await this.mcp.callback(actor.id, query.state, query.code, query.iss);
    } catch {
      throw new BadRequestException(
        'Higgsfield authorization expired or could not be verified. Start Connect Higgsfield again.',
      );
    }
    // Configure the callback on the staff site's reverse proxy, not a separately exposed API origin.
    response.redirect(303, '/settings/higgsfield?connection=updated');
  }
}
@Module({
  imports: [AuthModule, PostImageProvidersModule],
  controllers: [HiggsfieldMcpController, HiggsfieldMcpCallbackController],
})
export class HiggsfieldMcpApiModule {}
