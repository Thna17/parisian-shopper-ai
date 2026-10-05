import { Inject, Injectable } from '@nestjs/common';
import {
  type ApplicationLogger,
  APPLICATION_LOGGER,
  ApplicationError,
} from '@parisian-shopper/common';
import { FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';
import { ZodError } from 'zod';

import { AIContextBuilder } from '../../ai/application/ai-context-builder.js';
import { PROMPT_CONTEXT_VERSION } from '../../ai/application/ai-context.js';
import {
  AI_TEXT_PROVIDER,
  type AITextProvider,
} from '../../ai/application/ai-text-provider.port.js';
import { validateOutputForLanguage } from '../../ai/domain/ai-output.schema.js';
import {
  BRAND_RULE_REPOSITORY,
  type BrandRuleRepository,
} from '../../brand/application/brand-rule.repository.js';
import {
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshotRepository,
} from '../../products/application/product-snapshot.repository.js';
import { ContentGenerationError, classifyProviderError } from '../domain/content-errors.js';
import { ContentStrategyRegistry } from '../domain/content-strategy.js';
import {
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
  type ContentVersion,
} from './content-generation.repository.js';
import { CONTENT_METRICS, type ContentMetrics } from './content-metrics.port.js';

export const AI_EXECUTION_POLICY = Symbol('AI_EXECUTION_POLICY');
export interface AIExecutionPolicy {
  timeoutMs: number;
  attemptStaleAfterMs: number;
}

@Injectable()
export class GenerateContentUseCase {
  public constructor(
    @Inject(CONTENT_GENERATION_REPOSITORY) private readonly repository: ContentGenerationRepository,
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY) private readonly snapshots: ProductSnapshotRepository,
    @Inject(BRAND_RULE_REPOSITORY) private readonly brandRules: BrandRuleRepository,
    @Inject(AI_TEXT_PROVIDER) private readonly provider: AITextProvider,
    @Inject(AI_EXECUTION_POLICY) private readonly policy: AIExecutionPolicy,
    @Inject(CONTENT_METRICS) private readonly metrics: ContentMetrics,
    @Inject(APPLICATION_LOGGER) private readonly logger: ApplicationLogger,
    @Inject(FeatureFlagService) private readonly flags: Pick<FeatureFlagService, 'isEnabled'>,
    private readonly strategies: ContentStrategyRegistry,
    private readonly contextBuilder: AIContextBuilder,
  ) {}

  public async execute(contentJobId: string): Promise<ContentVersion | null> {
    if (!this.flags.isEnabled(FeatureFlag.AI_TEXT_GENERATION)) {
      throw new ContentGenerationError({
        code: 'AI_DISABLED',
        publicMessage: 'AI text generation is disabled.',
      });
    }
    const job = await this.repository.findJobById(contentJobId);
    if (job === null)
      throw new ContentGenerationError({
        code: 'CONTENT_JOB_NOT_FOUND',
        publicMessage: 'Content job was not found.',
      });
    const snapshot = await this.snapshots.findById(job.productSnapshotId);
    if (snapshot === null)
      throw new ContentGenerationError({
        code: 'CONTENT_JOB_NOT_FOUND',
        publicMessage: 'The content job product snapshot was not found.',
      });
    const brandRuleVersion = await this.brandRules.findById(job.brandRuleVersionId);
    if (brandRuleVersion === null)
      throw new ContentGenerationError({
        code: 'BRAND_RULE_VERSION_NOT_FOUND',
        publicMessage: 'Brand rule version was not found.',
      });
    const strategy = this.strategies.get(job.contentType);
    strategy.assertPrerequisites(snapshot.product.product);

    const started = await this.repository.beginGeneration({
      contentJobId,
      provider: this.provider.providerName,
      model: this.provider.model,
      promptVersion: PROMPT_CONTEXT_VERSION,
      staleAfterMs: this.policy.attemptStaleAfterMs,
    });
    if (started.disposition === 'ALREADY_COMPLETE') {
      const versions = await this.repository.findVersionsByJobId(contentJobId);
      return versions.at(-1) ?? null;
    }
    if (started.disposition === 'ALREADY_RUNNING') {
      throw new ContentGenerationError({
        code: 'AI_PROVIDER_UNAVAILABLE',
        publicMessage: 'Content generation is already in progress.',
        retryable: true,
      });
    }

    let reviewerInstruction: string | undefined;
    let previousDraft: unknown;
    if (started.activeRevision !== undefined) {
      const prevVersion = await this.repository.findVersionById(
        started.activeRevision.sourceContentVersionId,
      );
      previousDraft = prevVersion?.structuredOutput;
      if (started.activeRevision.type === 'EDIT') {
        reviewerInstruction = started.activeRevision.instruction;
      }
    }

    const context = this.contextBuilder.build({
      job: started.job,
      productSnapshot: snapshot,
      brandRuleVersion,
      strategy,
      ...(reviewerInstruction === undefined ? {} : { reviewerInstruction }),
      ...(previousDraft === undefined ? {} : { previousDraft }),
    });
    const startedAt = Date.now();
    this.metrics.record('generation_requested', 1, { provider: this.provider.providerName });
    try {
      const result = await withTimeout(
        (signal) => this.provider.generate(context, signal),
        this.policy.timeoutMs,
      );
      const output = validateOutputForLanguage(result.output, job.language);
      const latencyMs = Date.now() - startedAt;
      const version = await this.repository.completeGeneration({
        contentJobId,
        attemptId: started.attempt.id,
        output,
        provider: result.provider,
        model: result.model,
        promptVersion: PROMPT_CONTEXT_VERSION,
        ...(result.providerRequestId === undefined
          ? {}
          : { providerMetadata: { requestId: result.providerRequestId } }),
        ...(result.usage?.inputTokens === undefined
          ? {}
          : { inputTokens: result.usage.inputTokens }),
        ...(result.usage?.outputTokens === undefined
          ? {}
          : { outputTokens: result.usage.outputTokens }),
        ...(result.usage?.totalTokens === undefined
          ? {}
          : { totalTokens: result.usage.totalTokens }),
        latencyMs,
      });
      this.metrics.record('generation_succeeded', 1, { provider: result.provider });
      this.metrics.record('generation_latency_ms', latencyMs, { provider: result.provider });
      this.logger.log(
        'Content generation succeeded',
        logFields(
          started.job,
          started.attempt.id,
          result.provider,
          result.model,
          latencyMs,
          'SUCCEEDED',
        ),
      );
      return version;
    } catch (unknownError) {
      const error = toGenerationError(unknownError);
      const latencyMs = Date.now() - startedAt;
      await this.repository.failGeneration({
        contentJobId,
        attemptId: started.attempt.id,
        status: error.code === 'AI_PROVIDER_TIMEOUT' ? 'TIMED_OUT' : 'FAILED',
        errorCode: error.code,
        errorMetadata: { retryable: error.retryable },
        latencyMs,
      });
      this.metrics.record(
        error.code === 'AI_PROVIDER_TIMEOUT'
          ? 'provider_timeout'
          : error.code === 'AI_OUTPUT_INVALID'
            ? 'invalid_output'
            : 'provider_error',
      );
      this.metrics.record('generation_failed');
      this.logger.error(
        'Content generation failed',
        logFields(
          started.job,
          started.attempt.id,
          this.provider.providerName,
          this.provider.model,
          latencyMs,
          'FAILED',
          error.code,
        ),
      );
      throw error;
    }
  }
}

