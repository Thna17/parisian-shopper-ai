import { Module } from '@nestjs/common';

import { AIContextBuilder } from '../ai/application/ai-context-builder.js';
import { ContentStrategyRegistry } from './domain/content-strategy.js';
import { CreateContentJobUseCase } from './application/create-content-job.use-case.js';
import { GenerateContentUseCase } from './application/generate-content.use-case.js';
import { ReviseContentUseCase } from './application/revise-content.use-case.js';
import { SubmitContentForReviewUseCase } from './application/submit-content-for-review.use-case.js';
import { ListContentJobsUseCase } from './application/list-content-jobs.use-case.js';
import { GetContentJobDetailUseCase } from './application/get-content-job-detail.use-case.js';

import { AuthModule } from '../auth/auth.module.js';
import { ValidationModule } from '../validation/validation.module.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';

@Module({
  imports: [ValidationModule, AuthModule, AnalyticsModule],
  providers: [
    AIContextBuilder,
    ContentStrategyRegistry,
    CreateContentJobUseCase,
    GenerateContentUseCase,
    ReviseContentUseCase,
    SubmitContentForReviewUseCase,
    ListContentJobsUseCase,
    GetContentJobDetailUseCase,
  ],
  exports: [
    CreateContentJobUseCase,
    GenerateContentUseCase,
    ReviseContentUseCase,
    SubmitContentForReviewUseCase,
    ListContentJobsUseCase,
    GetContentJobDetailUseCase,
  ],
})
export class ContentModule {}
