/**
 * Authoritative Golden Typography Corpus for Work Package W21 (Steps A through G).
 *
 * Covers all approved linguistic, numeric, commercial, structural, and security scenarios:
 * - French Luxury copy (diacritics, guillemets, contractions)
 * - Complex Khmer orthography (Coeng subscript sequences, independent vowels, series 1/2 markers)
 * - Monosyllabic and multi-syllabic Khmer words ending with repetition mark Lek Took (ៗ)
 * - Orphan punctuation guards (ៗ, ។, ៕, ៖, ៘, ៛)
 * - Mixed bilingual code-switching (Khmer copy with Latin brand names)
 * - Latin and Khmer numerals (0-9, ០-៩)
 * - Atomic prices in USD ($48.00, $120.00), EUR (120 €), GBP (£85.00), and Riel (២០០,០០០ ៛)
 * - Atomic product SKUs (PRS-LUM-2026-FR, CHANEL-N5-EDP-100)
 * - Extreme length and micro-strings
 * - Attack vectors: unassigned code points, Bidi overrides, null bytes, replacement character (U+FFFD)
 * - Attack vectors: unsupported scripts (CJK, Arabic, Cyrillic, Thai, emoji)
 */

export interface GoldenCorpusItem {
  readonly id: string;
  readonly category:
    | 'FRENCH_LUXURY'
    | 'KHMER_ORTHOGRAPHIC'
    | 'MIXED_BILINGUAL'
    | 'MONOSYLLABIC_REPETITION'
    | 'PRICE_CURRENCY'
    | 'PRODUCT_SKU'
    | 'EXTREME_LENGTH'
    | 'MINIMAL_MICRO'
    | 'ATTACK_VECTOR';
  readonly description: string;
  readonly text: string;
  readonly expectedLanguage?: 'EN' | 'FR' | 'KM' | 'BILINGUAL';
  readonly expectedScript: 'LATIN' | 'KHMER' | 'MIXED';
  readonly role?: 'HEADLINE' | 'SECONDARY_HEADLINE' | 'BODY' | 'PRICE' | 'CTA' | 'LABEL' | 'SUPPORTING';
  readonly shouldPass: boolean;
  readonly expectedError?:
    | 'PosterFontGlyphMissingError'
    | 'PosterUnsupportedScriptError'
    | 'PosterUnsafeUnicodeError'
    | 'PosterLayoutOverflowError';
  readonly forbiddenBreakSequences?: readonly string[];
  readonly mustNotStartLine?: readonly string[];
  readonly mustContainSubstrings?: readonly string[];
}

