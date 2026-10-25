import { PosterUnsupportedScriptError } from '../creative-errors.js';
import { normalizeAndValidateUnicode } from './unicode-validator.js';

export type TextRole =
  | 'DISPLAY'
  | 'HEADLINE'
  | 'SECONDARY_HEADLINE'
  | 'BODY'
  | 'SUPPORTING'
  | 'PRICE'
  | 'CTA'
  | 'LABEL';

export interface ScriptRun {
  readonly text: string;
  readonly script: 'KHMER' | 'LATIN';
  readonly fontFamily: 'Playfair Display' | 'Montserrat' | 'Noto Sans Khmer';
  readonly fontWeight: number;
}

export interface ResolveScriptRunsOptions {
  readonly role?: TextRole | undefined;
  readonly latinFont?: ('Playfair Display' | 'Montserrat') | undefined;
  readonly latinWeight?: number | undefined;
  readonly khmerWeight?: number | undefined;
}

export function isKhmerCodePoint(cp: number): boolean {
  // Khmer block: U+1780 to U+17FF (includes Khmer consonants, vowels, digits, punctuation, and riel ៛)
  // Khmer Symbols: U+19E0 to U+19FF
  return (cp >= 0x1780 && cp <= 0x17ff) || (cp >= 0x19e0 && cp <= 0x19ff);
}

export function isLatinCodePoint(cp: number): boolean {
  // Basic Latin letters (A-Z, a-z)
  if ((cp >= 0x0041 && cp <= 0x005a) || (cp >= 0x0061 && cp <= 0x007a)) {
    return true;
  }
  // Latin-1 Supplement letters (includes French diacritics: é, è, ê, ë, à, â, ç, ï, î, ô, ù, û, ü, œ, æ, ÿ)
  if (
    (cp >= 0x00c0 && cp <= 0x00d6) ||
    (cp >= 0x00d8 && cp <= 0x00f6) ||
    (cp >= 0x00f8 && cp <= 0x00ff)
  ) {
    return true;
  }
  // Latin Extended-A (U+0100..U+017F), Latin Extended-B (U+0180..U+024F)
  if (cp >= 0x0100 && cp <= 0x024f) {
    return true;
  }
  // Latin Extended Additional (U+1E00..U+1EFF)
  if (cp >= 0x1e00 && cp <= 0x1eff) {
    return true;
  }
  // Combining Diacritical Marks for Latin (U+0300..U+036F)
  if (cp >= 0x0300 && cp <= 0x036f) {
    return true;
  }
  return false;
}

export function isApprovedNeutralCodePoint(cp: number): boolean {
  // Whitespace: Space (U+0020), Tab (U+0009), Newline (U+000A), CR (U+000D), NBSP (U+00A0), NNBSP (U+202F), Khmer ZWSP (U+200B)
  if (
    cp === 0x0020 ||
    cp === 0x0009 ||
    cp === 0x000a ||
    cp === 0x000d ||
    cp === 0x00a0 ||
    cp === 0x202f ||
    cp === 0x200b
  ) {
    return true;
  }
  // ASCII digits 0-9
  if (cp >= 0x0030 && cp <= 0x0039) {
    return true;
  }
  // Approved ASCII punctuation / symbols
  if (
    (cp >= 0x0021 && cp <= 0x0023) || // ! " #
    (cp >= 0x0025 && cp <= 0x002a) || // % & ' ( ) *
    (cp >= 0x002b && cp <= 0x002f) || // + , - . /
    (cp >= 0x003a && cp <= 0x0040) || // : ; < = > ? @
    (cp >= 0x005b && cp <= 0x0060) || // [ \ ] ^ _ `
    (cp >= 0x007b && cp <= 0x007e)    // { | } ~
  ) {
    return true;
  }
  // Approved Typographic punctuation & French symbols:
  // « (U+00AB), » (U+00BB), ° (U+00B0), · (U+00B7), × (U+00D7), ÷ (U+00F7)
  if (
    cp === 0x00ab ||
    cp === 0x00bb ||
    cp === 0x00b0 ||
    cp === 0x00b7 ||
    cp === 0x00d7 ||
    cp === 0x00f7
  ) {
    return true;
  }
  // En-dash (U+2013), Em-dash (U+2014)
  if (cp === 0x2013 || cp === 0x2014) {
    return true;
  }
  // Smart quotes: ‘ (U+2018), ’ (U+2019), ‚ (U+201A), “ (U+201C), ” (U+201D), „ (U+201E)
  if (
    cp === 0x2018 ||
    cp === 0x2019 ||
    cp === 0x201a ||
    cp === 0x201c ||
    cp === 0x201d ||
    cp === 0x201e
  ) {
    return true;
  }
  // Bullet (U+2022), Ellipsis (U+2026), Primes: ′ (U+2032), ″ (U+2033)
  if (cp === 0x2022 || cp === 0x2026 || cp === 0x2032 || cp === 0x2033) {
    return true;
  }
  // Approved Currency symbols: $ (U+0024), € (U+20AC), £ (U+00A3), ¥ (U+00A5)
  if (cp === 0x0024 || cp === 0x20ac || cp === 0x00a3 || cp === 0x00a5) {
    return true;
  }
  return false;
}

