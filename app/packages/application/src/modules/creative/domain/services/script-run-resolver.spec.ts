import { PosterUnsafeUnicodeError, PosterUnsupportedScriptError } from '../creative-errors.js';
import { resolveScriptRuns } from './script-run-resolver.js';

describe('ScriptRunResolver & UnicodeValidator (W21-D Mixed-Script & Unicode Safety)', () => {
  describe('Pure Script Text & French Typography', () => {
    it('resolves pure English display headline to Playfair Display', () => {
      const runs = resolveScriptRuns('Parisian Shopper Luxury', { role: 'HEADLINE' });
      expect(runs).toHaveLength(1);
      expect(runs[0]).toEqual({
        text: 'Parisian Shopper Luxury',
        script: 'LATIN',
        fontFamily: 'Playfair Display',
        fontWeight: 700,
      });
    });

    it('resolves pure English body text to Montserrat', () => {
      const runs = resolveScriptRuns('Authentic French skincare and fragrance collection.', {
        role: 'BODY',
      });
      expect(runs).toHaveLength(1);
      expect(runs[0]).toEqual({
        text: 'Authentic French skincare and fragrance collection.',
        script: 'LATIN',
        fontFamily: 'Montserrat',
        fontWeight: 400,
      });
    });

    it('resolves pure French luxury copy with diacritics to single Latin run', () => {
      const runs = resolveScriptRuns("Élégance suprême, crème régénérante & parfum d'exception", {
        role: 'HEADLINE',
      });
      expect(runs).toHaveLength(1);
      expect(runs[0]).toEqual({
        text: "Élégance suprême, crème régénérante & parfum d'exception",
        script: 'LATIN',
        fontFamily: 'Playfair Display',
        fontWeight: 700,
      });
    });

    it('resolves French guillemets « Collection Parisienne » in a single Latin run', () => {
      const runs = resolveScriptRuns('« Collection Parisienne »', { role: 'BODY' });
      expect(runs).toHaveLength(1);
      expect(runs[0]).toEqual({
        text: '« Collection Parisienne »',
        script: 'LATIN',
        fontFamily: 'Montserrat',
        fontWeight: 400,
      });
    });

    it('resolves pure Khmer headline to Noto Sans Khmer', () => {
      const runs = resolveScriptRuns('ភាពប្រណីតនៃរាជធានីភ្នំពេញ', { role: 'HEADLINE' });
      expect(runs).toHaveLength(1);
      expect(runs[0]).toEqual({
        text: 'ភាពប្រណីតនៃរាជធានីភ្នំពេញ',
        script: 'KHMER',
        fontFamily: 'Noto Sans Khmer',
        fontWeight: 700,
      });
    });

    it('resolves pure Khmer body copy with Coeng subscripts to Noto Sans Khmer', () => {
      const runs = resolveScriptRuns('ស្វែងរកភាពស្រស់ស្អាតជាមួយកម្ពុជា', { role: 'BODY' });
      expect(runs).toHaveLength(1);
      expect(runs[0]).toEqual({
        text: 'ស្វែងរកភាពស្រស់ស្អាតជាមួយកម្ពុជា',
        script: 'KHMER',
        fontFamily: 'Noto Sans Khmer',
        fontWeight: 400,
      });
    });
  });

  describe('Mixed Script and Complex Inline Copy', () => {
    it('partitions bilingual headline into explicit separate font runs', () => {
      const runs = resolveScriptRuns('រចនាបថប៉ារីស — Parisian Elegance', { role: 'HEADLINE' });
      expect(runs).toHaveLength(2);
      expect(runs[0]!.script).toBe('KHMER');
      expect(runs[0]!.fontFamily).toBe('Noto Sans Khmer');
      expect(runs[1]!.script).toBe('LATIN');
      expect(runs[1]!.fontFamily).toBe('Playfair Display');
    });

    it('partitions mixed inline text where Latin brand is inside Khmer copy', () => {
      const runs = resolveScriptRuns('សូមស្វាគមន៍មកកាន់ Parisian Shopper ផ្លូវការ', {
        role: 'BODY',
      });
      expect(runs).toHaveLength(3);
      expect(runs[0]!.script).toBe('KHMER');
      expect(runs[0]!.fontFamily).toBe('Noto Sans Khmer');

      expect(runs[1]!.script).toBe('LATIN');
      expect(runs[1]!.fontFamily).toBe('Montserrat');
      expect(runs[1]!.text.trim()).toBe('Parisian Shopper');

      expect(runs[2]!.script).toBe('KHMER');
      expect(runs[2]!.fontFamily).toBe('Noto Sans Khmer');
    });

    it('resolves USD price format ($48.00) into Latin Montserrat run', () => {
      const runs = resolveScriptRuns('$48.00', { role: 'PRICE' });
      expect(runs).toHaveLength(1);
      expect(runs[0]!.script).toBe('LATIN');
      expect(runs[0]!.fontFamily).toBe('Montserrat');
    });

    it('resolves EUR price format (120 €) into Latin Montserrat run', () => {
      const runs = resolveScriptRuns('120 €', { role: 'PRICE' });
      expect(runs).toHaveLength(1);
      expect(runs[0]!.script).toBe('LATIN');
      expect(runs[0]!.fontFamily).toBe('Montserrat');
    });

    it('resolves Cambodian riel price (២០០,០០០ ៛) into Noto Sans Khmer run', () => {
      const runs = resolveScriptRuns('២០០,០០០ ៛', { role: 'PRICE' });
      expect(runs).toHaveLength(1);
      expect(runs[0]!.script).toBe('KHMER');
      expect(runs[0]!.fontFamily).toBe('Noto Sans Khmer');
    });

    it('resolves product SKU with hyphen and numbers into Latin Montserrat', () => {
      const runs = resolveScriptRuns('SKU: PRS-LUM-2026-FR', { role: 'LABEL' });
      expect(runs).toHaveLength(1);
      expect(runs[0]!.script).toBe('LATIN');
      expect(runs[0]!.fontFamily).toBe('Montserrat');
    });
  });

  describe('Fail-Closed Unsupported Script Protection', () => {
    it('throws PosterUnsupportedScriptError on Chinese characters (巴黎)', () => {
      expect(() => {
        resolveScriptRuns('Parisian 巴黎 Shopper', { role: 'HEADLINE' });
      }).toThrow(PosterUnsupportedScriptError);

      try {
        resolveScriptRuns('Parisian 巴黎 Shopper', { role: 'HEADLINE' });
      } catch (err) {
        expect(err).toBeInstanceOf(PosterUnsupportedScriptError);
        const scriptErr = err as PosterUnsupportedScriptError;
        expect(scriptErr.character).toBe('巴');
        expect(scriptErr.hexCodePoint).toBe('U+5DF4');
        expect(scriptErr.scriptCategory).toBe('CJK');
        expect(scriptErr.role).toBe('HEADLINE');
      }
    });

    it('throws PosterUnsupportedScriptError on Chinese characters (你好)', () => {
      expect(() => {
        resolveScriptRuns('你好', { role: 'BODY' });
      }).toThrow(PosterUnsupportedScriptError);
    });

    it('throws PosterUnsupportedScriptError on Japanese Kana / Kanji', () => {
      expect(() => {
        resolveScriptRuns('こんにちは', { role: 'BODY' });
      }).toThrow(PosterUnsupportedScriptError);
    });

    it('throws PosterUnsupportedScriptError on Arabic text (مرحبا)', () => {
      expect(() => {
        resolveScriptRuns('مرحبا', { role: 'BODY' });
      }).toThrow(PosterUnsupportedScriptError);
    });

    it('throws PosterUnsupportedScriptError on Cyrillic text (Привет)', () => {
      expect(() => {
        resolveScriptRuns('Привет', { role: 'BODY' });
      }).toThrow(PosterUnsupportedScriptError);
    });

    it('throws PosterUnsupportedScriptError on Thai text (สวัสดี)', () => {
      expect(() => {
        resolveScriptRuns('สวัสดี', { role: 'BODY' });
      }).toThrow(PosterUnsupportedScriptError);
    });

    it('throws PosterUnsupportedScriptError on Emoji (✨ and 🛍️)', () => {
      expect(() => {
        resolveScriptRuns('Parisian ✨ Luxury', { role: 'HEADLINE' });
      }).toThrow(PosterUnsupportedScriptError);

      expect(() => {
        resolveScriptRuns('Shopping 🛍️ Paris', { role: 'BODY' });
      }).toThrow(PosterUnsupportedScriptError);
    });
  });

  describe('Fail-Closed Unicode Security Scanner', () => {
    it('throws PosterUnsafeUnicodeError on right-to-left override character (U+202E)', () => {
      expect(() => {
        resolveScriptRuns('Parisian \u202E Shopper', { role: 'HEADLINE' });
      }).toThrow(PosterUnsafeUnicodeError);
    });

    it('throws PosterUnsafeUnicodeError on left-to-right override character (U+202D)', () => {
      expect(() => {
        resolveScriptRuns('Parisian \u202D Shopper', { role: 'HEADLINE' });
      }).toThrow(PosterUnsafeUnicodeError);
    });

    it('throws PosterUnsafeUnicodeError on bidirectional isolate (U+2066)', () => {
      expect(() => {
        resolveScriptRuns('Parisian \u2066 Shopper', { role: 'HEADLINE' });
      }).toThrow(PosterUnsafeUnicodeError);
    });

    it('throws PosterUnsafeUnicodeError on null byte (U+0000)', () => {
      expect(() => {
        resolveScriptRuns('Parisian\u0000Shopper', { role: 'HEADLINE' });
      }).toThrow(PosterUnsafeUnicodeError);
    });

    it('throws PosterUnsafeUnicodeError on dangerous non-printable control characters (U+0007 bell)', () => {
      expect(() => {
        resolveScriptRuns('Parisian\u0007Shopper', { role: 'HEADLINE' });
      }).toThrow(PosterUnsafeUnicodeError);
    });

    it('throws PosterUnsafeUnicodeError on escape character (U+001B)', () => {
      expect(() => {
        resolveScriptRuns('Parisian\u001bShopper', { role: 'HEADLINE' });
      }).toThrow(PosterUnsafeUnicodeError);
    });

    it('throws PosterUnsafeUnicodeError on Unicode replacement character (U+FFFD)', () => {
      expect(() => {
        resolveScriptRuns('Parisian \ufffd Shopper', { role: 'BODY' });
      }).toThrow(PosterUnsafeUnicodeError);
    });

    it('throws PosterUnsafeUnicodeError on Byte Order Mark (U+FEFF)', () => {
      expect(() => {
        resolveScriptRuns('Parisian \ufeff Shopper', { role: 'BODY' });
      }).toThrow(PosterUnsafeUnicodeError);
    });

    it('throws PosterUnsafeUnicodeError on Private Use Area code points (U+E001)', () => {
      expect(() => {
        resolveScriptRuns('Parisian \ue001 Shopper', { role: 'BODY' });
      }).toThrow(PosterUnsafeUnicodeError);
    });

    it('allows valid normal whitespace, tabs, and explicit newlines', () => {
      expect(() => {
        resolveScriptRuns('Line 1\nLine 2\tIndented', { role: 'BODY' });
      }).not.toThrow();
    });

    it('allows valid Khmer zero-width space (U+200B) used for orthographic word breaks', () => {
      expect(() => {
        resolveScriptRuns('កម្ពុជា\u200Bសន្តិភាព', { role: 'BODY' });
      }).not.toThrow();
    });
  });
});
