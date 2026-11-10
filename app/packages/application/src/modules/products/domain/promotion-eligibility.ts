import type { NormalizedProduct } from './product.schema.js';
export function hasApprovedCurrentPromotion(p: NormalizedProduct, now: Date): boolean {
  const d = p.discount,
    t = now.getTime();
  return Boolean(
    d?.approval &&
    d.approval.status === 'approved' &&
    p.promo_price !== undefined &&
    d.type !== 'none' &&
    Number(d.value) > 0 &&
    Number(p.promo_price) < Number(p.price) &&
    Date.parse(d.approval.approved_at) <= t &&
    d.starts_at &&
    d.ends_at &&
    Date.parse(d.starts_at) <= t &&
    Date.parse(d.ends_at) > t,
  );
}
