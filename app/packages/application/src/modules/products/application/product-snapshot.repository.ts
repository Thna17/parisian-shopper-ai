import { type NormalizedProductEnvelope } from '../domain/product.schema.js';

export const PRODUCT_SNAPSHOT_REPOSITORY = Symbol('PRODUCT_SNAPSHOT_REPOSITORY');
export const PRODUCT_NORMALIZER_VERSION = 'phase-1b-v1';

export interface ProductSnapshot {
  id: string;
  product: NormalizedProductEnvelope;
  snapshotHash: string;
  normalizerVersion: string;
  createdAt: Date;
}

export interface CreateProductSnapshotRecord {
  product: NormalizedProductEnvelope;
  snapshotHash: string;
  normalizerVersion: string;
}

export interface ProductSnapshotRepository {
  create(input: CreateProductSnapshotRecord): Promise<ProductSnapshot>;
  findById(id: string): Promise<ProductSnapshot | null>;
}
