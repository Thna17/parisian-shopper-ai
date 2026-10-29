/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type Context } from 'grammy';
import {
  type ApproveCreativeUseCase,
  type CreativeApprovalRepository,
  type CreativeJobRecord,
  type CreativeJobRepository,
  type CreativeRevisionRepository,
  type GenerateCreativeUseCase,
  type RevisePosterUseCase,
  type StoreActionTokenInput,
  type TelegramActionTokenRecord,
  type TelegramActionTokenService,
  type TelegramActor,
  type TelegramResponse,
  type TelegramUserProfile,
  type TelegramWorkflowRepository,
  type VisualAssetRecord,
  type VisualAssetRepository,
  CreativeStaleVersionError,
  RevisionExecutionStrategy,
  RevisionInterpretationConfidence,
  RevisionTargetType,
  RoleCode,
  TelegramAction,
  TelegramCommandCenter,
  hashTelegramActionToken,
} from '@parisian-shopper/application';
import { type ApplicationLogger } from '@parisian-shopper/common';
import { type AppConfigService, type FeatureFlagService } from '@parisian-shopper/config';

import { GrammyBotAdapter } from '../grammy-bot.adapter.js';
import { VisualReviewCallbackHandler } from '../handlers/visual-review-callback.handler.js';

interface StoredWorkflowMessage {
  messageId: number;
  chatId?: string;
  messageType?: string;
  payloadMetadata?: Readonly<Record<string, unknown>>;
}

interface DurableStorageState {
  inboundUpdates: Set<string>;
  activeMessages: Map<string, StoredWorkflowMessage>;
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
      consumedAt?: Date | undefined;
      metadata?: Readonly<Record<string, unknown>> | undefined;
    }
  >;
  auditLogs: Array<{
    action: string;
    resourceType?: string | undefined;
    resourceId?: string | undefined;
    metadata?: unknown;
  }>;
  rateLimits: Map<string, number>;
}

