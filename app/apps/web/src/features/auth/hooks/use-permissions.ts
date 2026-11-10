import { useAuth } from '../context/auth-context.js';
import { Permission, type RoleCode } from '../../../types/auth.types.js';

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
    if (permissions.includes(Permission.ADMIN) || roles.includes('ADMIN')) {
      return true;
    }
    if (
      permission === Permission.FINANCE_READ &&
      (permissions.includes(Permission.VIEW_AI_COSTS) ||
        permissions.includes(Permission.FINANCE_READ))
    ) {
      return true;
    }
    if (
      permission === Permission.FINANCE_WRITE &&
      (permissions.includes(Permission.MANAGE_AI_BUDGETS) ||
        permissions.includes(Permission.FINANCE_WRITE))
    ) {
      return true;
    }
    return permissions.includes(permission);
  };

  const hasAnyPermission = (targetPermissions: readonly Permission[]): boolean => {
    return targetPermissions.some((p) => hasPermission(p));
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
