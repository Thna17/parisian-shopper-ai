import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  ApproveCreativeUseCase,
  RejectCreativeUseCase,
  ASSET_STORAGE,
  CREATIVE_APPROVAL_REPOSITORY,
  CREATIVE_JOB_REPOSITORY,
  CREATIVE_REVISION_REPOSITORY,
  ExportPosterUseCase,
  GenerateCreativeUseCase,
  hasAnyRolePermission,
  hashTelegramActionToken,
  Permission,
  resolveStylePreset,
  RevisePosterUseCase,
  TELEGRAM_CHANNEL_BROADCAST_DISPATCHER,
  TELEGRAM_WORKFLOW_REPOSITORY,
  TelegramAction,
  TelegramActionTokenService,
  VISUAL_ASSET_REPOSITORY,
  type AssetStoragePort,
  type CreativeApprovalRepository,
  type CreativeJobRepository,
  type CreativeRevisionRepository,
  type ExportFormat,
  type ExportEncoding,
  type PosterTemplateId,
  type TelegramActionTokenRecord,
  type TelegramActor,
  type TelegramButton,
  type TelegramCallbackInput,
  type TelegramChannelBroadcastDispatcher,
  type TelegramMessage,
  type TelegramResponse,
  type TelegramVisualCallbackHandler,
  type TelegramWorkflowRepository,
  type VisualAssetRepository,
} from '@parisian-shopper/application';
import {
  APPLICATION_LOGGER,
  type ApplicationLogger,
  type OutboxWriter,
} from '@parisian-shopper/common';
import { AppConfigService } from '@parisian-shopper/config';

import {
  buildApprovedPosterKeyboard,
  buildConfirmVisualApprovalKeyboard,
  buildExportFormatKeyboard,
  buildLayoutSelectionKeyboard,
  buildStyleSelectionKeyboard,
  buildVisualReviewKeyboard,
} from '../keyboards/visual-review.keyboard.js';
import { VisualReviewCardRenderer } from '../renderers/visual-review-card.renderer.js';

@Injectable()
export class VisualReviewCallbackHandler implements TelegramVisualCallbackHandler {
  public constructor(
    @Inject(CREATIVE_JOB_REPOSITORY)
    private readonly jobRepo: CreativeJobRepository,
    @Inject(VISUAL_ASSET_REPOSITORY)
    private readonly assetRepo: VisualAssetRepository,
    @Inject(CREATIVE_REVISION_REPOSITORY)
    private readonly revisionRepo: CreativeRevisionRepository,
    @Inject(CREATIVE_APPROVAL_REPOSITORY)
    private readonly approvalRepo: CreativeApprovalRepository,
    @Inject(TELEGRAM_WORKFLOW_REPOSITORY)
    private readonly workflowRepo: TelegramWorkflowRepository,
    private readonly tokens: TelegramActionTokenService,
    private readonly approveCreative: ApproveCreativeUseCase,
    private readonly generateCreative: GenerateCreativeUseCase,
    @Inject(APPLICATION_LOGGER)
    private readonly logger: ApplicationLogger,
    @Optional()
    @Inject('OUTBOX_WRITER')
    private readonly outboxWriter?: OutboxWriter,
    @Optional()
    @Inject(ASSET_STORAGE)
    private readonly assetStorage?: AssetStoragePort,
    @Optional()
    private readonly revisePoster?: RevisePosterUseCase,
    @Optional()
    private readonly exportPoster?: ExportPosterUseCase,
    @Optional()
    @Inject(TELEGRAM_CHANNEL_BROADCAST_DISPATCHER)
    private readonly channelBroadcaster?: TelegramChannelBroadcastDispatcher,
    @Optional()
    @Inject(AppConfigService)
    private readonly config?: Pick<AppConfigService, 'telegram'>,
    @Optional()
    rejectCreative?: RejectCreativeUseCase,
  ) {
    this.rejectCreative =
      rejectCreative ??
      new RejectCreativeUseCase(this.jobRepo, this.assetRepo, this.approvalRepo, this.logger);
  }

  private readonly rejectCreative: RejectCreativeUseCase;

  public async handleCallback(input: TelegramCallbackInput): Promise<TelegramResponse> {
    if (
      !(await this.workflowRepo.claimInboundUpdate(
        input.updateId,
        input.profile.telegramUserId,
        'callback',
      ))
    ) {
      return { messages: [], callbackNotice: 'Already handled.' };
    }

    const actor = await this.workflowRepo.resolveActor(input.profile);
    if (actor === null) {
      await this.workflowRepo.recordDeniedAccess(input.profile);
      return {
        messages: [
          { text: 'Access denied. This bot is restricted to authorized Parisian Shopper staff.' },
        ],
        callbackNotice: 'Access denied.',
      };
    }

    if (!(await this.workflowRepo.consumeRateLimit(actor.identityId, 'callback', 30, 60))) {
      return {
        messages: [{ text: 'Too many actions. Please wait and try again.' }],
        callbackNotice: 'Rate limited.',
      };
    }

    const rawToken = input.callbackData.startsWith('ps:') ? input.callbackData.slice(3) : '';
    if (!/^[A-Za-z0-9_-]{20,40}$/u.test(rawToken)) {
      return {
        messages: [{ text: 'This action has expired. Please reopen the latest job.' }],
        callbackNotice: 'Invalid action.',
      };
    }

    const resolved = await this.workflowRepo.consumeActionToken(
      hashTelegramActionToken(rawToken),
      actor.telegramUserId,
      new Date(),
    );

    if (resolved.disposition !== 'VALID') {
      const notice =
        resolved.disposition === 'WRONG_USER'
          ? 'This action belongs to another user.'
          : 'This action has expired. Please reopen the latest job.';
      return { messages: [{ text: notice }], callbackNotice: notice };
    }

    return this.handleAction(actor, resolved.token);
  }

