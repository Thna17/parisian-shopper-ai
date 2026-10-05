export const CONTENT_GENERATION_ENQUEUER = Symbol('CONTENT_GENERATION_ENQUEUER');

export interface ContentGenerationEnqueuer {
  enqueue(contentJobId: string): Promise<void>;
}
