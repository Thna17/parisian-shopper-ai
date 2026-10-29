import { Inject, Injectable, Optional } from '@nestjs/common';
import { ForbiddenError } from '@parisian-shopper/common';

import { ApproveContentVersionUseCase } from '../../approvals/application/approve-content-version.use-case.js';
import { GetApprovalStatusQuery } from '../../approvals/application/get-approval-status.query.js';
import { GetContentReviewStateQuery } from '../../approvals/application/get-content-review-state.query.js';
import { RejectContentVersionUseCase } from '../../approvals/application/reject-content-version.use-case.js';
import { RequestContentEditUseCase } from '../../approvals/application/request-content-edit.use-case.js';
import { RequestContentRegenerationUseCase } from '../../approvals/application/request-content-regeneration.use-case.js';
import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import {
  BRAND_RULE_REPOSITORY,
  type BrandRuleRepository,
} from '../../brand/application/brand-rule.repository.js';
import { CreateContentJobUseCase } from '../../content/application/create-content-job.use-case.js';
import {
  ReviseContentUseCase,
  type CopyEditableField,
} from '../../content/application/revise-content.use-case.js';
import {
  type ContentLanguage,
  contentLanguageSchema,
  contentPlatformSchema,
  contentTypeSchema,
} from '../../content/domain/content.js';
import { resolveStylePreset } from '../../creative/domain/style-presets.js';
import { CreateProductSnapshotUseCase } from '../../products/application/create-product-snapshot.use-case.js';
import { GetProductBySkuUseCase } from '../../products/application/get-product-by-sku.use-case.js';
import { SearchProductsUseCase } from '../../products/application/search-products.use-case.js';
import { parseSku } from '../../products/domain/product-input.js';
import {
  TelegramAction,
  type TelegramActor,
  type TelegramButton,
  type TelegramMessageAction,
  type TelegramResponse,
  type TelegramUserProfile,
  parseTelegramCommand,
} from '../domain/telegram.js';
import {
  CONTENT_GENERATION_ENQUEUER,
  type ContentGenerationEnqueuer,
} from './content-generation-enqueuer.port.js';
import {
  TelegramActionTokenService,
  hashTelegramActionToken,
} from './telegram-action-token.service.js';
import { telegramSafeError } from './telegram-error-mapper.js';
import {
  callbackData,
  formatDraft,
  formatJobSummary,
  formatPreviousVersions,
  formatProduct,
  formatProductCardCompact,
  formatProductSelectionSummary,
  formatProgressCard,
  formatResumePrompt,
  formatValidation,
  formatWizardStep,
  friendlyContentType,
  splitTelegramMessage,
  type TelegramFormatOptions,
} from './telegram-formatters.js';
import {
  TELEGRAM_VISUAL_CALLBACK_HANDLER,
  type TelegramVisualCallbackHandler,
} from './telegram-visual-callback.port.js';
import {
  TELEGRAM_WORKFLOW_REPOSITORY,
  type TelegramCreateFlow,
  type TelegramWorkflowMetadata,
  type TelegramWorkflowRepository,
} from './telegram-workflow.repository.js';

export const TELEGRAM_WORKFLOW_POLICY = Symbol('TELEGRAM_WORKFLOW_POLICY');
export interface TelegramWorkflowPolicy {
  actionTokenTtlSeconds: number;
  demoMode?: boolean;
}

const ACCESS_DENIED = 'Access denied. This bot is restricted to authorized Parisian Shopper staff.';
const ACTION_EXPIRED = 'This action has expired. Please reopen the latest job.';

const LANGUAGE_CHOICES = [
  { value: 'KM' as const, label: '🇰🇭 ខ្មែរ' },
  { value: 'EN' as const, label: '🇬🇧 English' },
  { value: 'BILINGUAL' as const, label: '🌐 ខ្មែរ + English' },
];

const CHANNEL_CHOICES = [
  {
    platform: 'INSTAGRAM' as const,
    format: 'PORTRAIT_4_5' as const,
    label: 'Instagram Portrait · 1080×1350',
  },
  {
    platform: 'FACEBOOK' as const,
    format: 'FEED_SQUARE' as const,
    label: 'Square Post · 1080×1080',
  },
  { platform: 'GENERIC' as const, format: 'STORY_VERTICAL' as const, label: 'Story · 1080×1920' },
  {
    platform: 'TELEGRAM' as const,
    format: 'FEED_SQUARE' as const,
    label: 'Telegram Post · 1080×1080',
  },
];

const STYLE_CHOICES = [
  { key: 'PARISIAN_MORNING_ATELIER', label: '🏛 Parisian Morning Atelier' },
  { key: 'NOCTURNE_OBSIDIAN', label: '👑 Nocturne Obsidian' },
  { key: 'BOTANICAL_SCENT_STORY', label: '🌿 Botanical Scent Story' },
  { key: 'CAMBODIAN_IVORY_CELEBRATION', label: '🇰🇭 Cambodian Ivory Celebration' },
  { key: 'CLEAN_EDITORIAL_STUDIO', label: '✨ Clean Editorial Studio' },
];

export interface TelegramCommandInput {
  updateId: string;
  profile: TelegramUserProfile;
  text: string;
  messageId?: number | undefined;
  chatId?: string | undefined;
}

export interface TelegramCallbackInput {
  updateId: string;
  profile: TelegramUserProfile;
  callbackData: string;
  messageId?: number | undefined;
  chatId?: string | undefined;
}

@Injectable()
export class TelegramCommandCenter {
  private readonly pendingEditFields = new Map<
    string,
    { field: CopyEditableField; versionId: string; jobId: string }
  >();

  public constructor(
    @Inject(TELEGRAM_WORKFLOW_REPOSITORY) private readonly repository: TelegramWorkflowRepository,
    private readonly permissions: PermissionService,
    private readonly products: GetProductBySkuUseCase,
    private readonly searchProducts: SearchProductsUseCase,
    private readonly snapshots: CreateProductSnapshotUseCase,
    private readonly createContentJob: CreateContentJobUseCase,
    @Inject(BRAND_RULE_REPOSITORY) private readonly brandRules: BrandRuleRepository,
    @Inject(CONTENT_GENERATION_ENQUEUER) private readonly generation: ContentGenerationEnqueuer,
    private readonly tokens: TelegramActionTokenService,
    @Inject(TELEGRAM_WORKFLOW_POLICY) private readonly policy: TelegramWorkflowPolicy,
    private readonly requestContentEdit: RequestContentEditUseCase,
    private readonly requestContentRegeneration: RequestContentRegenerationUseCase,
    private readonly approveContent: ApproveContentVersionUseCase,
    private readonly rejectContent: RejectContentVersionUseCase,
    private readonly reviewState: GetContentReviewStateQuery,
    private readonly approvalStatus: GetApprovalStatusQuery,
    @Optional()
    @Inject(TELEGRAM_VISUAL_CALLBACK_HANDLER)
    private readonly visualCallbackHandler?: TelegramVisualCallbackHandler,
    @Optional()
    private readonly reviseContent?: ReviseContentUseCase,
  ) {}

  private get formatOptions(): TelegramFormatOptions {
    return { demoMode: Boolean(this.policy.demoMode) };
  }

