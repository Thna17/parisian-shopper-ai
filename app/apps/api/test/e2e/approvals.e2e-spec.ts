/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { createHash } from 'node:crypto';
import { type Server } from 'node:http';
import { jest } from '@jest/globals';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  APPROVALS_REPOSITORY,
  type ApprovalsRepository,
  type ApprovalEventRecord,
  Argon2PasswordHasher,
  type AuthenticatedUserAccount,
  CAMPAIGN_REPOSITORY,
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
  type ContentJob,
  type ContentVersion,
  FICTIONAL_PRODUCTS,
  PASSWORD_CREDENTIAL_REPOSITORY,
  PASSWORD_HASHER,
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshot,
  type ProductSnapshotRepository,
  resolvePermissionsForRoles,
  SelfApprovalProhibitedError,
  ContentAlreadyApprovedError,
  ContentAlreadyRejectedError,
  USER_ACCOUNT_REPOSITORY,
  type UserAccountRepository,
  USER_SESSION_REPOSITORY,
  type UserSessionRecord,
  type UserSessionRepository,
  VALIDATION_REPOSITORY,
  type ValidationRepository,
  type PersistedValidationResult,
} from '@parisian-shopper/application';
import { DatabaseHealthIndicator, PrismaService } from '@parisian-shopper/database';
import {
  ContentGenerationQueue,
  CreativeGenerationQueue,
  ValkeyConnectionService,
} from '@parisian-shopper/jobs';
import request from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { configureApi } from '../../src/bootstrap.js';

