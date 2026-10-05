import { Module } from '@nestjs/common';

import { AIContextBuilder } from '../ai/application/ai-context-builder.js';
import { ContentStrategyRegistry } from './domain/content-strategy.js';
import { CreateContentJobUseCase } from './application/create-content-job.use-case.js';
import { GenerateContentUseCase } from './application/generate-content.use-case.js';

@Module({
  providers: [
    AIContextBuilder,
    ContentStrategyRegistry,
    CreateContentJobUseCase,
    GenerateContentUseCase,
  ],
  exports: [CreateContentJobUseCase, GenerateContentUseCase],
})
export class ContentModule {}
