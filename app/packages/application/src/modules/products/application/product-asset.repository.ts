import {
  type ProductAsset,
  type ProductAssetApprovalEvent,
  type ProductAssetRegistration,
  type ProductAssetRightsEvent,
  type ProductAssetRole,
  type ProductAssetTransform,
  type ProductAssetValidationAssessment,
} from '../domain/product-asset.js';

export const PRODUCT_ASSET_REPOSITORY = Symbol('PRODUCT_ASSET_REPOSITORY');

export interface ProductAssetRepository {
  /**
   * Saves an immutable ProductAsset record using concurrency-safe insert-or-read.
   * On SHA-256 conflict, loads the existing record and verifies that immutable metadata
   * (byteSize, width, height, format, mimeType) agrees. If conflicting, fails closed.
   */
  saveAsset(asset: ProductAsset): Promise<ProductAsset>;

  /**
   * Finds an asset by its primary UUID.
   */
  findAssetById(id: string): Promise<ProductAsset | null>;

  /**
   * Finds an asset by its content SHA-256 digest.
   */
  findAssetBySha256(sha256: string): Promise<ProductAsset | null>;

  /**
   * Saves an append-only ProductAssetRegistration record.
   */
  saveRegistration(registration: ProductAssetRegistration): Promise<ProductAssetRegistration>;

  /**
   * Finds a registration by its primary UUID.
   */
  findRegistrationById(id: string): Promise<ProductAssetRegistration | null>;

  /**
   * Finds all registrations for a given SKU, ordered by sequence descending.
   */
  findRegistrationsBySku(sku: string): Promise<readonly ProductAssetRegistration[]>;

  /**
   * Finds all HERO_CUTOUT registrations for a SKU, ordered by sequence descending.
   */
  findAllHeroCutoutRegistrations(sku: string): Promise<readonly ProductAssetRegistration[]>;

  /**
   * Finds the latest approved HERO_CUTOUT registration for a given SKU.
   */
  findApprovedHeroCutoutBySku(sku: string): Promise<ProductAssetRegistration | null>;

  /**
   * Finds registrations for a SKU filtered by role, ordered by sequence descending.
   */
  findRegistrationsBySkuAndRole(
    sku: string,
    role: ProductAssetRole,
  ): Promise<readonly ProductAssetRegistration[]>;

  /**
   * Finds registration that replaced a specific registration ID.
   */
  findRegistrationByReplacedId(
    replacesRegistrationId: string,
  ): Promise<ProductAssetRegistration | null>;

  /**
   * Saves an append-only ProductAssetValidationAssessment record.
   */
  saveValidationAssessment(
    assessment: ProductAssetValidationAssessment,
  ): Promise<ProductAssetValidationAssessment>;

  /**
   * Finds the latest validation assessment for an asset, ordered by sequence descending.
   */
  findLatestValidationAssessment(
    productAssetId: string,
  ): Promise<ProductAssetValidationAssessment | null>;

  /**
   * Saves an append-only ProductAssetApprovalEvent record.
   */
  saveApprovalEvent(event: ProductAssetApprovalEvent): Promise<ProductAssetApprovalEvent>;

  /**
   * Finds all approval events for a given registration, ordered by sequence descending.
   */
  findApprovalEventsByRegistration(
    registrationId: string,
  ): Promise<readonly ProductAssetApprovalEvent[]>;

  /**
   * Finds the latest approval event for a given registration.
   */
  findLatestApprovalEvent(
    registrationId: string,
  ): Promise<ProductAssetApprovalEvent | null>;

  /**
   * Saves an append-only ProductAssetRightsEvent record.
   */
  saveRightsEvent(event: ProductAssetRightsEvent): Promise<ProductAssetRightsEvent>;

  /**
   * Finds all rights events for a registration, ordered by sequence descending.
   */
  findRightsEventsByRegistration(
    registrationId: string,
  ): Promise<readonly ProductAssetRightsEvent[]>;

  /**
   * Finds the latest rights event for a registration.
   */
  findLatestRightsEvent(
    registrationId: string,
  ): Promise<ProductAssetRightsEvent | null>;

  /**
   * Saves an append-only ProductAssetTransform record.
   */
  saveTransform(transform: ProductAssetTransform): Promise<ProductAssetTransform>;

  /**
   * Finds transforms leading to a derived asset.
   */
  findTransformsByDerivedAsset(derivedAssetId: string): Promise<readonly ProductAssetTransform[]>;
}
