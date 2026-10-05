export const QueueName = Object.freeze({
  CONTENT_GENERATION: 'content-generation',
} as const);

export type QueueName = (typeof QueueName)[keyof typeof QueueName];

export const ContentGenerationJobName = Object.freeze({
  GENERATE_CONTENT: 'GENERATE_CONTENT',
} as const);
