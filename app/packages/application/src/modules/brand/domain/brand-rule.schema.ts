import { z } from 'zod';

const ruleList = z.array(z.string().trim().min(1).max(1_000)).max(100);

export const brandRulesSchema = z
  .object({
    language: ruleList,
    tone: ruleList,
    cta: ruleList,
    promotion: ruleList,
    perfumeClaims: ruleList,
    platforms: z.record(z.enum(['FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'GENERIC']), ruleList),
    visualGuidance: ruleList,
  })
  .strict();

export type BrandRules = Readonly<z.infer<typeof brandRulesSchema>>;

export const DEVELOPMENT_BRAND_RULES: BrandRules = Object.freeze({
  language: ['TODO_BUSINESS_CONFIRMATION: Khmer tone', 'TODO_BUSINESS_CONFIRMATION: English tone'],
  tone: ['Use a neutral development tone until the business approves brand voice.'],
  cta: ['TODO_BUSINESS_CONFIRMATION: CTA style'],
  promotion: [
    'Use only promotion facts present in the product snapshot.',
    'TODO_BUSINESS_CONFIRMATION: discount urgency wording',
  ],
  perfumeClaims: [
    'Do not add longevity, similarity, origin, or performance claims.',
    'TODO_BUSINESS_CONFIRMATION: perfume and similarity wording',
  ],
  platforms: {
    FACEBOOK: ['TODO_BUSINESS_CONFIRMATION: Facebook caption length'],
    INSTAGRAM: ['TODO_BUSINESS_CONFIRMATION: Instagram caption length and emoji policy'],
    TELEGRAM: ['TODO_BUSINESS_CONFIRMATION: Telegram formatting'],
    GENERIC: ['Avoid platform-only features.'],
  },
  visualGuidance: ['TODO_BUSINESS_CONFIRMATION: visual style; image generation is disabled.'],
});
