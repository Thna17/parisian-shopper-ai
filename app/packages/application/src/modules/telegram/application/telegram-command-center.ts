import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '@parisian-shopper/common';

import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import {
  BRAND_RULE_REPOSITORY,
  type BrandRuleRepository,
} from '../../brand/application/brand-rule.repository.js';
import { CreateContentJobUseCase } from '../../content/application/create-content-job.use-case.js';
import {
  contentLanguageSchema,
  contentPlatformSchema,
  contentTypeSchema,
} from '../../content/domain/content.js';
import { CreateProductSnapshotUseCase } from '../../products/application/create-product-snapshot.use-case.js';
import { GetProductBySkuUseCase } from '../../products/application/get-product-by-sku.use-case.js';
import { SearchProductsUseCase } from '../../products/application/search-products.use-case.js';
import { parseSku } from '../../products/domain/product-input.js';
import {
  TelegramAction,
  type TelegramActor,
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
  formatJobSummary,
  formatProduct,
  formatValidation,
  splitTelegramMessage,
} from './telegram-formatters.js';
import {
  TELEGRAM_WORKFLOW_REPOSITORY,
  type TelegramCreateFlow,
  type TelegramWorkflowRepository,
} from './telegram-workflow.repository.js';

export const TELEGRAM_WORKFLOW_POLICY = Symbol('TELEGRAM_WORKFLOW_POLICY');
export interface TelegramWorkflowPolicy {
  actionTokenTtlSeconds: number;
}

const ACCESS_DENIED = 'Access denied. This bot is restricted to authorized Parisian Shopper staff.';
const ACTION_EXPIRED = 'This action has expired. Please reopen the latest job.';
const PAGE_SIZE = 5;

export interface TelegramCommandInput {
  updateId: string;
  profile: TelegramUserProfile;
  text: string;
}

export interface TelegramCallbackInput {
  updateId: string;
  profile: TelegramUserProfile;
  callbackData: string;
}

