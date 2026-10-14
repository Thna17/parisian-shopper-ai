import { describe, expect, it } from '@jest/globals';

import { withTimeout } from '../utils/timeout.js';

describe('withTimeout', () => {
  it('resolves value when operation completes before timeout', async () => {
    const operation = Promise.resolve('luxury_success');
    const result = await withTimeout(operation, 1_000, 'Test operation');
    expect(result).toBe('luxury_success');
  });

  it('rejects with timeout error when operation takes longer than budget', async () => {
    const slowOperation = new Promise<string>((resolve) => {
      setTimeout(() => resolve('too_late'), 500);
    });

    await expect(withTimeout(slowOperation, 50, 'Slow operation')).rejects.toThrow(
      'Slow operation timed out after 50ms',
    );
  });

  it('propagates the original error if operation rejects before timeout', async () => {
    const failingOperation = Promise.reject(new Error('Immediate failure'));

    await expect(withTimeout(failingOperation, 1_000, 'Failing operation')).rejects.toThrow(
      'Immediate failure',
    );
  });
});