  public async handleCommand(input: TelegramCommandInput): Promise<TelegramResponse> {
    if (
      !(await this.repository.claimInboundUpdate(
        input.updateId,
        input.profile.telegramUserId,
        'message',
      ))
    ) {
      return { messages: [] };
    }
    const actor = await this.repository.resolveActor(input.profile);
    if (actor === null) {
      await this.repository.recordDeniedAccess(input.profile);
      return one(ACCESS_DENIED);
    }

    const command = parseTelegramCommand(input.text);
    const now = new Date();
    const pending = await this.repository.findActivePendingInteraction(actor.identityId, now);

    if (pending !== null) {
      if (command.name === 'cancel' || input.text.trim().toLowerCase() === '/cancel') {
        this.pendingEditFields.delete(actor.identityId);
        await this.repository.cancelPendingInteraction(pending.id, now);
        await this.repository.appendAudit({
          actor,
          action: 'TELEGRAM_PENDING_ACTION_CANCELLED',
          resourceType: 'ContentJob',
          resourceId: pending.contentJobId,
        });
        return one('Action cancelled.');
      }

      if (pending.action === 'EDIT') {
        const text = input.text.trim();
        const pendingField = this.pendingEditFields.get(actor.identityId);
        this.pendingEditFields.delete(actor.identityId);

        let fieldToEdit: CopyEditableField | undefined = pendingField?.field;
        let newValueToSet = text;

        if (fieldToEdit === undefined) {
          const prefixMatch = text.match(/^(headline|english|khmer|cta):\s*(.+)$/i);
          if (prefixMatch) {
            const matchedField = prefixMatch[1]!.toLowerCase();
            fieldToEdit =
              matchedField === 'headline'
                ? 'headline'
                : matchedField === 'khmer'
                  ? 'khmerCaption'
                  : matchedField === 'english'
                    ? 'englishCaption'
                    : 'cta';
            newValueToSet = prefixMatch[2]!.trim();
          }
        }

        if (fieldToEdit !== undefined && this.reviseContent !== undefined) {
          try {
            const result = await this.reviseContent.editField({
              contentJobId: pending.contentJobId,
              contentVersionId: pending.contentVersionId,
              field: fieldToEdit,
              newValue: newValueToSet,
              actorUserId: actor.internalUserId,
              actorRoles: actor.roles,
            });
            await this.repository.completePendingInteraction(pending.id, now);
            await this.repository.appendAudit({
              actor,
              action: 'TELEGRAM_CONTENT_FIELD_EDITED',
              resourceType: 'ContentVersion',
              resourceId: result.version.id,
              metadata: {
                contentJobId: pending.contentJobId,
                field: fieldToEdit,
                versionNumber: result.version.versionNumber,
              },
            });
            const fieldFriendly =
              fieldToEdit === 'headline'
                ? 'Headline'
                : fieldToEdit === 'englishCaption'
                  ? 'English copy'
                  : fieldToEdit === 'khmerCaption'
                    ? 'Khmer copy'
                    : 'CTA';
            return await this.renderDraftCardResponse(
              actor,
              result.version.id,
              `✏️ *${fieldFriendly} updated!* (Version V${String(result.version.versionNumber)})`,
            );
          } catch (error) {
            return one(telegramSafeError(error));
          }
        }

        try {
          const revision = await this.requestContentEdit.execute({
            contentJobId: pending.contentJobId,
            contentVersionId: pending.contentVersionId,
            actorUserId: actor.internalUserId,
            actorRoles: actor.roles,
            instruction: input.text.trim(),
          });
          await this.repository.completePendingInteraction(pending.id, now);
          await this.repository.appendAudit({
            actor,
            action: 'TELEGRAM_CONTENT_EDIT_REQUESTED',
            resourceType: 'RevisionRequest',
            resourceId: revision.id,
            metadata: { contentJobId: pending.contentJobId, instruction: input.text.trim() },
          });
          return one(
            `✏️ Revision requested with instructions:\n"${input.text.trim()}"\n\nA new draft is being generated. You will be notified when it is ready.`,
          );
        } catch (error) {
          return one(telegramSafeError(error));
        }
      }

      if (pending.action === 'REJECT') {
        try {
          const approval = await this.rejectContent.execute({
            contentJobId: pending.contentJobId,
            contentVersionId: pending.contentVersionId,
            approverUserId: actor.internalUserId,
            approverRoles: actor.roles,
            comment: input.text.trim(),
          });
          await this.repository.completePendingInteraction(pending.id, now);
          await this.repository.appendAudit({
            actor,
            action: 'TELEGRAM_CONTENT_REJECTED',
            resourceType: 'ApprovalEvent',
            resourceId: approval.id,
            metadata: { contentJobId: pending.contentJobId, comment: input.text.trim() },
          });
          return one(
            `❌ Draft rejected.\nReason: "${input.text.trim()}".\nContent job #${short(pending.contentJobId)} is now REJECTED.`,
          );
        } catch (error) {
          return one(telegramSafeError(error));
        }
      }
    }

    if (command.name === 'cancel') {
      this.pendingEditFields.delete(actor.identityId);
      const activeFlow = await this.repository.findActiveFlowByIdentity(actor.identityId);
      if (activeFlow != null) {
        await this.repository.cancelFlow(activeFlow.id);
        await this.repository.clearActiveWorkflowMessage(activeFlow.id);
        return one('Creation cancelled.');
      }
      if (this.visualCallbackHandler?.handleTextMessage !== undefined) {
        const visualCancelRes = await this.visualCallbackHandler.handleTextMessage(
          actor,
          '/cancel',
        );
        if (visualCancelRes !== null) {
          return visualCancelRes;
        }
      }
      return one('There is no active pending action to cancel.');
    }

    try {
      switch (command.name) {
        case 'start':
          return one(welcomeText(actor));
        case 'help':
          return one(helpText(actor, this.permissions));
        case 'create':
          return await this.beginCreate(actor, command.argument);
        case 'resume':
          return await this.handleResumeCommand(actor);
        case 'search':
          return await this.search(actor, command.argument, 0);
        case 'status':
          return await this.status(actor);
        case 'history':
          return await this.history(actor, command.argument);
        default: {
          if (this.visualCallbackHandler?.handleTextMessage !== undefined) {
            const visualRes = await this.visualCallbackHandler.handleTextMessage(
              actor,
              input.text.trim(),
            );
            if (visualRes !== null) {
              return visualRes;
            }
          }
          return one('Unknown command. Use /help to see available commands.');
        }
      }
    } catch (error) {
      return one(telegramSafeError(error));
    }
  }

  public async handleCallback(input: TelegramCallbackInput): Promise<TelegramResponse> {
    if (
      !(await this.repository.claimInboundUpdate(
        input.updateId,
        input.profile.telegramUserId,
        'callback',
      ))
    ) {
      return { messages: [], callbackNotice: 'Already handled.' };
    }
    const actor = await this.repository.resolveActor(input.profile);
    if (actor === null) {
      await this.repository.recordDeniedAccess(input.profile);
      return { ...one(ACCESS_DENIED), callbackNotice: 'Access denied.' };
    }
    if (!(await this.repository.consumeRateLimit(actor.identityId, 'callback', 30, 60))) {
      return {
        ...one('Too many actions. Please wait and try again.'),
        callbackNotice: 'Rate limited.',
      };
    }
    const rawToken = input.callbackData.startsWith('ps:') ? input.callbackData.slice(3) : '';
    if (!/^[A-Za-z0-9_-]{20,40}$/u.test(rawToken)) {
      return { ...one(ACTION_EXPIRED), callbackNotice: 'Invalid action.' };
    }
    const resolved = await this.repository.consumeActionToken(
      hashTelegramActionToken(rawToken),
      actor.telegramUserId,
      new Date(),
    );
    if (resolved.disposition !== 'VALID') {
      const notice =
        resolved.disposition === 'WRONG_USER'
          ? 'This action belongs to another user.'
          : ACTION_EXPIRED;
      return { ...one(notice), callbackNotice: notice };
    }
    try {
      const token = resolved.token;
      switch (token.action) {
        case TelegramAction.SELECT_PRODUCT:
          return {
            ...(await this.selectProduct(actor, token.resourceId)),
            callbackNotice: 'Product selected.',
          };
        case TelegramAction.SELECT_CONTENT_TYPE:
          return {
            ...(await this.selectContentType(actor, token.resourceId, token.metadata)),
            callbackNotice: 'Content goal selected.',
          };
        case TelegramAction.SELECT_LANGUAGE:
          return {
            ...(await this.selectLanguage(actor, token.resourceId, token.metadata)),
            callbackNotice: 'Language selected.',
          };
        case TelegramAction.SELECT_PLATFORM:
          return {
            ...(await this.selectPlatform(actor, token.resourceId, token.metadata)),
            callbackNotice: 'Channel & format selected.',
          };
        case TelegramAction.SELECT_STYLE_PRESET:
          return {
            ...(await this.selectStylePreset(actor, token.resourceId, token.metadata)),
            callbackNotice: 'Visual style selected.',
          };
        case TelegramAction.CONFIRM_GENERATION:
          return {
            ...(await this.confirmGeneration(actor, token.resourceId, token.metadata)),
            callbackNotice: 'Generation started!',
          };
        case TelegramAction.WIZARD_BACK:
          return {
            ...(await this.handleWizardBack(actor, token.resourceId, token.metadata)),
            callbackNotice: 'Previous step.',
          };
        case TelegramAction.WIZARD_CANCEL:
          return {
            ...(await this.handleWizardCancel(actor, token.resourceId)),
            callbackNotice: 'Creation cancelled.',
          };
        case TelegramAction.WIZARD_RESUME:
          return {
            ...(await this.handleWizardResume(actor, token.resourceId)),
            callbackNotice: 'Resuming draft...',
          };
        case TelegramAction.WIZARD_START_NEW:
          return {
            ...(await this.handleWizardStartNew(actor, token.resourceId)),
            callbackNotice: 'Starting new draft...',
          };
        case TelegramAction.WIZARD_RETRY:
          return {
            ...(await this.handleWizardRetry(actor, token.resourceId, token.metadata)),
            callbackNotice: 'Retrying generation...',
          };
        case TelegramAction.VIEW_SOURCE:
          return {
            ...(await this.viewSource(actor, token.resourceId)),
            callbackNotice: 'Source loaded.',
          };
        case TelegramAction.VIEW_VALIDATION:
          return {
            ...(await this.viewValidation(actor, token.resourceId)),
            callbackNotice: 'Validation loaded.',
          };
        case TelegramAction.SEARCH_PAGE:
          return {
            ...(await this.searchFromToken(actor, token.metadata)),
            callbackNotice: 'Page loaded.',
          };
        case TelegramAction.REQUEST_EDIT:
          return {
            ...(await this.promptEdit(actor, token.resourceId, token.metadata)),
            callbackNotice: 'Awaiting edit instructions...',
          };
        case TelegramAction.REQUEST_REGENERATE:
          return {
            ...(await this.requestRegenerate(actor, token.resourceId, token.metadata)),
            callbackNotice: 'Regeneration started.',
          };
        case TelegramAction.APPROVE_PROMPT:
          return {
            ...(await this.promptApprove(actor, token.resourceId, token.metadata)),
            callbackNotice: 'Confirmation required.',
          };
        case TelegramAction.CONFIRM_APPROVE:
          return {
            ...(await this.confirmApprove(actor, token.resourceId, token.metadata)),
            callbackNotice: 'Draft approved!',
          };
        case TelegramAction.REJECT_PROMPT:
          return {
            ...(await this.promptReject(actor, token.resourceId, token.metadata)),
            callbackNotice: 'Awaiting rejection reason...',
          };
        case TelegramAction.VIEW_PREVIOUS:
          return {
            ...(await this.viewPrevious(actor, token.resourceId)),
            callbackNotice: 'Previous versions loaded.',
          };
        case TelegramAction.EDIT_CONTENT_FIELD:
          return {
            ...(await this.promptEditField(actor, token.resourceId, token.metadata)),
            callbackNotice: 'Awaiting field input...',
          };
        case TelegramAction.CHANGE_CONTENT_LANGUAGE:
          return {
            ...(await this.promptChangeLanguage(actor, token.resourceId, token.metadata)),
            callbackNotice: 'Language updated.',
          };
        case TelegramAction.RESTORE_CONTENT_VERSION:
          return {
            ...(await this.promptRestoreVersion(actor, token.resourceId, token.metadata)),
            callbackNotice: 'Version restored.',
          };
        case TelegramAction.CANCEL_ACTION:
          return {
            ...(await this.cancelAction(actor)),
            callbackNotice: 'Cancelled.',
          };
        case TelegramAction.APPROVE_VISUAL:
        case TelegramAction.CONFIRM_APPROVE_VISUAL:
        case TelegramAction.REQUEST_VISUAL_EDIT:
        case TelegramAction.EDIT_VISUAL_LAYOUT:
        case TelegramAction.CHANGE_VISUAL_STYLE:
        case TelegramAction.CONFIRM_CHANGE_STYLE:
        case TelegramAction.VIEW_VISUAL_DETAILS:
        case TelegramAction.REGENERATE_VISUAL:
        case TelegramAction.REJECT_VISUAL:
        case TelegramAction.CANCEL_VISUAL_ACTION:
        case TelegramAction.EXPORT_POSTER:
        case TelegramAction.SELECT_EXPORT_FORMAT:
        case TelegramAction.PROMPT_PUBLISH_CHANNEL:
        case TelegramAction.CONFIRM_PUBLISH_CHANNEL:
        case TelegramAction.REPLACE_PRODUCT_ASSET:
        case TelegramAction.CONFIRM_STRUCTURED_REVISION:
        case TelegramAction.CANCEL_STRUCTURED_REVISION:
        case TelegramAction.CHOOSE_REVISION_STYLE:
          if (this.visualCallbackHandler !== undefined) {
            return this.visualCallbackHandler.handleAction(actor, token);
          }
          return {
            ...one('Visual review handler not configured.'),
            callbackNotice: 'Not configured.',
          };
      }
    } catch (error) {
      const message = telegramSafeError(error);
      return { ...one(message), callbackNotice: message };
    }
  }