describe('W31-E Telegram Structured Revision Adversarial Integration Suite', () => {
  const actor: TelegramActor = {
    identityId: 'identity-golden-editor',
    internalUserId: 'user-golden-editor',
    telegramUserId: '777000111',
    displayName: 'Golden Editor',
    roles: [RoleCode.MARKETING_APPROVER],
  };

  const profile: TelegramUserProfile = {
    telegramUserId: actor.telegramUserId,
    username: 'golden_editor',
    displayName: actor.displayName,
  };

  const sampleJob: CreativeJobRecord = {
    id: 'job-adv-tg-1',
    contentVersionId: 'ver-c1',
    productSnapshotId: 'snap-p1',
    brandRuleVersionId: 'brand-b1',
    requestedByUserId: actor.internalUserId,
    status: 'READY_FOR_REVIEW',
    targetPlatform: 'TELEGRAM',
    aspectRatio: '1:1',
    creativeProfile: 'PARISIAN_MORNING_ATELIER',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const assetV1: VisualAssetRecord = {
    id: 'asset-tg-v1',
    creativeJobId: sampleJob.id,
    versionNumber: 1,
    assetRole: 'COMPOSITED_CREATIVE',
    mimeType: 'image/png',
    width: 1080,
    height: 1080,
    byteSize: 4096,
    sha256: 'sha256-poster-v1',
    storageKey: 'cas/poster-v1.png',
    sourceProductAssetDigest: 'digest-product-aaa',
    backgroundAssetDigest: 'digest-bg-bbb',
    createdAt: new Date(),
  };

  const assetV2: VisualAssetRecord = {
    id: 'asset-tg-v2',
    creativeJobId: sampleJob.id,
    versionNumber: 2,
    assetRole: 'COMPOSITED_CREATIVE',
    mimeType: 'image/png',
    width: 1080,
    height: 1080,
    byteSize: 4200,
    sha256: 'sha256-poster-v2',
    storageKey: 'cas/poster-v2.png',
    sourceProductAssetDigest: 'digest-product-aaa',
    backgroundAssetDigest: 'digest-bg-bbb',
    createdAt: new Date(),
  };

  let storageState: DurableStorageState;
  let jobState: CreativeJobRecord;
  let assetsState: VisualAssetRecord[];
  let workflowRepo: TelegramWorkflowRepository;
  let jobRepo: jest.Mocked<CreativeJobRepository>;
  let assetRepo: jest.Mocked<VisualAssetRepository>;
  let revisionRepo: jest.Mocked<CreativeRevisionRepository>;
  let approvalRepo: jest.Mocked<CreativeApprovalRepository>;
  let tokenService: TelegramActionTokenService;
  let mockRevisePoster: jest.Mocked<RevisePosterUseCase>;
  let handler: VisualReviewCallbackHandler;
  let adapter: GrammyBotAdapter;

  const mockLogger: ApplicationLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };

  beforeEach(() => {
    storageState = {
      inboundUpdates: new Set<string>(),
      activeMessages: new Map<string, StoredWorkflowMessage>(),
      actionTokens: new Map(),
      auditLogs: [],
      rateLimits: new Map(),
    };

    jobState = { ...sampleJob };
    assetsState = [{ ...assetV1 }];

    workflowRepo = {
      claimInboundUpdate: (updateId: string) => {
        if (storageState.inboundUpdates.has(updateId)) {
          return Promise.resolve(false);
        }
        storageState.inboundUpdates.add(updateId);
        return Promise.resolve(true);
      },
      resolveActor: () => Promise.resolve(actor),
      recordDeniedAccess: () => Promise.resolve(),
      consumeRateLimit: (_id: string, actionKey: string, limit: number) => {
        const count = storageState.rateLimits.get(actionKey) ?? 0;
        if (count >= limit) return Promise.resolve(false);
        storageState.rateLimits.set(actionKey, count + 1);
        return Promise.resolve(true);
      },
      createFlow: () => {
        throw new Error('Not used');
      },
      findFlowById: () => Promise.resolve(null),
      updateFlowSelection: () => {
        throw new Error('Not used');
      },
      setFlowMetadata: () => {
        throw new Error('Not used');
      },
      setActiveWorkflowMessage: (
        resourceKey: string,
        messageIdOrInput: unknown,
        chatIdParam?: string,
        optionsParam?: {
          messageType?: string;
          payloadMetadata?: Readonly<Record<string, unknown>>;
        },
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

        const record: StoredWorkflowMessage = {
          messageId,
          ...(chatId !== undefined ? { chatId } : {}),
          messageType: messageType ?? 'WIZARD_PROMPT',
          ...(payloadMetadata !== undefined ? { payloadMetadata } : {}),
        };
        storageState.activeMessages.set(resourceKey, record);
        return Promise.resolve();
      },
      getActiveWorkflowMessage: (resourceKey: string) => {
        const found = storageState.activeMessages.get(resourceKey);
        if (!found) return Promise.resolve(null);
        return Promise.resolve({
          messageId: found.messageId,
          ...(found.chatId !== undefined ? { chatId: found.chatId } : {}),
          ...(found.messageType !== undefined ? { messageType: found.messageType } : {}),
          ...(found.payloadMetadata !== undefined
            ? { payloadMetadata: found.payloadMetadata }
            : {}),
        });
      },
      clearActiveWorkflowMessage: (resourceKey: string) => {
        storageState.activeMessages.delete(resourceKey);
        return Promise.resolve();
      },
      completeFlow: () => Promise.resolve(),
      cancelFlow: () => Promise.resolve(),
      findActiveFlowByIdentity: () => Promise.resolve(null),
      storeActionTokens: (inputs: readonly StoreActionTokenInput[]) => {
        inputs.forEach((input: StoreActionTokenInput, idx: number) => {
          storageState.actionTokens.set(input.tokenHash, {
            id: `tok-${Date.now()}-${idx}`,
            tokenHash: input.tokenHash,
            telegramIdentityId: input.telegramIdentityId,
            telegramUserId: actor.telegramUserId,
            action: input.action,
            resourceId: input.resourceId,
            singleUse: input.singleUse ?? false,
            expiresAt: input.expiresAt,
            metadata: input.metadata,
          });
        });
        return Promise.resolve();
      },
      consumeActionToken: (tokenHash: string, telegramUserId: string, now: Date) => {
        const record = storageState.actionTokens.get(tokenHash);
        if (!record) return Promise.resolve({ disposition: 'NOT_FOUND' });
        if (record.telegramUserId !== telegramUserId) {
          return Promise.resolve({ disposition: 'WRONG_USER' });
        }
        if (record.expiresAt < now) {
          return Promise.resolve({ disposition: 'EXPIRED' });
        }
        if (record.singleUse && record.consumedAt !== undefined) {
          return Promise.resolve({ disposition: 'CONSUMED' });
        }
        if (record.singleUse) {
          record.consumedAt = now;
        }
        const actionTokenRecord: TelegramActionTokenRecord = {
          id: record.id,
          telegramIdentityId: record.telegramIdentityId,
          action: record.action,
          resourceId: record.resourceId,
          singleUse: record.singleUse,
          expiresAt: record.expiresAt,
          ...(record.metadata !== undefined ? { metadata: record.metadata } : {}),
        };
        return Promise.resolve({ disposition: 'VALID', token: actionTokenRecord });
      },
      appendAudit: (input: {
        action: string;
        resourceType?: string;
        resourceId?: string;
        metadata?: unknown;
      }) => {
        storageState.auditLogs.push({
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          metadata: input.metadata,
        });
        return Promise.resolve();
      },
      getDraftViewByVersionId: () => Promise.resolve(null),
      recordChannelPublication: () => Promise.resolve(),
      getChannelPublication: () => Promise.resolve(null),
    } as unknown as TelegramWorkflowRepository;

    tokenService = {
      create: async (
        identityId: string,
        defs: readonly {
          action: TelegramAction;
          resourceId: string;
          metadata?: Record<string, unknown>;
          singleUse?: boolean;
        }[],
        expiresAt: Date,
      ) => {
        const tokens: string[] = [];
        const storeInputs = defs.map((d, i) => {
          const rawToken = `ps_adv_token_${Date.now()}_${i}_${Math.floor(Math.random() * 100000)}`;
          const tokenHash = hashTelegramActionToken(rawToken);
          tokens.push(rawToken);
          return {
            tokenHash,
            telegramIdentityId: identityId,
            action: d.action,
            resourceId: d.resourceId,
            singleUse: d.singleUse ?? false,
            expiresAt,
            ...(d.metadata !== undefined ? { metadata: d.metadata } : {}),
          };
        });
        await workflowRepo.storeActionTokens(storeInputs);
        return tokens;
      },
    } as unknown as TelegramActionTokenService;

    jobRepo = {
      createJob: jest.fn<CreativeJobRepository['createJob']>(),
      findById: jest.fn((id: string) =>
        Promise.resolve(id === jobState.id ? { ...jobState } : null),
      ),
      findByContentVersionId: jest.fn(() => Promise.resolve([{ ...jobState }])),
      transitionStatus: jest.fn((id: string, _from: unknown, to: unknown) => {
        jobState = { ...jobState, status: to as CreativeJobRecord['status'] };
        return Promise.resolve({ ...jobState });
      }),
    };

    assetRepo = {
      createAsset: jest.fn((input) => {
        const nextV = assetsState.length + 1;
        const newA: VisualAssetRecord = {
          id: `asset-tg-v${nextV}`,
          creativeJobId: input.creativeJobId,
          versionNumber: nextV,
          assetRole: input.assetRole,
          mimeType: input.mimeType,
          width: input.width,
          height: input.height,
          byteSize: input.byteSize,
          sha256: input.sha256,
          storageKey: input.storageKey,
          sourceProductAssetDigest: input.sourceProductAssetDigest,
          createdAt: new Date(),
        };
        assetsState.push(newA);
        return Promise.resolve(newA);
      }),
      findById: jest.fn((id: string) =>
        Promise.resolve(assetsState.find((a) => a.id === id) ?? null),
      ),
      findByJobAndVersion: jest.fn((_id: string, version: number) =>
        Promise.resolve(assetsState.find((a) => a.versionNumber === version) ?? null),
      ),
      findLatestByJobId: jest.fn(() => {
        const latest = assetsState[assetsState.length - 1];
        return Promise.resolve(latest ?? null);
      }),
      listByJobId: jest.fn(() => Promise.resolve([...assetsState])),
    };

    revisionRepo = {
      createRequest: jest.fn((input) =>
        Promise.resolve({
          id: 'rev-1',
          creativeJobId: input.creativeJobId,
          sourceVisualAssetId: input.sourceVisualAssetId,
          requestedByUserId: input.requestedByUserId,
          type: input.type,
          status: 'PENDING',
          createdAt: new Date(),
        }),
      ),
      findById: jest.fn(() => Promise.resolve(null)),
      findActiveByJobId: jest.fn(() => Promise.resolve(null)),
      completeRequest: jest.fn((id: string, resultingId: string) =>
        Promise.resolve({
          id,
          creativeJobId: sampleJob.id,
          sourceVisualAssetId: assetV1.id,
          requestedByUserId: actor.internalUserId,
          type: 'EDIT_BACKGROUND',
          status: 'COMPLETED',
          resultingVisualAssetId: resultingId,
          createdAt: new Date(),
        }),
      ),
      cancelRequest: jest.fn((id: string) =>
        Promise.resolve({
          id,
          creativeJobId: sampleJob.id,
          sourceVisualAssetId: assetV1.id,
          requestedByUserId: actor.internalUserId,
          type: 'EDIT_BACKGROUND',
          status: 'CANCELLED',
          createdAt: new Date(),
        }),
      ),
    };

    approvalRepo = {
      recordApproval: jest.fn(),
      findByJobId: jest.fn(() => Promise.resolve([])),
      findByAssetId: jest.fn(() => Promise.resolve([])),
    };

    mockRevisePoster = {
      executePlan: jest.fn((_input) => {
        assetsState.push(assetV2);
        return Promise.resolve({
          visualAsset: assetV2,
          isPassed: true,
          posterBuffer: Buffer.from('mock-poster-buffer-v2'),
        });
      }),
    } as unknown as jest.Mocked<RevisePosterUseCase>;

    handler = new VisualReviewCallbackHandler(
      jobRepo,
      assetRepo,
      revisionRepo,
      approvalRepo,
      workflowRepo,
      tokenService,
      {} as unknown as ApproveCreativeUseCase,
      {} as unknown as GenerateCreativeUseCase,
      mockLogger,
      undefined,
      undefined,
      mockRevisePoster,
    );

    adapter = new GrammyBotAdapter(
      null,
      {} as unknown as TelegramCommandCenter,
      { telegram: { botToken: 'mock-token', mode: 'webhook' } } as unknown as AppConfigService,
      { isEnabled: () => true } as unknown as FeatureFlagService,
      mockLogger,
      workflowRepo,
    );
  });

  function createMockGrammyContext(messageId = 5555): Partial<Context> {
    return {
      chat: { id: 123456 } as unknown as Context['chat'],
      from: { id: 777000111, first_name: 'Golden Editor', is_bot: false },
      reply: jest.fn(() => Promise.resolve({ message_id: messageId })) as never,
      api: {
        editMessageText: jest.fn(() => Promise.resolve({ message_id: messageId })) as never,
        editMessageCaption: jest.fn(() => Promise.resolve({ message_id: messageId })) as never,
        editMessageMedia: jest.fn(() => Promise.resolve({ message_id: messageId })) as never,
        sendMessage: jest.fn(() => Promise.resolve({ message_id: messageId + 1 })) as never,
        sendPhoto: jest.fn(() => Promise.resolve({ message_id: messageId + 1 })) as never,
      } as unknown as Context['api'],
    };
  }

  // =========================================================================
  // VECTOR 5.1: TELEGRAM WEBHOOK DUPLICATE REPLAY ATTACK
  // =========================================================================
  describe('Vector 5.1: Telegram Webhook Duplicate Replay Attack', () => {
    it('discards duplicate webhook updates with identical updateId without executing revision twice', async () => {
      const updateId = 'update-replay-1010';

      // First webhook delivery
      const isClaimed1 = await workflowRepo.claimInboundUpdate(
        updateId,
        actor.telegramUserId,
        'callback_query',
      );
      expect(isClaimed1).toBe(true);

      // Replay attack with identical updateId
      const isClaimed2 = await workflowRepo.claimInboundUpdate(
        updateId,
        actor.telegramUserId,
        'callback_query',
      );
      expect(isClaimed2).toBe(false);

      // Only the first delivery proceeds
      expect(storageState.inboundUpdates.has(updateId)).toBe(true);
    });
  });

  // =========================================================================
  // VECTOR 5.2: CONCURRENT MICROSECOND ACTION TOKEN RACE ON SINGLE-USE CONFIRM
  // =========================================================================
  describe('Vector 5.2: Concurrent Microsecond Action Token Race on Single-Use CONFIRM_STRUCTURED_REVISION', () => {
    it('guarantees atomic single-use: exactly 1 request succeeds (VALID) and concurrent replica gets CONSUMED notice', async () => {
      const plan = {
        id: 'plan-adv-tg',
        creativeJobId: sampleJob.id,
        baseVersionNumber: 1,
        requestedByUserId: actor.internalUserId,
        rawInstruction: 'Headline: Royale Rose',
        confidence: RevisionInterpretationConfidence.CONFIDENT,
        executionStrategy: RevisionExecutionStrategy.ZERO_AI_COMPOSITE,
        mutations: [
          {
            target: RevisionTargetType.HEADLINE,
            fieldName: 'headline',
            requestedValue: 'Royale Rose',
          },
        ],
        affectedLayerGroups: ['TYPOGRAPHY'],
        preservedLayerDigests: { PRODUCT_HERO: 'digest-hero', BACKGROUND: 'digest-bg' },
        requiresConfirmation: false,
        estimatedExecutionMs: 30,
        createdAt: new Date(),
      };

      const tokens = await tokenService.create(
        actor.identityId,
        [
          {
            action: TelegramAction.CONFIRM_STRUCTURED_REVISION,
            resourceId: sampleJob.id,
            metadata: {
              creativeJobId: sampleJob.id,
              visualAssetId: assetV1.id,
              productName: 'Parisian Rose',
              revisionPlan: plan,
            },
            singleUse: true,
          },
        ],
        new Date(Date.now() + 60000),
      );

      const rawToken = tokens[0] ?? '';

      // Simulate 2 parallel requests clicking the Confirm button simultaneously
      const [response1, response2] = await Promise.all([
        handler.handleCallback({
          updateId: 'cb-race-1',
          profile,
          callbackData: `ps:${rawToken}`,
          messageId: 5555,
        }),
        handler.handleCallback({
          updateId: 'cb-race-2',
          profile,
          callbackData: `ps:${rawToken}`,
          messageId: 5555,
        }),
      ]);

      const outcomes = [response1, response2];
      const successResponse = outcomes.find((r) => r.callbackNotice === 'Revision applied!');
      const consumedResponse = outcomes.find(
        (r) =>
          r.callbackNotice === 'This action has expired. Please reopen the latest job.' ||
          r.messages[0]?.text?.includes('This action has expired'),
      );

      // Exactly 1 must succeed and execute revision
      expect(successResponse).toBeDefined();
      expect(successResponse?.messages[0]?.text).toContain('Poster Revision Applied (v2)');
      expect(mockRevisePoster.executePlan).toHaveBeenCalledTimes(1);

      // Concurrent request was cleanly rejected without duplicate execution
      expect(consumedResponse).toBeDefined();
    });
  });

  // =========================================================================
  // VECTOR 5.3: EXPIRED & TAMPERED CONFIRMATION TOKENS
  // =========================================================================
  describe('Vector 5.3: Expired & Tampered Confirmation Tokens', () => {
    it('rejects expired confirmation token and warns user', async () => {
      const expiredTokens = await tokenService.create(
        actor.identityId,
        [
          {
            action: TelegramAction.CONFIRM_STRUCTURED_REVISION,
            resourceId: sampleJob.id,
            metadata: { creativeJobId: sampleJob.id },
            singleUse: true,
          },
        ],
        new Date(Date.now() - 10000), // Expired 10 seconds ago
      );

      const res = await handler.handleCallback({
        updateId: 'cb-exp-1',
        profile,
        callbackData: `ps:${expiredTokens[0]}`,
        messageId: 5555,
      });

      expect(res.callbackNotice).toBe('This action has expired. Please reopen the latest job.');
      expect(res.messages[0]?.text).toContain('This action has expired');
      expect(mockRevisePoster.executePlan).not.toHaveBeenCalled();
    });

    it('rejects tampered or malformed token string', async () => {
      const res = await handler.handleCallback({
        updateId: 'cb-tamp-1',
        profile,
        callbackData: 'ps:tampered_random_string_that_does_not_exist_at_all',
        messageId: 5555,
      });

      expect(res.callbackNotice).toBe('Invalid action.');
      expect(res.messages[0]?.text).toContain('This action has expired');
      expect(mockRevisePoster.executePlan).not.toHaveBeenCalled();
    });

    it('rejects action token dispatched by unauthorized user identity and logs audit', async () => {
      const tokens = await tokenService.create(
        'other-identity-999',
        [
          {
            action: TelegramAction.CONFIRM_STRUCTURED_REVISION,
            resourceId: sampleJob.id,
            metadata: { creativeJobId: sampleJob.id },
            singleUse: true,
          },
        ],
        new Date(Date.now() + 60000),
      );

      // Wrong telegramUserId in storage
      const tokenHash = hashTelegramActionToken(tokens[0]!);
      const rec = storageState.actionTokens.get(tokenHash)!;
      rec.telegramUserId = '999999999';

      const res = await handler.handleCallback({
        updateId: 'cb-wrong-user',
        profile,
        callbackData: `ps:${tokens[0]}`,
        messageId: 5555,
      });

      expect(res.callbackNotice).toBe('This action belongs to another user.');
    });
  });

  // =========================================================================
  // VECTOR 5.4: STALE VERSION RECOVERY IN TELEGRAM CONVERSATIONAL HANDLER
  // =========================================================================
  describe('Vector 5.4: Stale Version Recovery in Telegram Conversational Handler', () => {
    it('catches CreativeStaleVersionError gracefully and renders a clear user notice without crashing', async () => {
      mockRevisePoster.executePlan.mockRejectedValueOnce(
        new CreativeStaleVersionError(
          'Target visual asset version (2) does not match expected revision base version (1)',
        ),
      );

      const plan = {
        id: 'plan-stale-tg',
        creativeJobId: sampleJob.id,
        baseVersionNumber: 1,
        requestedByUserId: actor.internalUserId,
        rawInstruction: 'Headline: Late Stale Edit',
        confidence: RevisionInterpretationConfidence.CONFIDENT,
        executionStrategy: RevisionExecutionStrategy.ZERO_AI_COMPOSITE,
        mutations: [
          {
            target: RevisionTargetType.HEADLINE,
            fieldName: 'headline',
            requestedValue: 'Late Stale Edit',
          },
        ],
        affectedLayerGroups: ['TYPOGRAPHY'],
        preservedLayerDigests: { PRODUCT_HERO: 'hero-sha', BACKGROUND: 'bg-sha' },
        requiresConfirmation: false,
        estimatedExecutionMs: 30,
        createdAt: new Date(),
      };

      const tokens = await tokenService.create(
        actor.identityId,
        [
          {
            action: TelegramAction.CONFIRM_STRUCTURED_REVISION,
            resourceId: sampleJob.id,
            metadata: {
              creativeJobId: sampleJob.id,
              visualAssetId: assetV1.id,
              productName: 'Parisian Rose',
              revisionPlan: plan,
            },
            singleUse: true,
          },
        ],
        new Date(Date.now() + 60000),
      );

      const res = await handler.handleCallback({
        updateId: 'cb-stale-recover',
        profile,
        callbackData: `ps:${tokens[0] ?? ''}`,
        messageId: 5555,
      });

      expect(res.callbackNotice).toBe('Revision failed.');
      expect(res.messages[0]?.text).toContain('❌ *Revision Failed*');
      expect(res.messages[0]?.text).toContain('Target visual asset version (2) does not match');
      expect(res.messages[0]?.text).toContain('Please try again or type /cancel to abort.');
    });
  });

  // =========================================================================
  // VECTOR 5.5: TELEGRAM MESSAGE EDIT FAILURE FALLBACK SYNCHRONIZATION
  // =========================================================================
  describe('Vector 5.5: Telegram Message Edit Failure Fallback Synchronization', () => {
    it('falls back to sendMessage/sendPhoto when editMessageMedia throws and synchronizes durable active message ID', async () => {
      const mockCtx = createMockGrammyContext(8888);

      // Simulate Telegram API throwing editing error (e.g. message deleted by user)
      mockCtx.api!.editMessageMedia = jest.fn(() =>
        Promise.reject(new Error('Bad Request: message to edit not found')),
      );

      const response: TelegramResponse = {
        messages: [
          {
            text: 'Poster Revision Applied (v2)',
            photoBuffer: Buffer.from('new-photo-bytes'),
            action: 'EDIT_TEXT',
          },
        ],
        resourceKey: sampleJob.id,
      };

      // Set initial message ID in durable store
      await workflowRepo.setActiveWorkflowMessage(sampleJob.id, 8888, '123456', {
        messageType: 'VISUAL_REVIEW_CARD',
      });

      // Deliver response via adapter
      await adapter.deliverResponse(mockCtx as Context, response);

      // Verify fallback sendPhoto was called
      expect(mockCtx.api?.sendPhoto).toHaveBeenCalledWith(
        '123456',
        expect.any(Object),
        expect.any(Object),
      );

      // Verify newly created message ID (8889) was persisted back to durable storage
      const updatedActiveMsg = await workflowRepo.getActiveWorkflowMessage(sampleJob.id);
      expect(updatedActiveMsg?.messageId).toBe(8889);
    });
  });

  // =========================================================================
  // VECTOR 5.6: INTERACTIVE TWO-PHASE CONFIRMATION LIFECYCLE
  // =========================================================================
  describe('Vector 5.6: Interactive Two-Phase Confirmation Lifecycle (Cancel vs Confirm)', () => {
    it('Cancellation rolls back job status to READY_FOR_REVIEW and clears awaiting revision state', async () => {
      // Operator in REVISION_REQUESTED state
      jobState = { ...jobState, status: 'REVISION_REQUESTED' };
      await workflowRepo.setActiveWorkflowMessage(
        `awaiting_revision:${actor.identityId}`,
        1234,
        '123456',
      );

      const cancelTokens = await tokenService.create(
        actor.identityId,
        [
          {
            action: TelegramAction.CANCEL_STRUCTURED_REVISION,
            resourceId: sampleJob.id,
            metadata: {
              creativeJobId: sampleJob.id,
              visualAssetId: assetV1.id,
              productName: 'Parisian Rose',
            },
            singleUse: true,
          },
        ],
        new Date(Date.now() + 60000),
      );

      const res = await handler.handleCallback({
        updateId: 'cb-cancel-rev',
        profile,
        callbackData: `ps:${cancelTokens[0]}`,
        messageId: 5555,
      });

      expect(res.callbackNotice).toBe('Revision cancelled.');
      expect(res.messages[0]?.text).toContain('❌ *Revision Cancelled*');

      // Status transitioned back to READY_FOR_REVIEW
      expect(jobState.status).toBe('READY_FOR_REVIEW');

      // Awaiting revision state cleared from workflowRepo
      const awaitingMsg = await workflowRepo.getActiveWorkflowMessage(
        `awaiting_revision:${actor.identityId}`,
      );
      expect(awaitingMsg).toBeNull();
    });
  });
});
