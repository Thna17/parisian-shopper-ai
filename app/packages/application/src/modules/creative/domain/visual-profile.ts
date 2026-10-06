import { z } from 'zod';

/**
 * DEVELOPMENT-ONLY Visual Baseline Constants
 *
 * IMPORTANT:
 * These visual style values are baseline engineering placeholders used for development,
 * testing, and compilation. They are NOT approved production company policies.
 * Production brand rules require executive sign-off from brand/marketing leadership
 * as documented in /docs/creative-business-rules.md.
 */
export const DEVELOPMENT_ONLY_CREATIVE_PROFILE = 'PARISIAN_LUXURY_ATELIER' as const;
export const DEVELOPMENT_ONLY_TEXT_ON_IMAGE = false as const;
export const DEVELOPMENT_ONLY_HUMAN_PRESENCE = false as const;

export const visualProfileConfigSchema = z.object({
  profileName: z.string().min(1),
  isProductionApproved: z.boolean().default(false),
  textOnImageAllowed: z.boolean().default(false),
  humanPresenceAllowed: z.boolean().default(false),
  defaultAspectRatio: z.enum(['1:1', '4:5', '9:16', '16:9']).default('1:1'),
  colorPalette: z
    .object({
      primaryGold: z.string().default('#D4AF37'),
      luxuryNoir: z.string().default('#1A1A1A'),
      cream: z.string().default('#F8F6F0'),
      navy: z.string().default('#0F172A'),
    })
    .default(() => ({
      primaryGold: '#D4AF37',
      luxuryNoir: '#1A1A1A',
      cream: '#F8F6F0',
      navy: '#0F172A',
    })),
  heroScale: z
    .object({
      minHeightPercent: z.number().min(0.1).max(0.9).default(0.35),
      maxHeightPercent: z.number().min(0.1).max(0.9).default(0.6),
    })
    .default(() => ({
      minHeightPercent: 0.35,
      maxHeightPercent: 0.6,
    })),
});

export type VisualProfileConfig = z.infer<typeof visualProfileConfigSchema>;

export const DEFAULT_DEVELOPMENT_PROFILE: VisualProfileConfig = {
  profileName: DEVELOPMENT_ONLY_CREATIVE_PROFILE,
  isProductionApproved: false,
  textOnImageAllowed: DEVELOPMENT_ONLY_TEXT_ON_IMAGE,
  humanPresenceAllowed: DEVELOPMENT_ONLY_HUMAN_PRESENCE,
  defaultAspectRatio: '1:1',
  colorPalette: {
    primaryGold: '#D4AF37',
    luxuryNoir: '#1A1A1A',
    cream: '#F8F6F0',
    navy: '#0F172A',
  },
  heroScale: {
    minHeightPercent: 0.35,
    maxHeightPercent: 0.6,
  },
};