  private async beginCreate(
    actor: TelegramActor,
    skuOrQuery?: string,
    action: TelegramMessageAction = 'SEND',
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.CREATE_CONTENT);
    if (!(await this.repository.consumeRateLimit(actor.identityId, 'create', 5, 60))) {
      return one('Creation limit reached. Please wait before requesting another draft.', action);
    }
    const trimmed = skuOrQuery?.trim() ?? '';
    if (trimmed.length > 0) {
      try {
        const product = await this.products.execute({ sku: trimmed });
        if (product) {
          const expiresAt = this.expiry();
          const flow = await this.repository.createFlow(actor.identityId, product, expiresAt);
          await this.repository.setFlowMetadata?.(flow.id, {
            step: 2,
            stepHistory: [1],
            history: [1],
          });
          await this.repository.appendAudit({
            actor,
            action: 'TELEGRAM_PRODUCT_SELECTED',
            resourceType: 'Product',
            resourceId: product.product.sku,
          });
          return this.renderStep2(actor, flow, action);
        }
      } catch {
        // Not a direct SKU match, proceed to search
      }
      return this.renderProductSelection(actor, trimmed, 0, action);
    }

    const activeFlow = await this.repository.findActiveFlowByIdentity(actor.identityId);
    if (activeFlow !== null) {
      return this.renderResumePrompt(actor, activeFlow, action);
    }
    return this.renderProductSelection(actor, '', 0, action);
  }

  private async renderProductSelection(
    actor: TelegramActor,
    query = '',
    page = 0,
    action: TelegramMessageAction = 'SEND',
  ): Promise<TelegramResponse> {
    const PAGE_SIZE_PRODUCTS = 4;
    const result = await this.searchProducts.execute({ query, limit: 20 });
    const offset = page * PAGE_SIZE_PRODUCTS;
    const items = result.items.slice(offset, offset + PAGE_SIZE_PRODUCTS);
    if (items.length === 0) {
      return {
        messages: [
          {
            text: `No products found${query ? ` matching "${query}"` : ''}. Use /create to browse products.`,
            action,
          },
        ],
      };
    }

    const expiresAt = this.expiry();
    const itemTokens = await this.tokens.create(
      actor.identityId,
      items.map((item) => ({
        action: TelegramAction.SELECT_PRODUCT,
        resourceId: item.product.sku,
      })),
      expiresAt,
    );

    const productButtons: TelegramButton[][] = items.map((item, index) => [
      {
        text: `🛍️ ${index + 1}. ${item.product.product_name.slice(0, 24)}…`,
        callbackData: callbackData(required(itemTokens[index])),
      },
    ]);

    const navRow: TelegramButton[] = [];
    if (page > 0) {
      const [prevToken] = await this.tokens.create(
        actor.identityId,
        [
          {
            action: TelegramAction.SEARCH_PAGE,
            resourceId: 'page',
            metadata: { query, page: page - 1 },
          },
        ],
        expiresAt,
      );
      navRow.push({ text: '⬅️ Prev', callbackData: callbackData(required(prevToken)) });
    }
    if (offset + PAGE_SIZE_PRODUCTS < result.items.length) {
      const [nextToken] = await this.tokens.create(
        actor.identityId,
        [
          {
            action: TelegramAction.SEARCH_PAGE,
            resourceId: 'page',
            metadata: { query, page: page + 1 },
          },
        ],
        expiresAt,
      );
      navRow.push({ text: 'Next ➡️', callbackData: callbackData(required(nextToken)) });
    }
    const [cancelToken] = await this.tokens.create(
      actor.identityId,
      [{ action: TelegramAction.CANCEL_ACTION, resourceId: 'wizard_start', singleUse: true }],
      expiresAt,
    );
    navRow.push({ text: '❌ Cancel', callbackData: callbackData(required(cancelToken)) });
    productButtons.push(navRow);

    const totalPages = Math.ceil(result.items.length / PAGE_SIZE_PRODUCTS);
    const text = formatProductSelectionSummary({
      items,
      offset,
      totalCount: result.items.length,
      page,
      totalPages,
      ...(query ? { query } : {}),
      options: this.formatOptions,
    });

    return {
      messages: [
        {
          text,
          buttons: productButtons,
          action,
        },
      ],
    };
  }

  private async selectProduct(actor: TelegramActor, sku: string): Promise<TelegramResponse> {
    this.require(actor, Permission.CREATE_CONTENT);
    const product = await this.products.execute({ sku });
    const expiresAt = this.expiry();
    const flow = await this.repository.createFlow(actor.identityId, product, expiresAt);
    await this.repository.setFlowMetadata?.(flow.id, {
      step: 2,
      stepHistory: [1],
      history: [1],
    });
    await this.repository.appendAudit({
      actor,
      action: 'TELEGRAM_PRODUCT_SELECTED',
      resourceType: 'Product',
      resourceId: product.product.sku,
    });
    return this.renderStep2(actor, flow, 'EDIT_TEXT');
  }

  private async renderStep2(
    actor: TelegramActor,
    flow: TelegramCreateFlow,
    action: TelegramMessageAction = 'EDIT_TEXT',
  ): Promise<TelegramResponse> {
    const choices = applicableContentTypes(flow.product);
    const expiresAt = this.expiry();
    const tokenValues = await this.tokens.create(
      actor.identityId,
      choices.map((value) => ({
        action: TelegramAction.SELECT_CONTENT_TYPE,
        resourceId: flow.id,
        metadata: { value },
      })),
      expiresAt,
    );

    const buttons: TelegramButton[][] = choices.map((choice, index) => [
      {
        text: friendlyContentType(choice),
        callbackData: callbackData(required(tokenValues[index])),
      },
    ]);

    const navRow = await this.buildNavRow(actor.identityId, flow.id, 1, expiresAt);
    buttons.push(navRow);

    const text = formatWizardStep({
      step: 2,
      productName: flow.product.product.product_name,
      sku: flow.product.product.sku,
      options: this.formatOptions,
    });

    return {
      messages: [
        {
          text,
          buttons,
          action,
          resourceKey: flow.id,
          flowId: flow.id,
          messageType: 'WIZARD_PROMPT',
        },
      ],
      resourceKey: flow.id,
      flowId: flow.id,
      messageType: 'WIZARD_PROMPT',
    };
  }

  private async selectContentType(
    actor: TelegramActor,
    flowId: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.CREATE_CONTENT);
    const flowBefore = await this.repository.findFlowById(flowId);
    const prevHistory = extractStepHistory(flowBefore?.metadata, 1);
    const nextHistory = [...prevHistory, 2];
    const value = contentTypeSchema.parse(metadata?.value);
    const flow = await this.repository.updateFlowSelection(flowId, 'contentType', value);
    await this.repository.setFlowMetadata?.(flowId, {
      step: 3,
      stepHistory: nextHistory,
      history: nextHistory,
    });
    return this.renderStep3(actor, flow, 'EDIT_TEXT');
  }

  private async renderStep3(
    actor: TelegramActor,
    flow: TelegramCreateFlow,
    action: TelegramMessageAction = 'EDIT_TEXT',
  ): Promise<TelegramResponse> {
    const expiresAt = this.expiry();
    const tokens = await this.tokens.create(
      actor.identityId,
      LANGUAGE_CHOICES.map((c) => ({
        action: TelegramAction.SELECT_LANGUAGE,
        resourceId: flow.id,
        metadata: { value: c.value },
      })),
      expiresAt,
    );

    const buttons: TelegramButton[][] = LANGUAGE_CHOICES.map((c, idx) => [
      { text: c.label, callbackData: callbackData(required(tokens[idx])) },
    ]);

    const navRow = await this.buildNavRow(actor.identityId, flow.id, 2, expiresAt);
    buttons.push(navRow);

    const text = formatWizardStep({
      step: 3,
      productName: flow.product.product.product_name,
      sku: flow.product.product.sku,
      contentGoal: flow.contentType,
      options: this.formatOptions,
    });

    return {
      messages: [
        {
          text,
          buttons,
          action,
          resourceKey: flow.id,
          flowId: flow.id,
          messageType: 'WIZARD_PROMPT',
        },
      ],
      resourceKey: flow.id,
      flowId: flow.id,
      messageType: 'WIZARD_PROMPT',
    };
  }

  private async selectLanguage(
    actor: TelegramActor,
    flowId: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.CREATE_CONTENT);
    const flowBefore = await this.repository.findFlowById(flowId);
    const prevHistory = extractStepHistory(flowBefore?.metadata, 2);
    const nextHistory = [...prevHistory, 3];
    const value = contentLanguageSchema.parse(metadata?.value);
    const flow = await this.repository.updateFlowSelection(flowId, 'language', value);
    await this.repository.setFlowMetadata?.(flowId, {
      step: 4,
      stepHistory: nextHistory,
      history: nextHistory,
    });
    return this.renderStep4(actor, flow, 'EDIT_TEXT');
  }

  private async renderStep4(
    actor: TelegramActor,
    flow: TelegramCreateFlow,
    action: TelegramMessageAction = 'EDIT_TEXT',
  ): Promise<TelegramResponse> {
    const expiresAt = this.expiry();
    const tokens = await this.tokens.create(
      actor.identityId,
      CHANNEL_CHOICES.map((c) => ({
        action: TelegramAction.SELECT_PLATFORM,
        resourceId: flow.id,
        metadata: { value: c.platform, format: c.format },
      })),
      expiresAt,
    );

    const buttons: TelegramButton[][] = CHANNEL_CHOICES.map((c, idx) => [
      { text: c.label, callbackData: callbackData(required(tokens[idx])) },
    ]);

    const navRow = await this.buildNavRow(actor.identityId, flow.id, 3, expiresAt);
    buttons.push(navRow);

    const text = formatWizardStep({
      step: 4,
      productName: flow.product.product.product_name,
      sku: flow.product.product.sku,
      contentGoal: flow.contentType,
      language: flow.language,
      options: this.formatOptions,
    });

    return {
      messages: [
        {
          text,
          buttons,
          action,
          resourceKey: flow.id,
          flowId: flow.id,
          messageType: 'WIZARD_PROMPT',
        },
      ],
      resourceKey: flow.id,
      flowId: flow.id,
      messageType: 'WIZARD_PROMPT',
    };
  }

  private async selectPlatform(
    actor: TelegramActor,
    flowId: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.CREATE_CONTENT);
    const flowBefore = await this.repository.findFlowById(flowId);
    const prevHistory = extractStepHistory(flowBefore?.metadata, 3);
    const nextHistory = [...prevHistory, 4];
    const value = contentPlatformSchema.parse(metadata?.value);
    const format = typeof metadata?.format === 'string' ? metadata.format : 'FEED_SQUARE';
    const flow = await this.repository.updateFlowSelection(flowId, 'platform', value);
    await this.repository.setFlowMetadata?.(flowId, {
      format,
      step: 5,
      stepHistory: nextHistory,
      history: nextHistory,
    });
    return this.renderStep5(actor, flow, 'EDIT_TEXT');
  }

  private async renderStep5(
    actor: TelegramActor,
    flow: TelegramCreateFlow,
    action: TelegramMessageAction = 'EDIT_TEXT',
  ): Promise<TelegramResponse> {
    const expiresAt = this.expiry();
    const tokens = await this.tokens.create(
      actor.identityId,
      STYLE_CHOICES.map((c) => ({
        action: TelegramAction.SELECT_STYLE_PRESET,
        resourceId: flow.id,
        metadata: { value: c.key },
      })),
      expiresAt,
    );

    const buttons: TelegramButton[][] = STYLE_CHOICES.map((c, idx) => [
      { text: c.label, callbackData: callbackData(required(tokens[idx])) },
    ]);

    const navRow = await this.buildNavRow(actor.identityId, flow.id, 4, expiresAt);
    buttons.push(navRow);

    const text = formatWizardStep({
      step: 5,
      productName: flow.product.product.product_name,
      sku: flow.product.product.sku,
      contentGoal: flow.contentType,
      language: flow.language,
      format: flow.platform,
      options: this.formatOptions,
    });

    return {
      messages: [
        {
          text,
          buttons,
          action,
          resourceKey: flow.id,
          flowId: flow.id,
          messageType: 'WIZARD_PROMPT',
        },
      ],
      resourceKey: flow.id,
      flowId: flow.id,
      messageType: 'WIZARD_PROMPT',
    };
  }

  private async selectStylePreset(
    actor: TelegramActor,
    flowId: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.CREATE_CONTENT);
    const flow = await this.repository.findFlowById(flowId);
    if (flow === null || flow.expiresAt <= new Date()) {
      return one(ACTION_EXPIRED);
    }
    const prevHistory = extractStepHistory(flow.metadata, 4);
    const nextHistory = [...prevHistory, 5];
    const stylePreset = typeof metadata?.value === 'string' ? metadata.value : 'NOCTURNE_ROYALE';
    await this.repository.setFlowMetadata?.(flowId, {
      stylePreset,
      step: 6,
      stepHistory: nextHistory,
      history: nextHistory,
    });
    return this.renderStep6(actor, flow, stylePreset, 'EDIT_TEXT');
  }

  private async renderStep6(
    actor: TelegramActor,
    flow: TelegramCreateFlow,
    stylePresetKey?: string,
    action: TelegramMessageAction = 'EDIT_TEXT',
  ): Promise<TelegramResponse> {
    const presetKey = stylePresetKey ?? flow.metadata?.stylePreset ?? 'NOCTURNE_OBSIDIAN';
    const presetDef = resolveStylePreset(presetKey, flow.product.product.category);
    const expiresAt = this.expiry();

    const [confirmToken] = await this.tokens.create(
      actor.identityId,
      [
        {
          action: TelegramAction.CONFIRM_GENERATION,
          resourceId: flow.id,
          metadata: { stylePreset: presetKey },
          singleUse: true,
        },
      ],
      expiresAt,
    );

    const buttons: TelegramButton[][] = [
      [{ text: '🚀 Generate Poster & Copy', callbackData: callbackData(required(confirmToken)) }],
    ];

    const navRow = await this.buildNavRow(actor.identityId, flow.id, 5, expiresAt);
    buttons.push(navRow);

    const price = flow.product.product.promo_price
      ? `$${flow.product.product.promo_price} USD (Regular: $${flow.product.product.price} USD)`
      : `$${flow.product.product.price} USD`;

    const text = formatWizardStep({
      step: 6,
      productName: flow.product.product.product_name,
      sku: flow.product.product.sku,
      contentGoal: flow.contentType,
      language: flow.language,
      format: flow.platform,
      stylePreset: presetDef.name,
      price,
      options: this.formatOptions,
    });

    return {
      messages: [
        {
          text,
          buttons,
          action,
          resourceKey: flow.id,
          flowId: flow.id,
          messageType: 'WIZARD_PROMPT',
        },
      ],
      resourceKey: flow.id,
      flowId: flow.id,
      messageType: 'WIZARD_PROMPT',
    };
  }

  private async confirmGeneration(
    actor: TelegramActor,
    flowId: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.CREATE_CONTENT);
    const flow = await this.repository.findFlowById(flowId);
    if (flow === null || flow.expiresAt <= new Date()) {
      return one(ACTION_EXPIRED);
    }
    const existing = await this.repository.findJobByFlowId(flow.id);
    if (existing !== null) {
      return one(
        `Content job #${short(existing.jobId)} is already ${existing.jobStatus.toLowerCase()}.`,
      );
    }
    assertCompleteSelections(flow);
    const stylePreset =
      (typeof metadata?.stylePreset === 'string'
        ? metadata.stylePreset
        : (flow.metadata?.stylePreset as string)) ?? 'NOCTURNE_OBSIDIAN';

    const snapshot = await this.snapshots.execute(flow.product);
    const brand = await this.brandRules.findActive();
    if (brand === null) throw new Error('No active brand rules are configured');

    const job = await this.createContentJob.execute({
      productSnapshotId: snapshot.id,
      brandRuleVersionId: brand.id,
      requesterUserId: actor.internalUserId,
      telegramCreateFlowId: flow.id,
      contentType: flow.contentType,
      language: flow.language,
      platform: flow.platform,
      campaignContext: stylePreset,
    });

    await this.repository.completeFlow(flow.id);
    await this.generation.enqueue(job.id);

    await this.repository.appendAudit({
      actor,
      action: 'TELEGRAM_JOB_CREATED',
      resourceType: 'ContentJob',
      resourceId: job.id,
      metadata: { stylePreset },
    });
    await this.repository.appendAudit({
      actor,
      action: 'TELEGRAM_CONTENT_REQUESTED',
      resourceType: 'ContentJob',
      resourceId: job.id,
      metadata: { stylePreset },
    });

    const progressCard = formatProgressCard(
      job.id,
      flow.product.product.product_name,
      'PREPARING_FACTS',
      this.formatOptions,
    );

    return {
      messages: [
        {
          text: progressCard,
          action: 'EDIT_TEXT',
        },
      ],
      callbackNotice: 'Generation started!',
    };
  }

  private async handleWizardBack(
    actor: TelegramActor,
    flowId: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    const flow = await this.repository.findFlowById(flowId);
    if (flow === null || flow.expiresAt <= new Date()) {
      return one(ACTION_EXPIRED);
    }

    const rawHistory = flow.metadata?.stepHistory ?? flow.metadata?.history;
    const historyStack: number[] = Array.isArray(rawHistory)
      ? rawHistory.map((v) => Number(v)).filter((v) => !Number.isNaN(v))
      : [];

    let targetStep: number;
    if (historyStack.length > 0) {
      targetStep = historyStack.pop()!;
    } else {
      targetStep =
        typeof metadata?.toStep === 'number' ? metadata.toStep : Math.max(1, (flow.step ?? 2) - 1);
    }

    await this.repository.setFlowMetadata?.(flow.id, {
      step: targetStep,
      stepHistory: historyStack,
      history: historyStack,
    });

    if (targetStep === 1) {
      return this.renderProductSelection(actor, '', 0, 'EDIT_TEXT');
    }
    switch (targetStep) {
      case 2:
        return this.renderStep2(actor, flow, 'EDIT_TEXT');
      case 3:
        return this.renderStep3(actor, flow, 'EDIT_TEXT');
      case 4:
        return this.renderStep4(actor, flow, 'EDIT_TEXT');
      case 5:
        return this.renderStep5(actor, flow, 'EDIT_TEXT');
      default:
        return this.renderStep2(actor, flow, 'EDIT_TEXT');
    }
  }

  private async handleWizardCancel(
    _actor: TelegramActor,
    flowId: string,
  ): Promise<TelegramResponse> {
    try {
      await this.repository.cancelFlow(flowId);
      await this.repository.clearActiveWorkflowMessage(flowId);
    } catch {
      // Ignore if already cancelled or completed
    }
    return {
      messages: [
        {
          text: '❌ *Creation Cancelled*\n\nYou can start a new flow anytime with /create.',
          buttons: [],
          action: 'EDIT_TEXT',
        },
      ],
      callbackNotice: 'Cancelled.',
    };
  }

  private async handleResumeCommand(
    actor: TelegramActor,
    action: TelegramMessageAction = 'SEND',
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.CREATE_CONTENT);
    const activeFlow = await this.repository.findActiveFlowByIdentity(actor.identityId);
    if (activeFlow === null) {
      return one('No active draft in progress. Start one with /create.', action);
    }
    return this.renderResumePrompt(actor, activeFlow, action);
  }

  private async renderResumePrompt(
    actor: TelegramActor,
    flow: TelegramCreateFlow,
    action: TelegramMessageAction = 'SEND',
  ): Promise<TelegramResponse> {
    const expiresAt = flow.expiresAt > new Date() ? flow.expiresAt : this.expiry();
    const [resumeToken, startNewToken, discardToken] = await this.tokens.create(
      actor.identityId,
      [
        {
          action: TelegramAction.WIZARD_RESUME,
          resourceId: flow.id,
          singleUse: true,
        },
        {
          action: TelegramAction.WIZARD_START_NEW,
          resourceId: flow.id,
          singleUse: true,
        },
        {
          action: TelegramAction.WIZARD_CANCEL,
          resourceId: flow.id,
          singleUse: true,
        },
      ],
      expiresAt,
    );

    const buttons: TelegramButton[][] = [
      [{ text: '▶️ Resume Draft', callbackData: callbackData(required(resumeToken)) }],
      [
        { text: '➕ Start New Draft', callbackData: callbackData(required(startNewToken)) },
        { text: '❌ Discard', callbackData: callbackData(required(discardToken)) },
      ],
    ];

    const text = formatResumePrompt({
      productName: flow.product.product.product_name,
      sku: flow.product.product.sku,
      step: flow.step ?? 2,
      totalSteps: 6,
      options: this.formatOptions,
    });

    return {
      messages: [
        {
          text,
          buttons,
          action,
          resourceKey: flow.id,
          flowId: flow.id,
          messageType: 'WIZARD_PROMPT',
        },
      ],
      resourceKey: flow.id,
      flowId: flow.id,
      messageType: 'WIZARD_PROMPT',
    };
  }

  private async handleWizardResume(
    actor: TelegramActor,
    flowId: string,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.CREATE_CONTENT);
    const flow = await this.repository.findFlowById(flowId);
    if (flow === null || flow.expiresAt <= new Date()) {
      return one(ACTION_EXPIRED);
    }
    const currentStep = flow.step ?? 2;
    switch (currentStep) {
      case 2:
        return this.renderStep2(actor, flow, 'EDIT_TEXT');
      case 3:
        return this.renderStep3(actor, flow, 'EDIT_TEXT');
      case 4:
        return this.renderStep4(actor, flow, 'EDIT_TEXT');
      case 5:
        return this.renderStep5(actor, flow, 'EDIT_TEXT');
      case 6:
        return this.renderStep6(
          actor,
          flow,
          flow.metadata?.stylePreset ?? 'NOCTURNE_OBSIDIAN',
          'EDIT_TEXT',
        );
      default:
        return this.renderStep2(actor, flow, 'EDIT_TEXT');
    }
  }

  private async handleWizardStartNew(
    actor: TelegramActor,
    flowId: string,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.CREATE_CONTENT);
    try {
      await this.repository.cancelFlow(flowId);
      await this.repository.clearActiveWorkflowMessage(flowId);
    } catch {
      // Ignore if already cancelled
    }
    return this.renderProductSelection(actor, '', 0, 'EDIT_TEXT');
  }

  private async handleWizardRetry(
    actor: TelegramActor,
    jobId: string,
    _metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.CREATE_CONTENT);
    await this.generation.enqueue(jobId);
    return {
      messages: [
        {
          text: `🔄 Generation re-enqueued for job #${short(jobId)}.`,
          action: 'EDIT_TEXT',
        },
      ],
      callbackNotice: 'Retrying...',
    };
  }

  private async buildNavRow(
    identityId: string,
    flowId: string,
    backStep?: number,
    expiresAt?: Date,
  ): Promise<TelegramButton[]> {
    const expiry = expiresAt ?? this.expiry();
    const navDefs: {
      action: TelegramAction;
      resourceId: string;
      metadata?: Record<string, unknown>;
      singleUse?: boolean;
    }[] = [];
    if (backStep !== undefined) {
      navDefs.push({
        action: TelegramAction.WIZARD_BACK,
        resourceId: flowId,
        metadata: { toStep: backStep },
        singleUse: true,
      });
    }
    navDefs.push({
      action: TelegramAction.WIZARD_CANCEL,
      resourceId: flowId,
      singleUse: true,
    });
    const tokens = await this.tokens.create(identityId, navDefs, expiry);
    const row: TelegramButton[] = [];
    let idx = 0;
    if (backStep !== undefined) {
      row.push({ text: '⬅️ Back', callbackData: callbackData(required(tokens[idx++])) });
    }
    row.push({ text: '❌ Cancel', callbackData: callbackData(required(tokens[idx])) });
    return row;
  }

  private async search(
    actor: TelegramActor,
    query: string,
    page: number,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.VIEW_PRODUCTS);
    if (!(await this.repository.consumeRateLimit(actor.identityId, 'search', 20, 60))) {
      return one('Search limit reached. Please wait and try again.');
    }
    const PAGE_SIZE_SEARCH = 4;
    const result = await this.searchProducts.execute({ query, limit: 20 });
    const offset = page * PAGE_SIZE_SEARCH;
    const items = result.items.slice(offset, offset + PAGE_SIZE_SEARCH);
    if (items.length === 0) return one('No products found.');
    const expiresAt = this.expiry();
    const itemTokens = await this.tokens.create(
      actor.identityId,
      items.map((item) => ({
        action: TelegramAction.SELECT_PRODUCT,
        resourceId: item.product.sku,
      })),
      expiresAt,
    );
    const rows = items.map((item, index) => [
      {
        text: `Select ${item.product.sku} — ${item.product.product_name.slice(0, 20)}…`,
        callbackData: callbackData(required(itemTokens[index])),
      },
    ]);
    if (offset + PAGE_SIZE_SEARCH < result.items.length) {
      const [next] = await this.tokens.create(
        actor.identityId,
        [
          {
            action: TelegramAction.SEARCH_PAGE,
            resourceId: 'search',
            metadata: { query, page: page + 1 },
          },
        ],
        expiresAt,
      );
      rows.push([{ text: 'Next page ➡️', callbackData: callbackData(required(next)) }]);
    }
    await this.repository.appendAudit({
      actor,
      action: 'TELEGRAM_PRODUCT_SEARCHED',
      metadata: { queryLength: query.length, resultCount: result.items.length },
    });
    return {
      messages: [
        {
          text: items
            .map((item, index) =>
              formatProductCardCompact(item, offset + index, this.formatOptions),
            )
            .join('\n\n'),
          buttons: rows,
        },
      ],
    };
  }

  private async searchFromToken(
    actor: TelegramActor,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    const query = typeof metadata?.query === 'string' ? metadata.query : '';
    const page = typeof metadata?.page === 'number' ? metadata.page : -1;
    if (page < 0) return one(ACTION_EXPIRED);
    return this.renderProductSelection(actor, query, page, 'EDIT_TEXT');
  }

  private async status(actor: TelegramActor): Promise<TelegramResponse> {
    this.require(actor, Permission.VIEW_OWN_CONTENT);
    const jobs = await this.repository.listRecentJobs(actor, 10);
    if (jobs.length === 0) return one('📋 No recent content jobs.');
    return one(
      [
        '📋 *Recent Content Jobs*',
        '',
        ...jobs.map((job) => formatJobSummary(job, this.formatOptions)),
      ].join('\n'),
    );
  }

  private async history(actor: TelegramActor, sku: string): Promise<TelegramResponse> {
    this.require(actor, Permission.VIEW_OWN_CONTENT);
    const jobs = await this.repository.listHistory(actor, parseSku(sku), 10);
    if (jobs.length === 0) return one('📜 No content history found for this SKU.');
    return one(
      [
        `📜 *Content History for SKU: ${parseSku(sku)}*`,
        '',
        ...jobs.map((job) => formatJobSummary(job, this.formatOptions)),
      ].join('\n'),
    );
  }

  private async viewSource(actor: TelegramActor, jobId: string): Promise<TelegramResponse> {
    this.require(actor, Permission.VIEW_OWN_CONTENT);
    const source = await this.repository.getSourceByJobId(actor, jobId);
    if (source === null) return one('Source facts are unavailable or access is denied.');
    await this.repository.appendAudit({
      actor,
      action: 'TELEGRAM_SOURCE_VIEWED',
      resourceType: 'ContentJob',
      resourceId: jobId,
    });
    return many(formatProduct(source, this.formatOptions));
  }

  private async viewValidation(actor: TelegramActor, versionId: string): Promise<TelegramResponse> {
    this.require(actor, Permission.VIEW_OWN_CONTENT);
    const validation = await this.repository.getValidationByVersionId(actor, versionId);
    if (validation === null) return one('Validation is unavailable or access is denied.');
    await this.repository.appendAudit({
      actor,
      action: 'TELEGRAM_VALIDATION_VIEWED',
      resourceType: 'ContentVersion',
      resourceId: versionId,
    });
    return many(formatValidation(validation, this.formatOptions));
  }

  private async selectionTokens(
    actor: TelegramActor,
    flow: TelegramCreateFlow,
    action: TelegramAction,
    values: readonly string[],
  ): Promise<readonly string[]> {
    return this.tokens.create(
      actor.identityId,
      values.map((value) => ({ action, resourceId: flow.id, metadata: { value } })),
      flow.expiresAt,
    );
  }

  private async promptEdit(
    actor: TelegramActor,
    versionId: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.EDIT_CONTENT);
    const jobId =
      (metadata?.contentJobId as string | undefined) ?? (await this.getJobIdByVersion(versionId));
    if (jobId === undefined) return one('Content job not found.');

    const review = await this.reviewState.execute(jobId);
    if (review === null) return one('Content job not found.');
    if (review.jobStatus === 'APPROVED')
      return one('This job is already approved and cannot be edited.');
    if (review.jobStatus === 'REJECTED') return one('This job is rejected and cannot be edited.');
    if (review.activeRevision !== undefined)
      return one('A revision is already in progress for this job.');

    const expiresAt = new Date(Date.now() + 15 * 60 * 1_000);
    await this.repository.createPendingInteraction({
      telegramIdentityId: actor.identityId,
      contentJobId: jobId,
      contentVersionId: versionId,
      action: 'EDIT',
      expiresAt,
    });

    const tokenDefs = [
      {
        action: TelegramAction.EDIT_CONTENT_FIELD,
        resourceId: versionId,
        metadata: { contentJobId: jobId, field: 'headline' },
      },
      {
        action: TelegramAction.EDIT_CONTENT_FIELD,
        resourceId: versionId,
        metadata: { contentJobId: jobId, field: 'cta' },
      },
      {
        action: TelegramAction.EDIT_CONTENT_FIELD,
        resourceId: versionId,
        metadata: { contentJobId: jobId, field: 'englishCaption' },
      },
      {
        action: TelegramAction.EDIT_CONTENT_FIELD,
        resourceId: versionId,
        metadata: { contentJobId: jobId, field: 'khmerCaption' },
      },
      {
        action: TelegramAction.CHANGE_CONTENT_LANGUAGE,
        resourceId: versionId,
        metadata: { contentJobId: jobId },
      },
      {
        action: TelegramAction.RESTORE_CONTENT_VERSION,
        resourceId: versionId,
        metadata: { contentJobId: jobId },
      },
      {
        action: TelegramAction.REQUEST_REGENERATE,
        resourceId: versionId,
        metadata: { contentJobId: jobId },
      },
      { action: TelegramAction.CANCEL_ACTION, resourceId: jobId, singleUse: true },
    ];

    const tokens = await this.tokens.create(actor.identityId, tokenDefs, expiresAt);

    return {
      messages: [
        {
          text: `✏️ *Request Revision / Revise Content Copy for #${short(jobId)}*\n\nPlease reply with your instructions for the revision, or select a field to edit, change language, or restore a prior version below:\n\nType /cancel to abort.`,
          buttons: [
            [
              { text: '✍️ Headline', callbackData: callbackData(required(tokens[0])) },
              { text: '✍️ CTA', callbackData: callbackData(required(tokens[1])) },
            ],
            [
              { text: '✍️ English Copy', callbackData: callbackData(required(tokens[2])) },
              { text: '✍️ Khmer Copy', callbackData: callbackData(required(tokens[3])) },
            ],
            [
              { text: '🌐 Change Language', callbackData: callbackData(required(tokens[4])) },
              { text: '📜 Restore Version', callbackData: callbackData(required(tokens[5])) },
            ],
            [
              { text: '🔄 Regenerate All', callbackData: callbackData(required(tokens[6])) },
              { text: '❌ Cancel', callbackData: callbackData(required(tokens[7])) },
            ],
          ],
        },
      ],
    };
  }

  private async promptEditField(
    actor: TelegramActor,
    versionId: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.EDIT_CONTENT);
    const jobId =
      (metadata?.contentJobId as string | undefined) ?? (await this.getJobIdByVersion(versionId));
    if (jobId === undefined) return one('Content job not found.');
    const field = (metadata?.field as CopyEditableField | undefined) ?? 'headline';

    const expiresAt = new Date(Date.now() + 15 * 60 * 1_000);
    this.pendingEditFields.set(actor.identityId, { field, versionId, jobId });
    await this.repository.createPendingInteraction({
      telegramIdentityId: actor.identityId,
      contentJobId: jobId,
      contentVersionId: versionId,
      action: 'EDIT',
      expiresAt,
    });

    const [cancelToken] = await this.tokens.create(
      actor.identityId,
      [{ action: TelegramAction.CANCEL_ACTION, resourceId: jobId, singleUse: true }],
      expiresAt,
    );

    const friendlyField =
      field === 'headline'
        ? 'Headline'
        : field === 'englishCaption'
          ? 'English copy'
          : field === 'khmerCaption'
            ? 'Khmer copy'
            : 'CTA';

    return {
      messages: [
        {
          text: `✍️ *Edit ${friendlyField} for #${short(jobId)}*\n\nPlease reply with the new text for this field.\n\nType /cancel to abort.`,
          buttons: [[{ text: '❌ Cancel', callbackData: callbackData(required(cancelToken)) }]],
        },
      ],
    };
  }

  private async promptChangeLanguage(
    actor: TelegramActor,
    versionId: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.EDIT_CONTENT);
    const jobId =
      (metadata?.contentJobId as string | undefined) ?? (await this.getJobIdByVersion(versionId));
    if (jobId === undefined) return one('Content job not found.');

    const targetLanguage = metadata?.targetLanguage as ContentLanguage | undefined;
    if (targetLanguage !== undefined && this.reviseContent !== undefined) {
      const result = await this.reviseContent.changeLanguage({
        contentJobId: jobId,
        contentVersionId: versionId,
        targetLanguage,
        actorUserId: actor.internalUserId,
        actorRoles: actor.roles,
      });
      await this.repository.appendAudit({
        actor,
        action: 'TELEGRAM_CONTENT_LANGUAGE_CHANGED',
        resourceType: 'ContentVersion',
        resourceId: result.version.id,
        metadata: {
          contentJobId: jobId,
          targetLanguage,
          versionNumber: result.version.versionNumber,
        },
      });
      return await this.renderDraftCardResponse(
        actor,
        result.version.id,
        `🌐 *Language changed to ${targetLanguage}!* (Version V${String(result.version.versionNumber)})`,
      );
    }

    const expiresAt = this.expiry();
    const tokenDefs: {
      action: TelegramAction;
      resourceId: string;
      metadata?: Record<string, unknown>;
      singleUse?: boolean;
    }[] = [
      {
        action: TelegramAction.CHANGE_CONTENT_LANGUAGE,
        resourceId: versionId,
        metadata: { contentJobId: jobId, targetLanguage: 'KM' },
      },
      {
        action: TelegramAction.CHANGE_CONTENT_LANGUAGE,
        resourceId: versionId,
        metadata: { contentJobId: jobId, targetLanguage: 'EN' },
      },
      {
        action: TelegramAction.CHANGE_CONTENT_LANGUAGE,
        resourceId: versionId,
        metadata: { contentJobId: jobId, targetLanguage: 'BILINGUAL' },
      },
      { action: TelegramAction.CANCEL_ACTION, resourceId: jobId, singleUse: true },
    ];
    const tokens = await this.tokens.create(actor.identityId, tokenDefs, expiresAt);

    return {
      messages: [
        {
          text: `🌐 *Change Language for #${short(jobId)}*\n\nSelect target language:`,
          buttons: [
            [
              { text: '🇰🇭 ខ្មែរ (Khmer)', callbackData: callbackData(required(tokens[0])) },
              { text: '🇬🇧 English', callbackData: callbackData(required(tokens[1])) },
            ],
            [
              { text: '🌐 Bilingual (KM + EN)', callbackData: callbackData(required(tokens[2])) },
              { text: '❌ Cancel', callbackData: callbackData(required(tokens[3])) },
            ],
          ],
        },
      ],
    };
  }

  private async promptRestoreVersion(
    actor: TelegramActor,
    versionId: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.EDIT_CONTENT);
    const jobId =
      (metadata?.contentJobId as string | undefined) ?? (await this.getJobIdByVersion(versionId));
    if (jobId === undefined) return one('Content job not found.');

    const targetVersionId = metadata?.targetVersionId as string | undefined;
    if (targetVersionId !== undefined && this.reviseContent !== undefined) {
      const result = await this.reviseContent.restoreVersion({
        contentJobId: jobId,
        targetVersionId,
        actorUserId: actor.internalUserId,
        actorRoles: actor.roles,
      });
      await this.repository.appendAudit({
        actor,
        action: 'TELEGRAM_CONTENT_VERSION_RESTORED',
        resourceType: 'ContentVersion',
        resourceId: result.version.id,
        metadata: {
          contentJobId: jobId,
          targetVersionId,
          versionNumber: result.version.versionNumber,
        },
      });
      return await this.renderDraftCardResponse(
        actor,
        result.version.id,
        `📜 *Restored to Version V${String(result.version.versionNumber)}!*`,
      );
    }

    const previousVersions = await this.repository.getPreviousVersions(actor, jobId);
    const candidates = previousVersions.filter((v) => v.id !== versionId);
    if (candidates.length === 0) {
      return one('No earlier versions available to restore for this job.');
    }

    const expiresAt = this.expiry();
    const tokenDefs: {
      action: TelegramAction;
      resourceId: string;
      metadata?: Record<string, unknown>;
      singleUse?: boolean;
    }[] = candidates.slice(0, 5).map((v) => ({
      action: TelegramAction.RESTORE_CONTENT_VERSION,
      resourceId: versionId,
      metadata: { contentJobId: jobId, targetVersionId: v.id },
    }));
    tokenDefs.push({
      action: TelegramAction.CANCEL_ACTION,
      resourceId: jobId,
      singleUse: true,
    });

    const tokens = await this.tokens.create(actor.identityId, tokenDefs, expiresAt);
    const buttons: TelegramButton[][] = candidates.slice(0, 5).map((v, i) => [
      {
        text: `↩️ Restore V${String(v.versionNumber)}: ${v.headline.slice(0, 25)}…`,
        callbackData: callbackData(required(tokens[i])),
      },
    ]);
    buttons.push([
      { text: '❌ Cancel', callbackData: callbackData(required(tokens[tokens.length - 1])) },
    ]);

    return {
      messages: [
        {
          text: `📜 *Restore Prior Version for #${short(jobId)}*\n\nSelect a prior version to restore:`,
          buttons,
        },
      ],
    };
  }

  private async renderDraftCardResponse(
    actor: TelegramActor,
    versionId: string,
    noticeText?: string,
  ): Promise<TelegramResponse> {
    const view = await this.repository.getDraftViewByVersionId(versionId);
    if (!view) {
      return one(noticeText ?? 'Draft version updated.');
    }

    const expiresAt = this.expiry();
    const roles = view.requesterRoles ?? actor.roles ?? [];
    const canEdit = this.permissions.hasAnyRolePermission(roles, Permission.EDIT_CONTENT);
    const canRegenerate = this.permissions.hasAnyRolePermission(
      roles,
      Permission.REGENERATE_CONTENT,
    );
    const canApprove =
      this.permissions.hasAnyRolePermission(roles, Permission.APPROVE_CONTENT) &&
      view.validation.status !== 'BLOCKED' &&
      view.validation.status !== 'FAILED';
    const canReject = this.permissions.hasAnyRolePermission(roles, Permission.REJECT_CONTENT);
    const hasHistory = (view.allVersions?.length ?? 1) > 1;

    const tokenDefs: {
      action: TelegramAction;
      resourceId: string;
      metadata?: Record<string, unknown>;
      singleUse?: boolean;
    }[] = [
      { action: TelegramAction.VIEW_SOURCE, resourceId: view.jobId, singleUse: false },
      { action: TelegramAction.VIEW_VALIDATION, resourceId: versionId, singleUse: false },
    ];

    if (canEdit) {
      tokenDefs.push({
        action: TelegramAction.REQUEST_EDIT,
        resourceId: versionId,
        metadata: { contentJobId: view.jobId, versionNumber: view.versionNumber },
        singleUse: false,
      });
    }
    if (canRegenerate) {
      tokenDefs.push({
        action: TelegramAction.REQUEST_REGENERATE,
        resourceId: versionId,
        metadata: { contentJobId: view.jobId, versionNumber: view.versionNumber },
        singleUse: false,
      });
    }
    if (canApprove) {
      tokenDefs.push({
        action: TelegramAction.APPROVE_PROMPT,
        resourceId: versionId,
        metadata: { contentJobId: view.jobId, versionNumber: view.versionNumber },
        singleUse: false,
      });
    }
    if (canReject) {
      tokenDefs.push({
        action: TelegramAction.REJECT_PROMPT,
        resourceId: versionId,
        metadata: { contentJobId: view.jobId, versionNumber: view.versionNumber },
        singleUse: false,
      });
    }
    if (hasHistory) {
      tokenDefs.push({
        action: TelegramAction.VIEW_PREVIOUS,
        resourceId: view.jobId,
        metadata: { versionId },
        singleUse: false,
      });
    }

    const createdTokens = await this.tokens.create(actor.identityId, tokenDefs, expiresAt);
    let tokenIndex = 0;
    const sourceToken = createdTokens[tokenIndex++];
    const validationToken = createdTokens[tokenIndex++];
    const editToken = canEdit ? createdTokens[tokenIndex++] : undefined;
    const regenerateToken = canRegenerate ? createdTokens[tokenIndex++] : undefined;
    const approveToken = canApprove ? createdTokens[tokenIndex++] : undefined;
    const rejectToken = canReject ? createdTokens[tokenIndex++] : undefined;
    const historyToken = hasHistory ? createdTokens[tokenIndex] : undefined;

    const buttonRows: TelegramButton[][] = [
      [
        { text: '📋 Source Facts', callbackData: callbackData(required(sourceToken)) },
        { text: '🛡️ Validation Details', callbackData: callbackData(required(validationToken)) },
      ],
    ];

    const editRow: TelegramButton[] = [];
    if (editToken !== undefined) {
      editRow.push({ text: '✏️ Request Edit', callbackData: callbackData(editToken) });
    }
    if (regenerateToken !== undefined) {
      editRow.push({ text: '🔄 Regenerate', callbackData: callbackData(regenerateToken) });
    }
    if (editRow.length > 0) buttonRows.push(editRow);

    const reviewRow: TelegramButton[] = [];
    if (approveToken !== undefined) {
      reviewRow.push({ text: '✅ Approve', callbackData: callbackData(approveToken) });
    }
    if (rejectToken !== undefined) {
      reviewRow.push({ text: '❌ Reject', callbackData: callbackData(rejectToken) });
    }
    if (reviewRow.length > 0) buttonRows.push(reviewRow);

    if (historyToken !== undefined) {
      buttonRows.push([{ text: '📜 Version History', callbackData: callbackData(historyToken) }]);
    }

    const draftText = formatDraft(view, this.formatOptions);
    const fullText = noticeText ? `${noticeText}\n\n${draftText}` : draftText;
    const texts = splitTelegramMessage(fullText);

    return {
      messages: texts.map((text, idx) => ({
        text,
        ...(idx === texts.length - 1 ? { buttons: buttonRows } : {}),
      })),
    };
  }

  private async requestRegenerate(
    actor: TelegramActor,
    versionId: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.REGENERATE_CONTENT);
    const jobId =
      (metadata?.contentJobId as string | undefined) ?? (await this.getJobIdByVersion(versionId));
    if (jobId === undefined) return one('Content job not found.');

    const revision = await this.requestContentRegeneration.execute({
      contentJobId: jobId,
      contentVersionId: versionId,
      actorUserId: actor.internalUserId,
      actorRoles: actor.roles,
    });

    await this.repository.appendAudit({
      actor,
      action: 'TELEGRAM_CONTENT_REGENERATE_REQUESTED',
      resourceType: 'RevisionRequest',
      resourceId: revision.id,
      metadata: { contentJobId: jobId },
    });

    return one(
      `🔄 Regeneration requested for #${short(jobId)}.\nGenerating a fresh draft. You will be notified when it is ready.`,
    );
  }

  private async promptApprove(
    actor: TelegramActor,
    versionId: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.APPROVE_CONTENT);
    const jobId =
      (metadata?.contentJobId as string | undefined) ?? (await this.getJobIdByVersion(versionId));
    if (jobId === undefined) return one('Content job not found.');

    const review = await this.reviewState.execute(jobId);
    if (review === null) return one('Content job not found.');
    if (review.jobStatus === 'APPROVED') return one('This job is already approved.');
    if (review.jobStatus === 'REJECTED') return one('This job is rejected.');
    if (review.activeRevision !== undefined)
      return one('Cannot approve while a revision is in progress.');
    const targetVersion = review.versions.find((v) => v.id === versionId) ?? review.versions[0];
    if (targetVersion?.approvalEligible === false) {
      return one('❌ This draft has blocking factual issues and cannot be approved.');
    }

    const versionNumber =
      (metadata?.versionNumber as number | undefined) ?? review.currentVersionNumber ?? 1;
    const expiresAt = this.expiry();
    const [confirmToken, cancelToken] = await this.tokens.create(
      actor.identityId,
      [
        {
          action: TelegramAction.CONFIRM_APPROVE,
          resourceId: versionId,
          metadata: { contentJobId: jobId, versionNumber },
          singleUse: true,
        },
        {
          action: TelegramAction.CANCEL_ACTION,
          resourceId: jobId,
          singleUse: true,
        },
      ],
      expiresAt,
    );

    return {
      messages: [
        {
          text: `⚠️ *Confirm Approval*\n\nAre you sure you want to approve version V${String(versionNumber)} for #${short(jobId)}?\n\nOnce approved, this job is marked as APPROVED (final). This action cannot be undone.`,
          buttons: [
            [
              { text: '✅ Confirm Approve', callbackData: callbackData(required(confirmToken)) },
              { text: '❌ Cancel', callbackData: callbackData(required(cancelToken)) },
            ],
          ],
        },
      ],
    };
  }

  private async confirmApprove(
    actor: TelegramActor,
    versionId: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.APPROVE_CONTENT);
    const jobId =
      (metadata?.contentJobId as string | undefined) ?? (await this.getJobIdByVersion(versionId));
    if (jobId === undefined) return one('Content job not found.');

    const approval = await this.approveContent.execute({
      contentJobId: jobId,
      contentVersionId: versionId,
      approverUserId: actor.internalUserId,
      approverRoles: actor.roles,
    });

    await this.repository.appendAudit({
      actor,
      action: 'TELEGRAM_CONTENT_APPROVED',
      resourceType: 'ApprovalEvent',
      resourceId: approval.id,
      metadata: { contentJobId: jobId, contentVersionId: versionId },
    });

    const versionNumber = (metadata?.versionNumber as number | undefined) ?? 1;
    return one(
      `✅ *Version V${String(versionNumber)} Approved*\n\nApproved by ${actor.displayName}.\nContent job #${short(jobId)} is now APPROVED.`,
    );
  }

  private async promptReject(
    actor: TelegramActor,
    versionId: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.REJECT_CONTENT);
    const jobId =
      (metadata?.contentJobId as string | undefined) ?? (await this.getJobIdByVersion(versionId));
    if (jobId === undefined) return one('Content job not found.');

    const review = await this.reviewState.execute(jobId);
    if (review === null) return one('Content job not found.');
    if (review.jobStatus === 'APPROVED')
      return one('This job is already approved and cannot be rejected.');
    if (review.jobStatus === 'REJECTED') return one('This job is already rejected.');

    const expiresAt = new Date(Date.now() + 15 * 60 * 1_000);
    await this.repository.createPendingInteraction({
      telegramIdentityId: actor.identityId,
      contentJobId: jobId,
      contentVersionId: versionId,
      action: 'REJECT',
      expiresAt,
    });

    const [cancelToken] = await this.tokens.create(
      actor.identityId,
      [{ action: TelegramAction.CANCEL_ACTION, resourceId: jobId, singleUse: true }],
      expiresAt,
    );

    return {
      messages: [
        {
          text: `❌ *Reject Draft #${short(jobId)}*\n\nPlease reply with a comment explaining why this draft is rejected.\n\nType /cancel to abort.`,
          buttons: [[{ text: '❌ Cancel', callbackData: callbackData(required(cancelToken)) }]],
        },
      ],
    };
  }

  private async viewPrevious(actor: TelegramActor, jobId: string): Promise<TelegramResponse> {
    this.require(actor, Permission.VIEW_OWN_CONTENT);
    const versions = await this.repository.getPreviousVersions(actor, jobId);
    if (versions.length === 0) return one('No versions found for this job.');
    const draft = await this.repository.getDraftViewByVersionId(versions[0]?.id ?? '');
    const productName = draft?.productName ?? 'Product';
    return one(formatPreviousVersions(jobId, productName, versions, this.formatOptions));
  }

  private async cancelAction(actor: TelegramActor): Promise<TelegramResponse> {
    this.pendingEditFields.delete(actor.identityId);
    const active = await this.repository.findActivePendingInteraction(actor.identityId, new Date());
    if (active !== null) {
      await this.repository.cancelPendingInteraction(active.id, new Date());
    }
    return one('Action cancelled.');
  }

  private async getJobIdByVersion(versionId: string): Promise<string | undefined> {
    const draft = await this.repository.getDraftViewByVersionId(versionId);
    return draft?.jobId;
  }

  private require(actor: TelegramActor, permission: Permission): void {
    if (!this.permissions.hasAnyRolePermission(actor.roles, permission)) {
      throw new ForbiddenError({ publicMessage: ACCESS_DENIED });
    }
  }

  private expiry(): Date {
    return new Date(Date.now() + this.policy.actionTokenTtlSeconds * 1_000);
  }
}

