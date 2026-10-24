import { createHash } from 'node:crypto';

import {
  normalizedProductEnvelopeSchema,
  type NormalizedProductEnvelope,
} from '../domain/product.schema.js';

export const ProductDependencyScope = {
  CATALOG_PRICE: 'catalogPrice',
  CAMPAIGN_PRICE: 'campaignPrice',
  STOCK: 'stock',
  PROMOTION: 'promotion',
  PERMANENT_FACTS: 'permanentFacts',
  VISUAL_ASSETS: 'visualAssets',
} as const;

export type ProductDependencyScope =
  (typeof ProductDependencyScope)[keyof typeof ProductDependencyScope];

export const ALL_PRODUCT_DEPENDENCY_SCOPES: readonly ProductDependencyScope[] = Object.freeze([
  ProductDependencyScope.CATALOG_PRICE,
  ProductDependencyScope.CAMPAIGN_PRICE,
  ProductDependencyScope.STOCK,
  ProductDependencyScope.PROMOTION,
  ProductDependencyScope.PERMANENT_FACTS,
  ProductDependencyScope.VISUAL_ASSETS,
]);

export interface ProductDependencyHashes {
  readonly full: string;
  readonly catalogPrice: string;
  readonly campaignPrice: string;
  readonly stock: string;
  readonly promotion: string;
  readonly permanentFacts: string;
  readonly visualAssets: string;
}

export function calculateProductDependencyHashes(
  input: NormalizedProductEnvelope,
): ProductDependencyHashes {
  const envelope = normalizedProductEnvelopeSchema.parse(input);
  const { product, lifecycle_status } = envelope;

  const catalogPricePayload = {
    currency: product.currency,
    price: product.price,
  };

  const campaignPricePayload = {
    currency: product.currency,
    promo_price: product.promo_price ?? null,
  };

  const stockPayload = {
    stock_status: product.stock_status,
  };

  const promotionPayload = {
    discount: product.discount
      ? {
          calculation_method: product.discount.calculation_method,
          ends_at: product.discount.ends_at ?? null,
          label: product.discount.label ?? null,
          starts_at: product.discount.starts_at ?? null,
          type: product.discount.type,
          value: product.discount.value,
        }
      : null,
  };

  const permanentFactsPayload = {
    brand: product.brand,
    category: product.category,
    concentration: product.concentration
      ? {
          code: product.concentration.code,
          label: product.concentration.label,
        }
      : null,
    country_of_origin: product.country_of_origin
      ? {
          code: product.country_of_origin.code,
          name: product.country_of_origin.name,
        }
      : null,
    description: product.description ?? null,
    fragrance_notes: product.fragrance_notes
      ? {
          base: [...product.fragrance_notes.base].sort(),
          heart: [...product.fragrance_notes.heart].sort(),
          top: [...product.fragrance_notes.top].sort(),
        }
      : null,
    lifecycle_status,
    product_name: product.product_name,
    product_url: product.product_url ?? null,
    similarity_claims: product.similarity_claims
      ? [...product.similarity_claims]
          .sort((a, b) => a.claim_id.localeCompare(b.claim_id))
          .map((claim) => ({
            approved_at: claim.approved_at,
            approved_by: claim.approved_by,
            claim_id: claim.claim_id,
            expires_at: claim.expires_at ?? null,
            status: claim.status,
            text: claim.text,
          }))
      : null,
    size: product.size
      ? {
          display: product.size.display,
          unit: product.size.unit,
          value: product.size.value,
        }
      : null,
    sku: product.sku,
  };

  const visualAssetsPayload = {
    images: product.images
      ? [...product.images]
          .sort((a, b) =>
            a.position === b.position ? a.url.localeCompare(b.url) : a.position - b.position,
          )
          .map((image) => ({
            alt_text: image.alt_text ?? null,
            position: image.position,
            role: image.role,
            sha256: image.sha256 ?? null,
            url: image.url,
          }))
      : null,
  };

  const fullPayload = {
    campaign_price: campaignPricePayload,
    catalog_price: catalogPricePayload,
    permanent_facts: permanentFactsPayload,
    promotion: promotionPayload,
    stock: stockPayload,
    visual_assets: visualAssetsPayload,
  };

  return {
    full: hashPayload(fullPayload),
    catalogPrice: hashPayload(catalogPricePayload),
    campaignPrice: hashPayload(campaignPricePayload),
    stock: hashPayload(stockPayload),
    promotion: hashPayload(promotionPayload),
    permanentFacts: hashPayload(permanentFactsPayload),
    visualAssets: hashPayload(visualAssetsPayload),
  };
}

export function calculateProductSnapshotHash(input: NormalizedProductEnvelope): string {
  return calculateProductDependencyHashes(input).full;
}

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex');
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}
