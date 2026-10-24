import { createHash } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import sharp from 'sharp';
import { FakeClock } from '@parisian-shopper/common';
import { PermissionService } from '../../auth/domain/permissions.js';
import { ReplaceProductAssetUseCase } from './replace-product-asset.use-case.js';
import {
  type ApprovalTransactionInput,
  type ProductAssetOutboxDraft,
  type ProductAssetRegistrationUnitOfWork,
  type RegisterAssetTransactionInput,
  type RegisterAssetTransactionResult,
  type ReplaceAssetTransactionInput,
  type ReplaceAssetTransactionResult,
  type RightsTransactionInput,
} from './product-asset-registration-unit-of-work.port.js';
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
} from '../domain/product-asset.js';
import {
  ProductAssetIneligibleError,
  ProductAssetNotFoundError,
  ProductAssetOpaqueHeroError,
  ProductAssetUnauthorizedError,
} from '../domain/product-asset-errors.js';
import { type ProductAssetRepository } from './product-asset.repository.js';
import {
  type ProductAssetStoragePort,
  type StoredProductAssetInfo,
} from './product-asset-storage.port.js';
import { ProductAssetValidator } from '../../creative/domain/services/product-asset-validator.js';
import { generateTransparentProductPng_TEST_ONLY } from '../../creative/infrastructure/fixtures/fake-product-fixtures.js';
import {
  TEST_ACTOR_APPROVER,
  TEST_ACTOR_EDITOR,
  TEST_ACTOR_VIEWER,
} from '../testing/test-product-asset.helper.js';

