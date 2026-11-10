/* eslint-disable @typescript-eslint/explicit-function-return-type -- Inferred mock signatures in an isolated transport test. */
import { describe, expect, it, jest } from '@jest/globals';
import type {
  TelegramWorkflowRepository,
  TelegramPostWorkflow,
  TelegramActionTokenService,
  TelegramActor,
} from '@parisian-shopper/application';
import type { AppConfigService, FeatureFlagService } from '@parisian-shopper/config';
import type { ApplicationLogger } from '@parisian-shopper/common';
import { TelegramOutboxDispatcher } from '../telegram-outbox.dispatcher.js';
import type { TelegramDeliveryGateway } from '../telegram-delivery.gateway.js';

describe('complete Post outbox notifications', () => {
  it('retries delivery without repeating a successful recipient or invoking any Post decision or generation', async () => {
    const sent = new Set<string>();
    const event = {
      id: 'event',
      topic: 'POST_CHANGED',
      payload: { postId: 'post' },
      attemptCount: 1,
    };
    const repository = {
      claimOutboxEvents: jest
        .fn<TelegramWorkflowRepository['claimOutboxEvents']>()
        .mockResolvedValue([event]),
      postNotificationSent: (_event: string, identity: string) =>
        Promise.resolve(sent.has(identity)),
      acknowledgePostNotification: (_event: string, identity: string) => {
        sent.add(identity);
        return Promise.resolve();
      },
      markOutboxProcessed: jest
        .fn<TelegramWorkflowRepository['markOutboxProcessed']>()
        .mockResolvedValue(undefined),
      markNotificationFailed: jest
        .fn<TelegramWorkflowRepository['markNotificationFailed']>()
        .mockResolvedValue(undefined),
    };
    let failed = false;
    const deliver = jest.fn<TelegramDeliveryGateway['sendMessages']>().mockImplementation((id) => {
      if (id === '2' && !failed) {
        failed = true;
        return Promise.reject(new Error('Temporary fixture delivery failure'));
      }
      return Promise.resolve();
    });
    const users = ['1', '2'].map((id): TelegramActor => ({
      identityId: id,
      internalUserId: id,
      telegramUserId: id,
      displayName: 'Fixture',
      roles: ['ADMIN'],
    }));
    const posts = {
      notification: jest.fn<TelegramPostWorkflow['notification']>().mockResolvedValue(
        users.map((actor) => ({
          actor,
          response: { messages: [{ text: 'Current complete Post revision' }] },
        })),
      ),
    };
    const dispatcher = new TelegramOutboxDispatcher(
      repository as unknown as TelegramWorkflowRepository,
      { sendMessages: deliver } as unknown as TelegramDeliveryGateway,
      {} as TelegramActionTokenService,
      {} as AppConfigService,
      {} as FeatureFlagService,
      { warn: jest.fn() } as unknown as ApplicationLogger,
      undefined,
      undefined,
      undefined,
      undefined,
      posts as unknown as TelegramPostWorkflow,
    );
    await dispatcher.dispatchOnce();
    expect(repository.markNotificationFailed).toHaveBeenCalledTimes(1);
    expect(repository.markOutboxProcessed).not.toHaveBeenCalled();
    await dispatcher.dispatchOnce();
    expect(deliver.mock.calls.map((call) => call[0])).toEqual(['1', '2', '2']);
    expect(repository.markOutboxProcessed).toHaveBeenCalledWith('event', expect.any(Date));
    await dispatcher.dispatchOnce();
    expect(deliver).toHaveBeenCalledTimes(3);
  });
});
