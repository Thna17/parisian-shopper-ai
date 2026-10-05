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
  return [
    `${prefix}DRAFT #${shortReference(view.jobId)} — V${String(view.versionNumber ?? 1)}`,
    `Product: ${view.productName}`,
    `Content type: ${friendlyEnum(view.contentType)}`,
    `Language: ${friendlyEnum(view.language)}`,
    `Platform: ${friendlyEnum(view.platform)}`,
    status,
    `Headline:\n${output.headline}`,
    ...(output.khmerCaption === null ? [] : [`Khmer:\n${output.khmerCaption}`]),
    ...(output.englishCaption === null ? [] : [`English:\n${output.englishCaption}`]),
    `CTA:\n${output.cta}`,
    `Hashtags:\n${output.hashtags.join(' ')}`,
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
