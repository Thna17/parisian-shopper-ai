import { useAuth } from '../context/auth-context.js';
import { type Permission, type RoleCode } from '../../../types/auth.types.js';

export interface UsePermissionsResult {
  permissions: readonly Permission[];
  roles: readonly RoleCode[];
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (targetPermissions: readonly Permission[]) => boolean;
  hasAllPermissions: (targetPermissions: readonly Permission[]) => boolean;
  hasRole: (role: RoleCode) => boolean;
}

export function usePermissions(): UsePermissionsResult {
  const { employee } = useAuth();
  const permissions = employee?.permissions ?? [];
  const roles = employee?.roles ?? [];

  const hasPermission = (permission: Permission): boolean => {
    return permissions.includes(permission);
  };

  const hasAnyPermission = (targetPermissions: readonly Permission[]): boolean => {
    return targetPermissions.some((p) => permissions.includes(p));
  };

  const hasAllPermissions = (targetPermissions: readonly Permission[]): boolean => {
    return targetPermissions.every((p) => permissions.includes(p));
  };

  const hasRole = (role: RoleCode): boolean => {
    return roles.includes(role);
  };

  return {
    permissions,
    roles,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
  };
}
