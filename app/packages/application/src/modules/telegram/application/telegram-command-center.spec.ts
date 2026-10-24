import { jest } from '@jest/globals';
import { PermissionService, RoleCode } from '../../auth/domain/permissions.js';
import {
  TelegramAction,
  type TelegramActor,
  type TelegramUserProfile,
} from '../domain/telegram.js';
import { type TelegramActionTokenService } from './telegram-action-token.service.js';
import { TelegramCommandCenter, type TelegramWorkflowPolicy } from './telegram-command-center.js';
import {
  type ConsumeActionTokenResult,
  type StoreActionTokenInput,
  type TelegramDraftView,
  type TelegramWorkflowRepository,
} from './telegram-workflow.repository.js';
import {
  type RequestContentEditInput,
  type RequestContentEditUseCase,
} from '../../approvals/application/request-content-edit.use-case.js';
import {
  type RequestContentRegenerationInput,
  type RequestContentRegenerationUseCase,
} from '../../approvals/application/request-content-regeneration.use-case.js';
import {
  type ApproveContentVersionInput,
  type ApproveContentVersionUseCase,
} from '../../approvals/application/approve-content-version.use-case.js';
import {
  type RejectContentVersionInput,
  type RejectContentVersionUseCase,
} from '../../approvals/application/reject-content-version.use-case.js';
import { type GetContentReviewStateQuery } from '../../approvals/application/get-content-review-state.query.js';
import { type GetApprovalStatusQuery } from '../../approvals/application/get-approval-status.query.js';
import {
  type ApprovalEventRecord,
  type ContentReviewState,
  type RevisionRequestRecord,
} from '../../approvals/domain/approval.js';