class MockProductAssetRepository implements ProductAssetRepository {
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
    return Promise.resolve(Array.from(this.registrations.values()).filter((r) => r.sku === sku));
  }

  public findAllHeroCutoutRegistrations(
    sku: string,
  ): Promise<readonly ProductAssetRegistration[]> {
    return Promise.resolve(
      Array.from(this.registrations.values()).filter(
        (r) => r.sku === sku && r.role === ProductAssetRole.HERO_CUTOUT,
      ),
    );
  }

  public findRegistrationsBySkuAndRole(
    sku: string,
    role: ProductAssetRole,
  ): Promise<readonly ProductAssetRegistration[]> {
    return Promise.resolve(
      Array.from(this.registrations.values()).filter((r) => r.sku === sku && r.role === role),
    );
  }

  public async findApprovedHeroCutoutBySku(sku: string): Promise<ProductAssetRegistration | null> {
    const list = await this.findRegistrationsBySkuAndRole(sku, ProductAssetRole.HERO_CUTOUT);
    return list.find((r) => r.rightsState === ProductAssetRightsState.VERIFIED) ?? null;
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

  public findLatestRightsEvent(
    registrationId: string,
  ): Promise<ProductAssetRightsEvent | null> {
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

class MockStoragePort implements ProductAssetStoragePort {
  public files = new Map<string, Buffer>();

  public deriveStorageKey(sha256: string, extension: string): string {
    return `cas/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}.${extension}`;
  }

  public saveAsset(
    buffer: Buffer,
    mimeType: string,
    extension = 'png',
  ): Promise<StoredProductAssetInfo> {
    const sha256 = createHash('sha256').update(buffer).digest('hex').toLowerCase();
    const ext = extension || (mimeType.includes('jpeg') ? 'jpg' : 'png');
    const storageKey = this.deriveStorageKey(sha256, ext);
    this.files.set(storageKey, buffer);
    return Promise.resolve({
      storageKey,
      sha256,
      mimeType,
      byteSize: buffer.length,
    });
  }

  public getAssetBuffer(storageKey: string): Promise<Buffer | null> {
    return Promise.resolve(this.files.get(storageKey) ?? null);
  }

  public assetExists(storageKey: string): Promise<boolean> {
    return Promise.resolve(this.files.has(storageKey));
  }
}

class MockUnitOfWork implements ProductAssetRegistrationUnitOfWork {
  public outboxDrafts: ProductAssetOutboxDraft[] = [];

  public constructor(private readonly repo: MockProductAssetRepository) {}

  public async executeRegistration(
    input: RegisterAssetTransactionInput,
  ): Promise<RegisterAssetTransactionResult> {
    const asset = await this.repo.saveAsset(input.asset);
    const registration = await this.repo.saveRegistration(input.registration);
    const assessment = await this.repo.saveValidationAssessment(input.assessment);
    let rightsEvent: ProductAssetRightsEvent | undefined;
    if (input.rightsEvent) {
      rightsEvent = await this.repo.saveRightsEvent(input.rightsEvent);
    }
    let approvalEvent: ProductAssetApprovalEvent | undefined;
    if (input.initialApprovalEvent) {
      approvalEvent = await this.repo.saveApprovalEvent(input.initialApprovalEvent);
    }
    if (input.outboxEvents) {
      this.outboxDrafts.push(...input.outboxEvents);
    }
    return { asset, registration, assessment, rightsEvent, approvalEvent };
  }

  public async executeReplacement(
    input: ReplaceAssetTransactionInput,
  ): Promise<ReplaceAssetTransactionResult> {
    let previousRegistrationRetiredEvent: ProductAssetApprovalEvent | undefined;
    if (input.previousRegistrationRetiredEvent) {
      previousRegistrationRetiredEvent = await this.repo.saveApprovalEvent(
        input.previousRegistrationRetiredEvent,
      );
    }
    const newAsset = await this.repo.saveAsset(input.newAsset);
    const newRegistration = await this.repo.saveRegistration(input.newRegistration);
    const newAssessment = await this.repo.saveValidationAssessment(input.newAssessment);
    let newRightsEvent: ProductAssetRightsEvent | undefined;
    if (input.newRightsEvent) {
      newRightsEvent = await this.repo.saveRightsEvent(input.newRightsEvent);
    }
    let newApprovalEvent: ProductAssetApprovalEvent | undefined;
    if (input.newApprovalEvent) {
      newApprovalEvent = await this.repo.saveApprovalEvent(input.newApprovalEvent);
    }
    if (input.outboxEvents) {
      this.outboxDrafts.push(...input.outboxEvents);
    }
    return {
      newAsset,
      newRegistration,
      newAssessment,
      newRightsEvent,
      newApprovalEvent,
      previousRegistrationRetiredEvent,
    };
  }

  public async executeApproval(
    input: ApprovalTransactionInput,
  ): Promise<ProductAssetApprovalEvent> {
    if (input.outboxEvents) {
      this.outboxDrafts.push(...input.outboxEvents);
    }
    return this.repo.saveApprovalEvent(input.approvalEvent);
  }

  public async executeRights(input: RightsTransactionInput): Promise<ProductAssetRightsEvent> {
    if (input.outboxEvents) {
      this.outboxDrafts.push(...input.outboxEvents);
    }
    return this.repo.saveRightsEvent(input.rightsEvent);
  }
}

describe('ReplaceProductAssetUseCase', () => {
  const clock = new FakeClock(new Date('2026-10-19T10:00:00.000Z'));
  const validator = new ProductAssetValidator();
  const permissions = new PermissionService();

  const originalPng = generateTransparentProductPng_TEST_ONLY({
    width: 400,
    height: 400,
    productWidth: 200,
    productHeight: 300,
    productColor: { r: 100, g: 150, b: 200, a: 255 },
  });

  const replacementPng = generateTransparentProductPng_TEST_ONLY({
    width: 450,
    height: 450,
    productWidth: 220,
    productHeight: 320,
    productColor: { r: 120, g: 170, b: 220, a: 255 },
  });

  const setupPreviousApprovedAsset = async (
    repo: MockProductAssetRepository,
    storage: MockStoragePort,
  ): Promise<{ prevAssetId: string; prevRegId: string; reg: ProductAssetRegistration }> => {
    const prevAssetId = 'asset-prev';
    const prevRegId = 'reg-prev';
    const stored = await storage.saveAsset(originalPng, 'image/png');

    const asset: ProductAsset = {
      id: prevAssetId,
      sha256: stored.sha256,
      storageKey: stored.storageKey,
      mimeType: 'image/png',
      format: 'png',
      byteSize: originalPng.length,
      width: 400,
      height: 400,
      pixelCount: 160000,
      channels: 4,
      hasAlpha: true,
      transparencyRatio: 0.45,
      createdAt: clock.now(),
    };
    await repo.saveAsset(asset);

    const reg: ProductAssetRegistration = {
      id: prevRegId,
      productAssetId: prevAssetId,
      sku: 'PARIS-ROYAL-01',
      role: ProductAssetRole.HERO_CUTOUT,
      sourceSystem: 'STUDIO',
      rightsState: ProductAssetRightsState.VERIFIED,
      registeredAt: clock.now(),
    };
    await repo.saveRegistration(reg);

    const appEvent: ProductAssetApprovalEvent = {
      id: 'app-prev',
      productAssetRegistrationId: prevRegId,
      decision: ProductAssetApprovalDecision.APPROVED,
      decidedAt: clock.now(),
    };
    await repo.saveApprovalEvent(appEvent);

    return { prevAssetId, prevRegId, reg };
  };

  it('rejects replacement when actor lacks required permission (VIEWER)', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    const { prevRegId } = await setupPreviousApprovedAsset(repo, storage);

    const useCase = new ReplaceProductAssetUseCase(repo, storage, uow, validator, permissions, clock);

    await expect(
      useCase.execute({
        actor: TEST_ACTOR_VIEWER,
        previousRegistrationId: prevRegId,
        sku: 'PARIS-ROYAL-01',
        role: ProductAssetRole.HERO_CUTOUT,
        buffer: replacementPng,
        sourceSystem: 'STUDIO',
      }),
    ).rejects.toThrow(ProductAssetUnauthorizedError);
  });

  it('creates replacement as SUBMITTED with UNKNOWN rights even when executed by APPROVER', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    const { prevRegId } = await setupPreviousApprovedAsset(repo, storage);

    const useCase = new ReplaceProductAssetUseCase(repo, storage, uow, validator, permissions, clock);

    const result = await useCase.execute({
      actor: TEST_ACTOR_APPROVER,
      previousRegistrationId: prevRegId,
      sku: 'PARIS-ROYAL-01',
      role: ProductAssetRole.HERO_CUTOUT,
      buffer: replacementPng,
      sourceSystem: 'STUDIO',
    });

    expect(result.newApprovalEvent.decision).toBe(ProductAssetApprovalDecision.SUBMITTED);
    expect(result.newRightsEvent.rightsState).toBe(ProductAssetRightsState.UNKNOWN);
    expect(result.newRightsEvent.verifiedByUserId).toBeNull();
    expect(result.previousRegistrationRetiredEvent).toBeUndefined();
  });

  it('rejects when previous registration does not exist', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);

    const useCase = new ReplaceProductAssetUseCase(repo, storage, uow, validator, permissions, clock);

    await expect(
      useCase.execute({
        actor: TEST_ACTOR_APPROVER,
        previousRegistrationId: 'non-existent-reg',
        sku: 'PARIS-ROYAL-01',
        role: ProductAssetRole.HERO_CUTOUT,
        buffer: replacementPng,
        sourceSystem: 'STUDIO',
      }),
    ).rejects.toThrow(ProductAssetNotFoundError);
  });

  it('rejects when SKU does not match previous registration', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    const { prevRegId } = await setupPreviousApprovedAsset(repo, storage);

    const useCase = new ReplaceProductAssetUseCase(repo, storage, uow, validator, permissions, clock);

    await expect(
      useCase.execute({
        actor: TEST_ACTOR_APPROVER,
        previousRegistrationId: prevRegId,
        sku: 'DIFFERENT-SKU',
        role: ProductAssetRole.HERO_CUTOUT,
        buffer: replacementPng,
        sourceSystem: 'STUDIO',
      }),
    ).rejects.toThrow(ProductAssetIneligibleError);
  });

  it('rejects opaque replacement when role is HERO_CUTOUT', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    const { prevRegId } = await setupPreviousApprovedAsset(repo, storage);

    const opaqueJpeg = await sharp({
      create: {
        width: 600,
        height: 600,
        channels: 3,
        background: { r: 240, g: 240, b: 240 },
      },
    })
      .jpeg()
      .toBuffer();

    const useCase = new ReplaceProductAssetUseCase(repo, storage, uow, validator, permissions, clock);

    await expect(
      useCase.execute({
        actor: TEST_ACTOR_APPROVER,
        previousRegistrationId: prevRegId,
        sku: 'PARIS-ROYAL-01',
        role: ProductAssetRole.HERO_CUTOUT,
        buffer: opaqueJpeg,
        sourceSystem: 'STUDIO',
      }),
    ).rejects.toThrow(ProductAssetOpaqueHeroError);
  });

  it('successfully replaces asset, preserves previous registration, sets replacesRegistrationId, and emits dependency-changed outbox event', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    const { prevRegId } = await setupPreviousApprovedAsset(repo, storage);

    const useCase = new ReplaceProductAssetUseCase(repo, storage, uow, validator, permissions, clock);

    const result = await useCase.execute({
      actor: TEST_ACTOR_EDITOR,
      previousRegistrationId: prevRegId,
      sku: 'PARIS-ROYAL-01',
      role: ProductAssetRole.HERO_CUTOUT,
      buffer: replacementPng,
      sourceSystem: 'STUDIO_UPGRADE',
      reason: 'UPGRADED_LIGHTING',
    });

    expect(result.previousRegistrationRetiredEvent).toBeUndefined();

    expect(result.newRegistration.replacesRegistrationId).toBe(prevRegId);
    expect(result.newRegistration.sku).toBe('PARIS-ROYAL-01');
    expect(result.newApprovalEvent?.decision).toBe(ProductAssetApprovalDecision.SUBMITTED);

    // Verify atomic outbox events
    const topics = uow.outboxDrafts.map((d) => d.topic);
    expect(topics).toContain('product_asset.registered');
    expect(topics).toContain('product_asset.validation_completed');
    expect(topics).toContain('product_asset.dependency_changed');
    expect(topics).not.toContain('product_asset.approved');
    expect(topics).not.toContain('approval.invalidation_requested_by_asset_change');

    const depEvent = uow.outboxDrafts.find(
      (d) => d.topic === 'product_asset.dependency_changed',
    );
    expect(depEvent).toBeDefined();
    expect(depEvent?.payload.previousRegistrationId).toBe(prevRegId);
    expect(depEvent?.payload.newRegistrationId).toBe(result.newRegistration.id);
  });
});
