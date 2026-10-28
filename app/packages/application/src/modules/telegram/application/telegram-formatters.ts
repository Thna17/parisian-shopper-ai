import { type NormalizedProductEnvelope } from '../../products/domain/product.schema.js';
import { type PersistedValidationResult } from '../../validation/application/validation.repository.js';
import { type TelegramDraftView, type TelegramJobSummary } from './telegram-workflow.repository.js';

const TELEGRAM_SAFE_TEXT_LIMIT = 3_900;

export function splitTelegramMessage(text: string, limit = TELEGRAM_SAFE_TEXT_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const sections = text.split('\n\n');
  const chunks: string[] = [];
  let current = '';
  for (const section of sections) {
    if (section.length > limit) {
      if (current.length > 0) chunks.push(current);
      chunks.push(...splitByCodePoint(section, limit));
      current = '';
      continue;
    }
    const candidate = current.length === 0 ? section : `${current}\n\n${section}`;
    if (candidate.length > limit) {
      chunks.push(current);
      current = section;
    } else current = candidate;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export interface TelegramFormatOptions {
  readonly demoMode?: boolean;
}

export function formatProduct(
  product: NormalizedProductEnvelope,
  options?: TelegramFormatOptions,
): string {
  const value = product.product;
  const prefix = options?.demoMode ? '[DEMO] ' : '';
  return [
    `${prefix}Product: ${value.product_name}`,
    `Brand: ${value.brand}`,
    `SKU: ${value.sku}`,
    `Price: ${formatMoney(value.price, value.currency)}`,
    ...(value.promo_price === undefined
      ? []
      : [`Promotion: ${formatMoney(value.promo_price, value.currency)}`]),
    `Stock: ${friendlyStock(value.stock_status)}`,
    ...(value.size === undefined ? [] : [`Size: ${value.size.display}`]),
    ...(value.concentration === undefined ? [] : [`Concentration: ${value.concentration.code}`]),
  ].join('\n');
}

export function formatJobSummary(job: TelegramJobSummary, options?: TelegramFormatOptions): string {
  const prefix = options?.demoMode ? '[DEMO] ' : '';
  const validation =
    job.validationStatus === undefined ? '' : ` / ${friendlyValidation(job.validationStatus)}`;
  return `${prefix}#${shortReference(job.jobId)} ${job.productName} — ${friendlyJobStatus(job.jobStatus)}${validation}`;
}

export function formatDraft(view: TelegramDraftView, options?: TelegramFormatOptions): string {
  const prefix = options?.demoMode ? '[DEMO] ' : '';
  const status = validationBanner(view.validation);
  const output = view.output;
  const divider = '─────────────────────────';
  return [
    `${prefix}DRAFT #${shortReference(view.jobId)} — V${String(view.versionNumber ?? 1)}`,
    `Product: ${view.productName}`,
    `Content type: ${friendlyEnum(view.contentType)}`,
    `Language: ${friendlyEnum(view.language)}`,
    `Platform: ${friendlyEnum(view.platform)}`,
    divider,
    status,
    divider,
    `Headline:\n${output.headline}`,
    ...(output.khmerCaption === null ? [] : [`Khmer:\n${output.khmerCaption}`]),
    ...(output.englishCaption === null ? [] : [`English:\n${output.englishCaption}`]),
    `CTA:\n${output.cta}`,
    `Hashtags:\n${output.hashtags.join(' ')}`,
    divider,
    'Human review is still required.',
  ].join('\n\n');
}

export function formatValidation(
  result: PersistedValidationResult,
  options?: TelegramFormatOptions,
): string {
  const prefix = options?.demoMode ? '[DEMO] ' : '';
  const findings = result.findings
    .map((finding) => `${severityIcon(finding.severity)} ${finding.code}\n${finding.message}`)
    .join('\n\n');
  return `${prefix}${validationBanner(result)}${findings.length === 0 ? '' : `\n\n${findings}`}`;
}

export function validationBanner(result: PersistedValidationResult): string {
  if (result.status === 'BLOCKED' || result.status === 'FAILED') {
    return '❌ BLOCKED — factual issues detected; this draft cannot be approved.';
  }
  if (result.status === 'PASSED_WITH_WARNINGS') return '⚠️ Facts checked — warnings found.';
  return '✅ Facts checked — no blocking issues.';
}

export function callbackData(token: string): string {
  return `ps:${token}`;
}

function splitByCodePoint(value: string, limit: number): string[] {
  const points = Array.from(value);
  const result: string[] = [];
  for (let index = 0; index < points.length; index += limit) {
    result.push(points.slice(index, index + limit).join(''));
  }
  return result;
}

function formatMoney(amount: string, currency: string): string {
  return currency === 'USD' ? `$${amount}` : `${amount} ${currency}`;
}

function friendlyStock(value: string): string {
  return friendlyEnum(value);
}

function friendlyJobStatus(value: string): string {
  const map: Readonly<Record<string, string>> = {
    REQUESTED: 'Requested',
    GENERATING: 'Generating',
    DRAFT: 'Draft',
    UNDER_REVIEW: 'Under review',
    REVISION_REQUESTED: 'Revision requested',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    FAILED: 'Failed',
  };
  return map[value] ?? 'Unknown';
}

export function formatPreviousVersions(
  jobId: string,
  productName: string,
  versions: readonly {
    id: string;
    versionNumber: number;
    validationStatus?: string;
    createdAt: Date;
    headline: string;
  }[],
  options?: TelegramFormatOptions,
): string {
  const prefix = options?.demoMode ? '[DEMO] ' : '';
  const lines = [
    `${prefix}*Version History for #${shortReference(jobId)}*`,
    `Product: ${productName}`,
    `Total versions: ${String(versions.length)}`,
    '',
  ];
  for (const v of versions) {
    const val =
      v.validationStatus === undefined ? '' : ` [${friendlyValidation(v.validationStatus)}]`;
    lines.push(`• *V${String(v.versionNumber)}* (${v.createdAt.toISOString().slice(0, 10)})${val}`);
    if (v.headline.length > 0) {
      lines.push(`  "${v.headline}"`);
    }
  }
  return lines.join('\n');
}

function friendlyValidation(value: string): string {
  const map: Readonly<Record<string, string>> = {
    PASSED: 'Validated',
    PASSED_WITH_WARNINGS: 'Validated with warnings',
    BLOCKED: 'Blocked',
    FAILED: 'Validation failed',
  };
  return map[value] ?? 'Validation pending';
}

function friendlyEnum(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./u, (character) => character.toUpperCase());
}

function shortReference(id: string): string {
  return id.replaceAll('-', '').slice(0, 8).toUpperCase();
}

function severityIcon(value: string): string {
  return value === 'BLOCKING' ? '❌' : value === 'WARNING' ? '⚠️' : 'ℹ️';
}

/**
 * Escapes special characters for Telegram MarkdownV2 safely.
 */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

export function friendlyContentType(type: string): string {
  switch (type) {
    case 'PRODUCT_SPOTLIGHT':
      return '🛍 Product Spotlight';
    case 'SCENT_PYRAMID':
    case 'SCENT_STORY':
      return '🌿 Scent Story';
    case 'EDUCATIONAL':
      return '📚 Educational';
    case 'ENGAGEMENT':
      return '💬 Engagement';
    default:
      return friendlyEnum(type);
  }
}

export function friendlyLanguage(lang: string): string {
  switch (lang) {
    case 'KM':
      return '🇰🇭 ខ្មែរ';
    case 'EN':
      return '🇬🇧 English';
    case 'BILINGUAL':
      return '🌐 ខ្មែរ + English';
    default:
      return friendlyEnum(lang);
  }
}

export function friendlyFormat(platformOrFormat: string): string {
  switch (platformOrFormat) {
    case 'INSTAGRAM':
    case 'PORTRAIT_4_5':
      return 'Instagram Portrait · 1080×1350';
    case 'FACEBOOK':
    case 'FEED_SQUARE':
    case 'GENERIC':
      return 'Square Post · 1080×1080';
    case 'STORY':
    case 'STORY_9_16':
      return 'Story · 1080×1920';
    case 'TELEGRAM':
      return 'Telegram Post · 1080×1080';
    default:
      return friendlyEnum(platformOrFormat);
  }
}

export function formatProductCardCompact(
  product: NormalizedProductEnvelope,
  index?: number,
  _options?: TelegramFormatOptions,
): string {
  const value = product.product;
  const num = index !== undefined ? `${index + 1}. ` : '';
  const price = value.promo_price
    ? `${formatMoney(value.promo_price, value.currency)} (Regular: ${formatMoney(value.price, value.currency)})`
    : formatMoney(value.price, value.currency);
  const status = friendlyStock(value.stock_status);
  const size = value.size?.display ? ` · ${value.size.display}` : '';
  const brand = value.brand ? ` · ${value.brand}` : '';

  return [
    `${num}*${value.product_name}*`,
    `   • SKU: \`${value.sku}\`${brand}`,
    `   • Price: ${price}${size}`,
    `   • Status: ${status}`,
  ].join('\n');
}

export interface ProductSelectionSummaryDetails {
  items: readonly NormalizedProductEnvelope[];
  offset: number;
  totalCount: number;
  page: number;
  totalPages: number;
  query?: string;
  options?: TelegramFormatOptions;
}

export function formatProductSelectionSummary(details: ProductSelectionSummaryDetails): string {
  const prefix = details.options?.demoMode ? '[DEMO] ' : '';
  const pageIndicator =
    details.totalPages > 1 ? ` (Page ${details.page + 1}/${details.totalPages})` : '';
  const querySuffix = details.query ? ` matching "${details.query}"` : '';

  const lines: string[] = [
    `${prefix}🛍️ *Content Creation Wizard* · Step 1 of 6${pageIndicator}`,
    '*Select a Product*',
    '',
    `Choose a verified catalogue product to begin${querySuffix}:`,
    '',
  ];

  for (let i = 0; i < details.items.length; i++) {
    const item = details.items[i]!;
    const p = item.product;
    const priceStr = p.promo_price
      ? `$${p.promo_price} USD (Regular: $${p.price} USD)`
      : `$${p.price} USD`;
    lines.push(`${details.offset + i + 1}. *${p.product_name}* (\`${p.sku}\`) — ${priceStr}`);
  }

  lines.push('');
  lines.push('Choose a product below or type `/create <SKU>` to begin:');
  return lines.join('\n');
}

export interface ResumePromptDetails {
  productName: string;
  sku: string;
  step: number;
  totalSteps?: number;
  options?: TelegramFormatOptions;
}

export function formatResumePrompt(details: ResumePromptDetails): string {
  const prefix = details.options?.demoMode ? '[DEMO] ' : '';
  const total = details.totalSteps ?? 6;
  return [
    `${prefix}📋 *Draft in Progress Found*`,
    '',
    `You have an active, unfinished draft for *${details.productName}* (\`${details.sku}\`) at *Step ${details.step} of ${total}*.`,
    '',
    'Would you like to resume where you left off, start fresh with another product, or discard it?',
  ].join('\n');
}

export interface WizardStepDetails {
  step: number;
  totalSteps?: number | undefined;
  productName: string;
  sku: string;
  price?: string | undefined;
  stockStatus?: string | undefined;
  contentGoal?: string | undefined;
  language?: string | undefined;
  format?: string | undefined;
  stylePreset?: string | undefined;
  options?: TelegramFormatOptions | undefined;
}

export function formatWizardStep(details: WizardStepDetails): string {
  const total = details.totalSteps ?? 6;
  const prefix = details.options?.demoMode ? '[DEMO] ' : '';
  const lines: string[] = [
    `${prefix}🛍️ *Creation Wizard — Step ${details.step} of ${total}*`,
    '',
    `*Product:* ${details.productName} (\`${details.sku}\`)`,
  ];

  if (details.contentGoal) {
    lines.push(`*Goal:* ${friendlyContentType(details.contentGoal)}`);
  }
  if (details.language) {
    lines.push(`*Language:* ${friendlyLanguage(details.language)}`);
  }
  if (details.format) {
    lines.push(`*Channel & Format:* ${friendlyFormat(details.format)}`);
  }
  if (details.stylePreset) {
    lines.push(`*Visual Style:* ${friendlyEnum(details.stylePreset)}`);
  }

  lines.push('');

  switch (details.step) {
    case 1:
      lines.push('Select a product to begin creating content:');
      break;
    case 2:
      lines.push('Choose a content goal for this campaign:');
      break;
    case 3:
      lines.push('Choose copy and poster language:');
      break;
    case 4:
      lines.push('Choose target channel and format:');
      break;
    case 5:
      lines.push('Choose an art-direction visual style for the background:');
      break;
    case 6:
      lines.push('*Review & Confirm:*');
      lines.push('Verify your campaign selections above. Tap *Confirm Generation* to proceed.');
      break;
  }

  return lines.join('\n');
}

export type GenerationProgressStep =
  | 'PREPARING_FACTS'
  | 'WRITING_COPY'
  | 'VALIDATING_CLAIMS'
  | 'CREATING_BACKGROUND'
  | 'COMPOSITING_PRODUCT'
  | 'APPLYING_POSTER_DESIGN'
  | 'RUNNING_VISUAL_CHECKS'
  | 'READY_FOR_REVIEW';

export const GENERATION_PROGRESS_STEPS: { id: GenerationProgressStep; label: string }[] = [
  { id: 'PREPARING_FACTS', label: 'Preparing verified product facts' },
  { id: 'WRITING_COPY', label: 'Writing copy' },
  { id: 'VALIDATING_CLAIMS', label: 'Validating claims' },
  { id: 'CREATING_BACKGROUND', label: 'Creating background' },
  { id: 'COMPOSITING_PRODUCT', label: 'Compositing product' },
  { id: 'APPLYING_POSTER_DESIGN', label: 'Applying poster design' },
  { id: 'RUNNING_VISUAL_CHECKS', label: 'Running visual checks' },
  { id: 'READY_FOR_REVIEW', label: 'Ready for review' },
];

export function formatProgressCard(
  jobId: string,
  productName: string,
  currentStep: GenerationProgressStep,
  options?: TelegramFormatOptions,
): string {
  const prefix = options?.demoMode ? '[DEMO] ' : '';
  const lines: string[] = [
    `${prefix}⏳ *Generating Poster & Copy* (\`#${shortReference(jobId)}\`)`,
    '',
    `*Product:* ${productName}`,
    '',
  ];

  const currentIndex = GENERATION_PROGRESS_STEPS.findIndex((s) => s.id === currentStep);

  for (let i = 0; i < GENERATION_PROGRESS_STEPS.length; i++) {
    const step = GENERATION_PROGRESS_STEPS[i]!;
    if (i < currentIndex) {
      lines.push(`✅ ${step.label}`);
    } else if (i === currentIndex) {
      lines.push(currentStep === 'READY_FOR_REVIEW' ? `✅ ${step.label}` : `⏳ *${step.label}…*`);
    } else {
      lines.push(`⚪ ${step.label}`);
    }
  }

  return lines.join('\n');
}

export function formatFailureCard(
  jobId: string,
  productName: string,
  reason: string,
  options?: TelegramFormatOptions,
): string {
  const prefix = options?.demoMode ? '[DEMO] ' : '';
  return [
    `${prefix}❌ *Generation Stopped* (\`#${shortReference(jobId)}\`)`,
    '',
    `*Product:* ${productName}`,
    `*Reason:* ${reason}`,
    '',
    'Choose an action below to proceed:',
  ].join('\n');
}

export function formatDraftCompact(
  view: TelegramDraftView,
  options?: TelegramFormatOptions,
): string {
  const prefix = options?.demoMode ? '[DEMO] ' : '';
  const output = view.output;
  const status = validationBanner(view.validation);
  const caption =
    output.khmerCaption && output.englishCaption
      ? `🇰🇭 ${output.khmerCaption}\n\n🇬🇧 ${output.englishCaption}`
      : output.khmerCaption
        ? output.khmerCaption
        : (output.englishCaption ?? '');

  return [
    `${prefix}📝 *Draft Copy Review* · V${String(view.versionNumber ?? 1)} (\`#${shortReference(view.jobId)}\`)`,
    '',
    `*Product:* ${view.productName}`,
    `*Channel:* ${friendlyFormat(view.platform)}`,
    `*Language:* ${friendlyLanguage(view.language)}`,
    `*Status:* ${status}`,
    '',
    `*Headline:*`,
    output.headline,
    '',
    `*Caption:*`,
    caption,
    '',
    `*CTA:* ${output.cta}`,
    ...(output.hashtags.length > 0 ? [`*Hashtags:* ${output.hashtags.join(' ')}`] : []),
  ].join('\n');
}
