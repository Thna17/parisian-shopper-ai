import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { type TelegramAction } from '../domain/telegram.js';
import {
  TELEGRAM_WORKFLOW_REPOSITORY,
  type StoreActionTokenInput,
  type TelegramWorkflowRepository,
} from './telegram-workflow.repository.js';

export interface CreateTelegramActionInput {
  action: TelegramAction;
  resourceId: string;
  metadata?: Readonly<Record<string, unknown>>;
  singleUse?: boolean;
}

@Injectable()
export class TelegramActionTokenService {
  public constructor(
    @Inject(TELEGRAM_WORKFLOW_REPOSITORY) private readonly repository: TelegramWorkflowRepository,
  ) {}

  public async create(
    telegramIdentityId: string,
    actions: readonly CreateTelegramActionInput[],
    expiresAt: Date,
  ): Promise<readonly string[]> {
    const values = actions.map(() => randomBytes(18).toString('base64url'));
    const records: StoreActionTokenInput[] = actions.map((action, index) => ({
      tokenHash: hashTelegramActionToken(required(values[index])),
      telegramIdentityId,
      action: action.action,
      resourceId: action.resourceId,
      singleUse: action.singleUse ?? true,
      expiresAt,
      ...(action.metadata === undefined ? {} : { metadata: action.metadata }),
    }));
    await this.repository.storeActionTokens(records);
    return values;
  }
}

export function hashTelegramActionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function required(value: string | undefined): string {
  if (value === undefined) throw new Error('Action token generation failed');
  return value;
}
