import { describe, expect, it } from '@jest/globals';

import {
  normalizeConcentration,
  normalizeCountry,
  normalizeDecimal,
  normalizeFragranceNote,
  normalizeIdentity,
  normalizeSize,
  normalizeText,
} from './normalization.js';

describe('factual validation normalization', () => {
  it('normalizes harmless Unicode, punctuation, case, and whitespace', () => {
    expect(normalizeText('  Maison—IMAGINAIRE! ')).toBe('maison imaginaire');
    expect(normalizeIdentity('Moonlit  River')).toBe('moonlit river');
  });

  it('normalizes decimal strings without floating point', () => {
    expect(normalizeDecimal('038.0000')).toBe('38');
    expect(normalizeDecimal('38,50')).toBe('38.5');
  });

  it('normalizes controlled size, concentration, country, and note values', () => {
    expect(normalizeSize('100.0', 'ML')).toBe('100 ml');
    expect(normalizeConcentration('Eau de Parfum')).toBe('EDP');
    expect(normalizeConcentration('unknown intense')).toBeNull();
    expect(normalizeCountry('បារាំង')).toBe('FR');
    expect(normalizeCountry('unknown')).toBeNull();
    expect(normalizeFragranceNote(' Bergamot! ')).toBe('bergamot');
  });
});
