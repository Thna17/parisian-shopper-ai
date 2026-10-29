import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AuthenticateEmployeeUseCase,
  LogoutUseCase,
  type SanitizedEmployeeDto,
} from '@parisian-shopper/application';
import { type Request, type Response } from 'express';
import { clearSessionCookie, setSessionCookie } from './auth-cookie.util.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { AuthResponseDto, LogoutResponseDto } from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { CsrfGuard } from './guards/csrf.guard.js';
import { type AuthenticatedRequest, SessionAuthGuard } from './guards/session-auth.guard.js';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  private readonly isProduction = process.env['NODE_ENV'] === 'production';

  public constructor(
    @Inject(AuthenticateEmployeeUseCase)
    private readonly authenticateEmployeeUseCase: AuthenticateEmployeeUseCase,
    @Inject(LogoutUseCase)
    private readonly logoutUseCase: LogoutUseCase,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Employee web login' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Authentication successful', type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid login credentials' })
  @ApiForbiddenResponse({ description: 'Account suspended or temporarily locked' })
  public async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authenticateEmployeeUseCase.execute({
      loginIdentifier: dto.loginIdentifier,
      password: dto.password,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });

    setSessionCookie(res, result.rawSessionToken, { isProduction: this.isProduction });

    return { user: result.user };
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth('ps_session')
  @ApiOperation({ summary: 'Get currently authenticated employee profile' })
  @ApiOkResponse({ description: 'Current authenticated employee', type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Session invalid or expired' })
  public me(@CurrentUser() user: SanitizedEmployeeDto): AuthResponseDto {
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @ApiCookieAuth('ps_session')
  @ApiOperation({ summary: 'Logout and revoke employee session' })
  @ApiOkResponse({ description: 'Logged out successfully', type: LogoutResponseDto })
  public async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LogoutResponseDto> {
    if (req.sessionToken) {
      await this.logoutUseCase.execute({ rawSessionToken: req.sessionToken });
    }

    clearSessionCookie(res, { isProduction: this.isProduction });

    return {
      ok: true,
      message: 'Logged out successfully',
    };
  }
}
