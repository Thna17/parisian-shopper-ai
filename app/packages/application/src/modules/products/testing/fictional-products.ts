import {
  normalizedProductEnvelopeSchema,
  type NormalizedProductEnvelope,
} from '../domain/product.schema.js';

const SOURCE = 'fictional-local-catalog';
const RETRIEVED_AT = '2026-10-04T02:30:00.000Z';
const UPDATED_AT = '2026-10-03T09:45:00.000Z';

function envelope(
  recordId: string,
  product: NormalizedProductEnvelope['product'],
  sourceVersion = 'fixture-v1',
): NormalizedProductEnvelope {
  return normalizedProductEnvelopeSchema.parse({
    schema_version: '1.0',
    source_system: SOURCE,
    source_record_id: recordId,
    source_version: sourceVersion,
    retrieved_at: RETRIEVED_AT,
    source_updated_at: UPDATED_AT,
    lifecycle_status: 'active',
    product,
  });
}

export const FICTIONAL_PRODUCTS: readonly NormalizedProductEnvelope[] = deepFreeze([
  envelope('fixture-product-001', {
    sku: 'FIC-PERF-001',
    product_name: 'Moonlit River Eau de Parfum',
    brand: 'Maison Imaginaire',
    category: 'fragrance',
    price: '38.00',
    currency: 'USD',
    description: 'A fictional floral fragrance used only for local testing.',
    images: [
      {
        url: 'https://assets.example.invalid/products/FIC-PERF-001/front.jpg',
        role: 'primary',
        position: 1,
        alt_text: 'Fictional Moonlit River bottle',
      },
    ],
    stock_status: 'in_stock',
    product_url: 'https://shop.example.invalid/products/FIC-PERF-001',
    fragrance_notes: {
      top: ['Fictional bergamot', 'Fictional pear'],
      heart: ['Fictional jasmine'],
      base: ['Fictional cedar', 'Fictional musk'],
    },
    concentration: { code: 'EDP', label: 'Eau de Parfum' },
    size: { value: '75', unit: 'ml', display: '75 ml' },
    country_of_origin: { code: 'FR', name: 'France' },
    similarity_claims: [
      {
        claim_id: 'fictional-claim-001',
        text: 'Shares a fictional airy floral style with Example Scent',
        status: 'approved',
        approved_by: 'fictional-merchandising-review',
        approved_at: '2026-09-15T03:00:00.000Z',
      },
    ],
  }),
  envelope('fixture-product-002', {
    sku: 'FIC-PERF-002',
    product_name: 'Amber Orchard Parfum',
    brand: 'Atelier Placeholder',
    category: 'fragrance',
    price: '64.00',
    currency: 'USD',
    promo_price: '51.20',
    discount: {
      type: 'percentage',
      value: '20',
      label: '20% off',
      calculation_method: 'upstream',
      starts_at: '2026-10-01T00:00:00+07:00',
      ends_at: '2026-10-31T23:59:59+07:00',
    },
    description: 'A fictional amber fragrance with an upstream-declared promotion.',
    images: [
      {
        url: 'https://assets.example.invalid/products/FIC-PERF-002/front.jpg',
        role: 'primary',
        position: 1,
      },
    ],
    stock_status: 'in_stock',
    fragrance_notes: {
      top: ['Fictional mandarin'],
      heart: ['Fictional amber flower'],
      base: ['Fictional vanilla wood'],
    },
    concentration: { code: 'PARFUM', label: 'Parfum' },
    size: { value: '50', unit: 'ml', display: '50 ml' },
  }),
  envelope('fixture-product-003', {
    sku: 'FIC-PERF-003',
    product_name: 'Quiet Garden Eau de Toilette',
    brand: 'Maison Imaginaire',
    category: 'fragrance',
    price: '29.50',
    currency: 'USD',
    description: 'A fictional fragrance intentionally lacking curated note data.',
    images: [],
    stock_status: 'in_stock',
    concentration: { code: 'EDT', label: 'Eau de Toilette' },
    size: { value: '100', unit: 'ml', display: '100 ml' },
  }),
  envelope('fixture-product-004', {
    sku: 'FIC-PERF-004',
    product_name: 'Silver Dawn Mist',
    brand: 'Studio Fiction',
    category: 'fragrance',
    price: '42.00',
    currency: 'USD',
    stock_status: 'out_of_stock',
    fragrance_notes: {
      top: ['Fictional citrus leaf'],
      heart: ['Fictional iris'],
      base: ['Fictional pale wood'],
    },
  }),
  envelope('fixture-product-005', {
    sku: 'FIC-PERF-005',
    product_name: 'Velvet Horizon Eau de Parfum',
    brand: 'Atelier Placeholder',
    category: 'fragrance',
    price: '47.00',
    currency: 'USD',
    stock_status: 'low_stock',
    fragrance_notes: {
      top: ['Fictional plum'],
      heart: ['Fictional rose'],
      base: ['Fictional velvet woods'],
    },
    concentration: { code: 'EDP', label: 'Eau de Parfum' },
  }),
  envelope('fixture-product-006', {
    sku: 'FIC-WATCH-001',
    product_name: 'North Clock Automatic Watch',
    brand: 'Chronos Example',
    category: 'watch',
    price: '185.00',
    currency: 'USD',
    description: 'A fictional stainless-steel automatic watch.',
    images: [
      {
        url: 'https://assets.example.invalid/products/FIC-WATCH-001/front.jpg',
        role: 'primary',
        position: 1,
      },
      {
        url: 'https://assets.example.invalid/products/FIC-WATCH-001/detail.jpg',
        role: 'gallery',
        position: 2,
      },
    ],
    stock_status: 'in_stock',
    product_url: 'https://shop.example.invalid/products/FIC-WATCH-001',
  }),
  envelope('fixture-product-007', {
    sku: 'FIC-COS-001',
    product_name: 'Cloud Petal Lip Tint',
    brand: 'Palette Fiction',
    category: 'cosmetic',
    price: '12.75',
    currency: 'USD',
    promo_price: '9.50',
    discount: {
      type: 'percentage',
      value: '25',
      label: '25% off',
      calculation_method: 'upstream',
      starts_at: '2026-10-01T00:00:00+07:00',
      ends_at: '2026-10-31T23:59:59+07:00',
    },
    description: 'A fictional rose-toned cosmetic test product.',
    images: [
      {
        url: 'https://assets.example.invalid/products/FIC-COS-001/swatch.jpg',
        role: 'swatch',
        position: 1,
        alt_text: 'Fictional rose lip tint swatch',
      },
    ],
    stock_status: 'in_stock',
    size: { value: '4.5', unit: 'ml', display: '4.5 ml' },
  }),
  envelope('fixture-product-008', {
    sku: 'FIC-MIN-001',
    product_name: 'Essential Carry Pouch',
    brand: 'Label Example',
    category: 'accessory',
    price: '8.00',
    currency: 'USD',
    stock_status: 'unknown',
  }),
]);

export { GEPARLYS_PRODUCTS } from './geparlys-products.js';

import { GEPARLYS_PRODUCTS } from './geparlys-products.js';

export const ALL_PRODUCTS: readonly NormalizedProductEnvelope[] = deepFreeze([
  ...FICTIONAL_PRODUCTS,
  ...GEPARLYS_PRODUCTS,
]);

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
  }
  return value;
}