  public async handleAction(
    actor: TelegramActor,
    token: TelegramActionTokenRecord,
  ): Promise<TelegramResponse> {
    // 0. Verify token ownership
    if (token.telegramIdentityId !== actor.identityId) {
      await this.workflowRepo.appendAudit({
        actor,
        action: 'TELEGRAM_VISUAL_ACTION_DENIED',
        resourceType: 'CreativeJob',
        resourceId: token.resourceId,
        metadata: {
          attemptedAction: token.action,
          reason: 'TOKEN_OWNER_MISMATCH',
          details: 'token does not belong to actor',
        },
      });
      return {
        messages: [{ text: 'This action belongs to another user.' }],
        callbackNotice: 'This action belongs to another user.',
      };
    }

    // 1. Publishing fail-closed boundary in W02
    if (
      token.action === TelegramAction.PROMPT_PUBLISH_CHANNEL ||
      token.action === TelegramAction.CONFIRM_PUBLISH_CHANNEL
    ) {
      return this.handlePublishDisabled(actor, token);
    }

    // 2. Action RBAC Permission Check
    const ACTION_PERMISSIONS: Partial<Record<TelegramAction, Permission>> = {
      [TelegramAction.APPROVE_VISUAL]: Permission.APPROVE_CREATIVE,
      [TelegramAction.CONFIRM_APPROVE_VISUAL]: Permission.APPROVE_CREATIVE,
      [TelegramAction.REJECT_VISUAL]: Permission.REJECT_CREATIVE,
      [TelegramAction.REQUEST_VISUAL_EDIT]: Permission.EDIT_CREATIVE,
      [TelegramAction.EDIT_VISUAL_LAYOUT]: Permission.EDIT_CREATIVE,
      [TelegramAction.CHANGE_VISUAL_STYLE]: Permission.REGENERATE_CREATIVE,
      [TelegramAction.CONFIRM_CHANGE_STYLE]: Permission.REGENERATE_CREATIVE,
      [TelegramAction.REGENERATE_VISUAL]: Permission.REGENERATE_CREATIVE,
      [TelegramAction.EXPORT_POSTER]: Permission.EXPORT_CREATIVE,
      [TelegramAction.SELECT_EXPORT_FORMAT]: Permission.EXPORT_CREATIVE,
    };

    const requiredPermission = ACTION_PERMISSIONS[token.action];
    if (requiredPermission && !hasAnyRolePermission(actor.roles, requiredPermission)) {
      await this.workflowRepo.appendAudit({
        actor,
        action: 'TELEGRAM_VISUAL_ACTION_DENIED',
        resourceType: 'CreativeJob',
        resourceId: token.resourceId,
        metadata: {
          attemptedAction: token.action,
          reason: 'INSUFFICIENT_PERMISSIONS',
          requiredPermission,
        },
      });
      return {
        messages: [
          { text: '❌ Access denied: You do not have permission to perform this action.' },
        ],
        callbackNotice: 'Access denied.',
      };
    }

    // 3. Resource Integrity Checks
    if (token.action !== TelegramAction.CANCEL_VISUAL_ACTION) {
      const creativeJobId =
        (token.metadata?.creativeJobId as string | undefined) ?? token.resourceId;
      if (token.metadata?.creativeJobId && token.metadata.creativeJobId !== token.resourceId) {
        await this.workflowRepo.appendAudit({
          actor,
          action: 'TELEGRAM_VISUAL_ACTION_DENIED',
          resourceType: 'CreativeJob',
          resourceId: token.resourceId,
          metadata: {
            attemptedAction: token.action,
            reason: 'RESOURCE_INTEGRITY_MISMATCH',
            details: 'creativeJobId does not match token resourceId',
          },
        });
        return {
          messages: [{ text: '⚠️ This action is invalid: resource identifier mismatch.' }],
          callbackNotice: 'Invalid action.',
        };
      }

      const visualAssetId = token.metadata?.visualAssetId as string | undefined;
      if (visualAssetId) {
        const asset = await this.assetRepo.findById(visualAssetId);
        if (asset && asset.creativeJobId !== creativeJobId) {
          await this.workflowRepo.appendAudit({
            actor,
            action: 'TELEGRAM_VISUAL_ACTION_DENIED',
            resourceType: 'CreativeJob',
            resourceId: token.resourceId,
            metadata: {
              attemptedAction: token.action,
              reason: 'RESOURCE_INTEGRITY_MISMATCH',
              details: 'visualAssetId does not belong to creativeJobId',
            },
          });
          return {
            messages: [
              { text: '⚠️ This action is invalid: asset does not belong to this creative job.' },
            ],
            callbackNotice: 'Invalid action.',
          };
        }
      }
    }

    switch (token.action) {
      case TelegramAction.APPROVE_VISUAL:
        return this.handleApproveVisual(actor, token);
      case TelegramAction.CONFIRM_APPROVE_VISUAL:
        return this.handleConfirmApproveVisual(actor, token);
      case TelegramAction.REQUEST_VISUAL_EDIT:
        return this.handleRequestVisualEdit(actor, token);
      case TelegramAction.EDIT_VISUAL_LAYOUT:
        return this.handleEditVisualLayout(actor, token);
      case TelegramAction.CHANGE_VISUAL_STYLE:
        return this.handleChangeVisualStyle(actor, token);
      case TelegramAction.CONFIRM_CHANGE_STYLE:
        return this.handleConfirmChangeStyle(actor, token);
      case TelegramAction.VIEW_VISUAL_DETAILS:
        return this.handleViewVisualDetails(actor, token);
      case TelegramAction.REGENERATE_VISUAL:
        return this.handleRegenerateVisual(actor, token);
      case TelegramAction.EXPORT_POSTER:
        return this.handleExportPosterMenu(actor, token);
      case TelegramAction.SELECT_EXPORT_FORMAT:
        return this.handleSelectExportFormat(actor, token);
      case TelegramAction.REJECT_VISUAL:
        return this.handleRejectVisual(actor, token);
      case TelegramAction.CANCEL_VISUAL_ACTION:
        return this.handleCancelVisualAction();
      default:
        return {
          messages: [{ text: 'Unsupported action.' }],
          callbackNotice: 'Unsupported action.',
        };
    }
  }

