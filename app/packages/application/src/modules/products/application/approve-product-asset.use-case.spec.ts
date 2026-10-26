import { createHash } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import { FakeClock } from '@parisian-shopper/common';
import { PermissionService } from '../../auth/domain/permissions.js';
import { ApproveProductAssetUseCase } from './approve-product-asset.use-case.js';
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
  ProductAssetValidationStatus,
} from '../domain/product-asset.js';
import {
  ProductAssetCorruptError,
  ProductAssetInvalidLifecycleTransitionError,
  ProductAssetInvalidValidatorVersionError,
  ProductAssetNotFoundError,
  ProductAssetRightsUnverifiedError,
  ProductAssetStaleAssessmentError,
  ProductAssetUnauthorizedError,
} from '../domain/product-asset-errors.js';
import { type ProductAssetRepository } from './product-asset.repository.js';
import {
  type ProductAssetStoragePort,
  type StoredProductAssetInfo,
} from './product-asset-storage.port.js';
import { CURRENT_VALIDATOR_VERSION } from '../../creative/domain/services/product-asset-validator.js';
import { generateTransparentProductPng_TEST_ONLY } from '../../creative/infrastructure/fixtures/fake-product-fixtures.js';
import { TEST_ACTOR_APPROVER, TEST_ACTOR_EDITOR } from '../testing/test-product-asset.helper.js';

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
    if (input.predecessorRetiredEvent) {
      await this.repo.saveApprovalEvent(input.predecessorRetiredEvent);
    }
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

