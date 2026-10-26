import { createHash } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import sharp from 'sharp';
import { FakeClock } from '@parisian-shopper/common';
import { PermissionService } from '../../auth/domain/permissions.js';
import { RegisterProductAssetUseCase } from './register-product-asset.use-case.js';
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
  ProductAssetOpaqueHeroError,
  ProductAssetRegistryValidationError,
  ProductAssetUnauthorizedError,
} from '../domain/product-asset-errors.js';
import { type ProductAssetRepository } from './product-asset.repository.js';
import {
  type ProductAssetStoragePort,
  type StoredProductAssetInfo,
} from './product-asset-storage.port.js';
import { ProductAssetValidator } from '../../creative/domain/services/product-asset-validator.js';
import { generateTransparentProductPng_TEST_ONLY } from '../../creative/infrastructure/fixtures/fake-product-fixtures.js';
import { TEST_ACTOR_EDITOR, TEST_ACTOR_VIEWER } from '../testing/test-product-asset.helper.js';

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

  public findAllHeroCutoutRegistrations(sku: string): Promise<readonly ProductAssetRegistration[]> {
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

describe('RegisterProductAssetUseCase', () => {
  const clock = new FakeClock(new Date('2026-10-19T10:00:00.000Z'));
  const validator = new ProductAssetValidator();
  const permissions = new PermissionService();

  const validTransparentPng = generateTransparentProductPng_TEST_ONLY({
    width: 400,
    height: 400,
    productWidth: 200,
    productHeight: 300,
    productColor: { r: 100, g: 150, b: 200, a: 255 },
  });

  it('rejects registration when actor lacks required permission (VIEWER role)', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    const useCase = new RegisterProductAssetUseCase(
      repo,
      storage,
      uow,
      validator,
      permissions,
      clock,
    );

    await expect(
      useCase.execute({
        actor: TEST_ACTOR_VIEWER,
        buffer: validTransparentPng,
        sku: 'PARIS-ROYAL-01',
        role: ProductAssetRole.HERO_CUTOUT,
        sourceSystem: 'STUDIO',
      }),
    ).rejects.toThrow(ProductAssetUnauthorizedError);
  });

  it('registers a transparent HERO_CUTOUT asset with initial UNKNOWN rights state and SUBMITTED approval state', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    const useCase = new RegisterProductAssetUseCase(
      repo,
      storage,
      uow,
      validator,
      permissions,
      clock,
    );

    const result = await useCase.execute({
      actor: TEST_ACTOR_EDITOR,
      buffer: validTransparentPng,
      sku: 'PARIS-ROYAL-01',
      role: ProductAssetRole.HERO_CUTOUT,
      sourceSystem: 'STUDIO_UPLOAD',
    });

    expect(result.asset.hasAlpha).toBe(true);
    expect(result.asset.width).toBe(400);
    expect(result.asset.height).toBe(400);
    expect(result.registration.sku).toBe('PARIS-ROYAL-01');
    expect(result.registration.role).toBe(ProductAssetRole.HERO_CUTOUT);
    expect(result.registration.rightsState).toBe(ProductAssetRightsState.UNKNOWN);
    expect(result.validationAssessment.isValid).toBe(true);
    expect(result.approvalEvent?.decision).toBe(ProductAssetApprovalDecision.SUBMITTED);
    expect(result.rightsEvent?.rightsState).toBe(ProductAssetRightsState.UNKNOWN);
    expect(result.rightsEvent?.verifiedByUserId).toBeNull();

    // Verify outbox drafts
    expect(uow.outboxDrafts).toHaveLength(2);
    expect(uow.outboxDrafts[0]?.topic).toBe('product_asset.registered');
    expect(uow.outboxDrafts[1]?.topic).toBe('product_asset.validation_completed');
  });

  it('registers an opaque JPEG as ORIGINAL_SOURCE without error', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    const useCase = new RegisterProductAssetUseCase(
      repo,
      storage,
      uow,
      validator,
      permissions,
      clock,
    );

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

    const result = await useCase.execute({
      actor: TEST_ACTOR_EDITOR,
      buffer: opaqueJpeg,
      sku: 'PARIS-RAW-01',
      role: ProductAssetRole.ORIGINAL_SOURCE,
      sourceSystem: 'MEKHLA_PRODUCT_API',
    });

    expect(result.asset.hasAlpha).toBe(false);
    expect(result.asset.format).toBe('jpeg');
    expect(result.registration.role).toBe(ProductAssetRole.ORIGINAL_SOURCE);
    expect(result.validationAssessment.isValid).toBe(true);
  });

  it('strictly rejects an opaque image attempted as HERO_CUTOUT with ProductAssetOpaqueHeroError', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    const useCase = new RegisterProductAssetUseCase(
      repo,
      storage,
      uow,
      validator,
      permissions,
      clock,
    );

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

    await expect(
      useCase.execute({
        actor: TEST_ACTOR_EDITOR,
        buffer: opaqueJpeg,
        sku: 'PARIS-FAIL-01',
        role: ProductAssetRole.HERO_CUTOUT,
        sourceSystem: 'UPSTREAM_API',
      }),
    ).rejects.toThrow(ProductAssetOpaqueHeroError);
  });

  it('rejects empty buffer and empty SKU with ProductAssetRegistryValidationError', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    const useCase = new RegisterProductAssetUseCase(
      repo,
      storage,
      uow,
      validator,
      permissions,
      clock,
    );

    await expect(
      useCase.execute({
        actor: TEST_ACTOR_EDITOR,
        buffer: Buffer.alloc(0),
        sku: 'PARIS-1',
        role: ProductAssetRole.HERO_CUTOUT,
        sourceSystem: 'TEST',
      }),
    ).rejects.toThrow(ProductAssetRegistryValidationError);

    await expect(
      useCase.execute({
        actor: TEST_ACTOR_EDITOR,
        buffer: validTransparentPng,
        sku: '',
        role: ProductAssetRole.HERO_CUTOUT,
        sourceSystem: 'TEST',
      }),
    ).rejects.toThrow(ProductAssetRegistryValidationError);
  });
});
