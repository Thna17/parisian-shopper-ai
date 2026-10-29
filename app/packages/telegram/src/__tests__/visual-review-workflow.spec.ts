/* eslint-disable @typescript-eslint/unbound-method */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { type ApplicationLogger, type OutboxWriter } from '@parisian-shopper/common';
import {
  type AssetStoragePort,
  type CreativeApprovalRepository,
  type CreativeJobRecord,
  type CreativeJobRepository,
  type CreativeRevisionRepository,
  type TelegramActionTokenRecord,
  type TelegramActor,
  type TelegramChannelBroadcastDispatcher,
  type TelegramDraftView,
  type TelegramWorkflowRepository,
  type VisualAssetRepository,
  TelegramAction,
  ApproveCreativeUseCase,
  RejectCreativeUseCase,
  GenerateCreativeUseCase,
  RevisePosterUseCase,
  ExportPosterUseCase,
  ExportDownloadTokenService,
  TelegramActionTokenService,
} from '@parisian-shopper/application';
import { FeatureFlag } from '@parisian-shopper/config';

import { VisualReviewCardRenderer } from '../renderers/visual-review-card.renderer.js';
import {
  buildConfirmVisualApprovalKeyboard,
  buildVisualReviewKeyboard,
} from '../keyboards/visual-review.keyboard.js';
import { VisualReviewCallbackHandler } from '../handlers/visual-review-callback.handler.js';
import { TelegramOutboxDispatcher } from '../telegram-outbox.dispatcher.js';
import { FakeTelegramGateway } from '../telegram-delivery.gateway.js';

