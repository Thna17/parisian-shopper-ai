import { type Permission, type RoleCode } from './permissions.js';
import { type PasswordCredentialRecord } from './credential.js';

export interface AuthenticatedUserAccount {
  readonly id: string;
  readonly displayName: string;
  readonly status: 'ACTIVE' | 'DISABLED';
  readonly disabledAt: Date | null;
  readonly roles: readonly RoleCode[];
  readonly permissions: readonly Permission[];
  readonly passwordCredential: PasswordCredentialRecord | null;
}

export interface SanitizedEmployeeDto {
  readonly id: string;
  readonly displayName: string;
  readonly status: 'ACTIVE' | 'DISABLED';
  readonly roles: readonly RoleCode[];
  readonly permissions: readonly Permission[];
}

export function sanitizeUserAccount(account: AuthenticatedUserAccount): SanitizedEmployeeDto {
  return {
    id: account.id,
    displayName: account.displayName,
    status: account.status,
    roles: account.roles,
    permissions: account.permissions,
  };
}