export const isNeutralCodePoint = isApprovedNeutralCodePoint;

export function detectScriptCategory(cp: number): string {
  if (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x20000 && cp <= 0x2a6df)
  ) {
    return 'CJK';
  }
  if ((cp >= 0x3040 && cp <= 0x309f) || (cp >= 0x30a0 && cp <= 0x30ff)) {
    return 'Kana';
  }
  if (
    (cp >= 0x0600 && cp <= 0x06ff) ||
    (cp >= 0x0750 && cp <= 0x077f) ||
    (cp >= 0x08a0 && cp <= 0x08ff)
  ) {
    return 'Arabic';
  }
  if ((cp >= 0x0400 && cp <= 0x04ff) || (cp >= 0x0500 && cp <= 0x052f)) {
    return 'Cyrillic';
  }
  if (cp >= 0x0e00 && cp <= 0x0e7f) {
    return 'Thai';
  }
  if (cp >= 0x0900 && cp <= 0x097f) {
    return 'Devanagari';
  }
  if (cp >= 0x0590 && cp <= 0x05ff) {
    return 'Hebrew';
  }
  if (cp >= 0x0370 && cp <= 0x03ff) {
    return 'Greek';
  }
  if (
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x2600 && cp <= 0x27bf) ||
    (cp >= 0x1f000 && cp <= 0x1f02f) ||
    (cp >= 0x1f0a0 && cp <= 0x1f0ff)
  ) {
    return 'Emoji';
  }
  return 'Unknown';
}

function isLatinCurrency(cp: number): boolean {
  return cp === 0x0024 || cp === 0x20ac || cp === 0x00a3 || cp === 0x00a5;
}

function isAsciiDigit(cp: number): boolean {
  return cp >= 0x0030 && cp <= 0x0039;
}

function isWhitespaceCp(cp: number): boolean {
  return (
    cp === 0x0020 ||
    cp === 0x0009 ||
    cp === 0x000a ||
    cp === 0x000d ||
    cp === 0x00a0 ||
    cp === 0x202f ||
    cp === 0x200b
  );
}

