import { randomUUID } from 'node:crypto';
import { splitTelegramMessage } from './telegram-formatters.js';
import { PostGenerationCommands } from '../../posts/post-generation.commands.js';
import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@parisian-shopper/config';
import { ConflictError, ValidationError } from '@parisian-shopper/common';
import { resolvePermissionsForRoles } from '../../auth/domain/permissions.js';
import { PostWorkflowService } from '../../posts/post-workflow.service.js';
import { readPostCreationPlan } from '../../posts/post-creation-plan.js';
import type { PostActor } from '../../posts/post-policy.js';
import type { PostWorkflowView, SavePostInput } from '../../posts/post-workflow.port.js';
import {
  TelegramAction,
  type TelegramActor,
  type TelegramResponse,
  type TelegramButton,
} from '../domain/telegram.js';
import type { CreateTelegramActionInput } from './telegram-action-token.service.js';
import { TelegramActionTokenService } from './telegram-action-token.service.js';
import {
  TELEGRAM_WORKFLOW_REPOSITORY,
  type TelegramWorkflowRepository,
} from './telegram-workflow.repository.js';

export function postActor(actor: TelegramActor): PostActor {
  return { id: actor.internalUserId, permissions: resolvePermissionsForRoles(actor.roles) };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** Telegram is a projection/command adapter; it never owns a second copy of a Post. */
@Injectable()
export class TelegramPostWorkflow {
  constructor(
    private readonly posts: PostWorkflowService,
    private readonly tokens: TelegramActionTokenService,
    @Inject(TELEGRAM_WORKFLOW_REPOSITORY) private readonly identities: TelegramWorkflowRepository,
    private readonly config: AppConfigService,
    private readonly generations: PostGenerationCommands,
  ) {}
  /** Durable, identity-bound prompts. No feedback path calls a paid provider. */
  async handleText(actor: TelegramActor, text: string): Promise<TelegramResponse | null> {
    const now = new Date();
    const pending = await this.identities.findPostInteraction?.(actor.identityId, now);
    if (!pending) return null;
    if (text.startsWith('/') && !['/cancel', '/resume'].includes(text.trim().toLowerCase()))
      return null;
    if (pending.actorUserId !== actor.internalUserId)
      throw new ConflictError({
        publicMessage: 'This prompt belongs to another staff member. Open your post again.',
      });
    const post = await this.posts.get(pending.postId, postActor(actor));
    if (text.trim().toLowerCase() === '/resume' && pending.intendedAction === 'PROPOSAL')
      return {
        messages: [
          {
            text: `Saved proposal: ${String(pending.payload.category)}. ${String(pending.payload.feedback)}\nNothing has been regenerated. Continue /post ${post.id} or /cancel.`,
          },
        ],
      };
    if (text.trim().toLowerCase() === '/resume')
      return {
        messages: [
          {
            text: `Continue revision ${pending.expectedRevision}: ${pending.intendedAction === 'CAPTION_FIELD' ? 'send the new ' + pending.field : 'describe the change you want'}. /cancel stops this prompt.`,
          },
        ],
      };
    const token = randomUUID();
    if (!(await this.identities.claimPostInteraction?.(pending.id, actor.identityId, token, now)))
      return {
        messages: [{ text: 'This reply is already being handled. Refresh the post shortly.' }],
      };
    try {
      if (text.trim().toLowerCase() === '/cancel') {
        await this.identities.finishPostInteraction?.(pending.id, token, now);
        return { messages: [{ text: 'Change cancelled. No generation started.' }] };
      }
      if (
        post.currentRevision.id !== pending.postRevisionId ||
        post.revisionNumber !== pending.expectedRevision ||
        post.reviewRound !== pending.reviewRound
      ) {
        await this.identities.finishPostInteraction?.(pending.id, token, now);
        throw new ConflictError({
          publicMessage: `This post changed. Open /post ${post.id} and start the edit again. Your reply was not applied.`,
        });
      }
      const value = text.trim();
      if (!value || value.length > 4000)
        throw new ValidationError({
          publicMessage: 'Send between 1 and 4,000 characters, or /cancel.',
        });
      if (pending.intendedAction === 'REQUEST_CHANGES') {
        if (value.length > 1000)
          throw new ValidationError({
            publicMessage: 'Keep reviewer feedback to 1,000 characters or fewer.',
          });
        await this.posts.decide(
          post.id,
          {
            expectedRevision: pending.expectedRevision,
            expectedReviewRound: pending.reviewRound,
            action: 'REQUEST_CHANGES',
            comment: value,
          },
          postActor(actor),
        );
      } else if (pending.intendedAction === 'CAPTION_FIELD') {
        if (!post.canEdit || post.creatorUserId !== actor.internalUserId || !post.caption)
          throw new ConflictError({
            publicMessage:
              'Only the creator can edit a saved caption. Ask the creator to update this post.',
          });
        const allowed = ['headline', 'english_caption', 'khmer_caption', 'cta'];
        if (!pending.field || !allowed.includes(pending.field))
          throw new ValidationError({ publicMessage: 'Choose a caption field again.' });
        const r = post.currentRevision;
        await this.posts.revise(
          post.id,
          pending.expectedRevision,
          {
            productSnapshotId: r.productSnapshotId,
            brief: r.brief,
            channel: r.channel as SavePostInput['channel'],
            language: r.language as SavePostInput['language'],
            campaignId: r.campaignId,
            creationPlan: readPostCreationPlan(r.creationPlan),
            captionDraft: { ...post.caption, [pending.field]: value },
            // Text printed on an old poster may no longer match. Prepare a new poster before review.
            captionVersionId: null,
            posterVersionId: null,
            visualAssetId: null,
            generationId: null,
          },
          postActor(actor),
        );
      } else {
        const category = classifyPostFeedback(value);
        await this.identities.createPostInteraction?.({
          telegramIdentityId: actor.identityId,
          postId: post.id,
          postRevisionId: post.currentRevision.id,
          expectedRevision: post.revisionNumber,
          reviewRound: post.reviewRound,
          intendedAction: 'PROPOSAL',
          payload: { category, feedback: value },
          expiresAt: new Date(now.getTime() + 15 * 60000),
        });
        await this.identities.finishPostInteraction?.(pending.id, token, now);
        return {
          messages: [
            {
              text: `Proposed change: ${category}.\n${value}\n\nNothing has been regenerated or charged. For caption edits, open the post and choose a caption field. For a layout change or new image, continue in the web, review the proposed settings and cost, then confirm separately. /post ${post.id}\n/cancel dismisses this proposal.`,
            },
          ],
        };
      }
      await this.identities.finishPostInteraction?.(pending.id, token, now);
      return this.render(actor, await this.posts.get(post.id, postActor(actor)));
    } catch (error) {
      await this.identities.releasePostInteraction?.(pending.id, token);
      throw error;
    }
  }
  private async prompt(
    actor: TelegramActor,
    post: PostWorkflowView,
    intendedAction: 'CAPTION_FIELD' | 'FEEDBACK' | 'REQUEST_CHANGES',
    field?: string,
  ): Promise<TelegramResponse> {
    if (!this.identities.createPostInteraction)
      throw new ConflictError({
        publicMessage: 'Saved Telegram edits are not configured. Continue in the web.',
      });
    await this.identities.createPostInteraction({
      telegramIdentityId: actor.identityId,
      postId: post.id,
      postRevisionId: post.currentRevision.id,
      expectedRevision: post.revisionNumber,
      reviewRound: post.reviewRound,
      intendedAction,
      ...(field ? { field } : {}),
      expiresAt: new Date(Date.now() + 15 * 60000),
    });
    return {
      messages: [
        {
          text: `Revision ${post.revisionNumber}: ${intendedAction === 'CAPTION_FIELD' ? 'send the new ' + field : intendedAction === 'REQUEST_CHANGES' ? 'tell the creator what needs changing' : 'describe what you want to change'}. This prompt expires in 15 minutes. /resume reminds you; /cancel stops it. Feedback alone never starts paid generation.`,
        },
      ],
    };
  }
  async create(actor: TelegramActor, input: SavePostInput): Promise<TelegramResponse> {
    const post = await this.posts.create(input, postActor(actor));
    return this.render(actor, post);
  }
  async command(actor: TelegramActor, name: string, argument: string): Promise<TelegramResponse> {
    if (name === 'posts') {
      const scope =
        argument === 'reviews' ? 'reviews' : argument === 'approved' ? 'approved' : 'mine';
      const result = await this.posts.list(postActor(actor), 1, scope);
      return {
        messages: [
          {
            text: result.items.length
              ? 'Complete posts\n' +
                result.items
                  .map(
                    (p) =>
                      `${p.productName ?? 'Product'} · ${p.status} · revision ${p.revisionNumber}\n/post ${p.id}`,
                  )
                  .join('\n\n')
              : 'No complete posts here yet. Use /create SKU to start. Legacy caption jobs remain available through /status and /history.',
          },
        ],
      };
    }
    const [id, revision, round, ...reason] = argument.trim().split(/\s+/u);
    if (!id || !uuid.test(id))
      throw new ValidationError({
        publicMessage: 'Use /post followed by the complete Post ID, or /posts to find it.',
      });
    if (name === 'postprepare') {
      const expectedRevision = Number(revision);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
        throw new ValidationError({
          publicMessage: 'Use /postprepare POST_ID REVISION. Confirm any spending in the web.',
        });
      await this.generations.prepare(id, expectedRevision, postActor(actor));
    }
    if (name === 'postchanges') {
      const expectedRevision = Number(revision),
        expectedReviewRound = Number(round);
      if (
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 1 ||
        !Number.isSafeInteger(expectedReviewRound) ||
        expectedReviewRound < 0
      )
        throw new ValidationError({
          publicMessage: 'Use /postchanges POST_ID REVISION REVIEW_ROUND Your feedback.',
        });
      await this.posts.decide(
        id,
        {
          expectedRevision,
          expectedReviewRound,
          action: 'REQUEST_CHANGES',
          comment: reason.join(' '),
        },
        postActor(actor),
      );
    }
    return this.render(actor, await this.posts.get(id, postActor(actor)));
  }
  async callback(
    actor: TelegramActor,
    action: string,
    id: string,
    metadata: Readonly<Record<string, unknown>> = {},
  ): Promise<TelegramResponse> {
    const post = await this.posts.get(id, postActor(actor));
    if (action === TelegramAction.VIEW_POST) return this.render(actor, post);
    if (
      metadata.revisionId !== post.currentRevision.id ||
      metadata.revision !== post.revisionNumber ||
      metadata.round !== post.reviewRound
    )
      throw new ConflictError({
        publicMessage:
          'This post changed. Open /post ' +
          id +
          ' and review the current version before deciding.',
      });
    if (action === TelegramAction.PREPARE_POST) {
      if (!post.canEdit || post.creatorUserId !== actor.internalUserId)
        throw new ConflictError({ publicMessage: 'Only the creator can prepare this draft.' });
      await this.generations.prepare(id, post.revisionNumber, postActor(actor));
      return this.render(actor, await this.posts.get(id, postActor(actor)));
    }
    if (action === TelegramAction.EDIT_POST || action === TelegramAction.FEEDBACK_POST) {
      if (!post.canEdit || post.creatorUserId !== actor.internalUserId)
        throw new ConflictError({
          publicMessage:
            'Ask the creator to edit this post, or use Request changes when reviewing.',
        });
      const field = typeof metadata.field === 'string' ? metadata.field : undefined;
      if (
        action === TelegramAction.EDIT_POST &&
        !['headline', 'english_caption', 'khmer_caption', 'cta'].includes(field ?? '')
      )
        throw new ValidationError({ publicMessage: 'Choose a valid caption field.' });
      return this.prompt(
        actor,
        post,
        action === TelegramAction.EDIT_POST ? 'CAPTION_FIELD' : 'FEEDBACK',
        field,
      );
    }
    if (action === TelegramAction.CHANGES_POST) {
      if (!post.canReview) throw new ConflictError({ publicMessage: post.reviewReason });
      return this.prompt(actor, post, 'REQUEST_CHANGES');
    }
    if (action !== TelegramAction.SUBMIT_POST && action !== TelegramAction.APPROVE_POST)
      throw new ValidationError({ publicMessage: 'Unknown complete-post action.' });
    const changed = await this.posts.decide(
      id,
      {
        expectedRevision: post.revisionNumber,
        expectedReviewRound: post.reviewRound,
        action: action === TelegramAction.SUBMIT_POST ? 'SUBMIT' : 'APPROVE',
      },
      postActor(actor),
    );
    return this.render(actor, changed);
  }
  async render(actor: TelegramActor, post: PostWorkflowView): Promise<TelegramResponse> {
    const r = post.currentRevision;
    const generation = await this.generations.state(post.id, postActor(actor));
    let poster: Buffer | null = null;
    if (r.generationId || r.visualAssetId)
      try {
        poster = await this.posts.preview(post.id, postActor(actor), r.id);
      } catch {
        /* Missing/changed media must not expose a decision button. */
      }
    const origin = this.config.application.corsOrigins.find((x) => /^https?:\/\//u.test(x));
    const url = origin ? new URL(`/posts/${post.id}`, origin).toString() : undefined;
    const actions: CreateTelegramActionInput[] = [
      { action: TelegramAction.VIEW_POST, resourceId: post.id, singleUse: false, metadata: {} },
    ];
    const labels = ['Refresh complete post'];
    if (
      post.canEdit &&
      post.creatorUserId === actor.internalUserId &&
      ['DRAFT', 'CHANGES_REQUESTED'].includes(post.status) &&
      Boolean(post.caption) &&
      Boolean(poster) &&
      Boolean(
        post.factualValidation &&
        !post.factualValidation.blockingCount &&
        ['PASSED', 'PASSED_WITH_WARNINGS'].includes(post.factualValidation.status),
      )
    ) {
      actions.push({
        action: TelegramAction.SUBMIT_POST,
        resourceId: post.id,
        singleUse: true,
        metadata: { revisionId: r.id, revision: post.revisionNumber, round: post.reviewRound },
      });
      labels.push('Send complete post for review');
    }
    if (post.canReview) {
      for (const [action, label] of [
        [TelegramAction.APPROVE_POST, 'Approve complete post'],
        [TelegramAction.CHANGES_POST, 'Request changes'],
      ] as const) {
        if (action === TelegramAction.APPROVE_POST && !poster) continue;
        actions.push({
          action,
          resourceId: post.id,
          singleUse: true,
          metadata: { revisionId: r.id, revision: post.revisionNumber, round: post.reviewRound },
        });
        labels.push(label);
      }
    }
    if (
      post.canEdit &&
      post.creatorUserId === actor.internalUserId &&
      post.status !== 'UNDER_REVIEW'
    ) {
      const metadata = { revisionId: r.id, revision: post.revisionNumber, round: post.reviewRound };
      if (post.caption)
        for (const [field, label] of [
          ['headline', 'Edit headline'],
          ['english_caption', 'Edit English Caption'],
          ['khmer_caption', 'Edit Khmer Caption'],
          ['cta', 'Edit invitation'],
        ] as const) {
          if (
            (field === 'english_caption' && r.language === 'KM') ||
            (field === 'khmer_caption' && r.language === 'EN')
          )
            continue;
          actions.push({
            action: TelegramAction.EDIT_POST,
            resourceId: post.id,
            singleUse: true,
            metadata: { ...metadata, field },
          });
          labels.push(label);
        }
      actions.push({
        action: TelegramAction.FEEDBACK_POST,
        resourceId: post.id,
        singleUse: true,
        metadata,
      });
      labels.push('Suggest a change');
      if (post.caption && !r.generationId && !r.visualAssetId) {
        actions.push({
          action: TelegramAction.PREPARE_POST,
          resourceId: post.id,
          singleUse: true,
          metadata,
        });
        labels.push('Prepare poster request');
      }
    }
    const values = await this.tokens.create(actor.identityId, actions);
    const buttons: TelegramButton[][] = values.map((token, i) => [
      { text: labels[i]!, callbackData: `ps:${token}` },
    ]);
    if (url)
      buttons.push([
        {
          text:
            post.status === 'APPROVED'
              ? 'Open approved downloads'
              : 'Continue this post in the web',
          url,
        },
      ]);
    const productCheck =
      typeof this.posts.productCheck === 'function'
        ? await this.posts.productCheck(post.id, postActor(actor)).catch(() => null)
        : null;
    const caption = post.caption;
    const captionMethod = (r.captionProvenance as { method?: string } | null)?.method;
    const captionSources: Record<string, string> = {
      AI_CAPTION: 'AI suggestion — human review required',
      MOCK_AI_CAPTION: 'Mock caption for testing',
      CATALOG_TEMPLATE: 'Catalog template — no AI',
      STAFF_DRAFT: 'Staff text',
      STAFF_EDIT: 'Staff edit',
    };
    const feedback = post.events
      ?.filter((e) => ['REQUEST_CHANGES', 'REJECT'].includes(e.action))
      .at(-1)?.comment;
    const generationText = generation
      ? `Poster: ${staffGenerationStatus(generation.status)}`
      : 'No image-generation request is linked to this revision.';
    const provenance = generation?.provenance as {
      kind?: string;
      externalReferences?: unknown[];
    } | null;
    const imageSource =
      provenance?.kind === 'MOCK'
        ? 'Mock image for testing'
        : provenance?.kind === 'GENERATED_BACKGROUND_WITH_AUTHENTIC_PRODUCT'
          ? 'Generated background with the approved product photo'
          : 'See saved image provenance in the web';
    const campaign = r.campaignSnapshot as { name?: string } | null;
    const plan = readPostCreationPlan(r.creationPlan);
    const text = [
      'Your post · ' + post.status.replaceAll('_', ' '),
      nextPostAction(post),
      `${r.productSnapshot.productName} · ${r.productSnapshot.brand} · ${r.productSnapshot.sku}`,
      `Saved catalog price: ${r.productSnapshot.currency} ${String(r.productSnapshot.price)}`,
      ...(productCheck
        ? [
            `Source: ${productCheck.source.system} · saved facts as of ${productCheck.source.asOf}`,
            `Source check: ${productCheck.source.status}; last checked ${productCheck.source.checkedAt ?? 'not checked'}.`,
            ...productCheck.issues.map((i) => `${i.message} ${i.alternatives.join(' ')}`),
            ...productCheck.historyWarnings.map((w) => w.message),
          ]
        : ['Product freshness check is unavailable. Cached facts are not fresh verification.']),
      generationText,
      ...(generation
        ? [
            imageSource,
            provenance?.externalReferences?.length
              ? 'Reference evidence is saved with this generation.'
              : 'No historical poster references recorded.',
          ]
        : []),
      ...(feedback ? [`Reviewer feedback: ${feedback}`] : []),
      `Revision ${post.revisionNumber} · Review round ${post.reviewRound}`,
      `${plan.purpose} · ${r.channel} · ${r.language}`,
      `Campaign: ${campaign?.name ?? r.campaignId ?? 'None'}`,
      `Brief: ${r.brief || 'No brief yet. Add one in the web.'}`,
      ...(caption
        ? [
            `Caption source: ${captionSources[captionMethod ?? ''] ?? 'Saved caption; provenance is available in web history.'}`,
          ]
        : []),
      caption
        ? `Caption\n${caption.headline}\n${caption.english_caption ?? ''}\n${caption.khmer_caption ?? ''}\n${caption.cta}\n${caption.hashtags.join(' ')}`
        : 'Caption: not saved yet.',
      post.canReview
        ? 'Review the exact saved poster and captions before approving.'
        : post.reviewReason,
      'The creator, requester and revision authors cannot approve. Another account used by the same person is not independent review.',
      `Continue or edit: /post ${post.id}`,
      'Creating a saved draft does not submit a paid generation. Prepare or edit media and confirm any quoted spending in the web.',
    ].join('\n\n');
    const messages: TelegramResponse['messages'][number][] = [];
    if (poster)
      messages.push({
        text: `Saved poster · revision ${post.revisionNumber}`,
        photoBuffer: poster,
      });
    else
      messages.push({
        text:
          r.generationId || r.visualAssetId
            ? 'Poster preview is unavailable. Open the web to check the saved image before review.'
            : 'Poster: no saved image yet. Continue in the web to prepare it.',
      });
    const chunks = splitTelegramMessage(text);
    chunks.forEach((chunk, index) =>
      messages.push({ text: chunk, ...(index === chunks.length - 1 ? { buttons } : {}) }),
    );
    return { messages };
  }
  async notification(
    postId: string,
  ): Promise<{ actor: TelegramActor; response: TelegramResponse }[]> {
    const recipients = (await this.identities.listPostRecipientTelegramUserIds?.(postId)) ?? [];
    const deliveries: { actor: TelegramActor; response: TelegramResponse }[] = [];
    for (const telegramUserId of recipients) {
      const actor = await this.identities.resolveActor({ telegramUserId });
      if (!actor) continue;
      let post: PostWorkflowView;
      try {
        post = await this.posts.get(postId, postActor(actor));
      } catch {
        continue;
      }
      if (post.creatorUserId !== actor.internalUserId && !post.canReview) continue;
      deliveries.push({ actor, response: await this.render(actor, post) });
    }
    return deliveries;
  }
}

export function classifyPostFeedback(
  text: string,
): 'Caption edit' | 'Layout change' | 'Paid regeneration' {
  if (/regenerat|new (image|poster|design)|generate again|another image/iu.test(text))
    return 'Paid regeneration';
  if (/layout|background|colou?r|font|spacing|position|logo|resize/iu.test(text))
    return 'Layout change';
  return 'Caption edit';
}
function staffGenerationStatus(status: string): string {
  return (
    (
      {
        QUEUED: 'Waiting to start',
        SUBMITTING: 'Starting image creation',
        GENERATING: 'Creating image',
        COMPLETE: 'Image saved',
        COMPLETED: 'Image saved',
        SUCCEEDED: 'Image saved',
        FAILED: 'Could not create the image. Open the web for recovery options.',
        UNCERTAIN:
          'The provider outcome is unknown. Ask an administrator to check before trying again.',
        AWAITING_CONFIRMATION: 'Review the cost and confirm in the web.',
      } as Record<string, string>
    )[status] ?? 'Open the web to check image progress'
  );
}
function nextPostAction(post: PostWorkflowView): string {
  if (post.status === 'APPROVED')
    return 'Next: open approved downloads in the web. Nothing is published automatically.';
  if (post.status === 'UNDER_REVIEW')
    return post.canReview
      ? 'Next: check the saved image and Caption, then Approve or Request changes.'
      : 'Next: ask an authorized independent colleague to review. You cannot approve your own work.';
  if (!post.caption)
    return 'Next: continue in the web to write or generate your Caption using approved brand guidance.';
  if (!post.currentRevision.generationId && !post.currentRevision.visualAssetId)
    return 'Next: prepare the poster request, then review settings and any spending in the web.';
  return 'Next: check the poster and Caption, then send the complete post for review.';
}
