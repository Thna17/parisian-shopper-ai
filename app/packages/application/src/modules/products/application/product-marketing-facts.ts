import { hasApprovedCurrentPromotion } from '../domain/promotion-eligibility.js';
import type { ProductSnapshot } from './product-snapshot.repository.js';
/** Preserve stored facts; omit offers that cannot currently be used as marketing evidence. */
export function marketingSafeSnapshot(
  snapshot: ProductSnapshot,
  now: Date = new Date(),
): ProductSnapshot {
  const value = structuredClone(snapshot),
    p = value.product.product;
  if (!hasApprovedCurrentPromotion(p, now)) {
    delete p.discount;
    delete p.promo_price;
  }
  return value;
}
