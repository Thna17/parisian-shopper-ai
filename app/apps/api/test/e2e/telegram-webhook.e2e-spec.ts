import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';
import { GrammyBotAdapter } from '@parisian-shopper/telegram';
import { jest } from '@jest/globals';
import request from 'supertest';

import { TelegramWebhookController } from '../../../../packages/telegram/src/telegram-webhook.controller.js';

describe('Telegram webhook security (e2e)', () => {
  let app: INestApplication | undefined;
  const handleUpdate = jest.fn<(update: unknown) => Promise<void>>().mockResolvedValue(undefined);
  const secret = 'fictional-webhook-secret-value-123456789';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TelegramWebhookController],
      providers: [
        { provide: GrammyBotAdapter, useValue: { handleUpdate } },
        {
          provide: AppConfigService,
          useValue: { telegram: { mode: 'webhook', webhookSecret: secret } },
        },
        {
          provide: FeatureFlagService,
          useValue: { isEnabled: (flag: FeatureFlag): boolean => flag === FeatureFlag.TELEGRAM },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => app?.close());

  it('accepts an exact Telegram secret and rejects invalid or missing secrets', async () => {
    const server = requiredApp().getHttpServer() as Parameters<typeof request>[0];
    await request(server)
      .post('/telegram/webhook')
      .set('x-telegram-bot-api-secret-token', secret)
      .send({ update_id: 1 })
      .expect(204);
    await request(server)
      .post('/telegram/webhook')
      .set('x-telegram-bot-api-secret-token', 'wrong-secret')
      .send({ update_id: 2 })
      .expect(403);
    await request(server).post('/telegram/webhook').send({ update_id: 3 }).expect(403);
    expect(handleUpdate).toHaveBeenCalledTimes(1);
  });

  function requiredApp(): INestApplication {
    if (app === undefined) throw new Error('Test application unavailable');
    return app;
  }
});
