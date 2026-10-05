import { describe, expect, it, jest } from '@jest/globals';

import { TelegramAction } from '../domain/telegram.js';
import {
  TelegramActionTokenService,
  hashTelegramActionToken,
} from './telegram-action-token.service.js';
import { type TelegramWorkflowRepository } from './telegram-workflow.repository.js';

describe('TelegramActionTokenService', () => {
  it('creates opaque random bearer values and stores hashes only', async () => {
    const storeActionTokens = jest.fn<TelegramWorkflowRepository['storeActionTokens']>();
    const repository = { storeActionTokens } as unknown as TelegramWorkflowRepository;
    const service = new TelegramActionTokenService(repository);
    const expiresAt = new Date('2030-01-01T00:00:00Z');

    const first = await service.create(
      'identity-id',
      [{ action: TelegramAction.SELECT_PRODUCT, resourceId: 'FIC-PERF-001' }],
      expiresAt,
    );
    const second = await service.create(
      'identity-id',
      [{ action: TelegramAction.SELECT_PRODUCT, resourceId: 'FIC-PERF-001' }],
      expiresAt,
    );

    expect(first[0]).toMatch(/^[A-Za-z0-9_-]{24}$/u);
    expect(first[0]).not.toBe(second[0]);
    expect(storeActionTokens).toHaveBeenCalledWith([
      expect.objectContaining({
        tokenHash: hashTelegramActionToken(required(first[0])),
        telegramIdentityId: 'identity-id',
        singleUse: true,
      }),
    ]);
    expect(JSON.stringify(storeActionTokens.mock.calls)).not.toContain(required(first[0]));
  });
});

function required(value: string | undefined): string {
  if (value === undefined) throw new Error('Expected token');
  return value;
}
