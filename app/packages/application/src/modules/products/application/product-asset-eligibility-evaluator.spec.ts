import { createHash } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import { FakeClock } from '@parisian-shopper/common';
import { ProductAssetEligibilityEvaluator } from './product-asset-eligibility-evaluator.js';
import {
  type ProductAsset,
  ProductAssetApprovalDecision,
  type ProductAssetApprovalEvent,
  type ProductAssetRegistration,
  type ProductAssetRightsEvent,
  ProductAssetRightsState,
  ProductAssetRole,
  type ProductAssetTransform,
  type ProductAssetValidationAssessment,
  ProductAssetValidationStatus,
} from '../domain/product-asset.js';
import { selectActiveHeroCutoutCandidate } from '../domain/product-asset-selection.js';
import {
  ProductAssetInvalidValidatorVersionError,
  ProductAssetOpaqueHeroError,
  ProductAssetPlaceholderRejectedError,
  ProductAssetRightsUnverifiedError,
  ProductAssetUnapprovedError,
} from '../domain/product-asset-errors.js';
import { type ProductAssetRepository } from './product-asset.repository.js';
import {
  type ProductAssetStoragePort,
  type StoredProductAssetInfo,
} from './product-asset-storage.port.js';
import {
  CURRENT_VALIDATOR_VERSION,
  ProductAssetValidator,
} from '../../creative/domain/services/product-asset-validator.js';
import {
  generateOpaqueProductPng,
  generateTransparentProductPng_TEST_ONLY,
} from '../../creative/infrastructure/fixtures/fake-product-fixtures.js';

class InMemoryProductAssetRepository implements ProductAssetRepository {
  public assets = new Map<string, ProductAsset>();
  public registrations = new Map<string, ProductAssetRegistration>();
  public assessments = new Map<string, ProductAssetValidationAssessment>();
  public approvalEvents = new Map<string, ProductAssetApprovalEvent[]>();
  public rightsEvents = new Map<string, ProductAssetRightsEvent[]>();
  public transforms = new Map<string, ProductAssetTransform[]>();

  public saveAsset(asset: ProductAsset): Promise<ProductAsset> {
    this.assets.set(asset.id, asset);
    return Promise.resolve(asset);
  }

  public findAssetById(id: string): Promise<ProductAsset | null> {
    return Promise.resolve(this.assets.get(id) ?? null);
  }

  public findAssetBySha256(sha256: string): Promise<ProductAsset | null> {
    for (const a of this.assets.values()) {
      if (a.sha256 === sha256) return Promise.resolve(a);
    }
    return Promise.resolve(null);
  }

  public saveRegistration(
    registration: ProductAssetRegistration,
  ): Promise<ProductAssetRegistration> {
    this.registrations.set(registration.id, registration);
    return Promise.resolve(registration);
  }

  public findRegistrationById(id: string): Promise<ProductAssetRegistration | null> {
    return Promise.resolve(this.registrations.get(id) ?? null);
  }

  public findRegistrationsBySku(sku: string): Promise<readonly ProductAssetRegistration[]> {
    return Promise.resolve(
      Array.from(this.registrations.values())
        .filter((r) => r.sku === sku)
        .sort((a, b) => b.registeredAt.getTime() - a.registeredAt.getTime()),
    );
  }

  public findAllHeroCutoutRegistrations(sku: string): Promise<readonly ProductAssetRegistration[]> {
    return Promise.resolve(
      Array.from(this.registrations.values())
        .filter((r) => r.sku === sku && r.role === ProductAssetRole.HERO_CUTOUT)
        .sort((a, b) => b.registeredAt.getTime() - a.registeredAt.getTime()),
    );
  }

  public findRegistrationsBySkuAndRole(
    sku: string,
    role: ProductAssetRole,
  ): Promise<readonly ProductAssetRegistration[]> {
    return Promise.resolve(
      Array.from(this.registrations.values())
        .filter((r) => r.sku === sku && r.role === role)
        .sort((a, b) => b.registeredAt.getTime() - a.registeredAt.getTime()),
    );
  }

  public async findApprovedHeroCutoutBySku(sku: string): Promise<ProductAssetRegistration | null> {
    const list = await this.findRegistrationsBySkuAndRole(sku, ProductAssetRole.HERO_CUTOUT);
    const items = list.map((reg) => {
      const events = this.approvalEvents.get(reg.id) ?? [];
      const rights = this.rightsEvents.get(reg.id) ?? [];
      const latestDecision = events[0]?.decision ?? ProductAssetApprovalDecision.SUBMITTED;
      const latestRightsState = rights[0]?.rightsState ?? reg.rightsState;
      const expiresAt = rights[0]?.expiresAt ?? reg.rightsExpiresAt;
      return {
        registration: reg,
        latestDecision,
        latestRightsState,
        expiresAt,
      };
    });

    const candidate = selectActiveHeroCutoutCandidate(items);
    if (!candidate || candidate.latestDecision !== ProductAssetApprovalDecision.APPROVED) {
      return null;
    }
    if (candidate.latestRightsState !== ProductAssetRightsState.VERIFIED) {
      return null;
    }
    if (candidate.expiresAt && candidate.expiresAt <= new Date()) {
      return null;
    }
    return candidate.registration;
  }

  public findRegistrationByReplacedId(
    replacesRegistrationId: string,
  ): Promise<ProductAssetRegistration | null> {
    for (const r of this.registrations.values()) {
      if (r.replacesRegistrationId === replacesRegistrationId) return Promise.resolve(r);
    }
    return Promise.resolve(null);
  }

  public saveValidationAssessment(
    assessment: ProductAssetValidationAssessment,
  ): Promise<ProductAssetValidationAssessment> {
    this.assessments.set(assessment.productAssetId, assessment);
    return Promise.resolve(assessment);
  }

  public findLatestValidationAssessment(
    productAssetId: string,
  ): Promise<ProductAssetValidationAssessment | null> {
    return Promise.resolve(this.assessments.get(productAssetId) ?? null);
  }

  public saveApprovalEvent(event: ProductAssetApprovalEvent): Promise<ProductAssetApprovalEvent> {
    const list = this.approvalEvents.get(event.productAssetRegistrationId) ?? [];
    list.unshift(event);
    this.approvalEvents.set(event.productAssetRegistrationId, list);
    return Promise.resolve(event);
  }

  public findApprovalEventsByRegistration(
    registrationId: string,
  ): Promise<readonly ProductAssetApprovalEvent[]> {
    return Promise.resolve(this.approvalEvents.get(registrationId) ?? []);
  }

