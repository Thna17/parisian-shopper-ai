import { Inject, Injectable } from '@nestjs/common';
import {
  type EmployeeListQuery,
  type EmployeeSummary,
  type PaginatedResult,
} from '../../domain/employee.types.js';
import { EMPLOYEE_REPOSITORY, type EmployeeRepository } from '../ports/employee.repository.js';

@Injectable()
export class ListEmployeesUseCase {
  public constructor(
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employeeRepo: EmployeeRepository,
  ) {}

  public async execute(query: EmployeeListQuery): Promise<PaginatedResult<EmployeeSummary>> {
    return this.employeeRepo.findPaginated(query);
  }
}
