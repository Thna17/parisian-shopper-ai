import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  CreateProductSnapshotUseCase,
  DEVELOPMENT_BRAND_RULES,
  FICTIONAL_PRODUCTS,
} from '@parisian-shopper/application';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PrismaBrandRuleRepository } from '../../src/brand/prisma-brand-rule.repository.js';
import { PrismaProductSnapshotRepository } from '../../src/product-snapshot/prisma-product-snapshot.repository.js';
import { PrismaService } from '../../src/prisma.service.js';
import {
  PrismaCreativeApprovalRepository,
  PrismaCreativeJobRepository,
  PrismaCreativeRevisionRepository,
  PrismaVisualAssetRepository,
  PrismaVisualValidationRepository,
} from '../../src/creative/index.js';

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('Phase 2A Creative Workflow Foundation Integration', () => {
  let postgres: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaService | undefined;
  let snapshotsRepo: PrismaProductSnapshotRepository | undefined;
  let brandsRepo: PrismaBrandRuleRepository | undefined;

  let creativeJobRepo: PrismaCreativeJobRepository | undefined;
  let visualAssetRepo: PrismaVisualAssetRepository | undefined;
  let visualValidationRepo: PrismaVisualValidationRepository | undefined;
  let creativeRevisionRepo: PrismaCreativeRevisionRepository | undefined;
  let creativeApprovalRepo: PrismaCreativeApprovalRepository | undefined;

  let testUserId: string;
  let brandRuleVersionId: string;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:17.6-alpine')
      .withDatabase('parisian_creative_test')
      .withUsername('parisian_test')
      .withPassword('fictional_test_password')
      .start();

    const databaseUrl = postgres.getConnectionUri();
    await execFileAsync(
      'pnpm',
      ['--filter', '@parisian-shopper/database', 'prisma:migrate:deploy'],
      {
        cwd: appRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl },
      },
    );

    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaService();
    await prisma.$connect();

    snapshotsRepo = new PrismaProductSnapshotRepository(prisma);
    brandsRepo = new PrismaBrandRuleRepository(prisma);

    creativeJobRepo = new PrismaCreativeJobRepository(prisma);
    visualAssetRepo = new PrismaVisualAssetRepository(prisma);
    visualValidationRepo = new PrismaVisualValidationRepository(prisma);
    creativeRevisionRepo = new PrismaCreativeRevisionRepository(prisma);
    creativeApprovalRepo = new PrismaCreativeApprovalRepository(prisma);

    // Seed brand rules
    const brand = await brandsRepo.create({
      name: 'Default Brand Rules',
      version: 1,
      status: 'ACTIVE',
      rules: DEVELOPMENT_BRAND_RULES,
    });
    brandRuleVersionId = brand.id;

    // Seed test user
    const user = await prisma.user.create({
      data: {
        displayName: 'Creative Tester',
      },
    });
    testUserId = user.id;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await postgres?.stop();
  });

  const getPrisma = (): PrismaService => {
    if (prisma === undefined) throw new Error('Prisma not initialized');
    return prisma;
  };

  const createContentSetup = async (): Promise<{
    contentJobId: string;
    contentVersion1Id: string;
    productSnapshotId: string;
  }> => {
    const product = FICTIONAL_PRODUCTS[0];
    if (product === undefined) throw new Error('Product fixture missing');

    const snapshot = await new CreateProductSnapshotUseCase(
      snapshotsRepo!,
      { record: (): void => {} },
      { log: (): void => {}, warn: (): void => {}, error: (): void => {} },
    ).execute(product);

    const cJob = await getPrisma().contentJob.create({
      data: {
        productSnapshotId: snapshot.id,
        brandRuleVersionId,
        requesterUserId: testUserId,
        contentType: 'PRODUCT_SPOTLIGHT',
        language: 'KM',
        platform: 'FACEBOOK',
        status: 'UNDER_REVIEW',
      },
    });

    const attempt = await getPrisma().generationAttempt.create({
      data: {
        contentJobId: cJob.id,
        attemptNumber: 1,
        provider: 'fake-ai',
        model: 'fixture-v1',
        promptVersion: '1.0',
        status: 'SUCCEEDED',
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const v1 = await getPrisma().contentVersion.create({
      data: {
        contentJobId: cJob.id,
        versionNumber: 1,
        brandRuleVersionId,
        productSnapshotId: snapshot.id,
        generationAttemptId: attempt.id,
        provider: 'fake-ai',
        model: 'fixture-v1',
        promptVersion: '1.0',
        structuredOutput: {
          headline: 'Luxury Fragrance Headline',
          khmer_caption: 'Caption',
          english_caption: 'English caption',
          cta: 'Shop Now',
          hashtags: ['#perfume'],
          creative_brief: 'Brief',
          facts_used: ['CHANEL'],
        },
      },
    });

    return {
      contentJobId: cJob.id,
      contentVersion1Id: v1.id,
      productSnapshotId: snapshot.id,
    };
  };

  it('creates CreativeJob and maintains exact ContentVersion pinning', async () => {
    const { contentJobId, contentVersion1Id, productSnapshotId } = await createContentSetup();

    const creativeJob = await creativeJobRepo!.createJob({
      contentVersionId: contentVersion1Id,
      productSnapshotId,
      brandRuleVersionId,
      requestedByUserId: testUserId,
      targetPlatform: 'FACEBOOK',
      aspectRatio: '4:5',
      creativeProfile: 'PARISIAN_LUXURY_ATELIER',
    });

    expect(creativeJob.id).toBeDefined();
    expect(creativeJob.contentVersionId).toBe(contentVersion1Id);
    expect(creativeJob.productSnapshotId).toBe(productSnapshotId);
    expect(creativeJob.brandRuleVersionId).toBe(brandRuleVersionId);
    expect(creativeJob.status).toBe('REQUESTED');
    expect(creativeJob.aspectRatio).toBe('4:5');

    // Create a new ContentVersion V2 for the same ContentJob
    const attempt2 = await getPrisma().generationAttempt.create({
      data: {
        contentJobId,
        attemptNumber: 2,
        provider: 'fake-ai',
        model: 'fixture-v1',
        promptVersion: '1.0',
        status: 'SUCCEEDED',
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const v2 = await getPrisma().contentVersion.create({
      data: {
        contentJobId,
        versionNumber: 2,
        brandRuleVersionId,
        productSnapshotId,
        generationAttemptId: attempt2.id,
        provider: 'fake-ai',
        model: 'fixture-v1',
        promptVersion: '1.0',
        structuredOutput: {
          headline: 'V2 Headline',
          khmer_caption: 'Caption 2',
          english_caption: 'English caption 2',
          cta: 'Shop Now',
          hashtags: ['#perfume'],
          creative_brief: 'Brief 2',
          facts_used: ['CHANEL'],
        },
      },
    });

    // Verify CreativeJob STILL references ContentVersion V1 (no automatic reassignment)
    const fetchedCreativeJob = await creativeJobRepo!.findById(creativeJob.id);
    expect(fetchedCreativeJob).not.toBeNull();
    expect(fetchedCreativeJob!.contentVersionId).toBe(contentVersion1Id);
    expect(fetchedCreativeJob!.contentVersionId).not.toBe(v2.id);
  });

  it('enforces append-only versioning for VisualAsset V1 and V2', async () => {
    const { contentVersion1Id, productSnapshotId } = await createContentSetup();

    const job = await creativeJobRepo!.createJob({
      contentVersionId: contentVersion1Id,
      productSnapshotId,
      brandRuleVersionId,
      requestedByUserId: testUserId,
    });

    // Create V1
    const v1 = await visualAssetRepo!.createAsset({
      creativeJobId: job.id,
      assetRole: 'COMPOSITED_CREATIVE',
      mimeType: 'image/webp',
      width: 1080,
      height: 1350,
      byteSize: 1450000,
      sha256: 'a'.repeat(64),
      storageKey: 'cas/aa/bb/aabb112233.webp',
      provider: 'fake-provider',
      model: 'fake-model',
      sourceProductAssetDigest: 'p'.repeat(64),
      backgroundAssetDigest: 'b'.repeat(64),
    });

    expect(v1.versionNumber).toBe(1);

    // Create V2
    const v2 = await visualAssetRepo!.createAsset({
      creativeJobId: job.id,
      assetRole: 'COMPOSITED_CREATIVE',
      mimeType: 'image/webp',
      width: 1080,
      height: 1350,
      byteSize: 1520000,
      sha256: 'c'.repeat(64),
      storageKey: 'cas/cc/dd/ccdd112233.webp',
      provider: 'fake-provider',
      model: 'fake-model',
      sourceProductAssetDigest: 'p'.repeat(64),
      backgroundAssetDigest: 'e'.repeat(64),
    });

    expect(v2.versionNumber).toBe(2);

    // Verify V1 is completely unchanged
    const reloadedV1 = await visualAssetRepo!.findByJobAndVersion(job.id, 1);
    expect(reloadedV1).not.toBeNull();
    expect(reloadedV1!.id).toBe(v1.id);
    expect(reloadedV1!.sha256).toBe('a'.repeat(64));
    expect(reloadedV1!.byteSize).toBe(1450000);

    // Verify list and latest
    const allAssets = await visualAssetRepo!.listByJobId(job.id);
    expect(allAssets).toHaveLength(2);
    expect(allAssets[0]?.versionNumber).toBe(1);
    expect(allAssets[1]?.versionNumber).toBe(2);

    const latest = await visualAssetRepo!.findLatestByJobId(job.id);
    expect(latest?.id).toBe(v2.id);
    expect(latest?.versionNumber).toBe(2);
  });

  it('enforces version uniqueness on (creative_job_id, version_number)', async () => {
    const { contentVersion1Id, productSnapshotId } = await createContentSetup();

    const job = await creativeJobRepo!.createJob({
      contentVersionId: contentVersion1Id,
      productSnapshotId,
      brandRuleVersionId,
    });

    await visualAssetRepo!.createAsset({
      creativeJobId: job.id,
      assetRole: 'COMPOSITED_CREATIVE',
      mimeType: 'image/webp',
      width: 1080,
      height: 1080,
      byteSize: 100000,
      sha256: '1'.repeat(64),
      storageKey: 'cas/11/22/key1.webp',
      sourceProductAssetDigest: 'p'.repeat(64),
    });

    // Attempting to manually insert another asset with versionNumber 1 must fail
    await expect(
      getPrisma().visualAsset.create({
        data: {
          creativeJobId: job.id,
          versionNumber: 1,
          assetRole: 'COMPOSITED_CREATIVE',
          mimeType: 'image/webp',
          width: 1080,
          height: 1080,
          byteSize: 200000,
          sha256: '2'.repeat(64),
          storageKey: 'cas/22/33/key2.webp',
          sourceProductAssetDigest: 'p'.repeat(64),
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces database immutability triggers on evidence tables', async () => {
    const { contentVersion1Id, productSnapshotId } = await createContentSetup();

    const job = await creativeJobRepo!.createJob({
      contentVersionId: contentVersion1Id,
      productSnapshotId,
      brandRuleVersionId,
    });

    const asset = await visualAssetRepo!.createAsset({
      creativeJobId: job.id,
      assetRole: 'COMPOSITED_CREATIVE',
      mimeType: 'image/webp',
      width: 1080,
      height: 1080,
      byteSize: 500000,
      sha256: '9'.repeat(64),
      storageKey: 'cas/99/88/key9.webp',
      sourceProductAssetDigest: 'p'.repeat(64),
    });

    // 1. UPDATE on visual_assets is blocked
    await expect(
      getPrisma().$executeRawUnsafe(
        `UPDATE "visual_assets" SET "width" = 2000 WHERE "id" = '${asset.id}'::uuid`,
      ),
    ).rejects.toThrow(/visual_assets are append-only/);

    // 2. DELETE on visual_assets is blocked
    await expect(
      getPrisma().$executeRawUnsafe(`DELETE FROM "visual_assets" WHERE "id" = '${asset.id}'::uuid`),
    ).rejects.toThrow(/visual_assets are append-only/);

    // 3. Persist visual validation result
    const valResult = await visualValidationRepo!.persistResult({
      visualAssetId: asset.id,
      validatorVersion: 'ps-visual-v1',
      status: 'PASSED',
      findings: [
        {
          field: 'dimensions',
          severity: 'INFO',
          code: 'DIMENSIONS_VERIFIED',
          message: 'Exact 1080x1080',
        },
      ],
    });

    // 4. UPDATE on visual_validation_results is blocked
    await expect(
      getPrisma().$executeRawUnsafe(
        `UPDATE "visual_validation_results" SET "status" = 'FAILED' WHERE "id" = '${valResult.id}'::uuid`,
      ),
    ).rejects.toThrow(/visual_validation_results are append-only/);

    // 5. DELETE on visual_validation_results is blocked
    await expect(
      getPrisma().$executeRawUnsafe(
        `DELETE FROM "visual_validation_results" WHERE "id" = '${valResult.id}'::uuid`,
      ),
    ).rejects.toThrow(/visual_validation_results are append-only/);

    // 6. UPDATE on visual_validation_findings is blocked
    const findingId = valResult.findings[0]?.id;
    expect(findingId).toBeDefined();
    await expect(
      getPrisma().$executeRawUnsafe(
        `UPDATE "visual_validation_findings" SET "message" = 'corrupted' WHERE "id" = '${findingId}'::uuid`,
      ),
    ).rejects.toThrow(/visual_validation_findings are append-only/);

    // 7. CreativeApprovalEvent append-only trigger
    const approval = await creativeApprovalRepo!.recordApproval({
      creativeJobId: job.id,
      visualAssetId: asset.id,
      approverUserId: testUserId,
      decision: 'CREATIVE_APPROVED',
      comment: 'Approved visual',
      visualValidationResultId: valResult.id,
    });

    await expect(
      getPrisma().$executeRawUnsafe(
        `UPDATE "creative_approval_events" SET "comment" = 'tampered' WHERE "id" = '${approval.id}'::uuid`,
      ),
    ).rejects.toThrow(/creative_approval_events are append-only/);

    await expect(
      getPrisma().$executeRawUnsafe(
        `DELETE FROM "creative_approval_events" WHERE "id" = '${approval.id}'::uuid`,
      ),
    ).rejects.toThrow(/creative_approval_events are append-only/);
  });

  it('persists validation findings and checks count consistency', async () => {
    const { contentVersion1Id, productSnapshotId } = await createContentSetup();

    const job = await creativeJobRepo!.createJob({
      contentVersionId: contentVersion1Id,
      productSnapshotId,
      brandRuleVersionId,
    });

    const asset = await visualAssetRepo!.createAsset({
      creativeJobId: job.id,
      assetRole: 'COMPOSITED_CREATIVE',
      mimeType: 'image/webp',
      width: 1080,
      height: 1080,
      byteSize: 800000,
      sha256: '7'.repeat(64),
      storageKey: 'cas/77/66/key7.webp',
      sourceProductAssetDigest: 'p'.repeat(64),
    });

    const valResult = await visualValidationRepo!.persistResult({
      visualAssetId: asset.id,
      validatorVersion: 'ps-visual-v1',
      status: 'PASSED_WITH_WARNINGS',
      findings: [
        {
          field: 'dimensions',
          severity: 'INFO',
          code: 'DIMENSIONS_VERIFIED',
          message: '1080x1080 valid',
        },
        {
          field: 'color_space',
          severity: 'WARNING',
          code: 'COLOR_SPACE_NORMALIZED',
          message: 'Color space converted to sRGB',
        },
      ],
    });

    expect(valResult.findingCount).toBe(2);
    expect(valResult.infoCount).toBe(1);
    expect(valResult.warningCount).toBe(1);
    expect(valResult.blockingCount).toBe(0);
    expect(valResult.findings).toHaveLength(2);

    const latest = await visualValidationRepo!.findLatestByAssetId(asset.id);
    expect(latest?.id).toBe(valResult.id);
  });

  it('supports creative revision lifecycle and enforces single pending constraint', async () => {
    const { contentVersion1Id, productSnapshotId } = await createContentSetup();

    const job = await creativeJobRepo!.createJob({
      contentVersionId: contentVersion1Id,
      productSnapshotId,
      brandRuleVersionId,
    });

    const v1 = await visualAssetRepo!.createAsset({
      creativeJobId: job.id,
      assetRole: 'COMPOSITED_CREATIVE',
      mimeType: 'image/webp',
      width: 1080,
      height: 1080,
      byteSize: 700000,
      sha256: '5'.repeat(64),
      storageKey: 'cas/55/44/key5.webp',
      sourceProductAssetDigest: 'p'.repeat(64),
    });

    // Create revision request
    const revision = await creativeRevisionRepo!.createRequest({
      creativeJobId: job.id,
      sourceVisualAssetId: v1.id,
      requestedByUserId: testUserId,
      instruction: 'Make the background marble darker with softer light',
      type: 'EDIT',
    });

    expect(revision.status).toBe('PENDING');

    // Attempting to create a second pending revision for the same job must fail
    await expect(
      creativeRevisionRepo!.createRequest({
        creativeJobId: job.id,
        sourceVisualAssetId: v1.id,
        requestedByUserId: testUserId,
        instruction: 'Duplicate pending revision',
        type: 'EDIT',
      }),
    ).rejects.toThrow();

    // Create V2 and complete revision
    const v2 = await visualAssetRepo!.createAsset({
      creativeJobId: job.id,
      assetRole: 'COMPOSITED_CREATIVE',
      mimeType: 'image/webp',
      width: 1080,
      height: 1080,
      byteSize: 750000,
      sha256: '6'.repeat(64),
      storageKey: 'cas/66/55/key6.webp',
      sourceProductAssetDigest: 'p'.repeat(64),
    });

    const completed = await creativeRevisionRepo!.completeRequest(revision.id, v2.id);
    expect(completed.status).toBe('COMPLETED');
    expect(completed.resultingVisualAssetId).toBe(v2.id);

    // Now no pending revision exists
    const active = await creativeRevisionRepo!.findActiveByJobId(job.id);
    expect(active).toBeNull();
  });
});
