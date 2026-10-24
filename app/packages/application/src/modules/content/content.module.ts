import { Module } from '@nestjs/common';

import { AIContextBuilder } from '../ai/application/ai-context-builder.js';
import { ContentStrategyRegistry } from './domain/content-strategy.js';
import { CreateContentJobUseCase } from './application/create-content-job.use-case.js';
import { GenerateContentUseCase } from './application/generate-content.use-case.js';
import { ReviseContentUseCase } from './application/revise-content.use-case.js';

import { AuthModule } from '../auth/auth.module.js';
import { ValidationModule } from '../validation/validation.module.js';

@Module({
  imports: [ValidationModule, AuthModule],
  providers: [
    AIContextBuilder,
    ContentStrategyRegistry,
    CreateContentJobUseCase,
    GenerateContentUseCase,
    ReviseContentUseCase,
  ],
  exports: [CreateContentJobUseCase, GenerateContentUseCase, ReviseContentUseCase],
})
export class ContentModule {}
