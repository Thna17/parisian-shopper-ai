export const RoleCode = {
  VIEWER: 'VIEWER',
  MARKETING_EDITOR: 'MARKETING_EDITOR',
  MARKETING_APPROVER: 'MARKETING_APPROVER',
  ADMIN: 'ADMIN',
} as const;
export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];

export const Permission = {
  VIEW_PRODUCTS: 'VIEW_PRODUCTS',
  VIEW_OWN_CONTENT: 'VIEW_OWN_CONTENT',
  VIEW_ALL_CONTENT: 'VIEW_ALL_CONTENT',
  CREATE_CONTENT: 'CREATE_CONTENT',
  EDIT_CONTENT: 'EDIT_CONTENT',
  REGENERATE_CONTENT: 'REGENERATE_CONTENT',
  APPROVE_CONTENT: 'APPROVE_CONTENT',
  REJECT_CONTENT: 'REJECT_CONTENT',
  EDIT_CREATIVE: 'EDIT_CREATIVE',
  REGENERATE_CREATIVE: 'REGENERATE_CREATIVE',
  APPROVE_CREATIVE: 'APPROVE_CREATIVE',
  REJECT_CREATIVE: 'REJECT_CREATIVE',
  EXPORT_CREATIVE: 'EXPORT_CREATIVE',
  PUBLISH_CREATIVE: 'PUBLISH_CREATIVE',
  VERIFY_PRODUCT_ASSET_RIGHTS: 'VERIFY_PRODUCT_ASSET_RIGHTS',
  VIEW_OPERATIONAL_ANALYTICS: 'VIEW_OPERATIONAL_ANALYTICS',
  VIEW_AI_COSTS: 'VIEW_AI_COSTS',
  MANAGE_AI_BUDGETS: 'MANAGE_AI_BUDGETS',
  ADMIN: 'ADMIN',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const ROLE_PERMISSIONS: Readonly<Record<RoleCode, readonly Permission[]>> = {
  VIEWER: [Permission.VIEW_PRODUCTS, Permission.VIEW_OWN_CONTENT],
  MARKETING_EDITOR: [
    Permission.VIEW_PRODUCTS,
    Permission.VIEW_OWN_CONTENT,
    Permission.CREATE_CONTENT,
    Permission.EDIT_CONTENT,
    Permission.REGENERATE_CONTENT,
    Permission.EDIT_CREATIVE,
    Permission.REGENERATE_CREATIVE,
    Permission.VIEW_OPERATIONAL_ANALYTICS,
  ],
  MARKETING_APPROVER: [
    Permission.VIEW_PRODUCTS,
    Permission.VIEW_OWN_CONTENT,
    Permission.CREATE_CONTENT,
    Permission.EDIT_CONTENT,
    Permission.REGENERATE_CONTENT,
    Permission.APPROVE_CONTENT,
    Permission.REJECT_CONTENT,
    Permission.EDIT_CREATIVE,
    Permission.REGENERATE_CREATIVE,
    Permission.APPROVE_CREATIVE,
    Permission.REJECT_CREATIVE,
    Permission.EXPORT_CREATIVE,
    Permission.VERIFY_PRODUCT_ASSET_RIGHTS,
    Permission.VIEW_OPERATIONAL_ANALYTICS,
    Permission.VIEW_AI_COSTS,
  ],
  ADMIN: [
    Permission.VIEW_PRODUCTS,
    Permission.VIEW_OWN_CONTENT,
    Permission.VIEW_ALL_CONTENT,
    Permission.CREATE_CONTENT,
    Permission.EDIT_CONTENT,
    Permission.REGENERATE_CONTENT,
    Permission.APPROVE_CONTENT,
    Permission.REJECT_CONTENT,
    Permission.EDIT_CREATIVE,
    Permission.REGENERATE_CREATIVE,
    Permission.APPROVE_CREATIVE,
    Permission.REJECT_CREATIVE,
    Permission.EXPORT_CREATIVE,
    Permission.PUBLISH_CREATIVE,
    Permission.VERIFY_PRODUCT_ASSET_RIGHTS,
    Permission.VIEW_OPERATIONAL_ANALYTICS,
    Permission.VIEW_AI_COSTS,
    Permission.MANAGE_AI_BUDGETS,
    Permission.ADMIN,
  ],
};

export class PermissionService {
  public hasAnyRolePermission(roles: readonly string[], permission: Permission): boolean {
    return hasAnyRolePermission(roles, permission);
  }

  public resolvePermissions(roles: readonly string[]): readonly Permission[] {
    return resolvePermissionsForRoles(roles);
  }
}

export function hasAnyRolePermission(roles: readonly string[], permission: Permission): boolean {
  return roles.some((role) => {
    const normalized = role.toUpperCase();
    return isRoleCode(normalized) ? ROLE_PERMISSIONS[normalized].includes(permission) : false;
  });
}

export function resolvePermissionsForRoles(roles: readonly string[]): readonly Permission[] {
  const permissionsSet = new Set<Permission>();
  for (const role of roles) {
    const normalized = role.toUpperCase();
    if (isRoleCode(normalized)) {
      for (const permission of ROLE_PERMISSIONS[normalized]) {
        permissionsSet.add(permission);
      }
    }
  }
  return Array.from(permissionsSet);
}

function isRoleCode(value: string): value is RoleCode {
  return Object.values(RoleCode).some((role) => role === value);
}
