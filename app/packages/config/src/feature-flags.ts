import { Injectable } from '@nestjs/common';

import { AppConfigService } from './app-config.service.js';

export const FeatureFlag = {
  AI_TEXT_GENERATION: 'AI_TEXT_GENERATION',
  AI_IMAGE_GENERATION: 'AI_IMAGE_GENERATION',
  TELEGRAM: 'TELEGRAM',
  PRODUCT_API: 'PRODUCT_API',
  AUTO_PUBLISHING: 'AUTO_PUBLISHING',
  META_PUBLISHING: 'META_PUBLISHING',
  ANALYTICS: 'ANALYTICS',
} as const;

export type FeatureFlag = (typeof FeatureFlag)[keyof typeof FeatureFlag];

@Injectable()
export class FeatureFlagService {
  public constructor(private readonly config: AppConfigService) {}

  public isEnabled(flag: FeatureFlag): boolean {
    return this.config.featureFlags[flag];
  }

  public snapshot(): Readonly<Record<FeatureFlag, boolean>> {
    return Object.freeze({ ...this.config.featureFlags });
  }
}
