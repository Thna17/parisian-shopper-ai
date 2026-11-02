import { ApplicationError } from '@parisian-shopper/common';

export class EmployeeNotFoundError extends ApplicationError {
  public constructor(id: string) {
    super({
      code: 'EMPLOYEE_NOT_FOUND',
      publicMessage: `Employee '${id}' was not found.`,
      details: { id },
    });
  }
}

export class LastActiveAdminError extends ApplicationError {
  public constructor(message = 'Cannot remove or suspend the last active administrator account.') {
    super({
      code: 'LAST_ACTIVE_ADMIN',
      publicMessage: message,
    });
  }
}

export class SelfRoleModificationError extends ApplicationError {
  public constructor(message = 'Administrators cannot modify their own assigned roles.') {
    super({
      code: 'SELF_ROLE_MODIFICATION',
      publicMessage: message,
    });
  }
}

export class SelfSuspensionError extends ApplicationError {
  public constructor(message = 'Administrators cannot suspend their own account.') {
    super({
      code: 'SELF_SUSPENSION',
      publicMessage: message,
    });
  }
}

export class InvalidInvitationTokenError extends ApplicationError {
  public constructor(
    message = 'Invitation token is invalid, expired, or has already been claimed.',
  ) {
    super({
      code: 'INVALID_INVITATION_TOKEN',
      publicMessage: message,
    });
  }
}

export class DuplicateLoginIdentifierError extends ApplicationError {
  public constructor(identifier: string) {
    super({
      code: 'DUPLICATE_LOGIN_IDENTIFIER',
      publicMessage: `An employee account with identifier '${identifier}' already exists.`,
      details: { identifier },
    });
  }
}

export class InvalidRoleAssignmentError extends ApplicationError {
  public constructor(invalidRoles: readonly string[]) {
    super({
      code: 'INVALID_ROLE_ASSIGNMENT',
      publicMessage: `One or more assigned roles are invalid: ${invalidRoles.join(', ')}`,
      details: { invalidRoles },
    });
  }
}

export class SettingNotFoundError extends ApplicationError {
  public constructor(key: string) {
    super({
      code: 'SETTING_NOT_FOUND',
      publicMessage: `System setting '${key}' was not found.`,
      details: { key },
    });
  }
}

export class AdminForbiddenError extends ApplicationError {
  public constructor(message = 'Access denied: administrative privileges required.') {
    super({
      code: 'ADMIN_FORBIDDEN',
      publicMessage: message,
    });
  }
}
