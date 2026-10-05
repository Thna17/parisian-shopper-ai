import { describe, expect, it } from '@jest/globals';

import { Permission, PermissionService, RoleCode } from './permissions.js';

describe('Telegram role permissions', () => {
  const permissions = new PermissionService();

  it('allows viewers to inspect products but not create content', () => {
    expect(permissions.hasAnyRolePermission([RoleCode.VIEWER], Permission.VIEW_PRODUCTS)).toBe(
      true,
    );
    expect(permissions.hasAnyRolePermission([RoleCode.VIEWER], Permission.CREATE_CONTENT)).toBe(
      false,
    );
  });

  it.each([RoleCode.MARKETING_EDITOR, RoleCode.MARKETING_APPROVER, RoleCode.ADMIN])(
    'allows %s to request content generation',
    (role) => {
      expect(permissions.hasAnyRolePermission([role], Permission.CREATE_CONTENT)).toBe(true);
    },
  );

  it('grants no permissions to an unknown role', () => {
    expect(permissions.hasAnyRolePermission(['INVENTED_ROLE'], Permission.VIEW_PRODUCTS)).toBe(
      false,
    );
  });
});