describe('TelegramCommandCenter Phase 1F Review Workflow', () => {
  const approverActor: TelegramActor = {
    identityId: 'ident-approver',
    internalUserId: 'user-approver',
    telegramUserId: '123456789',
    displayName: 'Approver Alice',
    roles: [RoleCode.MARKETING_APPROVER],
  };

  const approverProfile: TelegramUserProfile = {
    telegramUserId: '123456789',
    username: 'approver_alice',
    displayName: 'Approver Alice',
  };

  const defaultDraftView: TelegramDraftView = {
    jobId: 'job-1',
    sku: 'FIC-001',
    productName: 'Rose Perfume',
    contentType: 'PRODUCT_SPOTLIGHT',
    language: 'KM',
    platform: 'FACEBOOK',
    jobStatus: 'UNDER_REVIEW',
    versionId: 'ver-1',
    versionNumber: 1,
    validationStatus: 'PASSED',
    createdAt: new Date(),
    requesterTelegramUserId: '123456789',
    telegramIdentityId: 'ident-approver',
    output: {
      headline: 'Fresh Rose',
      khmerCaption: null,
      englishCaption: null,
      cta: 'Shop Now',
      hashtags: [],
    },
    validation: {
      id: 'val-1',
      contentVersionId: 'ver-1',
      validatorVersion: '1.0',
      status: 'PASSED',
      findingCount: 0,
      blockingCount: 0,
      warningCount: 0,
      infoCount: 0,
      createdAt: new Date(),
      findings: [],
    },
  };

  const claimInboundUpdate = jest.fn(
    (_updateId: string, _telegramUserId: string | null, _updateType: string): Promise<boolean> =>
      Promise.resolve(true),
  );
  const resolveActor = jest.fn((_profile: TelegramUserProfile): Promise<TelegramActor | null> =>
    Promise.resolve(approverActor),
  );
  const recordDeniedAccess = jest.fn((_profile: TelegramUserProfile): Promise<void> =>
    Promise.resolve(),
  );
  const consumeRateLimit = jest.fn(
    (
      _identityId: string,
      _action: string,
      _limit: number,
      _windowSeconds: number,
    ): Promise<boolean> => Promise.resolve(true),
  );
  const storeActionTokens = jest.fn((_inputs: readonly StoreActionTokenInput[]): Promise<void> =>
    Promise.resolve(),
  );
  const consumeActionToken = jest.fn(
    (_tokenHash: string, _telegramUserId: string, _now: Date): Promise<ConsumeActionTokenResult> =>
      Promise.resolve({ disposition: 'EXPIRED' }),
  );
  const getDraftViewByVersionId = jest.fn((_versionId: string): Promise<TelegramDraftView | null> =>
    Promise.resolve(defaultDraftView),
  );
  const createPendingInteraction = jest.fn(
    (_input: {
      telegramIdentityId: string;
      contentJobId: string;
      contentVersionId: string;
      action: 'EDIT' | 'REJECT';
      expiresAt: Date;
    }): Promise<void> => Promise.resolve(),
  );
  const findActivePendingInteraction = jest.fn(
    (
      _telegramIdentityId: string,
      _now: Date,
    ): Promise<{
      id: string;
      contentJobId: string;
      contentVersionId: string;
      action: 'EDIT' | 'REJECT';
    } | null> => Promise.resolve(null),
  );
  const completePendingInteraction = jest.fn((_id: string, _now: Date): Promise<void> =>
    Promise.resolve(),
  );
  const cancelPendingInteraction = jest.fn((_id: string, _now: Date): Promise<void> =>
    Promise.resolve(),
  );
  const getPreviousVersions = jest.fn(
    (
      _actor: TelegramActor,
      _jobId: string,
    ): Promise<
      readonly {
        id: string;
        versionNumber: number;
        validationStatus?: string;
        createdAt: Date;
        headline: string;
      }[]
    > =>
      Promise.resolve([
        {
          id: 'ver-1',
          versionNumber: 1,
          validationStatus: 'PASSED',
          createdAt: new Date(),
          headline: 'Initial Headline',
        },
      ]),
  );
  const appendAudit = jest.fn((_input: unknown): Promise<void> => Promise.resolve());

  const createTokens = jest.fn(
    (_identityId: string, defs: unknown[], _expiresAt: Date): Promise<string[]> =>
      Promise.resolve(defs.map((_, i) => `token-mock-${i}`)),
  );
  const executeEdit = jest.fn((input: RequestContentEditInput): Promise<RevisionRequestRecord> =>
    Promise.resolve({
      id: 'rev-1',
      contentJobId: input.contentJobId,
      sourceContentVersionId: input.contentVersionId,
      requestedByUserId: input.actorUserId,
      type: 'EDIT',
      ...(input.instruction !== undefined ? { instruction: input.instruction } : {}),
      status: 'PENDING',
      createdAt: new Date(),
    }),
  );
  const executeRegenerate = jest.fn(
    (input: RequestContentRegenerationInput): Promise<RevisionRequestRecord> =>
      Promise.resolve({
        id: 'rev-2',
        contentJobId: input.contentJobId,
        sourceContentVersionId: input.contentVersionId,
        requestedByUserId: input.actorUserId,
        type: 'REGENERATE',
        status: 'PENDING',
        createdAt: new Date(),
      }),
  );
  const executeApprove = jest.fn(
    (input: ApproveContentVersionInput): Promise<ApprovalEventRecord> =>
      Promise.resolve({
        id: 'app-1',
        contentJobId: input.contentJobId,
        contentVersionId: input.contentVersionId,
        approverUserId: input.approverUserId,
        decision: 'APPROVED',
        createdAt: new Date(),
      }),
  );
  const executeReject = jest.fn((input: RejectContentVersionInput): Promise<ApprovalEventRecord> =>
    Promise.resolve({
      id: 'rej-1',
      contentJobId: input.contentJobId,
      contentVersionId: input.contentVersionId,
      approverUserId: input.approverUserId,
      decision: 'REJECTED',
      ...(input.comment !== undefined ? { comment: input.comment } : {}),
      createdAt: new Date(),
    }),
  );
  const executeReviewState = jest.fn((_jobId: string): Promise<ContentReviewState | null> =>
    Promise.resolve({
      jobId: 'job-1',
      jobStatus: 'UNDER_REVIEW',
      productSnapshotId: 'snap-1',
      sku: 'FIC-001',
      productName: 'Rose Perfume',
      currentVersionNumber: 1,
      versions: [
        {
          id: 'ver-1',
          versionNumber: 1,
          createdAt: new Date(),
          validationStatus: 'PASSED',
          approvalEligible: true,
          headline: 'Initial Headline',
        },
      ],
    }),
  );

  const mockRepository = {
    claimInboundUpdate,
    resolveActor,
    recordDeniedAccess,
    consumeRateLimit,
    createFlow: jest.fn(),
    findFlowById: jest.fn(),
    updateFlowSelection: jest.fn(),
    completeFlow: jest.fn(),
    storeActionTokens,
    consumeActionToken,
    listRecentJobs: jest.fn(),
    listHistory: jest.fn(),
    findJobByFlowId: jest.fn(),
    getSourceByJobId: jest.fn(),
    getValidationByVersionId: jest.fn(),
    getDraftViewByVersionId,
    getFailureViewByJobId: jest.fn(),
    claimOutboxEvents: jest.fn(),
    beginNotificationDelivery: jest.fn(),
    markNotificationSent: jest.fn(),
    markNotificationFailed: jest.fn(),
    markOutboxProcessed: jest.fn(),
    createPendingInteraction,
    findActivePendingInteraction,
    completePendingInteraction,
    cancelPendingInteraction,
    getPreviousVersions,
    appendAudit,
  } as unknown as TelegramWorkflowRepository;

  const mockTokens = { create: createTokens } as unknown as TelegramActionTokenService;
  const mockRequestEdit = { execute: executeEdit } as unknown as RequestContentEditUseCase;
  const mockRequestRegenerate = {
    execute: executeRegenerate,
  } as unknown as RequestContentRegenerationUseCase;
  const mockApprove = { execute: executeApprove } as unknown as ApproveContentVersionUseCase;
  const mockReject = { execute: executeReject } as unknown as RejectContentVersionUseCase;
  const mockReviewState = { execute: executeReviewState } as unknown as GetContentReviewStateQuery;
  const mockApprovalStatus = {} as unknown as GetApprovalStatusQuery;

  const policy: TelegramWorkflowPolicy = { actionTokenTtlSeconds: 900 };

  const commandCenter = new TelegramCommandCenter(
    mockRepository,
    new PermissionService(),
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    mockTokens,
    policy,
    mockRequestEdit,
    mockRequestRegenerate,
    mockApprove,
    mockReject,
    mockReviewState,
    mockApprovalStatus,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Pending interaction handling in handleCommand', () => {
    it('processes user message as edit instruction when pending interaction is EDIT', async () => {
      findActivePendingInteraction.mockResolvedValueOnce({
        id: 'pi-1',
        contentJobId: 'job-1',
        contentVersionId: 'ver-1',
        action: 'EDIT',
      });

      const response = await commandCenter.handleCommand({
        updateId: 'up-1',
        profile: approverProfile,
        text: 'Emphasize rose notes and shorten opening',
      });

      expect(executeEdit).toHaveBeenCalledWith({
        contentJobId: 'job-1',
        contentVersionId: 'ver-1',
        actorUserId: approverActor.internalUserId,
        actorRoles: approverActor.roles,
        instruction: 'Emphasize rose notes and shorten opening',
      });
      expect(completePendingInteraction).toHaveBeenCalledWith('pi-1', expect.any(Date));
      expect(response.messages[0]?.text).toContain('Revision requested with instructions');
    });

    it('processes user message as rejection comment when pending interaction is REJECT', async () => {
      findActivePendingInteraction.mockResolvedValueOnce({
        id: 'pi-2',
        contentJobId: 'job-1',
        contentVersionId: 'ver-1',
        action: 'REJECT',
      });

      const response = await commandCenter.handleCommand({
        updateId: 'up-2',
        profile: approverProfile,
        text: 'Tone is inappropriate for brand guidelines',
      });

      expect(executeReject).toHaveBeenCalledWith({
        contentJobId: 'job-1',
        contentVersionId: 'ver-1',
        approverUserId: approverActor.internalUserId,
        approverRoles: approverActor.roles,
        comment: 'Tone is inappropriate for brand guidelines',
      });
      expect(completePendingInteraction).toHaveBeenCalledWith('pi-2', expect.any(Date));
      expect(response.messages[0]?.text).toContain('Draft rejected');
      expect(response.messages[0]?.text).toContain('Tone is inappropriate for brand guidelines');
    });

    it('cancels pending interaction when user sends /cancel', async () => {
      findActivePendingInteraction.mockResolvedValueOnce({
        id: 'pi-3',
        contentJobId: 'job-1',
        contentVersionId: 'ver-1',
        action: 'EDIT',
      });

      const response = await commandCenter.handleCommand({
        updateId: 'up-3',
        profile: approverProfile,
        text: '/cancel',
      });

      expect(cancelPendingInteraction).toHaveBeenCalledWith('pi-3', expect.any(Date));
      expect(executeEdit).not.toHaveBeenCalled();
      expect(response.messages[0]?.text).toContain('Action cancelled.');
    });

    it('informs user if /cancel is typed without any active pending action', async () => {
      const response = await commandCenter.handleCommand({
        updateId: 'up-4',
        profile: approverProfile,
        text: '/cancel',
      });

      expect(response.messages[0]?.text).toContain('There is no active pending action to cancel.');
    });
  });

  describe('handleCallback review actions', () => {
    it('prompts user for edit instruction on REQUEST_EDIT action', async () => {
      consumeActionToken.mockResolvedValueOnce({
        disposition: 'VALID',
        token: {
          id: 'tok-1',
          telegramIdentityId: approverActor.identityId,
          action: TelegramAction.REQUEST_EDIT,
          resourceId: 'ver-1',
          metadata: { contentJobId: 'job-1' },
          singleUse: false,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const response = await commandCenter.handleCallback({
        updateId: 'up-10',
        profile: approverProfile,
        callbackData: 'ps:mocktokenstring123456789012345',
      });

      expect(createPendingInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          telegramIdentityId: approverActor.identityId,
          contentJobId: 'job-1',
          contentVersionId: 'ver-1',
          action: 'EDIT',
        }),
      );
      expect(response.messages[0]?.text).toContain('Request Revision');
      expect(response.callbackNotice).toBe('Awaiting edit instructions...');
    });

    it('triggers regeneration immediately on REQUEST_REGENERATE action', async () => {
      consumeActionToken.mockResolvedValueOnce({
        disposition: 'VALID',
        token: {
          id: 'tok-2',
          telegramIdentityId: approverActor.identityId,
          action: TelegramAction.REQUEST_REGENERATE,
          resourceId: 'ver-1',
          metadata: { contentJobId: 'job-1' },
          singleUse: false,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const response = await commandCenter.handleCallback({
        updateId: 'up-11',
        profile: approverProfile,
        callbackData: 'ps:mocktokenstring123456789012345',
      });

      expect(executeRegenerate).toHaveBeenCalledWith({
        contentJobId: 'job-1',
        contentVersionId: 'ver-1',
        actorUserId: approverActor.internalUserId,
        actorRoles: approverActor.roles,
      });
      expect(response.messages[0]?.text).toContain('Regeneration requested');
      expect(response.callbackNotice).toBe('Regeneration started.');
    });

    it('prompts for approval confirmation on APPROVE_PROMPT', async () => {
      consumeActionToken.mockResolvedValueOnce({
        disposition: 'VALID',
        token: {
          id: 'tok-3',
          telegramIdentityId: approverActor.identityId,
          action: TelegramAction.APPROVE_PROMPT,
          resourceId: 'ver-1',
          metadata: { contentJobId: 'job-1', versionNumber: 1 },
          singleUse: false,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const response = await commandCenter.handleCallback({
        updateId: 'up-12',
        profile: approverProfile,
        callbackData: 'ps:mocktokenstring123456789012345',
      });

      expect(response.messages[0]?.text).toContain('Confirm Approval');
      expect(response.messages[0]?.text).toContain('Are you sure you want to approve version V1');
      expect(createTokens).toHaveBeenCalledWith(
        approverActor.identityId,
        expect.arrayContaining([
          expect.objectContaining({ action: TelegramAction.CONFIRM_APPROVE }),
          expect.objectContaining({ action: TelegramAction.CANCEL_ACTION }),
        ]),
        expect.any(Date),
      );
    });

    it('blocks APPROVE_PROMPT if the version is not approval eligible', async () => {
      executeReviewState.mockResolvedValueOnce({
        jobId: 'job-1',
        jobStatus: 'UNDER_REVIEW',
        productSnapshotId: 'snap-1',
        sku: 'FIC-001',
        productName: 'Rose Perfume',
        currentVersionNumber: 1,
        versions: [
          {
            id: 'ver-1',
            versionNumber: 1,
            createdAt: new Date(),
            validationStatus: 'BLOCKED',
            approvalEligible: false,
            headline: 'Blocked Headline',
          },
        ],
      });

      consumeActionToken.mockResolvedValueOnce({
        disposition: 'VALID',
        token: {
          id: 'tok-3b',
          telegramIdentityId: approverActor.identityId,
          action: TelegramAction.APPROVE_PROMPT,
          resourceId: 'ver-1',
          metadata: { contentJobId: 'job-1' },
          singleUse: false,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const response = await commandCenter.handleCallback({
        updateId: 'up-12b',
        profile: approverProfile,
        callbackData: 'ps:mocktokenstring123456789012345',
      });

      expect(response.messages[0]?.text).toContain('blocking factual issues');
    });

    it('approves content on CONFIRM_APPROVE', async () => {
      consumeActionToken.mockResolvedValueOnce({
        disposition: 'VALID',
        token: {
          id: 'tok-4',
          telegramIdentityId: approverActor.identityId,
          action: TelegramAction.CONFIRM_APPROVE,
          resourceId: 'ver-1',
          metadata: { contentJobId: 'job-1', versionNumber: 1 },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const response = await commandCenter.handleCallback({
        updateId: 'up-13',
        profile: approverProfile,
        callbackData: 'ps:mocktokenstring123456789012345',
      });

      expect(executeApprove).toHaveBeenCalledWith({
        contentJobId: 'job-1',
        contentVersionId: 'ver-1',
        approverUserId: approverActor.internalUserId,
        approverRoles: approverActor.roles,
      });
      expect(response.messages[0]?.text).toContain('Version V1 Approved');
      expect(response.callbackNotice).toBe('Draft approved!');
    });

    it('displays previous versions on VIEW_PREVIOUS', async () => {
      consumeActionToken.mockResolvedValueOnce({
        disposition: 'VALID',
        token: {
          id: 'tok-5',
          telegramIdentityId: approverActor.identityId,
          action: TelegramAction.VIEW_PREVIOUS,
          resourceId: 'job-1',
          singleUse: false,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const response = await commandCenter.handleCallback({
        updateId: 'up-14',
        profile: approverProfile,
        callbackData: 'ps:mocktokenstring123456789012345',
      });

      expect(getPreviousVersions).toHaveBeenCalledWith(approverActor, 'job-1');
      expect(response.messages[0]?.text).toContain('Version History');
      expect(response.callbackNotice).toBe('Previous versions loaded.');
    });

    it('cancels active pending action on CANCEL_ACTION callback', async () => {
      findActivePendingInteraction.mockResolvedValueOnce({
        id: 'pi-cancel',
        contentJobId: 'job-1',
        contentVersionId: 'ver-1',
        action: 'EDIT',
      });

      consumeActionToken.mockResolvedValueOnce({
        disposition: 'VALID',
        token: {
          id: 'tok-6',
          telegramIdentityId: approverActor.identityId,
          action: TelegramAction.CANCEL_ACTION,
          resourceId: 'job-1',
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const response = await commandCenter.handleCallback({
        updateId: 'up-15',
        profile: approverProfile,
        callbackData: 'ps:mocktokenstring123456789012345',
      });

      expect(cancelPendingInteraction).toHaveBeenCalledWith('pi-cancel', expect.any(Date));
      expect(response.messages[0]?.text).toContain('Action cancelled.');
    });
  });

  describe('Telegram Creation Flow with Style Presets', () => {
    const creatorActor: TelegramActor = {
      identityId: 'ident-creator',
      internalUserId: 'user-creator',
      telegramUserId: '987654321',
      displayName: 'Creator Charlie',
      roles: [RoleCode.MARKETING_EDITOR],
    };

    const creatorProfile: TelegramUserProfile = {
      telegramUserId: '987654321',
      username: 'creator_charlie',
      displayName: 'Creator Charlie',
    };

    const sampleFragranceProduct = {
      schema_version: '1.0',
      source_system: 'manual',
      retrieved_at: new Date().toISOString(),
      source_updated_at: new Date().toISOString(),
      lifecycle_status: 'ACTIVE' as const,
      product: {
        sku: 'GEP-KING-EDP-100',
        product_name: 'Yes I Am The King',
        brand: 'Geparlys',
        category: 'fragrance',
        price: '48.00',
        currency: 'USD',
        stock_status: 'IN_STOCK' as const,
      },
    };

    const sampleFlow = {
      id: 'flow-123',
      telegramIdentityId: 'ident-creator',
      product: sampleFragranceProduct,
      status: 'SELECTING_PLATFORM' as const,
      contentType: 'SCENT_PYRAMID' as const,
      language: 'EN' as const,
      platform: 'FACEBOOK' as const,
      expiresAt: new Date(Date.now() + 600_000),
    };

    it('presents Step 5 of 6 with visual style presets upon selecting channel and format', async () => {
      resolveActor.mockResolvedValueOnce(creatorActor);
      consumeActionToken.mockResolvedValueOnce({
        disposition: 'VALID',
        token: {
          id: 'tok-platform',
          telegramIdentityId: creatorActor.identityId,
          action: TelegramAction.SELECT_PLATFORM,
          resourceId: 'flow-123',
          metadata: { value: 'FACEBOOK', format: 'FEED_SQUARE' },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      (mockRepository as unknown as Record<string, unknown>).updateFlowSelection = jest.fn(() =>
        Promise.resolve({
          ...sampleFlow,
          platform: 'FACEBOOK' as const,
          format: 'FEED_SQUARE',
          step: 5,
        }),
      );
      (mockRepository as unknown as Record<string, unknown>).findJobByFlowId = jest.fn(() =>
        Promise.resolve(null),
      );

      const response = await commandCenter.handleCallback({
        updateId: 'up-platform-1',
        profile: creatorProfile,
        callbackData: 'ps:mocktokenplatform1234567890',
      });

      expect(response.callbackNotice).toBe('Channel & format selected.');
      expect(response.messages[0]?.text).toContain('Step 5 of 6');
      expect(response.messages[0]?.text).toContain('Choose an art-direction visual style');
      expect(response.messages[0]?.action).toBe('EDIT_TEXT');
      // 5 style presets + 1 navigation row
      expect(response.messages[0]?.buttons?.length).toBe(6);
    });

    it('presents Step 6 of 6 review summary upon selecting style preset', async () => {
      resolveActor.mockResolvedValueOnce(creatorActor);
      consumeActionToken.mockResolvedValueOnce({
        disposition: 'VALID',
        token: {
          id: 'tok-style',
          telegramIdentityId: creatorActor.identityId,
          action: TelegramAction.SELECT_STYLE_PRESET,
          resourceId: 'flow-123',
          metadata: { value: 'NOCTURNE_OBSIDIAN' },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      (mockRepository as unknown as Record<string, unknown>).findFlowById = jest.fn(() =>
        Promise.resolve({
          ...sampleFlow,
          stylePreset: 'NOCTURNE_OBSIDIAN',
          step: 5,
        }),
      );
      (mockRepository as unknown as Record<string, unknown>).setFlowMetadata = jest.fn(() =>
        Promise.resolve(),
      );

      const response = await commandCenter.handleCallback({
        updateId: 'up-style-1',
        profile: creatorProfile,
        callbackData: 'ps:mocktokenstyle1234567890',
      });

      expect(response.callbackNotice).toBe('Visual style selected.');
      expect(response.messages[0]?.text).toContain('Step 6 of 6');
      expect(response.messages[0]?.text).toContain('Review & Confirm');
      expect(response.messages[0]?.action).toBe('EDIT_TEXT');
      // Generate button + navigation row
      expect(response.messages[0]?.buttons?.length).toBe(2);
      expect(response.messages[0]?.buttons?.[0]?.[0]?.text).toContain('Generate Poster');
    });

    it('enqueues generation and returns progress card upon confirming generation', async () => {
      resolveActor.mockResolvedValueOnce(creatorActor);
      consumeActionToken.mockResolvedValueOnce({
        disposition: 'VALID',
        token: {
          id: 'tok-confirm',
          telegramIdentityId: creatorActor.identityId,
          action: TelegramAction.CONFIRM_GENERATION,
          resourceId: 'flow-123',
          metadata: {},
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      (mockRepository as unknown as Record<string, unknown>).findFlowById = jest.fn(() =>
        Promise.resolve({
          ...sampleFlow,
          stylePreset: 'NOCTURNE_OBSIDIAN',
          step: 6,
        }),
      );
      (mockRepository as unknown as Record<string, unknown>).findJobByFlowId = jest.fn(() =>
        Promise.resolve(null),
      );
      const completeFlowMock = jest.fn(() => Promise.resolve());
      (mockRepository as unknown as Record<string, unknown>).completeFlow = completeFlowMock;

      const mockSnapshots = {
        execute: jest.fn(() => Promise.resolve({ id: 'snapshot-123' })),
      };
      const mockBrandRules = {
        findActive: jest.fn(() => Promise.resolve({ id: 'brand-1' })),
      };
      const mockCreateJob = {
        execute: jest.fn(() => Promise.resolve({ id: 'job-999' })),
      };
      const mockEnqueuer = {
        enqueue: jest.fn(() => Promise.resolve()),
      };

      const customCommandCenter = new TelegramCommandCenter(
        mockRepository,
        new PermissionService(),
        {} as never,
        {} as never,
        mockSnapshots as never,
        mockCreateJob as never,
        mockBrandRules as never,
        mockEnqueuer,
        mockTokens,
        policy,
        mockRequestEdit,
        mockRequestRegenerate,
        mockApprove,
        mockReject,
        mockReviewState,
        mockApprovalStatus,
      );

      const response = await customCommandCenter.handleCallback({
        updateId: 'up-confirm-1',
        profile: creatorProfile,
        callbackData: 'ps:mocktokenconfirm1234567890',
      });

      expect(mockCreateJob.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignContext: 'NOCTURNE_OBSIDIAN',
        }),
      );
      expect(completeFlowMock).toHaveBeenCalledWith('flow-123');
      expect(mockEnqueuer.enqueue).toHaveBeenCalledWith('job-999');

      expect(response.messages[0]?.text).toContain('Generating Poster & Copy');
      expect(response.messages[0]?.text).toContain('Preparing verified product facts');
      expect(response.messages[0]?.action).toBe('EDIT_TEXT');
      expect(response.callbackNotice).toBe('Generation started!');
    });

    it('navigates back to previous step when WIZARD_BACK is clicked', async () => {
      resolveActor.mockResolvedValueOnce(creatorActor);
      consumeActionToken.mockResolvedValueOnce({
        disposition: 'VALID',
        token: {
          id: 'tok-back',
          telegramIdentityId: creatorActor.identityId,
          action: TelegramAction.WIZARD_BACK,
          resourceId: 'flow-123',
          metadata: { toStep: 4 },
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      (mockRepository as unknown as Record<string, unknown>).findFlowById = jest.fn(() =>
        Promise.resolve({
          ...sampleFlow,
          step: 5,
        }),
      );
      (mockRepository as unknown as Record<string, unknown>).setFlowMetadata = jest.fn(() =>
        Promise.resolve(),
      );

      const response = await commandCenter.handleCallback({
        updateId: 'up-back-1',
        profile: creatorProfile,
        callbackData: 'ps:mocktokenback1234567890',
      });

      expect(response.callbackNotice).toBe('Previous step.');
      expect(response.messages[0]?.text).toContain('Step 4 of 6');
      expect(response.messages[0]?.action).toBe('EDIT_TEXT');
    });

    it('cancels wizard when WIZARD_CANCEL is clicked', async () => {
      resolveActor.mockResolvedValueOnce(creatorActor);
      consumeActionToken.mockResolvedValueOnce({
        disposition: 'VALID',
        token: {
          id: 'tok-cancel',
          telegramIdentityId: creatorActor.identityId,
          action: TelegramAction.WIZARD_CANCEL,
          resourceId: 'flow-123',
          metadata: {},
          singleUse: true,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      (mockRepository as unknown as Record<string, unknown>).completeFlow = jest.fn(() =>
        Promise.resolve(),
      );

      const response = await commandCenter.handleCallback({
        updateId: 'up-cancel-1',
        profile: creatorProfile,
        callbackData: 'ps:mocktokencancel1234567890',
      });

      expect(response.callbackNotice).toBe('Creation cancelled.');
      expect(response.messages[0]?.text).toContain('Creation Cancelled');
      expect(response.messages[0]?.action).toBe('EDIT_TEXT');
    });
  });
});