function one(text: string, action?: TelegramMessageAction): TelegramResponse {
  return { messages: [{ text, ...(action !== undefined ? { action } : {}) }] };
}
function many(text: string): TelegramResponse {
  return { messages: splitTelegramMessage(text).map((part) => ({ text: part })) };
}
function welcomeText(actor: TelegramActor): string {
  return [
    '✨ *Parisian Shopper AI — Content Studio*',
    '',
    `Welcome, *${actor.displayName}*!`,
    `Role: *${actor.roles.map(friendly).join(', ')}*`,
    '',
    'Transform verified luxury products into brand-aligned social content with automated factual verification and strict human review governance.',
    '',
    helpText(actor, new PermissionService()),
  ].join('\n');
}
function helpText(actor: TelegramActor, permissions: PermissionService): string {
  const commands = ['/search <keyword>', '/status', '/history <SKU>', '/resume', '/cancel'];
  if (permissions.hasAnyRolePermission(actor.roles, Permission.CREATE_CONTENT)) {
    commands.unshift('/create <SKU> (or /create to browse catalogue)');
  }
  return [
    'Available commands:',
    ...commands,
    '/help',
    '',
    '🛡️ *Human Governance Policy:*',
    'AI-assisted drafts require human review. Factual validation reduces risk but is not a guarantee.',
  ].join('\n');
}

