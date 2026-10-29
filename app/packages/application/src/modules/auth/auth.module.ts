import { Module } from '@nestjs/common';
import { AuthenticateEmployeeUseCase } from './application/authenticate-employee.use-case.js';
import { GetCurrentEmployeeUseCase } from './application/get-current-employee.use-case.js';
import { LogoutUseCase } from './application/logout.use-case.js';
import { PASSWORD_HASHER } from './domain/password-hasher.port.js';
import { PermissionService } from './domain/permissions.js';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher.js';

@Module({
  providers: [
    PermissionService,
    Argon2PasswordHasher,
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    AuthenticateEmployeeUseCase,
    GetCurrentEmployeeUseCase,
    LogoutUseCase,
  ],
  exports: [
    PermissionService,
    PASSWORD_HASHER,
    Argon2PasswordHasher,
    AuthenticateEmployeeUseCase,
    GetCurrentEmployeeUseCase,
    LogoutUseCase,
  ],
})
export class AuthModule {}