describe('ApproveProductAssetUseCase', () => {
  const clock = new FakeClock(new Date('2026-10-19T10:00:00.000Z'));
  const permissions = new PermissionService();

  const validTransparentPng = generateTransparentProductPng_TEST_ONLY({
    width: 400,
    height: 400,
    productWidth: 200,
    productHeight: 300,
    productColor: { r: 100, g: 150, b: 200, a: 255 },
  });
  const setupValidCandidate = async (
    repo: MockProductAssetRepository,
    storage: MockStoragePort,
    assetId = 'asset-1',
    regId = 'reg-1',
  ): Promise<{
    asset: ProductAsset;
    reg: ProductAssetRegistration;
    assessment: ProductAssetValidationAssessment;
    rights: ProductAssetRightsEvent;
    stored: StoredProductAssetInfo;
  }> => {
    const stored = await storage.saveAsset(validTransparentPng, 'image/png');

    const asset: ProductAsset = {
      id: assetId,
      sha256: stored.sha256,
      storageKey: stored.storageKey,
      mimeType: 'image/png',
      format: 'png',
      byteSize: validTransparentPng.length,
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
      id: regId,
      productAssetId: assetId,
      sku: 'PARIS-ROYAL-01',
      role: ProductAssetRole.HERO_CUTOUT,
      sourceSystem: 'STUDIO',
      rightsState: ProductAssetRightsState.VERIFIED,
      registeredAt: clock.now(),
    };
    await repo.saveRegistration(reg);

    const assessment: ProductAssetValidationAssessment = {
      id: `assess-${assetId}`,
      productAssetId: assetId,
      validatorVersion: CURRENT_VALIDATOR_VERSION,
      status: ProductAssetValidationStatus.PASS,
      isValid: true,
      format: 'png',
      hasAlpha: true,
      transparencyRatio: 0.45,
      width: 400,
      height: 400,
      byteSize: validTransparentPng.length,
      pixelCount: 160000,
      findings: [],
      reasonCodes: [],
      assessedAt: clock.now(),
    };
    await repo.saveValidationAssessment(assessment);

    const rights: ProductAssetRightsEvent = {
      id: `rights-${regId}`,
      productAssetRegistrationId: regId,
      rightsState: ProductAssetRightsState.VERIFIED,
      effectiveAt: new Date(clock.now().getTime() - 1000),
      expiresAt: new Date(clock.now().getTime() + 100000),
      createdAt: clock.now(),
    };
    await repo.saveRightsEvent(rights);

    const initialApproval: ProductAssetApprovalEvent = {
      id: `app-init-${regId}`,
      productAssetRegistrationId: regId,
      decision: ProductAssetApprovalDecision.SUBMITTED,
      decidedAt: clock.now(),
    };
    await repo.saveApprovalEvent(initialApproval);

    return { asset, reg, assessment, rights, stored };
  };

  it('rejects approval when actor lacks APPROVE_CREATIVE permission (EDITOR role)', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    await setupValidCandidate(repo, storage);

    const useCase = new ApproveProductAssetUseCase(repo, storage, uow, permissions, clock);

    await expect(
      useCase.execute({
        registrationId: 'reg-1',
        decision: ProductAssetApprovalDecision.APPROVED,
        actor: TEST_ACTOR_EDITOR,
      }),
    ).rejects.toThrow(ProductAssetUnauthorizedError);
  });

  it('approves a valid submitted registration when called by authorized approver', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    await setupValidCandidate(repo, storage);

    const useCase = new ApproveProductAssetUseCase(repo, storage, uow, permissions, clock);

    const result = await useCase.execute({
      registrationId: 'reg-1',
      decision: ProductAssetApprovalDecision.APPROVED,
      actor: TEST_ACTOR_APPROVER,
      reason: 'VERIFIED_STUDIO_ALPHA',
      notes: 'Approved for campaign',
    });

    expect(result.decision).toBe(ProductAssetApprovalDecision.APPROVED);
    expect(result.decidedByUserId).toBe(TEST_ACTOR_APPROVER.userId);
    expect(result.reason).toBe('VERIFIED_STUDIO_ALPHA');

    expect(uow.outboxDrafts).toHaveLength(1);
    expect(uow.outboxDrafts[0]?.topic).toBe('product_asset.approved');
  });

  it('supports rejecting a submitted registration', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    await setupValidCandidate(repo, storage);

    const useCase = new ApproveProductAssetUseCase(repo, storage, uow, permissions, clock);

    const result = await useCase.execute({
      registrationId: 'reg-1',
      decision: ProductAssetApprovalDecision.REJECTED,
      actor: TEST_ACTOR_APPROVER,
      reason: 'DIRTY_BACKGROUND',
    });

    expect(result.decision).toBe(ProductAssetApprovalDecision.REJECTED);
    expect(uow.outboxDrafts).toHaveLength(1);
    expect(uow.outboxDrafts[0]?.topic).toBe('product_asset.rejected');
  });

  it('supports retiring an approved registration', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    await setupValidCandidate(repo, storage);

    // First approve
    await repo.saveApprovalEvent({
      id: 'app-approved',
      productAssetRegistrationId: 'reg-1',
      decision: ProductAssetApprovalDecision.APPROVED,
      decidedAt: clock.now(),
    });

    const useCase = new ApproveProductAssetUseCase(repo, storage, uow, permissions, clock);

    const result = await useCase.execute({
      registrationId: 'reg-1',
      decision: ProductAssetApprovalDecision.RETIRED,
      actor: TEST_ACTOR_APPROVER,
      reason: 'CAMPAIGN_ENDED',
    });

    expect(result.decision).toBe(ProductAssetApprovalDecision.RETIRED);
    expect(uow.outboxDrafts).toHaveLength(1);
    expect(uow.outboxDrafts[0]?.topic).toBe('product_asset.retired');
  });

  it('rejects invalid lifecycle transition (REJECTED -> APPROVED)', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    await setupValidCandidate(repo, storage);

    await repo.saveApprovalEvent({
      id: 'app-rejected',
      productAssetRegistrationId: 'reg-1',
      decision: ProductAssetApprovalDecision.REJECTED,
      decidedAt: clock.now(),
    });

    const useCase = new ApproveProductAssetUseCase(repo, storage, uow, permissions, clock);

    await expect(
      useCase.execute({
        registrationId: 'reg-1',
        decision: ProductAssetApprovalDecision.APPROVED,
        actor: TEST_ACTOR_APPROVER,
      }),
    ).rejects.toThrow(ProductAssetInvalidLifecycleTransitionError);
  });

  it('rejects invalid lifecycle transition (RETIRED -> APPROVED)', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    await setupValidCandidate(repo, storage);

    await repo.saveApprovalEvent({
      id: 'app-retired',
      productAssetRegistrationId: 'reg-1',
      decision: ProductAssetApprovalDecision.RETIRED,
      decidedAt: clock.now(),
    });

    const useCase = new ApproveProductAssetUseCase(repo, storage, uow, permissions, clock);

    await expect(
      useCase.execute({
        registrationId: 'reg-1',
        decision: ProductAssetApprovalDecision.APPROVED,
        actor: TEST_ACTOR_APPROVER,
      }),
    ).rejects.toThrow(ProductAssetInvalidLifecycleTransitionError);
  });

  it('fails with ProductAssetCorruptError if CAS file is missing when approving', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    const { stored } = await setupValidCandidate(repo, storage);

    // Delete file from storage
    storage.files.delete(stored.storageKey);

    const useCase = new ApproveProductAssetUseCase(repo, storage, uow, permissions, clock);

    await expect(
      useCase.execute({
        registrationId: 'reg-1',
        decision: ProductAssetApprovalDecision.APPROVED,
        actor: TEST_ACTOR_APPROVER,
      }),
    ).rejects.toThrow(ProductAssetCorruptError);
  });

  it('fails with ProductAssetDigestMismatchError if buffer SHA-256 does not match recorded digest', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    const { stored } = await setupValidCandidate(repo, storage);

    // Corrupt storage with different content
    storage.files.set(stored.storageKey, Buffer.from('different-content-bytes'));

    const useCase = new ApproveProductAssetUseCase(repo, storage, uow, permissions, clock);

    await expect(
      useCase.execute({
        registrationId: 'reg-1',
        decision: ProductAssetApprovalDecision.APPROVED,
        actor: TEST_ACTOR_APPROVER,
      }),
    ).rejects.toThrow(ProductAssetCorruptError); // byteSize mismatch or digest mismatch
  });

  it('fails with ProductAssetInvalidValidatorVersionError if stored assessment used stale validator', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    await setupValidCandidate(repo, storage);

    // Update assessment with old validator version
    await repo.saveValidationAssessment({
      id: 'assess-old',
      productAssetId: 'asset-1',
      validatorVersion: '0.9.0-stale',
      status: ProductAssetValidationStatus.PASS,
      isValid: true,
      format: 'png',
      hasAlpha: true,
      transparencyRatio: 0.45,
      width: 400,
      height: 400,
      byteSize: validTransparentPng.length,
      pixelCount: 160000,
      findings: [],
      reasonCodes: [],
      assessedAt: clock.now(),
    });

    const useCase = new ApproveProductAssetUseCase(repo, storage, uow, permissions, clock);

    await expect(
      useCase.execute({
        registrationId: 'reg-1',
        decision: ProductAssetApprovalDecision.APPROVED,
        actor: TEST_ACTOR_APPROVER,
      }),
    ).rejects.toThrow(ProductAssetInvalidValidatorVersionError);
  });

  it('fails with ProductAssetRightsUnverifiedError if rights state is UNKNOWN or EXPIRED', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    await setupValidCandidate(repo, storage);

    // Expire rights
    await repo.saveRightsEvent({
      id: 'rights-expired',
      productAssetRegistrationId: 'reg-1',
      rightsState: ProductAssetRightsState.VERIFIED,
      effectiveAt: new Date(clock.now().getTime() - 10000),
      expiresAt: new Date(clock.now().getTime() - 1000), // in the past
      createdAt: clock.now(),
    });

    const useCase = new ApproveProductAssetUseCase(repo, storage, uow, permissions, clock);

    await expect(
      useCase.execute({
        registrationId: 'reg-1',
        decision: ProductAssetApprovalDecision.APPROVED,
        actor: TEST_ACTOR_APPROVER,
      }),
    ).rejects.toThrow(ProductAssetRightsUnverifiedError);
  });

  it('throws ProductAssetNotFoundError when registration does not exist', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    const useCase = new ApproveProductAssetUseCase(repo, storage, uow, permissions, clock);

    await expect(
      useCase.execute({
        registrationId: 'non-existent-id',
        decision: ProductAssetApprovalDecision.APPROVED,
        actor: TEST_ACTOR_APPROVER,
      }),
    ).rejects.toThrow(ProductAssetNotFoundError);
  });

  it('binds exact latest validation assessment and includes validation/rights details in outbox payload', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    const { asset, assessment, rights } = await setupValidCandidate(repo, storage);

    const useCase = new ApproveProductAssetUseCase(repo, storage, uow, permissions, clock);

    const approvedEvent = await useCase.execute({
      registrationId: 'reg-1',
      decision: ProductAssetApprovalDecision.APPROVED,
      actor: TEST_ACTOR_APPROVER,
      expectedValidationAssessmentId: assessment.id,
    });

    expect(approvedEvent.validationAssessmentId).toBe(assessment.id);

    const approvedOutbox = uow.outboxDrafts.find((d) => d.topic === 'product_asset.approved');
    expect(approvedOutbox).toBeDefined();
    expect(approvedOutbox?.payload.validationAssessmentId).toBe(assessment.id);
    expect(approvedOutbox?.payload.validatorVersion).toBe(CURRENT_VALIDATOR_VERSION);
    expect(approvedOutbox?.payload.rightsEventId).toBe(rights.id);
    expect(approvedOutbox?.payload.sha256).toBe(asset.sha256);
  });

  it('rejects approval if expectedValidationAssessmentId does not match latest assessment (fails closed against stale review)', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    await setupValidCandidate(repo, storage);

    const useCase = new ApproveProductAssetUseCase(repo, storage, uow, permissions, clock);

    await expect(
      useCase.execute({
        registrationId: 'reg-1',
        decision: ProductAssetApprovalDecision.APPROVED,
        actor: TEST_ACTOR_APPROVER,
        expectedValidationAssessmentId: 'assess-stale-different-id',
      }),
    ).rejects.toThrow(ProductAssetStaleAssessmentError);
  });

  it('atomically retires predecessor and emits approval.invalidation_requested_by_asset_change when approving replacement', async () => {
    const repo = new MockProductAssetRepository();
    const storage = new MockStoragePort();
    const uow = new MockUnitOfWork(repo);
    const prev = await setupValidCandidate(repo, storage);

    // Mark previous registration as approved
    await repo.saveApprovalEvent({
      id: 'app-prev-approved',
      productAssetRegistrationId: prev.reg.id,
      decision: ProductAssetApprovalDecision.APPROVED,
      validationAssessmentId: prev.assessment.id,
      decidedAt: clock.now(),
    });

    // Create replacement registration
    const repRegId = 'reg-replacement';
    const repAssetId = 'asset-replacement';
    const repCandidate = await setupValidCandidate(repo, storage, repAssetId, repRegId);

    const repReg: ProductAssetRegistration = {
      ...repCandidate.reg,
      replacesRegistrationId: prev.reg.id,
    };
    await repo.saveRegistration(repReg);

    const useCase = new ApproveProductAssetUseCase(repo, storage, uow, permissions, clock);

    const approvedEvent = await useCase.execute({
      registrationId: repRegId,
      decision: ProductAssetApprovalDecision.APPROVED,
      actor: TEST_ACTOR_APPROVER,
      reason: 'Upgraded hero lighting approved',
    });

    expect(approvedEvent.decision).toBe(ProductAssetApprovalDecision.APPROVED);

    // Verify predecessor was retired
    const prevEvents = await repo.findApprovalEventsByRegistration(prev.reg.id);
    expect(prevEvents[0]?.decision).toBe(ProductAssetApprovalDecision.RETIRED);

    // Verify outbox drafts include predecessor retirement and visual invalidation
    const retiredOutbox = uow.outboxDrafts.find((d) => d.topic === 'product_asset.retired');
    expect(retiredOutbox).toBeDefined();
    expect(retiredOutbox?.payload.registrationId).toBe(prev.reg.id);
    expect(retiredOutbox?.payload.replacedByRegistrationId).toBe(repRegId);

    const invalidationOutbox = uow.outboxDrafts.find(
      (d) => d.topic === 'approval.invalidation_requested_by_asset_change',
    );
    expect(invalidationOutbox).toBeDefined();
    expect(invalidationOutbox?.payload.previousRegistrationId).toBe(prev.reg.id);
    expect(invalidationOutbox?.payload.newRegistrationId).toBe(repRegId);
    expect(invalidationOutbox?.payload.changedScopes).toEqual(['visualAssets']);
    expect(invalidationOutbox?.payload.preservedScopes).toEqual([
      'pricing',
      'stock',
      'promotion',
      'facts',
    ]);
  });
});
