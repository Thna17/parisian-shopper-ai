/* eslint-disable @typescript-eslint/unbound-method */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { type Context } from 'grammy';
import {
  type TelegramCommandCenter,
  type TelegramResponse,
  type TelegramWorkflowRepository,
} from '@parisian-shopper/application';
import { type AppConfigService, type FeatureFlagService } from '@parisian-shopper/config';
import { type ApplicationLogger } from '@parisian-shopper/common';

import { GrammyBotAdapter } from './grammy-bot.adapter.js';

describe('GrammyBotAdapter Edit-First Delivery & Fallback Synchronization (W30-D)', () => {
  let mockContext: Partial<Context>;
  let mockWorkflowRepo: jest.Mocked<TelegramWorkflowRepository>;
  let mockCommands: jest.Mocked<TelegramCommandCenter>;
  let mockConfig: Partial<AppConfigService>;
  let mockFlags: Partial<FeatureFlagService>;
  let mockLogger: ApplicationLogger;
  let adapter: GrammyBotAdapter;

  beforeEach(() => {
    mockContext = {
      chat: { id: 123456 } as unknown as Context['chat'],
      from: { id: 123456, first_name: 'Test', is_bot: false },
      api: {
        editMessageText: jest.fn(() => Promise.resolve({ message_id: 1042 })) as never,
        editMessageCaption: jest.fn(() => Promise.resolve({ message_id: 1042 })) as never,
        editMessageMedia: jest.fn(() => Promise.resolve({ message_id: 1042 })) as never,
        sendMessage: jest.fn(() => Promise.resolve({ message_id: 2055 })) as never,
        sendPhoto: jest.fn(() => Promise.resolve({ message_id: 2055 })) as never,
        deleteMessage: jest.fn(() => Promise.resolve(true)) as never,
      } as unknown as Context['api'],
      reply: jest.fn(() => Promise.resolve({ message_id: 2055 })) as never,
      replyWithPhoto: jest.fn(() => Promise.resolve({ message_id: 2055 })) as never,
      answerCallbackQuery: jest.fn(() => Promise.resolve(true)) as never,
    };

    mockWorkflowRepo = {
      claimInboundUpdate: jest.fn(() => Promise.resolve(true)),
      resolveActor: jest.fn(),
      recordDeniedAccess: jest.fn(() => Promise.resolve()),
      consumeRateLimit: jest.fn(() => Promise.resolve(true)),
      createFlow: jest.fn(),
      findFlowById: jest.fn(),
      updateFlowSelection: jest.fn(() => Promise.resolve({} as never)),
      setFlowMetadata: jest.fn(() => Promise.resolve({} as never)),
      setActiveWorkflowMessage: jest.fn(() => Promise.resolve()),
      getActiveWorkflowMessage: jest.fn(() => Promise.resolve(null)),
      clearActiveWorkflowMessage: jest.fn(() => Promise.resolve()),
      completeFlow: jest.fn(() => Promise.resolve()),
      cancelFlow: jest.fn(() => Promise.resolve()),
      findActiveFlowByIdentity: jest.fn(() => Promise.resolve(null)),
      storeActionTokens: jest.fn(() => Promise.resolve()),
      consumeActionToken: jest.fn(),
      listRecentJobs: jest.fn(() => Promise.resolve([])),
      listHistory: jest.fn(() => Promise.resolve([])),
      findJobByFlowId: jest.fn(() => Promise.resolve(null)),
      getSourceByJobId: jest.fn(() => Promise.resolve(null)),
      getValidationByVersionId: jest.fn(() => Promise.resolve(null)),
      getDraftViewByVersionId: jest.fn(() => Promise.resolve(null)),
      getFailureViewByJobId: jest.fn(() => Promise.resolve(null)),
      claimOutboxEvents: jest.fn(() => Promise.resolve([])),
      beginNotificationDelivery: jest.fn(() => Promise.resolve(true)),
      markNotificationSent: jest.fn(() => Promise.resolve()),
      markNotificationFailed: jest.fn(() => Promise.resolve()),
      markOutboxProcessed: jest.fn(() => Promise.resolve()),
      createPendingInteraction: jest.fn(() => Promise.resolve()),
      findActivePendingInteraction: jest.fn(() => Promise.resolve(null)),
      completePendingInteraction: jest.fn(() => Promise.resolve()),
      cancelPendingInteraction: jest.fn(() => Promise.resolve()),
      getPreviousVersions: jest.fn(() => Promise.resolve([])),
      appendAudit: jest.fn(() => Promise.resolve()),
      recordChannelPublication: jest.fn(() => Promise.resolve()),
      getChannelPublication: jest.fn(() => Promise.resolve(null)),
    } as unknown as jest.Mocked<TelegramWorkflowRepository>;

    mockCommands = {
      handleCommand: jest.fn(),
      handleCallback: jest.fn(),
    } as unknown as jest.Mocked<TelegramCommandCenter>;

    mockConfig = {
      telegram: {
        mode: 'webhook',
        webhookUrl: 'https://example.com/telegram',
        webhookSecret: 'secret',
      } as never,
    };

    mockFlags = {
      isEnabled: jest.fn(() => true),
    };

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    adapter = new GrammyBotAdapter(
      null, // bot is null in direct unit test mode
      mockCommands,
      mockConfig as AppConfigService,
      mockFlags as FeatureFlagService,
      mockLogger,
      mockWorkflowRepo,
    );
  });

  describe('deliverResponse', () => {
    it('successfully edits message in-place and preserves messageId in active registry without spawning new message', async () => {
      const response: TelegramResponse = {
        messages: [
          {
            text: 'Step 3 of 6: Select Language',
            action: 'EDIT_TEXT',
            resourceKey: 'flow-uuid-1',
            flowId: 'flow-uuid-1',
            messageType: 'WIZARD_PROMPT',
          },
        ],
      };

      await adapter.deliverResponse(mockContext as Context, response, 1042);

      // 1. Assert editMessageText was called with the existing message ID
      expect(mockContext.api?.editMessageText).toHaveBeenCalledWith(
        '123456',
        1042,
        'Step 3 of 6: Select Language',
        expect.any(Object),
      );

      // 2. Assert no new message was spawned
      expect(mockContext.reply).not.toHaveBeenCalled();
      expect(mockContext.api?.sendMessage).not.toHaveBeenCalled();

      // 3. Assert active workflow message was recorded with existing message ID
      expect(mockWorkflowRepo.setActiveWorkflowMessage).toHaveBeenCalledWith(
        'flow-uuid-1',
        expect.objectContaining({
          chatId: '123456',
          messageId: 1042,
          messageType: 'WIZARD_PROMPT',
        }),
      );
    });

    it('falls back to sending a new message on edit failure and synchronizes new messageId to repository and flow metadata', async () => {
      // Simulate edit error: "message to edit not found"
      (
        mockContext.api?.editMessageText as unknown as {
          mockRejectedValueOnce: (err: unknown) => void;
        }
      ).mockRejectedValueOnce(new Error('Bad Request: message to edit not found'));

      const response: TelegramResponse = {
        messages: [
          {
            text: 'Step 4 of 6: Select Format',
            action: 'EDIT_TEXT',
            resourceKey: 'flow-uuid-2',
            flowId: 'flow-uuid-2',
            messageType: 'WIZARD_PROMPT',
          },
        ],
      };

      await adapter.deliverResponse(mockContext as Context, response, 1042);

      // 1. Assert edit was attempted
      expect(mockContext.api?.editMessageText).toHaveBeenCalledWith(
        '123456',
        1042,
        'Step 4 of 6: Select Format',
        expect.any(Object),
      );

      // 2. Assert fallback new message was sent
      expect(mockContext.reply).toHaveBeenCalledWith(
        'Step 4 of 6: Select Format',
        expect.any(Object),
      );

      // 3. CRITICAL: Assert new message ID (2055) was persisted to active workflow message
      expect(mockWorkflowRepo.setActiveWorkflowMessage).toHaveBeenCalledWith(
        'flow-uuid-2',
        expect.objectContaining({
          chatId: '123456',
          messageId: 2055,
          messageType: 'WIZARD_PROMPT',
        }),
      );

      // 4. Assert flow metadata and selection were updated with new wizardMessageId
      expect(mockWorkflowRepo.setFlowMetadata).toHaveBeenCalledWith('flow-uuid-2', {
        wizardMessageId: 2055,
      });
      expect(mockWorkflowRepo.updateFlowSelection).toHaveBeenCalledWith(
        'flow-uuid-2',
        'wizardMessageId',
        2055,
      );
    });

    it('safely discards "message is not modified" error without spawning duplicate message', async () => {
      // Simulate double-click resulting in "message is not modified"
      (
        mockContext.api?.editMessageText as unknown as {
          mockRejectedValueOnce: (err: unknown) => void;
        }
      ).mockRejectedValueOnce(
        new Error(
          'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message',
        ),
      );

      const response: TelegramResponse = {
        messages: [
          {
            text: 'Step 5 of 6: Select Style Preset',
            action: 'EDIT_TEXT',
            resourceKey: 'flow-uuid-3',
            flowId: 'flow-uuid-3',
            messageType: 'WIZARD_PROMPT',
          },
        ],
      };

      await adapter.deliverResponse(mockContext as Context, response, 1042);

      // 1. Assert edit was attempted
      expect(mockContext.api?.editMessageText).toHaveBeenCalledWith(
        '123456',
        1042,
        'Step 5 of 6: Select Style Preset',
        expect.any(Object),
      );

      // 2. Assert NO fallback message was spawned
      expect(mockContext.reply).not.toHaveBeenCalled();
      expect(mockContext.api?.sendMessage).not.toHaveBeenCalled();
    });

    it('resolves targetMessageId from durable repository if omitted in message and callback', async () => {
      mockWorkflowRepo.getActiveWorkflowMessage.mockResolvedValueOnce({
        messageId: 5500,
        chatId: '123456',
        messageType: 'WIZARD_PROMPT',
      });

      const response: TelegramResponse = {
        resourceKey: 'flow-uuid-restored',
        flowId: 'flow-uuid-restored',
        messageType: 'WIZARD_PROMPT',
        messages: [
          {
            text: 'Resumed Step 4',
            action: 'EDIT_TEXT',
          },
        ],
      };

      // No callbackMessageId passed (e.g. following process restart or text command)
      await adapter.deliverResponse(mockContext as Context, response);

      // 1. Assert getActiveWorkflowMessage was queried
      expect(mockWorkflowRepo.getActiveWorkflowMessage).toHaveBeenCalledWith('flow-uuid-restored');

      // 2. Assert edit was targeted to retrieved message ID 5500
      expect(mockContext.api?.editMessageText).toHaveBeenCalledWith(
        '123456',
        5500,
        'Resumed Step 4',
        expect.any(Object),
      );
    });

    it('preserves VISUAL_REVIEW_CARD message type and updates active message registry on photo fallback', async () => {
      (
        mockContext.api?.editMessageCaption as unknown as {
          mockRejectedValueOnce: (err: unknown) => void;
        }
      ).mockRejectedValueOnce(new Error('Bad Request: message can not be edited'));

      const response: TelegramResponse = {
        resourceKey: 'job-creative-uuid-9',
        messageType: 'VISUAL_REVIEW_CARD',
        messages: [
          {
            text: 'Visual Review: Cambodian Ivory Celebration',
            photoBuffer: Buffer.from('fake-poster-bytes'),
            action: 'EDIT_CAPTION',
            messageId: 8888,
            resourceKey: 'job-creative-uuid-9',
            messageType: 'VISUAL_REVIEW_CARD',
          },
        ],
      };

      await adapter.deliverResponse(mockContext as Context, response, 8888);

      // 1. Assert editMessageCaption was attempted
      expect(mockContext.api?.editMessageCaption).toHaveBeenCalledWith(
        '123456',
        8888,
        expect.objectContaining({ caption: 'Visual Review: Cambodian Ivory Celebration' }),
      );

      // 2. Assert replyWithPhoto was invoked as fallback
      expect(mockContext.replyWithPhoto).toHaveBeenCalled();

      // 3. Assert active workflow message recorded with VISUAL_REVIEW_CARD
      expect(mockWorkflowRepo.setActiveWorkflowMessage).toHaveBeenCalledWith(
        'job-creative-uuid-9',
        expect.objectContaining({
          chatId: '123456',
          messageId: 2055,
          messageType: 'VISUAL_REVIEW_CARD',
        }),
      );
    });
  });
});
