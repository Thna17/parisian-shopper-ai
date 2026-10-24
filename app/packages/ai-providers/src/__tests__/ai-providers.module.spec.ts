import { Global, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  AI_EXECUTION_POLICY,
  AI_TEXT_PROVIDER,
  CONTENT_METRICS,
  type AIContext,
  type AITextProvider,
} from '@parisian-shopper/application';
import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';

import { AIProvidersModule } from '../ai-providers.module.js';
import { CodexCliTextProvider } from '../codex-cli-text-provider.js';
import { OpenAITextProvider } from '../openai-text-provider.js';

describe('AIProvidersModule wiring', () => {
  const createModule = async (options: {
    aiProvider: 'fake' | 'openai' | 'codex_cli';
    textGenerationEnabled?: boolean;
    openaiApiKey?: string;
    openaiModel?: string;
    textTimeoutMs?: number;
  }): Promise<TestingModule> => {
    const mockConfigService = {
      ai: {
        provider: options.aiProvider,
        openaiApiKey: options.openaiApiKey,
        openaiModel: options.openaiModel,
        requestTimeoutMs: 30_000,
        attemptStaleAfterMs: 35_000,
        maxRetries: 2,
      },
      codexCli: {
        textTimeoutMs: options.textTimeoutMs ?? 120_000,
        imageTimeoutMs: 300_000,
        maxConcurrency: 1,
      },
    };

    const mockFeatureFlagService = {
      isEnabled: (flag: FeatureFlag): boolean => {
        if (flag === FeatureFlag.AI_TEXT_GENERATION) {
          return options.textGenerationEnabled ?? true;
        }
        return false;
      },
    };

    @Global()
    @Module({
      providers: [
        {
          provide: AppConfigService,
          useValue: mockConfigService,
        },
        {
          provide: FeatureFlagService,
          useValue: mockFeatureFlagService,
        },
      ],
      exports: [AppConfigService, FeatureFlagService],
    })
    class MockConfigModule {}

    return Test.createTestingModule({
      imports: [MockConfigModule, AIProvidersModule],
    }).compile();
  };

  it('selects FakeAITextProvider when AI_PROVIDER=fake', async () => {
    const module = await createModule({ aiProvider: 'fake' });
    const provider = module.get<AITextProvider>(AI_TEXT_PROVIDER);

    expect(provider.providerName).toBe('fake');
    expect(module.get(AI_EXECUTION_POLICY)).toBeDefined();
    expect(module.get(CONTENT_METRICS)).toBeDefined();
  });

  it('selects CodexCliTextProvider without requiring OpenAI keys when AI_PROVIDER=codex_cli', async () => {
    const module = await createModule({
      aiProvider: 'codex_cli',
      textTimeoutMs: 60_000,
    });
    const provider = module.get<AITextProvider>(AI_TEXT_PROVIDER);

    expect(provider.providerName).toBe('codex_cli');
    expect(provider).toBeInstanceOf(CodexCliTextProvider);
  });

  it('returns disabled provider when FEATURE_AI_TEXT_GENERATION is false', async () => {
    const module = await createModule({
      aiProvider: 'codex_cli',
      textGenerationEnabled: false,
    });
    const provider = module.get<AITextProvider>(AI_TEXT_PROVIDER);

    expect(provider.providerName).toBe('disabled');
    await expect(
      provider.generate({} as unknown as AIContext, new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'AI_DISABLED',
    });
  });

  it('selects OpenAITextProvider when AI_PROVIDER=openai and credentials are provided', async () => {
    const module = await createModule({
      aiProvider: 'openai',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4o',
    });
    const provider = module.get<AITextProvider>(AI_TEXT_PROVIDER);

    expect(provider.providerName).toBe('openai');
    expect(provider).toBeInstanceOf(OpenAITextProvider);
  });

  it('throws an error if AI_PROVIDER=openai but OPENAI_API_KEY is missing', async () => {
    await expect(
      createModule({
        aiProvider: 'openai',
        openaiModel: 'gpt-4o',
      }),
    ).rejects.toThrow('OPENAI_API_KEY is required');
  });
});
