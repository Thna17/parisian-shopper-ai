import { ProductSourceUnavailableError } from '../domain/product-errors.js';
import {
  type ProductSearchResult,
  type ProductSource,
  type ProductSourceSearchInput,
} from '../application/product-source.port.js';
import { type NormalizedProductEnvelope } from '../domain/product.schema.js';

export class DisabledProductSource implements ProductSource {
  public readonly adapterName = 'disabled';

  public getBySku(_sku: string): Promise<NormalizedProductEnvelope | null> {
    return Promise.reject(new ProductSourceUnavailableError());
  }

  public search(_input: ProductSourceSearchInput): Promise<ProductSearchResult> {
    return Promise.reject(new ProductSourceUnavailableError());
  }
}
