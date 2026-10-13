/* eslint-disable @typescript-eslint/unbound-method */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  type ApplicationLogger,
} from '@parisian-shopper/common';
import {
  type CreativeApprovalRepository,
  type CreativeJobRecord,
  type CreativeJobRepository,
  type CreativeRevisionRepository,
  type TelegramActionTokenRecord,
  type TelegramActor,
  type TelegramWorkflowRepository,
  type VisualAssetRepository,
  TelegramAction,
  ApproveCreativeUseCase,
  GenerateCreativeUseCase,
  TelegramActionTokenService,
} from '@parisian-shopper/application';

import { VisualReviewCardRenderer } from '../renderers/visual-review-card.renderer.js';
import {
  buildConfirmVisualApprovalKeyboard,
  buildVisualReviewKeyboard,
} from '../keyboards/visual-review.keyboard.js';
import { VisualReviewCallbackHandler } from '../handlers/visual-review-callback.handler.js';

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
    it('renders caption with all validation badges PASS and abbreviated CAS digest', () => {
      const caption = VisualReviewCardRenderer.renderCaption({
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

      expect(caption).toContain('🎨 *Visual Creative Review*');
      expect(caption).toContain('📦 *CHANEL Classic Flap Bag* • CHANEL');
      expect(caption).toContain('📐 *Target Format:* 1:1 Feed Post (1080x1080)');
      expect(caption).toContain('🏷 *Compositor:* [ps-compositor-v1]');
      expect(caption).toContain('• Dimensions: [1080x1080 PASS]');
      expect(caption).toContain('• Hero Containment: [PASS]');
      expect(caption).toContain('• Safety: [PASS]');
      expect(caption).toContain('🔐 *Storage CAS Fingerprint:* `#e3b0c442`');
    });

    it('renders caption with FAIL badges when validation checks fail', () => {
      const caption = VisualReviewCardRenderer.renderCaption({
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

      expect(caption).toContain('• Dimensions: [1080x1350 FAIL]');
      expect(caption).toContain('• Hero Containment: [FAIL]');
      expect(caption).toContain('• Safety: [FAIL]');
      expect(caption).toContain('`#12345678`');
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

    it('builds two-step confirmation keyboard with Confirm and Cancel', () => {
      const keyboard = buildConfirmVisualApprovalKeyboard('token_confirm', 'token_cancel');

      expect(keyboard).toHaveLength(1);
      expect(keyboard[0]?.[0]?.text).toBe('✅ Confirm Approval');
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
        findById: jest.fn<CreativeJobRepository['findById']>((_id: string) => Promise.resolve(sampleJob)),
        findByContentVersionId: jest.fn<CreativeJobRepository['findByContentVersionId']>(),
        transitionStatus: jest.fn<CreativeJobRepository['transitionStatus']>((id: string, _exp: unknown, target: unknown) =>
          Promise.resolve({ ...sampleJob, id, status: target as CreativeJobRecord['status'] }),
        ),
      };

      assetRepo = {
        createAsset: jest.fn<VisualAssetRepository['createAsset']>(),
        findById: jest.fn<VisualAssetRepository['findById']>(),
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
        claimInboundUpdate: jest.fn<TelegramWorkflowRepository['claimInboundUpdate']>(() => Promise.resolve(true)),
        resolveActor: jest.fn<TelegramWorkflowRepository['resolveActor']>(() => Promise.resolve(actor)),
        recordDeniedAccess: jest.fn<TelegramWorkflowRepository['recordDeniedAccess']>(() => Promise.resolve()),
        consumeRateLimit: jest.fn<TelegramWorkflowRepository['consumeRateLimit']>(() => Promise.resolve(true)),
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
        findActivePendingInteraction: jest.fn<TelegramWorkflowRepository['findActivePendingInteraction']>(),
        completePendingInteraction: jest.fn<TelegramWorkflowRepository['completePendingInteraction']>(),
        cancelPendingInteraction: jest.fn<TelegramWorkflowRepository['cancelPendingInteraction']>(),
        getPreviousVersions: jest.fn<TelegramWorkflowRepository['getPreviousVersions']>(),
        appendAudit: jest.fn<TelegramWorkflowRepository['appendAudit']>(() => Promise.resolve()),
      };

      tokens = {
        create: jest.fn<TelegramActionTokenService['create']>(() => Promise.resolve(['token_conf_1', 'token_canc_1'])),
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

        expect(response.callbackNotice).toBe('This action has expired. Please reopen the latest job.');
      });

      it('rejects consumed action token (replay attack attempt)', async () => {
        workflowRepo.consumeActionToken.mockResolvedValueOnce({ disposition: 'CONSUMED' });

        const response = await handler.handleCallback({
          updateId: 'up-3',
          profile: { telegramUserId: actor.telegramUserId },
          callbackData: 'ps:123456789012345678901234567890',
        });

        expect(response.callbackNotice).toBe('This action has expired. Please reopen the latest job.');
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
  });
});
