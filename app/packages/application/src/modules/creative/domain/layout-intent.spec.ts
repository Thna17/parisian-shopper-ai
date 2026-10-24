import { describe, expect, it } from '@jest/globals';
import { deriveLayoutIntentForTemplate, LayoutIntentSchema } from './layout-intent.js';

describe('LayoutIntent Domain Service', () => {
  it('generates a valid, schema-compliant LayoutIntent for EDITORIAL_SPLIT', () => {
    const intent = deriveLayoutIntentForTemplate('EDITORIAL_SPLIT', 1080, 1080);
    const parsed = LayoutIntentSchema.safeParse(intent);
    expect(parsed.success).toBe(true);
    expect(intent.templateId).toBe('EDITORIAL_SPLIT');
    expect(intent.productZone.xPercent).toBe(0.05);
    expect(intent.textZone.xPercent).toBe(0.5);
    expect(intent.lightingDirection).toBe('UPPER_LEFT');
    expect(intent.reservedNegativeSpace.xPercent).toBe(0.5);
    expect(intent.horizonOrPedestalPosition).toBe(0.74);
    expect(intent.promptGuidance).toContain('left half features a distinct architectural pedestal');
    expect(intent.promptGuidance).toContain('right half must remain deeply out-of-focus');
  });

  it('generates a valid, schema-compliant LayoutIntent for CENTERED_HERO', () => {
    const intent = deriveLayoutIntentForTemplate('CENTERED_HERO', 1080, 1080);
    const parsed = LayoutIntentSchema.safeParse(intent);
    expect(parsed.success).toBe(true);
    expect(intent.templateId).toBe('CENTERED_HERO');
    expect(intent.productZone.xPercent).toBe(0.26);
    expect(intent.lightingDirection).toBe('DRAMATIC_BACKLIGHT');
    expect(intent.horizonOrPedestalPosition).toBe(0.74);
    expect(intent.promptGuidance).toContain('Symmetrical centered composition');
  });

  it('generates a valid, schema-compliant LayoutIntent for SCENT_STORY', () => {
    const intent = deriveLayoutIntentForTemplate('SCENT_STORY', 1080, 1080);
    const parsed = LayoutIntentSchema.safeParse(intent);
    expect(parsed.success).toBe(true);
    expect(intent.templateId).toBe('SCENT_STORY');
    expect(intent.productZone.xPercent).toBe(0.5);
    expect(intent.textZone.xPercent).toBe(0.05);
    expect(intent.lightingDirection).toBe('UPPER_RIGHT');
    expect(intent.reservedNegativeSpace.xPercent).toBe(0.05);
    expect(intent.promptGuidance).toContain('Split composition for fragrance notes');
  });

  it('generates a valid, schema-compliant LayoutIntent for KHMER_SEASONAL', () => {
    const intent = deriveLayoutIntentForTemplate('KHMER_SEASONAL', 1080, 1080);
    const parsed = LayoutIntentSchema.safeParse(intent);
    expect(parsed.success).toBe(true);
    expect(intent.templateId).toBe('KHMER_SEASONAL');
    expect(intent.lightingDirection).toBe('WARM_GOLDEN_HOUR');
    expect(intent.pedestalZone.surfaceType).toContain('sandstone');
    expect(intent.promptGuidance).toContain('warm ivory sandstone or sculpted stone pedestal');
  });

  it('calculates format-specific safe margins correctly for square and vertical formats', () => {
    const squareIntent = deriveLayoutIntentForTemplate('EDITORIAL_SPLIT', 1080, 1080);
    expect(squareIntent.formatSpecificSafeMargins.top).toBeGreaterThan(0);
    expect(squareIntent.formatSpecificSafeMargins.left).toBeGreaterThan(0);

    const verticalIntent = deriveLayoutIntentForTemplate('EDITORIAL_SPLIT', 1080, 1920);
    expect(verticalIntent.outputFormat.height).toBe(1920);
    expect(verticalIntent.outputFormat.aspectRatio).toBe('9:16');
  });
});
