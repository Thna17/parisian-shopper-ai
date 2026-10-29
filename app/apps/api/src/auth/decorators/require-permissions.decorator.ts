import { type CustomDecorator, SetMetadata } from '@nestjs/common';
import { type Permission } from '@parisian-shopper/application';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: Permission[]): CustomDecorator<string> =>
  SetMetadata(PERMISSIONS_KEY, permissions);
