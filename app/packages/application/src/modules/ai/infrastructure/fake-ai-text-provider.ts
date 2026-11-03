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
    const isEn = context.request.language === 'EN';
    const isKm = context.request.language === 'KM';
    const cleanBrand = product.brand || 'Geparlys Paris';
    const cleanName = product.product_name;

    const value = {
      headline: `${cleanName} — The Sovereign Scent of Paris`,
      khmer_caption: isEn
        ? null
        : `ស្វែងរកក្លិនក្រអូបដ៏ទាក់ទាញជាមួយ ${cleanName} ពី ${cleanBrand}។ ក្លិនក្រអូបបែបប្រណិត សាកសមឥតខ្ចោះសម្រាប់ការទាក់ទាញគ្រប់ពេលវេលា។`,
      english_caption: isKm
        ? null
        : `Indulge in irresistible Parisian allure with ${cleanName} by ${cleanBrand}. An unforgettable blend crafted for elegance and presence.`,
      cta: 'Discover your signature scent at Parisian Shopper.',
      hashtags: [
        '#ParisianShopper',
        `#${cleanBrand.replace(/[^a-zA-Z0-9]/g, '')}`,
        '#HauteParfumerie',
        '#LuxuryFragrance',
      ],
      creative_brief: `Editorial luxury spotlight for ${cleanName} (${product.sku}) on ${context.request.platform}.`,
      facts_used: [
        `sku:${product.sku}`,
        `name:${product.product_name}`,
        `brand:${product.brand}`,
        `price:${product.price} ${product.currency}`,
      ],
      warnings: [],
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