describe('Telegram Visual Review Workflow', () => {
  const mockLogger: ApplicationLogger = {
    log: jest.fn((_message: string, _meta?: unknown) => undefined),
    error: jest.fn((_message: string, _meta?: unknown) => undefined),
    warn: jest.fn((_message: string, _meta?: unknown) => undefined),
  };

  const actor: TelegramActor = {
    identityId: 'id-actor-1',
    internalUserId: 'user-internal-1',
    telegramUserId: '123456789',
    displayName: 'Amelie Poulain',
    roles: ['admin', 'content_manager'],
  };

  const sampleJob: CreativeJobRecord = {
    id: 'job-1234-abcd',
    contentVersionId: 'version-cv-99',
    productSnapshotId: 'snap-1',
    brandRuleVersionId: 'brand-1',
    requestedByUserId: 'user-internal-1',
    status: 'READY_FOR_REVIEW',
    targetPlatform: 'INSTAGRAM',
    aspectRatio: '1:1',
    creativeProfile: 'STUDIO_MINIMAL',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('VisualReviewCardRenderer', () => {
    it('renders clean concise caption with product, template, format, version, and status', () => {
      const caption = VisualReviewCardRenderer.renderCaption({
        productName: 'CHANEL Classic Flap Bag',
        brand: 'CHANEL',
        templateId: 'EDITORIAL_SPLIT',
        version: 1,
        reviewStatus: 'Ready for Review',
        width: 1080,
        height: 1080,
        dimensionsPassed: true,
        containmentPassed: true,
        safetyPassed: true,
        casSha256: 'abc12345',
      });

      expect(caption).toContain('🎨 *Visual Creative Review*');
      expect(caption).toContain('📦 *Product:* CHANEL Classic Flap Bag • CHANEL');
      expect(caption).toContain('📐 *Template:* Editorial Split');
      expect(caption).toContain('🖼️ *Format:* Square Post · 1080×1080');
      expect(caption).toContain('🔢 *Version:* V1');
      expect(caption).toContain('📋 *Status:* Ready for Review');
    });

    it('renders technical QA details behind details view with validation badges and CAS digest', () => {
      const details = VisualReviewCardRenderer.renderDetails({
        productName: 'CHANEL Classic Flap Bag',
        brand: 'CHANEL',
        targetFormat: '1:1 Feed Post',
        compositorVersion: 'ps-compositor-v1',
        width: 1080,
        height: 1080,
        dimensionsPassed: true,
        containmentPassed: true,
        safetyPassed: true,
        casSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      });

      expect(details).toContain('ℹ️ *Visual QA & Technical Details*');
      expect(details).toContain('• Dimensions: [1080×1080 PASS]');
      expect(details).toContain('• Hero Containment: [PASS]');
      expect(details).toContain('• Safety: [PASS]');
      expect(details).toContain('🏷️ *Compositor:* [ps-compositor-v1]');
      expect(details).toContain('🔐 *Storage CAS Fingerprint:* `#e3b0c442`');
    });

    it('renders details with FAIL badges when validation checks fail', () => {
      const details = VisualReviewCardRenderer.renderDetails({
        productName: 'Dior Saddle Bag',
        brand: 'Dior',
        targetFormat: '4:5 Feed Portrait',
        compositorVersion: 'ps-compositor-v1',
        width: 1080,
        height: 1350,
        dimensionsPassed: false,
        containmentPassed: false,
        safetyPassed: false,
        casSha256: '12345678abcdef',
      });

      expect(details).toContain('• Dimensions: [1080×1350 FAIL]');
      expect(details).toContain('• Hero Containment: [FAIL]');
      expect(details).toContain('• Safety: [FAIL]');
      expect(details).toContain('`#12345678`');
    });
  });

  describe('Keyboards', () => {
    it('builds visual review inline keyboard with all 4 review actions', () => {
      const keyboard = buildVisualReviewKeyboard({
        approveToken: 'token_app',
        requestEditToken: 'token_edit',
        regenerateToken: 'token_regen',
        rejectToken: 'token_rej',
      });

      expect(keyboard).toHaveLength(2);
      expect(keyboard[0]?.[0]?.text).toBe('✅ Approve Visual');
      expect(keyboard[0]?.[0]?.callbackData).toBe('ps:token_app');
      expect(keyboard[0]?.[1]?.text).toBe('✏️ Request Edit');
      expect(keyboard[0]?.[1]?.callbackData).toBe('ps:token_edit');
      expect(keyboard[1]?.[0]?.text).toBe('🔄 Regenerate');
      expect(keyboard[1]?.[0]?.callbackData).toBe('ps:token_regen');
      expect(keyboard[1]?.[1]?.text).toBe('❌ Reject');
      expect(keyboard[1]?.[1]?.callbackData).toBe('ps:token_rej');
    });

    it('builds extended visual review inline keyboard with 7 actions when tokens provided', () => {
      const keyboard = buildVisualReviewKeyboard({
        approveToken: 'token_app',
        rejectToken: 'token_rej',
        editLayoutToken: 'token_layout',
        editTextToken: 'token_text',
        changeStyleToken: 'token_style',
        newBackgroundToken: 'token_bg',
        detailsToken: 'token_details',
      });

      expect(keyboard).toHaveLength(4);
      expect(keyboard[0]?.[0]?.text).toBe('✅ Approve Poster');
      expect(keyboard[1]?.[0]?.text).toBe('✏️ Edit Layout');
      expect(keyboard[1]?.[1]?.text).toBe('📝 Edit Text');
      expect(keyboard[2]?.[0]?.text).toBe('🎨 Change Style');
      expect(keyboard[2]?.[1]?.text).toBe('🔄 New Background');
      expect(keyboard[3]?.[0]?.text).toBe('❌ Reject');
      expect(keyboard[3]?.[1]?.text).toBe('ℹ️ Details');
    });

    it('builds two-step confirmation keyboard with Confirm and Cancel', () => {
      const keyboard = buildConfirmVisualApprovalKeyboard('token_confirm', 'token_cancel');

      expect(keyboard).toHaveLength(1);
      expect(keyboard[0]?.[0]?.text).toBe('✅ Approve Design');
      expect(keyboard[0]?.[0]?.callbackData).toBe('ps:token_confirm');
      expect(keyboard[0]?.[1]?.text).toBe('❌ Cancel');
      expect(keyboard[0]?.[1]?.callbackData).toBe('ps:token_cancel');
    });
  });

  describe('VisualReviewCallbackHandler', () => {
    let jobRepo: jest.Mocked<CreativeJobRepository>;
    let assetRepo: jest.Mocked<VisualAssetRepository>;
    let revisionRepo: jest.Mocked<CreativeRevisionRepository>;
    let approvalRepo: jest.Mocked<CreativeApprovalRepository>;
    let workflowRepo: jest.Mocked<TelegramWorkflowRepository>;
    let tokens: jest.Mocked<TelegramActionTokenService>;
    let approveCreative: jest.Mocked<ApproveCreativeUseCase>;
    let generateCreative: jest.Mocked<GenerateCreativeUseCase>;
    let handler: VisualReviewCallbackHandler;

    beforeEach(() => {
      jobRepo = {
        createJob: jest.fn<CreativeJobRepository['createJob']>(),
        findById: jest.fn<CreativeJobRepository['findById']>((_id: string) =>
          Promise.resolve(sampleJob),
        ),
        findByContentVersionId: jest.fn<CreativeJobRepository['findByContentVersionId']>(),
        transitionStatus: jest.fn<CreativeJobRepository['transitionStatus']>(
          (id: string, _exp: unknown, target: unknown) =>
            Promise.resolve({ ...sampleJob, id, status: target as CreativeJobRecord['status'] }),
        ),
      };

      const sampleAsset = {
        id: 'asset-1',
        creativeJobId: sampleJob.id,
        versionNumber: 1,
        assetRole: 'COMPOSITED_CREATIVE' as const,
        mimeType: 'image/png',
        width: 1080,
        height: 1080,
        byteSize: 1024,
        sha256: 'hash-1',
        storageKey: 'storage-1',
        sourceProductAssetDigest: 'digest-1',
        createdAt: new Date(),
      };

      assetRepo = {
        createAsset: jest.fn<VisualAssetRepository['createAsset']>(),
        findById: jest.fn<VisualAssetRepository['findById']>((id: string) =>
          Promise.resolve({
            ...sampleAsset,
            id,
          }),
        ),
        findByJobAndVersion: jest.fn<VisualAssetRepository['findByJobAndVersion']>(),
        listByJobId: jest.fn<VisualAssetRepository['listByJobId']>(),
        findLatestByJobId: jest.fn<VisualAssetRepository['findLatestByJobId']>(),
      };

      revisionRepo = {
        createRequest: jest.fn<CreativeRevisionRepository['createRequest']>((input) =>
          Promise.resolve({
            id: 'rev-req-12345678',
            creativeJobId: input.creativeJobId,
            sourceVisualAssetId: input.sourceVisualAssetId,
            requestedByUserId: input.requestedByUserId,
            type: input.type,
            status: 'PENDING',
            createdAt: new Date(),
          }),
        ),
        findById: jest.fn<CreativeRevisionRepository['findById']>(),
        findActiveByJobId: jest.fn<CreativeRevisionRepository['findActiveByJobId']>(),
        completeRequest: jest.fn<CreativeRevisionRepository['completeRequest']>(),
        cancelRequest: jest.fn<CreativeRevisionRepository['cancelRequest']>(),
      };

      approvalRepo = {
        recordApproval: jest.fn<CreativeApprovalRepository['recordApproval']>((input) =>
          Promise.resolve({
            id: 'app-evt-1',
            creativeJobId: input.creativeJobId,
            visualAssetId: input.visualAssetId,
            approverUserId: input.approverUserId,
            decision: input.decision,
            ...(input.comment !== undefined ? { comment: input.comment } : {}),
            createdAt: new Date(),
          }),
        ),
        findByJobId: jest.fn<CreativeApprovalRepository['findByJobId']>(),
        findByAssetId: jest.fn<CreativeApprovalRepository['findByAssetId']>(),
      };

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
        beginNotificationDelivery:
          jest.fn<TelegramWorkflowRepository['beginNotificationDelivery']>(),
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
          () => Promise.resolve(),
        ),
        getActiveWorkflowMessage: jest.fn<TelegramWorkflowRepository['getActiveWorkflowMessage']>(
          () => Promise.resolve(null),
        ),
        clearActiveWorkflowMessage: jest.fn<
          TelegramWorkflowRepository['clearActiveWorkflowMessage']
        >(() => Promise.resolve()),
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
        create: jest.fn<TelegramActionTokenService['create']>(() =>
          Promise.resolve(['token_conf_1', 'token_canc_1']),
        ),
      } as unknown as jest.Mocked<TelegramActionTokenService>;

      approveCreative = {
        execute: jest.fn<ApproveCreativeUseCase['execute']>(() =>
          Promise.resolve({
            approvalEvent: {
              id: 'app-evt-1',
              creativeJobId: sampleJob.id,
              visualAssetId: 'asset-1',
              approverUserId: actor.internalUserId,
              decision: 'CREATIVE_APPROVED',
              createdAt: new Date(),
            },
          }),
        ),
      } as unknown as jest.Mocked<ApproveCreativeUseCase>;

      generateCreative = {
        execute: jest.fn<GenerateCreativeUseCase['execute']>(() =>
          Promise.resolve({
            creativeJob: sampleJob,
            visualAsset: {
              id: 'asset-new',
              creativeJobId: sampleJob.id,
              versionNumber: 1,
              assetRole: 'COMPOSITED_CREATIVE',
              mimeType: 'image/png',
              width: 1080,
              height: 1080,
              byteSize: 1024,
              sha256: 'hash-new',
              storageKey: 'storage-key-new',
              sourceProductAssetDigest: 'source-digest',
              createdAt: new Date(),
            },
          }),
        ),
      } as unknown as jest.Mocked<GenerateCreativeUseCase>;

      handler = new VisualReviewCallbackHandler(
        jobRepo,
        assetRepo,
        revisionRepo,
        approvalRepo,
        workflowRepo,
        tokens,
        approveCreative,
        generateCreative,
        mockLogger,
      );
    });

    describe('ActionToken security and replay rejection', () => {
      it('rejects malformed callback data', async () => {
        const response = await handler.handleCallback({
          updateId: 'up-1',
          profile: { telegramUserId: actor.telegramUserId },
          callbackData: 'invalid_raw_token',
        });

        expect(response.callbackNotice).toBe('Invalid action.');
        expect(response.messages[0]?.text).toContain('expired');
      });

      it('rejects expired action token', async () => {
        workflowRepo.consumeActionToken.mockResolvedValueOnce({ disposition: 'EXPIRED' });

        const response = await handler.handleCallback({
          updateId: 'up-2',
          profile: { telegramUserId: actor.telegramUserId },
          callbackData: 'ps:123456789012345678901234567890',
        });

        expect(response.callbackNotice).toBe(
          'This action has expired. Please reopen the latest job.',
        );
      });

      it('rejects consumed action token (replay attack attempt)', async () => {
        workflowRepo.consumeActionToken.mockResolvedValueOnce({ disposition: 'CONSUMED' });

        const response = await handler.handleCallback({
          updateId: 'up-3',
          profile: { telegramUserId: actor.telegramUserId },
          callbackData: 'ps:123456789012345678901234567890',
        });

        expect(response.callbackNotice).toBe(
          'This action has expired. Please reopen the latest job.',
        );
        expect(approveCreative.execute).not.toHaveBeenCalled();
      });

      it('rejects token belonging to another user', async () => {
        workflowRepo.consumeActionToken.mockResolvedValueOnce({ disposition: 'WRONG_USER' });

        const response = await handler.handleCallback({
          updateId: 'up-4',
          profile: { telegramUserId: actor.telegramUserId },
          callbackData: 'ps:123456789012345678901234567890',
        });

        expect(response.callbackNotice).toBe('This action belongs to another user.');
        expect(response.messages[0]?.text).toContain('another user');
      });

      it('rejects unauthorized actor profile', async () => {
        workflowRepo.resolveActor.mockResolvedValueOnce(null);

        const response = await handler.handleCallback({
          updateId: 'up-5',
          profile: { telegramUserId: 'unknown_user_999' },
          callbackData: 'ps:123456789012345678901234567890',
        });

        expect(response.callbackNotice).toBe('Access denied.');
        expect(workflowRepo.recordDeniedAccess).toHaveBeenCalled();
      });

      it('rejects when actor exceeds rate limit', async () => {
        workflowRepo.consumeRateLimit.mockResolvedValueOnce(false);

        const response = await handler.handleCallback({
          updateId: 'up-6',
          profile: { telegramUserId: actor.telegramUserId },
          callbackData: 'ps:123456789012345678901234567890',
        });

        expect(response.callbackNotice).toBe('Rate limited.');
        expect(response.messages[0]?.text).toContain('Too many actions');
      });
    });

    describe('Two-step confirmation state machine', () => {
      it('prompts user with confirmation keyboard on first APPROVE_VISUAL click without mutating status', async () => {
        const token: TelegramActionTokenRecord = {
          id: 'tok-rec-1',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.APPROVE_VISUAL,
          resourceId: sampleJob.id,
          metadata: {
            creativeJobId: sampleJob.id,
            visualAssetId: 'asset-1',
            productName: 'CHANEL Bag',
          },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(actor, token);

        expect(response.callbackNotice).toBe('Confirmation required.');
        expect(response.messages[0]?.text).toContain('Confirm Approval for CHANEL Bag?');
        expect(response.messages[0]?.buttons).toBeDefined();
        expect(approveCreative.execute).not.toHaveBeenCalled();
        expect(jobRepo.transitionStatus).not.toHaveBeenCalled();
      });

      it('executes ApproveCreativeUseCase and appends audit on CONFIRM_APPROVE_VISUAL', async () => {
        const token: TelegramActionTokenRecord = {
          id: 'tok-rec-2',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.CONFIRM_APPROVE_VISUAL,
          resourceId: sampleJob.id,
          metadata: {
            creativeJobId: sampleJob.id,
            visualAssetId: 'asset-1',
            productName: 'CHANEL Bag',
          },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(actor, token);

        expect(response.callbackNotice).toBe('Visual approved!');
        expect(response.messages[0]?.text).toContain('Visual Approved!');
        expect(approveCreative.execute).toHaveBeenCalledWith({
          creativeJobId: sampleJob.id,
          visualAssetId: 'asset-1',
          approvedBy: actor.internalUserId,
          approverRoles: actor.roles,
        });
        expect(workflowRepo.appendAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'TELEGRAM_VISUAL_APPROVED',
            resourceType: 'CreativeJob',
            resourceId: sampleJob.id,
          }),
        );
      });

      it('returns cancellation notice on CANCEL_VISUAL_ACTION without calling approve use case', async () => {
        const token: TelegramActionTokenRecord = {
          id: 'tok-rec-3',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.CANCEL_VISUAL_ACTION,
          resourceId: sampleJob.id,
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(actor, token);

        expect(response.callbackNotice).toBe('Cancelled.');
        expect(response.messages[0]?.text).toContain('Action cancelled');
        expect(approveCreative.execute).not.toHaveBeenCalled();
      });
    });

    describe('Stale-state protection', () => {
      it('returns already approved notice if job is already CREATIVE_APPROVED', async () => {
        jobRepo.findById.mockResolvedValueOnce({
          ...sampleJob,
          status: 'CREATIVE_APPROVED',
        });

        const token: TelegramActionTokenRecord = {
          id: 'tok-rec-4',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.APPROVE_VISUAL,
          resourceId: sampleJob.id,
          metadata: { creativeJobId: sampleJob.id },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(actor, token);

        expect(response.callbackNotice).toBe('Already approved.');
        expect(response.messages[0]?.text).toContain('already been approved');
        expect(approveCreative.execute).not.toHaveBeenCalled();
      });

      it('returns already rejected notice if job is already CREATIVE_REJECTED', async () => {
        jobRepo.findById.mockResolvedValueOnce({
          ...sampleJob,
          status: 'CREATIVE_REJECTED',
        });

        const token: TelegramActionTokenRecord = {
          id: 'tok-rec-5',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.APPROVE_VISUAL,
          resourceId: sampleJob.id,
          metadata: { creativeJobId: sampleJob.id },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(actor, token);

        expect(response.callbackNotice).toBe('Already rejected.');
        expect(response.messages[0]?.text).toContain('already been rejected');
        expect(approveCreative.execute).not.toHaveBeenCalled();
      });

      it('returns not ready notice if job is in non-reviewable status', async () => {
        jobRepo.findById.mockResolvedValueOnce({
          ...sampleJob,
          status: 'COMPOSITING',
        });

        const token: TelegramActionTokenRecord = {
          id: 'tok-rec-6',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.APPROVE_VISUAL,
          resourceId: sampleJob.id,
          metadata: { creativeJobId: sampleJob.id },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(actor, token);

        expect(response.callbackNotice).toBe('Not ready.');
        expect(response.messages[0]?.text).toContain('not ready for review (status: COMPOSITING)');
        expect(approveCreative.execute).not.toHaveBeenCalled();
      });

      it('prevents stale confirmation on CONFIRM_APPROVE_VISUAL if status changed concurrently', async () => {
        jobRepo.findById.mockResolvedValueOnce({
          ...sampleJob,
          status: 'CREATIVE_APPROVED',
        });

        const token: TelegramActionTokenRecord = {
          id: 'tok-rec-7',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.CONFIRM_APPROVE_VISUAL,
          resourceId: sampleJob.id,
          metadata: { creativeJobId: sampleJob.id },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(actor, token);

        expect(response.callbackNotice).toBe('Already processed.');
        expect(approveCreative.execute).not.toHaveBeenCalled();
      });
    });

    describe('Interactive Revision & Regeneration actions', () => {
      it('creates revision request entity on REQUEST_VISUAL_EDIT', async () => {
        const token: TelegramActionTokenRecord = {
          id: 'tok-rec-8',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.REQUEST_VISUAL_EDIT,
          resourceId: sampleJob.id,
          metadata: {
            creativeJobId: sampleJob.id,
            visualAssetId: 'asset-1',
            productName: 'CHANEL Bag',
            instruction: 'Make the lighting warmer',
          },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(actor, token);

        expect(response.callbackNotice).toBe('Awaiting edit instructions...');
        expect(response.messages[0]?.text).toContain('Visual Revision Requested');
        expect(revisionRepo.createRequest).toHaveBeenCalledWith({
          creativeJobId: sampleJob.id,
          sourceVisualAssetId: 'asset-1',
          requestedByUserId: actor.internalUserId,
          type: 'EDIT_BACKGROUND',
          instruction: 'Make the lighting warmer',
        });
        expect(jobRepo.transitionStatus).toHaveBeenCalledWith(
          sampleJob.id,
          'READY_FOR_REVIEW',
          'REVISION_REQUESTED',
        );
        expect(workflowRepo.appendAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'TELEGRAM_VISUAL_EDIT_REQUESTED',
          }),
        );
      });

      it('creates revision request and dispatches GenerateCreativeUseCase on REGENERATE_VISUAL', async () => {
        const token: TelegramActionTokenRecord = {
          id: 'tok-rec-9',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.REGENERATE_VISUAL,
          resourceId: sampleJob.id,
          metadata: {
            creativeJobId: sampleJob.id,
            visualAssetId: 'asset-1',
            productName: 'CHANEL Bag',
          },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(actor, token);

        expect(response.callbackNotice).toBe('Regeneration started.');
        expect(response.messages[0]?.text).toContain('Regenerating Visual');
        expect(revisionRepo.createRequest).toHaveBeenCalledWith({
          creativeJobId: sampleJob.id,
          sourceVisualAssetId: 'asset-1',
          requestedByUserId: actor.internalUserId,
          type: 'REGENERATE_BACKGROUND',
        });
        expect(jobRepo.transitionStatus).toHaveBeenCalledWith(
          sampleJob.id,
          'READY_FOR_REVIEW',
          'REVISION_REQUESTED',
        );
        expect(generateCreative.execute).toHaveBeenCalledWith({
          contentVersionId: sampleJob.contentVersionId,
          requestedBy: actor.internalUserId,
          format: 'FEED_SQUARE',
          stylePreset: sampleJob.creativeProfile,
        });
        expect(workflowRepo.appendAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'TELEGRAM_VISUAL_REGENERATE_REQUESTED',
          }),
        );
      });

      it('records rejection and marks CREATIVE_REJECTED on REJECT_VISUAL', async () => {
        const token: TelegramActionTokenRecord = {
          id: 'tok-rec-10',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.REJECT_VISUAL,
          resourceId: sampleJob.id,
          metadata: {
            creativeJobId: sampleJob.id,
            visualAssetId: 'asset-1',
            productName: 'CHANEL Bag',
          },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(actor, token);

        expect(response.callbackNotice).toBe('Visual rejected.');
        expect(response.messages[0]?.text).toContain('Visual Rejected');
        expect(approvalRepo.recordApproval).toHaveBeenCalledWith({
          creativeJobId: sampleJob.id,
          visualAssetId: 'asset-1',
          approverUserId: actor.internalUserId,
          decision: 'CREATIVE_REJECTED',
          comment: 'Rejected via Telegram visual review',
        });
        expect(jobRepo.transitionStatus).toHaveBeenCalledWith(
          sampleJob.id,
          'READY_FOR_REVIEW',
          'CREATIVE_REJECTED',
        );
        expect(workflowRepo.appendAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'TELEGRAM_VISUAL_REJECTED',
          }),
        );
      });
    });

    describe('W02 Authorization & Integrity & Publishing Guards', () => {
      const viewerActor: TelegramActor = {
        identityId: 'id-actor-viewer',
        internalUserId: 'user-viewer-1',
        telegramUserId: '987654321',
        displayName: 'Just A Viewer',
        roles: ['VIEWER'],
      };

      it('denies visual approval for viewer and appends audit', async () => {
        const token: TelegramActionTokenRecord = {
          id: 'tok-perm-1',
          telegramIdentityId: viewerActor.identityId,
          action: TelegramAction.CONFIRM_APPROVE_VISUAL,
          resourceId: sampleJob.id,
          metadata: {
            creativeJobId: sampleJob.id,
            visualAssetId: 'asset-1',
          },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(viewerActor, token);

        expect(response.callbackNotice).toBe('Access denied.');
        expect(response.messages[0]?.text).toContain('Access denied');
        expect(approveCreative.execute).not.toHaveBeenCalled();
        expect(workflowRepo.appendAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'TELEGRAM_VISUAL_ACTION_DENIED',
            resourceType: 'CreativeJob',
            resourceId: sampleJob.id,
            metadata: expect.objectContaining({
              attemptedAction: TelegramAction.CONFIRM_APPROVE_VISUAL,
              reason: 'INSUFFICIENT_PERMISSIONS',
              requiredPermission: 'APPROVE_CREATIVE',
            }),
          }),
        );
      });

      it('denies visual rejection for viewer and appends audit', async () => {
        const token: TelegramActionTokenRecord = {
          id: 'tok-perm-2',
          telegramIdentityId: viewerActor.identityId,
          action: TelegramAction.REJECT_VISUAL,
          resourceId: sampleJob.id,
          metadata: {
            creativeJobId: sampleJob.id,
            visualAssetId: 'asset-1',
          },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(viewerActor, token);

        expect(response.callbackNotice).toBe('Access denied.');
        expect(response.messages[0]?.text).toContain('Access denied');
        expect(approvalRepo.recordApproval).not.toHaveBeenCalled();
        expect(jobRepo.transitionStatus).not.toHaveBeenCalled();
        expect(workflowRepo.appendAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'TELEGRAM_VISUAL_ACTION_DENIED',
            resourceType: 'CreativeJob',
            resourceId: sampleJob.id,
            metadata: expect.objectContaining({
              attemptedAction: TelegramAction.REJECT_VISUAL,
              reason: 'INSUFFICIENT_PERMISSIONS',
              requiredPermission: 'REJECT_CREATIVE',
            }),
          }),
        );
      });

      it('denies visual editing for viewer and appends audit', async () => {
        const token: TelegramActionTokenRecord = {
          id: 'tok-perm-3',
          telegramIdentityId: viewerActor.identityId,
          action: TelegramAction.REQUEST_VISUAL_EDIT,
          resourceId: sampleJob.id,
          metadata: {
            creativeJobId: sampleJob.id,
            visualAssetId: 'asset-1',
          },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(viewerActor, token);

        expect(response.callbackNotice).toBe('Access denied.');
        expect(response.messages[0]?.text).toContain('Access denied');
        expect(revisionRepo.createRequest).not.toHaveBeenCalled();
      });

      it('denies action when token creativeJobId does not match token resourceId', async () => {
        const token: TelegramActionTokenRecord = {
          id: 'tok-integ-1',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.APPROVE_VISUAL,
          resourceId: sampleJob.id,
          metadata: {
            creativeJobId: 'job-mismatched-999',
            visualAssetId: 'asset-1',
          },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(actor, token);

        expect(response.callbackNotice).toBe('Invalid action.');
        expect(response.messages[0]?.text).toContain('resource identifier mismatch');
        expect(workflowRepo.appendAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'TELEGRAM_VISUAL_ACTION_DENIED',
            resourceType: 'CreativeJob',
            resourceId: sampleJob.id,
            metadata: expect.objectContaining({
              attemptedAction: TelegramAction.APPROVE_VISUAL,
              reason: 'RESOURCE_INTEGRITY_MISMATCH',
              details: 'creativeJobId does not match token resourceId',
            }),
          }),
        );
      });

      it('denies action when visual asset does not belong to creativeJobId', async () => {
        assetRepo.findById.mockResolvedValueOnce({
          id: 'asset-alien',
          creativeJobId: 'job-alien-888',
          versionNumber: 1,
          assetRole: 'COMPOSITED_CREATIVE',
          mimeType: 'image/png',
          width: 1080,
          height: 1080,
          byteSize: 1024,
          sha256: 'hash-alien',
          storageKey: 'storage-alien',
          sourceProductAssetDigest: 'digest-alien',
          createdAt: new Date(),
        });

        const token: TelegramActionTokenRecord = {
          id: 'tok-integ-2',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.APPROVE_VISUAL,
          resourceId: sampleJob.id,
          metadata: {
            creativeJobId: sampleJob.id,
            visualAssetId: 'asset-alien',
          },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(actor, token);

        expect(response.callbackNotice).toBe('Invalid action.');
        expect(response.messages[0]?.text).toContain('asset does not belong to this creative job');
        expect(workflowRepo.appendAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'TELEGRAM_VISUAL_ACTION_DENIED',
            resourceType: 'CreativeJob',
            resourceId: sampleJob.id,
            metadata: expect.objectContaining({
              attemptedAction: TelegramAction.APPROVE_VISUAL,
              reason: 'RESOURCE_INTEGRITY_MISMATCH',
              details: 'visualAssetId does not belong to creativeJobId',
            }),
          }),
        );
      });

      it('fails closed on PROMPT_PUBLISH_CHANNEL and appends audit', async () => {
        const token: TelegramActionTokenRecord = {
          id: 'tok-pub-1',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.PROMPT_PUBLISH_CHANNEL,
          resourceId: sampleJob.id,
          metadata: {
            creativeJobId: sampleJob.id,
            visualAssetId: 'asset-1',
          },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(actor, token);

        expect(response.callbackNotice).toBe('Publishing disabled.');
        expect(response.messages[0]?.text).toContain('Publishing to Telegram channel is disabled');
        expect(workflowRepo.appendAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'TELEGRAM_VISUAL_ACTION_DENIED',
            resourceType: 'CreativeJob',
            resourceId: sampleJob.id,
            metadata: expect.objectContaining({
              attemptedAction: TelegramAction.PROMPT_PUBLISH_CHANNEL,
              reason: 'CONTROLLED_PUBLISHING_DISABLED',
            }),
          }),
        );
      });

      it('fails closed on CONFIRM_PUBLISH_CHANNEL and appends audit', async () => {
        const token: TelegramActionTokenRecord = {
          id: 'tok-pub-2',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.CONFIRM_PUBLISH_CHANNEL,
          resourceId: sampleJob.id,
          metadata: {
            creativeJobId: sampleJob.id,
            visualAssetId: 'asset-1',
          },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(actor, token);

        expect(response.callbackNotice).toBe('Publishing disabled.');
        expect(response.messages[0]?.text).toContain('Publishing to Telegram channel is disabled');
        expect(workflowRepo.appendAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'TELEGRAM_VISUAL_ACTION_DENIED',
            resourceType: 'CreativeJob',
            resourceId: sampleJob.id,
            metadata: expect.objectContaining({
              attemptedAction: TelegramAction.CONFIRM_PUBLISH_CHANNEL,
              reason: 'CONTROLLED_PUBLISHING_DISABLED',
            }),
          }),
        );
      });

      it('does not include channel publishing tokens or buttons when visual is approved', async () => {
        const token: TelegramActionTokenRecord = {
          id: 'tok-app-nopub',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.CONFIRM_APPROVE_VISUAL,
          resourceId: sampleJob.id,
          metadata: {
            creativeJobId: sampleJob.id,
            visualAssetId: 'asset-1',
            productName: 'CHANEL Bag',
          },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(actor, token);

        expect(response.callbackNotice).toBe('Visual approved!');
        expect(tokens.create).not.toHaveBeenCalledWith(
          expect.anything(),
          expect.arrayContaining([
            expect.objectContaining({
              action: TelegramAction.PROMPT_PUBLISH_CHANNEL,
            }),
          ]),
          expect.anything(),
        );
        const buttons = response.messages[0]?.buttons;
        const flattenedButtons = buttons?.flat() ?? [];
        for (const button of flattenedButtons) {
          expect(button.text.toLowerCase()).not.toContain('publish');
        }
      });

      describe('Token ownership verification and zero side-effects', () => {
        let mockRejectCreative: jest.Mocked<RejectCreativeUseCase>;
        let mockRevisePoster: jest.Mocked<RevisePosterUseCase>;
        let mockExportPoster: jest.Mocked<ExportPosterUseCase>;
        let mockBroadcaster: jest.Mocked<TelegramChannelBroadcastDispatcher>;
        let mockStorage: jest.Mocked<AssetStoragePort>;
        let mockOutbox: jest.Mocked<OutboxWriter>;
        let guardedHandler: VisualReviewCallbackHandler;

        beforeEach(() => {
          mockRejectCreative = {
            execute: jest.fn(),
          } as unknown as jest.Mocked<RejectCreativeUseCase>;

          mockRevisePoster = {
            editText: jest.fn(),
            editLayout: jest.fn(),
            changeStyle: jest.fn(),
            newBackground: jest.fn(),
          } as unknown as jest.Mocked<RevisePosterUseCase>;

          mockExportPoster = {
            execute: jest.fn(),
          } as unknown as jest.Mocked<ExportPosterUseCase>;

          mockBroadcaster = {
            dispatchBroadcast: jest.fn(),
            publishManual: jest.fn(),
          } as unknown as jest.Mocked<TelegramChannelBroadcastDispatcher>;

          mockStorage = {
            saveAssetBuffer: jest.fn(),
            getAssetBuffer: jest.fn(),
            deleteAsset: jest.fn(),
            assetExists: jest.fn(),
          } as unknown as jest.Mocked<AssetStoragePort>;

          mockOutbox = {
            append: jest.fn(),
          } as unknown as jest.Mocked<OutboxWriter>;

          guardedHandler = new VisualReviewCallbackHandler(
            jobRepo,
            assetRepo,
            revisionRepo,
            approvalRepo,
            workflowRepo,
            tokens,
            approveCreative,
            generateCreative,
            mockLogger,
            mockOutbox,
            mockStorage,
            mockRevisePoster,
            mockExportPoster,
            mockBroadcaster,
            undefined,
            mockRejectCreative,
          );
        });

        it('rejects normal visual review action on token owner mismatch with zero business or external side effects', async () => {
          const token: TelegramActionTokenRecord = {
            id: 'tok-diff-user-normal',
            telegramIdentityId: 'different-identity-id-999',
            action: TelegramAction.CONFIRM_APPROVE_VISUAL,
            resourceId: sampleJob.id,
            metadata: {
              creativeJobId: sampleJob.id,
              visualAssetId: 'asset-1',
            },
            singleUse: true,
            expiresAt: new Date(Date.now() + 60_000),
          };

          const response = await guardedHandler.handleAction(actor, token);

          expect(response.callbackNotice).toBe('This action belongs to another user.');
          expect(response.messages[0]?.text).toBe('This action belongs to another user.');
          expect(workflowRepo.appendAudit).toHaveBeenCalledWith(
            expect.objectContaining({
              actor,
              action: 'TELEGRAM_VISUAL_ACTION_DENIED',
              resourceType: 'CreativeJob',
              resourceId: sampleJob.id,
              metadata: expect.objectContaining({
                attemptedAction: TelegramAction.CONFIRM_APPROVE_VISUAL,
                reason: 'TOKEN_OWNER_MISMATCH',
                details: 'token does not belong to actor',
              }),
            }),
          );

          // Prove zero downstream business or external side effects
          expect(jobRepo.findById).not.toHaveBeenCalled();
          expect(jobRepo.transitionStatus).not.toHaveBeenCalled();
          expect(assetRepo.findById).not.toHaveBeenCalled();
          expect(tokens.create).not.toHaveBeenCalled();
          expect(approvalRepo.recordApproval).not.toHaveBeenCalled();
          expect(approveCreative.execute).not.toHaveBeenCalled();
          expect(mockRejectCreative.execute).not.toHaveBeenCalled();
          expect(generateCreative.execute).not.toHaveBeenCalled();
          expect(mockRevisePoster.editText).not.toHaveBeenCalled();
          expect(mockRevisePoster.editLayout).not.toHaveBeenCalled();
          expect(mockRevisePoster.changeStyle).not.toHaveBeenCalled();
          expect(mockRevisePoster.newBackground).not.toHaveBeenCalled();
          expect(mockExportPoster.execute).not.toHaveBeenCalled();
          expect(mockBroadcaster.dispatchBroadcast).not.toHaveBeenCalled();
          expect(mockBroadcaster.publishManual).not.toHaveBeenCalled();
          expect(mockOutbox.append).not.toHaveBeenCalled();
          expect(revisionRepo.createRequest).not.toHaveBeenCalled();
        });

        it('rejects legacy publish callback on token owner mismatch with zero business or external side effects before publish check', async () => {
          const token: TelegramActionTokenRecord = {
            id: 'tok-diff-user-pub',
            telegramIdentityId: 'different-identity-id-999',
            action: TelegramAction.CONFIRM_PUBLISH_CHANNEL,
            resourceId: sampleJob.id,
            metadata: {
              creativeJobId: sampleJob.id,
              visualAssetId: 'asset-1',
            },
            singleUse: true,
            expiresAt: new Date(Date.now() + 60_000),
          };

          const response = await guardedHandler.handleAction(actor, token);

          expect(response.callbackNotice).toBe('This action belongs to another user.');
          expect(response.messages[0]?.text).toBe('This action belongs to another user.');
          expect(workflowRepo.appendAudit).toHaveBeenCalledWith(
            expect.objectContaining({
              actor,
              action: 'TELEGRAM_VISUAL_ACTION_DENIED',
              resourceType: 'CreativeJob',
              resourceId: sampleJob.id,
              metadata: expect.objectContaining({
                attemptedAction: TelegramAction.CONFIRM_PUBLISH_CHANNEL,
                reason: 'TOKEN_OWNER_MISMATCH',
                details: 'token does not belong to actor',
              }),
            }),
          );

          // Prove zero downstream business or external side effects
          expect(jobRepo.findById).not.toHaveBeenCalled();
          expect(jobRepo.transitionStatus).not.toHaveBeenCalled();
          expect(assetRepo.findById).not.toHaveBeenCalled();
          expect(tokens.create).not.toHaveBeenCalled();
          expect(approvalRepo.recordApproval).not.toHaveBeenCalled();
          expect(approveCreative.execute).not.toHaveBeenCalled();
          expect(mockRejectCreative.execute).not.toHaveBeenCalled();
          expect(generateCreative.execute).not.toHaveBeenCalled();
          expect(mockRevisePoster.editText).not.toHaveBeenCalled();
          expect(mockRevisePoster.editLayout).not.toHaveBeenCalled();
          expect(mockRevisePoster.changeStyle).not.toHaveBeenCalled();
          expect(mockRevisePoster.newBackground).not.toHaveBeenCalled();
          expect(mockExportPoster.execute).not.toHaveBeenCalled();
          expect(mockBroadcaster.dispatchBroadcast).not.toHaveBeenCalled();
          expect(mockBroadcaster.publishManual).not.toHaveBeenCalled();
          expect(mockOutbox.append).not.toHaveBeenCalled();
          expect(revisionRepo.createRequest).not.toHaveBeenCalled();
        });
      });
    });

    describe('W30-D Edit-First Delivery & Classification', () => {
      it('enriches APPROVE_VISUAL response with EDIT_TEXT action, resourceKey, and VISUAL_REVIEW_CARD messageType', async () => {
        const token: TelegramActionTokenRecord = {
          id: 'tok-approve-w30d',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.APPROVE_VISUAL,
          resourceId: sampleJob.id,
          metadata: {
            creativeJobId: sampleJob.id,
            visualAssetId: 'asset-1',
            productName: 'CHANEL Bag',
          },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(actor, token);

        expect(response.resourceKey).toBe(sampleJob.id);
        expect(response.messageType).toBe('VISUAL_REVIEW_CARD');
        expect(response.messages[0]?.action).toBe('EDIT_TEXT');
        expect(response.messages[0]?.resourceKey).toBe(sampleJob.id);
        expect(response.messages[0]?.messageType).toBe('VISUAL_REVIEW_CARD');
      });

      it('enriches EDIT_VISUAL_LAYOUT layout options prompt with EDIT_TEXT and VISUAL_REVIEW_CARD', async () => {
        const token: TelegramActionTokenRecord = {
          id: 'tok-layout-w30d',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.EDIT_VISUAL_LAYOUT,
          resourceId: sampleJob.id,
          metadata: {
            creativeJobId: sampleJob.id,
            visualAssetId: 'asset-1',
            productName: 'CHANEL Bag',
          },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(actor, token);

        expect(response.resourceKey).toBe(sampleJob.id);
        expect(response.messageType).toBe('VISUAL_REVIEW_CARD');
        expect(response.messages[0]?.action).toBe('EDIT_TEXT');
        expect(response.messages[0]?.buttons).toBeDefined();
      });

      it('classifies REQUEST_VISUAL_EDIT prompt as INTERACTION_PROMPT', async () => {
        const token: TelegramActionTokenRecord = {
          id: 'tok-request-edit-w30d',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.REQUEST_VISUAL_EDIT,
          resourceId: sampleJob.id,
          metadata: {
            creativeJobId: sampleJob.id,
            visualAssetId: 'asset-1',
            productName: 'CHANEL Bag',
          },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await handler.handleAction(actor, token);

        expect(response.resourceKey).toBe(sampleJob.id);
        expect(response.messageType).toBe('INTERACTION_PROMPT');
        expect(response.messages[0]?.messageType).toBe('INTERACTION_PROMPT');
      });

      it('W32-D: executes ExportPosterUseCase and returns documentBuffer and direct download token link', async () => {
        const mockExportUseCase: jest.Mocked<ExportPosterUseCase> = {
          execute: jest.fn(() =>
            Promise.resolve({
              exportId: 'export-w32d-123',
              storageKey: 'cas/creative/sample.png',
              validationStatus: 'PASSED' as const,
              filename: 'chanel-no-5-story.png',
              buffer: Buffer.from('mock-export-bytes'),
              mimeType: 'image/png',
              width: 1080,
              height: 1920,
              byteSize: 10240,
              sha256: 'abc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            }),
          ),
        } as unknown as jest.Mocked<ExportPosterUseCase>;

        const tokenService = new ExportDownloadTokenService({
          secret: 'test-secret-1234567890123456',
          ttlSeconds: 3600,
        });

        const exportHandler = new VisualReviewCallbackHandler(
          jobRepo,
          assetRepo,
          revisionRepo,
          approvalRepo,
          workflowRepo,
          tokens,
          approveCreative,
          generateCreative,
          mockLogger,
          undefined,
          undefined,
          undefined,
          mockExportUseCase,
          undefined,
          undefined,
          undefined,
          undefined,
          tokenService,
        );

        const token: TelegramActionTokenRecord = {
          id: 'tok-export-story-png',
          telegramIdentityId: actor.identityId,
          action: TelegramAction.SELECT_EXPORT_FORMAT,
          resourceId: sampleJob.id,
          metadata: {
            creativeJobId: sampleJob.id,
            visualAssetId: 'asset-1',
            format: 'STORY_1080_1920',
            encoding: 'PNG',
          },
          singleUse: false,
          expiresAt: new Date(Date.now() + 60_000),
        };

        const response = await exportHandler.handleAction(actor, token);

        expect(mockExportUseCase.execute).toHaveBeenCalledWith({
          creativeJobId: sampleJob.id,
          visualAssetId: 'asset-1',
          format: 'STORY_1080_1920',
          encoding: 'PNG',
          actorUserId: actor.internalUserId,
          actorRoles: actor.roles,
        });

        expect(response.messages).toHaveLength(1);
        const msg = response.messages[0]!;
        expect(msg.documentBuffer).toEqual(Buffer.from('mock-export-bytes'));
        expect(msg.documentFilename).toBe('chanel-no-5-story.png');
        expect(msg.photoBuffer).toEqual(Buffer.from('mock-export-bytes'));
        expect(msg.text).toContain('Export Generated: chanel-no-5-story.png');
        expect(msg.text).toContain('1080×1920');
        expect(msg.text).toContain('/v1/creatives/exports/export-w32d-123/download?token=');
      });
    });
  });

  describe('TelegramOutboxDispatcher Edit-First Integration (W30-F)', () => {
    let fakeGateway: FakeTelegramGateway;
    let dispatcher: TelegramOutboxDispatcher;
    let mockTokens: TelegramActionTokenService;
    let workflowRepo: jest.Mocked<TelegramWorkflowRepository>;
    let jobRepo: jest.Mocked<CreativeJobRepository>;
    let assetRepo: jest.Mocked<VisualAssetRepository>;
    let assetStorage: jest.Mocked<AssetStoragePort>;

    const sampleDraftView: TelegramDraftView = {
      jobId: 'content-job-1',
      sku: 'CHANEL-BAG-001',
      productName: 'CHANEL Classic Flap Bag',
      contentType: 'PRODUCT_SPOTLIGHT',
      language: 'BILINGUAL',
      platform: 'INSTAGRAM',
      jobStatus: 'READY_FOR_REVIEW',
      createdAt: new Date(),
      requesterTelegramUserId: actor.telegramUserId,
      telegramIdentityId: actor.identityId,
      output: {
        headline: 'Classic Elegance',
        khmerCaption: 'ភាពឆើតឆាយ',
        englishCaption: 'Timeless luxury.',
        cta: 'Contact your concierge.',
        hashtags: ['#Chanel'],
      },
      validation: {
        id: 'val-1',
        contentVersionId: sampleJob.contentVersionId,
        status: 'PASSED',
        validatorVersion: 'v1',
        findingCount: 0,
        blockingCount: 0,
        warningCount: 0,
        infoCount: 0,
        findings: [],
        createdAt: new Date(),
      },
    };

    const sampleAsset = {
      id: 'asset-1',
      creativeJobId: sampleJob.id,
      versionNumber: 1,
      assetRole: 'COMPOSITED_CREATIVE' as const,
      mimeType: 'image/png',
      width: 1080,
      height: 1080,
      byteSize: 2048,
      sha256: 'sha-test-1234',
      storageKey: 'cas/asset-1.png',
      sourceProductAssetDigest: 'digest-1',
      createdAt: new Date(),
    };

    beforeEach(() => {
      fakeGateway = new FakeTelegramGateway();
      workflowRepo = {
        claimOutboxEvents: jest.fn(() => Promise.resolve([])),
        markOutboxProcessed: jest.fn(() => Promise.resolve()),
        markNotificationFailed: jest.fn(() => Promise.resolve()),
        markNotificationSent: jest.fn(() => Promise.resolve()),
        beginNotificationDelivery: jest.fn(() => Promise.resolve('PROCEED')),
        getDraftViewByVersionId: jest.fn(() => Promise.resolve(null)),
        getFailureViewByJobId: jest.fn(() => Promise.resolve(null)),
        getActiveWorkflowMessage: jest.fn(() => Promise.resolve(null)),
        setActiveWorkflowMessage: jest.fn(() => Promise.resolve()),
        storeActionTokens: jest.fn(() => Promise.resolve()),
      } as unknown as jest.Mocked<TelegramWorkflowRepository>;

      jobRepo = {
        findById: jest.fn(() => Promise.resolve(null)),
      } as unknown as jest.Mocked<CreativeJobRepository>;

      assetRepo = {
        findById: jest.fn(() => Promise.resolve(null)),
      } as unknown as jest.Mocked<VisualAssetRepository>;

      assetStorage = {
        getAssetBuffer: jest.fn(() => Promise.resolve(null)),
      } as unknown as jest.Mocked<AssetStoragePort>;

      mockTokens = new TelegramActionTokenService(workflowRepo);
      dispatcher = new TelegramOutboxDispatcher(
        workflowRepo,
        fakeGateway,
        mockTokens,
        { telegram: { mode: 'polling', actionTokenTtlSeconds: 900 }, demoMode: false },
        { isEnabled: (flag: string): boolean => flag === FeatureFlag.TELEGRAM },
        mockLogger,
        jobRepo,
        assetRepo,
        undefined,
        assetStorage,
      );
    });

    it('dispatches CREATIVE_VALIDATED using edit-first delivery when active workflow message exists', async () => {
      workflowRepo.getDraftViewByVersionId.mockResolvedValueOnce(sampleDraftView);
      jobRepo.findById.mockResolvedValueOnce(sampleJob);
      assetRepo.findById.mockResolvedValueOnce(sampleAsset);
      assetStorage.getAssetBuffer.mockResolvedValueOnce(Buffer.from('fake-png-data'));
      workflowRepo.getActiveWorkflowMessage.mockResolvedValueOnce({
        chatId: actor.telegramUserId,
        messageId: 3042,
        messageType: 'VISUAL_REVIEW_CARD',
        payloadMetadata: {},
      });

      const event = {
        id: 'event-cv-1',
        topic: 'CREATIVE_VALIDATED',
        schemaVersion: 1,
        idempotencyKey: 'key-1',
        aggregateType: 'CreativeJob',
        aggregateId: sampleJob.id,
        payload: {
          creativeJobId: sampleJob.id,
          visualAssetId: 'asset-1',
        },
        attemptCount: 1,
        occurredAt: new Date(),
        availableAt: new Date(),
      };

      await dispatcher.dispatchVisualReview(event);

      expect(fakeGateway.editedMedia).toHaveLength(1);
      expect(fakeGateway.editedMedia[0]?.messageId).toBe(3042);
      expect(fakeGateway.editedMedia[0]?.chatId).toBe(actor.telegramUserId);
      expect(workflowRepo.setActiveWorkflowMessage).toHaveBeenCalledWith(
        sampleJob.id,
        expect.objectContaining({
          messageId: 3042,
          messageType: 'VISUAL_REVIEW_CARD',
        }),
      );
      expect(workflowRepo.markNotificationSent).toHaveBeenCalledWith(
        'event-cv-1',
        expect.any(Date),
      );
    });

    it('falls back to sendPhoto when no active message exists and persists new message ID', async () => {
      workflowRepo.getDraftViewByVersionId.mockResolvedValueOnce(sampleDraftView);
      jobRepo.findById.mockResolvedValueOnce(sampleJob);
      assetRepo.findById.mockResolvedValueOnce(sampleAsset);
      assetStorage.getAssetBuffer.mockResolvedValueOnce(Buffer.from('fake-png-data'));
      workflowRepo.getActiveWorkflowMessage.mockResolvedValueOnce(null);

      const event = {
        id: 'event-cv-2',
        topic: 'CREATIVE_VALIDATED',
        schemaVersion: 1,
        idempotencyKey: 'key-2',
        aggregateType: 'CreativeJob',
        aggregateId: sampleJob.id,
        payload: {
          creativeJobId: sampleJob.id,
          visualAssetId: 'asset-1',
        },
        attemptCount: 1,
        occurredAt: new Date(),
        availableAt: new Date(),
      };

      await dispatcher.dispatchVisualReview(event);

      expect(fakeGateway.sentPhotos).toHaveLength(1);
      expect(fakeGateway.sentPhotos[0]?.chatId).toBe(actor.telegramUserId);
      expect(workflowRepo.setActiveWorkflowMessage).toHaveBeenCalledWith(
        sampleJob.id,
        expect.objectContaining({
          messageId: expect.any(Number),
          chatId: actor.telegramUserId,
          messageType: 'VISUAL_REVIEW_CARD',
        }),
      );
    });

    it('dispatches CREATIVE_VALIDATION_FAILED with remediation advice and persists active message', async () => {
      workflowRepo.getDraftViewByVersionId.mockResolvedValueOnce(sampleDraftView);
      jobRepo.findById.mockResolvedValueOnce(sampleJob);
      workflowRepo.getActiveWorkflowMessage.mockResolvedValueOnce(null);
      workflowRepo.claimOutboxEvents.mockResolvedValueOnce([
        {
          id: 'event-fail-1',
          topic: 'CREATIVE_VALIDATION_FAILED',
          payload: {
            creativeJobId: sampleJob.id,
            blockingCount: 1,
            remediationActions: ['Reduce product scale by 10% to prevent border crop'],
          },
          attemptCount: 1,
        },
      ]);

      await dispatcher.dispatchOnce();

      expect(fakeGateway.sentMessages).toHaveLength(1);
      expect(fakeGateway.sentMessages[0]?.text).toContain('Visual Creative Validation Failed');
      expect(fakeGateway.sentMessages[0]?.text).toContain('Reduce product scale by 10%');
      expect(workflowRepo.setActiveWorkflowMessage).toHaveBeenCalledWith(
        sampleJob.id,
        expect.objectContaining({
          messageType: 'VISUAL_REVIEW_CARD',
          payloadMetadata: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });
  });
});
