import { describe, expect, it } from '@jest/globals';
import sharp from 'sharp';
import { RelayoutPosterUseCase } from './relayout-poster.use-case.js';
import { SharpPosterCompositor } from '../infrastructure/sharp-poster-compositor.adapter.js';
import { type PosterSpec } from '../domain/poster-spec.js';
import { type ApplicationLogger } from '@parisian-shopper/common';

describe('RelayoutPosterUseCase (Zero-AI Re-Layout)', () => {
  const mockLogger: ApplicationLogger = {
    log: () => {},
    warn: () => {},
    error: () => {},
  };

  const useCase = new RelayoutPosterUseCase(mockLogger, new SharpPosterCompositor());

  async function createFixtureBackground(): Promise<Buffer> {
    return sharp({
      create: {
        width: 1080,
        height: 1080,
        channels: 4,
        background: { r: 18, g: 19, b: 22, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  }

  async function createFixtureProduct(): Promise<Buffer> {
    return sharp({
      create: {
        width: 400,
        height: 600,
        channels: 4,
        background: { r: 42, g: 45, b: 52, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  }

  const baseSpec: PosterSpec = {
    templateId: 'EDITORIAL_SPLIT',
    outputFormat: { width: 1080, height: 1080, aspectRatio: '1:1' },
    language: 'EN',
    headline: 'Experience Pure Distinction',
    secondaryHeadline: 'Eau de Parfum',
    supportingText: 'Crafted in Paris with rare bergamot and ambergris.',
    price: '$48',
    promotionalPrice: '$39',
    currency: 'USD',
    size: '100 ml',
    concentration: 'Eau de Parfum',
    cta: 'Shop Now',
    campaignLabel: 'Exclusive Release',
    productPlacement: 'LEFT',
    textPlacement: 'RIGHT',
    palette: {
      id: 'palette-luxury-noir',
      accentColor: '#E5C07B',
      textColor: '#FFFFFF',
      secondaryTextColor: '#C5C6C8',
      panelBackground: '#0E0F12',
    },
    decorativeSelection: {
      divider: 'DIAMOND_DOT',
    },
    backgroundArtDirection: {
      presetId: 'PARISIAN_MORNING_ATELIER',
      gradientStyle: 'SIDE_PANEL',
      panelOpacity: 0.85,
    },
  };

  it('performs instant zero-AI re-layout reusing existing background buffer', async () => {
    const backgroundBuffer = await createFixtureBackground();
    const productBuffer = await createFixtureProduct();

    const result = await useCase.execute({
      creativeJobId: 'job-relayout-test-1',
      posterSpec: baseSpec,
      backgroundBuffer,
      canonicalProductBuffer: productBuffer,
    });

    expect(result.posterBuffer).toBeDefined();
    expect(result.posterBuffer.length).toBeGreaterThan(1000);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1080);
    expect(result.layoutManifest.templateId).toBe('EDITORIAL_SPLIT');

    // Confirm that headline and CTA exist in layout elements
    const headlineElement = result.layoutManifest.elements.find((e) => e.id === 'headline');
    expect(headlineElement).toBeDefined();
    expect(headlineElement?.text).toBe(baseSpec.headline);

    const ctaElement = result.layoutManifest.elements.find((e) => e.id === 'cta_button');
    expect(ctaElement).toBeDefined();
    expect(ctaElement?.text).toBe(baseSpec.cta);
  });

  it('switches templates instantly (from EDITORIAL_SPLIT to CENTERED_HERO) with zero AI cost', async () => {
    const backgroundBuffer = await createFixtureBackground();
    const productBuffer = await createFixtureProduct();

    const centeredSpec: PosterSpec = {
      ...baseSpec,
      templateId: 'CENTERED_HERO',
      productPlacement: 'CENTER',
      textPlacement: 'CENTER',
      headline: 'The Royal Sovereign',
      cta: 'Discover More',
    };

    const result = await useCase.execute({
      creativeJobId: 'job-relayout-test-2',
      posterSpec: centeredSpec,
      backgroundBuffer,
      canonicalProductBuffer: productBuffer,
    });

    expect(result.layoutManifest.templateId).toBe('CENTERED_HERO');
    const heroZone = result.layoutManifest.elements.find((e) => e.id === 'product_hero_zone');
    expect(heroZone).toBeDefined();
    // Centered hero x coordinate should be centered around the middle
    expect(heroZone?.boundingBox.x).toBeGreaterThan(200);
  });

  it('modifies copy, pricing, and adjustments with zero AI spend', async () => {
    const backgroundBuffer = await createFixtureBackground();
    const productBuffer = await createFixtureProduct();

    const modifiedSpec: PosterSpec = {
      ...baseSpec,
      headline: 'New Limited Summer Collection',
      price: '$55',
      promotionalPrice: '$42',
      cta: 'Claim Offer',
      decorativeSelection: {
        divider: 'DOUBLE_LINE',
      },
    };

    const result = await useCase.execute({
      creativeJobId: 'job-relayout-test-3',
      posterSpec: modifiedSpec,
      backgroundBuffer,
      canonicalProductBuffer: productBuffer,
    });

    const headline = result.layoutManifest.elements.find((e) => e.id === 'headline');
    expect(headline?.text).toBe('New Limited Summer Collection');

    const pricing = result.layoutManifest.elements.find((e) => e.id === 'pricing_block');
    expect(pricing?.text).toContain('$55');
    expect(pricing?.text).toContain('$42');
  });
});
