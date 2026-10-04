import { ValidationError } from '@parisian-shopper/common';
import { z } from 'zod';

import { skuValueSchema } from './product.schema.js';

const searchQuerySchema = z
  .string()
  .trim()
  .min(2, 'Search query must contain at least 2 characters')
  .max(120, 'Search query must not exceed 120 characters');

const searchLimitSchema = z.number().int().min(1).max(50).default(20);

export interface GetProductBySkuInput {
  sku: string;
}

export interface SearchProductsInput {
  query: string;
  limit?: number;
}

export function parseSku(value: string): string {
  return parseOrThrow(skuValueSchema, value, 'Invalid SKU');
}

export function parseSearchInput(input: SearchProductsInput): { query: string; limit: number } {
  const result = z
    .object({ query: searchQuerySchema, limit: searchLimitSchema })
    .strict()
    .safeParse(input);
  if (!result.success) {
    throw validationError('Invalid product search', result.error);
  }
  return result.data;
}

function parseOrThrow(schema: z.ZodType<string>, value: string, message: string): string {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw validationError(message, result.error);
  }
  return result.data;
}

function validationError(message: string, error: z.ZodError): ValidationError {
  return new ValidationError({
    publicMessage: message,
    details: {
      issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    },
  });
}
