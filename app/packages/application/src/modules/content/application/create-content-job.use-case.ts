import { Inject, Injectable } from '@nestjs/common';

import {
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
  type ContentJob,
  type CreateContentJobInput,
} from './content-generation.repository.js';

@Injectable()
export class CreateContentJobUseCase {
  public constructor(
    @Inject(CONTENT_GENERATION_REPOSITORY)
    private readonly repository: ContentGenerationRepository,
  ) {}

  public execute(input: CreateContentJobInput): Promise<ContentJob> {
    return this.repository.createJob(input);
  }
}
