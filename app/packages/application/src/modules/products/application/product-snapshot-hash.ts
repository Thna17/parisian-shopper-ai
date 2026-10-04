import { createHash } from 'node:crypto';

import {
  normalizedProductEnvelopeSchema,
  type NormalizedProductEnvelope,
} from '../domain/product.schema.js';

export function calculateProductSnapshotHash(input: NormalizedProductEnvelope): string {
  const product = normalizedProductEnvelopeSchema.parse(input);
  const factualPayload = {
    lifecycle_status: product.lifecycle_status,
    product: product.product,
  };
  return createHash('sha256').update(canonicalJson(factualPayload), 'utf8').digest('hex');
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}
