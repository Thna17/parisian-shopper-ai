import { type AIContext } from '../application/ai-context.js';
import {
  type AITextGenerationResult,
  type AITextProvider,
} from '../application/ai-text-provider.port.js';
import { validateOutputForLanguage } from '../domain/ai-output.schema.js';

export class FakeAITextProvider implements AITextProvider {
  public readonly providerName = 'fake';
  public readonly model = 'deterministic-fixture-v1';

  public generate(context: AIContext, signal: AbortSignal): Promise<AITextGenerationResult> {
    if (signal.aborted) return Promise.reject(toAbortError(signal.reason));
    const product = context.productFacts.data;
    const value = {
      headline: `${product.product_name} — ${context.contentStrategy.data.contentType}`,
      khmer_caption:
        context.request.language === 'EN' ? null : `មាតិកាសាកល្បងសម្រាប់ ${product.product_name}`,
      english_caption:
        context.request.language === 'KM'
          ? null
          : `Development content for ${product.product_name} by ${product.brand}.`,
      cta: 'Learn more from the verified product catalogue.',
      hashtags: ['#FictionalProduct', '#DevelopmentOnly'],
      creative_brief: `Development-only ${context.request.platform} concept for ${product.sku}.`,
      facts_used: [
        `sku:${product.sku}`,
        `name:${product.product_name}`,
        `brand:${product.brand}`,
        `price:${product.price} ${product.currency}`,
      ],
      warnings: ['FAKE_PROVIDER_OUTPUT_NOT_MARKETING_APPROVED'],
      missing_information: [],
    };
    return Promise.resolve({
      output: validateOutputForLanguage(value, context.request.language),
      provider: this.providerName,
      model: this.model,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
  }
}

function toAbortError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error('AI generation aborted');
}
