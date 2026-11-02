import { Inject, Injectable } from '@nestjs/common';
import { EmployeeNotFoundError } from '../../domain/admin-errors.js';
import { type EmployeeDetail } from '../../domain/employee.types.js';
import { EMPLOYEE_REPOSITORY, type EmployeeRepository } from '../ports/employee.repository.js';

@Injectable()
export class GetEmployeeDetailUseCase {
  public constructor(
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employeeRepo: EmployeeRepository,
  ) {}

  public async execute(id: string): Promise<EmployeeDetail> {
    const employee = await this.employeeRepo.findById(id);
    if (!employee) {
      throw new EmployeeNotFoundError(id);
    }
    return employee;
  }
}
