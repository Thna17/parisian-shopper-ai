import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ClaimOnboardingInvitationUseCase } from './application/use-cases/claim-onboarding-invitation.use-case.js';
import { CreateEmployeeUseCase } from './application/use-cases/create-employee.use-case.js';
import { CreateOnboardingTokenUseCase } from './application/use-cases/create-onboarding-token.use-case.js';
import { GetEmployeeDetailUseCase } from './application/use-cases/get-employee-detail.use-case.js';
import { GetSystemSettingsUseCase } from './application/use-cases/get-system-settings.use-case.js';
import { ListAdminAuditLogsUseCase } from './application/use-cases/list-admin-audit-logs.use-case.js';
import { ListEmployeeSessionsUseCase } from './application/use-cases/list-employee-sessions.use-case.js';
import { ListEmployeesUseCase } from './application/use-cases/list-employees.use-case.js';
import { ReactivateEmployeeUseCase } from './application/use-cases/reactivate-employee.use-case.js';
import { RevokeEmployeeSessionsUseCase } from './application/use-cases/revoke-employee-sessions.use-case.js';
import { SuspendEmployeeUseCase } from './application/use-cases/suspend-employee.use-case.js';
import { UpdateEmployeeProfileUseCase } from './application/use-cases/update-employee-profile.use-case.js';
import { UpdateEmployeeRolesUseCase } from './application/use-cases/update-employee-roles.use-case.js';
import { UpdateSystemSettingsUseCase } from './application/use-cases/update-system-settings.use-case.js';

const USE_CASES = [
  ListEmployeesUseCase,
  GetEmployeeDetailUseCase,
  CreateEmployeeUseCase,
  UpdateEmployeeProfileUseCase,
  UpdateEmployeeRolesUseCase,
  SuspendEmployeeUseCase,
  ReactivateEmployeeUseCase,
  ListEmployeeSessionsUseCase,
  RevokeEmployeeSessionsUseCase,
  CreateOnboardingTokenUseCase,
  ClaimOnboardingInvitationUseCase,
  GetSystemSettingsUseCase,
  UpdateSystemSettingsUseCase,
  ListAdminAuditLogsUseCase,
];

@Module({
  imports: [AuthModule],
  providers: [...USE_CASES],
  exports: [...USE_CASES],
})
export class AdminApplicationModule {}