async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new ContentGenerationError({
        code: 'AI_PROVIDER_TIMEOUT',
        publicMessage: 'The AI provider timed out.',
        retryable: true,
      });
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function toGenerationError(error: unknown): ContentGenerationError {
  if (
    error instanceof ZodError ||
    (error instanceof Error && error.message.includes('caption is required'))
  ) {
    return new ContentGenerationError({
      code: 'AI_OUTPUT_INVALID',
      publicMessage: 'The AI provider returned invalid structured output.',
      cause: error,
    });
  }
  if (error instanceof ApplicationError && !(error instanceof ContentGenerationError)) {
    return new ContentGenerationError({
      code: 'AI_PROVIDER_UNAVAILABLE',
      publicMessage: error.publicMessage,
      cause: error,
    });
  }
  return classifyProviderError(error);
}

function logFields(
  job: {
    id: string;
    productSnapshotId: string;
    contentType: string;
    language: string;
    platform: string;
  },
  generationAttemptId: string,
  provider: string,
  model: string,
  duration: number,
  status: string,
  errorCode?: string,
): Readonly<Record<string, unknown>> {
  return {
    contentJobId: job.id,
    productSnapshotId: job.productSnapshotId,
    generationAttemptId,
    provider,
    model,
    contentType: job.contentType,
    language: job.language,
    platform: job.platform,
    duration,
    status,
    ...(errorCode === undefined ? {} : { errorCode }),
  };
}
