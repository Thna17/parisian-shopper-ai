import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Permission } from '@parisian-shopper/application';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator.js';
import { type AuthenticatedRequest } from './session-auth.guard.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  public constructor(private readonly reflector: Reflector) {}

  public canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user || !user.permissions) {
      throw new ForbiddenException('Access denied: no user credentials attached.');
    }

    const userPermissions = new Set(user.permissions);
    const hasAll = requiredPermissions.every((perm) => userPermissions.has(perm));

    if (!hasAll) {
      throw new ForbiddenException(
        `Access denied: missing required permissions (${requiredPermissions.join(', ')}).`,
      );
    }

    return true;
  }
}