export function resolveScriptRuns(
  rawText: string,
  options?: ResolveScriptRunsOptions,
): readonly ScriptRun[] {
  const normalized = normalizeAndValidateUnicode(rawText, options?.role);
  if (!normalized) {
    return [];
  }

  const role = options?.role ?? 'BODY';
  const defaultLatinFont: 'Playfair Display' | 'Montserrat' =
    options?.latinFont ??
    (role === 'DISPLAY' || role === 'HEADLINE' ? 'Playfair Display' : 'Montserrat');

  let defaultLatinWeight =
    options?.latinWeight ?? (role === 'DISPLAY' || role === 'HEADLINE' ? 700 : 400);
  if (defaultLatinFont === 'Playfair Display') {
    defaultLatinWeight = Math.min(900, Math.max(400, defaultLatinWeight));
  } else {
    defaultLatinWeight = Math.min(900, Math.max(100, defaultLatinWeight));
  }

  let defaultKhmerWeight =
    options?.khmerWeight ??
    (role === 'DISPLAY' || role === 'HEADLINE' || role === 'PRICE' || role === 'CTA' ? 700 : 400);
  defaultKhmerWeight = Math.min(900, Math.max(100, defaultKhmerWeight));

  // Step 1: Use Intl.Segmenter with granularity: 'grapheme' to preserve grapheme cluster boundaries
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const segments = Array.from(segmenter.segment(normalized));

  interface GraphemeToken {
    readonly text: string;
    readonly codePoints: readonly number[];
    script: 'KHMER' | 'LATIN' | 'NEUTRAL';
  }

  const tokens: GraphemeToken[] = [];

  for (const seg of segments) {
    const text = seg.segment;
    const cps: number[] = [];
    for (let i = 0; i < text.length; ) {
      const cp = text.codePointAt(i)!;
      cps.push(cp);
      i += cp > 0xffff ? 2 : 1;
    }

    // Fail closed immediately on unsupported scripts/symbols
    for (const cp of cps) {
      if (
        !isKhmerCodePoint(cp) &&
        !isLatinCodePoint(cp) &&
        !isApprovedNeutralCodePoint(cp)
      ) {
        throw new PosterUnsupportedScriptError(
          cp,
          String.fromCodePoint(cp),
          detectScriptCategory(cp),
          options?.role,
        );
      }
    }

    // Classify grapheme cluster based on its code points
    let script: 'KHMER' | 'LATIN' | 'NEUTRAL' = 'NEUTRAL';
    if (cps.some((cp) => isKhmerCodePoint(cp))) {
      script = 'KHMER';
    } else if (cps.some((cp) => isLatinCodePoint(cp))) {
      script = 'LATIN';
    }

    tokens.push({ text, codePoints: cps, script });
  }

  // Step 2: Contextual resolution of NEUTRAL tokens
  // A. Currency and Price expressions (e.g. $48, €120, 120 €, 120€, $48.00)
  for (let idx = 0; idx < tokens.length; idx++) {
    const cur = tokens[idx]!;
    if (cur.script !== 'NEUTRAL') {
      continue;
    }

    const hasCurrency = cur.codePoints.some((cp) => isLatinCurrency(cp));
    if (hasCurrency) {
      // Check forward for digits: skip whitespace
      for (let f = idx + 1; f < tokens.length; f++) {
        const nextTok = tokens[f]!;
        if (nextTok.codePoints.every((cp) => isWhitespaceCp(cp))) {
          continue;
        }
        if (nextTok.codePoints.some((cp) => isAsciiDigit(cp))) {
          cur.script = 'LATIN';
          // Mark intervening whitespace as LATIN as well
          for (let m = idx + 1; m < f; m++) {
            tokens[m]!.script = 'LATIN';
          }
        }
        break;
      }

      // Check backward for digits: skip whitespace
      for (let b = idx - 1; b >= 0; b--) {
        const prevTok = tokens[b]!;
        if (prevTok.codePoints.every((cp) => isWhitespaceCp(cp))) {
          continue;
        }
        if (prevTok.codePoints.some((cp) => isAsciiDigit(cp))) {
          cur.script = 'LATIN';
          // Mark intervening whitespace as LATIN as well
          for (let m = b + 1; m < idx; m++) {
            tokens[m]!.script = 'LATIN';
          }
        }
        break;
      }
    }
  }

  // B. General neutral resolution based on nearest surrounding scripts
  for (let idx = 0; idx < tokens.length; idx++) {
    const cur = tokens[idx]!;
    if (cur.script !== 'NEUTRAL') {
      continue;
    }

    // Find preceding non-neutral token
    let prevScript: 'KHMER' | 'LATIN' | null = null;
    for (let p = idx - 1; p >= 0; p--) {
      const pt = tokens[p]!;
      if (pt.script !== 'NEUTRAL') {
        prevScript = pt.script;
        break;
      }
    }

    // Find succeeding non-neutral token
    let nextScript: 'KHMER' | 'LATIN' | null = null;
    for (let n = idx + 1; n < tokens.length; n++) {
      const nt = tokens[n]!;
      if (nt.script !== 'NEUTRAL') {
        nextScript = nt.script;
        break;
      }
    }

    if (prevScript === 'KHMER' && nextScript === 'KHMER') {
      cur.script = 'KHMER';
    } else if (prevScript === 'LATIN' && nextScript === 'LATIN') {
      cur.script = 'LATIN';
    } else if (prevScript !== null) {
      cur.script = prevScript;
    } else if (nextScript !== null) {
      cur.script = nextScript;
    } else {
      // Default to LATIN if entire string is neutral (e.g. "12345", "$48")
      cur.script = 'LATIN';
    }
  }

  // Step 3: Group adjacent tokens with the same resolved script into ScriptRuns
  const runs: ScriptRun[] = [];
  let currentScript: 'KHMER' | 'LATIN' | null = null;
  let currentBuffer = '';

  for (const tok of tokens) {
    const resolved = tok.script === 'NEUTRAL' ? 'LATIN' : tok.script;
    if (currentScript === null) {
      currentScript = resolved;
      currentBuffer = tok.text;
    } else if (currentScript === resolved) {
      currentBuffer += tok.text;
    } else {
      runs.push({
        text: currentBuffer,
        script: currentScript,
        fontFamily: currentScript === 'KHMER' ? 'Noto Sans Khmer' : defaultLatinFont,
        fontWeight: currentScript === 'KHMER' ? defaultKhmerWeight : defaultLatinWeight,
      });
      currentScript = resolved;
      currentBuffer = tok.text;
    }
  }

  if (currentBuffer.length > 0 && currentScript !== null) {
    runs.push({
      text: currentBuffer,
      script: currentScript,
      fontFamily: currentScript === 'KHMER' ? 'Noto Sans Khmer' : defaultLatinFont,
      fontWeight: currentScript === 'KHMER' ? defaultKhmerWeight : defaultLatinWeight,
    });
  }

  return runs;
}
