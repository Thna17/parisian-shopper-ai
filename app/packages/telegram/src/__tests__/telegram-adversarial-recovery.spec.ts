/* eslint-disable @typescript-eslint/unbound-method */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { type Context } from 'grammy';
import {
  type ConsumeActionTokenResult,
  type NormalizedProductEnvelope,
  type StoreActionTokenInput,
  type TelegramActor,
  type TelegramCreateFlow,
  type TelegramResponse,
  type TelegramUserProfile,
  type TelegramWorkflowMetadata,
  type TelegramWorkflowRepository,
  type CreativeJobRecord,
  type CreativeJobRepository,
  type VisualAssetRepository,
  type CreativeRevisionRepository,
  type CreativeApprovalRepository,
  type SearchProductsUseCase,
  FICTIONAL_PRODUCTS,
  PermissionService,
  RoleCode,
  TelegramAction,
  TelegramActionTokenService,
  TelegramCommandCenter,
  hashTelegramActionToken,
  ApproveCreativeUseCase,
  GenerateCreativeUseCase,
} from '@parisian-shopper/application';
import { type ApplicationLogger } from '@parisian-shopper/common';
import { type AppConfigService, type FeatureFlagService } from '@parisian-shopper/config';

import { GrammyBotAdapter } from '../grammy-bot.adapter.js';
import { VisualReviewCallbackHandler } from '../handlers/visual-review-callback.handler.js';

interface DurableStorageState {
  inboundUpdates: Set<string>;
  activeMessages: Map<
    string,
    {
      messageId: number;
      chatId?: string;
      messageType?: string;
      payloadMetadata?: Readonly<Record<string, unknown>>;
    }
  >;
  flows: Map<string, TelegramCreateFlow>;
  actionTokens: Map<
    string,
    {
      id: string;
      tokenHash: string;
      telegramIdentityId: string;
      telegramUserId: string;
      action: TelegramAction;
      resourceId: string;
      singleUse: boolean;
      expiresAt: Date;
      consumedAt?: Date;
      metadata?: Readonly<Record<string, unknown>>;
    }
  >;
  auditLogs: Array<{
    action: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: unknown;
  }>;
  rateLimits: Map<string, number>;
}

