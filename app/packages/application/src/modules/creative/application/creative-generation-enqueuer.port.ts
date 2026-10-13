export const CREATIVE_GENERATION_ENQUEUER = Symbol('CREATIVE_GENERATION_ENQUEUER');

export interface CreativeGenerationJobInput {
  readonly contentVersionId: string;
  readonly requestedBy: string;
  readonly format?: 'FEED_SQUARE' | 'STORY_VERTICAL';
  readonly stylePreset?: string;
  readonly creativeJobId?: string;
}

export interface CreativeGenerationEnqueuer {
  enqueue(data: CreativeGenerationJobInput): Promise<void>;
}
