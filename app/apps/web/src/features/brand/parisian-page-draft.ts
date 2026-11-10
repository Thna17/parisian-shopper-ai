import type { CreateBrandProfileInput } from './types/brand.types.js';

/** Preliminary observations only. The business must review the draft before use. */
export function createParisianPageDraft(name: string): CreateBrandProfileInput {
  return {
    name: name.trim(),
    evaluationPolicyId: 'default-anti-regurgitation-policy-v1',
    languagePolicy: {
      formality: 'ELEVATED_CASUAL',
      primaryLanguage: 'KM',
      khmerConventions: {
        scriptStyle: 'Battambang',
        spacingRules:
          'Use clear, natural Khmer; confirm typography and spacing with a Khmer reviewer.',
        disallowedLoanwords: [],
      },
      englishConventions: { tone: 'Warm, helpful and clear', capitalization: 'SENTENCE_CASE' },
    },
    toneRules: {
      luxuryAttributes: ['Warm', 'Helpful', 'Product-focused', 'Clear'],
      prohibitedHyperbole: [],
      allowedEmojis: ['💕', '✨', '🇫🇷', '☺️'],
      maxEmojisPerPost: 3,
    },
    visualAestheticRules: {
      approvedColorPalettes: [
        {
          name: 'Provisional red and white — verify against original brand assets',
          hexCodes: ['#B52230', '#FFFFFF'],
        },
      ],
      lightingStyles: ['Clean product photography'],
      textures: [],
      pedestals: [],
    },
    typographyRules: {
      headlineFont: 'Inter',
      bodyFontKhmer: 'Battambang',
      bodyFontLatin: 'Inter',
      minimumLeadingRatio: 1.4,
    },
    logoRules: {
      clearSpaceRatio: 0.25,
      allowedPlacements: ['TOP_LEFT', 'TOP_RIGHT'],
      defaultVariant: 'MONOCHROME_BLACK',
    },
    approvedExampleIds: [],
    prohibitedPatterns: [],
  };
}