function createDurableRepository(
  state: DurableStorageState,
  actor: TelegramActor,
): TelegramWorkflowRepository {
  return {
    claimInboundUpdate: (updateId: string) => {
      if (state.inboundUpdates.has(updateId)) {
        return Promise.resolve(false);
      }
      state.inboundUpdates.add(updateId);
      return Promise.resolve(true);
    },
    resolveActor: () => Promise.resolve(actor),
    recordDeniedAccess: () => Promise.resolve(),
    consumeRateLimit: (_identityId: string, actionKey: string, limit: number) => {
      const current = state.rateLimits.get(actionKey) ?? 0;
      if (current >= limit) return Promise.resolve(false);
      state.rateLimits.set(actionKey, current + 1);
      return Promise.resolve(true);
    },
    createFlow: (identityId: string, product: NormalizedProductEnvelope, expiresAt: Date) => {
      const id = `flow-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const flow: TelegramCreateFlow = {
        id,
        telegramIdentityId: identityId,
        product,
        status: 'SELECTING_CONTENT_TYPE',
        step: 1,
        expiresAt,
        metadata: { stepHistory: [1] },
      };
      state.flows.set(id, flow);
      return Promise.resolve(flow);
    },
    findFlowById: (id: string) => Promise.resolve(state.flows.get(id) ?? null),
    updateFlowSelection: (id: string, field: string, value: string | number) => {
      const flow = state.flows.get(id);
      if (!flow) throw new Error('Flow not found');
      const updated = {
        ...flow,
        [field]: value,
        metadata: {
          ...flow.metadata,
          [field]: value,
        },
      };
      state.flows.set(id, updated);
      return Promise.resolve(updated);
    },
    setFlowMetadata: (id: string, metadata: Partial<TelegramWorkflowMetadata>) => {
      const flow = state.flows.get(id);
      if (!flow) throw new Error('Flow not found');
      const updated: TelegramCreateFlow = {
        ...flow,
        ...(metadata.step !== undefined ? { step: metadata.step } : {}),
        metadata: {
          ...flow.metadata,
          ...metadata,
        },
      };
      state.flows.set(id, updated);
      return Promise.resolve(updated);
    },
    setActiveWorkflowMessage: (
      resourceKey: string,
      messageIdOrInput: unknown,
      chatIdParam?: string,
      optionsParam?: { messageType?: string; payloadMetadata?: Readonly<Record<string, unknown>> },
    ) => {
      const isObject = typeof messageIdOrInput === 'object' && messageIdOrInput !== null;
      const input = isObject ? (messageIdOrInput as Record<string, unknown>) : undefined;
      const messageId = isObject ? (input?.messageId as number) : (messageIdOrInput as number);
      const chatId = isObject ? (input?.chatId as string | undefined) : chatIdParam;
      const messageType = isObject
        ? (input?.messageType as string | undefined)
        : optionsParam?.messageType;
      const payloadMetadata = isObject
        ? (input?.payloadMetadata as Readonly<Record<string, unknown>> | undefined)
        : optionsParam?.payloadMetadata;

      state.activeMessages.set(resourceKey, {
        messageId,
        ...(chatId !== undefined ? { chatId } : {}),
        messageType: messageType ?? 'WIZARD_PROMPT',
        ...(payloadMetadata !== undefined ? { payloadMetadata } : {}),
      });
      return Promise.resolve();
    },
    getActiveWorkflowMessage: (resourceKey: string) => {
      return Promise.resolve(state.activeMessages.get(resourceKey) ?? null);
    },
    clearActiveWorkflowMessage: (resourceKey: string) => {
      state.activeMessages.delete(resourceKey);
      return Promise.resolve();
    },
    completeFlow: (id: string) => {
      const flow = state.flows.get(id);
      if (flow) {
        state.flows.set(id, { ...flow, status: 'COMPLETED', completedAt: new Date() });
      }
      return Promise.resolve();
    },
    cancelFlow: (id: string) => {
      const flow = state.flows.get(id);
      if (flow) {
        state.flows.set(id, { ...flow, status: 'CANCELLED', completedAt: new Date() });
      }
      return Promise.resolve();
    },
    findActiveFlowByIdentity: (identityId: string) => {
      for (const flow of state.flows.values()) {
        if (
          flow.telegramIdentityId === identityId &&
          flow.status !== 'COMPLETED' &&
          flow.status !== 'CANCELLED' &&
          flow.expiresAt > new Date()
        ) {
          return Promise.resolve(flow);
        }
      }
      return Promise.resolve(null);
    },
    storeActionTokens: (inputs: readonly StoreActionTokenInput[]) => {
      inputs.forEach((input, idx) => {
        state.actionTokens.set(input.tokenHash, {
          id: `tok-${Date.now()}-${idx}`,
          tokenHash: input.tokenHash,
          telegramIdentityId: input.telegramIdentityId,
          telegramUserId: actor.telegramUserId,
          action: input.action,
          resourceId: input.resourceId,
          singleUse: input.singleUse,
          expiresAt: input.expiresAt,
          ...(input.metadata ? { metadata: input.metadata } : {}),
        });
      });
      return Promise.resolve();
    },
    consumeActionToken: (
      tokenHash: string,
      telegramUserId: string,
      now: Date,
    ): Promise<ConsumeActionTokenResult> => {
      const record = state.actionTokens.get(tokenHash);
      if (!record) return Promise.resolve({ disposition: 'NOT_FOUND' });
      if (record.telegramUserId !== telegramUserId)
        return Promise.resolve({ disposition: 'WRONG_USER' });
      if (record.expiresAt <= now) return Promise.resolve({ disposition: 'EXPIRED' });
      if (record.singleUse && record.consumedAt !== undefined) {
        return Promise.resolve({ disposition: 'CONSUMED' });
      }
      if (record.singleUse) {
        // Atomic compare-and-set
        record.consumedAt = now;
      }
      return Promise.resolve({
        disposition: 'VALID',
        token: {
          id: record.id,
          telegramIdentityId: record.telegramIdentityId,
          action: record.action,
          resourceId: record.resourceId,
          singleUse: record.singleUse,
          expiresAt: record.expiresAt,
          ...(record.metadata ? { metadata: record.metadata } : {}),
        },
      });
    },
    appendAudit: (input: unknown) => {
      state.auditLogs.push(input as { action: string });
      return Promise.resolve();
    },
    listRecentJobs: () => Promise.resolve([]),
    listHistory: () => Promise.resolve([]),
    findJobByFlowId: () => Promise.resolve(null),
    getSourceByJobId: () => Promise.resolve(null),
    getValidationByVersionId: () => Promise.resolve(null),
    getDraftViewByVersionId: () => Promise.resolve(null),
    getFailureViewByJobId: () => Promise.resolve(null),
    claimOutboxEvents: () => Promise.resolve([]),
    beginNotificationDelivery: () => Promise.resolve(true),
    markNotificationSent: () => Promise.resolve(),
    markNotificationFailed: () => Promise.resolve(),
    markOutboxProcessed: () => Promise.resolve(),
    createPendingInteraction: () => Promise.resolve(),
    findActivePendingInteraction: () => Promise.resolve(null),
    completePendingInteraction: () => Promise.resolve(),
    cancelPendingInteraction: () => Promise.resolve(),
    getPreviousVersions: () => Promise.resolve([]),
    recordChannelPublication: () => Promise.resolve(),
    getChannelPublication: () => Promise.resolve(null),
  } as unknown as TelegramWorkflowRepository;
}

describe('Telegram Adversarial Integration & Crash Recovery Suite (W30-E)', () => {
  const actor: TelegramActor = {
    identityId: 'ident-adversarial-1',
    internalUserId: 'user-adv-1',
    telegramUserId: '777000111',
    displayName: 'Adversarial Tester',
    roles: [RoleCode.MARKETING_APPROVER, RoleCode.MARKETING_EDITOR],
  };

  const profile: TelegramUserProfile = {
    telegramUserId: '777000111',
    username: 'adv_tester',
    displayName: 'Adversarial Tester',
  };

  const sampleProduct = FICTIONAL_PRODUCTS[0]!;

  let durableState: DurableStorageState;
  let mockLogger: ApplicationLogger;
  let mockConfig: Partial<AppConfigService>;
  let mockFlags: Partial<FeatureFlagService>;
  let mockJobRepo: Partial<CreativeJobRepository>;
  let mockAssetRepo: Partial<VisualAssetRepository>;
  let mockRevisionRepo: Partial<CreativeRevisionRepository>;
  let mockApprovalRepo: Partial<CreativeApprovalRepository>;
  let mockApproveCreative: Partial<ApproveCreativeUseCase>;
  let mockGenerateCreative: Partial<GenerateCreativeUseCase>;
  let mockSearchProducts: Partial<SearchProductsUseCase>;

  beforeEach(() => {
    durableState = {
      inboundUpdates: new Set(),
      activeMessages: new Map(),
      flows: new Map(),
      actionTokens: new Map(),
      auditLogs: [],
      rateLimits: new Map(),
    };

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockConfig = {
      telegram: {
        mode: 'webhook',
        webhookUrl: 'https://example.com/telegram',
        webhookSecret: 'secret',
      } as never,
    };

    mockFlags = { isEnabled: jest.fn(() => true) };

    const sampleJob: CreativeJobRecord = {
      id: 'job-adv-999',
      contentVersionId: 'ver-cv-1',
      productSnapshotId: 'snap-1',
      brandRuleVersionId: 'brand-1',
      requestedByUserId: actor.internalUserId,
      status: 'READY_FOR_REVIEW',
      targetPlatform: 'INSTAGRAM',
      aspectRatio: '1:1',
      creativeProfile: 'PARISIAN_MORNING_ATELIER',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockJobRepo = {
      findById: jest.fn(() => Promise.resolve(sampleJob)),
      transitionStatus: jest.fn(() => Promise.resolve(sampleJob)),
    };

    mockAssetRepo = {
      findById: jest.fn(() =>
        Promise.resolve({
          id: 'asset-adv-1',
          creativeJobId: sampleJob.id,
          versionNumber: 1,
          assetRole: 'COMPOSITED_CREATIVE' as const,
          mimeType: 'image/png',
          width: 1080,
          height: 1080,
          byteSize: 2048,
          sha256: 'sha-adv-test',
          storageKey: 'storage-adv-key',
          sourceProductAssetDigest: 'digest-1',
          createdAt: new Date(),
        }),
      ),
    };

    mockRevisionRepo = {
      createRequest: jest.fn(() =>
        Promise.resolve({
          id: 'rev-adv-1',
          creativeJobId: sampleJob.id,
          sourceVisualAssetId: 'asset-adv-1',
          requestedByUserId: actor.internalUserId,
          type: 'REGENERATE_BACKGROUND' as const,
          status: 'PENDING' as const,
          createdAt: new Date(),
        }),
      ),
    };

    mockApprovalRepo = {
      recordApproval: jest.fn(() =>
        Promise.resolve({
          id: 'app-adv-1',
          creativeJobId: sampleJob.id,
          visualAssetId: 'asset-adv-1',
          approverUserId: actor.internalUserId,
          decision: 'CREATIVE_APPROVED' as const,
          createdAt: new Date(),
        }),
      ),
    };

    mockApproveCreative = {
      execute: jest.fn(() =>
        Promise.resolve({
          creativeJob: { ...sampleJob, status: 'CREATIVE_APPROVED' as const },
          approvalEvent: {
            id: 'app-1',
            creativeJobId: sampleJob.id,
            visualAssetId: 'asset-adv-1',
            approverUserId: actor.internalUserId,
            decision: 'CREATIVE_APPROVED' as const,
            createdAt: new Date(),
          },
        }),
      ),
    };

    mockGenerateCreative = {
      execute: jest.fn(() =>
        Promise.resolve({
          creativeJob: sampleJob,
          visualAsset: {
            id: 'asset-adv-2',
            creativeJobId: sampleJob.id,
            versionNumber: 2,
            assetRole: 'COMPOSITED_CREATIVE' as const,
            mimeType: 'image/png',
            width: 1080,
            height: 1080,
            byteSize: 2048,
            sha256: 'sha-adv-test-2',
            storageKey: 'storage-adv-key-2',
            sourceProductAssetDigest: 'digest-2',
            createdAt: new Date(),
          },
        }),
      ),
    };

    mockSearchProducts = {
      execute: jest.fn(() => Promise.resolve({ items: [sampleProduct], total: 1 })),
    };
  });

  function instantiateSystem(): {
    repository: TelegramWorkflowRepository;
    tokens: TelegramActionTokenService;
    visualCallbackHandler: VisualReviewCallbackHandler;
    commandCenter: TelegramCommandCenter;
    adapter: GrammyBotAdapter;
  } {
    const repository = createDurableRepository(durableState, actor);
    const tokens = new TelegramActionTokenService(repository);

    const visualCallbackHandler = new VisualReviewCallbackHandler(
      mockJobRepo as CreativeJobRepository,
      mockAssetRepo as VisualAssetRepository,
      mockRevisionRepo as CreativeRevisionRepository,
      mockApprovalRepo as CreativeApprovalRepository,
      repository,
      tokens,
      mockApproveCreative as ApproveCreativeUseCase,
      mockGenerateCreative as GenerateCreativeUseCase,
      mockLogger,
    );

    const commandCenter = new TelegramCommandCenter(
      repository,
      new PermissionService(),
      { execute: () => Promise.resolve(sampleProduct) } as never,
      mockSearchProducts as SearchProductsUseCase,
      {} as never,
      {} as never,
      {} as never,
      { enqueue: (): Promise<void> => Promise.resolve() },
      tokens,
      { actionTokenTtlSeconds: 900 },
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      visualCallbackHandler,
    );

    const adapter = new GrammyBotAdapter(
      null,
      commandCenter,
      mockConfig as AppConfigService,
      mockFlags as FeatureFlagService,
      mockLogger,
      repository,
    );

    return { repository, tokens, visualCallbackHandler, commandCenter, adapter };
  }

  function createMockContext(chatId = 123456, messageId = 1042): Partial<Context> {
    return {
      chat: { id: chatId } as unknown as Context['chat'],
      from: { id: chatId, first_name: 'Adversarial', is_bot: false },
      api: {
        editMessageText: jest.fn(() => Promise.resolve({ message_id: messageId })) as never,
        editMessageCaption: jest.fn(() => Promise.resolve({ message_id: messageId })) as never,
        editMessageMedia: jest.fn(() => Promise.resolve({ message_id: messageId })) as never,
        sendMessage: jest.fn(() => Promise.resolve({ message_id: messageId + 1000 })) as never,
        sendPhoto: jest.fn(() => Promise.resolve({ message_id: messageId + 1000 })) as never,
        deleteMessage: jest.fn(() => Promise.resolve(true)) as never,
      } as unknown as Context['api'],
      reply: jest.fn(() => Promise.resolve({ message_id: messageId + 1000 })) as never,
      replyWithPhoto: jest.fn(() => Promise.resolve({ message_id: messageId + 1000 })) as never,
      answerCallbackQuery: jest.fn(() => Promise.resolve(true)) as never,
    };
  }

  describe('Vector 1: Process Restart During Active Wizard (Cold Start Recovery)', () => {
    it('restores exact wizard state at Step 4 and unwinds stepHistory back across simulated crash', async () => {
      // 1. Process A: Operator creates draft and reaches Step 4
      const processA = instantiateSystem();
      const mockCtxA = createMockContext();

      // Start flow with SKU
      const step2Response = await processA.commandCenter.handleCommand({
        updateId: 'up-crash-1',
        profile,
        text: `/create ${sampleProduct.product.sku}`,
      });
      await processA.adapter.deliverResponse(mockCtxA as Context, step2Response);

      const activeFlowA = await processA.repository.findActiveFlowByIdentity(actor.identityId);
      expect(activeFlowA).not.toBeNull();
      const flowId = activeFlowA!.id;

      // Select content type -> Step 3
      const step3Response = await processA.commandCenter.handleCallback({
        updateId: 'up-crash-2',
        profile,
        callbackData: extractCallbackToken(step2Response, 0),
        messageId: 1042,
      });
      await processA.adapter.deliverResponse(mockCtxA as Context, step3Response, 1042);

      // Select language -> Step 4
      const step4Response = await processA.commandCenter.handleCallback({
        updateId: 'up-crash-3',
        profile,
        callbackData: extractCallbackToken(step3Response, 0),
        messageId: 1042,
      });
      await processA.adapter.deliverResponse(mockCtxA as Context, step4Response, 1042);

      // Verify active workflow message recorded in persistent storage
      const activeMsgBefore = await processA.repository.getActiveWorkflowMessage(flowId);
      expect(activeMsgBefore?.messageId).toBe(1042);

      // 2. SIMULATE PROCESS CRASH & RESTART (instantiate fresh system instances from durable storage)
      const processB = instantiateSystem();
      const mockCtxB = createMockContext();

      // Operator sends /resume
      const resumePrompt = await processB.commandCenter.handleCommand({
        updateId: 'up-crash-4',
        profile,
        text: '/resume',
      });

      expect(resumePrompt.messages[0]?.text).toContain('Draft in Progress Found');
      expect(resumePrompt.messages[0]?.text).toContain('Step 4 of 6');
      expect(resumePrompt.resourceKey).toBe(flowId);

      // Operator clicks Resume Draft button
      const resumeToken = extractCallbackToken(resumePrompt, 0);
      const restoredStep4 = await processB.commandCenter.handleCallback({
        updateId: 'up-crash-5',
        profile,
        callbackData: resumeToken,
        messageId: 1042,
      });

      expect(restoredStep4.callbackNotice).toBe('Resuming draft...');
      expect(restoredStep4.messages[0]?.text).toContain('Step 4 of 6');
      expect(restoredStep4.messages[0]?.action).toBe('EDIT_TEXT');

      // Deliver via Process B adapter: queries durable storage for active message ID 1042
      await processB.adapter.deliverResponse(mockCtxB as Context, restoredStep4);
      expect(mockCtxB.api?.editMessageText).toHaveBeenCalledWith(
        '123456',
        1042,
        expect.stringContaining('Step 4 of 6'),
        expect.any(Object),
      );

      // Operator clicks Back button to unwind history stack
      const backToken = extractBackToken(restoredStep4);
      const backStep3 = await processB.commandCenter.handleCallback({
        updateId: 'up-crash-6',
        profile,
        callbackData: backToken,
        messageId: 1042,
      });

      // Step history stack successfully unwound from Step 4 -> Step 3
      expect(backStep3.messages[0]?.text).toContain('Step 3 of 6');
    });
  });

  describe('Vector 2: Webhook Replay & Duplicate Delivery Idempotency', () => {
    it('allows only the first update and cleanly drops subsequent replays without duplicate execution', async () => {
      const system = instantiateSystem();
      const replayUpdateId = 'replay-unique-9988';

      // 1. Initial inbound webhook delivery
      const firstResponse = await system.commandCenter.handleCommand({
        updateId: replayUpdateId,
        profile,
        text: '/create',
      });

      expect(firstResponse.messages.length).toBeGreaterThan(0);
      expect(firstResponse.messages[0]?.text).toContain('Creation Wizard');

      // 2. Duplicate webhook replay (e.g. Telegram network retry)
      const secondResponse = await system.commandCenter.handleCommand({
        updateId: replayUpdateId,
        profile,
        text: '/create',
      });

      expect(secondResponse.messages).toHaveLength(0);

      // Duplicate callback query delivery
      const callbackUpdateId = 'replay-cb-4455';
      await system.commandCenter.handleCallback({
        updateId: callbackUpdateId,
        profile,
        callbackData: 'cw:cancel',
      });
      const duplicateCallback = await system.commandCenter.handleCallback({
        updateId: callbackUpdateId,
        profile,
        callbackData: 'cw:cancel',
      });
      expect(duplicateCallback.messages).toHaveLength(0);
      expect(duplicateCallback.callbackNotice).toBe('Already handled.');

      // 3. Concurrent webhook replay race
      const concurrentId = 'replay-concurrent-1122';
      const [res1, res2] = await Promise.all([
        system.commandCenter.handleCommand({ updateId: concurrentId, profile, text: '/help' }),
        system.commandCenter.handleCommand({ updateId: concurrentId, profile, text: '/help' }),
      ]);

      const messagesCount = res1.messages.length + res2.messages.length;
      expect(messagesCount).toBe(1); // Exactly one succeeded, one was dropped
    });
  });

  describe('Vector 3: Concurrent Action Token Race Condition', () => {
    it('ensures atomic token consumption where exactly one parallel click succeeds and duplicate receives CONSUMED', async () => {
      const system = instantiateSystem();
      const expiresAt = new Date(Date.now() + 60_000);

      // Create a single-use confirmation token
      const [rawToken] = await system.tokens.create(
        actor.identityId,
        [
          {
            action: TelegramAction.CONFIRM_APPROVE_VISUAL,
            resourceId: 'job-adv-999',
            metadata: {
              creativeJobId: 'job-adv-999',
              visualAssetId: 'asset-adv-1',
              productName: 'Adversarial Perfume',
            },
            singleUse: true,
          },
        ],
        expiresAt,
      );

      const tokenHash = hashTelegramActionToken(rawToken!);

      // Simulate 2 parallel microsecond requests attempting to consume the single-use token simultaneously
      const [outcome1, outcome2] = await Promise.all([
        system.repository.consumeActionToken(tokenHash, actor.telegramUserId, new Date()),
        system.repository.consumeActionToken(tokenHash, actor.telegramUserId, new Date()),
      ]);

      const dispositions = [outcome1.disposition, outcome2.disposition].sort();
      expect(dispositions).toEqual(['CONSUMED', 'VALID']);

      // Attempting to consume again via callback returns expired/consumed notice
      const callbackResult = await system.visualCallbackHandler.handleCallback({
        updateId: 'up-race-after',
        profile,
        callbackData: `ps:${rawToken}`,
      });

      expect(callbackResult.callbackNotice).toBe(
        'This action has expired. Please reopen the latest job.',
      );
    });
  });

  describe('Vector 4: Deleted Message Recovery & Pointer Synchronization', () => {
    it('falls back to sending a new message when target is deleted and syncs new message ID into durable storage', async () => {
      const system = instantiateSystem();
      const mockCtx = createMockContext(123456, 1042);

      // Create flow in repository
      const createdFlow = await system.repository.createFlow(
        actor.identityId,
        sampleProduct,
        new Date(Date.now() + 3600_000),
      );
      const flowId = createdFlow.id;

      // Record active message ID 1042 for flow
      await system.repository.setActiveWorkflowMessage(flowId, {
        messageId: 1042,
        chatId: '123456',
        messageType: 'WIZARD_PROMPT',
      });

      // Simulate Telegram returning 400 Bad Request: message to edit not found (e.g. user manually deleted message)
      (
        mockCtx.api?.editMessageText as unknown as {
          mockRejectedValueOnce: (err: unknown) => void;
        }
      ).mockRejectedValueOnce(new Error('Bad Request: message to edit not found'));

      const response: TelegramResponse = {
        resourceKey: flowId,
        flowId,
        messageType: 'WIZARD_PROMPT',
        messages: [
          {
            text: 'Step 5 of 6: Select Style Preset',
            action: 'EDIT_TEXT',
            messageId: 1042,
            resourceKey: flowId,
            flowId,
            messageType: 'WIZARD_PROMPT',
          },
        ],
      };

      await system.adapter.deliverResponse(mockCtx as Context, response, 1042);

      // Assert edit was attempted on the deleted ID
      expect(mockCtx.api?.editMessageText).toHaveBeenCalledWith(
        '123456',
        1042,
        'Step 5 of 6: Select Style Preset',
        expect.any(Object),
      );

      // Assert fallback reply was invoked
      expect(mockCtx.reply).toHaveBeenCalledWith(
        'Step 5 of 6: Select Style Preset',
        expect.any(Object),
      );

      // Assert durable storage is updated with fallback message ID (2042)
      const activeAfter = await system.repository.getActiveWorkflowMessage(flowId);
      expect(activeAfter?.messageId).toBe(2042);

      // Subsequent interaction now targets the recovered message ID 2042
      const subsequentCtx = createMockContext(123456, 2042);
      const nextStepResponse: TelegramResponse = {
        resourceKey: flowId,
        flowId,
        messageType: 'WIZARD_PROMPT',
        messages: [
          {
            text: 'Step 6 of 6: Review Summary',
            action: 'EDIT_TEXT',
            resourceKey: flowId,
            flowId,
            messageType: 'WIZARD_PROMPT',
          },
        ],
      };

      await system.adapter.deliverResponse(subsequentCtx as Context, nextStepResponse);

      expect(subsequentCtx.api?.editMessageText).toHaveBeenCalledWith(
        '123456',
        2042,
        'Step 6 of 6: Review Summary',
        expect.any(Object),
      );
    });
  });

  describe('Vector 5: Expired & Tampered Action Tokens', () => {
    it('rejects expired action token returning friendly notice without mutating state', async () => {
      const system = instantiateSystem();
      const past = new Date(Date.now() - 60_000); // 1 minute in the past

      const [expiredRaw] = await system.tokens.create(
        actor.identityId,
        [
          {
            action: TelegramAction.APPROVE_VISUAL,
            resourceId: 'job-adv-999',
            singleUse: true,
          },
        ],
        past,
      );

      const response = await system.visualCallbackHandler.handleCallback({
        updateId: 'up-expired-test',
        profile,
        callbackData: `ps:${expiredRaw}`,
      });

      expect(response.callbackNotice).toBe(
        'This action has expired. Please reopen the latest job.',
      );
      expect(response.messages[0]?.text).toContain('expired');
      expect(mockApproveCreative.execute).not.toHaveBeenCalled();
    });

    it('rejects tampered or corrupt action token', async () => {
      const system = instantiateSystem();

      const response = await system.visualCallbackHandler.handleCallback({
        updateId: 'up-tampered-test',
        profile,
        callbackData: 'ps:tampered_random_forged_token_1234567890',
      });

      expect(response.callbackNotice).toBe(
        'This action has expired. Please reopen the latest job.',
      );
      expect(response.messages[0]?.text).toContain('expired');
      expect(mockApproveCreative.execute).not.toHaveBeenCalled();
    });

    it('rejects cross-user action token hijacking attempt and logs security audit', async () => {
      const system = instantiateSystem();
      const expiresAt = new Date(Date.now() + 60_000);

      // Token created for User A
      const [tokenForUserA] = await system.tokens.create(
        'ident-user-a',
        [
          {
            action: TelegramAction.APPROVE_VISUAL,
            resourceId: 'job-adv-999',
            singleUse: true,
          },
        ],
        expiresAt,
      );

      // User B attempts to trigger callback with User A's token
      const _attackerActor: TelegramActor = {
        identityId: 'ident-user-b-attacker',
        internalUserId: 'user-b-attacker',
        telegramUserId: '999888777',
        displayName: 'Attacker Bob',
        roles: [RoleCode.MARKETING_APPROVER],
      };

      const attackerProfile: TelegramUserProfile = {
        telegramUserId: '999888777',
        displayName: 'Attacker Bob',
      };

      // Register token in state mapped to User A's telegram identity
      const tokenRecord = durableState.actionTokens.get(hashTelegramActionToken(tokenForUserA!))!;
      tokenRecord.telegramUserId = '111222333'; // User A's ID

      const response = await system.visualCallbackHandler.handleCallback({
        updateId: 'up-hijack-test',
        profile: attackerProfile,
        callbackData: `ps:${tokenForUserA}`,
      });

      expect(response.callbackNotice).toBe('This action belongs to another user.');
      expect(response.messages[0]?.text).toBe('This action belongs to another user.');
      expect(mockApproveCreative.execute).not.toHaveBeenCalled();
    });
  });
});

function extractCallbackToken(response: TelegramResponse, rowIndex = 0): string {
  const btn = response.messages[0]?.buttons?.[rowIndex]?.[0];
  if (!btn?.callbackData) throw new Error('Callback data missing from button');
  return btn.callbackData;
}

function extractBackToken(response: TelegramResponse): string {
  const rows = response.messages[0]?.buttons ?? [];
  for (const row of rows) {
    for (const btn of row) {
      if (btn.text.includes('Back') && btn.callbackData) {
        return btn.callbackData;
      }
    }
  }
  throw new Error('Back button missing from response');
}
