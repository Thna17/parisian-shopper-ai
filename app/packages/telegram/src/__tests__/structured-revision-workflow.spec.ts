/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  type ApproveCreativeUseCase,
  type CreativeApprovalRepository,
  type CreativeJobRecord,
  type CreativeJobRepository,
  type CreativeRevisionRepository,
  type GenerateCreativeUseCase,
  type RevisePosterUseCase,
  RevisionExecutionStrategy,
  RevisionInterpretationConfidence,
  RevisionTargetType,
  TelegramAction,
  type TelegramActionTokenRecord,
  type TelegramActionTokenService,
  type TelegramActor,
  type TelegramWorkflowRepository,
  type VisualAssetRecord,
  type VisualAssetRepository,
} from '@parisian-shopper/application';
import { type ApplicationLogger } from '@parisian-shopper/common';

import { VisualReviewCallbackHandler } from '../handlers/visual-review-callback.handler.js';
import { buildStructuredRevisionConfirmationKeyboard } from '../keyboards/visual-review.keyboard.js';
import { VisualReviewCardRenderer } from '../renderers/visual-review-card.renderer.js';

describe('W31 Structured Targeted Revision Workflow', () => {
  const actor: TelegramActor = {
    identityId: 'id-1',
    internalUserId: 'user-1',
    telegramUserId: '12345678',
    displayName: 'Golden Reviewer',
    roles: ['ADMIN'],
  };

  const sampleJob: CreativeJobRecord = {
    id: 'job-rev-1234',
    contentVersionId: 'version-1',
    productSnapshotId: 'snapshot-1',
    brandRuleVersionId: 'brand-1',
    requestedByUserId: 'user-1',
    status: 'READY_FOR_REVIEW',
    targetPlatform: 'TELEGRAM',
    aspectRatio: '1:1',
    creativeProfile: 'luxury',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleAsset: VisualAssetRecord = {
    id: 'asset-rev-1',
    creativeJobId: sampleJob.id,
    versionNumber: 1,
    assetRole: 'COMPOSITED_CREATIVE',
    mimeType: 'image/png',
    width: 1080,
    height: 1080,
    byteSize: 2048,
    sha256: 'cas-hash-flacon-111',
    storageKey: 'storage-1',
    sourceProductAssetDigest: 'digest-flacon-aaa',
    createdAt: new Date(),
  };

  let jobRepo: jest.Mocked<CreativeJobRepository>;
  let assetRepo: jest.Mocked<VisualAssetRepository>;
  let revisionRepo: jest.Mocked<CreativeRevisionRepository>;
  let approvalRepo: jest.Mocked<CreativeApprovalRepository>;
  let workflowRepo: jest.Mocked<TelegramWorkflowRepository>;
  let tokens: jest.Mocked<TelegramActionTokenService>;
  let mockRevisePoster: jest.Mocked<RevisePosterUseCase>;
  let handler: VisualReviewCallbackHandler;

  const mockLogger: ApplicationLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };

  beforeEach(() => {
    jobRepo = {
      createJob: jest.fn<CreativeJobRepository['createJob']>(),
      findById: jest.fn<CreativeJobRepository['findById']>((id: string) =>
        Promise.resolve({ ...sampleJob, id }),
      ),
      findByContentVersionId: jest.fn<CreativeJobRepository['findByContentVersionId']>(),
      transitionStatus: jest.fn<CreativeJobRepository['transitionStatus']>(
        (id: string, _from: unknown, target: unknown) =>
          Promise.resolve({
            ...sampleJob,
            id,
            status: target as CreativeJobRecord['status'],
          }),
      ),
    };

    assetRepo = {
      createAsset: jest.fn<VisualAssetRepository['createAsset']>(),
      findById: jest.fn<VisualAssetRepository['findById']>((id: string) =>
        Promise.resolve({ ...sampleAsset, id }),
      ),
      findByJobAndVersion: jest.fn<VisualAssetRepository['findByJobAndVersion']>(),
      listByJobId: jest.fn<VisualAssetRepository['listByJobId']>(),
      findLatestByJobId: jest.fn<VisualAssetRepository['findLatestByJobId']>(),
    };

    revisionRepo = {
      createRequest: jest.fn<CreativeRevisionRepository['createRequest']>((input) =>
        Promise.resolve({
          id: 'rev-req-123',
          creativeJobId: input.creativeJobId,
          sourceVisualAssetId: input.sourceVisualAssetId,
          requestedByUserId: input.requestedByUserId,
          type: input.type,
          status: 'PENDING',
          createdAt: new Date(),
        }),
      ),
      findById: jest.fn<CreativeRevisionRepository['findById']>(),
      findActiveByJobId: jest.fn<CreativeRevisionRepository['findActiveByJobId']>((jobId: string) =>
        Promise.resolve({
          id: 'rev-req-123',
          creativeJobId: jobId,
          sourceVisualAssetId: sampleAsset.id,
          requestedByUserId: actor.internalUserId,
          type: 'EDIT_BACKGROUND',
          status: 'PENDING',
          createdAt: new Date(),
        }),
      ),
      completeRequest: jest.fn<CreativeRevisionRepository['completeRequest']>(
        (id: string, resultingId: string) =>
          Promise.resolve({
            id,
            creativeJobId: sampleJob.id,
            sourceVisualAssetId: sampleAsset.id,
            resultingVisualAssetId: resultingId,
            requestedByUserId: actor.internalUserId,
            type: 'EDIT_BACKGROUND',
            status: 'COMPLETED',
            createdAt: new Date(),
          }),
      ),
      cancelRequest: jest.fn<CreativeRevisionRepository['cancelRequest']>(),
    };

    approvalRepo = {
      recordApproval: jest.fn<CreativeApprovalRepository['recordApproval']>(),
      findByJobId: jest.fn<CreativeApprovalRepository['findByJobId']>(),
      findByAssetId: jest.fn<CreativeApprovalRepository['findByAssetId']>(),
    };

    interface StoredWorkflowMessage {
      messageId: number;
      chatId?: string;
      messageType?: string;
      payloadMetadata?: Readonly<Record<string, unknown>>;
    }
    const activeMessageStore = new Map<string, StoredWorkflowMessage>();

    workflowRepo = {
      claimInboundUpdate: jest.fn<TelegramWorkflowRepository['claimInboundUpdate']>(() =>
        Promise.resolve(true),
      ),
      resolveActor: jest.fn<TelegramWorkflowRepository['resolveActor']>(() =>
        Promise.resolve(actor),
      ),
      recordDeniedAccess: jest.fn<TelegramWorkflowRepository['recordDeniedAccess']>(() =>
        Promise.resolve(),
      ),
      consumeRateLimit: jest.fn<TelegramWorkflowRepository['consumeRateLimit']>(() =>
        Promise.resolve(true),
      ),
      createFlow: jest.fn<TelegramWorkflowRepository['createFlow']>(),
      findFlowById: jest.fn<TelegramWorkflowRepository['findFlowById']>(),
      updateFlowSelection: jest.fn<TelegramWorkflowRepository['updateFlowSelection']>(),
      completeFlow: jest.fn<TelegramWorkflowRepository['completeFlow']>(),
      storeActionTokens: jest.fn<TelegramWorkflowRepository['storeActionTokens']>(),
      consumeActionToken: jest.fn<TelegramWorkflowRepository['consumeActionToken']>(),
      listRecentJobs: jest.fn<TelegramWorkflowRepository['listRecentJobs']>(),
      listHistory: jest.fn<TelegramWorkflowRepository['listHistory']>(),
      findJobByFlowId: jest.fn<TelegramWorkflowRepository['findJobByFlowId']>(),
      getSourceByJobId: jest.fn<TelegramWorkflowRepository['getSourceByJobId']>(),
      getValidationByVersionId: jest.fn<TelegramWorkflowRepository['getValidationByVersionId']>(),
      getDraftViewByVersionId: jest.fn<TelegramWorkflowRepository['getDraftViewByVersionId']>(),
      getFailureViewByJobId: jest.fn<TelegramWorkflowRepository['getFailureViewByJobId']>(),
      claimOutboxEvents: jest.fn<TelegramWorkflowRepository['claimOutboxEvents']>(),
      beginNotificationDelivery: jest.fn<TelegramWorkflowRepository['beginNotificationDelivery']>(),
      markNotificationSent: jest.fn<TelegramWorkflowRepository['markNotificationSent']>(),
      markNotificationFailed: jest.fn<TelegramWorkflowRepository['markNotificationFailed']>(),
      markOutboxProcessed: jest.fn<TelegramWorkflowRepository['markOutboxProcessed']>(),
      createPendingInteraction: jest.fn<TelegramWorkflowRepository['createPendingInteraction']>(),
      findActivePendingInteraction:
        jest.fn<TelegramWorkflowRepository['findActivePendingInteraction']>(),
      completePendingInteraction:
        jest.fn<TelegramWorkflowRepository['completePendingInteraction']>(),
      cancelPendingInteraction: jest.fn<TelegramWorkflowRepository['cancelPendingInteraction']>(),
      getPreviousVersions: jest.fn<TelegramWorkflowRepository['getPreviousVersions']>(),
      appendAudit: jest.fn<TelegramWorkflowRepository['appendAudit']>(() => Promise.resolve()),
      setActiveWorkflowMessage: jest.fn<TelegramWorkflowRepository['setActiveWorkflowMessage']>(
        (
          key: string,
          messageIdOrInput: unknown,
          chatId?: string,
          options?: { messageType?: string; payloadMetadata?: Readonly<Record<string, unknown>> },
        ) => {
          if (typeof messageIdOrInput === 'number') {
            const entry: StoredWorkflowMessage = { messageId: messageIdOrInput };
            if (chatId !== undefined) entry.chatId = chatId;
            if (options?.messageType !== undefined) entry.messageType = options.messageType;
            if (options?.payloadMetadata !== undefined)
              entry.payloadMetadata = options.payloadMetadata;
            activeMessageStore.set(key, entry);
          } else {
            const input = messageIdOrInput as {
              messageId: number;
              chatId?: string;
              messageType?: string;
              payloadMetadata?: Readonly<Record<string, unknown>>;
            };
            const entry: StoredWorkflowMessage = { messageId: input.messageId };
            if (input.chatId !== undefined) entry.chatId = input.chatId;
            if (input.messageType !== undefined) entry.messageType = input.messageType;
            if (input.payloadMetadata !== undefined) entry.payloadMetadata = input.payloadMetadata;
            activeMessageStore.set(key, entry);
          }
          return Promise.resolve();
        },
      ),
      getActiveWorkflowMessage: jest.fn<TelegramWorkflowRepository['getActiveWorkflowMessage']>(
        (key: string) => {
          const val = activeMessageStore.get(key);
          if (!val) return Promise.resolve(null);
          const result: {
            messageId: number;
            chatId?: string;
            messageType?: string;
            payloadMetadata?: Readonly<Record<string, unknown>>;
          } = { messageId: val.messageId };
          if (val.chatId !== undefined) result.chatId = val.chatId;
          if (val.messageType !== undefined) result.messageType = val.messageType;
          if (val.payloadMetadata !== undefined) result.payloadMetadata = val.payloadMetadata;
          return Promise.resolve(result);
        },
      ),
      clearActiveWorkflowMessage: jest.fn<TelegramWorkflowRepository['clearActiveWorkflowMessage']>(
        (key: string) => {
          activeMessageStore.delete(key);
          return Promise.resolve();
        },
      ),
      recordChannelPublication: jest.fn<TelegramWorkflowRepository['recordChannelPublication']>(
        () => Promise.resolve(),
      ),
      getChannelPublication: jest.fn<TelegramWorkflowRepository['getChannelPublication']>(() =>
        Promise.resolve(null),
      ),
      cancelFlow: jest.fn<TelegramWorkflowRepository['cancelFlow']>(() => Promise.resolve()),
      findActiveFlowByIdentity: jest.fn<TelegramWorkflowRepository['findActiveFlowByIdentity']>(
        () => Promise.resolve(null),
      ),
    };

    tokens = {
      create: jest.fn<TelegramActionTokenService['create']>(
        (_identityId: string, actions: readonly unknown[]) =>
          Promise.resolve(actions.map((_, i) => `token_${i}`)),
      ),
    } as unknown as jest.Mocked<TelegramActionTokenService>;

    mockRevisePoster = {
      editText: jest.fn<RevisePosterUseCase['editText']>(() =>
        Promise.resolve({
          visualAsset: { ...sampleAsset, id: 'asset-rev-2', versionNumber: 2 },
          isPassed: true,
          findings: [],
          posterBuffer: Buffer.from('fake-poster-v2'),
        }),
      ),
      editLayout: jest.fn<RevisePosterUseCase['editLayout']>(() =>
        Promise.resolve({
          visualAsset: { ...sampleAsset, id: 'asset-rev-2', versionNumber: 2 },
          isPassed: true,
          findings: [],
          posterBuffer: Buffer.from('fake-layout-v2'),
        }),
      ),
      changeStyle: jest.fn<RevisePosterUseCase['changeStyle']>(() =>
        Promise.resolve({
          visualAsset: { ...sampleAsset, id: 'asset-rev-2', versionNumber: 2 },
          isPassed: true,
          findings: [],
          posterBuffer: Buffer.from('fake-style-v2'),
        }),
      ),
      newBackground: jest.fn<RevisePosterUseCase['newBackground']>(() =>
        Promise.resolve({
          visualAsset: { ...sampleAsset, id: 'asset-rev-2', versionNumber: 2 },
          isPassed: true,
          findings: [],
          posterBuffer: Buffer.from('fake-new-bg-v2'),
        }),
      ),
      executePlan: jest.fn<RevisePosterUseCase['executePlan']>(() =>
        Promise.resolve({
          visualAsset: { ...sampleAsset, id: 'asset-rev-2', versionNumber: 2 },
          isPassed: true,
          posterBuffer: Buffer.from('fake-plan-v2'),
        }),
      ),
    } as unknown as jest.Mocked<RevisePosterUseCase>;

    handler = new VisualReviewCallbackHandler(
      jobRepo,
      assetRepo,
      revisionRepo,
      approvalRepo,
      workflowRepo,
      tokens,
      {} as ApproveCreativeUseCase,
      {} as GenerateCreativeUseCase,
      mockLogger,
      undefined,
      undefined,
      mockRevisePoster,
    );
  });

  describe('Keyboard & Card Preview Renderers', () => {
    it('builds confirmation keyboard with Confirm, Change Style, and Cancel buttons', () => {
      const keyboard = buildStructuredRevisionConfirmationKeyboard({
        confirmToken: 'tok_confirm_123',
        cancelToken: 'tok_cancel_123',
        changeStyleToken: 'tok_style_123',
        confirmLabel: '✅ Confirm & Generate (1 Credit)',
      });

      expect(keyboard).toHaveLength(2);
      expect(keyboard[0]?.[0]?.text).toBe('✅ Confirm & Generate (1 Credit)');
      expect(keyboard[0]?.[0]?.callbackData).toBe('ps:tok_confirm_123');
      expect(keyboard[1]?.[0]?.text).toBe('🎨 Choose Different Style');
      expect(keyboard[1]?.[1]?.text).toBe('❌ Cancel');
    });

    it('renders structured revision preview card with preserved layer drift guarantees', () => {
      const card = VisualReviewCardRenderer.renderRevisionPlanPreview({
        plan: {
          id: 'plan-1',
          creativeJobId: 'job-rev-1234',
          baseVersionNumber: 1,
          requestedByUserId: 'user-1',
          rawInstruction: 'make it more evening and dramatic',
          executionStrategy: RevisionExecutionStrategy.AI_BACKGROUND_REGEN,
          confidence: RevisionInterpretationConfidence.AMBIGUOUS,
          confidenceScore: 0.78,
          mutations: [
            {
              target: RevisionTargetType.STYLE_PRESET,
              fieldName: 'stylePreset',
              requestedValue: 'NOCTURNE_ROYALE',
            },
          ],
          affectedLayerGroups: ['BACKGROUND', 'SURFACE_SHADOW'],
          preservedLayerDigests: {
            PRODUCT_HERO: 'sha256-authentic-bottle-xyz',
          },
          requiresConfirmation: true,
          confirmationReason: 'Inferred Nocturne Royale preset change (~4s, 1 GPU credit).',
          estimatedExecutionMs: 4000,
          createdAt: new Date(),
        },
        productName: 'Rose Velours Eau de Parfum',
        currentVersion: 1,
        nextVersion: 2,
      });

      expect(card).toContain('Proposed Revision Plan');
      expect(card).toContain('V1 ➔ V2');
      expect(card).toContain('STYLE_PRESET: "NOCTURNE_ROYALE"');
      expect(card).toContain('AI Background Generation (~4s, 1 GPU credit)');
      expect(card).toContain('Inferred Nocturne Royale');
      expect(card).toContain('Hero Cutout: Authentic Flacon (#sha256-a)');
      expect(card).toContain('Copy & Pricing: Safe & Validated');
    });
  });

  describe('handleTextMessage: Conversational Interpretation & Execution', () => {
    it('returns null when user has no active visual review awaiting revision', async () => {
      const response = await handler.handleTextMessage(actor, 'Headline: New Scent');
      expect(response).toBeNull();
    });

    it('handles /cancel by cancelling pending visual revision and resetting status', async () => {
      // Setup awaiting revision state
      await workflowRepo.setActiveWorkflowMessage(`awaiting_revision:${actor.identityId}`, {
        messageId: 0,
        chatId: actor.telegramUserId,
        messageType: 'INTERACTION_PROMPT',
        payloadMetadata: {
          creativeJobId: sampleJob.id,
          visualAssetId: sampleAsset.id,
          productName: 'Rose Velours',
        },
      });

      const response = await handler.handleTextMessage(actor, '/cancel');

      expect(response).not.toBeNull();
      expect(response?.messages[0]?.text).toContain('Visual revision cancelled');
      expect(workflowRepo.clearActiveWorkflowMessage).toHaveBeenCalledWith(
        `awaiting_revision:${actor.identityId}`,
      );
    });

    it('directly executes high-confidence zero-AI text edits (e.g. "Headline: Midnight Rose")', async () => {
      await workflowRepo.setActiveWorkflowMessage(`awaiting_revision:${actor.identityId}`, {
        messageId: 0,
        chatId: actor.telegramUserId,
        messageType: 'INTERACTION_PROMPT',
        payloadMetadata: {
          creativeJobId: sampleJob.id,
          visualAssetId: sampleAsset.id,
          productName: 'Rose Velours',
        },
      });

      const response = await handler.handleTextMessage(actor, 'Headline: Midnight Rose');

      expect(response).not.toBeNull();
      expect(mockRevisePoster.executePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          creativeJobId: sampleJob.id,
          sourceVisualAssetId: sampleAsset.id,
          actorUserId: actor.internalUserId,
          actorRoles: actor.roles,
          confirmed: true,
          plan: expect.objectContaining({
            executionStrategy: 'ZERO_AI_COMPOSITE',
            mutations: expect.arrayContaining([
              expect.objectContaining({
                target: RevisionTargetType.HEADLINE,
                requestedValue: 'Midnight Rose',
              }),
            ]),
          }),
        }),
      );
      expect(response?.messages[0]?.text).toContain('Poster Revision Applied (v2)');
      expect(response?.messages[0]?.text).toContain('Target: HEADLINE');
      expect(workflowRepo.clearActiveWorkflowMessage).toHaveBeenCalledWith(
        `awaiting_revision:${actor.identityId}`,
      );
    });

    it('directly executes high-confidence zero-AI layout commands (e.g. "Align: left")', async () => {
      await workflowRepo.setActiveWorkflowMessage(`awaiting_revision:${actor.identityId}`, {
        messageId: 0,
        chatId: actor.telegramUserId,
        messageType: 'INTERACTION_PROMPT',
        payloadMetadata: {
          creativeJobId: sampleJob.id,
          visualAssetId: sampleAsset.id,
          productName: 'Rose Velours',
        },
      });

      const response = await handler.handleTextMessage(actor, 'Align: left');

      expect(response).not.toBeNull();
      expect(mockRevisePoster.executePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          creativeJobId: sampleJob.id,
          sourceVisualAssetId: sampleAsset.id,
          confirmed: true,
          plan: expect.objectContaining({
            executionStrategy: 'ZERO_AI_COMPOSITE',
            mutations: expect.arrayContaining([
              expect.objectContaining({
                target: RevisionTargetType.PRODUCT_PLACEMENT,
                requestedValue: 'LEFT',
              }),
            ]),
          }),
        }),
      );
      expect(response?.messages[0]?.text).toContain('Poster Revision Applied (v2)');
    });

    it('presents two-phase Proposed Revision Plan card for ambiguous instructions', async () => {
      await workflowRepo.setActiveWorkflowMessage(`awaiting_revision:${actor.identityId}`, {
        messageId: 0,
        chatId: actor.telegramUserId,
        messageType: 'INTERACTION_PROMPT',
        payloadMetadata: {
          creativeJobId: sampleJob.id,
          visualAssetId: sampleAsset.id,
          productName: 'Rose Velours',
        },
      });

      const response = await handler.handleTextMessage(actor, 'make it feel more evening and dark');

      expect(response).not.toBeNull();
      expect(mockRevisePoster.changeStyle).not.toHaveBeenCalled();
      expect(response?.messages[0]?.text).toContain('Proposed Revision Plan');
      expect(response?.messages[0]?.buttons).toBeDefined();
      expect(tokens.create).toHaveBeenCalledWith(
        actor.identityId,
        expect.arrayContaining([
          expect.objectContaining({
            action: TelegramAction.CONFIRM_STRUCTURED_REVISION,
          }),
        ]),
        expect.any(Date),
      );
    });

    it('returns structured error suggestions for unrecognized input while keeping awaiting state active', async () => {
      await workflowRepo.setActiveWorkflowMessage(`awaiting_revision:${actor.identityId}`, {
        messageId: 0,
        chatId: actor.telegramUserId,
        messageType: 'INTERACTION_PROMPT',
        payloadMetadata: {
          creativeJobId: sampleJob.id,
          visualAssetId: sampleAsset.id,
          productName: 'Rose Velours',
        },
      });

      const response = await handler.handleTextMessage(actor, 'random blabber xyz 123');

      expect(response).not.toBeNull();
      expect(response?.messages[0]?.text).toContain('Could not interpret instruction');
      expect(response?.messages[0]?.text).toContain('Headline: <new headline>');
      expect(workflowRepo.clearActiveWorkflowMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleAction: Confirmation & Cancellation Callbacks', () => {
    it('executes proposed plan when operator clicks CONFIRM_STRUCTURED_REVISION', async () => {
      const token: TelegramActionTokenRecord = {
        id: 'tok-confirm',
        telegramIdentityId: actor.identityId,
        action: TelegramAction.CONFIRM_STRUCTURED_REVISION,
        resourceId: sampleJob.id,
        metadata: {
          creativeJobId: sampleJob.id,
          visualAssetId: sampleAsset.id,
          productName: 'Rose Velours',
          revisionPlan: {
            id: 'plan-confirmed',
            creativeJobId: sampleJob.id,
            baseVersionNumber: 1,
            requestedByUserId: actor.internalUserId,
            rawInstruction: 'Style: Nocturne',
            executionStrategy: RevisionExecutionStrategy.AI_BACKGROUND_REGEN,
            confidence: RevisionInterpretationConfidence.CONFIDENT,
            confidenceScore: 1.0,
            mutations: [
              {
                target: RevisionTargetType.STYLE_PRESET,
                fieldName: 'stylePreset',
                requestedValue: 'NOCTURNE_ROYALE',
              },
            ],
            affectedLayerGroups: ['BACKGROUND', 'SURFACE_SHADOW'],
            preservedLayerDigests: { PRODUCT_HERO: 'digest-1' },
            requiresConfirmation: true,
            estimatedExecutionMs: 4000,
            createdAt: new Date(),
          },
        },
        singleUse: true,
        expiresAt: new Date(Date.now() + 3600_000),
      };

      const response = await handler.handleAction(actor, token);

      expect(mockRevisePoster.executePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          creativeJobId: sampleJob.id,
          sourceVisualAssetId: sampleAsset.id,
          confirmed: true,
          plan: expect.objectContaining({
            executionStrategy: 'AI_BACKGROUND_REGEN',
            mutations: expect.arrayContaining([
              expect.objectContaining({
                target: RevisionTargetType.STYLE_PRESET,
                requestedValue: 'NOCTURNE_ROYALE',
              }),
            ]),
          }),
        }),
      );
      expect(response.messages[0]?.text).toContain('Poster Revision Applied (v2)');
      expect(revisionRepo.completeRequest).toHaveBeenCalledWith('rev-req-123', 'asset-rev-2');
    });

    it('cancels proposed plan and resets status when operator clicks CANCEL_STRUCTURED_REVISION', async () => {
      const token: TelegramActionTokenRecord = {
        id: 'tok-cancel',
        telegramIdentityId: actor.identityId,
        action: TelegramAction.CANCEL_STRUCTURED_REVISION,
        resourceId: sampleJob.id,
        metadata: {
          creativeJobId: sampleJob.id,
          visualAssetId: sampleAsset.id,
          productName: 'Rose Velours',
        },
        singleUse: true,
        expiresAt: new Date(Date.now() + 3600_000),
      };

      const response = await handler.handleAction(actor, token);

      expect(response.messages[0]?.text).toContain('Revision Cancelled');
      expect(mockRevisePoster.executePlan).not.toHaveBeenCalled();
      expect(workflowRepo.clearActiveWorkflowMessage).toHaveBeenCalledWith(
        `awaiting_revision:${actor.identityId}`,
      );
    });

    it('enforces RBAC and denies CONFIRM_STRUCTURED_REVISION if actor lacks EDIT_CREATIVE permission', async () => {
      const viewerActor: TelegramActor = {
        identityId: 'id-viewer',
        internalUserId: 'user-viewer',
        telegramUserId: '87654321',
        displayName: 'Read Only Viewer',
        roles: ['VIEWER'],
      };

      const token: TelegramActionTokenRecord = {
        id: 'tok-confirm',
        telegramIdentityId: viewerActor.identityId,
        action: TelegramAction.CONFIRM_STRUCTURED_REVISION,
        resourceId: sampleJob.id,
        metadata: {
          creativeJobId: sampleJob.id,
          visualAssetId: sampleAsset.id,
          productName: 'Rose Velours',
        },
        singleUse: true,
        expiresAt: new Date(Date.now() + 3600_000),
      };

      const response = await handler.handleAction(viewerActor, token);

      expect(response.messages[0]?.text).toContain('Access denied');
      expect(workflowRepo.appendAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TELEGRAM_VISUAL_ACTION_DENIED',
        }),
      );
    });
  });
});
