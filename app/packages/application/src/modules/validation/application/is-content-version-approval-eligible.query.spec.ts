import { describe, expect, it } from '@jest/globals';

import { ValidationStatus } from '../domain/validation.js';
import { IsContentVersionApprovalEligibleQuery } from './is-content-version-approval-eligible.query.js';
import {
  type PersistedValidationResult,
  type ValidationRepository,
} from './validation.repository.js';

describe('IsContentVersionApprovalEligibleQuery', () => {
  it.each([
    [null, false],
    [result(ValidationStatus.PASSED, 0), true],
    [result(ValidationStatus.PASSED_WITH_WARNINGS, 0), true],
    [result(ValidationStatus.BLOCKED, 1), false],
    [result(ValidationStatus.FAILED, 1), false],
    [result(ValidationStatus.PASSED, 1), false],
  ])('returns eligibility from the latest immutable result', async (latest, expected) => {
    const repository: ValidationRepository = {
      create: () => Promise.reject(new Error('not used')),
      findByContentVersionAndValidatorVersion: () => Promise.resolve(null),
      findLatestByContentVersion: () => Promise.resolve(latest),
    };
    await expect(
      new IsContentVersionApprovalEligibleQuery(repository).execute('version'),
    ).resolves.toBe(expected);
  });
});

function result(
  status: PersistedValidationResult['status'],
  blockingCount: number,
): PersistedValidationResult {
  return {
    id: 'result',
    contentVersionId: 'version',
    validatorVersion: 'ps-factual-v1',
    status,
    findingCount: blockingCount,
    blockingCount,
    warningCount: 0,
    infoCount: 0,
    createdAt: new Date('2026-10-05T00:00:00.000Z'),
    findings: [],
  };
}
