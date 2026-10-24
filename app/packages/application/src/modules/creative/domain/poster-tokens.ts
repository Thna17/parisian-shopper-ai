import { type PosterPalette } from './poster-spec.js';

export interface SpacingTokens {
  readonly xs: number;
  readonly sm: number;
  readonly md: number;
  readonly lg: number;
  readonly xl: number;
  readonly xxl: number;
}

export const SPACING: SpacingTokens = {
  xs: 8,
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48,
  xxl: 64,
};

export interface SafeMargins {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

export function calculateSafeMargins(width: number, height: number): SafeMargins {
  // 6% horizontal, 7% vertical safe margin
  const horiz = Math.round(width * 0.06);
  const vert = Math.round(height * 0.07);
  return {
    top: vert,
    bottom: vert + 12, // slightly larger bottom margin for CTA breathing room
    left: horiz,
    right: horiz,
  };
}

export interface TypographyToken {
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly lineHeight: number;
  readonly letterSpacing: number; // in pixels
}

export const TYPOGRAPHY_SCALE = {
  displayLarge: {
    fontSize: 54,
    fontWeight: 700,
    lineHeight: 1.15,
    letterSpacing: -0.5,
  },
  displayMedium: {
    fontSize: 42,
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: -0.2,
  },
  heading: {
    fontSize: 32,
    fontWeight: 600,
    lineHeight: 1.25,
    letterSpacing: 0,
  },
  subheading: {
    fontSize: 24,
    fontWeight: 500,
    lineHeight: 1.3,
    letterSpacing: 0.2,
  },
  body: {
    fontSize: 18,
    fontWeight: 400,
    lineHeight: 1.4,
    letterSpacing: 0,
  },
  caption: {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.35,
    letterSpacing: 0.3,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.2,
    letterSpacing: 2.0,
  },
} as const;

export const POSTER_PALETTES: Record<string, PosterPalette> = {
  NOCTURNE_GOLD: {
    id: 'NOCTURNE_GOLD',
    textColor: '#FFFFFF',
    accentColor: '#E5C07B',
    secondaryTextColor: '#A0A4AB',
    panelBackground: 'rgba(14, 15, 18, 0.78)',
    badgeBackground: 'rgba(229, 192, 123, 0.16)',
    badgeTextColor: '#E5C07B',
  },
  PARISIAN_CREAM: {
    id: 'PARISIAN_CREAM',
    textColor: '#1C1D21',
    accentColor: '#C5A059',
    secondaryTextColor: '#5A5852',
    panelBackground: 'rgba(245, 243, 239, 0.88)',
    badgeBackground: 'rgba(197, 160, 89, 0.20)',
    badgeTextColor: '#8C6F31',
  },
  EMERALD_BOTANICAL: {
    id: 'EMERALD_BOTANICAL',
    textColor: '#F0F4F1',
    accentColor: '#8EAF9D',
    secondaryTextColor: '#A2B3A8',
    panelBackground: 'rgba(18, 25, 21, 0.82)',
    badgeBackground: 'rgba(142, 175, 157, 0.22)',
    badgeTextColor: '#B8D5C5',
  },
  KHMER_ROYAL: {
    id: 'KHMER_ROYAL',
    textColor: '#FAF8F5',
    accentColor: '#E2B357',
    secondaryTextColor: '#C7BFB5',
    panelBackground: 'rgba(11, 13, 23, 0.84)',
    badgeBackground: 'rgba(226, 179, 87, 0.22)',
    badgeTextColor: '#E2B357',
  },
};

export const POSTER_DESIGN_TOKENS = {
  dividerThickness: 1.5,
  badgeBorderRadius: 18,
  panelBorderRadius: 16,
  cardBorderRadius: 12,
  logoClearSpace: 24,
  ctaHeight: 48,
  ctaPaddingHoriz: 28,
  ctaBorderRadius: 24,
  fontFamilies: {
    latinDisplay: 'Playfair Display, Georgia, serif',
    latinBody: 'Montserrat, sans-serif',
    khmer: 'Noto Sans Khmer, sans-serif',
  },
} as const;
