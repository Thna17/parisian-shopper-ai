import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  ApproveCreativeUseCase,
  CREATIVE_APPROVAL_REPOSITORY,
  CREATIVE_JOB_REPOSITORY,
  CREATIVE_REVISION_REPOSITORY,
  GenerateCreativeUseCase,
  hashTelegramActionToken,
  TELEGRAM_WORKFLOW_REPOSITORY,
  TelegramAction,
  TelegramActionTokenService,
  VISUAL_ASSET_REPOSITORY,
  type CreativeApprovalRepository,
  type CreativeJobRepository,
  type CreativeRevisionRepository,
  type TelegramActionTokenRecord,
  type TelegramActor,
  type TelegramCallbackInput,
  type TelegramResponse,
  type TelegramWorkflowRepository,
  type VisualAssetRepository,
  type TelegramVisualCallbackHandler,
} from '@parisian-shopper/application';
import { APPLICATION_LOGGER, type ApplicationLogger, type OutboxWriter } from '@parisian-shopper/common';

import { buildConfirmVisualApprovalKeyboard } from '../keyboards/visual-review.keyboard.js';

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
  ) {}

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
        messages: [{ text: 'Access denied. This bot is restricted to authorized Parisian Shopper staff.' }],
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
    switch (token.action) {
      case TelegramAction.APPROVE_VISUAL:
        return this.handleApproveVisual(actor, token);
      case TelegramAction.CONFIRM_APPROVE_VISUAL:
        return this.handleConfirmApproveVisual(actor, token);
      case TelegramAction.REQUEST_VISUAL_EDIT:
        return this.handleRequestVisualEdit(actor, token);
      case TelegramAction.REGENERATE_VISUAL:
        return this.handleRegenerateVisual(actor, token);
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

    // Two-step confirmation: prompt reviewer with confirm & cancel buttons
    const expiresAt = new Date(Date.now() + 15 * 60 * 1_000);
    const [confirmToken, cancelToken] = await this.tokens.create(
      actor.identityId,
      [
        {
          action: TelegramAction.CONFIRM_APPROVE_VISUAL,
          resourceId: creativeJobId,
          metadata: { creativeJobId, visualAssetId, productName },
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
          text: `⚠️ *Confirm Approval for ${productName}?*\n\nAre you sure you want to approve this visual asset for production use?\n\n_Note: Approval is final and marks the creative approved in database._`,
          buttons: buildConfirmVisualApprovalKeyboard(confirmToken ?? '', cancelToken ?? ''),
        },
      ],
      callbackNotice: 'Confirmation required.',
    };
  }

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

    return {
      messages: [
        {
          text: `✅ *Visual Approved!*\n\nVisual asset for *${productName}* has been approved by ${actor.displayName} and marked *APPROVED* in database.\n\n_Strict zero-posting invariant: zero social auto-publishing._`,
        },
      ],
      callbackNotice: 'Visual approved!',
    };
  }

  private async handleRequestVisualEdit(
    actor: TelegramActor,
    token: TelegramActionTokenRecord,
  ): Promise<TelegramResponse> {
    const creativeJobId = (token.metadata?.creativeJobId as string | undefined) ?? token.resourceId;
    const visualAssetId = (token.metadata?.visualAssetId as string | undefined) ?? '';
    const productName = (token.metadata?.productName as string | undefined) ?? 'Product';

    const job = await this.jobRepo.findById(creativeJobId);
    if (job === null || job.status !== 'READY_FOR_REVIEW') {
      return {
        messages: [{ text: 'ℹ️ This visual cannot be edited in its current state.' }],
        callbackNotice: 'Cannot edit.',
      };
    }

    const revision = await this.revisionRepo.createRequest({
      creativeJobId,
      sourceVisualAssetId: visualAssetId,
      requestedByUserId: actor.internalUserId,
      type: 'EDIT_BACKGROUND',
      instruction: (token.metadata?.instruction as string | undefined) ?? 'Edit requested via Telegram visual review',
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
          text: `✏️ *Visual Revision Requested*\n\nRevision request #${revision.id.slice(0, 8)} created for *${productName}*.\n\nPlease reply with additional style instructions if needed.`,
        },
      ],
      callbackNotice: 'Awaiting edit instructions...',
    };
  }

  private async handleRegenerateVisual(
    actor: TelegramActor,
    token: TelegramActionTokenRecord,
  ): Promise<TelegramResponse> {
    const creativeJobId = (token.metadata?.creativeJobId as string | undefined) ?? token.resourceId;
    const visualAssetId = (token.metadata?.visualAssetId as string | undefined) ?? '';
    const productName = (token.metadata?.productName as string | undefined) ?? 'Product';

    const job = await this.jobRepo.findById(creativeJobId);
    if (job === null || job.status !== 'READY_FOR_REVIEW') {
      return {
        messages: [{ text: 'ℹ️ This visual cannot be regenerated in its current state.' }],
        callbackNotice: 'Cannot regenerate.',
      };
    }

    const revision = await this.revisionRepo.createRequest({
      creativeJobId,
      sourceVisualAssetId: visualAssetId,
      requestedByUserId: actor.internalUserId,
      type: 'REGENERATE_BACKGROUND',
    });

    await this.jobRepo.transitionStatus(creativeJobId, 'READY_FOR_REVIEW', 'REVISION_REQUESTED');

    await this.generateCreative.execute({
      contentVersionId: job.contentVersionId,
      requestedBy: actor.internalUserId,
      format: job.aspectRatio === '9:16' ? 'STORY_VERTICAL' : 'FEED_SQUARE',
    });

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
          text: `🔄 *Regenerating Visual*\n\nA fresh background is being generated for *${productName}*. You will be notified when the new card is ready.`,
        },
      ],
      callbackNotice: 'Regeneration started.',
    };
  }

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

    await this.approvalRepo.recordApproval({
      creativeJobId,
      visualAssetId,
      approverUserId: actor.internalUserId,
      decision: 'CREATIVE_REJECTED',
      comment: 'Rejected via Telegram visual review',
    });

    await this.jobRepo.transitionStatus(creativeJobId, 'READY_FOR_REVIEW', 'CREATIVE_REJECTED');

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
      messages: [
        {
          text: 'Action cancelled. Visual remains pending review.',
        },
      ],
      callbackNotice: 'Cancelled.',
    });
  }
}
