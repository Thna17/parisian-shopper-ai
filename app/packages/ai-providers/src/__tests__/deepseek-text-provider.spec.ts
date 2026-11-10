import { describe, expect, it, jest } from '@jest/globals';
import { type AIContext } from '@parisian-shopper/application';
import OpenAI from 'openai';

import { DeepSeekTextProvider } from '../deepseek-text-provider.js';

const sampleContext: AIContext = {
  version: 'ps-content-v1',
  systemRules: {
    trust: 'TRUSTED',
    data: ['Strictly factual', 'Refined tone'],
  },
  brandRules: {
    trust: 'TRUSTED',
    data: {
      language: ['Khmer', 'English'],
      tone: ['sophisticated'],
      cta: ['Discover in boutique'],
      promotion: ['No discounts'],
      perfumeClaims: ['Authentic notes'],
      platforms: {
        FACEBOOK: ['Engaging hook'],
        INSTAGRAM: ['Visual focus'],
        TELEGRAM: ['Concise preview'],
        GENERIC: ['Standard'],
      },
      visualGuidance: ['Clean lighting'],
    },
  },
  contentStrategy: {
    trust: 'TRUSTED',
    data: {
      contentType: 'PRODUCT_SPOTLIGHT',
      objective: 'Luxury showcase',
      instructions: ['Focus on craftsmanship'],
      constraints: ['Max 200 words'],
    },
  },
  productFacts: {
    trust: 'UNTRUSTED_DATA',
    data: {
      sku: 'PARIS-TRENCH-01',
      name: 'Parisian Silk Trench',
      description: 'Handcrafted trench coat with mulberry silk lining',
      price: 1200,
      currency: 'USD',
    } as unknown as AIContext['productFacts']['data'],
  },
  request: {
    contentJobId: 'job-123',
    language: 'BILINGUAL',
    platform: 'INSTAGRAM',
  },
};

const validOutput = {
  headline: 'Elegance Redefined',
  khmer_caption: 'អាវរងាប្រណីតពីប៉ារីស',
  english_caption: 'Handcrafted luxury from Paris.',
  cta: 'Inquire today',
  hashtags: ['#ParisianShopper', '#LuxuryFashion'],
  creative_brief: 'Warm golden hour street style portrait.',
  facts_used: ['mulberry silk lining', '1200 USD'],
  warnings: [],
  missing_information: [],
};

