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
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export interface AuthenticatedEmployee {
  readonly id: string;
  readonly displayName: string;
  readonly status: 'ACTIVE' | 'DISABLED';
  readonly roles: readonly RoleCode[];
  readonly permissions: readonly Permission[];
}

export interface LoginCredentials {
  readonly loginIdentifier: string;
  readonly password: string;
}

export interface AuthResponse {
  readonly user: AuthenticatedEmployee;
}

export interface LogoutResponse {
  readonly ok: boolean;
  readonly message: string;
}