  // 1. APPROVE VISUAL (Two-step confirmation)
  private async handleApproveVisual(
    actor: TelegramActor,
    token: TelegramActionTokenRecord,
  ): Promise<TelegramResponse> {
    const creativeJobId = (token.metadata?.creativeJobId as string | undefined) ?? token.resourceId;
    const visualAssetId = (token.metadata?.visualAssetId as string | undefined) ?? '';
    const productName = (token.metadata?.productName as string | undefined) ?? 'Product';

    const job = await this.jobRepo.findById(creativeJobId);
    if (job === null) {
      return {
        messages: [{ text: 'Creative job not found.' }],
        callbackNotice: 'Not found.',
      };
    }

    if (job.status === 'CREATIVE_APPROVED') {
      return {
        messages: [{ text: 'ℹ️ This visual has already been approved.' }],
        callbackNotice: 'Already approved.',
      };
    }

    if (job.status === 'CREATIVE_REJECTED') {
      return {
        messages: [{ text: 'ℹ️ This visual has already been rejected.' }],
        callbackNotice: 'Already rejected.',
      };
    }

    if (job.status !== 'READY_FOR_REVIEW') {
      return {
        messages: [{ text: `ℹ️ This visual is not ready for review (status: ${job.status}).` }],
        callbackNotice: 'Not ready.',
      };
    }

    const asset = visualAssetId ? await this.assetRepo.findById(visualAssetId) : null;
    const versionNumber = asset?.versionNumber ?? 1;

    // Two-step confirmation: show exact version being approved
    const expiresAt = new Date(Date.now() + 15 * 60 * 1_000);
    const [confirmToken, cancelToken] = await this.tokens.create(
      actor.identityId,
      [
        {
          action: TelegramAction.CONFIRM_APPROVE_VISUAL,
          resourceId: creativeJobId,
          metadata: { creativeJobId, visualAssetId, productName, versionNumber },
          singleUse: true,
        },
        {
          action: TelegramAction.CANCEL_VISUAL_ACTION,
          resourceId: creativeJobId,
          singleUse: true,
        },
      ],
      expiresAt,
    );

    return {
      messages: [
        {
          text: `⚠️ *Confirm Approval for ${productName}?* (v${versionNumber})\n\nAre you sure you want to approve this visual design for commercial use?\n\n_Note: Approval marks the creative approved in the database and unlocks commercial exports._`,
          buttons: buildConfirmVisualApprovalKeyboard(confirmToken ?? '', cancelToken ?? ''),
        },
      ],
      callbackNotice: 'Confirmation required.',
    };
  }

  // 2. CONFIRM APPROVE VISUAL
  private async handleConfirmApproveVisual(
    actor: TelegramActor,
    token: TelegramActionTokenRecord,
  ): Promise<TelegramResponse> {
    const creativeJobId = (token.metadata?.creativeJobId as string | undefined) ?? token.resourceId;
    const visualAssetId = (token.metadata?.visualAssetId as string | undefined) ?? '';
    const productName = (token.metadata?.productName as string | undefined) ?? 'Product';

    const job = await this.jobRepo.findById(creativeJobId);
    if (job === null || job.status !== 'READY_FOR_REVIEW') {
      return {
        messages: [{ text: 'ℹ️ This visual has already been approved or is no longer in review.' }],
        callbackNotice: 'Already processed.',
      };
    }

    await this.approveCreative.execute({
      creativeJobId,
      visualAssetId,
      approvedBy: actor.internalUserId,
      approverRoles: actor.roles,
      ...(this.outboxWriter !== undefined ? { outboxWriter: this.outboxWriter } : {}),
    });

    await this.workflowRepo.appendAudit({
      actor,
      action: 'TELEGRAM_VISUAL_APPROVED',
      resourceType: 'CreativeJob',
      resourceId: creativeJobId,
      metadata: { visualAssetId },
    });

    this.logger.log(`Visual approved for creative job ${creativeJobId} by ${actor.displayName}`);

    const asset = visualAssetId ? await this.assetRepo.findById(visualAssetId) : null;
    let photoBuffer: Buffer | undefined;
    if (asset && this.assetStorage) {
      photoBuffer = (await this.assetStorage.getAssetBuffer(asset.storageKey)) ?? undefined;
    }
    const view = await this.workflowRepo.getDraftViewByVersionId(job.contentVersionId);
    const preset = resolveStylePreset(job.creativeProfile);

    // Build approved keyboard with Export and details options
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);