describe('Four-Eyes Approvals Review Desk API Integration (e2e)', () => {
  let application: INestApplication;
  let server: Server;

  // Actors
  const requesterUserId = '00000000-0000-4000-8000-000000000001';
  const independentApproverUserId = '00000000-0000-4000-8000-000000000002';
  const revisionAuthorUserId = '00000000-0000-4000-8000-000000000003';
  const unauthorizedUserId = '00000000-0000-4000-8000-000000000004';

  // Sessions
  const requesterSessionToken = 'test-ps-session-requester';
  const requesterTokenHash = createHash('sha256').update(requesterSessionToken).digest('hex');

  const approverSessionToken = 'test-ps-session-approver';
  const approverTokenHash = createHash('sha256').update(approverSessionToken).digest('hex');

  const revisionAuthorSessionToken = 'test-ps-session-revision-author';
  const revisionAuthorTokenHash = createHash('sha256')
    .update(revisionAuthorSessionToken)
    .digest('hex');

  const unauthorizedSessionToken = 'test-ps-session-unauthorized';
  const unauthorizedTokenHash = createHash('sha256').update(unauthorizedSessionToken).digest('hex');

  const sampleSnapshot: ProductSnapshot = {
    id: '4b68e914-7e04-4ec5-b6d8-f860189d2d01',
    product: {
      ...FICTIONAL_PRODUCTS[0]!,
      product: {
        ...FICTIONAL_PRODUCTS[0]!.product,
        sku: 'FIC-PERF-001',
        product_name: 'Moonlit River Eau de Parfum',
        price: '38.00',
        priceUsd: 38.0,
      },
    },
    snapshotHash: 'hash-abc-001',
    normalizerVersion: 'phase-1b-v1',
    createdAt: new Date('2026-10-24T12:00:00.000Z'),
  };

  // Content Jobs
  const testJobId = '00000000-0000-4000-8000-000000000010';
  const testVersionId = '00000000-0000-4000-8000-000000000011';
  const revisedVersionId = '00000000-0000-4000-8000-000000000021';

  let jobState: ContentJob = {
    id: testJobId,
    productSnapshotId: sampleSnapshot.id,
    brandRuleVersionId: 'rule-001',
    requesterUserId,
    campaignId: 'camp-seed-001',
    contentType: 'PRODUCT_SPOTLIGHT',
    language: 'EN',
    platform: 'INSTAGRAM',
    campaignContext: 'Four-Eyes Review Integration Test',
    status: 'UNDER_REVIEW',
    createdAt: new Date('2026-10-29T10:00:00.000Z'),
    updatedAt: new Date('2026-10-29T10:00:00.000Z'),
  };

  const sampleVersion: ContentVersion = {
    id: testVersionId,
    contentJobId: testJobId,
    versionNumber: 1,
    brandRuleVersionId: 'rule-001',
    productSnapshotId: sampleSnapshot.id,
    generationAttemptId: '00000000-0000-4000-8000-000000000012',
    provider: 'fake',
    model: 'deterministic-test',
    promptVersion: '1.0',
    structuredOutput: {
      headline: 'Moonlit River Luxury EDP',
      english_caption: 'A sensory voyage to Grasse with notes of Damask rose.',
      khmer_caption: null,
      cta: 'Discover the Essence',
      hashtags: ['#MoonlitRiver', '#ParisianShopper'],
      creative_brief: 'Luxury fragrance spotlight',
      facts_used: ['Moonlit River', '38.00'],
      warnings: [],
      missing_information: [],
    },
    createdAt: new Date('2026-10-29T10:00:03.000Z'),
  };

  const revisedVersion: ContentVersion = {
    id: revisedVersionId,
    contentJobId: testJobId,
    versionNumber: 2,
    brandRuleVersionId: 'rule-001',
    productSnapshotId: sampleSnapshot.id,
    generationAttemptId: '00000000-0000-4000-8000-000000000022',
    revisionRequestId: 'rev-req-author-003',
    provider: 'fake',
    model: 'deterministic-test',
    promptVersion: '1.0',
    structuredOutput: {
      headline: 'Moonlit River Refined Edition',
      english_caption: 'Captivating fragrance with pure pear and jasmine.',
      khmer_caption: null,
      cta: 'Explore Scent',
      hashtags: ['#MoonlitRiver'],
      creative_brief: 'Refined revision',
      facts_used: ['Moonlit River', '38.00'],
      warnings: [],
      missing_information: [],
    },
    createdAt: new Date('2026-10-29T10:05:00.000Z'),
  };

  const sampleValidation: PersistedValidationResult = {
    id: '00000000-0000-4000-8000-000000000013',
    contentVersionId: testVersionId,
    validatorVersion: '1.0',
    status: 'PASSED',
    findingCount: 0,
    blockingCount: 0,
    warningCount: 0,
    infoCount: 0,
    createdAt: new Date('2026-10-29T10:00:04.000Z'),
    findings: [],
  };

  const approvalEvents: ApprovalEventRecord[] = [];

  const mockApprovalsRepo: ApprovalsRepository = {
    async createRevisionRequest() {
      throw new Error('Not implemented in test');
    },
    async findActiveRevisionRequest() {
      return null;
    },
    async findRevisionRequestsByJobId() {
      return [
        {
          id: 'rev-req-author-003',
          contentJobId: testJobId,
          sourceContentVersionId: testVersionId,
          requestedByUserId: revisionAuthorUserId,
          type: 'EDIT',
          instruction: 'Improve headline tone',
          status: 'COMPLETED',
          resultingContentVersionId: revisedVersionId,
          createdAt: new Date('2026-10-29T10:04:00.000Z'),
        },
      ];
    },
    async createApproval(input) {
      if (jobState.status === 'APPROVED') {
        throw new ContentAlreadyApprovedError('Content has already been approved.');
      }
      if (jobState.status === 'REJECTED') {
        throw new ContentAlreadyRejectedError('Content has already been rejected.');
      }

      if (input.decision === 'APPROVED') {
        if (jobState.requesterUserId === input.approverUserId) {
          throw new SelfApprovalProhibitedError(
            'Four-eyes policy violation: Content job requester cannot approve their own content.',
          );
        }
        if (
          input.contentVersionId === revisedVersionId &&
          input.approverUserId === revisionAuthorUserId
        ) {
          throw new SelfApprovalProhibitedError(
            'Four-eyes policy violation: Version author cannot approve their own content revision.',
          );
        }
      }

      const event: ApprovalEventRecord = {
        id: `appr-ev-${Date.now()}`,
        contentJobId: input.contentJobId,
        contentVersionId: input.contentVersionId,
        approverUserId: input.approverUserId,
        approverDisplayName: 'Approver Name',
        decision: input.decision,
        comment: input.comment,
        validationResultId: input.validationResultId,
        createdAt: new Date(),
      };

      approvalEvents.push(event);
      jobState = { ...jobState, status: input.decision, updatedAt: new Date() };
      return event;
    },
    async findApprovalEventByJobId() {
      return approvalEvents[approvalEvents.length - 1] ?? null;
    },
    async findApprovalEventsByJobId() {
      return [...approvalEvents];
    },
    async findReviewQueue(query) {
      if (query.status === 'UNDER_REVIEW' && jobState.status !== 'UNDER_REVIEW') {
        return { items: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      }
      if (query.status === 'HISTORY' && jobState.status === 'UNDER_REVIEW') {
        return { items: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      }

      return {
        items: [
          {
            jobId: jobState.id,
            jobStatus: jobState.status,
            productSnapshotId: sampleSnapshot.id,
            sku: 'FIC-PERF-001',
            productName: 'Moonlit River Eau de Parfum',
            brand: 'Maison Imaginaire',
            priceUsd: 38,
            requesterUserId: jobState.requesterUserId,
            requesterDisplayName: 'Requester Employee',
            currentVersionNumber: 1,
            targetVersionId: sampleVersion.id,
            targetVersionNumber: 1,
            targetVersionAuthorUserId: requesterUserId,
            headline: 'Moonlit River Luxury EDP',
            validationStatus: 'PASSED',
            blockingCount: 0,
            warningCount: 0,
            submittedAt: sampleVersion.createdAt,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };
    },
    async getReviewState() {
      return {
        jobId: jobState.id,
        jobStatus: jobState.status,
        productSnapshotId: sampleSnapshot.id,
        sku: 'FIC-PERF-001',
        productName: 'Moonlit River Eau de Parfum',
        requesterUserId: jobState.requesterUserId,
        currentVersionNumber: 1,
        versions: [
          {
            id: sampleVersion.id,
            versionNumber: 1,
            authorUserId: requesterUserId,
            createdAt: sampleVersion.createdAt,
            validationStatus: 'PASSED',
            blockingCount: 0,
            approvalEligible: true,
            headline: 'Moonlit River Luxury EDP',
          },
        ],
      };
    },
    async getApprovalStatus() {
      return {
        jobId: jobState.id,
        jobStatus: jobState.status,
        latestVersionNumber: 1,
      };
    },
    async createPendingInteraction() {
      throw new Error('Not implemented in test');
    },
    async findActivePendingInteraction() {
      return null;
    },
    async completePendingInteraction() {},
    async cancelPendingInteraction() {},
  };

  const mockContentRepo: ContentGenerationRepository = {
    async createJob() {
      throw new Error('Not implemented');
    },
    async findJobById(id) {
      if (id === testJobId) return jobState;
      return null;
    },
    async findPaginatedJobs() {
      return { items: [jobState], total: 1, page: 1, limit: 20, totalPages: 1 };
    },
    async updateJobStatus(id, status) {
      jobState = { ...jobState, status, updatedAt: new Date() };
      return jobState;
    },
    async findVersionById(id) {
      if (id === testVersionId) return sampleVersion;
      if (id === revisedVersionId) return revisedVersion;
      return null;
    },
    async findVersionsByJobId() {
      return [sampleVersion, revisedVersion];
    },
    async findAttemptsByJobId() {
      return [];
    },
    async createDirectVersion() {
      throw new Error('Not implemented');
    },
  };

  const mockUserAccountRepo: UserAccountRepository = {
    async findById(id: string): Promise<AuthenticatedUserAccount | null> {
      if (id === requesterUserId) {
        return {
          id: requesterUserId,
          email: 'requester@parisian-shopper.test',
          displayName: 'Marketing Requester',
          status: 'ACTIVE',
          disabledAt: null,
          roles: ['MARKETING_APPROVER'], // Even with APPROVER role, self-approval must be blocked!
          permissions: resolvePermissionsForRoles(['MARKETING_APPROVER']),
          passwordCredential: null,
          createdAt: new Date(),
        };
      }
      if (id === independentApproverUserId) {
        return {
          id: independentApproverUserId,
          email: 'independent@parisian-shopper.test',
          displayName: 'Independent Approver',
          status: 'ACTIVE',
          disabledAt: null,
          roles: ['MARKETING_APPROVER'],
          permissions: resolvePermissionsForRoles(['MARKETING_APPROVER']),
          passwordCredential: null,
          createdAt: new Date(),
        };
      }
      if (id === revisionAuthorUserId) {
        return {
          id: revisionAuthorUserId,
          email: 'author@parisian-shopper.test',
          displayName: 'Revision Author',
          status: 'ACTIVE',
          disabledAt: null,
          roles: ['MARKETING_APPROVER'],
          permissions: resolvePermissionsForRoles(['MARKETING_APPROVER']),
          passwordCredential: null,
          createdAt: new Date(),
        };
      }
      if (id === unauthorizedUserId) {
        return {
          id: unauthorizedUserId,
          email: 'unauth@parisian-shopper.test',
          displayName: 'No Perms User',
          status: 'ACTIVE',
          disabledAt: null,
          roles: [],
          permissions: [],
          passwordCredential: null,
          createdAt: new Date(),
        };
      }
      return null;
    },
    async findByEmail(): Promise<AuthenticatedUserAccount | null> {
      return null;
    },
  };

  const mockUserSessionRepo: UserSessionRepository = {
    async findActiveByTokenHash(tokenHash: string): Promise<UserSessionRecord | null> {
      if (tokenHash === requesterTokenHash) {
        return {
          id: 'sess-requester',
          userId: requesterUserId,
          tokenHash: requesterTokenHash,
          expiresAt: new Date(Date.now() + 60_000),
          createdAt: new Date(),
          lastSeenAt: new Date(),
          idleExpiresAt: new Date(Date.now() + 60_000),
        };
      }
      if (tokenHash === approverTokenHash) {
        return {
          id: 'sess-approver',
          userId: independentApproverUserId,
          tokenHash: approverTokenHash,
          expiresAt: new Date(Date.now() + 60_000),
          createdAt: new Date(),
          lastSeenAt: new Date(),
          idleExpiresAt: new Date(Date.now() + 60_000),
        };
      }
      if (tokenHash === revisionAuthorTokenHash) {
        return {
          id: 'sess-revision-author',
          userId: revisionAuthorUserId,
          tokenHash: revisionAuthorTokenHash,
          expiresAt: new Date(Date.now() + 60_000),
          createdAt: new Date(),
          lastSeenAt: new Date(),
          idleExpiresAt: new Date(Date.now() + 60_000),
        };
      }
      if (tokenHash === unauthorizedTokenHash) {
        return {
          id: 'sess-unauth',
          userId: unauthorizedUserId,
          tokenHash: unauthorizedTokenHash,
          expiresAt: new Date(Date.now() + 60_000),
          createdAt: new Date(),
          lastSeenAt: new Date(),
          idleExpiresAt: new Date(Date.now() + 60_000),
        };
      }
      return null;
    },
    async create(): Promise<UserSessionRecord> {
      throw new Error('Not implemented');
    },
    async touch(): Promise<void> {},
    async revoke(): Promise<void> {},
    async revokeAllForUser(): Promise<void> {},
  };

  const mockProductSnapshotRepo: ProductSnapshotRepository = {
    async findById(id: string): Promise<ProductSnapshot | null> {
      if (id === sampleSnapshot.id) return sampleSnapshot;
      return null;
    },
    async findLatestBySku(): Promise<ProductSnapshot | null> {
      return sampleSnapshot;
    },
    async create(): Promise<ProductSnapshot> {
      return sampleSnapshot;
    },
    async listSnapshots(): Promise<{
      items: ProductSnapshot[];
      total: number;
      page: number;
      limit: number;
    }> {
      return { items: [sampleSnapshot], total: 1, page: 1, limit: 20 };
    },
  };

  const mockValidationRepo: ValidationRepository = {
    async createValidationResult() {
      return sampleValidation;
    },
    async findLatestByContentVersion() {
      return sampleValidation;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        $disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      })
      .overrideProvider(DatabaseHealthIndicator)
      .useValue({ isHealthy: jest.fn().mockResolvedValue(true) })
      .overrideProvider(ValkeyConnectionService)
      .useValue({ getClient: jest.fn().mockReturnValue({ status: 'ready' }) })
      .overrideProvider(ContentGenerationQueue)
      .useValue({ addJob: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(CreativeGenerationQueue)
      .useValue({ addJob: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(PASSWORD_HASHER)
      .useValue(new Argon2PasswordHasher())
      .overrideProvider(PASSWORD_CREDENTIAL_REPOSITORY)
      .useValue({})
      .overrideProvider(USER_ACCOUNT_REPOSITORY)
      .useValue(mockUserAccountRepo)
      .overrideProvider(USER_SESSION_REPOSITORY)
      .useValue(mockUserSessionRepo)
      .overrideProvider(PRODUCT_SNAPSHOT_REPOSITORY)
      .useValue(mockProductSnapshotRepo)
      .overrideProvider(CAMPAIGN_REPOSITORY)
      .useValue({
        findById: jest.fn<() => Promise<unknown>>().mockResolvedValue({
          id: 'camp-seed-001',
          code: 'CAMP-SPRING-2026',
          name: 'Spring Fragrance Launch',
          status: 'ACTIVE',
          objective: 'Brand Awareness',
        }),
      })
      .overrideProvider(CONTENT_GENERATION_REPOSITORY)
      .useValue(mockContentRepo)
      .overrideProvider(VALIDATION_REPOSITORY)
      .useValue(mockValidationRepo)
      .overrideProvider(APPROVALS_REPOSITORY)
      .useValue(mockApprovalsRepo)
      .compile();

    application = moduleRef.createNestApplication();
    configureApi(application);
    await application.init();
    server = application.getHttpServer() as Server;
  });

  afterAll(async () => {
    await application.close();
  });

  beforeEach(() => {
    jobState = {
      ...jobState,
      status: 'UNDER_REVIEW',
    };
    approvalEvents.length = 0;
  });

  describe('Pending Review Queue (GET /v1/approvals/pending)', () => {
    it('REVIEW-E2E-01: returns pending review items with Four-Eyes eligibility calculation for independent approver', async () => {
      const response = await request(server)
        .get('/v1/approvals/pending')
        .set('Cookie', [`ps_session=${approverSessionToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      const item = response.body.items[0];
      expect(item.jobId).toBe(testJobId);
      expect(item.sku).toBe('FIC-PERF-001');
      expect(item.priceUsd).toBe(38);
      expect(item.isEligibleToApprove).toBe(true);
      expect(item.ineligibilityReasons).toHaveLength(0);
    });

    it('REVIEW-E2E-02: marks isEligibleToApprove = false and SELF_REQUESTED for content job requester', async () => {
      const response = await request(server)
        .get('/v1/approvals/pending')
        .set('Cookie', [`ps_session=${requesterSessionToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      const item = response.body.items[0];
      expect(item.jobId).toBe(testJobId);
      expect(item.isEligibleToApprove).toBe(false);
      expect(item.ineligibilityReasons).toContain('SELF_REQUESTED');
    });

    it('REVIEW-E2E-03: returns 401 Unauthorized when session cookie is missing', async () => {
      const response = await request(server).get('/v1/approvals/pending');
      expect(response.status).toBe(401);
    });
  });

  describe('Review Desk Detail (GET /v1/approvals/:id)', () => {
    it('REVIEW-E2E-04: returns complete review desk state with product MSRP truth and eligibility breakdown', async () => {
      const response = await request(server)
        .get(`/v1/approvals/${testJobId}`)
        .set('Cookie', [`ps_session=${approverSessionToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.job.id).toBe(testJobId);
      expect(response.body.productSnapshot.sku).toBe('FIC-PERF-001');
      expect(response.body.productSnapshot.priceUsd).toBe(38);
      expect(response.body.eligibility.canApprove).toBe(true);
      expect(response.body.eligibility.selfRequested).toBe(false);
    });

    it('REVIEW-E2E-05: returns selfRequested = true when requester inspects review desk', async () => {
      const response = await request(server)
        .get(`/v1/approvals/${testJobId}`)
        .set('Cookie', [`ps_session=${requesterSessionToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.eligibility.canApprove).toBe(false);
      expect(response.body.eligibility.selfRequested).toBe(true);
      expect(response.body.eligibility.ineligibilityReasons).toContain('SELF_REQUESTED');
    });
  });

  describe('Authoritative Four-Eyes Approval (POST /v1/approvals/:id/approve)', () => {
    it('REVIEW-E2E-06: independent approver approves exact version successfully', async () => {
      const response = await request(server)
        .post(`/v1/approvals/${testJobId}/approve`)
        .set('Cookie', [`ps_session=${approverSessionToken}`, 'ps_csrf=test-csrf-token'])
        .set('x-csrf-token', 'test-csrf-token')
        .send({
          versionId: testVersionId,
          comment: 'Approved against catalog MSRP truth.',
        });

      expect(response.status).toBe(200);
      expect(response.body.decision).toBe('APPROVED');
      expect(response.body.approverUserId).toBe(independentApproverUserId);
      expect(response.body.comment).toBe('Approved against catalog MSRP truth.');
      expect(jobState.status).toBe('APPROVED');
    });

    it('REVIEW-E2E-07: SEC-002: requester self-approval is authoritatively BLOCKED with 403 Forbidden even with approver role', async () => {
      const response = await request(server)
        .post(`/v1/approvals/${testJobId}/approve`)
        .set('Cookie', [`ps_session=${requesterSessionToken}`, 'ps_csrf=test-csrf-token'])
        .set('x-csrf-token', 'test-csrf-token')
        .send({
          versionId: testVersionId,
          comment: 'Attempting self-approval.',
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('SELF_APPROVAL_PROHIBITED');
      expect(jobState.status).toBe('UNDER_REVIEW');
    });

    it('REVIEW-E2E-08: revision author self-approval is authoritatively BLOCKED with 403 Forbidden', async () => {
      const response = await request(server)
        .post(`/v1/approvals/${testJobId}/approve`)
        .set('Cookie', [`ps_session=${revisionAuthorSessionToken}`, 'ps_csrf=test-csrf-token'])
        .set('x-csrf-token', 'test-csrf-token')
        .send({
          versionId: revisedVersionId,
          comment: 'Attempting author self-approval of revised version.',
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('SELF_APPROVAL_PROHIBITED');
      expect(jobState.status).toBe('UNDER_REVIEW');
    });

    it('REVIEW-E2E-09: double approval attempt returns 409 Conflict', async () => {
      // First approval
      await request(server)
        .post(`/v1/approvals/${testJobId}/approve`)
        .set('Cookie', [`ps_session=${approverSessionToken}`, 'ps_csrf=test-csrf-token'])
        .set('x-csrf-token', 'test-csrf-token')
        .send({ versionId: testVersionId });

      expect(jobState.status).toBe('APPROVED');

      // Second approval attempt
      const secondResponse = await request(server)
        .post(`/v1/approvals/${testJobId}/approve`)
        .set('Cookie', [`ps_session=${approverSessionToken}`, 'ps_csrf=test-csrf-token'])
        .set('x-csrf-token', 'test-csrf-token')
        .send({ versionId: testVersionId });

      expect(secondResponse.status).toBe(409);
      expect(secondResponse.body.error.code).toBe('CONTENT_ALREADY_APPROVED');
    });
  });

  describe('Rejection Decision (POST /v1/approvals/:id/reject)', () => {
    it('REVIEW-E2E-10: rejects content version with mandatory reason and transitions job to REJECTED', async () => {
      const response = await request(server)
        .post(`/v1/approvals/${testJobId}/reject`)
        .set('Cookie', [`ps_session=${approverSessionToken}`, 'ps_csrf=test-csrf-token'])
        .set('x-csrf-token', 'test-csrf-token')
        .send({
          versionId: testVersionId,
          reason: 'Headline claim does not match catalog fragrance notes.',
        });

      expect(response.status).toBe(200);
      expect(response.body.decision).toBe('REJECTED');
      expect(response.body.comment).toBe('Headline claim does not match catalog fragrance notes.');
      expect(jobState.status).toBe('REJECTED');
    });

    it('REVIEW-E2E-11: returns 400 Bad Request when rejection reason is missing or too short', async () => {
      const response = await request(server)
        .post(`/v1/approvals/${testJobId}/reject`)
        .set('Cookie', [`ps_session=${approverSessionToken}`, 'ps_csrf=test-csrf-token'])
        .set('x-csrf-token', 'test-csrf-token')
        .send({
          versionId: testVersionId,
          reason: 'No',
        });

      expect(response.status).toBe(400);
      expect(jobState.status).toBe('UNDER_REVIEW');
    });
  });
});
