import { normalizeAndValidateUnicode } from './unicode-validator.js';

export function isKhmerCoeng(cp: number): boolean {
  return cp === 0x17d2;
}

export function isKhmerDependentVowel(cp: number): boolean {
  // Khmer dependent vowels: U+17B6 to U+17C5
  return cp >= 0x17b6 && cp <= 0x17c5;
}

export function isKhmerCombiningMark(cp: number): boolean {
  // Khmer signs and diacritics: U+17C6 to U+17D3, U+17DD
  return (cp >= 0x17c6 && cp <= 0x17d3) || cp === 0x17dd;
}

export function isKhmerSubscriptConsonant(cp: number): boolean {
  // Khmer consonants that can appear as subscripts: U+1780 to U+17A2
  return cp >= 0x1780 && cp <= 0x17a2;
}

export function isKhmerPunctuation(cp: number): boolean {
  // Khmer punctuation: Khan (U+17D4 ។), Bariyoosan (U+17D5 ៕), Colon (U+17D6 ៖), Beyyal (U+17D8 ៘), Koomuut (U+17DA ៚)
  return (
    cp === 0x17d4 ||
    cp === 0x17d5 ||
    cp === 0x17d6 ||
    cp === 0x17d8 ||
    cp === 0x17da
  );
}

export function isKhmerLekTook(cp: number): boolean {
  // Khmer repetition sign: Lek Took (U+17D7 ៗ)
  return cp === 0x17d7;
}

export function isKhmerCurrency(cp: number): boolean {
  // Khmer currency: Riel (U+17DB ៛)
  return cp === 0x17db;
}

export function safeKhmerTokenize(paragraph: string): string[] {
  if (!paragraph || paragraph.length === 0) {
    return [];
  }

  // Pass 1: Extract true grapheme cluster boundaries so no word boundary bisects a grapheme cluster
  const gSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const graphemeBoundaries = new Set<number>();
  for (const g of gSegmenter.segment(paragraph)) {
    graphemeBoundaries.add(g.index);
  }
  graphemeBoundaries.add(paragraph.length);

  // Pass 2: Extract Khmer word segments using ICU rules
  const wSegmenter = new Intl.Segmenter('km', { granularity: 'word' });
  const rawSegments: { text: string; index: number }[] = [];

  for (const item of wSegmenter.segment(paragraph)) {
    if (item.segment.length > 0) {
      rawSegments.push({ text: item.segment, index: item.index });
    }
  }

  // Pass 3: Orthographic and phonetic safeguards
  // Never break:
  // 1. Inside a grapheme cluster
  // 2. Immediately after Khmer Coeng U+17D2
  // 3. Between a base consonant and its subscript
  // 4. Before a dependent vowel or combining mark
  // 5. Before Khmer repetition mark Lek Took U+17D7 (e.g. ៗ)
  // 6. Before Khmer punctuation marks (។, ៕, ៖, ៘, ៚) or currency (៛)
  // 7. Across coda consonant + Lek Took (e.g. ពិ + តៗ -> ពិតៗ)
  const guardedSegments: string[] = [];

  for (let i = 0; i < rawSegments.length; i++) {
    const item = rawSegments[i]!;
    const seg = item.text;

    if (guardedSegments.length === 0) {
      guardedSegments.push(seg);
      continue;
    }

    const prevIndex = guardedSegments.length - 1;
    const prev = guardedSegments[prevIndex]!;

    const lastCharIndex = prev.length - 1;
    const isSurrogate = (prev.charCodeAt(lastCharIndex) ?? 0) >= 0xdc00;
    const prevLastCp = prev.codePointAt(prev.length - (isSurrogate ? 2 : 1)) ?? 0;
    const currentFirstCp = seg.codePointAt(0) ?? 0;

    const isInsideGrapheme = !graphemeBoundaries.has(item.index);
    // Consonant followed immediately by Lek Took (e.g. តៗ)
    const startsWithCodaLekTook = /^[\u1780-\u17A2]ៗ/.test(seg);

    const shouldJoin =
      isInsideGrapheme ||
      isKhmerCoeng(prevLastCp) ||
      isKhmerDependentVowel(currentFirstCp) ||
      isKhmerCombiningMark(currentFirstCp) ||
      isKhmerLekTook(currentFirstCp) ||
      isKhmerPunctuation(currentFirstCp) ||
      isKhmerCurrency(currentFirstCp) ||
      startsWithCodaLekTook ||
      seg === '\u200b';

    if (shouldJoin) {
      guardedSegments[prevIndex] = prev + seg;
    } else {
      guardedSegments.push(seg);
    }
  }

  return guardedSegments;
}

export function splitTextIntoParagraphs(text: string): string[] {
  const normalized = normalizeAndValidateUnicode(text);
  if (!normalized) return [];
  // Preserve explicit newlines (CRLF or LF)
  return normalized.split(/\r?\n/);
}
