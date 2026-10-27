import { Injectable } from '@nestjs/common';

export interface RecordCompositorRenderInput {
  readonly templateId?: string | undefined;
  readonly format?: string | undefined;
  readonly cacheStatus: 'HIT' | 'MISS' | 'BYPASS';
  readonly durationSeconds: number;
  readonly status: 'success' | 'failure';
}

export interface CompositorHistogramBucket {
  readonly le: number | '+Inf';
  readonly count: number;
}

export interface CompositorHistogramSummary {
  readonly templateId: string;
  readonly format: string;
  readonly cacheStatus: string;
  readonly buckets: readonly CompositorHistogramBucket[];
  readonly sum: number;
  readonly count: number;
}

export interface CompositorRenderSummary {
  readonly templateId: string;
  readonly format: string;
  readonly cacheStatus: string;
  readonly status: 'success' | 'failure';
  readonly count: number;
}

export interface CompositorLayerFailureSummary {
  readonly layerGroup: string;
  readonly errorCode: string;
  readonly count: number;
}

export const COMPOSITOR_LATENCY_BUCKETS: readonly number[] = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

@Injectable()
export class CompositorMetricsTracker {
  private static instance: CompositorMetricsTracker | undefined;

  public static getInstance(): CompositorMetricsTracker {
    if (!CompositorMetricsTracker.instance) {
      CompositorMetricsTracker.instance = new CompositorMetricsTracker();
    }
    return CompositorMetricsTracker.instance;
  }

  // Latency histograms keyed by `${templateId}:${format}:${cacheStatus}`
  private readonly histograms = new Map<
    string,
    {
      templateId: string;
      format: string;
      cacheStatus: string;
      bucketCounts: Map<number | '+Inf', number>;
      sum: number;
      count: number;
    }
  >();

  // Render counters keyed by `${templateId}:${format}:${cacheStatus}:${status}`
  private readonly renderCounters = new Map<
    string,
    {
      templateId: string;
      format: string;
      cacheStatus: string;
      status: 'success' | 'failure';
      count: number;
    }
  >();

  // Layer failure counters keyed by `${layerGroup}:${errorCode}`
  private readonly failureCounters = new Map<
    string,
    {
      layerGroup: string;
      errorCode: string;
      count: number;
    }
  >();

  public recordRender(input: RecordCompositorRenderInput): void {
    const templateId = input.templateId ?? 'UNKNOWN';
    const format = input.format ?? 'UNKNOWN';
    const cacheStatus = input.cacheStatus;
    const status = input.status;
    const duration = Math.max(0, input.durationSeconds);

    // 1. Update Histogram
    const histKey = `${templateId}:${format}:${cacheStatus}`;
    let hist = this.histograms.get(histKey);
    if (!hist) {
      const bucketCounts = new Map<number | '+Inf', number>();
      for (const b of COMPOSITOR_LATENCY_BUCKETS) {
        bucketCounts.set(b, 0);
      }
      bucketCounts.set('+Inf', 0);
      hist = {
        templateId,
        format,
        cacheStatus,
        bucketCounts,
        sum: 0,
        count: 0,
      };
      this.histograms.set(histKey, hist);
    }

    hist.sum += duration;
    hist.count += 1;
    for (const b of COMPOSITOR_LATENCY_BUCKETS) {
      if (duration <= b) {
        hist.bucketCounts.set(b, (hist.bucketCounts.get(b) ?? 0) + 1);
      }
    }
    hist.bucketCounts.set('+Inf', (hist.bucketCounts.get('+Inf') ?? 0) + 1);

    // 2. Update Render Counter
    const counterKey = `${templateId}:${format}:${cacheStatus}:${status}`;
    let counter = this.renderCounters.get(counterKey);
    if (!counter) {
      counter = {
        templateId,
        format,
        cacheStatus,
        status,
        count: 0,
      };
      this.renderCounters.set(counterKey, counter);
    }
    counter.count += 1;
  }

  public recordLayerFailure(layerGroup: string, errorCode: string): void {
    const key = `${layerGroup}:${errorCode}`;
    let counter = this.failureCounters.get(key);
    if (!counter) {
      counter = {
        layerGroup,
        errorCode,
        count: 0,
      };
      this.failureCounters.set(key, counter);
    }
    counter.count += 1;
  }

  public getHistogramSummaries(): readonly CompositorHistogramSummary[] {
    const summaries: CompositorHistogramSummary[] = [];
    for (const hist of this.histograms.values()) {
      const buckets: CompositorHistogramBucket[] = [];
      for (const b of COMPOSITOR_LATENCY_BUCKETS) {
        buckets.push({ le: b, count: hist.bucketCounts.get(b) ?? 0 });
      }
      buckets.push({ le: '+Inf', count: hist.bucketCounts.get('+Inf') ?? 0 });

      summaries.push({
        templateId: hist.templateId,
        format: hist.format,
        cacheStatus: hist.cacheStatus,
        buckets,
        sum: Number(hist.sum.toFixed(6)),
        count: hist.count,
      });
    }
    return summaries;
  }

  public getRenderSummaries(): readonly CompositorRenderSummary[] {
    return Array.from(this.renderCounters.values());
  }

  public getLayerFailureSummaries(): readonly CompositorLayerFailureSummary[] {
    return Array.from(this.failureCounters.values());
  }

  public clear(): void {
    this.histograms.clear();
    this.renderCounters.clear();
    this.failureCounters.clear();
  }
}
