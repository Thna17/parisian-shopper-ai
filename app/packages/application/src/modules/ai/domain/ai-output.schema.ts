import { z } from 'zod';

const boundedText = z.string().trim().min(1).max(10_000);

export const aiContentOutputSchema = z
  .object({
    headline: z.string().trim().min(1).max(300),
    khmer_caption: boundedText.nullable(),
    english_caption: boundedText.nullable(),
    cta: z.string().trim().min(1).max(500),
    hashtags: z
      .array(
        z
          .string()
          .trim()
          .regex(/^#[^\s#]+$/u),
      )
      .max(30),
    creative_brief: z.string().trim().min(1).max(5_000),
    facts_used: z.array(z.string().trim().min(1).max(500)).max(100),
    warnings: z.array(z.string().trim().min(1).max(1_000)).max(50),
    missing_information: z.array(z.string().trim().min(1).max(500)).max(50),
  })
  .strict();

export type AIContentOutput = Readonly<z.infer<typeof aiContentOutputSchema>>;

export function validateOutputForLanguage(
  value: unknown,
  language: 'KM' | 'EN' | 'BILINGUAL',
): AIContentOutput {
  const output = aiContentOutputSchema.parse(value);
  if (language !== 'EN' && output.khmer_caption === null) {
    throw new Error('Khmer caption is required for the selected language');
  }
  if (language !== 'KM' && output.english_caption === null) {
    throw new Error('English caption is required for the selected language');
  }
  return output;
}
