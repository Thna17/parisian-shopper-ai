import { ApplicationError } from '@parisian-shopper/common';

import { type AITextProvider } from './ai-text-provider.port.js';

export class AIProviderResolver {
  private readonly providers: ReadonlyMap<string, AITextProvider>;

  public constructor(providers: readonly AITextProvider[]) {
    this.providers = new Map(providers.map((provider) => [provider.providerName, provider]));
  }

  public resolve(name: string): AITextProvider {
    const provider = this.providers.get(name);
    if (provider === undefined) {
      throw new ApplicationError({
        code: 'AI_PROVIDER_UNAVAILABLE',
        publicMessage: 'The configured AI provider is unavailable.',
        details: { provider: name },
      });
    }
    return provider;
  }
}
