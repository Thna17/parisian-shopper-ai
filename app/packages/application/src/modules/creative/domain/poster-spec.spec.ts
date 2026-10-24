import { describe, expect, it } from '@jest/globals';
import { validatePosterSpec, POSTER_LIMITS, type PosterSpec } from './poster-spec.js';
import { PosterCopyBuilder } from './services/poster-copy-builder.js';
import { InvalidPosterSpecError } from './creative-errors.js';

describe('PosterSpec & PosterCopyBuilder (POSTER-2 Domain)', () => {
  const baseValidSpec: PosterSpec = {
    templateId: 'EDITORIAL_SPLIT',
    outputFormat: { aspectRatio: '1:1', width: 1080, height: 1080 },
    language: 'EN',
    headline: 'Yes I Am The King',
    secondaryHeadline: 'Eau de Parfum',
    supportingText: 'A bold, royal fragrance crafted with French bergamot and ambergris.',
    price: '$48',
    promotionalPrice: '$39',
    currency: 'USD',
    size: '100 ml',
    concentration: 'Eau de Parfum',
    cta: 'Shop Now',
    campaignLabel: 'PARISIAN SELECTION',
    productPlacement: 'LEFT',
    textPlacement: 'RIGHT',
    palette: {
      id: 'NOCTURNE_GOLD',
      textColor: '#FFFFFF',
      accentColor: '#E5C07B',
      secondaryTextColor: '#A0A4AB',
    },
  };

  it('validates a complete, compliant PosterSpec', () => {
    const validated = validatePosterSpec(baseValidSpec);
    expect(validated.templateId).toBe('EDITORIAL_SPLIT');
    expect(validated.headline).toBe('Yes I Am The King');
    expect(validated.price).toBe('$48');
    expect(validated.promotionalPrice).toBe('$39');
  });

  it('rejects headline exceeding 45 characters', () => {
    const invalid = {
      ...baseValidSpec,
      headline:
        'This headline is far too long and definitely exceeds the forty-five character limit for luxury posters',
    };
    expect(() => validatePosterSpec(invalid)).toThrow(InvalidPosterSpecError);
  });

  it('rejects campaign label exceeding 24 characters', () => {
    const invalid = {
      ...baseValidSpec,
      campaignLabel: 'THIS CAMPAIGN LABEL IS WAY TOO LONG',
    };
    expect(() => validatePosterSpec(invalid)).toThrow(InvalidPosterSpecError);
  });

  it('rejects supporting text exceeding 90 characters', () => {
    const invalid = {
      ...baseValidSpec,
      supportingText:
        'This supporting text is way too verbose and reads like an entire social media paragraph rather than a concise, punchy luxury commercial poster line.',
    };
    expect(() => validatePosterSpec(invalid)).toThrow(InvalidPosterSpecError);
  });

  it('rejects CTA exceeding 28 characters', () => {
    const invalid = {
      ...baseValidSpec,
      cta: 'Click here right now to explore the entire full catalog',
    };
    expect(() => validatePosterSpec(invalid)).toThrow(InvalidPosterSpecError);
  });

  it('derives English-only PosterSpec from product snapshot', () => {
    const spec = PosterCopyBuilder.buildSpec(
      {
        sku: 'GEP-KING-EDP-100',
        title: 'Yes I Am The King',
        brand: 'Geparlys',
        priceAmount: 48,
        currency: 'USD',
        volumeMl: 100,
        concentration: 'Eau de Parfum',
      },
      {
        headline: 'Discover Yes I Am The King',
        bodyText: 'A royal, charismatic masculine scent.',
        cta: 'Shop Now',
        language: 'en',
      },
      { templateId: 'EDITORIAL_SPLIT' },
    );

    expect(spec.language).toBe('EN');
    expect(spec.templateId).toBe('EDITORIAL_SPLIT');
    expect(spec.price).toBe('$48');
    expect(spec.size).toBe('100 ml');
    expect(spec.headline.length).toBeLessThanOrEqual(POSTER_LIMITS.HEADLINE_MAX_LENGTH);
  });

  it('derives Khmer-only PosterSpec with Noto Sans Khmer hierarchy', () => {
    const spec = PosterCopyBuilder.buildSpec(
      {
        sku: 'GEP-KING-EDP-100',
        title: 'Yes I Am The King',
        brand: 'Geparlys',
        priceAmount: 48,
        currency: 'USD',
      },
      {
        headline: 'ទឹកអប់ Yes I Am The King',
        secondaryHeadline: 'ក្លិនក្រអូបបែបប្រណីតពីប៉ារីស',
        bodyText: 'ក្លិនក្រអូបបុរសដ៏មានអំណាច និងទាក់ទាញ។',
        cta: 'ទិញឥឡូវនេះ',
        language: 'km',
      },
      { templateId: 'KHMER_SEASONAL', campaignLabel: 'PCHUM BEN SPECIAL' },
    );

    expect(spec.language).toBe('KM');
    expect(spec.templateId).toBe('KHMER_SEASONAL');
    expect(spec.headline).toBe('ទឹកអប់ Yes I Am The King');
    expect(spec.cta).toBe('ទិញឥឡូវនេះ');
    expect(spec.decorativeSelection?.lotusOrnament).toBe(true);
  });

  it('derives Bilingual PosterSpec preserving English and Khmer headlines', () => {
    const spec = PosterCopyBuilder.buildSpec(
      {
        sku: 'GEP-KING-EDP-100',
        title: 'Yes I Am The King Eau de Parfum',
        brand: 'Geparlys',
        priceAmount: 48,
        currency: 'USD',
      },
      {
        headline: 'Yes I Am The King',
        secondaryHeadline: 'ទឹកអប់បុរសបែបប្រណីត',
        cta: 'Discover More',
      },
    );

    expect(spec.language).toBe('BILINGUAL');
    expect(spec.headline).toBe('Yes I Am The King');
    expect(spec.secondaryHeadline).toBe('ទឹកអប់បុរសបែបប្រណីត');
  });

  it('handles long product titles by graceful truncation with ellipsis', () => {
    const spec = PosterCopyBuilder.buildSpec(
      {
        sku: 'LONG-NAME-SKU',
        title: 'Supercalifragilisticexpialidocious Ultra Extreme Luxury Limited Edition Parfum',
        priceAmount: 95,
      },
      undefined,
      { templateId: 'CENTERED_HERO' },
    );

    expect(spec.headline.length).toBeLessThanOrEqual(POSTER_LIMITS.HEADLINE_MAX_LENGTH);
    expect(spec.headline.endsWith('…')).toBe(true);
  });

  it('handles missing optional fields cleanly without throwing', () => {
    const spec = PosterCopyBuilder.buildSpec(
      {
        sku: 'MINIMAL-SKU',
        title: 'Minimal Perfume',
        priceAmount: 25,
      },
      undefined,
    );

    expect(spec.headline).toBe('Minimal Perfume');
    expect(spec.price).toBe('$25');
    expect(spec.secondaryHeadline).toBeUndefined();
    expect(spec.promotionalPrice).toBeUndefined();
  });

  it('automatically configures Scent Story template when fragrance notes are present', () => {
    const spec = PosterCopyBuilder.buildSpec(
      {
        sku: 'GEP-KING-EDP-100',
        title: 'Yes I Am The King',
        fragranceNotes: {
          top: ['Bergamot', 'Apple'],
          heart: ['Lavender', 'Geranium'],
          base: ['Ambergris', 'Vetiver'],
        },
      },
      undefined,
    );

    expect(spec.templateId).toBe('SCENT_STORY');
    expect(spec.decorativeSelection?.scentNotes?.length).toBe(6);
  });
});
