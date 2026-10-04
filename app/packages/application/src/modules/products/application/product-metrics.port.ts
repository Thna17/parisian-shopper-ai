export const PRODUCT_METRICS = Symbol('PRODUCT_METRICS');

export type ProductMetricOperation = 'getBySku' | 'search' | 'createSnapshot';

export interface ProductMetricEvent {
  operation: ProductMetricOperation;
  outcome: 'success' | 'not_found' | 'invalid_response' | 'failure';
  durationMs: number;
  sourceAdapter?: string;
  resultCount?: number;
}

export interface ProductMetrics {
  record(event: ProductMetricEvent): void;
}

export class NoopProductMetrics implements ProductMetrics {
  public record(_event: ProductMetricEvent): void {}
}
