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

  it('grants no permissions to an unknown role or legacy STAFF role', () => {
    expect(permissions.hasAnyRolePermission(['INVENTED_ROLE'], Permission.VIEW_PRODUCTS)).toBe(
      false,
    );
    expect(permissions.hasAnyRolePermission(['STAFF'], Permission.APPROVE_CREATIVE)).toBe(false);
    expect(permissions.hasAnyRolePermission(['STAFF'], Permission.PUBLISH_CREATIVE)).toBe(false);
  });

  it('allows MARKETING_EDITOR to edit and regenerate creative but not approve, reject, or export', () => {
    const roles = [RoleCode.MARKETING_EDITOR];
    expect(permissions.hasAnyRolePermission(roles, Permission.EDIT_CREATIVE)).toBe(true);
    expect(permissions.hasAnyRolePermission(roles, Permission.REGENERATE_CREATIVE)).toBe(true);
    expect(permissions.hasAnyRolePermission(roles, Permission.APPROVE_CREATIVE)).toBe(false);
    expect(permissions.hasAnyRolePermission(roles, Permission.REJECT_CREATIVE)).toBe(false);
    expect(permissions.hasAnyRolePermission(roles, Permission.EXPORT_CREATIVE)).toBe(false);
    expect(permissions.hasAnyRolePermission(roles, Permission.PUBLISH_CREATIVE)).toBe(false);
  });

  it('allows MARKETING_APPROVER to edit, regenerate, approve, reject, and export creative', () => {
    const roles = [RoleCode.MARKETING_APPROVER];
    expect(permissions.hasAnyRolePermission(roles, Permission.EDIT_CREATIVE)).toBe(true);
    expect(permissions.hasAnyRolePermission(roles, Permission.REGENERATE_CREATIVE)).toBe(true);
    expect(permissions.hasAnyRolePermission(roles, Permission.APPROVE_CREATIVE)).toBe(true);
    expect(permissions.hasAnyRolePermission(roles, Permission.REJECT_CREATIVE)).toBe(true);
    expect(permissions.hasAnyRolePermission(roles, Permission.EXPORT_CREATIVE)).toBe(true);
    expect(permissions.hasAnyRolePermission(roles, Permission.PUBLISH_CREATIVE)).toBe(false);
  });

  it('allows ADMIN all creative permissions including PUBLISH_CREATIVE', () => {
    const roles = [RoleCode.ADMIN];
    expect(permissions.hasAnyRolePermission(roles, Permission.EDIT_CREATIVE)).toBe(true);
    expect(permissions.hasAnyRolePermission(roles, Permission.REGENERATE_CREATIVE)).toBe(true);
    expect(permissions.hasAnyRolePermission(roles, Permission.APPROVE_CREATIVE)).toBe(true);
    expect(permissions.hasAnyRolePermission(roles, Permission.REJECT_CREATIVE)).toBe(true);
    expect(permissions.hasAnyRolePermission(roles, Permission.EXPORT_CREATIVE)).toBe(true);
    expect(permissions.hasAnyRolePermission(roles, Permission.PUBLISH_CREATIVE)).toBe(true);
  });

  it('denies VIEWER all creative mutation, approval, and export permissions', () => {
    const roles = [RoleCode.VIEWER];
    expect(permissions.hasAnyRolePermission(roles, Permission.EDIT_CREATIVE)).toBe(false);
    expect(permissions.hasAnyRolePermission(roles, Permission.REGENERATE_CREATIVE)).toBe(false);
    expect(permissions.hasAnyRolePermission(roles, Permission.APPROVE_CREATIVE)).toBe(false);
    expect(permissions.hasAnyRolePermission(roles, Permission.REJECT_CREATIVE)).toBe(false);
    expect(permissions.hasAnyRolePermission(roles, Permission.EXPORT_CREATIVE)).toBe(false);
    expect(permissions.hasAnyRolePermission(roles, Permission.PUBLISH_CREATIVE)).toBe(false);
    expect(permissions.hasAnyRolePermission(roles, Permission.VERIFY_PRODUCT_ASSET_RIGHTS)).toBe(
      false,
    );
  });

  it('restricts VERIFY_PRODUCT_ASSET_RIGHTS to MARKETING_APPROVER and ADMIN, denying VIEWER and MARKETING_EDITOR', () => {
    expect(
      permissions.hasAnyRolePermission([RoleCode.VIEWER], Permission.VERIFY_PRODUCT_ASSET_RIGHTS),
    ).toBe(false);
    expect(
      permissions.hasAnyRolePermission(
        [RoleCode.MARKETING_EDITOR],
        Permission.VERIFY_PRODUCT_ASSET_RIGHTS,
      ),
    ).toBe(false);
    expect(
      permissions.hasAnyRolePermission(
        [RoleCode.MARKETING_APPROVER],
        Permission.VERIFY_PRODUCT_ASSET_RIGHTS,
      ),
    ).toBe(true);
    expect(
      permissions.hasAnyRolePermission([RoleCode.ADMIN], Permission.VERIFY_PRODUCT_ASSET_RIGHTS),
    ).toBe(true);
  });
});
