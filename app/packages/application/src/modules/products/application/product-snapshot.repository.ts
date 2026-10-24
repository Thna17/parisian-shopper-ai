import { type NormalizedProductEnvelope } from '../domain/product.schema.js';
import {
  calculateProductDependencyHashes,
  type ProductDependencyHashes,
} from './product-snapshot-hash.js';

export const PRODUCT_SNAPSHOT_REPOSITORY = Symbol('PRODUCT_SNAPSHOT_REPOSITORY');
export const PRODUCT_NORMALIZER_VERSION = 'phase-1b-v1';

export interface ProductSnapshot {
  id: string;
  product: NormalizedProductEnvelope;
  snapshotHash: string;
  dependencyHashes?: ProductDependencyHashes | undefined;
  normalizerVersion: string;
  createdAt: Date;
}

export function resolveSnapshotDependencyHashes(
  snapshot: ProductSnapshot,
): ProductDependencyHashes {
  return snapshot.dependencyHashes ?? calculateProductDependencyHashes(snapshot.product);
}

export interface CreateProductSnapshotRecord {
  product: NormalizedProductEnvelope;
  snapshotHash: string;
  dependencyHashes?: ProductDependencyHashes | undefined;
  normalizerVersion: string;
}

export interface ProductSnapshotRepository {
  create(input: CreateProductSnapshotRecord): Promise<ProductSnapshot>;
  findById(id: string): Promise<ProductSnapshot | null>;
  findLatestBySku?(sku: string): Promise<ProductSnapshot | null>;
}
