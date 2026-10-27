import { describe, expect, it, beforeEach } from '@jest/globals';
import { CompositorMetricsTracker } from './compositor-metrics.tracker.js';

describe('CompositorMetricsTracker', () => {
  let tracker: CompositorMetricsTracker;

  beforeEach(() => {
    tracker = new CompositorMetricsTracker();
  });

  it('records renders and correctly accumulates duration into Prometheus histogram buckets', () => {
    tracker.recordRender({
      templateId: 'CENTERED_HERO',
      format: '1:1',
      cacheStatus: 'HIT',
      durationSeconds: 0.002, // 2ms <= 0.005
      status: 'success',
    });

    tracker.recordRender({
      templateId: 'CENTERED_HERO',
      format: '1:1',
      cacheStatus: 'HIT',
      durationSeconds: 0.004, // 4ms <= 0.005
      status: 'success',
    });

    tracker.recordRender({
      templateId: 'CENTERED_HERO',
      format: '1:1',
      cacheStatus: 'HIT',
      durationSeconds: 0.02, // 20ms <= 0.025
      status: 'success',
    });

    const summaries = tracker.getHistogramSummaries();
    expect(summaries).toHaveLength(1);
    const summary = summaries[0]!;

    expect(summary.templateId).toBe('CENTERED_HERO');
    expect(summary.format).toBe('1:1');
    expect(summary.cacheStatus).toBe('HIT');
    expect(summary.count).toBe(3);
    expect(summary.sum).toBeCloseTo(0.026, 3);

    const bucket005 = summary.buckets.find((b) => b.le === 0.005);
    expect(bucket005?.count).toBe(2);

    const bucket01 = summary.buckets.find((b) => b.le === 0.01);
    expect(bucket01?.count).toBe(2);

    const bucket025 = summary.buckets.find((b) => b.le === 0.025);
    expect(bucket025?.count).toBe(3);

    const bucketInf = summary.buckets.find((b) => b.le === '+Inf');
    expect(bucketInf?.count).toBe(3);
  });

  it('records multi-template render counters for success and failure', () => {
    tracker.recordRender({
      templateId: 'EDITORIAL_SPLIT',
      format: '4:5',
      cacheStatus: 'MISS',
      durationSeconds: 0.35,
      status: 'success',
    });

    tracker.recordRender({
      templateId: 'EDITORIAL_SPLIT',
      format: '4:5',
      cacheStatus: 'MISS',
      durationSeconds: 0.1,
      status: 'failure',
    });

    const renderSummaries = tracker.getRenderSummaries();
    expect(renderSummaries).toHaveLength(2);

    const success = renderSummaries.find((r) => r.status === 'success');
    expect(success?.count).toBe(1);
    expect(success?.templateId).toBe('EDITORIAL_SPLIT');

    const failure = renderSummaries.find((r) => r.status === 'failure');
    expect(failure?.count).toBe(1);
  });

  it('records layer failures with layer group and error code', () => {
    tracker.recordLayerFailure('PRODUCT_HERO', 'COMPOSITOR_CORRUPTED_LAYER');
    tracker.recordLayerFailure('PRODUCT_HERO', 'COMPOSITOR_CORRUPTED_LAYER');
    tracker.recordLayerFailure('TYPOGRAPHY', 'SAFE_ZONE_VIOLATION');

    const failures = tracker.getLayerFailureSummaries();
    expect(failures).toHaveLength(2);

    const productFailure = failures.find((f) => f.layerGroup === 'PRODUCT_HERO');
    expect(productFailure?.count).toBe(2);
    expect(productFailure?.errorCode).toBe('COMPOSITOR_CORRUPTED_LAYER');

    const typoFailure = failures.find((f) => f.layerGroup === 'TYPOGRAPHY');
    expect(typoFailure?.count).toBe(1);
    expect(typoFailure?.errorCode).toBe('SAFE_ZONE_VIOLATION');
  });

  it('resets all internal counters on clear()', () => {
    tracker.recordRender({
      templateId: 'SCENT_STORY',
      format: '9:16',
      cacheStatus: 'MISS',
      durationSeconds: 0.5,
      status: 'success',
    });
    tracker.recordLayerFailure('BACKGROUND', 'IMAGE_DECODE_FAILED');

    expect(tracker.getHistogramSummaries()).toHaveLength(1);
    expect(tracker.getLayerFailureSummaries()).toHaveLength(1);

    tracker.clear();

    expect(tracker.getHistogramSummaries()).toHaveLength(0);
    expect(tracker.getRenderSummaries()).toHaveLength(0);
    expect(tracker.getLayerFailureSummaries()).toHaveLength(0);
  });
});