  public findLatestApprovalEvent(
    registrationId: string,
  ): Promise<ProductAssetApprovalEvent | null> {
    const list = this.approvalEvents.get(registrationId) ?? [];
    return Promise.resolve(list[0] ?? null);
  }

  public saveRightsEvent(event: ProductAssetRightsEvent): Promise<ProductAssetRightsEvent> {
    const list = this.rightsEvents.get(event.productAssetRegistrationId) ?? [];
    list.unshift(event);
    this.rightsEvents.set(event.productAssetRegistrationId, list);
    return Promise.resolve(event);
  }

  public findRightsEventsByRegistration(
    registrationId: string,
  ): Promise<readonly ProductAssetRightsEvent[]> {
    return Promise.resolve(this.rightsEvents.get(registrationId) ?? []);
  }

  public findLatestRightsEvent(registrationId: string): Promise<ProductAssetRightsEvent | null> {
    const list = this.rightsEvents.get(registrationId) ?? [];
    return Promise.resolve(list[0] ?? null);
  }

  public saveTransform(transform: ProductAssetTransform): Promise<ProductAssetTransform> {
    const list = this.transforms.get(transform.derivedAssetId) ?? [];
    list.push(transform);
    this.transforms.set(transform.derivedAssetId, list);
    return Promise.resolve(transform);
  }

  public findTransformsByDerivedAsset(
    derivedAssetId: string,
  ): Promise<readonly ProductAssetTransform[]> {
    return Promise.resolve(this.transforms.get(derivedAssetId) ?? []);
  }
}

class InMemoryProductAssetStorage implements ProductAssetStoragePort {
  public buffers = new Map<string, Buffer>();

  public deriveStorageKey(sha256: string, extension: string): string {
    return `cas/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}.${extension}`;
  }

  public saveAsset(
    buffer: Buffer,
    mimeType: string,
    extension = 'png',
  ): Promise<StoredProductAssetInfo> {
    const sha256 = createHash('sha256').update(buffer).digest('hex').toLowerCase();
    const storageKey = this.deriveStorageKey(sha256, extension);
    this.buffers.set(storageKey, buffer);
    return Promise.resolve({
      storageKey,
      sha256,
      mimeType,
      byteSize: buffer.length,
    });
  }

  public getAssetBuffer(storageKey: string): Promise<Buffer | null> {
    return Promise.resolve(this.buffers.get(storageKey) ?? null);
  }

  public assetExists(storageKey: string): Promise<boolean> {
    return Promise.resolve(this.buffers.has(storageKey));
  }
}

