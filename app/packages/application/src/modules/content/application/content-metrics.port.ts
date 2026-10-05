export const CONTENT_METRICS = Symbol('CONTENT_METRICS');

export interface ContentMetrics {
  record(
    name:
      | 'generation_requested'
      | 'generation_succeeded'
      | 'generation_failed'
      | 'generation_latency_ms'
      | 'provider_error'
      | 'provider_timeout'
      | 'invalid_output'
      | 'token_usage',
    value?: number,
    labels?: Readonly<Record<string, string>>,
  ): void;
}

export class NoopContentMetrics implements ContentMetrics {
  public record(): void {}
}
