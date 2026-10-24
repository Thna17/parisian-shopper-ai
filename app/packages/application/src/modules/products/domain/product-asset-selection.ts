import {
  ProductAssetApprovalDecision,
  type ProductAssetRegistration,
} from './product-asset.js';

export interface RegistrationWithApprovalDecision {
  readonly registration: ProductAssetRegistration;
  readonly latestDecision: ProductAssetApprovalDecision;
}

/**
 * Canonically selects the single active HERO_CUTOUT candidate from a
 * list of registrations for a SKU.
 *
 * Rules:
 * 1. RETIRED registrations are permanently inactive and can never be selected or reactivated.
 * 2. If an APPROVED (non-retired) registration exists, it is the sole active candidate.
 *    (Pending replacements in SUBMITTED state do not disable the currently approved asset).
 * 3. If multiple approved registrations exist (e.g. during migration), the newest by sequence/registeredAt is selected.
 * 4. If no registration is APPROVED, the latest un-retired registration (e.g. SUBMITTED or REJECTED) is
 *    selected as the candidate so the caller can report its exact unapproved status.
 * 5. If all registrations are RETIRED, returns null.
 */
export function selectActiveHeroCutoutCandidate<
  T extends { registration: ProductAssetRegistration; latestDecision: ProductAssetApprovalDecision },
>(items: readonly T[]): T | null {
  if (!items || items.length === 0) {
    return null;
  }

  // Sort descending by sequence if available, then by registeredAt descending
  const sorted = [...items].sort((a, b) => {
    if (a.registration.sequence !== undefined && b.registration.sequence !== undefined) {
      if (b.registration.sequence > a.registration.sequence) return 1;
      if (b.registration.sequence < a.registration.sequence) return -1;
    }
    return b.registration.registeredAt.getTime() - a.registration.registeredAt.getTime();
  });

  const nonRetired = sorted.filter(
    (item) => item.latestDecision !== ProductAssetApprovalDecision.RETIRED,
  );

  if (nonRetired.length === 0) {
    return null;
  }

  // Pick the newest APPROVED candidate
  const approved = nonRetired.find(
    (item) => item.latestDecision === ProductAssetApprovalDecision.APPROVED,
  );
  if (approved) {
    return approved;
  }

  // No approved registration exists. Return the latest un-retired candidate (e.g. SUBMITTED or REJECTED)
  return nonRetired[0] ?? null;
}
