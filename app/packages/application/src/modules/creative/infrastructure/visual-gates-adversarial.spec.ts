import { createHash } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import sharp from 'sharp';
import { type ProductSnapshot } from '../../products/application/product-snapshot.repository.js';
import {
  DeterministicVisualValidator,
  VisualFindingCode,
  VisualValidationSeverity,
} from '../domain/index.js';
import {
  HardGateCode,
  type HardGateEvaluationInput,
  type TypographyBlockInput,
} from '../domain/services/hard-visual-gates.port.js';
import { HardVisualGatesEngine } from '../domain/services/hard-visual-gates.engine.js';
import { type AestheticEvaluationInput } from '../domain/services/soft-aesthetic-scorer.port.js';
import { SoftAestheticScorer } from '../domain/services/soft-aesthetic-scorer.engine.js';

type AspectRatio = '1:1' | '4:5' | '9:16';

describe('W24 Visual Gates Adversarial Regression & Golden Matrix Suite', () => {
  const hardGatesEngine = new HardVisualGatesEngine();
  const aestheticScorer = new SoftAestheticScorer();
  const deterministicValidator = new DeterministicVisualValidator();

  /**
   * Helper to generate a solid or colored PNG buffer using Sharp.
   */
  async function createTestImageBuffer(
    width: number,
    height: number,
    backgroundColor = '#161616',
  ): Promise<Buffer> {
    return sharp({
      create: {
        width,
        height,
        channels: 4,
        background: backgroundColor,
      },
    })
      .png()
      .toBuffer();
  }

  /**
   * Helper to create a product cutout with opaque pixels at the top border (for alpha clipping test).
   */
  async function createCutoutWithTopOpaquePixels(width = 500, height = 700): Promise<Buffer> {
    // Create an RGBA buffer with top row alpha = 255
    const channels = 4;
    const rawBuffer = Buffer.alloc(width * height * channels, 0); // Transparent by default
    // Fill top row with opaque white
    for (let x = 0; x < width; x++) {
      const idx = x * channels;
      rawBuffer[idx] = 255; // R
      rawBuffer[idx + 1] = 255; // G
      rawBuffer[idx + 2] = 255; // B
      rawBuffer[idx + 3] = 255; // A (opaque)
    }
    // Also fill a center area so it's not empty
    const startY = Math.floor(height * 0.2);
    const endY = Math.floor(height * 0.8);
    for (let y = startY; y < endY; y++) {
      for (let x = Math.floor(width * 0.2); x < Math.floor(width * 0.8); x++) {
        const idx = (y * width + x) * channels;
        rawBuffer[idx] = 200;
        rawBuffer[idx + 1] = 180;
        rawBuffer[idx + 2] = 120;
        rawBuffer[idx + 3] = 255;
      }
    }

    return sharp(rawBuffer, {
      raw: {
        width,
        height,
        channels: 4,
      },
    })
      .png()
      .toBuffer();
  }

  /**
   * Helper to create governed ProductSnapshot test records.
   */
  function createMockSnapshot(overrides?: {
    sku?: string | undefined;
    price?: string | undefined;
    currency?: string | undefined;
    promo_price?: string | undefined;
    discount?:
      | {
          type: 'percentage' | 'fixed_amount' | 'none';
          value: string;
          calculation_method: string;
        }
      | undefined;
    snapshotHash?: string | undefined;
  }): ProductSnapshot {
    const product = {
      sku: overrides?.sku ?? 'PARIS-BLEU-100',
      product_name: 'Bleu de Chanel Eau de Parfum',
      brand: 'Chanel',
      category: 'Fragrance',
      price: overrides?.price ?? '195.00',
      currency: overrides?.currency ?? 'USD',
      stock_status: 'in_stock' as const,
      ...(overrides?.promo_price !== undefined ? { promo_price: overrides.promo_price } : {}),
      ...(overrides?.discount !== undefined ? { discount: overrides.discount } : {}),
    };

    return {
      id: 'snapshot-uuid-adv-test',
      product: {
        schema_version: '1.0' as const,
        source_system: 'test-adversarial',
        retrieved_at: '2026-10-27T00:00:00Z',
        source_updated_at: '2026-10-27T00:00:00Z',
        lifecycle_status: 'active' as const,
        product,
      },
      snapshotHash: overrides?.snapshotHash ?? 'hash-snapshot-active-v2-195usd',
      normalizerVersion: 'phase-1b-v1',
      createdAt: new Date('2026-10-27T00:00:00Z'),
    };
  }

  // ====================================================================
  // SECTION 1: 10 ADVERSARIAL ATTACK FIXTURES (W24-A Section 7)
  // ====================================================================
  describe('Section 1: Adversarial Attack Corpus (Fail-Closed Verification)', () => {
    it('ADV-01-SUBTLE-CROP: blocks publication when perfume bottle nozzle is clipped at canvas top border', async () => {
      const assetBuffer = await createTestImageBuffer(1080, 1080, '#161616');
      const expectedSha256 = createHash('sha256').update(assetBuffer).digest('hex');
      const clippedProductBuffer = await createCutoutWithTopOpaquePixels(500, 700);

      // Hero bounding box shifted up to y = 0 (top border violation with opaque pixels)
      const input: HardGateEvaluationInput = {
        assetBuffer,
        expectedSha256,
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        productAssetBuffer: clippedProductBuffer,
        heroBoundingBox: { x: 290, y: 0, width: 500, height: 700 },
      };

      const outcome = await hardGatesEngine.evaluate(input);

      expect(outcome.isPassed).toBe(false);
      const failure = outcome.failures.find(
        (f) => f.code === HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED,
      );
      expect(failure).toBeDefined();
      expect(failure?.field).toBe('heroBoundingBox');
      expect(failure?.message).toContain('Product hero flacon is clipped at canvas border');
      expect(failure?.remediationAction).toContain('Reposition product flacon');
    });

    it('ADV-02-LOW-CONTRAST: blocks publication when white text is placed over high-luminance cream background', async () => {
      // High luminance cream background #F8F6F0 (relative luminance ~ 0.93)
      const creamBuffer = await createTestImageBuffer(1080, 1080, '#F8F6F0');
      const creamSha256 = createHash('sha256').update(creamBuffer).digest('hex');

      // White headline text #FFFFFF (luminance 1.0) -> contrast ratio is ~ 1.07:1 (far below 3.0:1)
      const input: HardGateEvaluationInput = {
        assetBuffer: creamBuffer,
        expectedSha256: creamSha256,
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        heroBoundingBox: { x: 300, y: 300, width: 480, height: 600 },
        typographyBlocks: [
          {
            role: 'headline',
            text: 'WHITE TEXT OVER CREAM',
            box: { x: 100, y: 100, width: 880, height: 80 },
            textColor: '#FFFFFF',
          },
        ],
      };

      const outcome = await hardGatesEngine.evaluate(input);

      expect(outcome.isPassed).toBe(false);
      const failure = outcome.failures.find((f) => f.code === HardGateCode.GATE_TEXT_CONTRAST_LOW);
      expect(failure).toBeDefined();
      expect(failure?.field).toBe('typographyBlocks[headline]');
      expect(failure?.message).toContain('is below required minimum');
      expect(failure?.remediationAction).toContain('Darken underlying background contrast panel');
    });

    it('ADV-03-PRICE-DRIFT: blocks publication when poster typography displays $99.00 but governed snapshot is $195.00', async () => {
      const assetBuffer = await createTestImageBuffer(1080, 1080, '#161616');
      const expectedSha256 = createHash('sha256').update(assetBuffer).digest('hex');
      const snapshot = createMockSnapshot({ price: '195.00', currency: 'USD' });

      const input: HardGateEvaluationInput = {
        assetBuffer,
        expectedSha256,
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        heroBoundingBox: { x: 300, y: 300, width: 480, height: 600 },
        productSnapshot: snapshot,
        typographyBlocks: [
          {
            role: 'price',
            text: '$99.00', // Adversarial price drift
            box: { x: 400, y: 200, width: 280, height: 50 },
            textColor: '#FFFFFF',
          },
        ],
      };

      const outcome = await hardGatesEngine.evaluate(input);

      expect(outcome.isPassed).toBe(false);
      const failure = outcome.failures.find(
        (f) => f.code === HardGateCode.GATE_FACTUAL_PRICE_MISMATCH,
      );
      expect(failure).toBeDefined();
      expect(failure?.field).toBe('price');
      expect(failure?.message).toContain("does not match governed product snapshot price '195.00'");
      expect(failure?.remediationAction).toContain(
        'Rebuild scene typography with current product price',
      );
    });

    it('ADV-04-UNAUTHORIZED-SALE: blocks publication when poster renders -50% OFF badge on a non-sale product snapshot', async () => {
      const assetBuffer = await createTestImageBuffer(1080, 1080, '#161616');
      const expectedSha256 = createHash('sha256').update(assetBuffer).digest('hex');
      // Snapshot has no active discount or promotional price
      const snapshot = createMockSnapshot({
        price: '195.00',
        currency: 'USD',
        discount: undefined,
      });

      const input: HardGateEvaluationInput = {
        assetBuffer,
        expectedSha256,
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        heroBoundingBox: { x: 300, y: 300, width: 480, height: 600 },
        productSnapshot: snapshot,
        typographyBlocks: [
          {
            role: 'promotionalPrice',
            text: '-50% OFF FLASH SALE', // Unauthorized promotion
            box: { x: 350, y: 150, width: 380, height: 50 },
            textColor: '#D4AF37',
          },
        ],
      };

      const outcome = await hardGatesEngine.evaluate(input);

      expect(outcome.isPassed).toBe(false);
      const failure = outcome.failures.find(
        (f) => f.code === HardGateCode.GATE_FACTUAL_PROMO_MISMATCH,
      );
      expect(failure).toBeDefined();
      expect(failure?.field).toBe('promotionalPrice');
      expect(failure?.message).toContain('Unauthorized promotional discount rendered');
      expect(failure?.remediationAction).toContain('Remove promotional pricing slot');
    });

    it('ADV-05-PLACEHOLDER-INJECTION: blocks publication when legacy demo placeholder cutout hash is injected', async () => {
      const assetBuffer = await createTestImageBuffer(1080, 1080, '#161616');
      const expectedSha256 = createHash('sha256').update(assetBuffer).digest('hex');
      // Known gold placeholder rectangular block hash from product-asset-validator.ts
      const legacyPlaceholderHash =
        '119f6d45a02aa0bb92591baaee926f322e33eb2221544f5e4cfb2187988734a3';

      const input: HardGateEvaluationInput = {
        assetBuffer,
        expectedSha256,
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        productSha256: legacyPlaceholderHash,
        heroBoundingBox: { x: 300, y: 300, width: 480, height: 600 },
      };

      const outcome = await hardGatesEngine.evaluate(input);

      expect(outcome.isPassed).toBe(false);
      const failure = outcome.failures.find(
        (f) => f.code === HardGateCode.GATE_PLACEHOLDER_REJECTED,
      );
      expect(failure).toBeDefined();
      expect(failure?.field).toBe('productSha256');
      expect(failure?.message).toContain('matches a known demo/placeholder fixture');
      expect(failure?.remediationAction).toContain('Replace placeholder fixture');
    });

    it('ADV-06-KHMER-OVERFLOW: blocks publication when complex Khmer headline breaches 5% safe margin boundary', async () => {
      const assetBuffer = await createTestImageBuffer(1080, 1080, '#161616');
      const expectedSha256 = createHash('sha256').update(assetBuffer).digest('hex');

      // Canvas width is 1080, 5% safe margin right bound is 1026px (1080 * 0.95)
      // Block placed at x: 200, width: 850 -> right edge is 1050px (> 1026px)
      const input: HardGateEvaluationInput = {
        assetBuffer,
        expectedSha256,
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        heroBoundingBox: { x: 300, y: 300, width: 480, height: 600 },
        typographyBlocks: [
          {
            role: 'headline',
            text: 'ទឹកអប់ប្រណិតប៉ារីសពិតប្រាកដសម្រាប់រដូវកាលថ្មី',
            box: { x: 200, y: 80, width: 850, height: 60 }, // Right edge: 1050 breaches 1026
            textColor: '#FFFFFF',
          },
        ],
      };

      const outcome = await hardGatesEngine.evaluate(input);

      expect(outcome.isPassed).toBe(false);
      const failure = outcome.failures.find(
        (f) => f.code === HardGateCode.GATE_SAFE_MARGIN_VIOLATION,
      );
      expect(failure).toBeDefined();
      expect(failure?.field).toBe('typographyBlocks[headline]');
      expect(failure?.message).toContain('penetrates 5% safe margin');
      expect(failure?.remediationAction).toContain('Reduce font size, decrease line wrap length');
    });

    it('ADV-07-BIDI-INJECTION: blocks publication when subtitle contains invisible Right-to-Left Override character (U+202E)', async () => {
      const assetBuffer = await createTestImageBuffer(1080, 1080, '#161616');
      const expectedSha256 = createHash('sha256').update(assetBuffer).digest('hex');

      const input: HardGateEvaluationInput = {
        assetBuffer,
        expectedSha256,
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        heroBoundingBox: { x: 300, y: 300, width: 480, height: 600 },
        typographyBlocks: [
          {
            role: 'subhead',
            text: 'Parfum\u202ENocturne Luxury Edition', // Bidi override attack
            box: { x: 200, y: 150, width: 680, height: 40 },
            textColor: '#FFFFFF',
          },
        ],
      };

      const outcome = await hardGatesEngine.evaluate(input);

      expect(outcome.isPassed).toBe(false);
      const failure = outcome.failures.find((f) => f.code === HardGateCode.GATE_UNSAFE_UNICODE);
      expect(failure).toBeDefined();
      expect(failure?.field).toBe('typographyBlocks[subhead]');
      expect(failure?.message).toContain('contains unsafe Unicode characters');
      expect(failure?.remediationAction).toContain(
        'Sanitize copy text by stripping bidi overrides',
      );
    });

    it('ADV-08-MISSING-GLYPH: blocks publication when typography contains unmapped Private Use Area code point (U+E001)', async () => {
      const assetBuffer = await createTestImageBuffer(1080, 1080, '#161616');
      const expectedSha256 = createHash('sha256').update(assetBuffer).digest('hex');

      const input: HardGateEvaluationInput = {
        assetBuffer,
        expectedSha256,
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        heroBoundingBox: { x: 300, y: 300, width: 480, height: 600 },
        typographyBlocks: [
          {
            role: 'subhead',
            text: 'Grand Epice \uE001 Collection Privée', // Unmapped PUA code point
            box: { x: 200, y: 150, width: 680, height: 40 },
            textColor: '#FFFFFF',
          },
        ],
      };

      const outcome = await hardGatesEngine.evaluate(input);

      expect(outcome.isPassed).toBe(false);
      const failure = outcome.failures.find((f) => f.code === HardGateCode.GATE_MISSING_GLYPHS);
      expect(failure).toBeDefined();
      expect(failure?.field).toBe('typographyBlocks[subhead]');
      expect(failure?.message).toContain('contains unmapped glyphs or missing font characters');
      expect(failure?.remediationAction).toContain(
        'Ensure selected font family supports all Unicode code points',
      );
    });

    it('ADV-09-CTA-COLLISION: blocks publication when CTA button directly collides with product hero bounding box', async () => {
      const assetBuffer = await createTestImageBuffer(1080, 1080, '#161616');
      const expectedSha256 = createHash('sha256').update(assetBuffer).digest('hex');

      // Hero bounding box extends from y = 250 to 800 (height: 550)
      // CTA button placed at y = 760 (height: 60) -> overlaps hero by 40px
      const input: HardGateEvaluationInput = {
        assetBuffer,
        expectedSha256,
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        heroBoundingBox: { x: 300, y: 250, width: 480, height: 550 },
        ctaBoundingBox: { x: 390, y: 760, width: 300, height: 60 }, // Collision with hero bottom
      };

      const outcome = await hardGatesEngine.evaluate(input);

      expect(outcome.isPassed).toBe(false);
      const failure = outcome.failures.find((f) => f.code === HardGateCode.GATE_CTA_HERO_COLLISION);
      expect(failure).toBeDefined();
      expect(failure?.field).toBe('ctaBoundingBox');
      expect(failure?.message).toContain('overlaps product hero bounding box');
      expect(failure?.remediationAction).toContain(
        'Reposition CTA button below the pedestal baseline',
      );
    });

    it('ADV-10-STALE-SNAPSHOT: blocks publication when poster rendered against obsolete snapshot version hash', async () => {
      const assetBuffer = await createTestImageBuffer(1080, 1080, '#161616');
      const expectedSha256 = createHash('sha256').update(assetBuffer).digest('hex');
      // Active authoritative snapshot hash is v2
      const activeSnapshot = createMockSnapshot({
        price: '195.00',
        snapshotHash: 'hash-snapshot-v2-active-digest',
      });

      const input: HardGateEvaluationInput = {
        assetBuffer,
        expectedSha256,
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        heroBoundingBox: { x: 300, y: 300, width: 480, height: 600 },
        productSnapshot: activeSnapshot,
        renderedSnapshotHash: 'hash-snapshot-v1-obsolete-stale-digest', // Rendered against stale snapshot
      };

      const outcome = await hardGatesEngine.evaluate(input);

      expect(outcome.isPassed).toBe(false);
      const failure = outcome.failures.find((f) => f.code === HardGateCode.GATE_SNAPSHOT_STALE);
      expect(failure).toBeDefined();
      expect(failure?.field).toBe('snapshotHash');
      expect(failure?.message).toContain('Scene rendered against stale product snapshot hash');
      expect(failure?.remediationAction).toContain(
        'Regenerate scene version against the updated product snapshot',
      );
    });
  });

  // ====================================================================
  // SECTION 2: MULTI-FORMAT GOLDEN VALIDATION MATRIX (3x3 = 9 COMBINATIONS)
  // ====================================================================
  describe('Section 2: Multi-Format Golden Validation Matrix (3 Ratios x 3 Languages)', () => {
    interface MatrixConfig {
      aspectRatio: AspectRatio;
      width: number;
      height: number;
      heroBox: { x: number; y: number; width: number; height: number };
      ctaBox: { x: number; y: number; width: number; height: number };
      typoGenerator: (
        lang: 'en' | 'km' | 'bilingual',
        ctaBox: { x: number; y: number; width: number; height: number },
      ) => readonly TypographyBlockInput[];
    }

    const ratioConfigs: Record<AspectRatio, MatrixConfig> = {
      '1:1': {
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        heroBox: { x: 315, y: 220, width: 450, height: 650 }, // Bottom: 870px (80.5% height)
        ctaBox: { x: 420, y: 920, width: 240, height: 50 },
        typoGenerator: (lang, ctaBox) => {
          if (lang === 'en') {
            return [
              {
                role: 'headline',
                text: 'BLEU DE CHANEL',
                box: { x: 200, y: 70, width: 680, height: 50 },
                fontSize: 48,
                textColor: '#D4AF37',
              },
              {
                role: 'subhead',
                text: 'EAU DE PARFUM SPRAY',
                box: { x: 290, y: 130, width: 500, height: 35 },
                fontSize: 30, // 48 / 30 = 1.60x (golden ratio)
                textColor: '#FFFFFF',
              },
              {
                role: 'price',
                text: '$195.00',
                box: { x: 420, y: 175, width: 240, height: 30 },
                fontSize: 24,
                textColor: '#FFFFFF',
              },
              {
                role: 'cta',
                text: 'DISCOVER NOW',
                box: ctaBox,
                fontSize: 16,
                textColor: '#FFFFFF',
              },
            ];
          }
          if (lang === 'km') {
            return [
              {
                role: 'headline',
                text: 'ទឹកអប់ប្រណិតប៉ារីស',
                box: { x: 200, y: 70, width: 680, height: 50 },
                fontSize: 48,
                textColor: '#D4AF37',
              },
              {
                role: 'subhead',
                text: 'ក្លិនក្រអូបពិសេសសម្រាប់រដូវកាល',
                box: { x: 290, y: 130, width: 500, height: 35 },
                fontSize: 30,
                textColor: '#FFFFFF',
              },
              {
                role: 'price',
                text: '$195.00',
                box: { x: 420, y: 175, width: 240, height: 30 },
                fontSize: 24,
                textColor: '#FFFFFF',
              },
              {
                role: 'cta',
                text: 'ទិញឥឡូវនេះ',
                box: ctaBox,
                fontSize: 16,
                textColor: '#FFFFFF',
              },
            ];
          }
          // Bilingual
          return [
            {
              role: 'headline',
              text: 'BLEU DE CHANEL',
              box: { x: 200, y: 70, width: 680, height: 50 },
              fontSize: 48,
              textColor: '#D4AF37',
            },
            {
              role: 'body',
              text: 'ទឹកអប់ប្រណិតប៉ារីស',
              box: { x: 200, y: 130, width: 680, height: 35 },
              fontSize: 52, // 52 / 48 = 1.083x (108% bilingual optical parity)
              textColor: '#FFFFFF',
            },
            {
              role: 'price',
              text: '$195.00',
              box: { x: 420, y: 175, width: 240, height: 30 },
              fontSize: 24,
              textColor: '#FFFFFF',
            },
            {
              role: 'cta',
              text: 'SHOP NOW',
              box: ctaBox,
              fontSize: 16,
              textColor: '#FFFFFF',
            },
          ];
        },
      },
      '4:5': {
        aspectRatio: '4:5',
        width: 1080,
        height: 1350,
        heroBox: { x: 315, y: 320, width: 450, height: 750 }, // Bottom: 1070px (79.3% height)
        ctaBox: { x: 420, y: 1150, width: 240, height: 50 },
        typoGenerator: (lang, ctaBox) => {
          if (lang === 'en') {
            return [
              {
                role: 'headline',
                text: 'BLEU DE CHANEL',
                box: { x: 200, y: 100, width: 680, height: 50 },
                fontSize: 48,
                textColor: '#D4AF37',
              },
              {
                role: 'subhead',
                text: 'EAU DE PARFUM SPRAY',
                box: { x: 290, y: 170, width: 500, height: 35 },
                fontSize: 30,
                textColor: '#FFFFFF',
              },
              {
                role: 'price',
                text: '$195.00',
                box: { x: 420, y: 225, width: 240, height: 30 },
                fontSize: 24,
                textColor: '#FFFFFF',
              },
              {
                role: 'cta',
                text: 'DISCOVER NOW',
                box: ctaBox,
                fontSize: 16,
                textColor: '#FFFFFF',
              },
            ];
          }
          if (lang === 'km') {
            return [
              {
                role: 'headline',
                text: 'ទឹកអប់ប្រណិតប៉ារីស',
                box: { x: 200, y: 100, width: 680, height: 50 },
                fontSize: 48,
                textColor: '#D4AF37',
              },
              {
                role: 'subhead',
                text: 'ក្លិនក្រអូបពិសេសសម្រាប់រដូវកាល',
                box: { x: 290, y: 170, width: 500, height: 35 },
                fontSize: 30,
                textColor: '#FFFFFF',
              },
              {
                role: 'price',
                text: '$195.00',
                box: { x: 420, y: 225, width: 240, height: 30 },
                fontSize: 24,
                textColor: '#FFFFFF',
              },
              {
                role: 'cta',
                text: 'ទិញឥឡូវនេះ',
                box: ctaBox,
                fontSize: 16,
                textColor: '#FFFFFF',
              },
            ];
          }
          return [
            {
              role: 'headline',
              text: 'BLEU DE CHANEL',
              box: { x: 200, y: 100, width: 680, height: 50 },
              fontSize: 48,
              textColor: '#D4AF37',
            },
            {
              role: 'body',
              text: 'ទឹកអប់ប្រណិតប៉ារីស',
              box: { x: 200, y: 170, width: 680, height: 35 },
              fontSize: 52, // 108% ratio
              textColor: '#FFFFFF',
            },
            {
              role: 'price',
              text: '$195.00',
              box: { x: 420, y: 225, width: 240, height: 30 },
              fontSize: 24,
              textColor: '#FFFFFF',
            },
            {
              role: 'cta',
              text: 'SHOP NOW',
              box: ctaBox,
              fontSize: 16,
              textColor: '#FFFFFF',
            },
          ];
        },
      },
      '9:16': {
        aspectRatio: '9:16',
        width: 1080,
        height: 1920,
        heroBox: { x: 300, y: 520, width: 480, height: 980 }, // Bottom: 1500px (78.1% height)
        ctaBox: { x: 400, y: 1650, width: 280, height: 60 },
        typoGenerator: (lang, ctaBox) => {
          if (lang === 'en') {
            return [
              {
                role: 'headline',
                text: 'BLEU DE CHANEL',
                box: { x: 200, y: 160, width: 680, height: 60 },
                fontSize: 52,
                textColor: '#D4AF37',
              },
              {
                role: 'subhead',
                text: 'EAU DE PARFUM SPRAY',
                box: { x: 270, y: 250, width: 540, height: 40 },
                fontSize: 32,
                textColor: '#FFFFFF',
              },
              {
                role: 'price',
                text: '$195.00',
                box: { x: 420, y: 320, width: 240, height: 35 },
                fontSize: 26,
                textColor: '#FFFFFF',
              },
              {
                role: 'cta',
                text: 'DISCOVER NOW',
                box: ctaBox,
                fontSize: 18,
                textColor: '#FFFFFF',
              },
            ];
          }
          if (lang === 'km') {
            return [
              {
                role: 'headline',
                text: 'ទឹកអប់ប្រណិតប៉ារីស',
                box: { x: 200, y: 160, width: 680, height: 60 },
                fontSize: 52,
                textColor: '#D4AF37',
              },
              {
                role: 'subhead',
                text: 'ក្លិនក្រអូបពិសេសសម្រាប់រដូវកាល',
                box: { x: 270, y: 250, width: 540, height: 40 },
                fontSize: 32,
                textColor: '#FFFFFF',
              },
              {
                role: 'price',
                text: '$195.00',
                box: { x: 420, y: 320, width: 240, height: 35 },
                fontSize: 26,
                textColor: '#FFFFFF',
              },
              {
                role: 'cta',
                text: 'ទិញឥឡូវនេះ',
                box: ctaBox,
                fontSize: 18,
                textColor: '#FFFFFF',
              },
            ];
          }
          return [
            {
              role: 'headline',
              text: 'BLEU DE CHANEL',
              box: { x: 200, y: 160, width: 680, height: 60 },
              fontSize: 50,
              textColor: '#D4AF37',
            },
            {
              role: 'body',
              text: 'ទឹកអប់ប្រណិតប៉ារីស',
              box: { x: 200, y: 250, width: 680, height: 40 },
              fontSize: 54, // 108% ratio
              textColor: '#FFFFFF',
            },
            {
              role: 'price',
              text: '$195.00',
              box: { x: 420, y: 320, width: 240, height: 35 },
              fontSize: 26,
              textColor: '#FFFFFF',
            },
            {
              role: 'cta',
              text: 'SHOP NOW',
              box: ctaBox,
              fontSize: 18,
              textColor: '#FFFFFF',
            },
          ];
        },
      },
    };

    const ratios: readonly AspectRatio[] = ['1:1', '4:5', '9:16'];
    const languages: readonly ('en' | 'km' | 'bilingual')[] = ['en', 'km', 'bilingual'];

    for (const ratio of ratios) {
      for (const lang of languages) {
        it(`Golden Matrix [Ratio ${ratio}] [Language ${lang}]: passes Hard Gates cleanly and scores >= 0.80 on Soft Aesthetic Scorer`, async () => {
          const config = ratioConfigs[ratio];
          const assetBuffer = await createTestImageBuffer(config.width, config.height, '#161616');
          const expectedSha256 = createHash('sha256').update(assetBuffer).digest('hex');
          const typoBlocks = config.typoGenerator(lang, config.ctaBox);

          // 1. Evaluate Hard Visual Gates
          const hardGateInput: HardGateEvaluationInput = {
            assetBuffer,
            expectedSha256,
            aspectRatio: config.aspectRatio,
            width: config.width,
            height: config.height,
            heroBoundingBox: config.heroBox,
            ctaBoundingBox: config.ctaBox,
            typographyBlocks: typoBlocks,
          };

          const hardOutcome = await hardGatesEngine.evaluate(hardGateInput);
          expect(hardOutcome.isPassed).toBe(true);
          expect(hardOutcome.failures).toHaveLength(0);

          // 2. Evaluate Soft Aesthetic Scorer
          const aestheticInput: AestheticEvaluationInput = {
            assetBuffer,
            aspectRatio: config.aspectRatio,
            width: config.width,
            height: config.height,
            language: lang,
            heroBoundingBox: config.heroBox,
            typographyBlocks: typoBlocks,
            shadowTokens: {
              blurRadius: 10,
              opacity: 0.25,
            },
            paletteTokens: {
              accentColor: '#D4AF37', // Haussmann Gold
              backgroundTone: '#161616',
            },
          };

          const aestheticOutcome = await aestheticScorer.scoreComposition(aestheticInput);
          expect(aestheticOutcome.overallScore).toBeGreaterThanOrEqual(0.8);
          expect(
            aestheticOutcome.grade === 'EXCELLENT' || aestheticOutcome.grade === 'EXEMPLARY',
          ).toBe(true);
        });
      }
    }
  });

  // ====================================================================
  // SECTION 3: DETERMINISTIC VISUAL VALIDATOR RECONCILIATION
  // ====================================================================
  describe('Section 3: DeterministicVisualValidator Integration', () => {
    it('maps hard gate failures to VisualValidationFindingDraft with BLOCKING severity and status FAILED', async () => {
      const assetBuffer = await createTestImageBuffer(1080, 1080, '#161616');
      const expectedSha256 = createHash('sha256').update(assetBuffer).digest('hex');

      // Subtle crop violation
      const clippedProductBuffer = await createCutoutWithTopOpaquePixels(500, 700);

      const outcome = await deterministicValidator.validateWithHardGates({
        assetBuffer,
        expectedSha256,
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        productAssetBuffer: clippedProductBuffer,
        heroBoundingBox: { x: 290, y: 0, width: 500, height: 700 }, // Alpha clipped at border
      });

      expect(outcome.status).toBe('FAILED');
      expect(outcome.blockingCount).toBeGreaterThanOrEqual(1);
      const finding = outcome.findings.find(
        (f) => f.code === VisualFindingCode.BOUNDING_BOX_OUT_OF_BOUNDS,
      );
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe(VisualValidationSeverity.BLOCKING);
      expect(finding?.metadata?.['hardGateCode']).toBe(HardGateCode.GATE_PRODUCT_ALPHA_CLIPPED);
      expect(finding?.metadata?.['remediationAction']).toBeDefined();
    });

    it('passes cleanly through DeterministicVisualValidator for a compliant baseline poster', async () => {
      const assetBuffer = await createTestImageBuffer(1080, 1080, '#161616');
      const expectedSha256 = createHash('sha256').update(assetBuffer).digest('hex');

      const outcome = await deterministicValidator.validateWithHardGates({
        assetBuffer,
        expectedSha256,
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        heroBoundingBox: { x: 315, y: 220, width: 450, height: 650 },
        ctaBoundingBox: { x: 420, y: 920, width: 240, height: 50 },
        typographyBlocks: [
          {
            role: 'headline',
            text: 'BLEU DE CHANEL',
            box: { x: 200, y: 70, width: 680, height: 50 },
            textColor: '#D4AF37',
          },
          {
            role: 'price',
            text: '$195.00',
            box: { x: 420, y: 175, width: 240, height: 30 },
            textColor: '#FFFFFF',
          },
        ],
      });

      expect(outcome.status).toBe('PASSED');
      expect(outcome.blockingCount).toBe(0);
      expect(outcome.findings).toHaveLength(0);
    });
  });
});