function extractStepHistory(
  metadata: TelegramWorkflowMetadata | undefined,
  fallbackLastStep: number,
): number[] {
  const raw = metadata?.stepHistory ?? metadata?.history;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((v) => Number(v)).filter((v) => !Number.isNaN(v));
  }
  return fallbackLastStep > 1 ? Array.from({ length: fallbackLastStep }, (_, i) => i + 1) : [1];
}
function applicableContentTypes(
  product: Awaited<ReturnType<GetProductBySkuUseCase['execute']>>,
): readonly ('PRODUCT_SPOTLIGHT' | 'PROMOTION' | 'SCENT_PYRAMID' | 'EDUCATIONAL' | 'ENGAGEMENT')[] {
  return [
    'PRODUCT_SPOTLIGHT',
    ...(product.product.promo_price === undefined && product.product.discount === undefined
      ? []
      : (['PROMOTION'] as const)),
    ...(product.product.fragrance_notes === undefined ? [] : (['SCENT_PYRAMID'] as const)),
    'EDUCATIONAL',
    'ENGAGEMENT',
  ];
}
function assertCompleteSelections(flow: TelegramCreateFlow): asserts flow is TelegramCreateFlow & {
  contentType: NonNullable<TelegramCreateFlow['contentType']>;
  language: NonNullable<TelegramCreateFlow['language']>;
  platform: NonNullable<TelegramCreateFlow['platform']>;
} {
  if (flow.contentType === undefined || flow.language === undefined || flow.platform === undefined)
    throw new Error('The selection flow is incomplete');
}
function friendly(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./u, (character) => character.toUpperCase());
}
function required(value: string | undefined): string {
  if (value === undefined) throw new Error('Required value missing');
  return value;
}
function short(value: string): string {
  return value.replaceAll('-', '').slice(0, 8).toUpperCase();
}
