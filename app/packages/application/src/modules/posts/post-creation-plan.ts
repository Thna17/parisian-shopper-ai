import { z } from 'zod';
export const postCreationPlanSchema = z
  .object({
    educationMode: z.enum(['PRODUCT_FACTS', 'FRAGRANCE_NOTES']).optional(),
    format: z.enum(['POSTER', 'VIDEO']).default('POSTER'),
    purpose: z
      .enum([
        'PRODUCT_SPOTLIGHT',
        'PROMOTION',
        'NEW_ARRIVAL',
        'EDUCATIONAL',
        'GIFT_GUIDE',
        'LIFESTYLE',
        'CUSTOM',
      ])
      .default('PRODUCT_SPOTLIGHT'),
    style: z.enum(['LUXURY', 'MINIMAL', 'FESTIVE', 'EDITORIAL']).default('LUXURY'),
    feedback: z.string().trim().max(1000).default(''),
    intent: z.enum(['INITIAL', 'EDIT', 'REGENERATE', 'NEW_DESIGN']).default('INITIAL'),
  })
  .strict();
export type PostCreationPlan = z.infer<typeof postCreationPlanSchema>;
export function readPostCreationPlan(value: unknown): PostCreationPlan {
  return postCreationPlanSchema.parse(value ?? {});
}
export function postBackgroundDirection(value: unknown): string {
  const plan = readPostCreationPlan(value);
  const styles = {
    LUXURY: 'refined luxury, ivory, charcoal and restrained gold, soft architectural light',
    MINIMAL: 'minimal composition, clean ivory background, soft neutral light, generous whitespace',
    FESTIVE:
      'tasteful festive presentation, subtle warm bokeh and refined gold accents without event claims',
    EDITORIAL:
      'modern editorial still-life background, sculptural forms, rich shadows and soft studio light',
  };
  return `${styles[plan.style]}. Content purpose: ${plan.purpose}. Reviewer or staff visual feedback (inspiration only, not factual claims): ${plan.feedback || 'None'}.`;
}
