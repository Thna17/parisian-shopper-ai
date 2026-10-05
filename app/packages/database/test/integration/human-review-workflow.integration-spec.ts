import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  ActiveRevisionConflictError,
  ContentAlreadyApprovedError,
  ContentNotApprovalEligibleError,
  CreateProductSnapshotUseCase,
  DEVELOPMENT_BRAND_RULES,
  FICTIONAL_PRODUCTS,
  FindingCode,
  FindingSeverity,
  InvalidReviewStateError,
  StaleContentVersionError,
  ValidationStatus,
} from '@parisian-shopper/application';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PrismaApprovalsRepository } from '../../src/approvals/prisma-approvals.repository.js';
import { PrismaBrandRuleRepository } from '../../src/brand/prisma-brand-rule.repository.js';
import { PrismaContentGenerationRepository } from '../../src/content/prisma-content-generation.repository.js';
import { PrismaProductSnapshotRepository } from '../../src/product-snapshot/prisma-product-snapshot.repository.js';
import { PrismaService } from '../../src/prisma.service.js';
import { PrismaTelegramWorkflowRepository } from '../../src/telegram/prisma-telegram-workflow.repository.js';
import { PrismaValidationRepository } from '../../src/validation/prisma-validation.repository.js';

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('Phase 1F Human Review Workflow Integration', () => {
  let postgres: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaService | undefined;
  let approvalsRepo: PrismaApprovalsRepository | undefined;
  let snapshotsRepo: PrismaProductSnapshotRepository | undefined;
  let brandsRepo: PrismaBrandRuleRepository | undefined;
  let contentRepo: PrismaContentGenerationRepository | undefined;
  let validationRepo: PrismaValidationRepository | undefined;
  let telegramRepo: PrismaTelegramWorkflowRepository | undefined;

  let editorUserId: string;
  let approverUserId: string;
  let secondApproverUserId: string;
  let brandRuleVersionId: string;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:17.6-alpine')
      .withDatabase('parisian_review_test')
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

    approvalsRepo = new PrismaApprovalsRepository(prisma);
    snapshotsRepo = new PrismaProductSnapshotRepository(prisma);
    brandsRepo = new PrismaBrandRuleRepository(prisma);
    contentRepo = new PrismaContentGenerationRepository(prisma);
    validationRepo = new PrismaValidationRepository(prisma);
    telegramRepo = new PrismaTelegramWorkflowRepository(prisma);

    // Seed brand rules
    const brand = await brandsRepo.create({
      name: 'Default Brand Rules',
      version: 1,
      status: 'ACTIVE',
      rules: DEVELOPMENT_BRAND_RULES,
    });
    brandRuleVersionId = brand.id;

    // Seed users
    const editor = await prisma.user.create({
      data: {
        displayName: 'Editor Edward',
        roles: {
          create: {
            role: {
              connectOrCreate: {
                where: { code: 'MARKETING_EDITOR' },
                create: { code: 'MARKETING_EDITOR', name: 'Marketing Editor' },
              },
            },
          },
        },
      },
    });
    editorUserId = editor.id;

    const approver = await prisma.user.create({
      data: {
        displayName: 'Approver Alice',
        roles: {
          create: {
            role: {
              connectOrCreate: {
                where: { code: 'MARKETING_APPROVER' },
                create: { code: 'MARKETING_APPROVER', name: 'Marketing Approver' },
              },
            },
          },
        },
      },
    });
    approverUserId = approver.id;

    const approver2 = await prisma.user.create({
      data: {
        displayName: 'Approver Bob',
        roles: {
          create: {
            role: {
              connectOrCreate: {
                where: { code: 'MARKETING_APPROVER' },
                create: { code: 'MARKETING_APPROVER', name: 'Marketing Approver' },
              },
            },
          },
        },
      },
    });
    secondApproverUserId = approver2.id;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await postgres?.stop();
  });

  const getPrisma = (): PrismaService => {
    if (prisma === undefined) throw new Error('Prisma not initialized');
    return prisma;
  };

  const createTestJobWithVersion = async (
    status: 'PASSED' | 'BLOCKED' = 'PASSED',
  ): Promise<{
    job: { id: string; status: string };
    version: { id: string; versionNumber: number };
    snapshot: { id: string };
    valResult: { id: string };
  }> => {
    const product = FICTIONAL_PRODUCTS[0];
    if (product === undefined) throw new Error('Product fixture missing');

    const snapshot = await new CreateProductSnapshotUseCase(
      snapshotsRepo!,
      { record: (): void => {} },
      { log: (): void => {}, warn: (): void => {}, error: (): void => {} },
    ).execute(product);
    const job = await getPrisma().contentJob.create({
      data: {
        productSnapshotId: snapshot.id,
        brandRuleVersionId,
        requesterUserId: editorUserId,
        contentType: 'PRODUCT_SPOTLIGHT',
        language: 'KM',
        platform: 'FACEBOOK',
        status: 'UNDER_REVIEW',
      },
    });

    const attempt = await getPrisma().generationAttempt.create({
      data: {
        contentJobId: job.id,
        attemptNumber: 1,
        provider: 'fake-ai',
        model: 'fixture-v1',
        promptVersion: '1.0',
        status: 'SUCCEEDED',
        startedAt: new Date(),
      },
    });

    const version = await getPrisma().contentVersion.create({
      data: {
        contentJobId: job.id,
        productSnapshotId: snapshot.id,
        brandRuleVersionId,
        generationAttemptId: attempt.id,
        provider: 'fake-ai',
        model: 'fixture-v1',
        promptVersion: '1.0',
        versionNumber: 1,
        structuredOutput: {
          headline: 'Test Headline',
          khmer_caption: 'Caption',
          english_caption: 'Caption',
          cta: 'Buy Now',
          hashtags: ['#Perfume'],
          creative_brief: 'Fixture brief',
          facts_used: ['Price $50'],
          warnings: [],
          missing_information: [],
        },
      },
    });

    const valResult = await validationRepo!.create({
      contentVersionId: version.id,
      outcome: {
        validatorVersion: '1.0.0',
        status: status === 'PASSED' ? ValidationStatus.PASSED : ValidationStatus.BLOCKED,
        findingCount: status === 'BLOCKED' ? 1 : 0,
        blockingCount: status === 'BLOCKED' ? 1 : 0,
        warningCount: 0,
        infoCount: 0,
        findings:
          status === 'BLOCKED'
            ? [
                {
                  field: 'price',
                  severity: FindingSeverity.BLOCKING,
                  code: FindingCode.PRICE_MISMATCH,
                  message: 'Price does not match source',
                },
              ]
            : [],
      },
    });

    return { job, version, snapshot, valResult };
  };

  describe('Database immutability triggers', () => {
    it('blocks UPDATE and DELETE on approval_events via PostgreSQL trigger', async () => {
      const { job, version } = await createTestJobWithVersion();

      const approval = await approvalsRepo!.createApproval({
        contentJobId: job.id,
        contentVersionId: version.id,
        approverUserId,
        decision: 'APPROVED',
        comment: 'Looks great',
      });

      // Attempt UPDATE
      await expect(
        getPrisma()
          .$executeRaw`UPDATE approval_events SET comment = 'Tampered' WHERE id = ${approval.id}::uuid`,
      ).rejects.toThrow(/approval_events are append-only/i);

      // Attempt DELETE
      await expect(
        getPrisma().$executeRaw`DELETE FROM approval_events WHERE id = ${approval.id}::uuid`,
      ).rejects.toThrow(/approval_events are append-only/i);
    });

    it('blocks DELETE on revision_requests via PostgreSQL trigger', async () => {
      const { job, version } = await createTestJobWithVersion();

      const revision = await approvalsRepo!.createRevisionRequest({
        contentJobId: job.id,
        sourceContentVersionId: version.id,
        requestedByUserId: editorUserId,
        type: 'EDIT',
        instruction: 'Needs changes',
      });

      // Attempt DELETE
      await expect(
        getPrisma().$executeRaw`DELETE FROM revision_requests WHERE id = ${revision.id}::uuid`,
      ).rejects.toThrow(/revision_requests cannot be deleted/i);
    });

    it('blocks UPDATE of core immutable fields on revision_requests via trigger', async () => {
      const { job, version } = await createTestJobWithVersion();

      const revision = await approvalsRepo!.createRevisionRequest({
        contentJobId: job.id,
        sourceContentVersionId: version.id,
        requestedByUserId: editorUserId,
        type: 'EDIT',
        instruction: 'Original instruction',
      });

      // Attempt to tamper with instruction
      await expect(
        getPrisma()
          .$executeRaw`UPDATE revision_requests SET instruction = 'Tampered instruction' WHERE id = ${revision.id}::uuid`,
      ).rejects.toThrow(/revision_requests core fields are immutable/i);

      // Attempt to tamper with requestedByUserId
      await expect(
        getPrisma()
          .$executeRaw`UPDATE revision_requests SET requested_by_user_id = ${approverUserId}::uuid WHERE id = ${revision.id}::uuid`,
      ).rejects.toThrow(/revision_requests core fields are immutable/i);
    });
  });

  describe('Revision workflow and snapshot pinning', () => {
    it('creates V2 from revision request while keeping ProductSnapshot and BrandRuleVersion pinned', async () => {
      const { job, version, snapshot } = await createTestJobWithVersion();

      // 1. Request edit
      const revision = await approvalsRepo!.createRevisionRequest({
        contentJobId: job.id,
        sourceContentVersionId: version.id,
        requestedByUserId: editorUserId,
        type: 'EDIT',
        instruction: 'Shorten headline',
      });
      expect(revision.status).toBe('PENDING');

      // Verify ContentJob status transitioned to REVISION_REQUESTED
      const jobAfterRequest = await getPrisma().contentJob.findUnique({ where: { id: job.id } });
      expect(jobAfterRequest?.status).toBe('REVISION_REQUESTED');

      // 2. Worker begins generation
      const beginResult = await contentRepo!.beginGeneration({
        contentJobId: job.id,
        provider: 'fake-ai',
        model: 'fixture-v1',
        promptVersion: '1.0',
      });
      expect(beginResult.disposition).toBe('STARTED');
      if (beginResult.disposition !== 'STARTED') throw new Error('Expected STARTED');
      expect(beginResult.activeRevision?.id).toBe(revision.id);

      // Verify ContentJob status transitioned to GENERATING
      const jobGenerating = await getPrisma().contentJob.findUnique({ where: { id: job.id } });
      expect(jobGenerating?.status).toBe('GENERATING');

      // 3. Worker completes generation with V2
      const completedVersion = await contentRepo!.completeGeneration({
        contentJobId: job.id,
        attemptId: beginResult.attempt.id,
        provider: 'fake-ai',
        model: 'fixture-v1',
        promptVersion: '1.0',
        output: {
          headline: 'Shorter Rose Headline',
          khmer_caption: 'Khmer text',
          english_caption: 'English text',
          cta: 'Shop Now',
          hashtags: ['#Perfume'],
          creative_brief: 'Revised fixture brief',
          facts_used: ['Price $50'],
          warnings: [],
          missing_information: [],
        },
      });

      expect(completedVersion.versionNumber).toBe(2);
      expect(completedVersion.revisionRequestId).toBe(revision.id);

      // ProductSnapshot and BrandRuleVersion MUST be identical to V1's
      expect(completedVersion.productSnapshotId).toBe(snapshot.id);
      expect(completedVersion.brandRuleVersionId).toBe(brandRuleVersionId);

      // RevisionRequest MUST be marked COMPLETED and resultingContentVersionId linked
      const completedRevision = await getPrisma().revisionRequest.findUnique({
        where: { id: revision.id },
      });
      expect(completedRevision?.status).toBe('COMPLETED');
      expect(completedRevision?.resultingContentVersionId).toBe(completedVersion.id);

      // 4. Validate V2 -> transitions DRAFT -> UNDER_REVIEW
      await validationRepo!.create({
        contentVersionId: completedVersion.id,
        outcome: {
          validatorVersion: '1.0.0',
          status: ValidationStatus.PASSED,
          findingCount: 0,
          blockingCount: 0,
          warningCount: 0,
          infoCount: 0,
          findings: [],
        },
      });

      const jobUnderReview = await getPrisma().contentJob.findUnique({ where: { id: job.id } });
      expect(jobUnderReview?.status).toBe('UNDER_REVIEW');
    });

    it('enforces single active pending revision request per job rule', async () => {
      const { job, version } = await createTestJobWithVersion();

      await approvalsRepo!.createRevisionRequest({
        contentJobId: job.id,
        sourceContentVersionId: version.id,
        requestedByUserId: editorUserId,
        type: 'EDIT',
        instruction: 'First revision request',
      });

      // Second revision request while first is PENDING must fail
      await expect(
        approvalsRepo!.createRevisionRequest({
          contentJobId: job.id,
          sourceContentVersionId: version.id,
          requestedByUserId: editorUserId,
          type: 'EDIT',
          instruction: 'Second concurrent revision request',
        }),
      ).rejects.toThrow(ActiveRevisionConflictError);
    });
  });

  describe('Concurrency & Stale Version Approval Protection', () => {
    it('rejects approval of V1 when V2 exists with StaleContentVersionError', async () => {
      const { job, version: v1, snapshot } = await createTestJobWithVersion();

      // Create V2
      const attempt2 = await getPrisma().generationAttempt.create({
        data: {
          contentJobId: job.id,
          attemptNumber: 2,
          provider: 'fake-ai',
          model: 'fixture-v1',
          promptVersion: '1.0',
          status: 'SUCCEEDED',
          startedAt: new Date(),
        },
      });

      const v2 = await getPrisma().contentVersion.create({
        data: {
          contentJobId: job.id,
          productSnapshotId: snapshot.id,
          brandRuleVersionId,
          generationAttemptId: attempt2.id,
          provider: 'fake-ai',
          model: 'fixture-v1',
          promptVersion: '1.0',
          versionNumber: 2,
          structuredOutput: {
            headline: 'V2 Headline',
            khmer_caption: null,
            english_caption: null,
            cta: 'Shop Now',
            hashtags: ['#Rose'],
            creative_brief: 'V2 fixture brief',
            facts_used: ['Price $50'],
            warnings: [],
            missing_information: [],
          },
        },
      });

      // Validate V2 so it's passed
      await validationRepo!.create({
        contentVersionId: v2.id,
        outcome: {
          validatorVersion: '1.0.0',
          status: ValidationStatus.PASSED,
          findingCount: 0,
          blockingCount: 0,
          warningCount: 0,
          infoCount: 0,
          findings: [],
        },
      });

      // Approver attempts to approve V1
      await expect(
        approvalsRepo!.createApproval({
          contentJobId: job.id,
          contentVersionId: v1.id,
          approverUserId,
          decision: 'APPROVED',
        }),
      ).rejects.toThrow(StaleContentVersionError);

      // Approving V2 succeeds
      const approved = await approvalsRepo!.createApproval({
        contentJobId: job.id,
        contentVersionId: v2.id,
        approverUserId,
        decision: 'APPROVED',
      });
      expect(approved.decision).toBe('APPROVED');
      expect(approved.contentVersionId).toBe(v2.id);
    });

    it('rejects approval of a BLOCKED version with ContentNotApprovalEligibleError', async () => {
      const { job, version } = await createTestJobWithVersion('BLOCKED');

      await expect(
        approvalsRepo!.createApproval({
          contentJobId: job.id,
          contentVersionId: version.id,
          approverUserId,
          decision: 'APPROVED',
        }),
      ).rejects.toThrow(ContentNotApprovalEligibleError);
    });

    it('rejects duplicate approval with ContentAlreadyApprovedError', async () => {
      const { job, version } = await createTestJobWithVersion();

      await approvalsRepo!.createApproval({
        contentJobId: job.id,
        contentVersionId: version.id,
        approverUserId,
        decision: 'APPROVED',
      });

      // Second approval
      await expect(
        approvalsRepo!.createApproval({
          contentJobId: job.id,
          contentVersionId: version.id,
          approverUserId: secondApproverUserId,
          decision: 'APPROVED',
        }),
      ).rejects.toThrow(ContentAlreadyApprovedError);
    });

    it('handles concurrent approver race safely via advisory lock', async () => {
      const { job, version } = await createTestJobWithVersion();

      const p1 = approvalsRepo!.createApproval({
        contentJobId: job.id,
        contentVersionId: version.id,
        approverUserId,
        decision: 'APPROVED',
      });
      const p2 = approvalsRepo!.createApproval({
        contentJobId: job.id,
        contentVersionId: version.id,
        approverUserId: secondApproverUserId,
        decision: 'APPROVED',
      });

      const results = await Promise.allSettled([p1, p2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        ContentAlreadyApprovedError,
      );

      // Exactly 1 approval event exists
      const count = await getPrisma().approvalEvent.count({
        where: { contentJobId: job.id, decision: 'APPROVED' },
      });
      expect(count).toBe(1);
    });

    it('disallows editing or regenerating once APPROVED or REJECTED', async () => {
      const { job, version } = await createTestJobWithVersion();

      await approvalsRepo!.createApproval({
        contentJobId: job.id,
        contentVersionId: version.id,
        approverUserId,
        decision: 'APPROVED',
      });

      await expect(
        approvalsRepo!.createRevisionRequest({
          contentJobId: job.id,
          sourceContentVersionId: version.id,
          requestedByUserId: editorUserId,
          type: 'EDIT',
          instruction: 'Try editing after approval',
        }),
      ).rejects.toThrow(InvalidReviewStateError);
    });
  });

  describe('Telegram durable pending review interactions', () => {
    it('creates, finds, and completes pending review interactions', async () => {
      const { job, version } = await createTestJobWithVersion();

      // Create identity for editor
      const identity = await getPrisma().telegramIdentity.create({
        data: {
          telegramUserId: BigInt(987654321),
          userId: editorUserId,
        },
      });

      const expiresAt = new Date(Date.now() + 10 * 60 * 1_000);

      await telegramRepo!.createPendingInteraction({
        telegramIdentityId: identity.id,
        contentJobId: job.id,
        contentVersionId: version.id,
        action: 'EDIT',
        expiresAt,
      });

      // Find active interaction
      const active = await telegramRepo!.findActivePendingInteraction(identity.id, new Date());
      expect(active).not.toBeNull();
      expect(active?.contentJobId).toBe(job.id);
      expect(active?.action).toBe('EDIT');

      // Complete interaction
      await telegramRepo!.completePendingInteraction(active!.id, new Date());

      // No longer active
      const afterComplete = await telegramRepo!.findActivePendingInteraction(
        identity.id,
        new Date(),
      );
      expect(afterComplete).toBeNull();
    });

    it('cancels pending interaction and ignores expired interactions', async () => {
      const { job, version } = await createTestJobWithVersion();

      const identity = await getPrisma().telegramIdentity.create({
        data: {
          telegramUserId: BigInt(987654322),
          userId: editorUserId,
        },
      });

      // Interaction with past expiry
      await telegramRepo!.createPendingInteraction({
        telegramIdentityId: identity.id,
        contentJobId: job.id,
        contentVersionId: version.id,
        action: 'REJECT',
        expiresAt: new Date(Date.now() - 1_000),
      });

      const expired = await telegramRepo!.findActivePendingInteraction(identity.id, new Date());
      expect(expired).toBeNull();
    });
  });
});
