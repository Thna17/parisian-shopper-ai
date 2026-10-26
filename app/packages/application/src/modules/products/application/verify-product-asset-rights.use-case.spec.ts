import { describe, expect, it } from '@jest/globals';
import { FakeClock } from '@parisian-shopper/common';
import { PermissionService } from '../../auth/domain/permissions.js';
import { VerifyProductAssetRightsUseCase } from './verify-product-asset-rights.use-case.js';
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
  type ProductAssetApprovalEvent,
  type ProductAssetRegistration,
  type ProductAssetRightsEvent,
  ProductAssetRightsState,
  ProductAssetRole,
  type ProductAssetTransform,
  type ProductAssetValidationAssessment,
} from '../domain/product-asset.js';
import {
  ProductAssetNotFoundError,
  ProductAssetRegistryValidationError,
  ProductAssetUnauthorizedError,
} from '../domain/product-asset-errors.js';
import { type ProductAssetRepository } from './product-asset.repository.js';
import {
  TEST_ACTOR_ADMIN,
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

  public saveValidationAssessment(
    assessment: ProductAssetValidationAssessment,
  ): Promise<ProductAssetValidationAssessment> {
    this.assessments.set(assessment.id, assessment);
    return Promise.resolve(assessment);
  }

  public findLatestValidationAssessment(
    assetId: string,
  ): Promise<ProductAssetValidationAssessment | null> {
    const list = Array.from(this.assessments.values()).filter((a) => a.productAssetId === assetId);
    return Promise.resolve(list[list.length - 1] ?? null);
  }

  public saveApprovalEvent(event: ProductAssetApprovalEvent): Promise<ProductAssetApprovalEvent> {
    const current = this.approvalEvents.get(event.productAssetRegistrationId) ?? [];
    this.approvalEvents.set(event.productAssetRegistrationId, [event, ...current]);
    return Promise.resolve(event);
  }

  public findApprovalEventsByRegistration(
    registrationId: string,
  ): Promise<readonly ProductAssetApprovalEvent[]> {
    return Promise.resolve(this.approvalEvents.get(registrationId) ?? []);
  }

  public saveRightsEvent(event: ProductAssetRightsEvent): Promise<ProductAssetRightsEvent> {
    const current = this.rightsEvents.get(event.productAssetRegistrationId) ?? [];
    this.rightsEvents.set(event.productAssetRegistrationId, [event, ...current]);
    return Promise.resolve(event);
  }

  public findLatestRightsEvent(registrationId: string): Promise<ProductAssetRightsEvent | null> {
    const current = this.rightsEvents.get(registrationId) ?? [];
    return Promise.resolve(current[0] ?? null);
  }

  public saveTransform(transform: ProductAssetTransform): Promise<ProductAssetTransform> {
    const current = this.transforms.get(transform.sourceAssetId) ?? [];
    this.transforms.set(transform.sourceAssetId, [...current, transform]);
    return Promise.resolve(transform);
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

  public findLatestApprovalEvent(
    registrationId: string,
  ): Promise<ProductAssetApprovalEvent | null> {
    const list = this.approvalEvents.get(registrationId) ?? [];
    return Promise.resolve(list[0] ?? null);
  }

  public findRightsEventsByRegistration(
    registrationId: string,
  ): Promise<readonly ProductAssetRightsEvent[]> {
    return Promise.resolve(this.rightsEvents.get(registrationId) ?? []);
  }

  public findTransformsByDerivedAsset(
    derivedAssetId: string,
  ): Promise<readonly ProductAssetTransform[]> {
    return Promise.resolve(this.transforms.get(derivedAssetId) ?? []);
  }
}

class MockUnitOfWork implements ProductAssetRegistrationUnitOfWork {
  public outboxDrafts: ProductAssetOutboxDraft[] = [];

  public constructor(private readonly repo: MockProductAssetRepository) {}

  public async executeRegistration(
    input: RegisterAssetTransactionInput,
  ): Promise<RegisterAssetTransactionResult> {
    await this.repo.saveAsset(input.asset);
    await this.repo.saveRegistration(input.registration);
    await this.repo.saveValidationAssessment(input.assessment);
    if (input.rightsEvent) await this.repo.saveRightsEvent(input.rightsEvent);
    if (input.initialApprovalEvent) await this.repo.saveApprovalEvent(input.initialApprovalEvent);
    if (input.outboxEvents) this.outboxDrafts.push(...input.outboxEvents);
    return {
      asset: input.asset,
      registration: input.registration,
      assessment: input.assessment,
      rightsEvent: input.rightsEvent,
      approvalEvent: input.initialApprovalEvent,
    };
  }

  public async executeReplacement(
    input: ReplaceAssetTransactionInput,
  ): Promise<ReplaceAssetTransactionResult> {
    await this.repo.saveAsset(input.newAsset);
    await this.repo.saveRegistration(input.newRegistration);
    await this.repo.saveValidationAssessment(input.newAssessment);
    if (input.newRightsEvent) await this.repo.saveRightsEvent(input.newRightsEvent);
    if (input.newApprovalEvent) await this.repo.saveApprovalEvent(input.newApprovalEvent);
    if (input.previousRegistrationRetiredEvent) {
      await this.repo.saveApprovalEvent(input.previousRegistrationRetiredEvent);
    }
    if (input.outboxEvents) this.outboxDrafts.push(...input.outboxEvents);
    return {
      newAsset: input.newAsset,
      newRegistration: input.newRegistration,
      newAssessment: input.newAssessment,
      newRightsEvent: input.newRightsEvent,
      newApprovalEvent: input.newApprovalEvent,
      previousRegistrationRetiredEvent: input.previousRegistrationRetiredEvent,
    };
  }

  public async executeApproval(
    input: ApprovalTransactionInput,
  ): Promise<ProductAssetApprovalEvent> {
    await this.repo.saveApprovalEvent(input.approvalEvent);
    if (input.predecessorRetiredEvent) {
      await this.repo.saveApprovalEvent(input.predecessorRetiredEvent);
    }
    if (input.outboxEvents) this.outboxDrafts.push(...input.outboxEvents);
    return input.approvalEvent;
  }

  public async executeRights(input: RightsTransactionInput): Promise<ProductAssetRightsEvent> {
    await this.repo.saveRightsEvent(input.rightsEvent);
    if (input.outboxEvents) this.outboxDrafts.push(...input.outboxEvents);
    return input.rightsEvent;
  }
}

describe('VerifyProductAssetRightsUseCase', () => {
  const clock = new FakeClock(new Date('2026-10-19T10:00:00.000Z'));
  const permissions = new PermissionService();

  const setupRegistration = async (repo: MockProductAssetRepository): Promise<string> => {
    const regId = 'reg-test-01';
    await repo.saveRegistration({
      id: regId,
      productAssetId: 'asset-test-01',
      sku: 'PARIS-ROYAL-01',
      role: ProductAssetRole.HERO_CUTOUT,
      sourceSystem: 'STUDIO',
      rightsState: ProductAssetRightsState.UNKNOWN,
      registeredAt: clock.now(),
    });
    return regId;
  };

  it('rejects when actor lacks VERIFY_PRODUCT_ASSET_RIGHTS permission (VIEWER)', async () => {
    const repo = new MockProductAssetRepository();
    const uow = new MockUnitOfWork(repo);
    const regId = await setupRegistration(repo);
    const useCase = new VerifyProductAssetRightsUseCase(repo, uow, permissions, clock);

    await expect(
      useCase.execute({
        actor: TEST_ACTOR_VIEWER,
        registrationId: regId,
        rightsState: ProductAssetRightsState.VERIFIED,
        sourceReference: 'Brand Portal Contract #1234',
        permittedScope: 'COMMERCIAL_DIGITAL_ADVERTISING',
        reason: 'Contract approved',
      }),
    ).rejects.toThrow(ProductAssetUnauthorizedError);
  });

  it('rejects when actor is MARKETING_EDITOR (creators cannot grant themselves rights)', async () => {
    const repo = new MockProductAssetRepository();
    const uow = new MockUnitOfWork(repo);
    const regId = await setupRegistration(repo);
    const useCase = new VerifyProductAssetRightsUseCase(repo, uow, permissions, clock);

    await expect(
      useCase.execute({
        actor: TEST_ACTOR_EDITOR,
        registrationId: regId,
        rightsState: ProductAssetRightsState.VERIFIED,
        sourceReference: 'Self declared',
        permittedScope: 'COMMERCIAL_DIGITAL_ADVERTISING',
        reason: 'Creator self declaration',
      }),
    ).rejects.toThrow(ProductAssetUnauthorizedError);
  });

  it('rejects when registration does not exist', async () => {
    const repo = new MockProductAssetRepository();
    const uow = new MockUnitOfWork(repo);
    const useCase = new VerifyProductAssetRightsUseCase(repo, uow, permissions, clock);

    await expect(
      useCase.execute({
        actor: TEST_ACTOR_APPROVER,
        registrationId: 'non-existent-reg',
        rightsState: ProductAssetRightsState.VERIFIED,
        sourceReference: 'Contract #99',
        permittedScope: 'COMMERCIAL_DIGITAL_ADVERTISING',
        reason: 'Brand approval',
      }),
    ).rejects.toThrow(ProductAssetNotFoundError);
  });

  it('rejects VERIFIED declaration when sourceReference is missing', async () => {
    const repo = new MockProductAssetRepository();
    const uow = new MockUnitOfWork(repo);
    const regId = await setupRegistration(repo);
    const useCase = new VerifyProductAssetRightsUseCase(repo, uow, permissions, clock);

    await expect(
      useCase.execute({
        actor: TEST_ACTOR_APPROVER,
        registrationId: regId,
        rightsState: ProductAssetRightsState.VERIFIED,
        permittedScope: 'COMMERCIAL_DIGITAL_ADVERTISING',
        reason: 'Brand approval',
      }),
    ).rejects.toThrow(ProductAssetRegistryValidationError);
  });

  it('rejects VERIFIED declaration when permittedScope is missing', async () => {
    const repo = new MockProductAssetRepository();
    const uow = new MockUnitOfWork(repo);
    const regId = await setupRegistration(repo);
    const useCase = new VerifyProductAssetRightsUseCase(repo, uow, permissions, clock);

    await expect(
      useCase.execute({
        actor: TEST_ACTOR_APPROVER,
        registrationId: regId,
        rightsState: ProductAssetRightsState.VERIFIED,
        sourceReference: 'Brand Portal Contract #1234',
        reason: 'Brand approval',
      }),
    ).rejects.toThrow(ProductAssetRegistryValidationError);
  });

  it('rejects when expiry date is before effective date', async () => {
    const repo = new MockProductAssetRepository();
    const uow = new MockUnitOfWork(repo);
    const regId = await setupRegistration(repo);
    const useCase = new VerifyProductAssetRightsUseCase(repo, uow, permissions, clock);

    await expect(
      useCase.execute({
        actor: TEST_ACTOR_APPROVER,
        registrationId: regId,
        rightsState: ProductAssetRightsState.VERIFIED,
        sourceReference: 'Contract #1234',
        permittedScope: 'COMMERCIAL_DIGITAL_ADVERTISING',
        effectiveAt: new Date('2026-10-19T10:00:00.000Z'),
        expiresAt: new Date('2026-10-18T10:00:00.000Z'),
        reason: 'Brand approval',
      }),
    ).rejects.toThrow(ProductAssetRegistryValidationError);
  });

  it('allows MARKETING_APPROVER to declare rights as VERIFIED and records audit fields and outbox', async () => {
    const repo = new MockProductAssetRepository();
    const uow = new MockUnitOfWork(repo);
    const regId = await setupRegistration(repo);
    const useCase = new VerifyProductAssetRightsUseCase(repo, uow, permissions, clock);

    const expiresAt = new Date('2027-10-19T10:00:00.000Z');
    const result = await useCase.execute({
      actor: TEST_ACTOR_APPROVER,
      registrationId: regId,
      rightsState: ProductAssetRightsState.VERIFIED,
      sourceReference: 'Brand Contract #PARIS-2026',
      permittedScope: 'COMMERCIAL_CAMPAIGN_MARKETING',
      territory: 'GLOBAL',
      expiresAt,
      reason: 'Legal compliance verified',
      notes: 'Includes all digital marketing rights through 2027',
      correlationId: 'corr-rights-01',
    });

    expect(result.rightsState).toBe(ProductAssetRightsState.VERIFIED);
    expect(result.sourceReference).toBe('Brand Contract #PARIS-2026');
    expect(result.permittedScope).toBe('COMMERCIAL_CAMPAIGN_MARKETING');
    expect(result.territory).toBe('GLOBAL');
    expect(result.verifiedByUserId).toBe(TEST_ACTOR_APPROVER.userId);
    expect(result.reason).toBe('Legal compliance verified');
    expect(result.expiresAt).toEqual(expiresAt);

    // Verify outbox
    expect(uow.outboxDrafts).toHaveLength(1);
    expect(uow.outboxDrafts[0]?.topic).toBe('product_asset.rights_updated');
    expect(uow.outboxDrafts[0]?.payload.rightsState).toBe(ProductAssetRightsState.VERIFIED);
    expect(uow.outboxDrafts[0]?.payload.verifiedByUserId).toBe(TEST_ACTOR_APPROVER.userId);
    expect(uow.outboxDrafts[0]?.payload.correlationId).toBe('corr-rights-01');
  });

  it('allows ADMIN to declare rights as RESTRICTED or EXPIRED', async () => {
    const repo = new MockProductAssetRepository();
    const uow = new MockUnitOfWork(repo);
    const regId = await setupRegistration(repo);
    const useCase = new VerifyProductAssetRightsUseCase(repo, uow, permissions, clock);

    const result = await useCase.execute({
      actor: TEST_ACTOR_ADMIN,
      registrationId: regId,
      rightsState: ProductAssetRightsState.RESTRICTED,
      reason: 'Contract restricted to print media only',
      notes: 'No digital advertising allowed',
    });

    expect(result.rightsState).toBe(ProductAssetRightsState.RESTRICTED);
    expect(result.verifiedByUserId).toBe(TEST_ACTOR_ADMIN.userId);
    expect(result.reason).toBe('Contract restricted to print media only');
  });
});
