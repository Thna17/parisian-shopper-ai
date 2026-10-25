import {
  isKhmerCombiningMark,
  isKhmerCoeng,
  isKhmerCurrency,
  isKhmerDependentVowel,
  isKhmerLekTook,
  isKhmerPunctuation,
  safeKhmerTokenize,
  splitTextIntoParagraphs,
} from './khmer-line-breaker.js';

describe('KhmerLineBreaker & Cluster Boundary Safeguards (W21-E)', () => {
  describe('Khmer Unicode Code Point Classification', () => {
    it('accurately identifies Khmer Coeng (U+17D2)', () => {
      expect(isKhmerCoeng(0x17d2)).toBe(true);
      expect(isKhmerCoeng(0x1780)).toBe(false);
    });

    it('accurately identifies Khmer dependent vowels (U+17B6 to U+17C5)', () => {
      expect(isKhmerDependentVowel(0x17b6)).toBe(true); // Aa
      expect(isKhmerDependentVowel(0x17bb)).toBe(true); // U
      expect(isKhmerDependentVowel(0x17c5)).toBe(true); // Au
      expect(isKhmerDependentVowel(0x1780)).toBe(false); // Ka (consonant)
    });

    it('accurately identifies Khmer combining marks and diacritics', () => {
      expect(isKhmerCombiningMark(0x17c6)).toBe(true); // Nikahit
      expect(isKhmerCombiningMark(0x17c7)).toBe(true); // Reahmuk
      expect(isKhmerCombiningMark(0x17cb)).toBe(true); // Bantoc
      expect(isKhmerCombiningMark(0x17cd)).toBe(true); // Toandakhiat
      expect(isKhmerCombiningMark(0x17d2)).toBe(true); // Coeng
    });

    it('accurately identifies Khmer punctuation marks (Khan, Bariyoosan, Colon, Beyyal, Koomuut)', () => {
      expect(isKhmerPunctuation(0x17d4)).toBe(true); // Khan ។
      expect(isKhmerPunctuation(0x17d5)).toBe(true); // Bariyoosan ៕
      expect(isKhmerPunctuation(0x17d6)).toBe(true); // Colon ៖
      expect(isKhmerPunctuation(0x17d8)).toBe(true); // Beyyal ៘
      expect(isKhmerPunctuation(0x17da)).toBe(true); // Koomuut ៚
      expect(isKhmerPunctuation(0x1780)).toBe(false); // Consonant Ka
    });

    it('accurately identifies Khmer Lek Took (U+17D7 ៗ) and Riel currency (U+17DB ៛)', () => {
      expect(isKhmerLekTook(0x17d7)).toBe(true);
      expect(isKhmerLekTook(0x17d4)).toBe(false);

      expect(isKhmerCurrency(0x17db)).toBe(true);
      expect(isKhmerCurrency(0x0024)).toBe(false); // $
    });
  });

  describe('Khmer Monosyllabic Words & Lek Took (ៗ) Repetition Safeguards', () => {
    it('never splits monosyllabic words with coda consonant before Lek Took (ពិតៗ)', () => {
      const tokens = safeKhmerTokenize('ពិតៗ');
      expect(tokens).toEqual(['ពិតៗ']);
    });

    it('keeps word and Lek Took intact inside complete marketing headlines', () => {
      const text = 'សម្រស់បែបបារាំងពិតៗ';
      const tokens = safeKhmerTokenize(text);
      expect(tokens).toEqual(['សម្រស់', 'បែប', 'បារាំង', 'ពិតៗ']);
      expect(tokens.join('')).toBe(text);
    });

    it('never leaves Lek Took (ៗ) isolated as an orphan token for repeated adjectives', () => {
      const words = ['ថ្មីៗ', 'លឿនៗ', 'ឆាប់ៗ', 'តិចៗ', 'ខ្លាំងៗ'];
      for (const word of words) {
        const tokens = safeKhmerTokenize(word);
        expect(tokens).toEqual([word]);
      }
    });

    it('attaches Khmer punctuation (។, ៕, ៖, ៘, ៛) to the preceding word segment', () => {
      const sentence = 'ការអភិវឌ្ឍន៍សង្គម។';
      const tokens = safeKhmerTokenize(sentence);
      expect(tokens).toHaveLength(2);
      expect(tokens[1]).toBe('សង្គម។');
      expect(isKhmerPunctuation(tokens[1]!.codePointAt(0)!)).toBe(false);
    });
  });

  describe('Khmer Cluster Boundary Enforcement', () => {
    it('never breaks inside Coeng subscript clusters (e.g. កម្ពុជា)', () => {
      const text = 'កម្ពុជា';
      const tokens = safeKhmerTokenize(text);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toBe('កម្ពុជា');
    });

    it('never breaks between base consonant and subscript in words like សង្ក្រាន្ត', () => {
      const tokens = safeKhmerTokenize('សង្ក្រាន្ត');
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toBe('សង្ក្រាន្ត');
    });

    it('preserves complex multi-consonant clusters (ស្ត្រី, ផ្កា, ត្រី)', () => {
      for (const cluster of ['ស្ត្រី', 'ផ្កា', 'ត្រី']) {
        const tokens = safeKhmerTokenize(cluster);
        expect(tokens).toEqual([cluster]);
      }
    });

    it('never breaks before dependent vowels or combining marks', () => {
      const text = 'ការអភិវឌ្ឍន៍សង្គម';
      const tokens = safeKhmerTokenize(text);
      for (const token of tokens) {
        const firstCp = token.codePointAt(0)!;
        expect(isKhmerDependentVowel(firstCp)).toBe(false);
        expect(isKhmerCombiningMark(firstCp)).toBe(false);
      }
    });

    it('tokenizes Khmer sentence into semantic word segments without breaking syllable clusters', () => {
      const sentence = 'កម្ពុជាស្រស់ស្អាតនិងមានសន្តិភាព';
      const tokens = safeKhmerTokenize(sentence);
      expect(tokens.length).toBeGreaterThanOrEqual(2);
      expect(tokens.join('')).toBe(sentence);

      // Verify no token starts with a combining mark or vowel
      for (const token of tokens) {
        const firstCp = token.codePointAt(0)!;
        expect(isKhmerDependentVowel(firstCp)).toBe(false);
        expect(isKhmerCombiningMark(firstCp)).toBe(false);
      }
    });

    it('preserves Zero-Width Space (U+200B ZWSP) as a safe orthographic break boundary', () => {
      const withZwsp = 'កម្ពុជា\u200Bសន្តិភាព';
      const tokens = safeKhmerTokenize(withZwsp);
      expect(tokens).toEqual(['កម្ពុជា\u200B', 'សន្តិភាព']);
    });
  });

  describe('Paragraph and Explicit Newline Intent', () => {
    it('preserves explicit LF and CRLF newlines as distinct paragraphs', () => {
      const multiline = 'ជួរទី១\nជួរទី២\r\nជួរទី៣';
      const paragraphs = splitTextIntoParagraphs(multiline);
      expect(paragraphs).toEqual(['ជួរទី១', 'ជួរទី២', 'ជួរទី៣']);
    });

    it('preserves empty lines for deliberate paragraph spacing', () => {
      const withEmptyLine = 'កថាខណ្ឌទីមួយ\n\nកថាខណ្ឌទីពីរ';
      const paragraphs = splitTextIntoParagraphs(withEmptyLine);
      expect(paragraphs).toHaveLength(3);
      expect(paragraphs[0]).toBe('កថាខណ្ឌទីមួយ');
      expect(paragraphs[1]).toBe('');
      expect(paragraphs[2]).toBe('កថាខណ្ឌទីពីរ');
    });
  });
});
