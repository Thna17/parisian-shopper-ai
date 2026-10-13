import {
  FakeCreativeProvider,
  type CreativeProvider,
} from '@parisian-shopper/application';
import { type ApplicationLogger } from '@parisian-shopper/common';

import { OpenAiCreativeProvider } from './openai/openai-creative-provider.js';

export interface CreativeImageProviderFactoryOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly logger?: ApplicationLogger;
}

export function createCreativeImageProvider(
  options: CreativeImageProviderFactoryOptions = {},
): CreativeProvider {
  const env = options.env ?? process.env;
  const rawProvider = env.CREATIVE_IMAGE_PROVIDER?.toLowerCase().trim();
  const providerType = rawProvider === 'openai' ? 'openai' : 'fake';

  if (providerType === 'openai') {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      options.logger?.warn(
        'CREATIVE_IMAGE_PROVIDER is set to "openai" but OPENAI_API_KEY is missing. Falling back to FakeCreativeProvider.',
        {
          action: 'creative_image_provider_fallback',
          reason: 'missing_openai_api_key',
        },
      );
      return new FakeCreativeProvider();
    }

    return new OpenAiCreativeProvider({
      apiKey,
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
  }

  return new FakeCreativeProvider();
}