describe('DeepSeekTextProvider', () => {
  it('initializes with default model deepseek-chat and provider deepseek', () => {
    const provider = new DeepSeekTextProvider({
      apiKey: 'test-key',
      timeoutMs: 30000,
    });
    expect(provider.providerName).toBe('deepseek');
    expect(provider.model).toBe('deepseek-chat');
  });

  it('generates structured marketing content successfully', async () => {
    const mockCreate = jest.fn<OpenAI.Chat.Completions['create']>().mockResolvedValue({
      id: 'chatcmpl-deepseek-123',
      choices: [
        {
          message: {
            role: 'assistant',
            content: JSON.stringify(validOutput),
            refusal: null,
          },
          finish_reason: 'stop',
          index: 0,
          logprobs: null,
        },
      ],
      created: 123456789,
      model: 'deepseek-chat',
      object: 'chat.completion',
      usage: {
        prompt_tokens: 350,
        completion_tokens: 120,
        total_tokens: 470,
      },
    } as never);

    const mockClient = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as unknown as OpenAI;

    const provider = new DeepSeekTextProvider({
      apiKey: 'test-key',
      timeoutMs: 30000,
      client: mockClient,
    });

    const result = await provider.generate(sampleContext, new AbortController().signal);

    expect(result.provider).toBe('deepseek');
    expect(result.model).toBe('deepseek-chat');
    expect(result.providerRequestId).toBe('chatcmpl-deepseek-123');
    expect(result.output.headline).toBe('Elegance Redefined');
    expect(result.output.khmer_caption).toBe('អាវរងាប្រណីតពីប៉ារីស');
    expect(result.output.english_caption).toBe('Handcrafted luxury from Paris.');
    expect(result.usage).toEqual({
      inputTokens: 350,
      outputTokens: 120,
      totalTokens: 470,
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('handles markdown code fences around JSON content', async () => {
    const mockCreate = jest.fn<OpenAI.Chat.Completions['create']>().mockResolvedValue({
      id: 'chatcmpl-fence-123',
      choices: [
        {
          message: {
            role: 'assistant',
            content: `\`\`\`json\n${JSON.stringify(validOutput)}\n\`\`\``,
            refusal: null,
          },
          finish_reason: 'stop',
          index: 0,
          logprobs: null,
        },
      ],
      created: 123456789,
      model: 'deepseek-chat',
      object: 'chat.completion',
    } as never);

    const mockClient = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as unknown as OpenAI;

    const provider = new DeepSeekTextProvider({
      apiKey: 'test-key',
      timeoutMs: 30000,
      client: mockClient,
    });

    const result = await provider.generate(sampleContext, new AbortController().signal);
    expect(result.output.headline).toBe('Elegance Redefined');
  });

  it('rejects output missing required language fields', async () => {
    const mockCreate = jest.fn<OpenAI.Chat.Completions['create']>().mockResolvedValue({
      id: 'chatcmpl-missing-lang',
      choices: [
        {
          message: {
            role: 'assistant',
            content: JSON.stringify({ ...validOutput, khmer_caption: null }),
            refusal: null,
          },
          finish_reason: 'stop',
          index: 0,
          logprobs: null,
        },
      ],
      created: 123456789,
      model: 'deepseek-chat',
      object: 'chat.completion',
    } as never);

    const mockClient = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as unknown as OpenAI;

    const provider = new DeepSeekTextProvider({
      apiKey: 'test-key',
      timeoutMs: 30000,
      client: mockClient,
    });

    await expect(
      provider.generate(sampleContext, new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'AI_OUTPUT_INVALID',
    });
  });

  it('maps 401 authentication error to AI_PROVIDER_AUTH_FAILED', async () => {
    const apiError = new OpenAI.APIError(
      401,
      { error: { message: 'Invalid API key' } },
      'Authentication failed',
      new Headers(),
    );

    const mockCreate = jest.fn<OpenAI.Chat.Completions['create']>().mockRejectedValue(apiError);

    const mockClient = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as unknown as OpenAI;

    const provider = new DeepSeekTextProvider({
      apiKey: 'invalid-key',
      timeoutMs: 30000,
      client: mockClient,
    });

    await expect(
      provider.generate(sampleContext, new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_AUTH_FAILED',
    });
  });

  it('maps 429 rate limit to AI_PROVIDER_RATE_LIMITED with retryable=true', async () => {
    const apiError = new OpenAI.APIError(
      429,
      { error: { message: 'Rate limit exceeded' } },
      'Rate limited',
      new Headers(),
    );

    const mockCreate = jest.fn<OpenAI.Chat.Completions['create']>().mockRejectedValue(apiError);

    const mockClient = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as unknown as OpenAI;

    const provider = new DeepSeekTextProvider({
      apiKey: 'test-key',
      timeoutMs: 30000,
      client: mockClient,
    });

    await expect(
      provider.generate(sampleContext, new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_RATE_LIMITED',
      retryable: true,
    });
  });

  it('maps timeout error to AI_PROVIDER_TIMEOUT with retryable=true', async () => {
    const timeoutError = new Error('Request timed out');
    timeoutError.name = 'TimeoutError';

    const mockCreate = jest.fn<OpenAI.Chat.Completions['create']>().mockRejectedValue(timeoutError);

    const mockClient = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as unknown as OpenAI;

    const provider = new DeepSeekTextProvider({
      apiKey: 'test-key',
      timeoutMs: 30000,
      client: mockClient,
    });

    await expect(
      provider.generate(sampleContext, new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_TIMEOUT',
      retryable: true,
    });
  });

  it('maps malformed JSON to AI_OUTPUT_INVALID', async () => {
    const mockCreate = jest.fn<OpenAI.Chat.Completions['create']>().mockResolvedValue({
      id: 'chatcmpl-broken',
      choices: [
        {
          message: {
            role: 'assistant',
            content: '{ not valid json',
            refusal: null,
          },
          finish_reason: 'stop',
          index: 0,
          logprobs: null,
        },
      ],
      created: 123456789,
      model: 'deepseek-chat',
      object: 'chat.completion',
    } as never);

    const mockClient = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as unknown as OpenAI;

    const provider = new DeepSeekTextProvider({
      apiKey: 'test-key',
      timeoutMs: 30000,
      client: mockClient,
    });

    await expect(
      provider.generate(sampleContext, new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'AI_OUTPUT_INVALID',
    });
  });
});
