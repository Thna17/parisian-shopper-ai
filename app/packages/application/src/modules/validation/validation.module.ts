import { Module } from '@nestjs/common';

import { IsContentVersionApprovalEligibleQuery } from './application/is-content-version-approval-eligible.query.js';
import { ValidateContentVersionUseCase } from './application/validate-content-version.use-case.js';
import {
  DeterministicFactualValidator,
  FACTUAL_VALIDATOR,
  FactualRuleRegistry,
} from './domain/factual-validator.js';

@Module({
  providers: [
    FactualRuleRegistry,
    { provide: FACTUAL_VALIDATOR, useClass: DeterministicFactualValidator },
    ValidateContentVersionUseCase,
    IsContentVersionApprovalEligibleQuery,
  ],
  exports: [
    FACTUAL_VALIDATOR,
    ValidateContentVersionUseCase,
    IsContentVersionApprovalEligibleQuery,
  ],
})
export class ValidationModule {}
