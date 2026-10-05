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
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const ROLE_PERMISSIONS: Readonly<Record<RoleCode, readonly Permission[]>> = {
  VIEWER: [Permission.VIEW_PRODUCTS, Permission.VIEW_OWN_CONTENT],
  MARKETING_EDITOR: [
    Permission.VIEW_PRODUCTS,
    Permission.VIEW_OWN_CONTENT,
    Permission.CREATE_CONTENT,
  ],
  MARKETING_APPROVER: [
    Permission.VIEW_PRODUCTS,
    Permission.VIEW_OWN_CONTENT,
    Permission.CREATE_CONTENT,
  ],
  ADMIN: [
    Permission.VIEW_PRODUCTS,
    Permission.VIEW_OWN_CONTENT,
    Permission.VIEW_ALL_CONTENT,
    Permission.CREATE_CONTENT,
  ],
};

export class PermissionService {
  public hasAnyRolePermission(roles: readonly string[], permission: Permission): boolean {
    return hasAnyRolePermission(roles, permission);
  }
}

export function hasAnyRolePermission(roles: readonly string[], permission: Permission): boolean {
  return roles.some((role) =>
    isRoleCode(role) ? ROLE_PERMISSIONS[role].includes(permission) : false,
  );
}

function isRoleCode(value: string): value is RoleCode {
  return Object.values(RoleCode).some((role) => role === value);
}