export const GOLDEN_TYPOGRAPHY_CORPUS: readonly GoldenCorpusItem[] = [
  // 1. French Luxury Copy
  {
    id: 'french-luxury-01',
    category: 'FRENCH_LUXURY',
    description: 'French display headline with guillemets, circumflex, and em-dash',
    text: '« Élégance Intemporelle — L\'Âme de Paris »',
    expectedLanguage: 'FR',
    expectedScript: 'LATIN',
    role: 'HEADLINE',
    shouldPass: true,
  },
  {
    id: 'french-luxury-02',
    category: 'FRENCH_LUXURY',
    description: 'French scent notes copy with ligature and accents',
    text: 'Voile d\'Ambre & Cœur de Rose Mystique',
    expectedLanguage: 'FR',
    expectedScript: 'LATIN',
    role: 'SECONDARY_HEADLINE',
    shouldPass: true,
  },
  {
    id: 'french-luxury-03',
    category: 'FRENCH_LUXURY',
    description: 'French seasonal collection eyebrow label',
    text: 'Collection Privée d\'Automne · Paris 2026',
    expectedLanguage: 'FR',
    expectedScript: 'LATIN',
    role: 'LABEL',
    shouldPass: true,
  },
  {
    id: 'en-headline',
    category: 'FRENCH_LUXURY',
    description: 'English display headline in Playfair Display',
    text: 'Elegance Redefined for Paris',
    expectedLanguage: 'EN',
    expectedScript: 'LATIN',
    role: 'HEADLINE',
    shouldPass: true,
  },
  {
    id: 'en-body',
    category: 'FRENCH_LUXURY',
    description: 'English editorial body copy in Montserrat',
    text: 'Discover the latest Parisian summer collection crafted with authentic heritage and timeless elegance.',
    expectedLanguage: 'EN',
    expectedScript: 'LATIN',
    role: 'BODY',
    shouldPass: true,
  },

  // 2. Khmer Orthography & Complex Clusters
  {
    id: 'km-headline',
    category: 'KHMER_ORTHOGRAPHIC',
    description: 'Khmer display headline in Noto Sans Khmer',
    text: 'ភាពប្រណីតនៃរាជធានីភ្នំពេញ',
    expectedLanguage: 'KM',
    expectedScript: 'KHMER',
    role: 'HEADLINE',
    shouldPass: true,
  },
  {
    id: 'km-body',
    category: 'KHMER_ORTHOGRAPHIC',
    description: 'Khmer body copy with complex subscript clusters',
    text: 'ស្វែងរកភាពស្រស់ស្អាតនិងទាន់សម័យជាមួយផលិតផលម៉ាកល្បីៗមកពីប្រទេសបារាំងដែលនាំចូលផ្តាច់មុខ។',
    expectedLanguage: 'KM',
    expectedScript: 'KHMER',
    role: 'BODY',
    shouldPass: true,
  },
  {
    id: 'khmer-coeng-clusters',
    category: 'KHMER_ORTHOGRAPHIC',
    description: 'Khmer Coeng subscript sequences and complex clusters',
    text: 'កម្ពុជា សង្ក្រាន្ត ស្ត្រី ផ្កា ត្រី បណ្ណាល័យ រដ្ឋបាល',
    expectedLanguage: 'KM',
    expectedScript: 'KHMER',
    role: 'BODY',
    shouldPass: true,
  },
  {
    id: 'khmer-dependent-vowels',
    category: 'KHMER_ORTHOGRAPHIC',
    description: 'Complete series of Khmer dependent vowels and diacritics',
    text: 'កា កិ កី កឹ កឺ កុ កូ កួ កើ កឿ កៀ កេ កែ កៃ កោ កៅ កុំ កំ កះ កុះ កេះ កោះ',
    expectedLanguage: 'KM',
    expectedScript: 'KHMER',
    role: 'BODY',
    shouldPass: true,
  },
  {
    id: 'khmer-seasonal-festival',
    category: 'KHMER_ORTHOGRAPHIC',
    description: 'Khmer traditional festival headline with numerals',
    text: 'ពិធីបុណ្យភ្ជុំបិណ្ឌ ២០២៦',
    expectedLanguage: 'KM',
    expectedScript: 'KHMER',
    role: 'HEADLINE',
    shouldPass: true,
  },
  {
    id: 'khmer-scent-lotus',
    category: 'KHMER_ORTHOGRAPHIC',
    description: 'Traditional Khmer lotus floral notes description',
    text: 'កម្រងផ្កាម្លិះ និងឈើក្រអូបប្រណីតពីធម្មជាតិ',
    expectedLanguage: 'KM',
    expectedScript: 'KHMER',
    role: 'SUPPORTING',
    shouldPass: true,
  },

  // 3. Monosyllabic Words with Lek Took Repetition Mark
  {
    id: 'monosyllabic-rep-01',
    category: 'MONOSYLLABIC_REPETITION',
    description: 'Monosyllabic Khmer coda consonant word with Lek Took (must not split into ពិ / តៗ)',
    text: 'ភាពទាក់ទាញបែបប៉ារីសពិតៗ',
    expectedLanguage: 'KM',
    expectedScript: 'KHMER',
    role: 'HEADLINE',
    shouldPass: true,
    forbiddenBreakSequences: ['ពិ\nតៗ', 'ពិ \nតៗ'],
  },
  {
    id: 'monosyllabic-rep-02',
    category: 'MONOSYLLABIC_REPETITION',
    description: 'Multiple monosyllabic repetition pairs (must never separate coda or Lek Took)',
    text: 'ស្អាតៗ និង ថ្មីៗ ជានិច្ច',
    expectedLanguage: 'KM',
    expectedScript: 'KHMER',
    role: 'BODY',
    shouldPass: true,
    forbiddenBreakSequences: ['ស្អា\nតៗ', 'ថ្មី\nៗ'],
  },
  {
    id: 'monosyllabic-rep-03',
    category: 'MONOSYLLABIC_REPETITION',
    description: 'Repetition mark in marketing intensifiers',
    text: 'មានច្រើនៗ និង ល្អៗ ឥតខ្ចោះ',
    expectedLanguage: 'KM',
    expectedScript: 'KHMER',
    role: 'BODY',
    shouldPass: true,
    forbiddenBreakSequences: ['ច្រើន\nៗ', 'ល្អ\nៗ'],
  },

  // 4. Orphan Khmer Punctuation Guards
  {
    id: 'orphan-guards-01',
    category: 'KHMER_ORTHOGRAPHIC',
    description: 'Khmer sentence with Khan and Bariyoosan punctuation (must not start wrapped line)',
    text: 'សម្រស់បែបបារាំងពិតៗ។ ស្អាតឥតខ្ចោះ៕',
    expectedLanguage: 'KM',
    expectedScript: 'KHMER',
    role: 'BODY',
    shouldPass: true,
    mustNotStartLine: ['ៗ', '។', '៕', '៖', '៘', '៛'],
  },
  {
    id: 'orphan-guards-02',
    category: 'KHMER_ORTHOGRAPHIC',
    description: 'Khmer list with Camnuc Pii Kuuh and Beyyal',
    text: 'រួមមាន៖ ទឹកអប់ ក្រែម និង ឡេ៘',
    expectedLanguage: 'KM',
    expectedScript: 'KHMER',
    role: 'BODY',
    shouldPass: true,
    mustNotStartLine: ['៖', '៘'],
  },

  // 5. Atomic Price & Currency Formatting
  {
    id: 'usd-price',
    category: 'PRICE_CURRENCY',
    description: 'USD currency price format (must remain atomic)',
    text: '$48.00',
    expectedLanguage: 'EN',
    expectedScript: 'LATIN',
    role: 'PRICE',
    shouldPass: true,
    forbiddenBreakSequences: ['$\n48.00', '$ \n48.00'],
  },
  {
    id: 'usd-promo-price',
    category: 'PRICE_CURRENCY',
    description: 'Bilingual promotional price badge',
    text: 'តម្លៃពិសេស៖ $38.00',
    expectedLanguage: 'BILINGUAL',
    expectedScript: 'MIXED',
    role: 'PRICE',
    shouldPass: true,
    forbiddenBreakSequences: ['$\n38.00'],
  },
  {
    id: 'riel-price',
    category: 'PRICE_CURRENCY',
    description: 'Cambodian Riel currency format with Khmer numerals and currency symbol',
    text: '២០០,០០០ ៛',
    expectedLanguage: 'KM',
    expectedScript: 'KHMER',
    role: 'PRICE',
    shouldPass: true,
    mustNotStartLine: ['៛'],
    forbiddenBreakSequences: ['២០០,០០០\n៛', '២០០,០០០ \n៛'],
  },
  {
    id: 'riel-tag-latin-num',
    category: 'PRICE_CURRENCY',
    description: 'Cambodian Riel price with Latin digits and Khmer currency symbol',
    text: 'តម្លៃ៖ 150,000 ៛',
    expectedLanguage: 'KM',
    expectedScript: 'MIXED',
    role: 'PRICE',
    shouldPass: true,
    mustNotStartLine: ['៛'],
  },
  {
    id: 'euro-price',
    category: 'PRICE_CURRENCY',
    description: 'Euro currency price with symbol',
    text: '120 €',
    expectedLanguage: 'FR',
    expectedScript: 'LATIN',
    role: 'PRICE',
    shouldPass: true,
    forbiddenBreakSequences: ['120\n€'],
  },
  {
    id: 'gbp-price',
    category: 'PRICE_CURRENCY',
    description: 'GBP currency price format',
    text: '£85.00',
    expectedLanguage: 'EN',
    expectedScript: 'LATIN',
    role: 'PRICE',
    shouldPass: true,
    forbiddenBreakSequences: ['£\n85.00'],
  },

  // 6. Atomic Product SKUs
  {
    id: 'sku-barcode',
    category: 'PRODUCT_SKU',
    description: 'Product SKU code (must not split across hyphens)',
    text: 'SKU: PRS-LUM-2026-FR',
    expectedLanguage: 'EN',
    expectedScript: 'LATIN',
    role: 'LABEL',
    shouldPass: true,
    forbiddenBreakSequences: ['PRS-\nLUM', 'LUM-\n2026'],
  },
  {
    id: 'sku-chanel',
    category: 'PRODUCT_SKU',
    description: 'Luxury brand product code with hyphens and numbers',
    text: 'CHANEL-N5-EDP-100',
    expectedLanguage: 'EN',
    expectedScript: 'LATIN',
    role: 'LABEL',
    shouldPass: true,
    forbiddenBreakSequences: ['CHANEL-\nN5', 'N5-\nEDP'],
  },
  {
    id: 'sku-khmer-edition',
    category: 'PRODUCT_SKU',
    description: 'Bilingual regional SKU token',
    text: 'GEP-KING-EDP-100-KM',
    expectedLanguage: 'EN',
    expectedScript: 'LATIN',
    role: 'LABEL',
    shouldPass: true,
    forbiddenBreakSequences: ['GEP-\nKING'],
  },

  // 7. Mixed Bilingual Code-Switching
  {
    id: 'bilingual-headline',
    category: 'MIXED_BILINGUAL',
    description: 'Bilingual headline with distinct Khmer and Latin sections',
    text: 'រចនាបថប៉ារីស — Parisian Elegance',
    expectedLanguage: 'BILINGUAL',
    expectedScript: 'MIXED',
    role: 'HEADLINE',
    shouldPass: true,
  },
  {
    id: 'mixed-inline',
    category: 'MIXED_BILINGUAL',
    description: 'Mixed inline text with brand name inside Khmer copy',
    text: 'សូមស្វាគមន៍មកកាន់ Parisian Shopper ផ្លូវការ',
    expectedLanguage: 'BILINGUAL',
    expectedScript: 'MIXED',
    role: 'BODY',
    shouldPass: true,
  },
  {
    id: 'mixed-perfume-brand',
    category: 'MIXED_BILINGUAL',
    description: 'Khmer copy referencing iconic French fragrance brand',
    text: 'ទឹកអប់ Chanel No. 5 ពីប៉ារីស',
    expectedLanguage: 'BILINGUAL',
    expectedScript: 'MIXED',
    role: 'HEADLINE',
    shouldPass: true,
  },
  {
    id: 'mixed-designer-discount',
    category: 'MIXED_BILINGUAL',
    description: 'Promotion mentioning designer name with Latin numerals and percentage',
    text: 'បញ្ចុះតម្លៃ 50% សម្រាប់ Yves Saint Laurent',
    expectedLanguage: 'BILINGUAL',
    expectedScript: 'MIXED',
    role: 'BODY',
    shouldPass: true,
  },
  {
    id: 'promo-text',
    category: 'MIXED_BILINGUAL',
    description: 'Bilingual promotional badge text',
    text: 'បញ្ចុះតម្លៃពិសេស 20% OFF Limited Time',
    expectedLanguage: 'BILINGUAL',
    expectedScript: 'MIXED',
    role: 'LABEL',
    shouldPass: true,
  },
  {
    id: 'multiline-text',
    category: 'MIXED_BILINGUAL',
    description: 'Multiline copy with explicit newlines across Khmer and Latin',
    text: 'សម្រស់បែបបារាំងពិតៗ\nParisian Authentic Beauty\nនាំចូលផ្តាច់មុខ 100%',
    expectedLanguage: 'BILINGUAL',
    expectedScript: 'MIXED',
    role: 'BODY',
    shouldPass: true,
  },

  // 8. Numerals & CTA Buttons
  {
    id: 'latin-numerals',
    category: 'FRENCH_LUXURY',
    description: 'Latin numerals in catalog copy',
    text: 'Collection 2026 Edition 01',
    expectedLanguage: 'EN',
    expectedScript: 'LATIN',
    role: 'LABEL',
    shouldPass: true,
  },
  {
    id: 'khmer-numerals',
    category: 'KHMER_ORTHOGRAPHIC',
    description: 'Khmer numerals in date or discount context',
    text: 'ឆ្នាំ ២០២៦ លើកទី ០១',
    expectedLanguage: 'KM',
    expectedScript: 'KHMER',
    role: 'LABEL',
    shouldPass: true,
  },
  {
    id: 'cta-en',
    category: 'FRENCH_LUXURY',
    description: 'English call to action button',
    text: 'SHOP NOW',
    expectedLanguage: 'EN',
    expectedScript: 'LATIN',
    role: 'CTA',
    shouldPass: true,
  },
  {
    id: 'cta-km',
    category: 'KHMER_ORTHOGRAPHIC',
    description: 'Khmer call to action button',
    text: 'ទិញឥឡូវនេះ',
    expectedLanguage: 'KM',
    expectedScript: 'KHMER',
    role: 'CTA',
    shouldPass: true,
  },
  {
    id: 'long-product-name',
    category: 'FRENCH_LUXURY',
    description: 'Long luxury product title',
    text: 'Eau de Parfum Sublime Botanique Fleur de Soirée 100ml',
    expectedLanguage: 'FR',
    expectedScript: 'LATIN',
    role: 'HEADLINE',
    shouldPass: true,
  },
  {
    id: 'punctuation-standard',
    category: 'MIXED_BILINGUAL',
    description: 'Standard punctuation in mixed copy',
    text: '“Parisian Shopper”, តម្លៃ: $48; (មានស្តុក!) & [ថ្មី]',
    expectedLanguage: 'BILINGUAL',
    expectedScript: 'MIXED',
    role: 'BODY',
    shouldPass: true,
  },

  // 9. Extreme Length & Micro-Strings
  {
    id: 'extreme-length-unbroken',
    category: 'EXTREME_LENGTH',
    description: 'Ultra-long compound title to test bounded shrinking and overflow behavior',
    text: 'SupercalifragilisticexpialidociousParisianLuxuryFragranceCollectionSublimeExtraordinaire',
    expectedLanguage: 'EN',
    expectedScript: 'LATIN',
    role: 'HEADLINE',
    shouldPass: true,
  },
  {
    id: 'minimal-micro-01',
    category: 'MINIMAL_MICRO',
    description: 'Single Khmer consonant character',
    text: 'ក',
    expectedLanguage: 'KM',
    expectedScript: 'KHMER',
    role: 'BODY',
    shouldPass: true,
  },
  {
    id: 'minimal-micro-02',
    category: 'MINIMAL_MICRO',
    description: 'Single Khmer pronoun word with independent vowel cluster',
    text: 'ខ្ញុំ',
    expectedLanguage: 'KM',
    expectedScript: 'KHMER',
    role: 'BODY',
    shouldPass: true,
  },
  {
    id: 'minimal-micro-03',
    category: 'MINIMAL_MICRO',
    description: 'Short two-letter French word',
    text: 'Or',
    expectedLanguage: 'FR',
    expectedScript: 'LATIN',
    role: 'LABEL',
    shouldPass: true,
  },
  {
    id: 'minimal-micro-04',
    category: 'MINIMAL_MICRO',
    description: 'Single capitalized Latin city token',
    text: 'Paris',
    expectedLanguage: 'FR',
    expectedScript: 'LATIN',
    role: 'HEADLINE',
    shouldPass: true,
  },

  // 10. Attack Vectors & Security Defenses (All must fail closed)
  {
    id: 'emoji-attack',
    category: 'ATTACK_VECTOR',
    description: 'Unsupported emoji character (must fail closed)',
    text: 'Parisian Shopper 🌸 Luxury',
    expectedScript: 'MIXED',
    role: 'BODY',
    shouldPass: false,
    expectedError: 'PosterUnsupportedScriptError',
  },
  {
    id: 'cjk-attack',
    category: 'ATTACK_VECTOR',
    description: 'Unsupported CJK ideograph (must fail closed with PosterUnsupportedScriptError)',
    text: 'Parisian Shopper 香水',
    expectedScript: 'MIXED',
    role: 'BODY',
    shouldPass: false,
    expectedError: 'PosterUnsupportedScriptError',
  },
  {
    id: 'arabic-attack',
    category: 'ATTACK_VECTOR',
    description: 'Unsupported Arabic script (must fail closed with PosterUnsupportedScriptError)',
    text: 'عطر باريسي فاخر',
    expectedScript: 'MIXED',
    role: 'BODY',
    shouldPass: false,
    expectedError: 'PosterUnsupportedScriptError',
  },
  {
    id: 'thai-attack',
    category: 'ATTACK_VECTOR',
    description: 'Unsupported Thai script (must fail closed with PosterUnsupportedScriptError)',
    text: 'น้ำหอมปารีส',
    expectedScript: 'MIXED',
    role: 'BODY',
    shouldPass: false,
    expectedError: 'PosterUnsupportedScriptError',
  },
  {
    id: 'bidi-attack',
    category: 'ATTACK_VECTOR',
    description: 'Bidirectional override character attack (must fail closed)',
    text: 'Parisian \u202E Shopper',
    expectedScript: 'LATIN',
    role: 'BODY',
    shouldPass: false,
    expectedError: 'PosterUnsafeUnicodeError',
  },
  {
    id: 'null-char-attack',
    category: 'ATTACK_VECTOR',
    description: 'Null byte injection attack (must fail closed)',
    text: 'Parisian\u0000Shopper',
    expectedScript: 'LATIN',
    role: 'BODY',
    shouldPass: false,
    expectedError: 'PosterUnsafeUnicodeError',
  },
  {
    id: 'replacement-char-attack',
    category: 'ATTACK_VECTOR',
    description: 'Unicode replacement character U+FFFD (must fail closed)',
    text: 'Parisian \uFFFD Shopper',
    expectedScript: 'LATIN',
    role: 'BODY',
    shouldPass: false,
    expectedError: 'PosterUnsafeUnicodeError',
  },
  {
    id: 'unassigned-code-point-attack',
    category: 'ATTACK_VECTOR',
    description: 'Unassigned Greek reserve code point U+0378 (must fail closed)',
    text: 'Parisian \u0378 Shopper',
    expectedScript: 'LATIN',
    role: 'BODY',
    shouldPass: false,
    expectedError: 'PosterUnsupportedScriptError',
  },
] as const;
