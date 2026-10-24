import { describe, expect, it, jest } from '@jest/globals';
import { type Queue } from 'bullmq';

import { AIMetricsTracker } from '../metrics/ai-metrics.tracker.js';
import { PrometheusMetricsService } from '../metrics/prometheus-metrics.service.js';
import { QueueRegistry } from '../queue.registry.js';
import { QueueName } from '../queue-names.js';

describe('PrometheusMetricsService', () => {
  it('generates standard Prometheus exposition metrics covering queues, memory, and AI expenditure', async () => {
    const queueRegistry = new QueueRegistry();
    const aiTracker = new AIMetricsTracker();

    // Mock BullMQ queue
    const mockQueue: Partial<Queue> = {
      getWaitingCount: jest.fn(() => Promise.resolve(7)),
      getActiveCount: jest.fn(() => Promise.resolve(2)),
      getCompletedCount: jest.fn(() => Promise.resolve(150)),
      getFailedCount: jest.fn(() => Promise.resolve(3)),
      getJobs: jest.fn(() =>
        Promise.resolve([
          {
            timestamp: Date.now() - 4_500,
          } as unknown as ReturnType<Queue['getJobs']> extends Promise<(infer U)[]> ? U : never,
        ]),
      ),
    };

    queueRegistry.register(QueueName.CREATIVE_GENERATION, mockQueue as Queue);

    // Record AI token usage and latency
    aiTracker.record({
      provider: 'openai',
      model: 'gpt-4o',
      latencyMs: 1_250,
      inputTokens: 800,
      outputTokens: 350,
      totalTokens: 1_150,
      status: 'success',
    });

    aiTracker.record({
      provider: 'openai',
      model: 'dall-e-3',
      latencyMs: 4_200,
      status: 'success',
    });

    aiTracker.record({
      provider: 'higgsfield',
      model: 'seedance-2.5',
      latencyMs: 15_000,
      status: 'failure',
    });

    const metricsService = new PrometheusMetricsService(queueRegistry, aiTracker);
    const output = await metricsService.getPrometheusMetrics();

    // Assert Process metrics
    expect(output).toContain('# HELP process_uptime_seconds');
    expect(output).toContain('# TYPE process_uptime_seconds gauge');
    expect(output).toContain('process_resident_memory_bytes');
    expect(output).toContain('nodejs_heap_used_bytes');

    // Assert BullMQ metrics
    expect(output).toContain('# HELP bullmq_queue_depth');
    expect(output).toContain('bullmq_queue_depth{queue="creative-generation"} 7');
    expect(output).toContain('bullmq_active_jobs{queue="creative-generation"} 2');
    expect(output).toContain('bullmq_completed_jobs_total{queue="creative-generation"} 150');
    expect(output).toContain('bullmq_failed_jobs_total{queue="creative-generation"} 3');
    expect(output).toContain('bullmq_queue_latency_seconds{queue="creative-generation"}');

    // Assert AI Provider metrics
    expect(output).toContain('# HELP ai_requests_total');
    expect(output).toContain(
      'ai_requests_total{provider="openai",model="gpt-4o",status="success"} 1',
    );
    expect(output).toContain(
      'ai_requests_total{provider="higgsfield",model="seedance-2.5",status="failure"} 1',
    );

    expect(output).toContain('# HELP ai_token_expenditure_total');
    expect(output).toContain(
      'ai_token_expenditure_total{provider="openai",model="gpt-4o",type="input"} 800',
    );
    expect(output).toContain(
      'ai_token_expenditure_total{provider="openai",model="gpt-4o",type="output"} 350',
    );
    expect(output).toContain(
      'ai_token_expenditure_total{provider="openai",model="gpt-4o",type="total"} 1150',
    );

    expect(output).toContain('# HELP ai_request_latency_seconds');
    expect(output).toContain('ai_request_latency_seconds{provider="openai",model="gpt-4o"} 1.250');
    expect(output).toContain(
      'ai_request_latency_seconds_sum{provider="openai",model="gpt-4o"} 1.250',
    );
    expect(output).toContain(
      'ai_request_latency_seconds_count{provider="openai",model="gpt-4o"} 1',
    );
  });
});
