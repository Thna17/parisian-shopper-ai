import { z } from 'zod';

const DECIMAL_PATTERN = /^(0|[1-9]\d*)(\.\d{1,4})?$/;
const HTTPS_PROTOCOL = 'https:';

export const decimalStringSchema = z
  .string()
  .regex(DECIMAL_PATTERN, 'Expected a non-negative decimal string with up to four decimals')
  .transform(toCanonicalDecimal);

export const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'Expected an ISO 4217 currency code');

export const skuValueSchema = z
  .string()
  .trim()
  .min(1, 'SKU is required')
  .max(64, 'SKU must not exceed 64 characters')
  .refine(isSafeSku, 'SKU cannot contain whitespace or control characters');

export const stockStatusSchema = z.enum([
  'in_stock',
  'low_stock',
  'out_of_stock',
  'preorder',
  'discontinued',
  'unknown',
]);

export const lifecycleStatusSchema = z.enum(['active', 'discontinued', 'deleted']);

export const imageSchema = z
  .object({
    url: z
      .url()
      .refine((value) => new URL(value).protocol === HTTPS_PROTOCOL, 'Image URL must use HTTPS'),
    role: z.enum(['primary', 'gallery', 'packaging', 'swatch']),
    position: z.number().int().min(1),
    alt_text: z.string().trim().min(1).max(500).optional(),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

export const discountSchema = z
  .object({
    type: z.enum(['percentage', 'fixed_amount', 'none']),
    value: decimalStringSchema,
    label: z.string().trim().min(1).max(120).optional(),
    calculation_method: z.string().trim().min(1).max(100),
    starts_at: z.iso.datetime({ offset: true }).transform(toCanonicalTimestamp).optional(),
    ends_at: z.iso.datetime({ offset: true }).transform(toCanonicalTimestamp).optional(),
  })
  .strict()
  .superRefine((discount, context) => {
    if (
      discount.starts_at !== undefined &&
      discount.ends_at !== undefined &&
      discount.starts_at > discount.ends_at
    ) {
      context.addIssue({
        code: 'custom',
        path: ['ends_at'],
        message: 'Promotion end must not precede promotion start',
      });
    }
  });

export const fragranceNotesSchema = z
  .object({
    top: z.array(z.string().trim().min(1).max(100)).max(50),
    heart: z.array(z.string().trim().min(1).max(100)).max(50),
    base: z.array(z.string().trim().min(1).max(100)).max(50),
  })
  .strict();

export const concentrationSchema = z
  .object({
    code: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(100),
  })
  .strict();

export const productSizeSchema = z
  .object({
    value: decimalStringSchema,
    unit: z.string().trim().min(1).max(30),
    display: z.string().trim().min(1).max(100),
  })
  .strict();

export const countryOfOriginSchema = z
  .object({
    code: z.string().regex(/^[A-Z]{2}$/, 'Expected an ISO 3166-1 alpha-2 code'),
    name: z.string().trim().min(1).max(120),
  })
  .strict();

export const similarityClaimSchema = z
  .object({
    claim_id: z.string().trim().min(1).max(100),
    text: z.string().trim().min(1).max(500),
    status: z.literal('approved'),
    approved_by: z.string().trim().min(1).max(160),
    approved_at: z.iso.datetime({ offset: true }).transform(toCanonicalTimestamp),
    expires_at: z.iso.datetime({ offset: true }).transform(toCanonicalTimestamp).optional(),
  })
  .strict();

export const normalizedProductSchema = z
  .object({
    sku: skuValueSchema,
    product_name: z.string().trim().min(1).max(300),
    brand: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(100),
    price: decimalStringSchema,
    currency: currencySchema,
    promo_price: decimalStringSchema.optional(),
    discount: discountSchema.optional(),
    description: z.string().trim().min(1).max(10_000).optional(),
    images: z.array(imageSchema).max(50).optional(),
    stock_status: stockStatusSchema,
    product_url: z
      .url()
      .refine((value) => new URL(value).protocol === HTTPS_PROTOCOL, 'Product URL must use HTTPS')
      .optional(),
    fragrance_notes: fragranceNotesSchema.optional(),
    concentration: concentrationSchema.optional(),
    size: productSizeSchema.optional(),
    country_of_origin: countryOfOriginSchema.optional(),
    similarity_claims: z.array(similarityClaimSchema).max(20).optional(),
  })
  .strict()
  .superRefine((product, context) => {
    if (
      product.promo_price !== undefined &&
      compareDecimalStrings(product.promo_price, product.price) > 0
    ) {
      context.addIssue({
        code: 'custom',
        path: ['promo_price'],
        message: 'Promotional price must not exceed regular price',
      });
    }
  });

export const normalizedProductEnvelopeSchema = z
  .object({
    schema_version: z.literal('1.0'),
    source_system: z.string().trim().min(1).max(100),
    source_record_id: z.string().trim().min(1).max(200).optional(),
    source_version: z.string().trim().min(1).max(200).optional(),
    retrieved_at: z.iso.datetime({ offset: true }).transform(toCanonicalTimestamp),
    source_updated_at: z.iso.datetime({ offset: true }).transform(toCanonicalTimestamp),
    etag: z.string().trim().min(1).max(500).optional(),
    lifecycle_status: lifecycleStatusSchema,
    product: normalizedProductSchema,
  })
  .strict();

export type NormalizedProduct = Readonly<z.infer<typeof normalizedProductSchema>>;
export type NormalizedProductEnvelope = Readonly<z.infer<typeof normalizedProductEnvelopeSchema>>;
export type StockStatus = z.infer<typeof stockStatusSchema>;

export const PRODUCT_FIELD_CLASSIFICATION = Object.freeze({
  REQUIRED: ['sku', 'product_name', 'brand', 'category', 'price', 'currency', 'stock_status'],
  RECOMMENDED: ['description', 'images', 'product_url', 'country_of_origin'],
  CONDITIONAL: [
    'promo_price',
    'discount',
    'fragrance_notes',
    'concentration',
    'size',
    'similarity_claims',
  ],
  CONTROLLED: [
    'sku',
    'product_name',
    'brand',
    'category',
    'price',
    'currency',
    'promo_price',
    'discount',
    'description',
    'images',
    'stock_status',
    'product_url',
    'fragrance_notes',
    'concentration',
    'size',
    'country_of_origin',
    'similarity_claims',
  ],
} as const);

function toCanonicalTimestamp(value: string): string {
  return new Date(value).toISOString();
}

function toCanonicalDecimal(value: string): string {
  const [integer = '0', fraction] = value.split('.');
  const trimmedFraction = fraction?.replace(/0+$/, '');
  return trimmedFraction === undefined || trimmedFraction.length === 0
    ? integer
    : `${integer}.${trimmedFraction}`;
}

function compareDecimalStrings(left: string, right: string): number {
  const leftParts = left.split('.');
  const rightParts = right.split('.');
  const scale = Math.max(leftParts[1]?.length ?? 0, rightParts[1]?.length ?? 0);
  const leftValue = toScaledInteger(leftParts[0] ?? '0', leftParts[1] ?? '', scale);
  const rightValue = toScaledInteger(rightParts[0] ?? '0', rightParts[1] ?? '', scale);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function toScaledInteger(integer: string, fraction: string, scale: number): bigint {
  return BigInt(`${integer}${fraction.padEnd(scale, '0')}`);
}

function isSafeSku(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (/\s/u.test(character) || codePoint === undefined || codePoint <= 31 || codePoint === 127) {
      return false;
    }
  }
  return true;
}
