import { Module } from '@nestjs/common';

import { PermissionService } from './domain/permissions.js';

@Module({ providers: [PermissionService], exports: [PermissionService] })
export class AuthModule {}
