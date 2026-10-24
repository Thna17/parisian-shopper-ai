import { Inject, Injectable } from '@nestjs/common';

import { QueueRegistry } from '../queue.registry.js';
import { AIMetricsTracker } from './ai-metrics.tracker.js';

@Injectable()
export class PrometheusMetricsService {
  public constructor(
    @Inject(QueueRegistry)
    private readonly queueRegistry: QueueRegistry,
    @Inject(AIMetricsTracker)
    private readonly aiMetrics: AIMetricsTracker,
  ) {}

  public async getPrometheusMetrics(): Promise<string> {
    const lines: string[] = [];

    // ==========================================
    // 1. Process & Runtime Gauges
    // ==========================================
    lines.push('# HELP process_uptime_seconds Total uptime of the process in seconds');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${process.uptime().toFixed(1)}`);
    lines.push('');

    const mem = process.memoryUsage();
    lines.push('# HELP process_resident_memory_bytes Resident memory size in bytes');
    lines.push('# TYPE process_resident_memory_bytes gauge');
    lines.push(`process_resident_memory_bytes ${mem.rss}`);
    lines.push('');

    lines.push('# HELP nodejs_heap_used_bytes Node.js heap used in bytes');
    lines.push('# TYPE nodejs_heap_used_bytes gauge');
    lines.push(`nodejs_heap_used_bytes ${mem.heapUsed}`);
    lines.push('');

    lines.push('# HELP nodejs_heap_total_bytes Node.js heap total allocated in bytes');
    lines.push('# TYPE nodejs_heap_total_bytes gauge');
    lines.push(`nodejs_heap_total_bytes ${mem.heapTotal}`);
    lines.push('');

    lines.push('# HELP nodejs_external_memory_bytes Node.js external memory in bytes');
    lines.push('# TYPE nodejs_external_memory_bytes gauge');
    lines.push(`nodejs_external_memory_bytes ${mem.external}`);
    lines.push('');

    // ==========================================
    // 2. libvips / Sharp Memory Gauges
    // ==========================================
    try {
      const sharpModule = (await import('sharp')) as unknown as {
        default?: {
          cache: () => {
            memory: { current: number; high: number; max: number };
            files: { current: number; max: number };
            items: { current: number; max: number };
          };
        };
        cache?: () => {
          memory: { current: number; high: number; max: number };
          files: { current: number; max: number };
          items: { current: number; max: number };
        };
      };
      const cacheFn = sharpModule.default?.cache ?? sharpModule.cache;
      if (typeof cacheFn === 'function') {
        const cache = cacheFn();

        lines.push(
          '# HELP sharp_libvips_memory_bytes Memory currently allocated by libvips in bytes',
        );
        lines.push('# TYPE sharp_libvips_memory_bytes gauge');
        lines.push(`sharp_libvips_memory_bytes ${cache.memory.current}`);
        lines.push('');

        lines.push(
          '# HELP sharp_libvips_memory_highwater_bytes High-water mark of memory allocated by libvips in bytes',
        );
        lines.push('# TYPE sharp_libvips_memory_highwater_bytes gauge');
        lines.push(`sharp_libvips_memory_highwater_bytes ${cache.memory.high}`);
        lines.push('');

        lines.push(
          '# HELP sharp_libvips_memory_max_bytes Maximum memory budget for libvips in bytes',
        );
        lines.push('# TYPE sharp_libvips_memory_max_bytes gauge');
        lines.push(`sharp_libvips_memory_max_bytes ${cache.memory.max}`);
        lines.push('');

        lines.push('# HELP sharp_libvips_files_open Number of files currently opened by libvips');
        lines.push('# TYPE sharp_libvips_files_open gauge');
        lines.push(`sharp_libvips_files_open ${cache.files.current}`);
        lines.push('');

        lines.push(
          '# HELP sharp_libvips_items_cached Number of operations currently cached by libvips',
        );
        lines.push('# TYPE sharp_libvips_items_cached gauge');
        lines.push(`sharp_libvips_items_cached ${cache.items.current}`);
        lines.push('');
      }
    } catch {
      // sharp not installed or cache unavailable
    }

    // ==========================================
    // 3. BullMQ Queues: Depths, Latency & Failures
    // ==========================================
    lines.push('# HELP bullmq_queue_depth Current number of waiting jobs in queue');
    lines.push('# TYPE bullmq_queue_depth gauge');

    const queues = this.queueRegistry.getAll();
    const queueDepths: string[] = [];
    const queueActive: string[] = [];
    const queueCompleted: string[] = [];
    const queueFailed: string[] = [];
    const queueLatencies: string[] = [];

    for (const [name, queue] of queues) {
      try {
        const [waiting, active, completed, failed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
        ]);

        let latencySec = 0;
        const waitingJobs = await queue.getJobs(['waiting'], 0, 0);
        if (waitingJobs.length > 0 && waitingJobs[0]?.timestamp) {
          latencySec = Math.max(0, (Date.now() - waitingJobs[0].timestamp) / 1000);
        }

        queueDepths.push(`bullmq_queue_depth{queue="${name}"} ${waiting}`);
        queueActive.push(`bullmq_active_jobs{queue="${name}"} ${active}`);
        queueCompleted.push(`bullmq_completed_jobs_total{queue="${name}"} ${completed}`);
        queueFailed.push(`bullmq_failed_jobs_total{queue="${name}"} ${failed}`);
        queueLatencies.push(
          `bullmq_queue_latency_seconds{queue="${name}"} ${latencySec.toFixed(3)}`,
        );
      } catch {
        // Queue may be disconnected during test/shutdown
      }
    }

    lines.push(...queueDepths);
    lines.push('');

    lines.push('# HELP bullmq_active_jobs Current number of active jobs being processed in queue');
    lines.push('# TYPE bullmq_active_jobs gauge');
    lines.push(...queueActive);
    lines.push('');

    lines.push('# HELP bullmq_completed_jobs_total Cumulative number of completed jobs in queue');
    lines.push('# TYPE bullmq_completed_jobs_total counter');
    lines.push(...queueCompleted);
    lines.push('');

    lines.push('# HELP bullmq_failed_jobs_total Cumulative number of failed jobs in queue');
    lines.push('# TYPE bullmq_failed_jobs_total counter');
    lines.push(...queueFailed);
    lines.push('');

    lines.push(
      '# HELP bullmq_queue_latency_seconds Latency of the oldest waiting job in queue in seconds',
    );
    lines.push('# TYPE bullmq_queue_latency_seconds gauge');
    lines.push(...queueLatencies);
    lines.push('');

    // ==========================================
    // 4. AI Provider Token Expenditure & Latency
    // ==========================================
    const aiSummaries = this.aiMetrics.getSummaries();

    lines.push('# HELP ai_requests_total Total number of AI provider requests');
    lines.push('# TYPE ai_requests_total counter');
    for (const s of aiSummaries) {
      lines.push(
        `ai_requests_total{provider="${s.provider}",model="${s.model}",status="${s.status}"} ${s.requestCount}`,
      );
    }
    lines.push('');

    lines.push('# HELP ai_token_expenditure_total Total token expenditure by provider and model');
    lines.push('# TYPE ai_token_expenditure_total counter');
    for (const s of aiSummaries) {
      lines.push(
        `ai_token_expenditure_total{provider="${s.provider}",model="${s.model}",type="input"} ${s.inputTokens}`,
      );
      lines.push(
        `ai_token_expenditure_total{provider="${s.provider}",model="${s.model}",type="output"} ${s.outputTokens}`,
      );
      lines.push(
        `ai_token_expenditure_total{provider="${s.provider}",model="${s.model}",type="total"} ${s.totalTokens}`,
      );
    }
    lines.push('');

    lines.push(
      '# HELP ai_request_latency_seconds Latency of the most recent AI request in seconds',
    );
    lines.push('# TYPE ai_request_latency_seconds gauge');
    for (const s of aiSummaries) {
      lines.push(
        `ai_request_latency_seconds{provider="${s.provider}",model="${s.model}"} ${s.latestLatencySeconds.toFixed(3)}`,
      );
    }
    lines.push('');

    lines.push(
      '# HELP ai_request_latency_seconds_sum Cumulative latency of AI requests in seconds',
    );
    lines.push('# TYPE ai_request_latency_seconds_sum counter');
    for (const s of aiSummaries) {
      lines.push(
        `ai_request_latency_seconds_sum{provider="${s.provider}",model="${s.model}"} ${s.totalLatencySeconds.toFixed(3)}`,
      );
    }
    lines.push('');

    lines.push(
      '# HELP ai_request_latency_seconds_count Total count of observed AI requests for latency calculation',
    );
    lines.push('# TYPE ai_request_latency_seconds_count counter');
    for (const s of aiSummaries) {
      lines.push(
        `ai_request_latency_seconds_count{provider="${s.provider}",model="${s.model}"} ${s.requestCount}`,
      );
    }
    lines.push('');

    return lines.join('\n') + '\n';
  }
}
