import { type AIContentOutput } from '../domain/ai-output.schema.js';
import { type AIContext } from './ai-context.js';

export const AI_TEXT_PROVIDER = Symbol('AI_TEXT_PROVIDER');

export interface AIProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AITextGenerationResult {
  output: AIContentOutput;
  provider: string;
  model: string;
  providerRequestId?: string;
  usage?: AIProviderUsage;
}

export interface AITextProvider {
  readonly providerName: string;
  readonly model: string;
  generate(context: AIContext, signal: AbortSignal): Promise<AITextGenerationResult>;
}
