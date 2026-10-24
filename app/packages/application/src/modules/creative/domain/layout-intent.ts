import { z } from 'zod';
import { type SafeMargins, calculateSafeMargins } from './poster-tokens.js';

export const LightingDirection = {
  UPPER_LEFT: 'UPPER_LEFT',
  UPPER_RIGHT: 'UPPER_RIGHT',
  DRAMATIC_BACKLIGHT: 'DRAMATIC_BACKLIGHT',
  SOFT_DIFFUSED: 'SOFT_DIFFUSED',
  WARM_GOLDEN_HOUR: 'WARM_GOLDEN_HOUR',
  CENTER_SOFT: 'CENTER_SOFT',
} as const;
export type LightingDirection = (typeof LightingDirection)[keyof typeof LightingDirection];

export const BackgroundComplexity = {
  MINIMAL: 'MINIMAL',
  MODERATE: 'MODERATE',
  EDITORIAL: 'EDITORIAL',
} as const;
export type BackgroundComplexity = (typeof BackgroundComplexity)[keyof typeof BackgroundComplexity];

export const LayoutZoneSchema = z.object({
  xPercent: z.number().min(0).max(1),
  yPercent: z.number().min(0).max(1),
  widthPercent: z.number().min(0.01).max(1),
  heightPercent: z.number().min(0.01).max(1),
  description: z.string().optional(),
});
export type LayoutZone = z.infer<typeof LayoutZoneSchema>;

export const PedestalZoneSchema = z.object({
  baselineYPercent: z.number().min(0.1).max(0.95),
  description: z.string().min(1),
  surfaceType: z.string().optional(),
});
export type PedestalZone = z.infer<typeof PedestalZoneSchema>;

export const NegativeSpaceZoneSchema = z.object({
  xPercent: z.number().min(0).max(1),
  yPercent: z.number().min(0).max(1),
  widthPercent: z.number().min(0.01).max(1),
  heightPercent: z.number().min(0.01).max(1),
  guidance: z.string().min(1),
  maxEdgeDensity: z.number().positive().optional().default(35),
});
export type NegativeSpaceZone = z.infer<typeof NegativeSpaceZoneSchema>;

export const LayoutIntentSchema = z.object({
  templateId: z.enum(['EDITORIAL_SPLIT', 'CENTERED_HERO', 'SCENT_STORY', 'KHMER_SEASONAL']),
  outputFormat: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    aspectRatio: z.string(),
  }),
  productZone: LayoutZoneSchema,
  textZone: LayoutZoneSchema,
  logoZone: LayoutZoneSchema.optional(),
  priceZone: LayoutZoneSchema.optional(),
  pedestalZone: PedestalZoneSchema,
  lightingDirection: z.enum([
    'UPPER_LEFT',
    'UPPER_RIGHT',
    'DRAMATIC_BACKLIGHT',
    'SOFT_DIFFUSED',
    'WARM_GOLDEN_HOUR',
    'CENTER_SOFT',
  ]),
  reservedNegativeSpace: NegativeSpaceZoneSchema,
  backgroundComplexity: z.enum(['MINIMAL', 'MODERATE', 'EDITORIAL']),
  horizonOrPedestalPosition: z.number().min(0.1).max(0.95),
  formatSpecificSafeMargins: z.object({
    top: z.number().int().nonnegative(),
    bottom: z.number().int().nonnegative(),
    left: z.number().int().nonnegative(),
    right: z.number().int().nonnegative(),
  }),
  promptGuidance: z.string().min(1),
});
export type LayoutIntent = z.infer<typeof LayoutIntentSchema>;

/**
 * Derives the validated LayoutIntent for any supported deterministic poster template.
 * Invariant: Visual spatial composition matches deterministic template geometry.
 */
