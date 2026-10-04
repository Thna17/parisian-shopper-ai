import { z } from 'zod';

import { ProductSourceResponseInvalidError } from '../domain/product-errors.js';
import {
  normalizedProductEnvelopeSchema,
  type NormalizedProductEnvelope,
} from '../domain/product.schema.js';

export function normalizeExternalProduct<Raw>(options: {
  raw: unknown;
  rawSchema: z.ZodType<Raw>;
  map: (raw: Raw) => unknown;
}): NormalizedProductEnvelope {
  try {
    const raw = options.rawSchema.parse(options.raw);
    return normalizedProductEnvelopeSchema.parse(options.map(raw));
  } catch (error: unknown) {
    throw new ProductSourceResponseInvalidError(error);
  }
}
