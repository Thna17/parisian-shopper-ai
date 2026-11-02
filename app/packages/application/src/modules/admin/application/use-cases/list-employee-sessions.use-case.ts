import { Inject, Injectable } from '@nestjs/common';
import { EmployeeNotFoundError } from '../../domain/admin-errors.js';
import { type SafeUserSession } from '../../domain/employee.types.js';
import { EMPLOYEE_REPOSITORY, type EmployeeRepository } from '../ports/employee.repository.js';

@Injectable()
export class ListEmployeeSessionsUseCase {
  public constructor(
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employeeRepo: EmployeeRepository,
  ) {}

  public async execute(userId: string): Promise<readonly SafeUserSession[]> {
    const employee = await this.employeeRepo.findById(userId);
    if (!employee) {
      throw new EmployeeNotFoundError(userId);
    }
    return this.employeeRepo.findSessionsByUserId(userId);
  }
}
