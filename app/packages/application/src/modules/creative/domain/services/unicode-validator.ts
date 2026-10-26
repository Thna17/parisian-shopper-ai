import { PosterUnsafeUnicodeError } from '../creative-errors.js';

const BIDI_OVERRIDES = new Set([
  0x202a, // LRE
  0x202b, // RLE
  0x202c, // PDF
  0x202d, // LRO
  0x202e, // RLO
  0x2066, // LRI
  0x2067, // RLI
  0x2068, // FSI
  0x2069, // PDI
]);

export function normalizeAndValidateUnicode(rawText: string, role?: string): string {
  if (typeof rawText !== 'string') {
    return '';
  }

  // Strict Unicode Normalization: NFC
  const normalized = rawText.normalize('NFC');

  for (let i = 0; i < normalized.length;) {
    const codePoint = normalized.codePointAt(i);
    if (codePoint === undefined) {
      break;
    }

    if (codePoint === 0x0000) {
      throw new PosterUnsafeUnicodeError(0, 'Null characters are prohibited', role);
    }

    if (BIDI_OVERRIDES.has(codePoint)) {
      throw new PosterUnsafeUnicodeError(
        codePoint,
        'Bidirectional override/control characters are strictly prohibited',
        role,
      );
    }

    // Check dangerous C0/C1 control characters, preserving \t (0x09), \n (0x0A), \r (0x0D)
    const isForbiddenC0 =
      (codePoint >= 0x0001 && codePoint <= 0x0008) ||
      codePoint === 0x000b ||
      codePoint === 0x000c ||
      (codePoint >= 0x000e && codePoint <= 0x001f);

    const isForbiddenC1 = codePoint >= 0x007f && codePoint <= 0x009f;

    if (isForbiddenC0 || isForbiddenC1) {
      throw new PosterUnsafeUnicodeError(
        codePoint,
        'Non-printable control characters are prohibited',
        role,
      );
    }

    // Unicode Replacement Character U+FFFD
    if (codePoint === 0xfffd) {
      throw new PosterUnsafeUnicodeError(
        codePoint,
        'Unicode replacement character (U+FFFD) is prohibited',
        role,
      );
    }

    // Byte Order Mark U+FEFF within text content
    if (codePoint === 0xfeff) {
      throw new PosterUnsafeUnicodeError(
        codePoint,
        'Byte order mark (U+FEFF) is prohibited within text content',
        role,
      );
    }

    // Dangerous invisible directional / formatting controls (preserving U+200B Khmer ZWSP)
    if (
      codePoint === 0x200c || // ZWNJ
      codePoint === 0x200d || // ZWJ
      codePoint === 0x200e || // LRM
      codePoint === 0x200f // RLM
    ) {
      throw new PosterUnsafeUnicodeError(
        codePoint,
        'Invisible formatting or directional control characters are prohibited',
        role,
      );
    }

    // Unpaired surrogate code points
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      throw new PosterUnsafeUnicodeError(
        codePoint,
        'Unpaired surrogate code points are prohibited',
        role,
      );
    }

    // Private Use Area (PUA)
    const isBMPPUA = codePoint >= 0xe000 && codePoint <= 0xf8ff;
    const isPlane15PUA = codePoint >= 0xf0000 && codePoint <= 0xffffd;
    const isPlane16PUA = codePoint >= 0x100000 && codePoint <= 0x10fffd;

    if (isBMPPUA || isPlane15PUA || isPlane16PUA) {
      throw new PosterUnsafeUnicodeError(
        codePoint,
        'Private Use Area code points are prohibited',
        role,
      );
    }

    // Unicode Tags block (U+E0000 to U+E007F)
    if (codePoint >= 0xe0000 && codePoint <= 0xe007f) {
      throw new PosterUnsafeUnicodeError(codePoint, 'Unicode tag characters are prohibited', role);
    }

    // Advance by code point length (surrogate pairs occupy 2 code units)
    i += codePoint > 0xffff ? 2 : 1;
  }

  return normalized;
}
