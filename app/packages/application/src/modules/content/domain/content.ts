import { z } from 'zod';

export const contentTypeSchema = z.enum([
  'PRODUCT_SPOTLIGHT',
  'PROMOTION',
  'SCENT_PYRAMID',
  'EDUCATIONAL',
  'ENGAGEMENT',
]);
export const contentLanguageSchema = z.enum(['KM', 'EN', 'BILINGUAL']);
export const contentPlatformSchema = z.enum(['FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'GENERIC']);
export const contentJobStatusSchema = z.enum(['REQUESTED', 'GENERATING', 'DRAFT', 'FAILED']);

export type ContentType = z.infer<typeof contentTypeSchema>;
export type ContentLanguage = z.infer<typeof contentLanguageSchema>;
export type ContentPlatform = z.infer<typeof contentPlatformSchema>;
export type ContentJobStatus = z.infer<typeof contentJobStatusSchema>;

const transitions: Readonly<Record<ContentJobStatus, readonly ContentJobStatus[]>> = {
  REQUESTED: ['GENERATING'],
  GENERATING: ['DRAFT', 'FAILED'],
  FAILED: ['GENERATING'],
  DRAFT: [],
};

export function assertContentJobTransition(from: ContentJobStatus, to: ContentJobStatus): void {
  if (!transitions[from].includes(to)) {
    throw new Error(`Invalid content job transition: ${from} -> ${to}`);
  }
}
