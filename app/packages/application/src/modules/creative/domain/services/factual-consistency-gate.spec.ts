import { describe, expect, it } from '@jest/globals';
import { type ProductSnapshot } from '../../../products/application/product-snapshot.repository.js';
import { HardGateCode } from './hard-visual-gates.port.js';
import { HardVisualGatesEngine } from './hard-visual-gates.engine.js';
import {
  FACTUAL_CONSISTENCY_GATE_VERSION,
  type FactualGateInput,
} from './factual-consistency-gate.port.js';
import {
  FactualConsistencyGate,
  canonicalizePrice,
  detectCurrency,
  extractDiscountPercentage,
  normalizeCurrency,
} from './factual-consistency-gate.engine.js';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

describe('FactualConsistencyGate', () => {
  const gate = new FactualConsistencyGate();

  function createMockSnapshot(overrides?: {
    sku?: string;
    price?: string;
    currency?: string;
    promo_price?: string;
    discount?: {
      type: 'percentage' | 'fixed_amount' | 'none';
      value: string;
      calculation_method: string;
    };
    snapshotHash?: string;
    id?: string;
  }): ProductSnapshot {
    const product = {
      sku: overrides?.sku ?? 'GEP-KING-100',
      product_name: 'Grand Epice Paris Eau de Parfum',
      brand: 'Grand Epice Paris',
      category: 'Fragrance',
      price: overrides?.price ?? '195.00',
      currency: overrides?.currency ?? 'USD',
      stock_status: 'in_stock' as const,
      ...(overrides?.promo_price !== undefined ? { promo_price: overrides.promo_price } : {}),
      ...(overrides?.discount !== undefined ? { discount: overrides.discount } : {}),
    };

    return {
      id: overrides?.id ?? 'snapshot-uuid-1',
      product: {
        schema_version: '1.0' as const,
        source_system: 'test',
        retrieved_at: '2026-10-27T00:00:00Z',
        source_updated_at: '2026-10-27T00:00:00Z',
        lifecycle_status: 'active' as const,
        product,
      },
      snapshotHash: overrides?.snapshotHash ?? 'hash-snapshot-v1-abcdef1234567890',
      normalizerVersion: 'phase-1b-v1',
      createdAt: new Date('2026-10-27T00:00:00Z'),
    };
  }

  it('1. Exact Price Agreement: Governed snapshot ($195) and rendered price ($195.00) passes cleanly', () => {
    const snapshot = createMockSnapshot({ price: '195.00', currency: 'USD' });

    const input: FactualGateInput = {
      productSnapshot: snapshot,
      priceBadge: {
        regularPrice: '$195.00',
        currency: '$',
      },
      typographyBlocks: [
        {
          role: 'headline',
          text: 'BLEU DE CHANEL',
          box: { x: 100, y: 100, width: 800, height: 60 },
        },
        {
          role: 'price',
          text: '$195.00',
          box: { x: 440, y: 180, width: 200, height: 40 },
        },
      ],
      sceneSku: 'GEP-KING-100',
      renderedSnapshotHash: snapshot.snapshotHash,
    };

    const outcome = gate.evaluate(input);

    expect(outcome.isPassed).toBe(true);
    expect(outcome.validatorVersion).toBe(FACTUAL_CONSISTENCY_GATE_VERSION);
    expect(outcome.failures).toHaveLength(0);
    expect(outcome.discrepancies).toHaveLength(0);
  });

  it('2. Price Drift (ADV-03): Snapshot ($195), rendered poster text ($99) triggers GATE_FACTUAL_PRICE_MISMATCH', () => {
    const snapshot = createMockSnapshot({ price: '195.00' });

    const input: FactualGateInput = {
      productSnapshot: snapshot,
      typographyBlocks: [
        {
          role: 'price',
          text: '$99.00',
          box: { x: 440, y: 180, width: 200, height: 40 },
        },
      ],
    };

    const outcome = gate.evaluate(input);

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_FACTUAL_PRICE_MISMATCH)).toBe(
      true,
    );
    const failure = outcome.failures.find(
      (f) => f.code === HardGateCode.GATE_FACTUAL_PRICE_MISMATCH,
    );
    expect(failure?.field).toBe('price');
    expect(failure?.message).toContain('99.00');
    expect(failure?.message).toContain('195.00');
  });

  it('3. Currency Mismatch: Snapshot (USD / $), rendered poster (€) triggers GATE_FACTUAL_PRICE_MISMATCH', () => {
    const snapshot = createMockSnapshot({ price: '195.00', currency: 'USD' });

    const input: FactualGateInput = {
      productSnapshot: snapshot,
      priceBadge: {
        regularPrice: '195.00 €',
        currency: 'EUR',
      },
    };

    const outcome = gate.evaluate(input);

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_FACTUAL_PRICE_MISMATCH)).toBe(
      true,
    );
    const failure = outcome.failures.find((f) => f.field === 'currency');
    expect(failure?.message).toContain('EUR');
    expect(failure?.message).toContain('USD');
  });

  it('4. Unauthorized Sale (ADV-04): Poster renders promo price or discount badge, but snapshot has no sale triggers GATE_FACTUAL_PROMO_MISMATCH', () => {
    // Snapshot with NO active promo price or discount
    const snapshot = createMockSnapshot({ price: '195.00' });

    const input: FactualGateInput = {
      productSnapshot: snapshot,
      priceBadge: {
        regularPrice: '$195.00',
        promoPrice: '$135.00',
        discountText: '-30% OFF',
        currency: '$',
      },
    };

    const outcome = gate.evaluate(input);

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_FACTUAL_PROMO_MISMATCH)).toBe(
      true,
    );
    const failure = outcome.failures.find(
      (f) => f.code === HardGateCode.GATE_FACTUAL_PROMO_MISMATCH,
    );
    expect(failure?.field).toBe('promotionalPrice');
    expect(failure?.message).toContain('Unauthorized promotional discount');
  });

  it('5. Authorized Promo Match: Snapshot has valid promo_price ($150), rendered promo price ($150) passes cleanly', () => {
    const snapshot = createMockSnapshot({
      price: '200.00',
      promo_price: '150.00',
      discount: {
        type: 'percentage',
        value: '25',
        calculation_method: 'retail_discount',
      },
    });

    const input: FactualGateInput = {
      productSnapshot: snapshot,
      priceBadge: {
        regularPrice: '$200.00',
        promoPrice: '$150.00',
        discountText: 'SAVE 25%',
        currency: '$',
      },
    };

    const outcome = gate.evaluate(input);

    expect(outcome.isPassed).toBe(true);
    expect(outcome.failures).toHaveLength(0);
  });

  it('6. Promo Discount % Mismatch: Snapshot specifies 20% off, rendered text states "-50% OFF" triggers GATE_FACTUAL_PROMO_MISMATCH', () => {
    const snapshot = createMockSnapshot({
      price: '100.00',
      promo_price: '80.00',
      discount: {
        type: 'percentage',
        value: '20',
        calculation_method: 'retail_discount',
      },
    });

    const input: FactualGateInput = {
      productSnapshot: snapshot,
      priceBadge: {
        regularPrice: '$100.00',
        promoPrice: '$80.00',
        discountText: '-50% OFF',
        currency: '$',
      },
    };

    const outcome = gate.evaluate(input);

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_FACTUAL_PROMO_MISMATCH)).toBe(
      true,
    );
    const failure = outcome.failures.find((f) => f.field === 'discountPercentage');
    expect(failure?.message).toContain('50%');
    expect(failure?.message).toContain('20%');
  });

  it('7. SKU Mismatch: Scene references "GEP-KING-100", snapshot is "GEP-QUEEN-100" triggers GATE_FACTUAL_SKU_MISMATCH', () => {
    const snapshot = createMockSnapshot({ sku: 'GEP-QUEEN-100' });

    const input: FactualGateInput = {
      productSnapshot: snapshot,
      sceneSku: 'GEP-KING-100',
    };

    const outcome = gate.evaluate(input);

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_FACTUAL_SKU_MISMATCH)).toBe(
      true,
    );
    const failure = outcome.failures.find((f) => f.code === HardGateCode.GATE_FACTUAL_SKU_MISMATCH);
    expect(failure?.field).toBe('sku');
    expect(failure?.message).toContain('GEP-KING-100');
    expect(failure?.message).toContain('GEP-QUEEN-100');
  });

  it('8. Stale Snapshot Hash (ADV-10): Rendered with snapshot hash v1, current snapshot is v2 triggers GATE_SNAPSHOT_STALE', () => {
    const snapshot = createMockSnapshot({
      snapshotHash: 'hash-v2-revalidated-price-drift',
    });

    const input: FactualGateInput = {
      productSnapshot: snapshot,
      renderedSnapshotHash: 'hash-v1-initial-rendering',
    };

    const outcome = gate.evaluate(input);

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_SNAPSHOT_STALE)).toBe(true);
    const failure = outcome.failures.find((f) => f.code === HardGateCode.GATE_SNAPSHOT_STALE);
    expect(failure?.field).toBe('snapshotHash');
    expect(failure?.message).toContain('stale');
  });

  it('9. Helper functions: canonicalizePrice, normalizeCurrency, extractDiscountPercentage', () => {
    expect(canonicalizePrice('$195')).toBe('195.00');
    expect(canonicalizePrice('195,50 €')).toBe('195.50');
    expect(canonicalizePrice('invalid')).toBe(null);
    expect(canonicalizePrice(null)).toBe(null);

    expect(normalizeCurrency('$')).toBe('USD');
    expect(normalizeCurrency('€')).toBe('EUR');
    expect(normalizeCurrency('£')).toBe('GBP');
    expect(normalizeCurrency('៛')).toBe('KHR');
    expect(normalizeCurrency('USD')).toBe('USD');

    expect(detectCurrency('$195.00')).toBe('USD');
    expect(detectCurrency('195.00 €')).toBe('EUR');

    expect(extractDiscountPercentage('-30% OFF')).toBe(30);
    expect(extractDiscountPercentage('SAVE 25%')).toBe(25);
    expect(extractDiscountPercentage('50% discount')).toBe(50);
    expect(extractDiscountPercentage('NO DISCOUNT')).toBe(null);
  });

  it('10. End-to-end integration: HardVisualGatesEngine with productSnapshot evaluates factual consistency', async () => {
    const engine = new HardVisualGatesEngine();

    const assetBuffer = await sharp({
      create: {
        width: 1080,
        height: 1080,
        channels: 4,
        background: '#121212',
      },
    })
      .png()
      .toBuffer();
    const sha = createHash('sha256').update(assetBuffer).digest('hex');

    const snapshot = createMockSnapshot({ price: '195.00' });

    // Drifted price $99 on poster
    const outcome = await engine.evaluate({
      assetBuffer,
      expectedSha256: sha,
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      productSnapshot: snapshot,
      typographyBlocks: [
        {
          role: 'headline',
          text: 'BLEU DE CHANEL',
          box: { x: 100, y: 100, width: 880, height: 60 },
          textColor: '#FFFFFF',
        },
        {
          role: 'price',
          text: '$99.00', // Mismatch with snapshot ($195.00)
          box: { x: 440, y: 180, width: 200, height: 40 },
          textColor: '#FFFFFF',
        },
      ],
    });

    expect(outcome.isPassed).toBe(false);
    expect(outcome.failures.some((f) => f.code === HardGateCode.GATE_FACTUAL_PRICE_MISMATCH)).toBe(
      true,
    );
  });
});