export function deriveLayoutIntentForTemplate(
  templateId: string,
  width: number = 1080,
  height: number = 1080,
): LayoutIntent {
  const safeMargins: SafeMargins = calculateSafeMargins(width, height);
  const aspectRatio = width === height ? '1:1' : height > width ? '9:16' : '16:9';

  switch (templateId) {
    case 'EDITORIAL_SPLIT': {
      return LayoutIntentSchema.parse({
        templateId: 'EDITORIAL_SPLIT',
        outputFormat: { width, height, aspectRatio },
        productZone: {
          xPercent: 0.05,
          yPercent: 0.08,
          widthPercent: 0.44,
          heightPercent: 0.84,
          description:
            'Left 44% column reserved for primary authentic product hero bottle and vertical contact shadow.',
        },
        textZone: {
          xPercent: 0.5,
          yPercent: 0.05,
          widthPercent: 0.45,
          heightPercent: 0.9,
          description:
            'Right 45% column reserved for editorial typography, price block, and CTA button.',
        },
        logoZone: {
          xPercent: 0.5,
          yPercent: 0.05,
          widthPercent: 0.2,
          heightPercent: 0.06,
          description: 'Top-right corner inside editorial column.',
        },
        priceZone: {
          xPercent: 0.5,
          yPercent: 0.65,
          widthPercent: 0.35,
          heightPercent: 0.12,
          description: 'Lower right editorial column above CTA button.',
        },
        pedestalZone: {
          baselineYPercent: 0.74,
          description:
            'A grounded architectural stone or mineral pedestal extending across the lower left quadrant.',
          surfaceType: 'monolithic limestone slab or dark slate',
        },
        lightingDirection: 'UPPER_LEFT',
        reservedNegativeSpace: {
          xPercent: 0.5,
          yPercent: 0.05,
          widthPercent: 0.45,
          heightPercent: 0.9,
          guidance:
            'The entire right half must remain deeply out-of-focus, quiet, and minimalist negative space with soft neutral bokeh. Zero sharp objects, high-contrast textures, or botanical clutter in this zone to ensure crystal-clear typography readability.',
          maxEdgeDensity: 32,
        },
        backgroundComplexity: 'EDITORIAL',
        horizonOrPedestalPosition: 0.74,
        formatSpecificSafeMargins: safeMargins,
        promptGuidance:
          'Asymmetrical commercial studio composition. The left half features a distinct architectural pedestal in the lower two-thirds to support bottle placement, illuminated from the upper left. The entire right half must remain deeply out-of-focus, quiet, and minimalist negative space with soft neutral bokeh, completely free of sharp foreground elements or busy textures to allow clear typography overlay.',
      });
    }

    case 'CENTERED_HERO': {
      return LayoutIntentSchema.parse({
        templateId: 'CENTERED_HERO',
        outputFormat: { width, height, aspectRatio },
        productZone: {
          xPercent: 0.26,
          yPercent: 0.2,
          widthPercent: 0.48,
          heightPercent: 0.54,
          description: 'Center-stage hero bottle placement positioned directly atop the pedestal.',
        },
        textZone: {
          xPercent: 0.08,
          yPercent: 0.05,
          widthPercent: 0.84,
          heightPercent: 0.22,
          description: 'Top centered headline zone and bottom pricing/CTA footer zone.',
        },
        logoZone: {
          xPercent: 0.4,
          yPercent: 0.03,
          widthPercent: 0.2,
          heightPercent: 0.05,
          description: 'Top-center header eyebrow.',
        },
        priceZone: {
          xPercent: 0.3,
          yPercent: 0.76,
          widthPercent: 0.4,
          heightPercent: 0.08,
          description: 'Centered price badge directly below pedestal baseline.',
        },
        pedestalZone: {
          baselineYPercent: 0.74,
          description:
            'Symmetrical centered low podium or stone slab anchored at 74% vertical position.',
          surfaceType: 'polished obsidian, slate, or smooth ceramic podium',
        },
        lightingDirection: 'DRAMATIC_BACKLIGHT',
        reservedNegativeSpace: {
          xPercent: 0.08,
          yPercent: 0.03,
          widthPercent: 0.84,
          heightPercent: 0.22,
          guidance:
            'Top 25% and bottom 20% must be clean, uncluttered negative space with smooth atmospheric gradation and gentle vignetting for text readability.',
          maxEdgeDensity: 28,
        },
        backgroundComplexity: 'MINIMAL',
        horizonOrPedestalPosition: 0.74,
        formatSpecificSafeMargins: safeMargins,
        promptGuidance:
          'Symmetrical centered composition. A prominent, elegant low stone or mineral pedestal is centered at the lower baseline (around 74% down). The top 25% and bottom 20% of the frame must be clean, uncluttered negative space with smooth atmospheric gradation and gentle vignetting for text readability. Subtle rim lighting or soft backlight framing the center.',
      });
    }

    case 'SCENT_STORY': {
      return LayoutIntentSchema.parse({
        templateId: 'SCENT_STORY',
        outputFormat: { width, height, aspectRatio },
        productZone: {
          xPercent: 0.5,
          yPercent: 0.1,
          widthPercent: 0.46,
          heightPercent: 0.64,
          description: 'Right-center product pedestal placement.',
        },
        textZone: {
          xPercent: 0.05,
          yPercent: 0.05,
          widthPercent: 0.44,
          heightPercent: 0.9,
          description: 'Left 44% column for headline, scent pyramid badges, price, and CTA.',
        },
        logoZone: {
          xPercent: 0.05,
          yPercent: 0.05,
          widthPercent: 0.2,
          heightPercent: 0.05,
          description: 'Top-left campaign label.',
        },
        priceZone: {
          xPercent: 0.05,
          yPercent: 0.8,
          widthPercent: 0.2,
          heightPercent: 0.1,
          description: 'Bottom-left pricing block.',
        },
        pedestalZone: {
          baselineYPercent: 0.74,
          description:
            'Dark graphite mineral slab or walnut surface on right side with perimeter raw scent notes.',
          surfaceType: 'dark graphite mineral stone slab',
        },
        lightingDirection: 'UPPER_RIGHT',
        reservedNegativeSpace: {
          xPercent: 0.05,
          yPercent: 0.05,
          widthPercent: 0.44,
          heightPercent: 0.9,
          guidance:
            'The left half of the frame must be soft, dark, and muted negative space with atmospheric falloff and deep shadows, reserved for clean text readability. All botanical items stay on the right base.',
          maxEdgeDensity: 30,
        },
        backgroundComplexity: 'EDITORIAL',
        horizonOrPedestalPosition: 0.74,
        formatSpecificSafeMargins: safeMargins,
        promptGuidance:
          'Split composition for fragrance notes. The right side features a solid mineral or dark stone pedestal for perfume placement. Artfully arranged around the right base perimeter are natural fragrance elements in crisp detail. The left half of the frame is soft, dark, and muted negative space with atmospheric falloff and deep shadows, reserved for clean text readability.',
      });
    }

    case 'KHMER_SEASONAL':
    default: {
      return LayoutIntentSchema.parse({
        templateId: 'KHMER_SEASONAL',
        outputFormat: { width, height, aspectRatio },
        productZone: {
          xPercent: 0.26,
          yPercent: 0.22,
          widthPercent: 0.48,
          heightPercent: 0.52,
          description: 'Centered product placement atop warm sandstone pedestal.',
        },
        textZone: {
          xPercent: 0.08,
          yPercent: 0.05,
          widthPercent: 0.84,
          heightPercent: 0.22,
          description: 'Top Khmer headline zone and bottom Khmer pricing badge.',
        },
        logoZone: {
          xPercent: 0.42,
          yPercent: 0.04,
          widthPercent: 0.16,
          heightPercent: 0.06,
          description: 'Centered lotus ornament top anchor.',
        },
        priceZone: {
          xPercent: 0.25,
          yPercent: 0.76,
          widthPercent: 0.5,
          heightPercent: 0.08,
          description: 'Khmer golden price badge.',
        },
        pedestalZone: {
          baselineYPercent: 0.74,
          description:
            'Warm ivory sandstone pedestal with chamfered edges centered at lower baseline.',
          surfaceType: 'warm ivory sandstone',
        },
        lightingDirection: 'WARM_GOLDEN_HOUR',
        reservedNegativeSpace: {
          xPercent: 0.08,
          yPercent: 0.04,
          widthPercent: 0.84,
          heightPercent: 0.2,
          guidance:
            'Top and bottom horizontal zones have tranquil, diffused negative space with warm golden undertones, free of high-frequency clutter.',
          maxEdgeDensity: 28,
        },
        backgroundComplexity: 'MODERATE',
        horizonOrPedestalPosition: 0.74,
        formatSpecificSafeMargins: safeMargins,
        promptGuidance:
          'Regal, balanced ceremonial composition. A warm ivory sandstone or sculpted stone pedestal centered at the lower baseline. Golden hour illumination with warm amber and ivory tones. Top header zone and bottom footer zone have soft, diffused, tranquil negative space with subtle cultural architectural cues out-of-focus in the background.',
      });
    }
  }
}
