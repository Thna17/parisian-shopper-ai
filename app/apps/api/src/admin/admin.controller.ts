import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CreateEmployeeUseCase,
  CreateOnboardingTokenUseCase,
  GetEmployeeDetailUseCase,
  GetSystemSettingsUseCase,
  ListAdminAuditLogsUseCase,
  ListEmployeeSessionsUseCase,
  ListEmployeesUseCase,
  Permission,
  ReactivateEmployeeUseCase,
  RevokeEmployeeSessionsUseCase,
  SuspendEmployeeUseCase,
  UpdateEmployeeProfileUseCase,
  UpdateEmployeeRolesUseCase,
  UpdateSystemSettingsUseCase,
  type AuditEventRecord,
  type EmployeeDetail,
  type EmployeeSummary,
  type PaginatedResult,
  type SafeUserSession,
  type SanitizedEmployeeDto,
  type SystemSettingRecord,
  type SystemSettingsOverview,
} from '@parisian-shopper/application';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';

import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { ListAdminAuditQueryDto } from './dto/list-admin-audit-query.dto.js';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto.js';
import { RevokeSessionsDto } from './dto/revoke-sessions.dto.js';
import { SuspendEmployeeDto } from './dto/suspend-employee.dto.js';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto.js';
import { UpdateEmployeeRolesDto } from './dto/update-employee-roles.dto.js';
import { UpdateSystemSettingDto } from './dto/update-system-setting.dto.js';

@ApiTags('Administration & Employee Management')
@ApiCookieAuth('session')
@Controller({ path: 'admin', version: '1' })
@UseGuards(SessionAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.ADMIN)
export class AdminController {
  public constructor(
    private readonly listEmployeesUseCase: ListEmployeesUseCase,
    private readonly getEmployeeDetailUseCase: GetEmployeeDetailUseCase,
    private readonly createEmployeeUseCase: CreateEmployeeUseCase,
    private readonly updateEmployeeProfileUseCase: UpdateEmployeeProfileUseCase,
    private readonly updateEmployeeRolesUseCase: UpdateEmployeeRolesUseCase,
    private readonly suspendEmployeeUseCase: SuspendEmployeeUseCase,
    private readonly reactivateEmployeeUseCase: ReactivateEmployeeUseCase,
    private readonly listEmployeeSessionsUseCase: ListEmployeeSessionsUseCase,
    private readonly revokeEmployeeSessionsUseCase: RevokeEmployeeSessionsUseCase,
    private readonly createOnboardingTokenUseCase: CreateOnboardingTokenUseCase,
    private readonly getSystemSettingsUseCase: GetSystemSettingsUseCase,
    private readonly updateSystemSettingsUseCase: UpdateSystemSettingsUseCase,
    private readonly listAdminAuditLogsUseCase: ListAdminAuditLogsUseCase,
  ) {}