describe('ProductAssetEligibilityEvaluator', () => {
  const clock = new FakeClock(new Date('2026-10-19T10:00:00.000Z'));
  const validator = new ProductAssetValidator();

  const validTransparentBuffer = generateTransparentProductPng_TEST_ONLY({
    width: 500,
    height: 500,
    productWidth: 250,
    productHeight: 350,
    productColor: { r: 50, g: 100, b: 150, a: 255 },
  });

  const opaqueBuffer = generateOpaqueProductPng(500, 500);

  it('rejects an empty or unknown SKU', async () => {
    const repo = new InMemoryProductAssetRepository();
    const storage = new InMemoryProductAssetStorage();
    const evaluator = new ProductAssetEligibilityEvaluator(repo, storage, validator, clock);

    const emptyResult = await evaluator.evaluateHeroEligibility('');
    expect(emptyResult.isEligible).toBe(false);
    expect(emptyResult.reasonCode).toBe('SKU_EMPTY');

    const unknownResult = await evaluator.evaluateHeroEligibility('UNKNOWN-SKU');
    expect(unknownResult.isEligible).toBe(false);
    expect(unknownResult.reasonCode).toBe('NO_HERO_ASSET_REGISTERED');
  });

  it('rejects an asset with UNKNOWN or non-verified rights state', async () => {
    const repo = new InMemoryProductAssetRepository();
    const storage = new InMemoryProductAssetStorage();
    const evaluator = new ProductAssetEligibilityEvaluator(repo, storage, validator, clock);

    const stored = await storage.saveAsset(validTransparentBuffer, 'image/png');

    const asset: ProductAsset = {
      id: 'asset-unverified',
      sha256: stored.sha256,
      storageKey: stored.storageKey,
      mimeType: 'image/png',
      format: 'png',
      byteSize: validTransparentBuffer.length,
      width: 500,
      height: 500,
      pixelCount: 250000,
      channels: 4,
      hasAlpha: true,
      transparencyRatio: 0.5,
      createdAt: clock.now(),
    };
    await repo.saveAsset(asset);

    const reg: ProductAssetRegistration = {
      id: 'reg-unverified',
      productAssetId: 'asset-unverified',
      sku: 'PARIS-UNVERIFIED-01',
      role: ProductAssetRole.HERO_CUTOUT,
      sourceSystem: 'TEST',
      rightsState: ProductAssetRightsState.UNKNOWN,
      registeredAt: clock.now(),
    };
    await repo.saveRegistration(reg);

    const appEvent: ProductAssetApprovalEvent = {
      id: 'app-unverified',
      productAssetRegistrationId: 'reg-unverified',
      decision: ProductAssetApprovalDecision.APPROVED,
      decidedAt: clock.now(),
    };
    await repo.saveApprovalEvent(appEvent);

    const result = await evaluator.evaluateHeroEligibility('PARIS-UNVERIFIED-01');
    expect(result.isEligible).toBe(false);
    expect(result.reasonCode).toBe('RIGHTS_NOT_VERIFIED');

    await expect(evaluator.assertHeroEligible('PARIS-UNVERIFIED-01')).rejects.toThrow(
      ProductAssetRightsUnverifiedError,
    );
  });

  it('rejects an asset whose rights have expired', async () => {
    const repo = new InMemoryProductAssetRepository();
    const storage = new InMemoryProductAssetStorage();
    const evaluator = new ProductAssetEligibilityEvaluator(repo, storage, validator, clock);

    const stored = await storage.saveAsset(validTransparentBuffer, 'image/png');

    const asset: ProductAsset = {
      id: 'asset-expired',
      sha256: stored.sha256,
      storageKey: stored.storageKey,
      mimeType: 'image/png',
      format: 'png',
      byteSize: validTransparentBuffer.length,
      width: 500,
      height: 500,
      pixelCount: 250000,
      channels: 4,
      hasAlpha: true,
      transparencyRatio: 0.5,
      createdAt: clock.now(),
    };
    await repo.saveAsset(asset);

    const reg: ProductAssetRegistration = {
      id: 'reg-expired',
      productAssetId: 'asset-expired',
      sku: 'PARIS-EXPIRED-01',
      role: ProductAssetRole.HERO_CUTOUT,
      sourceSystem: 'TEST',
      rightsState: ProductAssetRightsState.VERIFIED,
      rightsExpiresAt: new Date('2026-01-01T00:00:00.000Z'), // Expired relative to clock
      registeredAt: clock.now(),
    };
    await repo.saveRegistration(reg);

    const appEvent: ProductAssetApprovalEvent = {
      id: 'app-expired',
      productAssetRegistrationId: 'reg-expired',
      decision: ProductAssetApprovalDecision.APPROVED,
      decidedAt: clock.now(),
    };
    await repo.saveApprovalEvent(appEvent);

    const result = await evaluator.evaluateHeroEligibility('PARIS-EXPIRED-01');
    expect(result.isEligible).toBe(false);
    expect(result.reasonCode).toBe('RIGHTS_EXPIRED');

    await expect(evaluator.assertHeroEligible('PARIS-EXPIRED-01')).rejects.toThrow(
      ProductAssetRightsUnverifiedError,
    );
  });

  it('rejects an unapproved or rejected registration', async () => {
    const repo = new InMemoryProductAssetRepository();
    const storage = new InMemoryProductAssetStorage();
    const evaluator = new ProductAssetEligibilityEvaluator(repo, storage, validator, clock);

    const stored = await storage.saveAsset(validTransparentBuffer, 'image/png');

    const asset: ProductAsset = {
      id: 'asset-unapproved',
      sha256: stored.sha256,
      storageKey: stored.storageKey,
      mimeType: 'image/png',
      format: 'png',
      byteSize: validTransparentBuffer.length,
      width: 500,
      height: 500,
      pixelCount: 250000,
      channels: 4,
      hasAlpha: true,
      transparencyRatio: 0.5,
      createdAt: clock.now(),
    };
    await repo.saveAsset(asset);

    const reg: ProductAssetRegistration = {
      id: 'reg-unapproved',
      productAssetId: 'asset-unapproved',
      sku: 'PARIS-UNAPPROVED-01',
      role: ProductAssetRole.HERO_CUTOUT,
      sourceSystem: 'TEST',
      rightsState: ProductAssetRightsState.VERIFIED,
      registeredAt: clock.now(),
    };
    await repo.saveRegistration(reg);

    // Initial SUBMITTED event only
    const appEvent: ProductAssetApprovalEvent = {
      id: 'app-submitted',
      productAssetRegistrationId: 'reg-unapproved',
      decision: ProductAssetApprovalDecision.SUBMITTED,
      decidedAt: clock.now(),
    };
    await repo.saveApprovalEvent(appEvent);

    const result = await evaluator.evaluateHeroEligibility('PARIS-UNAPPROVED-01');
    expect(result.isEligible).toBe(false);
    expect(result.reasonCode).toBe('NOT_APPROVED');

    await expect(evaluator.assertHeroEligible('PARIS-UNAPPROVED-01')).rejects.toThrow(
      ProductAssetUnapprovedError,
    );
  });

  it('rejects known placeholder images by SHA-256 fingerprint', async () => {
    const repo = new InMemoryProductAssetRepository();
    const storage = new InMemoryProductAssetStorage();
    const evaluator = new ProductAssetEligibilityEvaluator(repo, storage, validator, clock);

    const placeholderSha = '119f6d45a02aa0bb92591baaee926f322e33eb2221544f5e4cfb2187988734a3';

    const asset: ProductAsset = {
      id: 'asset-placeholder',
      sha256: placeholderSha,
      storageKey: `cas/11/9f/${placeholderSha}.png`,
      mimeType: 'image/png',
      format: 'png',
      byteSize: 1000,
      width: 600,
      height: 600,
      pixelCount: 360000,
      channels: 4,
      hasAlpha: true,
      transparencyRatio: 0.5,
      createdAt: clock.now(),
    };
    await repo.saveAsset(asset);

    const reg: ProductAssetRegistration = {
      id: 'reg-placeholder',
      productAssetId: 'asset-placeholder',
      sku: 'PARIS-PLACEHOLDER-01',
      role: ProductAssetRole.HERO_CUTOUT,
      sourceSystem: 'TEST',
      rightsState: ProductAssetRightsState.VERIFIED,
      registeredAt: clock.now(),
    };
    await repo.saveRegistration(reg);

    await repo.saveApprovalEvent({
      id: 'app-placeholder',
      productAssetRegistrationId: 'reg-placeholder',
      decision: ProductAssetApprovalDecision.APPROVED,
      decidedAt: clock.now(),
    });

    const result = await evaluator.evaluateHeroEligibility('PARIS-PLACEHOLDER-01');
    expect(result.isEligible).toBe(false);
    expect(result.reasonCode).toBe('PLACEHOLDER_REJECTED');

    await expect(evaluator.assertHeroEligible('PARIS-PLACEHOLDER-01')).rejects.toThrow(
      ProductAssetPlaceholderRejectedError,
    );
  });

  it('rejects opaque assets attempted as HERO_CUTOUT under W03-DEC-004', async () => {
    const repo = new InMemoryProductAssetRepository();
    const storage = new InMemoryProductAssetStorage();
    const evaluator = new ProductAssetEligibilityEvaluator(repo, storage, validator, clock);

    const stored = await storage.saveAsset(opaqueBuffer, 'image/png');

    const asset: ProductAsset = {
      id: 'asset-opaque',
      sha256: stored.sha256,
      storageKey: stored.storageKey,
      mimeType: 'image/png',
      format: 'png',
      byteSize: opaqueBuffer.length,
      width: 500,
      height: 500,
      pixelCount: 250000,
      channels: 3,
      hasAlpha: false,
      transparencyRatio: 0,
      createdAt: clock.now(),
    };
    await repo.saveAsset(asset);

    const reg: ProductAssetRegistration = {
      id: 'reg-opaque',
      productAssetId: 'asset-opaque',
      sku: 'PARIS-OPAQUE-01',
      role: ProductAssetRole.HERO_CUTOUT,
      sourceSystem: 'TEST',
      rightsState: ProductAssetRightsState.VERIFIED,
      registeredAt: clock.now(),
    };
    await repo.saveRegistration(reg);

    await repo.saveApprovalEvent({
      id: 'app-opaque',
      productAssetRegistrationId: 'reg-opaque',
      decision: ProductAssetApprovalDecision.APPROVED,
      decidedAt: clock.now(),
    });

    const result = await evaluator.evaluateHeroEligibility('PARIS-OPAQUE-01');
    expect(result.isEligible).toBe(false);
    expect(result.reasonCode).toBe('OPAQUE_HERO_REJECTED');

    await expect(evaluator.assertHeroEligible('PARIS-OPAQUE-01')).rejects.toThrow(
      ProductAssetOpaqueHeroError,
    );
  });

  it('rejects when stored validation assessment used stale validator version', async () => {
    const repo = new InMemoryProductAssetRepository();
    const storage = new InMemoryProductAssetStorage();
    const evaluator = new ProductAssetEligibilityEvaluator(repo, storage, validator, clock);

    const stored = await storage.saveAsset(validTransparentBuffer, 'image/png');

    const asset: ProductAsset = {
      id: 'asset-stale-val',
      sha256: stored.sha256,
      storageKey: stored.storageKey,
      mimeType: 'image/png',
      format: 'png',
      byteSize: validTransparentBuffer.length,
      width: 500,
      height: 500,
      pixelCount: 250000,
      channels: 4,
      hasAlpha: true,
      transparencyRatio: 0.5,
      createdAt: clock.now(),
    };
    await repo.saveAsset(asset);

    const reg: ProductAssetRegistration = {
      id: 'reg-stale-val',
      productAssetId: 'asset-stale-val',
      sku: 'PARIS-STALE-01',
      role: ProductAssetRole.HERO_CUTOUT,
      sourceSystem: 'TEST',
      rightsState: ProductAssetRightsState.VERIFIED,
      registeredAt: clock.now(),
    };
    await repo.saveRegistration(reg);

    await repo.saveApprovalEvent({
      id: 'app-stale',
      productAssetRegistrationId: 'reg-stale-val',
      decision: ProductAssetApprovalDecision.APPROVED,
      decidedAt: clock.now(),
    });

    // Save assessment with outdated version
    await repo.saveValidationAssessment({
      id: 'assess-stale',
      productAssetId: 'asset-stale-val',
      validatorVersion: '0.8.0-outdated',
      status: ProductAssetValidationStatus.PASS,
      isValid: true,
      format: 'png',
      hasAlpha: true,
      transparencyRatio: 0.5,
      width: 500,
      height: 500,
      byteSize: validTransparentBuffer.length,
      pixelCount: 250000,
      findings: [],
      reasonCodes: [],
      assessedAt: clock.now(),
    });

    const result = await evaluator.evaluateHeroEligibility('PARIS-STALE-01');
    expect(result.isEligible).toBe(false);
    expect(result.reasonCode).toBe('VALIDATOR_VERSION_STALE');

    await expect(evaluator.assertHeroEligible('PARIS-STALE-01')).rejects.toThrow(
      ProductAssetInvalidValidatorVersionError,
    );
  });

  describe('governed asset replacement and eligibility continuity (Objective 1)', () => {
    it('keeps predecessor A eligible and selected when replacement B is registered as SUBMITTED', async () => {
      const repo = new InMemoryProductAssetRepository();
      const storage = new InMemoryProductAssetStorage();
      const evaluator = new ProductAssetEligibilityEvaluator(repo, storage, validator, clock);

      // Asset A: approved, valid assessment, verified rights, valid CAS
      const storedA = await storage.saveAsset(validTransparentBuffer, 'image/png');
      const assetA: ProductAsset = {
        id: 'asset-a',
        sha256: storedA.sha256,
        storageKey: storedA.storageKey,
        mimeType: 'image/png',
        format: 'png',
        byteSize: validTransparentBuffer.length,
        width: 500,
        height: 500,
        pixelCount: 250000,
        channels: 4,
        hasAlpha: true,
        transparencyRatio: 0.5,
        createdAt: new Date('2026-10-18T10:00:00Z'),
      };
      await repo.saveAsset(assetA);

      const regA: ProductAssetRegistration = {
        id: 'reg-a',
        productAssetId: 'asset-a',
        sku: 'PARIS-REPLACED-SKU',
        role: ProductAssetRole.HERO_CUTOUT,
        sourceSystem: 'TEST',
        rightsState: ProductAssetRightsState.VERIFIED,
        registeredAt: new Date('2026-10-18T10:00:00Z'),
      };
      await repo.saveRegistration(regA);
      await repo.saveApprovalEvent({
        id: 'app-a',
        productAssetRegistrationId: 'reg-a',
        decision: ProductAssetApprovalDecision.APPROVED,
        decidedAt: new Date('2026-10-18T10:05:00Z'),
      });
      await repo.saveValidationAssessment({
        id: 'assess-a',
        productAssetId: 'asset-a',
        validatorVersion: CURRENT_VALIDATOR_VERSION,
        status: ProductAssetValidationStatus.PASS,
        isValid: true,
        format: 'png',
        hasAlpha: true,
        transparencyRatio: 0.5,
        width: 500,
        height: 500,
        byteSize: validTransparentBuffer.length,
        pixelCount: 250000,
        findings: [],
        reasonCodes: [],
        assessedAt: new Date('2026-10-18T10:05:00Z'),
      });

      // Asset B: newer registration replacing reg-a, currently SUBMITTED
      const assetB: ProductAsset = {
        id: 'asset-b',
        sha256: 'b'.repeat(64),
        storageKey: 'cas/bb/bb/bbb.png',
        mimeType: 'image/png',
        format: 'png',
        byteSize: validTransparentBuffer.length,
        width: 500,
        height: 500,
        pixelCount: 250000,
        channels: 4,
        hasAlpha: true,
        transparencyRatio: 0.5,
        createdAt: new Date('2026-10-19T10:00:00Z'),
      };
      await repo.saveAsset(assetB);

      const regB: ProductAssetRegistration = {
        id: 'reg-b',
        productAssetId: 'asset-b',
        sku: 'PARIS-REPLACED-SKU',
        role: ProductAssetRole.HERO_CUTOUT,
        sourceSystem: 'TEST',
        replacesRegistrationId: 'reg-a',
        rightsState: ProductAssetRightsState.UNKNOWN,
        registeredAt: new Date('2026-10-19T10:00:00Z'),
      };
      await repo.saveRegistration(regB);
      await repo.saveApprovalEvent({
        id: 'app-b',
        productAssetRegistrationId: 'reg-b',
        decision: ProductAssetApprovalDecision.SUBMITTED,
        decidedAt: new Date('2026-10-19T10:00:00Z'),
      });

      // 1. Evaluator selects A and asserts A is eligible:
      const result = await evaluator.evaluateHeroEligibility('PARIS-REPLACED-SKU');
      expect(result.isEligible).toBe(true);
      expect(result.registration?.id).toBe('reg-a');
      expect(result.asset?.id).toBe('asset-a');

      // 2. Repository findApprovedHeroCutoutBySku also selects A:
      const repoResult = await repo.findApprovedHeroCutoutBySku('PARIS-REPLACED-SKU');
      expect(repoResult?.id).toBe('reg-a');

      // 3. Rejecting B leaves A active and eligible:
      await repo.saveApprovalEvent({
        id: 'app-b-rejected',
        productAssetRegistrationId: 'reg-b',
        decision: ProductAssetApprovalDecision.REJECTED,
        decidedAt: new Date('2026-10-19T11:00:00Z'),
      });

      const afterReject = await evaluator.evaluateHeroEligibility('PARIS-REPLACED-SKU');
      expect(afterReject.isEligible).toBe(true);
      expect(afterReject.registration?.id).toBe('reg-a');

      // 4. When B is approved and A is retired, B becomes the active asset:
      const storedB = await storage.saveAsset(validTransparentBuffer, 'image/png');
      const assetBReady: ProductAsset = {
        ...assetB,
        sha256: storedB.sha256,
        storageKey: storedB.storageKey,
      };
      await repo.saveAsset(assetBReady);
      await repo.saveValidationAssessment({
        id: 'assess-b',
        productAssetId: 'asset-b',
        validatorVersion: CURRENT_VALIDATOR_VERSION,
        status: ProductAssetValidationStatus.PASS,
        isValid: true,
        format: 'png',
        hasAlpha: true,
        transparencyRatio: 0.5,
        width: 500,
        height: 500,
        byteSize: validTransparentBuffer.length,
        pixelCount: 250000,
        findings: [],
        reasonCodes: [],
        assessedAt: new Date('2026-10-19T12:00:00Z'),
      });
      await repo.saveRightsEvent({
        id: 'rights-b-verified',
        productAssetRegistrationId: 'reg-b',
        rightsState: ProductAssetRightsState.VERIFIED,
        effectiveAt: new Date('2026-10-19T09:00:00Z'),
        createdAt: new Date('2026-10-19T12:00:00Z'),
      });
      await repo.saveApprovalEvent({
        id: 'app-b-approved',
        productAssetRegistrationId: 'reg-b',
        decision: ProductAssetApprovalDecision.APPROVED,
        decidedAt: new Date('2026-10-19T12:05:00Z'),
      });
      await repo.saveApprovalEvent({
        id: 'app-a-retired',
        productAssetRegistrationId: 'reg-a',
        decision: ProductAssetApprovalDecision.RETIRED,
        decidedAt: new Date('2026-10-19T12:05:00Z'),
      });

      const afterBApproved = await evaluator.evaluateHeroEligibility('PARIS-REPLACED-SKU');
      expect(afterBApproved.isEligible).toBe(true);
      expect(afterBApproved.registration?.id).toBe('reg-b');
      expect(afterBApproved.asset?.id).toBe('asset-b');

      // 5. If active B's rights are later revoked, system fails closed and NEVER falls back to retired A:
      await repo.saveRightsEvent({
        id: 'rights-b-restricted',
        productAssetRegistrationId: 'reg-b',
        rightsState: ProductAssetRightsState.RESTRICTED,
        effectiveAt: new Date('2026-10-19T09:30:00Z'),
        createdAt: new Date('2026-10-19T13:00:00Z'),
      });

      const afterRevocation = await evaluator.evaluateHeroEligibility('PARIS-REPLACED-SKU');
      expect(afterRevocation.isEligible).toBe(false);
      expect(afterRevocation.reasonCode).toBe('RIGHTS_NOT_VERIFIED');
      expect(afterRevocation.registration?.id).toBe('reg-b');

      const repoAfterRevocation = await repo.findApprovedHeroCutoutBySku('PARIS-REPLACED-SKU');
      expect(repoAfterRevocation).toBeNull();
    });

    it('fails closed and does NOT fall back to retired predecessor if active asset CAS buffer is corrupt', async () => {
      const repo = new InMemoryProductAssetRepository();
      const storage = new InMemoryProductAssetStorage();
      const evaluator = new ProductAssetEligibilityEvaluator(repo, storage, validator, clock);

      // Predecessor A (RETIRED)
      const storedA = await storage.saveAsset(validTransparentBuffer, 'image/png');
      await repo.saveAsset({
        id: 'asset-a',
        sha256: storedA.sha256,
        storageKey: storedA.storageKey,
        mimeType: 'image/png',
        format: 'png',
        byteSize: validTransparentBuffer.length,
        width: 500,
        height: 500,
        pixelCount: 250000,
        channels: 4,
        hasAlpha: true,
        transparencyRatio: 0.5,
        createdAt: new Date('2026-10-18T10:00:00Z'),
      });
      await repo.saveRegistration({
        id: 'reg-a',
        productAssetId: 'asset-a',
        sku: 'PARIS-CAS-CORRUPT-SKU',
        role: ProductAssetRole.HERO_CUTOUT,
        sourceSystem: 'TEST',
        rightsState: ProductAssetRightsState.VERIFIED,
        registeredAt: new Date('2026-10-18T10:00:00Z'),
      });
      await repo.saveApprovalEvent({
        id: 'app-a-retired',
        productAssetRegistrationId: 'reg-a',
        decision: ProductAssetApprovalDecision.RETIRED,
        decidedAt: new Date('2026-10-18T12:00:00Z'),
      });

      // Active B (APPROVED, but CAS buffer is missing from storage)
      await repo.saveAsset({
        id: 'asset-b',
        sha256: 'c'.repeat(64),
        storageKey: 'cas/missing/file.png',
        mimeType: 'image/png',
        format: 'png',
        byteSize: 1000,
        width: 500,
        height: 500,
        pixelCount: 250000,
        channels: 4,
        hasAlpha: true,
        transparencyRatio: 0.5,
        createdAt: new Date('2026-10-19T10:00:00Z'),
      });
      await repo.saveRegistration({
        id: 'reg-b',
        productAssetId: 'asset-b',
        sku: 'PARIS-CAS-CORRUPT-SKU',
        role: ProductAssetRole.HERO_CUTOUT,
        sourceSystem: 'TEST',
        replacesRegistrationId: 'reg-a',
        rightsState: ProductAssetRightsState.VERIFIED,
        registeredAt: new Date('2026-10-19T10:00:00Z'),
      });
      await repo.saveApprovalEvent({
        id: 'app-b-approved',
        productAssetRegistrationId: 'reg-b',
        decision: ProductAssetApprovalDecision.APPROVED,
        decidedAt: new Date('2026-10-19T10:05:00Z'),
      });
      await repo.saveValidationAssessment({
        id: 'assess-b',
        productAssetId: 'asset-b',
        validatorVersion: CURRENT_VALIDATOR_VERSION,
        status: ProductAssetValidationStatus.PASS,
        isValid: true,
        format: 'png',
        hasAlpha: true,
        transparencyRatio: 0.5,
        width: 500,
        height: 500,
        byteSize: 1000,
        pixelCount: 250000,
        findings: [],
        reasonCodes: [],
        assessedAt: new Date('2026-10-19T10:05:00Z'),
      });

      const result = await evaluator.evaluateHeroEligibility('PARIS-CAS-CORRUPT-SKU');
      expect(result.isEligible).toBe(false);
      expect(result.reasonCode).toBe('CAS_FILE_MISSING');
      expect(result.registration?.id).toBe('reg-b');
    });

    it('keeps predecessor A active when multiple replacements (B and C) are pending', async () => {
      const repo = new InMemoryProductAssetRepository();
      const storage = new InMemoryProductAssetStorage();
      const evaluator = new ProductAssetEligibilityEvaluator(repo, storage, validator, clock);

      const storedA = await storage.saveAsset(validTransparentBuffer, 'image/png');
      await repo.saveAsset({
        id: 'asset-a',
        sha256: storedA.sha256,
        storageKey: storedA.storageKey,
        mimeType: 'image/png',
        format: 'png',
        byteSize: validTransparentBuffer.length,
        width: 500,
        height: 500,
        pixelCount: 250000,
        channels: 4,
        hasAlpha: true,
        transparencyRatio: 0.5,
        createdAt: new Date('2026-10-18T10:00:00Z'),
      });
      await repo.saveRegistration({
        id: 'reg-a',
        productAssetId: 'asset-a',
        sku: 'PARIS-MULTI-PENDING',
        role: ProductAssetRole.HERO_CUTOUT,
        sourceSystem: 'TEST',
        rightsState: ProductAssetRightsState.VERIFIED,
        registeredAt: new Date('2026-10-18T10:00:00Z'),
      });
      await repo.saveApprovalEvent({
        id: 'app-a',
        productAssetRegistrationId: 'reg-a',
        decision: ProductAssetApprovalDecision.APPROVED,
        decidedAt: new Date('2026-10-18T10:05:00Z'),
      });
      await repo.saveValidationAssessment({
        id: 'assess-a',
        productAssetId: 'asset-a',
        validatorVersion: CURRENT_VALIDATOR_VERSION,
        status: ProductAssetValidationStatus.PASS,
        isValid: true,
        format: 'png',
        hasAlpha: true,
        transparencyRatio: 0.5,
        width: 500,
        height: 500,
        byteSize: validTransparentBuffer.length,
        pixelCount: 250000,
        findings: [],
        reasonCodes: [],
        assessedAt: new Date('2026-10-18T10:05:00Z'),
      });

      // Replacement B (SUBMITTED)
      await repo.saveRegistration({
        id: 'reg-b',
        productAssetId: 'asset-b',
        sku: 'PARIS-MULTI-PENDING',
        role: ProductAssetRole.HERO_CUTOUT,
        sourceSystem: 'TEST',
        replacesRegistrationId: 'reg-a',
        rightsState: ProductAssetRightsState.UNKNOWN,
        registeredAt: new Date('2026-10-19T09:00:00Z'),
      });
      await repo.saveApprovalEvent({
        id: 'app-b',
        productAssetRegistrationId: 'reg-b',
        decision: ProductAssetApprovalDecision.SUBMITTED,
        decidedAt: new Date('2026-10-19T09:00:00Z'),
      });

      // Replacement C (SUBMITTED)
      await repo.saveRegistration({
        id: 'reg-c',
        productAssetId: 'asset-c',
        sku: 'PARIS-MULTI-PENDING',
        role: ProductAssetRole.HERO_CUTOUT,
        sourceSystem: 'TEST',
        replacesRegistrationId: 'reg-a',
        rightsState: ProductAssetRightsState.UNKNOWN,
        registeredAt: new Date('2026-10-19T10:00:00Z'),
      });
      await repo.saveApprovalEvent({
        id: 'app-c',
        productAssetRegistrationId: 'reg-c',
        decision: ProductAssetApprovalDecision.SUBMITTED,
        decidedAt: new Date('2026-10-19T10:00:00Z'),
      });

      const result = await evaluator.evaluateHeroEligibility('PARIS-MULTI-PENDING');
      expect(result.isEligible).toBe(true);
      expect(result.registration?.id).toBe('reg-a');
    });
  });

  it('approves and returns valid transparent hero cutout with verified rights', async () => {
    const repo = new InMemoryProductAssetRepository();
    const storage = new InMemoryProductAssetStorage();
    const evaluator = new ProductAssetEligibilityEvaluator(repo, storage, validator, clock);

    const stored = await storage.saveAsset(validTransparentBuffer, 'image/png');

    const asset: ProductAsset = {
      id: 'asset-golden',
      sha256: stored.sha256,
      storageKey: stored.storageKey,
      mimeType: 'image/png',
      format: 'png',
      byteSize: validTransparentBuffer.length,
      width: 500,
      height: 500,
      pixelCount: 250000,
      channels: 4,
      hasAlpha: true,
      transparencyRatio: 0.5,
      createdAt: clock.now(),
    };
    await repo.saveAsset(asset);

    const reg: ProductAssetRegistration = {
      id: 'reg-golden',
      productAssetId: 'asset-golden',
      sku: 'PARIS-GOLDEN-01',
      role: ProductAssetRole.HERO_CUTOUT,
      sourceSystem: 'TEST',
      rightsState: ProductAssetRightsState.VERIFIED,
      registeredAt: clock.now(),
    };
    await repo.saveRegistration(reg);

    await repo.saveValidationAssessment({
      id: 'assess-golden',
      productAssetId: 'asset-golden',
      validatorVersion: CURRENT_VALIDATOR_VERSION,
      status: ProductAssetValidationStatus.PASS,
      isValid: true,
      format: 'png',
      hasAlpha: true,
      transparencyRatio: 0.5,
      width: 500,
      height: 500,
      byteSize: validTransparentBuffer.length,
      pixelCount: 250000,
      findings: [],
      reasonCodes: [],
      assessedAt: clock.now(),
    });

    await repo.saveApprovalEvent({
      id: 'app-golden',
      productAssetRegistrationId: 'reg-golden',
      decision: ProductAssetApprovalDecision.APPROVED,
      decidedAt: clock.now(),
    });

    const result = await evaluator.evaluateHeroEligibility('PARIS-GOLDEN-01');
    expect(result.isEligible).toBe(true);
    expect(result.asset?.id).toBe('asset-golden');
    expect(result.registration?.id).toBe('reg-golden');
    expect(result.buffer).toEqual(validTransparentBuffer);

    const asserted = await evaluator.assertHeroEligible('PARIS-GOLDEN-01');
    expect(asserted.asset.id).toBe('asset-golden');
  });

  describe('resolveAuthoritativeHeroEvidence fail-closed guarantees', () => {
    async function createBaseSetup(): Promise<{
      repo: InMemoryProductAssetRepository;
      storage: InMemoryProductAssetStorage;
      evalService: ProductAssetEligibilityEvaluator;
      testClock: FakeClock;
      asset: ProductAsset;
      reg: ProductAssetRegistration;
      assessment: ProductAssetValidationAssessment;
      approval: ProductAssetApprovalEvent;
      rights: ProductAssetRightsEvent;
    }> {
      const repo = new InMemoryProductAssetRepository();
      const storage = new InMemoryProductAssetStorage();
      const testClock = new FakeClock(new Date('2026-10-23T12:00:00Z'));
      const evalService = new ProductAssetEligibilityEvaluator(repo, storage, validator, testClock);

      const stored = await storage.saveAsset(validTransparentBuffer, 'image/png');

      const asset: ProductAsset = {
        id: 'asset-auth-01',
        sha256: stored.sha256,
        storageKey: stored.storageKey,
        mimeType: 'image/png',
        format: 'png',
        byteSize: validTransparentBuffer.length,
        width: 500,
        height: 500,
        pixelCount: 250000,
        channels: 4,
        hasAlpha: true,
        transparencyRatio: 0.5,
        createdAt: testClock.now(),
      };
      await repo.saveAsset(asset);

      const reg: ProductAssetRegistration = {
        id: 'reg-auth-01',
        productAssetId: 'asset-auth-01',
        sku: 'PARIS-AUTH-01',
        role: ProductAssetRole.HERO_CUTOUT,
        sourceSystem: 'TEST',
        rightsState: ProductAssetRightsState.VERIFIED,
        registeredAt: testClock.now(),
      };
      await repo.saveRegistration(reg);

      const assessment: ProductAssetValidationAssessment = {
        id: 'assess-auth-01',
        productAssetId: 'asset-auth-01',
        validatorVersion: CURRENT_VALIDATOR_VERSION,
        status: ProductAssetValidationStatus.PASS,
        isValid: true,
        format: 'png',
        hasAlpha: true,
        transparencyRatio: 0.5,
        width: 500,
        height: 500,
        byteSize: validTransparentBuffer.length,
        pixelCount: 250000,
        findings: [],
        reasonCodes: [],
        assessedAt: testClock.now(),
      };
      await repo.saveValidationAssessment(assessment);

      const approval: ProductAssetApprovalEvent = {
        id: 'app-auth-01',
        productAssetRegistrationId: 'reg-auth-01',
        decision: ProductAssetApprovalDecision.APPROVED,
        validationAssessmentId: 'assess-auth-01',
        decidedAt: testClock.now(),
      };
      await repo.saveApprovalEvent(approval);

      const rights: ProductAssetRightsEvent = {
        id: 'rights-auth-01',
        productAssetRegistrationId: 'reg-auth-01',
        rightsState: ProductAssetRightsState.VERIFIED,
        effectiveAt: new Date('2026-10-01T00:00:00Z'),
        expiresAt: new Date('2026-12-31T00:00:00Z'),
        createdAt: testClock.now(),
      };
      await repo.saveRightsEvent(rights);

      return { repo, storage, evalService, testClock, asset, reg, assessment, approval, rights };
    }

    it('resolves all 5 authoritative records and CAS buffer when fully compliant', async () => {
      const { evalService, asset, reg, assessment, approval, rights } = await createBaseSetup();
      const res = await evalService.resolveAuthoritativeHeroEvidence('PARIS-AUTH-01');

      expect(res.asset.id).toBe(asset.id);
      expect(res.registration.id).toBe(reg.id);
      expect(res.assessment.id).toBe(assessment.id);
      expect(res.approvalEvent.id).toBe(approval.id);
      expect(res.rightsEvent.id).toBe(rights.id);
      expect(res.buffer).toEqual(validTransparentBuffer);
    });

    it('fails closed when rights event is missing (never manufactures fallback object)', async () => {
      const { repo, evalService } = await createBaseSetup();
      repo.rightsEvents.clear(); // remove all rights events

      await expect(evalService.resolveAuthoritativeHeroEvidence('PARIS-AUTH-01')).rejects.toThrow(
        ProductAssetRightsUnverifiedError,
      );
    });

    it('fails closed when rights event registration ID mismatches selected registration', async () => {
      const { repo, evalService, testClock } = await createBaseSetup();
      repo.rightsEvents.clear();
      await repo.saveRightsEvent({
        id: 'rights-mismatched',
        productAssetRegistrationId: 'reg-different-99',
        rightsState: ProductAssetRightsState.VERIFIED,
        effectiveAt: new Date('2026-10-01T00:00:00Z'),
        expiresAt: null,
        createdAt: testClock.now(),
      });

      await expect(evalService.resolveAuthoritativeHeroEvidence('PARIS-AUTH-01')).rejects.toThrow(
        ProductAssetRightsUnverifiedError,
      );
    });

    it('fails closed when rights event is not VERIFIED', async () => {
      const { repo, evalService, testClock } = await createBaseSetup();
      repo.rightsEvents.clear();
      await repo.saveRightsEvent({
        id: 'rights-unverified',
        productAssetRegistrationId: 'reg-auth-01',
        rightsState: ProductAssetRightsState.UNKNOWN,
        effectiveAt: new Date('2026-10-01T00:00:00Z'),
        expiresAt: null,
        createdAt: testClock.now(),
      });

      await expect(evalService.resolveAuthoritativeHeroEvidence('PARIS-AUTH-01')).rejects.toThrow(
        ProductAssetRightsUnverifiedError,
      );
    });

    it('fails closed when rights event is not yet effective', async () => {
      const { repo, evalService, testClock } = await createBaseSetup();
      repo.rightsEvents.clear();
      await repo.saveRightsEvent({
        id: 'rights-future',
        productAssetRegistrationId: 'reg-auth-01',
        rightsState: ProductAssetRightsState.VERIFIED,
        effectiveAt: new Date('2026-11-01T00:00:00Z'), // in future relative to 2026-10-23
        expiresAt: null,
        createdAt: testClock.now(),
      });

      await expect(evalService.resolveAuthoritativeHeroEvidence('PARIS-AUTH-01')).rejects.toThrow(
        ProductAssetRightsUnverifiedError,
      );
    });

    it('fails closed when rights event has expired', async () => {
      const { repo, evalService, testClock } = await createBaseSetup();
      repo.rightsEvents.clear();
      await repo.saveRightsEvent({
        id: 'rights-expired',
        productAssetRegistrationId: 'reg-auth-01',
        rightsState: ProductAssetRightsState.VERIFIED,
        effectiveAt: new Date('2026-09-01T00:00:00Z'),
        expiresAt: new Date('2026-10-01T00:00:00Z'), // expired before 2026-10-23
        createdAt: testClock.now(),
      });

      await expect(evalService.resolveAuthoritativeHeroEvidence('PARIS-AUTH-01')).rejects.toThrow(
        ProductAssetRightsUnverifiedError,
      );
    });

    it('fails closed when approval event is missing', async () => {
      const { repo, evalService } = await createBaseSetup();
      repo.approvalEvents.clear();

      await expect(evalService.resolveAuthoritativeHeroEvidence('PARIS-AUTH-01')).rejects.toThrow(
        ProductAssetUnapprovedError,
      );
    });

    it('fails closed when approval event registration ID mismatches selected registration', async () => {
      const { repo, evalService, testClock } = await createBaseSetup();
      repo.approvalEvents.clear();
      await repo.saveApprovalEvent({
        id: 'app-mismatched',
        productAssetRegistrationId: 'reg-different-99',
        decision: ProductAssetApprovalDecision.APPROVED,
        decidedAt: testClock.now(),
      });

      await expect(evalService.resolveAuthoritativeHeroEvidence('PARIS-AUTH-01')).rejects.toThrow(
        ProductAssetUnapprovedError,
      );
    });

    it('fails closed when approval event is not APPROVED', async () => {
      const { repo, evalService, testClock } = await createBaseSetup();
      repo.approvalEvents.clear();
      await repo.saveApprovalEvent({
        id: 'app-rejected',
        productAssetRegistrationId: 'reg-auth-01',
        decision: ProductAssetApprovalDecision.REJECTED,
        decidedAt: testClock.now(),
      });

      await expect(evalService.resolveAuthoritativeHeroEvidence('PARIS-AUTH-01')).rejects.toThrow(
        ProductAssetUnapprovedError,
      );
    });

    it('fails closed when approval event references a different validation assessment', async () => {
      const { repo, evalService, testClock } = await createBaseSetup();
      repo.approvalEvents.clear();
      await repo.saveApprovalEvent({
        id: 'app-diff-assessment',
        productAssetRegistrationId: 'reg-auth-01',
        decision: ProductAssetApprovalDecision.APPROVED,
        validationAssessmentId: 'assess-other-99',
        decidedAt: testClock.now(),
      });

      await expect(evalService.resolveAuthoritativeHeroEvidence('PARIS-AUTH-01')).rejects.toThrow(
        /Authoritative approval event references validation assessment/,
      );
    });

    it('fails closed when validation assessment productAssetId mismatches asset id', async () => {
      const { repo, evalService, testClock } = await createBaseSetup();
      repo.assessments.clear();
      await repo.saveValidationAssessment({
        id: 'assess-mismatched',
        productAssetId: 'asset-wrong-99',
        validatorVersion: CURRENT_VALIDATOR_VERSION,
        status: ProductAssetValidationStatus.PASS,
        isValid: true,
        format: 'png',
        hasAlpha: true,
        transparencyRatio: 0.5,
        width: 500,
        height: 500,
        byteSize: validTransparentBuffer.length,
        pixelCount: 250000,
        findings: [],
        reasonCodes: [],
        assessedAt: testClock.now(),
      });

      await expect(evalService.resolveAuthoritativeHeroEvidence('PARIS-AUTH-01')).rejects.toThrow(
        /is ineligible for creative composition/,
      );
    });

    it('fails closed when validation assessment is marked invalid', async () => {
      const { repo, evalService, testClock } = await createBaseSetup();
      repo.assessments.clear();
      await repo.saveValidationAssessment({
        id: 'assess-invalid',
        productAssetId: 'asset-auth-01',
        validatorVersion: CURRENT_VALIDATOR_VERSION,
        status: ProductAssetValidationStatus.PASS,
        isValid: false,
        format: 'png',
        hasAlpha: true,
        transparencyRatio: 0.5,
        width: 500,
        height: 500,
        byteSize: validTransparentBuffer.length,
        pixelCount: 250000,
        findings: [],
        reasonCodes: [],
        assessedAt: testClock.now(),
      });

      await expect(evalService.resolveAuthoritativeHeroEvidence('PARIS-AUTH-01')).rejects.toThrow(
        /is ineligible for creative composition/,
      );
    });

    it('fails closed when validation assessment has status FAIL', async () => {
      const { repo, evalService, testClock } = await createBaseSetup();
      repo.assessments.clear();
      await repo.saveValidationAssessment({
        id: 'assess-fail',
        productAssetId: 'asset-auth-01',
        validatorVersion: CURRENT_VALIDATOR_VERSION,
        status: ProductAssetValidationStatus.FAIL,
        isValid: true,
        format: 'png',
        hasAlpha: true,
        transparencyRatio: 0.5,
        width: 500,
        height: 500,
        byteSize: validTransparentBuffer.length,
        pixelCount: 250000,
        findings: ['Failed alpha test'],
        reasonCodes: ['OPAQUE_PIXELS'],
        assessedAt: testClock.now(),
      });

      await expect(evalService.resolveAuthoritativeHeroEvidence('PARIS-AUTH-01')).rejects.toThrow(
        /is ineligible for creative composition/,
      );
    });

    it('fails closed when validation assessment validator version is stale', async () => {
      const { repo, evalService, testClock } = await createBaseSetup();
      repo.assessments.clear();
      await repo.saveValidationAssessment({
        id: 'assess-stale',
        productAssetId: 'asset-auth-01',
        validatorVersion: '0.9.0-deprecated',
        status: ProductAssetValidationStatus.PASS,
        isValid: true,
        format: 'png',
        hasAlpha: true,
        transparencyRatio: 0.5,
        width: 500,
        height: 500,
        byteSize: validTransparentBuffer.length,
        pixelCount: 250000,
        findings: [],
        reasonCodes: [],
        assessedAt: testClock.now(),
      });

      await expect(evalService.resolveAuthoritativeHeroEvidence('PARIS-AUTH-01')).rejects.toThrow(
        ProductAssetInvalidValidatorVersionError,
      );
    });
  });
});
