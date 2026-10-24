import { describe, expect, it, jest } from '@jest/globals';
import { ForbiddenError, ValidationError } from '@parisian-shopper/common';
import { PermissionService } from '../../auth/domain/permissions.js';
import {
  type BeginGenerationInput,
  type BeginGenerationResult,
  type CompleteGenerationInput,
  type ContentGenerationRepository,
  type ContentJob,
  type ContentVersion,
  type CreateContentJobInput,
  type CreateDirectVersionInput,
  type FailGenerationInput,
  type GenerationAttempt,
} from './content-generation.repository.js';
import { ReviseContentUseCase } from './revise-content.use-case.js';
import { ValidateContentVersionUseCase } from '../../validation/application/validate-content-version.use-case.js';
import { type PersistedValidationResult } from '../../validation/application/validation.repository.js';

describe('ReviseContentUseCase', () => {
  const permissions = new PermissionService();

  const mockVersion1: ContentVersion = {
    id: 'ver-1',
    contentJobId: 'job-c1',
    versionNumber: 1,
    brandRuleVersionId: 'rule-1',
    productSnapshotId: 'snap-1',
    generationAttemptId: 'att-1',
    provider: 'MOCK_PROVIDER',
    model: 'mock-model-v1',
    promptVersion: '1.0',
    structuredOutput: {
      headline: 'Parisian Elegance Original',
      english_caption: 'Experience the authentic fragrance of Paris.',
      khmer_caption: 'បទពិសោធន៍ក្លិនក្រអូបពិតប្រាកដពីប៉ារីស',
      cta: 'Shop Now',
      hashtags: ['#perfume'],
      creative_brief: 'Parisian brief',
      facts_used: ['Geparlys'],
      warnings: [],
      missing_information: [],
    },
    createdAt: new Date('2026-10-15T10:00:00Z'),
  };

  const mockValidationResult: PersistedValidationResult = {
    id: 'val-res-1',
    contentVersionId: 'ver-2',
    validatorVersion: 'v1',
    status: 'PASSED',
    findingCount: 0,
    blockingCount: 0,
    warningCount: 0,
    infoCount: 0,
    createdAt: new Date(),
    findings: [],
  };

  interface MockRepoFixture {
    readonly repo: ContentGenerationRepository;
    readonly getCreatedVersion: () => ContentVersion | null;
  }

  function createMockRepo(currentVersion: ContentVersion = mockVersion1): MockRepoFixture {
    let createdVersion: ContentVersion | null = null;
    const repo: ContentGenerationRepository = {
      createJob: jest.fn((_input: CreateContentJobInput): Promise<ContentJob> => {
        throw new Error('Not implemented');
      }),
      findJobById: jest.fn((_id: string): Promise<ContentJob | null> => Promise.resolve(null)),
      findAttemptsByJobId: jest.fn((_jobId: string): Promise<readonly GenerationAttempt[]> =>
        Promise.resolve([]),
      ),
      findVersionById: jest.fn((id: string): Promise<ContentVersion | null> =>
        Promise.resolve(id === currentVersion.id ? currentVersion : null),
      ),
      createDirectVersion: jest.fn((input: CreateDirectVersionInput): Promise<ContentVersion> => {
        createdVersion = {
          id: 'ver-2',
          contentJobId: input.contentJobId,
          versionNumber: currentVersion.versionNumber + 1,
          brandRuleVersionId: currentVersion.brandRuleVersionId,
          productSnapshotId: currentVersion.productSnapshotId,
          generationAttemptId: 'att-direct',
          provider: input.provider,
          model: input.model,
          promptVersion: input.promptVersion,
          structuredOutput: input.output,
          createdAt: new Date(),
        };
        return Promise.resolve(createdVersion);
      }),
      beginGeneration: jest.fn((_input: BeginGenerationInput): Promise<BeginGenerationResult> => {
        throw new Error('Not implemented');
      }),
      completeGeneration: jest.fn((_input: CompleteGenerationInput): Promise<ContentVersion> =>
        Promise.resolve(mockVersion1),
      ),
      failGeneration: jest.fn((_input: FailGenerationInput): Promise<void> => Promise.resolve()),
      findVersionsByJobId: jest.fn((_jobId: string): Promise<readonly ContentVersion[]> =>
        Promise.resolve([mockVersion1]),
      ),
    };
    return { repo, getCreatedVersion: () => createdVersion };
  }

  describe('RBAC Permissions', () => {
    it('throws ForbiddenError when actor lacks EDIT_CONTENT permission', async () => {
      const { repo } = createMockRepo();
      const validateExecuteMock = jest.fn(
        (_versionId: string): Promise<PersistedValidationResult> =>
          Promise.resolve(mockValidationResult),
      );
      const validateUseCase = {
        execute: validateExecuteMock,
      } as unknown as ValidateContentVersionUseCase;
      const useCase = new ReviseContentUseCase(repo, validateUseCase, permissions);

      await expect(
        useCase.editField({
          contentJobId: 'job-c1',
          contentVersionId: 'ver-1',
          field: 'headline',
          newValue: 'New Headline',
          actorUserId: 'user-viewer',
          actorRoles: ['VIEWER'],
        }),
      ).rejects.toThrow(ForbiddenError);

      await expect(
        useCase.changeLanguage({
          contentJobId: 'job-c1',
          contentVersionId: 'ver-1',
          targetLanguage: 'EN',
          actorUserId: 'user-viewer',
          actorRoles: ['VIEWER'],
        }),
      ).rejects.toThrow(ForbiddenError);

      await expect(
        useCase.restoreVersion({
          contentJobId: 'job-c1',
          targetVersionId: 'ver-1',
          actorUserId: 'user-viewer',
          actorRoles: ['VIEWER'],
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('editField', () => {
    it('rejects empty input value', async () => {
      const { repo } = createMockRepo();
      const validateExecuteMock = jest.fn(
        (_versionId: string): Promise<PersistedValidationResult> =>
          Promise.resolve(mockValidationResult),
      );
      const validateUseCase = {
        execute: validateExecuteMock,
      } as unknown as ValidateContentVersionUseCase;
      const useCase = new ReviseContentUseCase(repo, validateUseCase, permissions);

      await expect(
        useCase.editField({
          contentJobId: 'job-c1',
          contentVersionId: 'ver-1',
          field: 'headline',
          newValue: '   ',
          actorUserId: 'user-editor',
          actorRoles: ['MARKETING_EDITOR'],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects nonexistent content version', async () => {
      const { repo } = createMockRepo();
      const validateExecuteMock = jest.fn(
        (_versionId: string): Promise<PersistedValidationResult> =>
          Promise.resolve(mockValidationResult),
      );
      const validateUseCase = {
        execute: validateExecuteMock,
      } as unknown as ValidateContentVersionUseCase;
      const useCase = new ReviseContentUseCase(repo, validateUseCase, permissions);

      await expect(
        useCase.editField({
          contentJobId: 'job-c1',
          contentVersionId: 'ver-nonexistent',
          field: 'headline',
          newValue: 'Updated Headline',
          actorUserId: 'user-editor',
          actorRoles: ['MARKETING_EDITOR'],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('creates an immutable new version with updated headline and runs factual validation', async () => {
      const { repo } = createMockRepo();
      const validateExecuteMock = jest.fn(
        (_versionId: string): Promise<PersistedValidationResult> =>
          Promise.resolve(mockValidationResult),
      );
      const validateUseCase = {
        execute: validateExecuteMock,
      } as unknown as ValidateContentVersionUseCase;
      const useCase = new ReviseContentUseCase(repo, validateUseCase, permissions);

      const result = await useCase.editField({
        contentJobId: 'job-c1',
        contentVersionId: 'ver-1',
        field: 'headline',
        newValue: 'Scent of the Tuileries',
        actorUserId: 'user-editor',
        actorRoles: ['MARKETING_EDITOR'],
      });

      expect(result.version.id).toBe('ver-2');
      expect(result.version.structuredOutput.headline).toBe('Scent of the Tuileries');
      // Preserves untouched fields
      expect(result.version.structuredOutput.english_caption).toBe(
        mockVersion1.structuredOutput.english_caption,
      );
      expect(result.version.structuredOutput.khmer_caption).toBe(
        mockVersion1.structuredOutput.khmer_caption,
      );
      expect(result.version.structuredOutput.cta).toBe(mockVersion1.structuredOutput.cta);

      // Verifies validation execution on the new version ID
      expect(validateExecuteMock).toHaveBeenCalledWith('ver-2');
      expect(result.validationResult).toBe(mockValidationResult);

      // Invariant: original version was NOT mutated
      expect(mockVersion1.structuredOutput.headline).toBe('Parisian Elegance Original');
    });

    it('updates englishCaption, khmerCaption, and cta fields properly', async () => {
      const { repo } = createMockRepo();
      const validateExecuteMock = jest.fn(
        (_versionId: string): Promise<PersistedValidationResult> =>
          Promise.resolve(mockValidationResult),
      );
      const validateUseCase = {
        execute: validateExecuteMock,
      } as unknown as ValidateContentVersionUseCase;
      const useCase = new ReviseContentUseCase(repo, validateUseCase, permissions);

      const resEng = await useCase.editField({
        contentJobId: 'job-c1',
        contentVersionId: 'ver-1',
        field: 'englishCaption',
        newValue: 'Updated English caption.',
        actorUserId: 'user-editor',
        actorRoles: ['ADMIN'],
      });
      expect(resEng.version.structuredOutput.english_caption).toBe('Updated English caption.');

      const resKhm = await useCase.editField({
        contentJobId: 'job-c1',
        contentVersionId: 'ver-1',
        field: 'khmerCaption',
        newValue: 'កែប្រែភាសាខ្មែរ',
        actorUserId: 'user-editor',
        actorRoles: ['ADMIN'],
      });
      expect(resKhm.version.structuredOutput.khmer_caption).toBe('កែប្រែភាសាខ្មែរ');

      const resCta = await useCase.editField({
        contentJobId: 'job-c1',
        contentVersionId: 'ver-1',
        field: 'cta',
        newValue: 'Order Today',
        actorUserId: 'user-editor',
        actorRoles: ['ADMIN'],
      });
      expect(resCta.version.structuredOutput.cta).toBe('Order Today');
    });
  });

  describe('changeLanguage', () => {
    it('creates new version and revalidates when language is updated', async () => {
      const { repo } = createMockRepo();
      const validateExecuteMock = jest.fn(
        (_versionId: string): Promise<PersistedValidationResult> =>
          Promise.resolve(mockValidationResult),
      );
      const validateUseCase = {
        execute: validateExecuteMock,
      } as unknown as ValidateContentVersionUseCase;
      const useCase = new ReviseContentUseCase(repo, validateUseCase, permissions);

      const result = await useCase.changeLanguage({
        contentJobId: 'job-c1',
        contentVersionId: 'ver-1',
        targetLanguage: 'KM',
        actorUserId: 'user-editor',
        actorRoles: ['MARKETING_EDITOR'],
      });

      expect(result.version.id).toBe('ver-2');
      expect(validateExecuteMock).toHaveBeenCalledWith('ver-2');
    });
  });

  describe('restoreVersion', () => {
    it('restores target version structured output into a new version and validates it', async () => {
      const { repo } = createMockRepo();
      const validateExecuteMock = jest.fn(
        (_versionId: string): Promise<PersistedValidationResult> =>
          Promise.resolve(mockValidationResult),
      );
      const validateUseCase = {
        execute: validateExecuteMock,
      } as unknown as ValidateContentVersionUseCase;
      const useCase = new ReviseContentUseCase(repo, validateUseCase, permissions);

      const result = await useCase.restoreVersion({
        contentJobId: 'job-c1',
        targetVersionId: 'ver-1',
        actorUserId: 'user-editor',
        actorRoles: ['MARKETING_EDITOR'],
      });

      expect(result.version.id).toBe('ver-2');
      expect(result.version.structuredOutput).toEqual(mockVersion1.structuredOutput);
      expect(validateExecuteMock).toHaveBeenCalledWith('ver-2');
    });
  });
});
