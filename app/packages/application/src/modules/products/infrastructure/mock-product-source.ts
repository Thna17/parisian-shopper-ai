import { Injectable } from '@nestjs/common';

import { parseSearchInput, parseSku } from '../domain/product-input.js';
import {
  normalizedProductEnvelopeSchema,
  type NormalizedProductEnvelope,
} from '../domain/product.schema.js';
import {
  type ProductSearchResult,
  type ProductSource,
  type ProductSourceSearchInput,
} from '../application/product-source.port.js';
import { ALL_PRODUCTS } from '../testing/fictional-products.js';

@Injectable()
export class MockProductSource implements ProductSource {
  public readonly adapterName = 'mock-fixture';
  private readonly products: readonly NormalizedProductEnvelope[];

  public constructor(products: readonly NormalizedProductEnvelope[] = ALL_PRODUCTS) {
    this.products = products.map((product) => normalizedProductEnvelopeSchema.parse(product));
  }

  public getBySku(input: string): Promise<NormalizedProductEnvelope | null> {
    const sku = parseSku(input);
    const found = this.products.find((item) => item.product.sku === sku);
    return Promise.resolve(found === undefined ? null : copy(found));
  }

  public search(input: ProductSourceSearchInput): Promise<ProductSearchResult> {
    const validated = parseSearchInput(input);
    const query = validated.query.toLocaleLowerCase('und');
    const items = this.products
      .filter((item) =>
        [item.product.sku, item.product.product_name, item.product.brand].some((candidate) =>
          candidate.toLocaleLowerCase('und').includes(query),
        ),
      )
      .sort((left, right) => left.product.sku.localeCompare(right.product.sku))
      .slice(0, validated.limit)
      .map(copy);
    return Promise.resolve({ items });
  }
}

function copy(product: NormalizedProductEnvelope): NormalizedProductEnvelope {
  return structuredClone(product);
}
