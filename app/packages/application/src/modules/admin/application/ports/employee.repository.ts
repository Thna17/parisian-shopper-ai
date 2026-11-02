import { type RoleCode } from '../../../auth/domain/permissions.js';
import {
  type EmployeeDetail,
  type EmployeeListQuery,
  type EmployeeSummary,
  type PaginatedResult,
} from '../../domain/employee.types.js';

export const EMPLOYEE_REPOSITORY = Symbol('EMPLOYEE_REPOSITORY');

export interface CreateEmployeeInput {
  readonly displayName: string;
  readonly roleCodes: readonly RoleCode[];
}

export interface EmployeeRepository {
  findPaginated(query: EmployeeListQuery): Promise<PaginatedResult<EmployeeSummary>>;
  findById(id: string): Promise<EmployeeDetail | null>;
  create(input: CreateEmployeeInput): Promise<EmployeeDetail>;
  updateDisplayName(id: string, displayName: string): Promise<EmployeeDetail>;
  updateRoles(id: string, roleCodes: readonly RoleCode[], actorId: string): Promise<EmployeeDetail>;
  suspend(id: string, actorId: string): Promise<EmployeeDetail>;
  reactivate(id: string, actorId: string): Promise<EmployeeDetail>;
  countActiveAdmins(): Promise<number>;
  existsByDisplayName(displayName: string, excludeId?: string): Promise<boolean>;
  findSessionsByUserId(
    userId: string,
  ): Promise<readonly import('../../domain/employee.types.js').SafeUserSession[]>;
}