@Injectable()
export class TelegramCommandCenter {
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
  ) {}

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
    try {
      switch (command.name) {
        case 'start':
          return one(welcomeText(actor));
        case 'help':
          return one(helpText(actor, this.permissions));
        case 'create':
          return await this.beginCreate(actor, command.argument);
        case 'search':
          return await this.search(actor, command.argument, 0);
        case 'status':
          return await this.status(actor);
        case 'history':
          return await this.history(actor, command.argument);
        default:
          return one('Unknown command. Use /help to see available commands.');
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
            ...(await this.beginCreate(actor, token.resourceId)),
            callbackNotice: 'Product selected.',
          };
        case TelegramAction.SELECT_CONTENT_TYPE:
          return {
            ...(await this.selectContentType(actor, token.resourceId, token.metadata)),
            callbackNotice: 'Content type selected.',
          };
        case TelegramAction.SELECT_LANGUAGE:
          return {
            ...(await this.selectLanguage(actor, token.resourceId, token.metadata)),
            callbackNotice: 'Language selected.',
          };
        case TelegramAction.SELECT_PLATFORM:
          return {
            ...(await this.selectPlatform(actor, token.resourceId, token.metadata)),
            callbackNotice: 'Generation requested.',
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
      }
    } catch (error) {
      const message = telegramSafeError(error);
      return { ...one(message), callbackNotice: message };
    }
  }

  private async beginCreate(actor: TelegramActor, sku: string): Promise<TelegramResponse> {
    this.require(actor, Permission.CREATE_CONTENT);
    if (!(await this.repository.consumeRateLimit(actor.identityId, 'create', 5, 60))) {
      return one('Creation limit reached. Please wait before requesting another draft.');
    }
    const product = await this.products.execute({ sku });
    const expiresAt = this.expiry();
    const flow = await this.repository.createFlow(actor.identityId, product, expiresAt);
    const choices = applicableContentTypes(product);
    const tokenValues = await this.tokens.create(
      actor.identityId,
      choices.map((value) => ({
        action: TelegramAction.SELECT_CONTENT_TYPE,
        resourceId: flow.id,
        metadata: { value },
      })),
      expiresAt,
    );
    await this.repository.appendAudit({
      actor,
      action: 'TELEGRAM_PRODUCT_SELECTED',
      resourceType: 'Product',
      resourceId: product.product.sku,
    });
    return {
      messages: [
        {
          text: `${formatProduct(product)}\n\nChoose a content type:`,
          buttons: choices.map((choice, index) => [
            { text: friendly(choice), callbackData: callbackData(required(tokenValues[index])) },
          ]),
        },
      ],
    };
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
    const result = await this.searchProducts.execute({ query, limit: 20 });
    const offset = page * PAGE_SIZE;
    const items = result.items.slice(offset, offset + PAGE_SIZE);
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
        text: `Select ${item.product.sku}`,
        callbackData: callbackData(required(itemTokens[index])),
      },
    ]);
    if (offset + PAGE_SIZE < result.items.length) {
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
      rows.push([{ text: 'Next page', callbackData: callbackData(required(next)) }]);
    }
    await this.repository.appendAudit({
      actor,
      action: 'TELEGRAM_PRODUCT_SEARCHED',
      metadata: { queryLength: query.length, resultCount: result.items.length },
    });
    return {
      messages: [
        {
          text: items.map((item, index) => `${index + 1}. ${formatProduct(item)}`).join('\n\n'),
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
    return this.search(actor, query, page);
  }

  private async selectContentType(
    actor: TelegramActor,
    flowId: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.CREATE_CONTENT);
    const value = contentTypeSchema.parse(metadata?.value);
    const flow = await this.repository.updateFlowSelection(flowId, 'contentType', value);
    const values = ['KM', 'EN', 'BILINGUAL'] as const;
    const tokens = await this.selectionTokens(actor, flow, TelegramAction.SELECT_LANGUAGE, values);
    return selectionResponse('Choose a language:', values, tokens);
  }

  private async selectLanguage(
    actor: TelegramActor,
    flowId: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.CREATE_CONTENT);
    const value = contentLanguageSchema.parse(metadata?.value);
    const flow = await this.repository.updateFlowSelection(flowId, 'language', value);
    const values = ['FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'GENERIC'] as const;
    const tokens = await this.selectionTokens(actor, flow, TelegramAction.SELECT_PLATFORM, values);
    return selectionResponse(
      'Choose the target platform. This generates content; it does not publish:',
      values,
      tokens,
    );
  }

  private async selectPlatform(
    actor: TelegramActor,
    flowId: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<TelegramResponse> {
    this.require(actor, Permission.CREATE_CONTENT);
    const value = contentPlatformSchema.parse(metadata?.value);
    const flow = await this.repository.updateFlowSelection(flowId, 'platform', value);
    const existing = await this.repository.findJobByFlowId(flow.id);
    if (existing !== null)
      return one(
        `Content job #${short(existing.jobId)} is already ${existing.jobStatus.toLowerCase()}.`,
      );
    assertCompleteSelections(flow);
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
    });
    await this.repository.completeFlow(flow.id);
    await this.generation.enqueue(job.id);
    await this.repository.appendAudit({
      actor,
      action: 'TELEGRAM_JOB_CREATED',
      resourceType: 'ContentJob',
      resourceId: job.id,
    });
    await this.repository.appendAudit({
      actor,
      action: 'TELEGRAM_CONTENT_REQUESTED',
      resourceType: 'ContentJob',
      resourceId: job.id,
    });
    return one(
      `Generating content for ${flow.product.product.product_name}…\nJob #${short(job.id)}`,
    );
  }

  private async status(actor: TelegramActor): Promise<TelegramResponse> {
    this.require(actor, Permission.VIEW_OWN_CONTENT);
    const jobs = await this.repository.listRecentJobs(actor, 10);
    return one(
      jobs.length === 0 ? 'No recent content jobs.' : jobs.map(formatJobSummary).join('\n'),
    );
  }

  private async history(actor: TelegramActor, sku: string): Promise<TelegramResponse> {
    this.require(actor, Permission.VIEW_OWN_CONTENT);
    const jobs = await this.repository.listHistory(actor, parseSku(sku), 10);
    return one(
      jobs.length === 0
        ? 'No content history found for this SKU.'
        : jobs.map(formatJobSummary).join('\n'),
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
    return many(formatProduct(source));
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
    return many(formatValidation(validation));
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

  private require(actor: TelegramActor, permission: Permission): void {
    if (!this.permissions.hasAnyRolePermission(actor.roles, permission)) {
      throw new ForbiddenError({ publicMessage: ACCESS_DENIED });
    }
  }

  private expiry(): Date {
    return new Date(Date.now() + this.policy.actionTokenTtlSeconds * 1_000);
  }
}

function one(text: string): TelegramResponse {
  return { messages: [{ text }] };
}
function many(text: string): TelegramResponse {
  return { messages: splitTelegramMessage(text).map((part) => ({ text: part })) };
}
function selectionResponse(
  prompt: string,
  values: readonly string[],
  tokens: readonly string[],
): TelegramResponse {
  return {
    messages: [
      {
        text: prompt,
        buttons: values.map((value, index) => [
          { text: friendly(value), callbackData: callbackData(required(tokens[index])) },
        ]),
      },
    ],
  };
}
function welcomeText(actor: TelegramActor): string {
  return `Parisian Shopper AI Content Assistant\n\nWelcome, ${actor.displayName}.\n\n${helpText(actor, new PermissionService())}`;
}
function helpText(actor: TelegramActor, permissions: PermissionService): string {
  const commands = ['/search <keyword>', '/status', '/history <SKU>'];
  if (permissions.hasAnyRolePermission(actor.roles, Permission.CREATE_CONTENT))
    commands.unshift('/create <SKU>');
  return `Available commands:\n${commands.join('\n')}\n/help\n\nAI-assisted drafts require human review. Factual validation reduces risk but is not a guarantee.`;
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
