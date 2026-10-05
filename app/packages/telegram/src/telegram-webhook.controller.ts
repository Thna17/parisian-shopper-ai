import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { ApiExcludeEndpoint } from '@nestjs/swagger';

import { AppConfigService, FeatureFlag, FeatureFlagService } from '@parisian-shopper/config';

import { GrammyBotAdapter } from './grammy-bot.adapter.js';

@Controller({ path: 'telegram', version: VERSION_NEUTRAL })
export class TelegramWebhookController {
  public constructor(
    private readonly adapter: GrammyBotAdapter,
    private readonly config: AppConfigService,
    private readonly flags: FeatureFlagService,
  ) {}

  @Post('webhook')
  @ApiExcludeEndpoint()
  @HttpCode(HttpStatus.NO_CONTENT)
  public async receive(
    @Headers('x-telegram-bot-api-secret-token') suppliedSecret: string | undefined,
    @Body() update: unknown,
  ): Promise<void> {
    if (!this.flags.isEnabled(FeatureFlag.TELEGRAM) || this.config.telegram.mode !== 'webhook') {
      throw new ServiceUnavailableException('Telegram webhook is disabled');
    }
    const expected = this.config.telegram.webhookSecret;
    if (expected === undefined || !secretsEqual(suppliedSecret, expected)) {
      throw new ForbiddenException('Invalid Telegram webhook secret');
    }
    await this.adapter.handleUpdate(update);
  }
}

export function secretsEqual(actual: string | undefined, expected: string): boolean {
  if (actual === undefined) return false;
  const actualBuffer = Buffer.from(actual, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
