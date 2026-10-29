/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  type ApproveCreativeUseCase,
  type CreativeApprovalRepository,
  type CreativeJobRecord,
  type CreativeJobRepository,
  type CreativeRevisionRepository,
  type ExportPosterUseCase,
  type GenerateCreativeUseCase,
  type TelegramActionTokenRecord,
  type TelegramActionTokenService,
  type TelegramActor,
  type TelegramWorkflowRepository,
  type VisualAssetRecord,
  type VisualAssetRepository,
  ExportDownloadTokenService,
  Permission,
  RoleCode,
  TelegramAction,
} from '@parisian-shopper/application';
import { type ApplicationLogger, ValidationError } from '@parisian-shopper/common';
import { VisualReviewCallbackHandler } from '../handlers/visual-review-callback.handler.js';

describe('W32-E Telegram Multi-Format Export Adversarial Integration Suite', () => {
  const actorApprover: TelegramActor = {
    identityId: 'identity-approver-w32',
    internalUserId: 'user-approver-w32',
    telegramUserId: '777000222',
    displayName: 'Lead Approver',
    roles: [RoleCode.MARKETING_APPROVER],
  };

  const actorViewer: TelegramActor = {
    identityId: 'identity-viewer-w32',
    internalUserId: 'user-viewer-w32',
    telegramUserId: '777000333',
    displayName: 'Viewer Only',
    roles: [RoleCode.VIEWER],
  };

  const sampleJob: CreativeJobRecord = {
    id: 'job-adv-tg-exp',
    contentVersionId: 'ver-adv-c1',
    productSnapshotId: 'snap-adv-p1',
    brandRuleVersionId: 'brand-adv-b1',
    status: 'CREATIVE_APPROVED',
    targetPlatform: 'TELEGRAM',
    aspectRatio: '1:1',
    creativeProfile: 'PARISIAN_MORNING_ATELIER',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleAsset: VisualAssetRecord = {
    id: 'asset-adv-tg-v1',
    creativeJobId: sampleJob.id,
    versionNumber: 1,
    assetRole: 'COMPOSITED_CREATIVE',
    mimeType: 'image/png',
    width: 1080,
    height: 1080,
    byteSize: 15000,
    sha256: 'sha256-approved-poster',
    storageKey: 'cas/approved-poster.png',
    sourceProductAssetDigest: 'digest-product',
    backgroundAssetDigest: 'digest-bg',
    createdAt: new Date(),
  };

  let auditLogs: Array<{
    action: string;
    resourceType?: string | undefined;
    resourceId?: string | undefined;
    metadata?: unknown;
  }>;

  let workflowRepo: TelegramWorkflowRepository;
  let jobRepo: jest.Mocked<CreativeJobRepository>;
  let assetRepo: jest.Mocked<VisualAssetRepository>;
  let mockExportUseCase: jest.Mocked<ExportPosterUseCase>;
  let tokenService: ExportDownloadTokenService;
  let handler: VisualReviewCallbackHandler;
  let mockTokens: jest.Mocked<TelegramActionTokenService>;

  const mockLogger: ApplicationLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };

  beforeEach(() => {
    auditLogs = [];

    workflowRepo = {
      claimInboundUpdate: jest.fn(() => Promise.resolve(true)),
      resolveActor: jest.fn(() => Promise.resolve(actorApprover)),
      recordDeniedAccess: jest.fn(() => Promise.resolve()),
      consumeRateLimit: jest.fn(() => Promise.resolve(true)),
      createFlow: jest.fn(),
      findFlowById: jest.fn(() => Promise.resolve(null)),
      updateFlowSelection: jest.fn(),
      completeFlow: jest.fn(),
      cancelFlow: jest.fn(() => Promise.resolve()),
      setFlowMetadata: jest.fn(),
      storeActionTokens: jest.fn(),
      consumeActionToken: jest.fn(),
      listRecentJobs: jest.fn(),
      listHistory: jest.fn(),
      findJobByFlowId: jest.fn(),
      getSourceByJobId: jest.fn(),
      getValidationByVersionId: jest.fn(),
      getDraftViewByVersionId: jest.fn(),
      getFailureViewByJobId: jest.fn(),
      claimOutboxEvents: jest.fn(),
      beginNotificationDelivery: jest.fn(),
      markNotificationSent: jest.fn(),
      markNotificationFailed: jest.fn(),
      markOutboxProcessed: jest.fn(),
      createPendingInteraction: jest.fn(),
      findActivePendingInteraction: jest.fn(),
      completePendingInteraction: jest.fn(),
      cancelPendingInteraction: jest.fn(),
      getPreviousVersions: jest.fn(),
      recordChannelPublication: jest.fn(() => Promise.resolve()),
      getChannelPublication: jest.fn(() => Promise.resolve(null)),
      findActiveFlowByIdentity: jest.fn(() => Promise.resolve(null)),
      setActiveWorkflowMessage: jest.fn(() => Promise.resolve()),
      getActiveWorkflowMessage: jest.fn(() => Promise.resolve(null)),
      clearActiveWorkflowMessage: jest.fn(() => Promise.resolve()),
      appendAudit: jest.fn(
        (event: {
          action: string;
          resourceType?: string | undefined;
          resourceId?: string | undefined;
          metadata?: unknown;
        }) => {
          auditLogs.push({
            action: event.action,
            resourceType: event.resourceType,
            resourceId: event.resourceId,
            metadata: event.metadata,
          });
          return Promise.resolve();
        },
      ),
    } as unknown as TelegramWorkflowRepository;

    jobRepo = {
      findById: jest.fn((id: string) => Promise.resolve(id === sampleJob.id ? sampleJob : null)),
      findByContentVersionId: jest.fn(() => Promise.resolve([sampleJob])),
      createJob: jest.fn(),
      transitionStatus: jest.fn(),
    } as unknown as jest.Mocked<CreativeJobRepository>;

    assetRepo = {
      findById: jest.fn((id: string) =>
        Promise.resolve(id === sampleAsset.id ? sampleAsset : null),
      ),
      findLatestByJobId: jest.fn(() => Promise.resolve(sampleAsset)),
      findByJobAndVersion: jest.fn(() => Promise.resolve(null)),
      listByJobId: jest.fn(() => Promise.resolve([sampleAsset])),
      createAsset: jest.fn(),
    } as unknown as jest.Mocked<VisualAssetRepository>;

    mockExportUseCase = {
      execute: jest.fn(() =>
        Promise.resolve({
          buffer: Buffer.from('uncompressed-high-res-bytes'),
          mimeType: 'image/png' as const,
          filename: 'poster-GPR-PARIS-ADV-1080x1920.png',
          width: 1080,
          height: 1920,
          sha256: 'sha256-story-export-bytes',
          byteSize: 2450000,
          exportId: 'exp-tg-w32-001',
          storageKey: 'cas/exports/exp-tg-w32-001.png',
          validationStatus: 'PASSED' as const,
        }),
      ),
    } as unknown as jest.Mocked<ExportPosterUseCase>;

    tokenService = new ExportDownloadTokenService({
      secret: 'telegram-adversarial-secret-32-chars!',
      ttlSeconds: 3600,
    });

    mockTokens = {
      create: jest.fn((_identityId: string, defs: readonly unknown[]) =>
        Promise.resolve(defs.map((_, i) => `tok-export-mock-${i}`)),
      ),
      consume: jest.fn(),
      peek: jest.fn(),
      invalidate: jest.fn(),
    } as unknown as jest.Mocked<TelegramActionTokenService>;

    handler = new VisualReviewCallbackHandler(
      jobRepo,
      assetRepo,
      {} as unknown as CreativeRevisionRepository,
      {} as unknown as CreativeApprovalRepository,
      workflowRepo,
      mockTokens,
      {} as unknown as ApproveCreativeUseCase,
      {} as unknown as GenerateCreativeUseCase,
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
  });

  describe('1. Adversarial Action Token Security & Integrity Checks', () => {
    it('denies export action when token resourceId and metadata.creativeJobId mismatch (cross-job injection)', async () => {
      const tamperedToken: TelegramActionTokenRecord = {
        id: 'tok-tampered-cross-job',
        telegramIdentityId: actorApprover.identityId,
        action: TelegramAction.SELECT_EXPORT_FORMAT,
        resourceId: 'job-intended-1',
        metadata: {
          creativeJobId: 'job-injected-foreign-2',
          format: 'STORY_1080_1920',
        },
        singleUse: false,
        expiresAt: new Date(Date.now() + 60_000),
      };

      const res = await handler.handleAction(actorApprover, tamperedToken);

      expect(res.messages[0]?.text).toContain('resource identifier mismatch');
      expect(mockExportUseCase.execute).not.toHaveBeenCalled();
      const audit = auditLogs.find((l) => l.action === 'TELEGRAM_VISUAL_ACTION_DENIED');
      expect(audit).toBeDefined();
      expect(audit?.metadata).toMatchObject({
        reason: 'RESOURCE_INTEGRITY_MISMATCH',
      });
    });

    it('denies export action when visualAssetId does not belong to target creativeJobId (alien asset injection)', async () => {
      const alienAsset: VisualAssetRecord = {
        ...sampleAsset,
        id: 'asset-alien-999',
        creativeJobId: 'job-different-completely',
      };
      jest.spyOn(assetRepo, 'findById').mockResolvedValue(alienAsset);

      const tamperedToken: TelegramActionTokenRecord = {
        id: 'tok-alien-asset',
        telegramIdentityId: actorApprover.identityId,
        action: TelegramAction.SELECT_EXPORT_FORMAT,
        resourceId: sampleJob.id,
        metadata: {
          creativeJobId: sampleJob.id,
          visualAssetId: alienAsset.id,
          format: 'STORY_1080_1920',
        },
        singleUse: false,
        expiresAt: new Date(Date.now() + 60_000),
      };

      const res = await handler.handleAction(actorApprover, tamperedToken);

      expect(res.messages[0]?.text).toContain('asset does not belong to this creative job');
      expect(mockExportUseCase.execute).not.toHaveBeenCalled();
      const audit = auditLogs.find((l) => l.action === 'TELEGRAM_VISUAL_ACTION_DENIED');
      expect(audit?.metadata).toMatchObject({
        details: 'visualAssetId does not belong to creativeJobId',
      });
    });

    it('denies export action when actor lacks EXPORT_CREATIVE permission (RBAC enforcement)', async () => {
      const validToken: TelegramActionTokenRecord = {
        id: 'tok-rbac-test',
        telegramIdentityId: actorViewer.identityId,
        action: TelegramAction.SELECT_EXPORT_FORMAT,
        resourceId: sampleJob.id,
        metadata: {
          creativeJobId: sampleJob.id,
          visualAssetId: sampleAsset.id,
          format: 'SQUARE_1080',
        },
        singleUse: false,
        expiresAt: new Date(Date.now() + 60_000),
      };

      const res = await handler.handleAction(actorViewer, validToken);

      expect(res.messages[0]?.text).toContain('You do not have permission');
      expect(mockExportUseCase.execute).not.toHaveBeenCalled();
      const audit = auditLogs.find((l) => l.action === 'TELEGRAM_VISUAL_ACTION_DENIED');
      expect(audit?.metadata).toMatchObject({
        reason: 'INSUFFICIENT_PERMISSIONS',
        requiredPermission: Permission.EXPORT_CREATIVE,
      });
    });
  });

  describe('2. Export Poster Menu & Multi-Format Token Generation', () => {
    it('generates format selection keyboard with 6 distinct multi-format tokens and 1 cancel token', async () => {
      const exportMenuToken: TelegramActionTokenRecord = {
        id: 'tok-menu-1',
        telegramIdentityId: actorApprover.identityId,
        action: TelegramAction.EXPORT_POSTER,
        resourceId: sampleJob.id,
        metadata: {
          creativeJobId: sampleJob.id,
          visualAssetId: sampleAsset.id,
          productName: 'L’Essence Parisienne',
        },
        singleUse: false,
        expiresAt: new Date(Date.now() + 60_000),
      };

      const res = await handler.handleAction(actorApprover, exportMenuToken);

      expect(res.messages).toHaveLength(1);
      const msg = res.messages[0]!;
      expect(msg.text).toContain('Download High-Resolution Poster');
      expect(msg.buttons).toBeDefined();

      expect(mockTokens.create).toHaveBeenCalledTimes(1);
      const [, defs] = (mockTokens.create as jest.Mock).mock.calls[0] as [
        string,
        Array<{ action: string; metadata?: Record<string, unknown> }>,
      ];
      expect(defs).toHaveLength(7);

      const formats = defs
        .slice(0, 6)
        .map((d) => `${String(d.metadata?.format)}_${String(d.metadata?.encoding)}`);
      expect(formats).toEqual([
        'SQUARE_1080_PNG',
        'SQUARE_1080_JPEG',
        'PORTRAIT_1080_1350_PNG',
        'PORTRAIT_1080_1350_JPEG',
        'STORY_1080_1920_PNG',
        'STORY_1080_1920_JPEG',
      ]);
    });
  });

  describe('3. Uncompressed Telegram Document Delivery & Verification', () => {
    it('delivers uncompressed documentBuffer and filename with valid HMAC download link in caption', async () => {
      const selectToken: TelegramActionTokenRecord = {
        id: 'tok-export-story',
        telegramIdentityId: actorApprover.identityId,
        action: TelegramAction.SELECT_EXPORT_FORMAT,
        resourceId: sampleJob.id,
        metadata: {
          creativeJobId: sampleJob.id,
          visualAssetId: sampleAsset.id,
          format: 'STORY_1080_1920',
          encoding: 'PNG',
        },
        singleUse: false,
        expiresAt: new Date(Date.now() + 60_000),
      };

      const res = await handler.handleAction(actorApprover, selectToken);

      expect(mockExportUseCase.execute).toHaveBeenCalledWith({
        creativeJobId: sampleJob.id,
        visualAssetId: sampleAsset.id,
        format: 'STORY_1080_1920',
        encoding: 'PNG',
        actorUserId: actorApprover.internalUserId,
        actorRoles: actorApprover.roles,
      });

      expect(res.messages).toHaveLength(1);
      const msg = res.messages[0]!;

      expect(msg.documentBuffer).toEqual(Buffer.from('uncompressed-high-res-bytes'));
      expect(msg.documentFilename).toBe('poster-GPR-PARIS-ADV-1080x1920.png');
      expect(msg.photoBuffer).toEqual(Buffer.from('uncompressed-high-res-bytes'));
      expect(msg.text).toContain('Dimensions: 1080×1920');
      expect(msg.text).toContain('SHA-256: `#sha256-s`');
      expect(msg.text).toContain('/v1/creatives/exports/exp-tg-w32-001/download?token=');

      const match = /download\?token=([A-Za-z0-9_-]+)/.exec(msg.text);
      expect(match).not.toBeNull();
      const extractedToken = match![1]!;

      const verification = tokenService.verifyToken(extractedToken, 'exp-tg-w32-001');
      expect(verification.isValid).toBe(true);
      expect(verification.exportId).toBe('exp-tg-w32-001');
      expect(verification.userId).toBe(actorApprover.internalUserId);
    });

    it('handles JPEG export format delivering .jpg documentFilename and appropriate caption', async () => {
      mockExportUseCase.execute.mockResolvedValueOnce({
        buffer: Buffer.from('jpeg-export-bytes'),
        mimeType: 'image/jpeg',
        filename: 'poster-GPR-PARIS-ADV-1080x1350.jpg',
        width: 1080,
        height: 1350,
        sha256: 'sha256-jpeg-portrait',
        byteSize: 850000,
        exportId: 'exp-tg-w32-002',
        storageKey: 'cas/exports/exp-tg-w32-002.jpg',
        validationStatus: 'PASSED',
      });

      const selectToken: TelegramActionTokenRecord = {
        id: 'tok-export-portrait-jpg',
        telegramIdentityId: actorApprover.identityId,
        action: TelegramAction.SELECT_EXPORT_FORMAT,
        resourceId: sampleJob.id,
        metadata: {
          creativeJobId: sampleJob.id,
          visualAssetId: sampleAsset.id,
          format: 'PORTRAIT_1080_1350',
          encoding: 'JPEG',
        },
        singleUse: false,
        expiresAt: new Date(Date.now() + 60_000),
      };

      const res = await handler.handleAction(actorApprover, selectToken);

      expect(res.messages).toHaveLength(1);
      const msg = res.messages[0]!;
      expect(msg.documentFilename).toBe('poster-GPR-PARIS-ADV-1080x1350.jpg');
      expect(msg.text).toContain('Dimensions: 1080×1350');
      expect(msg.text).toContain('File size: 830.1 KB');
    });
  });

  describe('4. Post-Adaptation Hard Visual Gate Defense in Telegram', () => {
    it('fails closed when Post-Adaptation Hard Gate fails during export execution', async () => {
      mockExportUseCase.execute.mockRejectedValueOnce(
        new ValidationError({
          publicMessage:
            'Export layout adaptation failed hard visual gates: [GATE_SAFE_MARGIN_VIOLATION] CTA safe margin breach',
        }),
      );

      const selectToken: TelegramActionTokenRecord = {
        id: 'tok-export-gate-fail',
        telegramIdentityId: actorApprover.identityId,
        action: TelegramAction.SELECT_EXPORT_FORMAT,
        resourceId: sampleJob.id,
        metadata: {
          creativeJobId: sampleJob.id,
          visualAssetId: sampleAsset.id,
          format: 'STORY_1080_1920',
          encoding: 'PNG',
        },
        singleUse: false,
        expiresAt: new Date(Date.now() + 60_000),
      };

      await expect(handler.handleAction(actorApprover, selectToken)).rejects.toThrow(
        ValidationError,
      );
    });
  });
});
