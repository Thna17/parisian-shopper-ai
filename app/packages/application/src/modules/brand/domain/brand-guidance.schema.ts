import { z } from 'zod';
import { brandRulesSchema } from './brand-rule.schema.js';
const text = z.string().trim().min(1).max(1000);
export const brandChannelLayoutSchema = z
  .object({
    templateId: z.enum(['EDITORIAL_SPLIT', 'CENTERED_HERO', 'SCENT_STORY', 'KHMER_SEASONAL']),
    textColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    accentColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    panelBackground: z.string().regex(/^#[0-9a-f]{6}$/i),
    productPlacement: z.enum(['LEFT', 'CENTER', 'RIGHT']),
    textPlacement: z.enum(['LEFT', 'CENTER', 'RIGHT']),
  })
  .strict();
export const brandGuidanceInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    formality: z.enum(['LUXURY_FORMAL', 'ELEVATED_CASUAL', 'EDITORIAL']),
    capitalization: z.enum(['SENTENCE_CASE', 'TITLE_CASE', 'MINIMAL']),
    emojiLimit: z.number().int().min(0).max(10),
    tone: text,
    khmerTone: text,
    terminology: z.array(z.object({ english: text, khmer: text }).strict()).max(100),
    ctaEnglish: z.string().trim().min(1).max(28),
    ctaKhmer: z.string().trim().min(1).max(28),
    contact: text,
    claimsRestrictions: z.array(text).min(1).max(100),
    colors: z
      .array(z.string().regex(/^#[0-9a-f]{6}$/i))
      .min(1)
      .max(8),
    headlineFont: z.literal('Playfair Display'),
    khmerFont: z.literal('Noto Sans Khmer'),
    englishFont: z.literal('Montserrat'),
    logoSourceId: z.string().uuid().nullable(),
    textOnlyBrandName: z.string().trim().max(80),
    channels: z.partialRecord(
      z.enum(['FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'GENERIC']),
      brandChannelLayoutSchema,
    ),
    lighting: text,
    referenceSourceIds: z.array(z.string().uuid()).max(12),
    captionRules: brandRulesSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!Object.keys(value.channels).length)
      ctx.addIssue({ code: 'custom', message: 'Configure at least one channel layout.' });
    if (!value.logoSourceId && !value.textOnlyBrandName)
      ctx.addIssue({
        code: 'custom',
        message: 'Select an approved logo or explicitly provide text-only branding.',
      });
    if (new Set(value.referenceSourceIds).size !== value.referenceSourceIds.length)
      ctx.addIssue({ code: 'custom', message: 'Select each reference once.' });
    if (JSON.stringify(value).includes('TODO_BUSINESS_CONFIRMATION'))
      ctx.addIssue({
        code: 'custom',
        message: 'Replace unfinished placeholders with business-provided guidance.',
      });
  });
export type BrandGuidanceInput = z.infer<typeof brandGuidanceInputSchema>;
export interface ReferenceSnapshot {
  sourceId: string;
  version: number;
  sourceUrl: string | null;
  sourceDigest: string;
  reviewEventId: string;
  captionText: string;
  tags: string[];
  media: { storageKey: string; sha256: string; mimeType: string }[];
  copyrightOwner: string;
  licenseReference: string;
}
export interface PinnedBrandGuidance {
  profileId: string;
  versionNumber: number;
  name: string;
  digest: string;
  approvalId: string;
  ruleVersionId: string;
  datasetVersionId: string;
  guidance: Omit<BrandGuidanceInput, 'captionRules' | 'referenceSourceIds'>;
  references: ReferenceSnapshot[];
  logo: ReferenceSnapshot | null;
  benchmarkReport: unknown;
}

export const brandReferenceInputSchema = z
  .object({
    sourceSystem: z.enum(['FACEBOOK', 'INSTAGRAM', 'BRAND_GUIDELINES', 'CAMPAIGN_COLLATERAL']),
    sourceUrl: z.string().min(1).max(2048),
    captionText: z.string().max(10000),
    copyrightDeclared: z.boolean(),
    copyrightOwner: z.string().max(200),
    licenseReference: z.string().max(200),
    tags: z.array(z.string().max(80)).max(30),
    mediaCasKeys: z.array(z.string().min(1).max(300)).min(1).max(4),
    previousSourceId: z.string().uuid().optional(),
  })
  .strict();
