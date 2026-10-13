export const QueueName = Object.freeze({
  CONTENT_GENERATION: 'content-generation',
  CONTENT_VALIDATION: 'content-validation',
  CREATIVE_GENERATION: 'creative-generation',
} as const);

export type QueueName = (typeof QueueName)[keyof typeof QueueName];

export const ContentGenerationJobName = Object.freeze({
  GENERATE_CONTENT: 'GENERATE_CONTENT',
} as const);

export const ContentValidationJobName = Object.freeze({
  VALIDATE_CONTENT_VERSION: 'VALIDATE_CONTENT_VERSION',
} as const);

export const CreativeGenerationJobName = Object.freeze({
  GENERATE_CREATIVE: 'GENERATE_CREATIVE',
} as const);

