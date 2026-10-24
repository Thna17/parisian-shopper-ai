import { Global, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  ASSET_STORAGE,
  CREATIVE_JOB_REPOSITORY,
  CREATIVE_PROVIDER,
  CONTENT_GENERATION_REPOSITORY,
  PRODUCT_SNAPSHOT_REPOSITORY,
  VALIDATION_REPOSITORY,
  VISUAL_ASSET_REPOSITORY,
  type CreativeProvider,
  FakeCreativeProvider,
  GenerateCreativeUseCase,
  HERO_COMPOSITOR,
} from '@parisian-shopper/application';
import { APPLICATION_LOGGER, type ApplicationLogger } from '@parisian-shopper/common';
import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';

import { CodexCliCreativeProvider } from '../codex-cli/codex-cli-creative-provider.js';
import { CreativeProvidersModule } from '../creative-providers.module.js';
import { OpenAiCreativeProvider } from '../openai/openai-creative-provider.js';

describe('CreativeProvidersModule Nest Wiring', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  const createModule = async (options: {
    creativeProvider: 'fake' | 'openai' | 'codex_cli';
    creativeGenerationEnabled?: boolean;
    imageGenerationEnabled?: boolean;
    openaiApiKey?: string;
  }): Promise<TestingModule> => {
    const mockConfigService = {
      nodeEnvironment: 'development',
      creative: {
        provider: options.creativeProvider,
        storageRoot: '.data/assets',
        maxBytes: 10_485_760,
        allowFakeInProduction: false,
      },
      ai: {
        openaiApiKey: options.openaiApiKey,
      },
      codexCli: {
        imageTimeoutMs: 300_000,
        maxConcurrency: 1,
      },
      higgsfield: {
        videoModel: 'bytedance/seedance-2.5/text-to-video',
        videoMaxWaitMs: 300_000,
        generateAudio: false,
      },
    };

    const mockFeatureFlagService = {
      isEnabled: (flag: FeatureFlag): boolean => {
        if (flag === FeatureFlag.CREATIVE_GENERATION) {
          return options.creativeGenerationEnabled ?? true;
        }
        if (flag === FeatureFlag.AI_IMAGE_GENERATION) {
          return options.imageGenerationEnabled ?? true;
        }
        if (flag === FeatureFlag.HIGGSFIELD_PROVIDER) {
          return false;
        }
        return false;
      },
    };

    const mockLogger: ApplicationLogger = {
      log: (): void => {},
      warn: (): void => {},
      error: (): void => {},
    };

    const mockJobRepo = {
      createJob: (): void => {},
      transitionStatus: (): void => {},
    };
    const mockAssetRepo = { createAsset: (): void => {} };
    const mockStorage = {
      getAssetBuffer: (): void => {},
      saveAsset: (): void => {},
    };
    const mockCompositor = { composite: (): void => {} };
    const mockContentRepo = { findVersionById: (): void => {} };
    const mockSnapshotRepo = { findById: (): void => {} };
    const mockValidationRepo = { findLatestByContentVersion: (): void => {} };

    @Global()
    @Module({
      providers: [
        { provide: AppConfigService, useValue: mockConfigService },
        { provide: FeatureFlagService, useValue: mockFeatureFlagService },
        { provide: APPLICATION_LOGGER, useValue: mockLogger },
        { provide: CREATIVE_JOB_REPOSITORY, useValue: mockJobRepo },
        { provide: VISUAL_ASSET_REPOSITORY, useValue: mockAssetRepo },
        { provide: ASSET_STORAGE, useValue: mockStorage },
        { provide: HERO_COMPOSITOR, useValue: mockCompositor },
        { provide: CONTENT_GENERATION_REPOSITORY, useValue: mockContentRepo },
        { provide: PRODUCT_SNAPSHOT_REPOSITORY, useValue: mockSnapshotRepo },
        { provide: VALIDATION_REPOSITORY, useValue: mockValidationRepo },
      ],
      exports: [
        AppConfigService,
        FeatureFlagService,
        APPLICATION_LOGGER,
        CREATIVE_JOB_REPOSITORY,
        VISUAL_ASSET_REPOSITORY,
        ASSET_STORAGE,
        HERO_COMPOSITOR,
        CONTENT_GENERATION_REPOSITORY,
        PRODUCT_SNAPSHOT_REPOSITORY,
        VALIDATION_REPOSITORY,
      ],
    })
    class MockInfrastructureModule {}

    return Test.createTestingModule({
      imports: [MockInfrastructureModule, CreativeProvidersModule],
      providers: [GenerateCreativeUseCase],
    }).compile();
  };

  it('binds FakeCreativeProvider when CREATIVE_PROVIDER=fake and injects it into GenerateCreativeUseCase', async () => {
    const module = await createModule({ creativeProvider: 'fake' });
    const provider = module.get<CreativeProvider>(CREATIVE_PROVIDER);
    const useCase = module.get(GenerateCreativeUseCase);

    expect(provider).toBeInstanceOf(FakeCreativeProvider);
    expect(provider.providerId).toBe('fake-creative-provider');
    expect((useCase as unknown as { provider: CreativeProvider }).provider).toBe(provider);
  });

  it('binds OpenAiCreativeProvider when CREATIVE_PROVIDER=openai and injects it into GenerateCreativeUseCase', async () => {
    const module = await createModule({
      creativeProvider: 'openai',
      openaiApiKey: 'sk-test-key-for-openai-creative',
    });
    const provider = module.get<CreativeProvider>(CREATIVE_PROVIDER);
    const useCase = module.get(GenerateCreativeUseCase);

    expect(provider).toBeInstanceOf(OpenAiCreativeProvider);
    expect(provider.providerId).toBe('openai-dalle-3');
    expect((useCase as unknown as { provider: CreativeProvider }).provider).toBe(provider);
  });

  it('binds CodexCliCreativeProvider when CREATIVE_PROVIDER=codex_cli and injects it into GenerateCreativeUseCase', async () => {
    const module = await createModule({
      creativeProvider: 'codex_cli',
    });
    const provider = module.get<CreativeProvider>(CREATIVE_PROVIDER);
    const useCase = module.get(GenerateCreativeUseCase);

    expect(provider).toBeInstanceOf(CodexCliCreativeProvider);
    expect(provider.providerId).toBe('codex_cli');
    expect((useCase as unknown as { provider: CreativeProvider }).provider).toBe(provider);
  });

  it('binds disabled provider when FEATURE_CREATIVE_GENERATION is false', async () => {
    const module = await createModule({
      creativeProvider: 'codex_cli',
      creativeGenerationEnabled: false,
    });
    const provider = module.get<CreativeProvider>(CREATIVE_PROVIDER);

    expect(provider.providerId).toBe('disabled');
    await expect(
      provider.generateBackground({
        creativeJobId: '1',
        contentVersionId: '1',
        briefText: 'test',
        stylePrompt: 'test',
        targetWidth: 1080,
        targetHeight: 1080,
        aspectRatio: '1:1',
        creativeProfile: 'test',
      }),
    ).rejects.toMatchObject({
      code: 'AI_DISABLED',
    });
  });

  it('binds disabled provider when FEATURE_AI_IMAGE_GENERATION is false', async () => {
    const module = await createModule({
      creativeProvider: 'codex_cli',
      imageGenerationEnabled: false,
    });
    const provider = module.get<CreativeProvider>(CREATIVE_PROVIDER);

    expect(provider.providerId).toBe('disabled');
  });
});
