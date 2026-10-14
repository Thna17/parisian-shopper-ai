import { Injectable } from '@nestjs/common';

export interface RecordAiUsageInput {
  readonly provider: string;
  readonly model: string;
  readonly latencyMs: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly status?: 'success' | 'failure';
}

export interface AiUsageSummary {
  readonly provider: string;
  readonly model: string;
  readonly status: 'success' | 'failure';
  readonly requestCount: number;
  readonly totalLatencySeconds: number;
  readonly latestLatencySeconds: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

@Injectable()
export class AIMetricsTracker {
  private readonly metrics = new Map<
    string,
    {
      provider: string;
      model: string;
      status: 'success' | 'failure';
      requestCount: number;
      totalLatencySeconds: number;
      latestLatencySeconds: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }
  >();

  public record(input: RecordAiUsageInput): void {
    const status = input.status ?? 'success';
    const key = `${input.provider}:${input.model}:${status}`;
    const latencySec = Math.max(0, input.latencyMs / 1000);
    const existing = this.metrics.get(key) ?? {
      provider: input.provider,
      model: input.model,
      status,
      requestCount: 0,
      totalLatencySeconds: 0,
      latestLatencySeconds: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };

    if (input.latencyMs > 0 || input.inputTokens || input.outputTokens || input.totalTokens) {
      existing.requestCount += 1;
    } else if (existing.requestCount === 0) {
      existing.requestCount = 1;
    }

    if (input.latencyMs > 0) {
      existing.totalLatencySeconds += latencySec;
      existing.latestLatencySeconds = latencySec;
    }

    existing.inputTokens += input.inputTokens ?? 0;
    existing.outputTokens += input.outputTokens ?? 0;
    existing.totalTokens +=
      input.totalTokens ?? (input.inputTokens ?? 0) + (input.outputTokens ?? 0);

    this.metrics.set(key, existing);
  }

  public recordMetric(
    name: string,
    value = 1,
    labels?: Readonly<Record<string, string>>,
  ): void {
    const provider = labels?.provider ?? 'unknown';
    const model = labels?.model ?? 'default';

    if (name === 'token_usage') {
      const type = (labels?.type as 'input' | 'output' | 'total') ?? 'total';
      this.record({
        provider,
        model,
        latencyMs: 0,
        ...(type === 'input' ? { inputTokens: value } : {}),
        ...(type === 'output' ? { outputTokens: value } : {}),
        ...(type === 'total' ? { totalTokens: value } : {}),
        status: 'success',
      });
    } else if (name === 'generation_latency_ms') {
      this.record({
        provider,
        model,
        latencyMs: value,
        status: 'success',
      });
    } else if (name === 'generation_succeeded') {
      this.record({
        provider,
        model,
        latencyMs: 0,
        status: 'success',
      });
    } else if (
      name === 'generation_failed' ||
      name === 'provider_error' ||
      name === 'provider_timeout'
    ) {
      this.record({
        provider,
        model,
        latencyMs: 0,
        status: 'failure',
      });
    }
  }

  public getSummaries(): readonly AiUsageSummary[] {
    return [...this.metrics.values()];
  }

  public reset(): void {
    this.metrics.clear();
  }
}