  @Get('employees')
  @ApiOperation({ summary: 'List employees with search, role/status filtering, and pagination' })
  @ApiOkResponse({ description: 'Paginated list of employees' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Requires ADMIN permission' })
  public async listEmployees(
    @Query() query: ListEmployeesQueryDto,
  ): Promise<PaginatedResult<EmployeeSummary>> {
    return this.listEmployeesUseCase.execute({
      search: query.search,
      role: query.role,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }

  @Post('employees')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Provision a new employee and generate single-use onboarding token' })
  @ApiOkResponse({ description: 'Employee successfully created with onboarding invitation' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Requires ADMIN permission' })
  public async createEmployee(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<{ employee: EmployeeDetail; rawOnboardingToken: string; expiresAt: Date }> {
    return this.createEmployeeUseCase.execute({
      displayName: dto.displayName,
      roles: dto.roles,
      actorUserId: actor.id,
    });
  }

  @Get('employees/:id')
  @ApiOperation({ summary: 'Get complete employee detail including linked Telegram and activity' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  @ApiOkResponse({ description: 'Employee detail record' })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  public async getEmployeeDetail(@Param('id', ParseUUIDPipe) id: string): Promise<EmployeeDetail> {
    return this.getEmployeeDetailUseCase.execute(id);
  }

  @Patch('employees/:id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Update employee profile details (e.g. display name)' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  @ApiOkResponse({ description: 'Employee profile updated' })
  public async updateEmployeeProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeProfileDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<EmployeeDetail> {
    return this.updateEmployeeProfileUseCase.execute({
      id,
      displayName: dto.displayName,
      actorUserId: actor.id,
    });
  }

  @Patch('employees/:id/role')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Update roles assigned to an employee (Four-Eyes & Admin Safeguards)' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  @ApiOkResponse({ description: 'Employee roles updated' })
  public async updateEmployeeRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeRolesDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<EmployeeDetail> {
    return this.updateEmployeeRolesUseCase.execute({
      id,
      roles: dto.roles,
      actorUserId: actor.id,
    });
  }

  @Post('employees/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Suspend employee account and revoke active sessions immediately' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  @ApiOkResponse({ description: 'Employee suspended and sessions revoked' })
  public async suspendEmployee(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendEmployeeDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<EmployeeDetail> {
    return this.suspendEmployeeUseCase.execute({
      id,
      actorUserId: actor.id,
      reason: dto.reason,
    });
  }

  @Post('employees/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Reactivate previously suspended employee account' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  @ApiOkResponse({ description: 'Employee reactivated' })
  public async reactivateEmployee(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<EmployeeDetail> {
    return this.reactivateEmployeeUseCase.execute({
      id,
      actorUserId: actor.id,
    });
  }

  @Get('employees/:id/sessions')
  @ApiOperation({ summary: 'List safe session metadata for an employee' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  @ApiOkResponse({ description: 'Employee session metadata' })
  public async getEmployeeSessions(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ sessions: readonly SafeUserSession[] }> {
    const sessions = await this.listEmployeeSessionsUseCase.execute(id);
    return { sessions };
  }

  @Post('employees/:id/revoke-sessions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Revoke single or all active sessions for an employee' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  @ApiOkResponse({ description: 'Sessions revoked' })
  public async revokeSessions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeSessionsDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<{ revokedCount: number }> {
    return this.revokeEmployeeSessionsUseCase.execute({
      userId: id,
      sessionId: dto.sessionId,
      actorUserId: actor.id,
    });
  }

  @Post('employees/:id/onboarding-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Generate a new single-use onboarding invitation token for employee' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  @ApiOkResponse({ description: 'Onboarding invitation token created' })
  public async createOnboardingToken(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<{ rawOnboardingToken: string; expiresAt: Date }> {
    return this.createOnboardingTokenUseCase.execute({
      userId: id,
      actorUserId: actor.id,
    });
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get workspace system settings' })
  @ApiOkResponse({ description: 'System configuration settings' })
  public async getSettings(): Promise<SystemSettingsOverview> {
    return this.getSystemSettingsUseCase.execute();
  }

  @Patch('settings')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Upsert system configuration setting' })
  @ApiOkResponse({ description: 'Setting updated' })
  public async updateSetting(
    @Body() dto: UpdateSystemSettingDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): Promise<SystemSettingRecord> {
    return this.updateSystemSettingsUseCase.execute({
      key: dto.key,
      value: dto.value,
      category: dto.category,
      description: dto.description,
      actorUserId: actor.id,
    });
  }

  @Get('audit')
  @ApiOperation({ summary: 'Query administrative audit log with filtering and pagination' })
  @ApiOkResponse({ description: 'Paginated administrative audit events' })
  public async listAudit(
    @Query() query: ListAdminAuditQueryDto,
  ): Promise<PaginatedResult<AuditEventRecord>> {
    return this.listAdminAuditLogsUseCase.execute({
      actorUserId: query.actorUserId,
      action: query.action,
      resourceType: query.resourceType,
      fromDate: query.fromDate,
      toDate: query.toDate,
      page: query.page,
      limit: query.limit,
    });
  }
}