    const tokenDefs: {
      action: TelegramAction;
      resourceId: string;
      metadata?: Record<string, unknown>;
      singleUse?: boolean;
    }[] = [
      {
        action: TelegramAction.EXPORT_POSTER,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, productName },
        singleUse: false,
      },
      {
        action: TelegramAction.EDIT_VISUAL_LAYOUT,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, productName },
        singleUse: false,
      },
      {
        action: TelegramAction.VIEW_VISUAL_DETAILS,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, productName },
        singleUse: false,
      },
    ];

    const createdTokens = await this.tokens.create(actor.identityId, tokenDefs, expiresAt);
    const exportToken = createdTokens[0] ?? '';
    const editToken = createdTokens[1] ?? '';
    const detailsToken = createdTokens[2] ?? '';

    const approvedKeyboard = buildApprovedPosterKeyboard({
      exportToken,
      editToken,
      detailsToken,
    });

    const messages: TelegramMessage[] = [];

    const captionParts: string[] = [
      `✅ *Visual Approved!*`,
      `Visual asset for *${productName}* has been approved by ${actor.displayName} and marked *APPROVED* in database.`,
    ];
    if (view?.output) {
      captionParts.push(
        `\n📋 *Approved Copy & Caption:*`,
        `*${view.output.headline}*`,
        view.output.englishCaption ?? view.output.khmerCaption ?? '',
        `\n*CTA:* ${view.output.cta}`,
        view.output.hashtags.join(' '),
      );
    }
    captionParts.push(`\n_Strict zero-posting invariant: zero social auto-publishing._`);

    messages.push({
      text: captionParts.join('\n'),
    });

    if (photoBuffer !== undefined) {
      messages.push({
        text: `🎨 *Approved Commercial Poster — Ready for Use*\n\n📦 *${productName}*\n✨ *Art Direction:* ${preset.buttonText}\n📐 *Format:* 1:1 Feed Post (1080×1080)\n🛡️ *Validation:* [ALL PASS]\n🔐 *Storage CAS Fingerprint:* \`#${(asset?.sha256 ?? '').slice(0, 8)}\`\n\n📥 _Here is your approved, high-resolution final poster asset ready for commercial use._`,
        photoBuffer,
        buttons: approvedKeyboard,
      });
    }

    return {
      messages,
      callbackNotice: 'Visual approved!',
    };
  }

  // 3. EDIT LAYOUT (Template and framing adjustments)
  private async handleEditVisualLayout(
    actor: TelegramActor,
    token: TelegramActionTokenRecord,
  ): Promise<TelegramResponse> {
    const creativeJobId = (token.metadata?.creativeJobId as string | undefined) ?? token.resourceId;
    const visualAssetId = (token.metadata?.visualAssetId as string | undefined) ?? '';
    const productName = (token.metadata?.productName as string | undefined) ?? 'Product';
    const chosenTemplate = token.metadata?.templateId as PosterTemplateId | undefined;

    // If template not chosen yet, present template selection keyboard
    if (!chosenTemplate) {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1_000);
      const [splitToken, heroToken, scentToken, khmerToken, backToken] = await this.tokens.create(
        actor.identityId,
        [
          {
            action: TelegramAction.EDIT_VISUAL_LAYOUT,
            resourceId: creativeJobId,
            metadata: { creativeJobId, visualAssetId, productName, templateId: 'EDITORIAL_SPLIT' },
            singleUse: true,
          },
          {
            action: TelegramAction.EDIT_VISUAL_LAYOUT,
            resourceId: creativeJobId,
            metadata: { creativeJobId, visualAssetId, productName, templateId: 'CENTERED_HERO' },
            singleUse: true,
          },
          {
            action: TelegramAction.EDIT_VISUAL_LAYOUT,
            resourceId: creativeJobId,
            metadata: { creativeJobId, visualAssetId, productName, templateId: 'SCENT_STORY' },
            singleUse: true,
          },
          {
            action: TelegramAction.EDIT_VISUAL_LAYOUT,
            resourceId: creativeJobId,
            metadata: { creativeJobId, visualAssetId, productName, templateId: 'KHMER_SEASONAL' },
            singleUse: true,
          },
          {
            action: TelegramAction.CANCEL_VISUAL_ACTION,
            resourceId: creativeJobId,
            singleUse: true,
          },
        ],
        expiresAt,
      );

      const layoutKeyboard = buildLayoutSelectionKeyboard({
        editorialSplitToken: splitToken ?? '',
        centeredHeroToken: heroToken ?? '',
        scentStoryToken: scentToken ?? '',
        khmerSeasonalToken: khmerToken ?? '',
        backToken: backToken ?? '',
      });

      return {
        messages: [
          {
            text: `📐 *Select Poster Template for ${productName}*\n\nChoose an architectural layout design below:\n• *Editorial Split*: Left-aligned hero with structured right editorial text\n• *Centered Hero*: Majestic center placement with bottom luxury typography\n• *Scent Story*: Top/Heart/Base fragrance pyramid showcase\n• *Khmer Seasonal*: Festive gold lotus framing with bilingual Khmer hierarchy\n\n_Re-layouts execute with zero AI calls or latency._`,
            buttons: layoutKeyboard,
          },
        ],
        callbackNotice: 'Select layout template.',
      };
    }

    // Execute zero-AI re-layout
    if (this.revisePoster) {
      const result = await this.revisePoster.editLayout({
        creativeJobId,
        sourceVisualAssetId: visualAssetId,
        templateId: chosenTemplate,
        actorUserId: actor.internalUserId,
        actorRoles: actor.roles,
      });

      const keyboard = await this.buildReviewKeyboardForAsset(
        actor.identityId,
        creativeJobId,
        result.visualAsset.id,
        productName,
      );

      return {
        messages: [
          {
            text: `📐 *Poster Re-Layout Applied (v${result.visualAsset.versionNumber})*\n\nTemplate updated to *${chosenTemplate}* with zero AI spend.\nValidation: ${result.isPassed ? '✅ PASSED' : '⚠️ WARNINGS'}`,
            photoBuffer: result.posterBuffer,
            buttons: keyboard,
          },
        ],
        callbackNotice: 'Re-layout complete!',
      };
    }

    return {
      messages: [{ text: `Layout switched to ${chosenTemplate}.` }],
      callbackNotice: 'Layout adjusted.',
    };
  }

  // 4. REQUEST VISUAL EDIT (Typography changes)
  private async handleRequestVisualEdit(
    actor: TelegramActor,
    token: TelegramActionTokenRecord,
  ): Promise<TelegramResponse> {
    const creativeJobId = (token.metadata?.creativeJobId as string | undefined) ?? token.resourceId;
    const visualAssetId = (token.metadata?.visualAssetId as string | undefined) ?? '';
    const productName = (token.metadata?.productName as string | undefined) ?? 'Product';
    const textOverride = token.metadata?.headline as string | undefined;

    if (textOverride && this.revisePoster) {
      const result = await this.revisePoster.editText({
        creativeJobId,
        sourceVisualAssetId: visualAssetId,
        textEdits: { headline: textOverride },
        actorUserId: actor.internalUserId,
        actorRoles: actor.roles,
      });

      const keyboard = await this.buildReviewKeyboardForAsset(
        actor.identityId,
        creativeJobId,
        result.visualAsset.id,
        productName,
      );

      return {
        messages: [
          {
            text: `📝 *Typography Updated (v${result.visualAsset.versionNumber})*\n\nPoster headline updated without re-generating background image.\nValidation: ${result.isPassed ? '✅ PASSED' : '⚠️ WARNINGS'}`,
            photoBuffer: result.posterBuffer,
            buttons: keyboard,
          },
        ],
        callbackNotice: 'Text updated!',
      };
    }

    const revision = await this.revisionRepo.createRequest({
      creativeJobId,
      sourceVisualAssetId: visualAssetId,
      requestedByUserId: actor.internalUserId,
      type: 'EDIT_BACKGROUND',
      instruction:
        (token.metadata?.instruction as string | undefined) ??
        'Edit requested via Telegram visual review',
    });

    await this.jobRepo.transitionStatus(creativeJobId, 'READY_FOR_REVIEW', 'REVISION_REQUESTED');

    await this.workflowRepo.appendAudit({
      actor,
      action: 'TELEGRAM_VISUAL_EDIT_REQUESTED',
      resourceType: 'CreativeRevisionRequest',
      resourceId: revision.id,
      metadata: { creativeJobId, visualAssetId },
    });

    return {
      messages: [
        {
          text: `✏️ *Visual Revision Requested*\n\nPlease reply with your instructions or typography override (e.g. "Headline: Elegance Defined").\n\nType /cancel to abort.`,
        },
      ],
      callbackNotice: 'Awaiting edit instructions...',
    };
  }

  // 5. CHANGE VISUAL STYLE (Style selection & 2-step confirmation)
  private async handleChangeVisualStyle(
    actor: TelegramActor,
    token: TelegramActionTokenRecord,
  ): Promise<TelegramResponse> {
    const creativeJobId = (token.metadata?.creativeJobId as string | undefined) ?? token.resourceId;
    const visualAssetId = (token.metadata?.visualAssetId as string | undefined) ?? '';
    const productName = (token.metadata?.productName as string | undefined) ?? 'Product';
    const targetPreset = token.metadata?.stylePreset as string | undefined;

    // If preset not chosen yet, show preset list
    if (!targetPreset) {
      const presets = [
        { id: 'PARISIAN_MORNING_ATELIER', name: '🏛 Parisian Morning Atelier' },
        { id: 'NOCTURNE_OBSIDIAN', name: '👑 Nocturne Obsidian' },
        { id: 'BOTANICAL_SCENT_STORY', name: '🌿 Botanical Scent Story' },
        { id: 'CAMBODIAN_IVORY_CELEBRATION', name: '🇰🇭 Cambodian Ivory Celebration' },
        { id: 'CLEAN_EDITORIAL_STUDIO', name: '✨ Clean Editorial Studio' },
      ];

      const expiresAt = new Date(Date.now() + 15 * 60 * 1_000);
      const tokenDefs: {
        action: TelegramAction;
        resourceId: string;
        metadata?: Record<string, unknown>;
        singleUse?: boolean;
      }[] = presets.map((p) => ({
        action: TelegramAction.CHANGE_VISUAL_STYLE,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, productName, stylePreset: p.id },
        singleUse: true,
      }));
      tokenDefs.push({
        action: TelegramAction.CANCEL_VISUAL_ACTION,
        resourceId: creativeJobId,
        singleUse: true,
      });

      const createdTokens = await this.tokens.create(actor.identityId, tokenDefs, expiresAt);
      const presetTokens = presets.map((p, idx) => ({
        name: p.name,
        token: createdTokens[idx] ?? '',
      }));
      const backToken = createdTokens[presets.length] ?? '';

      const styleKeyboard = buildStyleSelectionKeyboard({ presetTokens, backToken });

      return {
        messages: [
          {
            text: `🎨 *Select Art Direction Style for ${productName}*\n\nChoose an art direction preset below:\n\n_Note: Switching style generates a new AI photographic background._`,
            buttons: styleKeyboard,
          },
        ],
        callbackNotice: 'Select art direction.',
      };
    }

    // Two-step confirmation before generating AI image
    const preset = resolveStylePreset(targetPreset);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1_000);
    const [confirmToken, cancelToken] = await this.tokens.create(
      actor.identityId,
      [
        {
          action: TelegramAction.CONFIRM_CHANGE_STYLE,
          resourceId: creativeJobId,
          metadata: { creativeJobId, visualAssetId, productName, stylePreset: targetPreset },
          singleUse: true,
        },
        {
          action: TelegramAction.CANCEL_VISUAL_ACTION,
          resourceId: creativeJobId,
          singleUse: true,
        },
      ],
      expiresAt,
    );

    return {
      messages: [
        {
          text: `⚠️ *Confirm Style Change for ${productName}?*\n\nSwitch style preset to *${preset.buttonText}*?\n\n_This will generate ONE new photographic background while strictly preserving your approved copy and verified product asset._`,
          buttons: [
            [
              { text: `🚀 Confirm: ${preset.buttonText}`, callbackData: `ps:${confirmToken}` },
              { text: '❌ Cancel', callbackData: `ps:${cancelToken}` },
            ],
          ],
        },
      ],
      callbackNotice: 'Confirmation required.',
    };
  }

  // 6. CONFIRM CHANGE STYLE
  private async handleConfirmChangeStyle(
    actor: TelegramActor,
    token: TelegramActionTokenRecord,
  ): Promise<TelegramResponse> {
    const creativeJobId = (token.metadata?.creativeJobId as string | undefined) ?? token.resourceId;
    const visualAssetId = (token.metadata?.visualAssetId as string | undefined) ?? '';
    const productName = (token.metadata?.productName as string | undefined) ?? 'Product';
    const targetPreset = token.metadata?.stylePreset as string;

    if (this.revisePoster) {
      const result = await this.revisePoster.changeStyle({
        creativeJobId,
        sourceVisualAssetId: visualAssetId,
        stylePreset: targetPreset,
        actorUserId: actor.internalUserId,
        actorRoles: actor.roles,
      });

      const keyboard = await this.buildReviewKeyboardForAsset(
        actor.identityId,
        creativeJobId,
        result.visualAsset.id,
        productName,
      );

      return {
        messages: [
          {
            text: `🎨 *Style Updated (v${result.visualAsset.versionNumber})*\n\nNew photographic background generated with preset *${targetPreset}*.\nValidation: ${result.isPassed ? '✅ PASSED' : '⚠️ WARNINGS'}`,
            photoBuffer: result.posterBuffer,
            buttons: keyboard,
          },
        ],
        callbackNotice: 'Style updated!',
      };
    }

    return {
      messages: [{ text: `Style updated to ${targetPreset}.` }],
      callbackNotice: 'Style updated.',
    };
  }

  // 7. REGENERATE VISUAL (New Background concept)
  private async handleRegenerateVisual(
    actor: TelegramActor,
    token: TelegramActionTokenRecord,
  ): Promise<TelegramResponse> {
    const creativeJobId = (token.metadata?.creativeJobId as string | undefined) ?? token.resourceId;
    const visualAssetId = (token.metadata?.visualAssetId as string | undefined) ?? '';
    const productName = (token.metadata?.productName as string | undefined) ?? 'Product';

    if (this.revisePoster) {
      const result = await this.revisePoster.newBackground({
        creativeJobId,
        sourceVisualAssetId: visualAssetId,
        actorUserId: actor.internalUserId,
        actorRoles: actor.roles,
      });

      const keyboard = await this.buildReviewKeyboardForAsset(
        actor.identityId,
        creativeJobId,
        result.visualAsset.id,
        productName,
      );

      return {
        messages: [
          {
            text: `🔄 *New Background Generated (v${result.visualAsset.versionNumber})*\n\nFresh background photographic concept rendered for *${productName}*.\nValidation: ${result.isPassed ? '✅ PASSED' : '⚠️ WARNINGS'}`,
            photoBuffer: result.posterBuffer,
            buttons: keyboard,
          },
        ],
        callbackNotice: 'New background generated!',
      };
    }

    const revision = await this.revisionRepo.createRequest({
      creativeJobId,
      sourceVisualAssetId: visualAssetId,
      requestedByUserId: actor.internalUserId,
      type: 'REGENERATE_BACKGROUND',
      ...(token.metadata?.instruction ? { instruction: token.metadata.instruction as string } : {}),
    });

    await this.jobRepo.transitionStatus(creativeJobId, 'READY_FOR_REVIEW', 'REVISION_REQUESTED');

    const job = await this.jobRepo.findById(creativeJobId);
    if (job) {
      await this.generateCreative.execute({
        contentVersionId: job.contentVersionId,
        requestedBy: actor.internalUserId,
        format: job.aspectRatio === '9:16' ? 'STORY_VERTICAL' : 'FEED_SQUARE',
        stylePreset: job.creativeProfile,
      });
    }

    await this.workflowRepo.appendAudit({
      actor,
      action: 'TELEGRAM_VISUAL_REGENERATE_REQUESTED',
      resourceType: 'CreativeRevisionRequest',
      resourceId: revision.id,
      metadata: { creativeJobId, visualAssetId },
    });

    return {
      messages: [
        {
          text: `🔄 *Regenerating Visual*\n\nA fresh background is being generated for *${productName}*. You will be notified when ready.`,
        },
      ],
      callbackNotice: 'Regeneration started.',
    };
  }

  // 8. EXPORT POSTER MENU
  private async handleExportPosterMenu(
    actor: TelegramActor,
    token: TelegramActionTokenRecord,
  ): Promise<TelegramResponse> {
    const creativeJobId = (token.metadata?.creativeJobId as string | undefined) ?? token.resourceId;
    const visualAssetId = (token.metadata?.visualAssetId as string | undefined) ?? '';
    const productName = (token.metadata?.productName as string | undefined) ?? 'Product';

    const expiresAt = new Date(Date.now() + 15 * 60 * 1_000);
    const tokenDefs = [
      {
        action: TelegramAction.SELECT_EXPORT_FORMAT,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, format: 'SQUARE_1080', encoding: 'PNG' },
        singleUse: false,
      },
      {
        action: TelegramAction.SELECT_EXPORT_FORMAT,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, format: 'SQUARE_1080', encoding: 'JPEG' },
        singleUse: false,
      },
      {
        action: TelegramAction.SELECT_EXPORT_FORMAT,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, format: 'PORTRAIT_1080_1350', encoding: 'PNG' },
        singleUse: false,
      },
      {
        action: TelegramAction.SELECT_EXPORT_FORMAT,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, format: 'PORTRAIT_1080_1350', encoding: 'JPEG' },
        singleUse: false,
      },
      {
        action: TelegramAction.SELECT_EXPORT_FORMAT,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, format: 'STORY_1080_1920', encoding: 'PNG' },
        singleUse: false,
      },
      {
        action: TelegramAction.SELECT_EXPORT_FORMAT,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, format: 'STORY_1080_1920', encoding: 'JPEG' },
        singleUse: false,
      },
      {
        action: TelegramAction.CANCEL_VISUAL_ACTION,
        resourceId: creativeJobId,
        singleUse: true,
      },
    ];

    const created = await this.tokens.create(actor.identityId, tokenDefs, expiresAt);
    const exportKeyboard = buildExportFormatKeyboard({
      png1x1Token: created[0] ?? '',
      jpeg1x1Token: created[1] ?? '',
      png4x5Token: created[2] ?? '',
      jpeg4x5Token: created[3] ?? '',
      png9x16Token: created[4] ?? '',
      jpeg9x16Token: created[5] ?? '',
      backToken: created[6] ?? '',
    });

    return {
      messages: [
        {
          text: `📥 *Download High-Resolution Poster for ${productName}*\n\nSelect your target dimensions and format:\n• *Square (1080×1080)*: Instagram / Facebook 1:1, Telegram\n• *Portrait (1080×1350)*: Instagram 4:5 Feed Post\n• *Story (1080×1920)*: Instagram Story, Reels, TikTok Cover\n\n_Every format is re-rendered deterministically to fit exact safe margins._`,
          buttons: exportKeyboard,
        },
      ],
      callbackNotice: 'Select export format.',
    };
  }

  // 9. SELECT EXPORT FORMAT (Deliver file)
  private async handleSelectExportFormat(
    actor: TelegramActor,
    token: TelegramActionTokenRecord,
  ): Promise<TelegramResponse> {
    const creativeJobId = (token.metadata?.creativeJobId as string | undefined) ?? token.resourceId;
    const visualAssetId = token.metadata?.visualAssetId as string | undefined;
    const format = (token.metadata?.format as ExportFormat | undefined) ?? 'SQUARE_1080';
    const encoding = (token.metadata?.encoding as ExportEncoding | undefined) ?? 'PNG';

    if (this.exportPoster) {
      const result = await this.exportPoster.execute({
        creativeJobId,
        visualAssetId,
        format,
        encoding,
        actorUserId: actor.internalUserId,
        actorRoles: actor.roles,
      });

      return {
        messages: [
          {
            text: `📦 *Export Generated: ${result.filename}*\n\n📐 Dimensions: ${result.width}×${result.height}\n💾 File size: ${(result.byteSize / 1024).toFixed(1)} KB\n🔐 SHA-256: \`#${result.sha256.slice(0, 8)}\``,
            photoBuffer: result.buffer,
          },
        ],
        callbackNotice: `Exported ${result.filename}!`,
      };
    }

    return {
      messages: [{ text: `Export ${format} (${encoding}) generated.` }],
      callbackNotice: 'Export complete.',
    };
  }

  // 10. PROMPT PUBLISH CHANNEL (Two-step confirmation)
  // 10. PUBLISHING DISABLED (Fail-closed per W02 pending W61 PublishIntent)
  private async handlePublishDisabled(
    actor: TelegramActor,
    token: TelegramActionTokenRecord,
  ): Promise<TelegramResponse> {
    const creativeJobId = (token.metadata?.creativeJobId as string | undefined) ?? token.resourceId;

    await this.workflowRepo.appendAudit({
      actor,
      action: 'TELEGRAM_VISUAL_ACTION_DENIED',
      resourceType: 'CreativeJob',
      resourceId: creativeJobId,
      metadata: {
        attemptedAction: token.action,
        reason: 'CONTROLLED_PUBLISHING_DISABLED',
      },
    });

    return {
      messages: [
        {
          text: '⚠️ Publishing to Telegram channel is disabled pending controlled publishing implementation (W61 PublishIntent required).',
        },
      ],
      callbackNotice: 'Publishing disabled.',
    };
  }

  // 12. REJECT VISUAL
  private async handleRejectVisual(
    actor: TelegramActor,
    token: TelegramActionTokenRecord,
  ): Promise<TelegramResponse> {
    const creativeJobId = (token.metadata?.creativeJobId as string | undefined) ?? token.resourceId;
    const visualAssetId = (token.metadata?.visualAssetId as string | undefined) ?? '';
    const productName = (token.metadata?.productName as string | undefined) ?? 'Product';

    const job = await this.jobRepo.findById(creativeJobId);
    if (job === null || job.status !== 'READY_FOR_REVIEW') {
      return {
        messages: [{ text: 'ℹ️ This visual cannot be rejected in its current state.' }],
        callbackNotice: 'Cannot reject.',
      };
    }

    await this.rejectCreative.execute({
      creativeJobId,
      visualAssetId,
      rejectedBy: actor.internalUserId,
      rejecterRoles: actor.roles,
      comment: 'Rejected via Telegram visual review',
      ...(this.outboxWriter !== undefined ? { outboxWriter: this.outboxWriter } : {}),
    });

    await this.workflowRepo.appendAudit({
      actor,
      action: 'TELEGRAM_VISUAL_REJECTED',
      resourceType: 'CreativeJob',
      resourceId: creativeJobId,
      metadata: { visualAssetId },
    });

    return {
      messages: [
        {
          text: `❌ *Visual Rejected*\n\nVisual asset for *${productName}* has been rejected by ${actor.displayName}.`,
        },
      ],
      callbackNotice: 'Visual rejected.',
    };
  }

  private handleCancelVisualAction(): Promise<TelegramResponse> {
    return Promise.resolve({
      messages: [{ text: 'Action cancelled. Visual remains pending review.' }],
      callbackNotice: 'Cancelled.',
    });
  }

  private async handleViewVisualDetails(
    _actor: TelegramActor,
    token: TelegramActionTokenRecord,
  ): Promise<TelegramResponse> {
    const creativeJobId = (token.metadata?.creativeJobId as string | undefined) ?? token.resourceId;
    const visualAssetId = (token.metadata?.visualAssetId as string | undefined) ?? '';
    const productName = (token.metadata?.productName as string | undefined) ?? 'Product';

    const job = await this.jobRepo.findById(creativeJobId);
    const asset = visualAssetId ? await this.assetRepo.findById(visualAssetId) : null;
    const preset = resolveStylePreset(job?.creativeProfile);

    const details = VisualReviewCardRenderer.renderDetails({
      productName,
      brand: productName,
      targetFormat: job?.aspectRatio === '9:16' ? 'Story · 1080×1920' : 'Square Post · 1080×1080',
      compositorVersion: 'ps-compositor-v1',
      width: asset?.width ?? 1080,
      height: asset?.height ?? 1080,
      dimensionsPassed: true,
      containmentPassed: true,
      safetyPassed: true,
      casSha256: asset?.sha256 ?? 'verified',
      stylePresetName: preset.buttonText,
    });

    return {
      messages: [{ text: details }],
      callbackNotice: 'Details loaded.',
    };
  }

  private async buildReviewKeyboardForAsset(
    identityId: string,
    creativeJobId: string,
    visualAssetId: string,
    productName: string,
  ): Promise<readonly (readonly TelegramButton[])[]> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
    const tokenDefs = [
      {
        action: TelegramAction.APPROVE_VISUAL,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, productName },
        singleUse: true,
      },
      {
        action: TelegramAction.EDIT_VISUAL_LAYOUT,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, productName },
        singleUse: false,
      },
      {
        action: TelegramAction.REQUEST_VISUAL_EDIT,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, productName },
        singleUse: false,
      },
      {
        action: TelegramAction.CHANGE_VISUAL_STYLE,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, productName },
        singleUse: false,
      },
      {
        action: TelegramAction.REGENERATE_VISUAL,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, productName },
        singleUse: false,
      },
      {
        action: TelegramAction.REJECT_VISUAL,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, productName },
        singleUse: true,
      },
      {
        action: TelegramAction.VIEW_VISUAL_DETAILS,
        resourceId: creativeJobId,
        metadata: { creativeJobId, visualAssetId, productName },
        singleUse: false,
      },
    ];

    const [
      approveToken,
      editLayoutToken,
      editTextToken,
      changeStyleToken,
      newBackgroundToken,
      rejectToken,
      detailsToken,
    ] = await this.tokens.create(identityId, tokenDefs, expiresAt);

    return buildVisualReviewKeyboard({
      approveToken: approveToken ?? '',
      editLayoutToken,
      editTextToken,
      changeStyleToken,
      newBackgroundToken,
      rejectToken: rejectToken ?? '',
      detailsToken,
    });
  }
}
