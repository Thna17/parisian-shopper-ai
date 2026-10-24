import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, ValidationError } from '@parisian-shopper/common';
import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import {
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
  type ContentVersion,
} from './content-generation.repository.js';
import { ValidateContentVersionUseCase } from '../../validation/application/validate-content-version.use-case.js';
import { type PersistedValidationResult } from '../../validation/application/validation.repository.js';
import { type AIContentOutput } from '../../ai/domain/ai-output.schema.js';
import { type ContentLanguage } from '../domain/content.js';

export type CopyEditableField = 'headline' | 'englishCaption' | 'khmerCaption' | 'cta';

export interface EditContentFieldInput {
  readonly contentJobId: string;
  readonly contentVersionId: string;
  readonly field: CopyEditableField;
  readonly newValue: string;
  readonly actorUserId: string;
  readonly actorRoles: readonly string[];
}

export interface ChangeContentLanguageInput {
  readonly contentJobId: string;
  readonly contentVersionId: string;
  readonly targetLanguage: ContentLanguage;
  readonly actorUserId: string;
  readonly actorRoles: readonly string[];
}

export interface RestoreContentVersionInput {
  readonly contentJobId: string;
  readonly targetVersionId: string;
  readonly actorUserId: string;
  readonly actorRoles: readonly string[];
}

export interface ReviseContentResult {
  readonly version: ContentVersion;
  readonly validationResult: PersistedValidationResult;
}

/**
 * ReviseContentUseCase
 *
 * Implements granular copy revision actions:
 * - Edit headline, English copy, Khmer copy, CTA
 * - Change language
 * - Restore prior version
 *
 * Invariant: Every revision creates a new immutable ContentVersion record
 * and automatically re-validates factual compliance.
 */
@Injectable()
export class ReviseContentUseCase {
  public constructor(
    @Inject(CONTENT_GENERATION_REPOSITORY)
    private readonly repository: ContentGenerationRepository,
    private readonly validateContentVersion: ValidateContentVersionUseCase,
    private readonly permissions: PermissionService,
  ) {}

  public async editField(input: EditContentFieldInput): Promise<ReviseContentResult> {
    if (!this.permissions.hasAnyRolePermission(input.actorRoles, Permission.EDIT_CONTENT)) {
      throw new ForbiddenError({ publicMessage: 'Permission denied: Cannot edit content.' });
    }
    const trimmed = input.newValue.trim();
    if (trimmed.length === 0) {
      throw new ValidationError({ publicMessage: `${input.field} cannot be empty.` });
    }

    const currentVersion = await this.repository.findVersionById(input.contentVersionId);
    if (!currentVersion) {
      throw new ValidationError({ publicMessage: 'Content version not found.' });
    }

    const updatedOutput: AIContentOutput = {
      ...currentVersion.structuredOutput,
      [input.field === 'headline'
        ? 'headline'
        : input.field === 'englishCaption'
          ? 'english_caption'
          : input.field === 'khmerCaption'
            ? 'khmer_caption'
            : 'cta']: trimmed,
    };

    const newVersion = await this.saveNewVersion(
      input.contentJobId,
      currentVersion,
      updatedOutput,
      'EDIT',
    );

    const validationResult = await this.validateContentVersion.execute(newVersion.id);
    return { version: newVersion, validationResult };
  }

  public async changeLanguage(input: ChangeContentLanguageInput): Promise<ReviseContentResult> {
    if (!this.permissions.hasAnyRolePermission(input.actorRoles, Permission.EDIT_CONTENT)) {
      throw new ForbiddenError({ publicMessage: 'Permission denied: Cannot edit content.' });
    }

    const currentVersion = await this.repository.findVersionById(input.contentVersionId);
    if (!currentVersion) {
      throw new ValidationError({ publicMessage: 'Content version not found.' });
    }

    const updatedOutput: AIContentOutput = {
      ...currentVersion.structuredOutput,
      ...(input.targetLanguage === 'KM' && !currentVersion.structuredOutput.khmer_caption
        ? {
            khmer_caption:
              currentVersion.structuredOutput.english_caption ??
              currentVersion.structuredOutput.headline,
          }
        : {}),
      ...(input.targetLanguage === 'EN' && !currentVersion.structuredOutput.english_caption
        ? {
            english_caption:
              currentVersion.structuredOutput.khmer_caption ??
              currentVersion.structuredOutput.headline,
          }
        : {}),
    };

    const newVersion = await this.saveNewVersion(
      input.contentJobId,
      currentVersion,
      updatedOutput,
      'CHANGE_LANGUAGE',
    );

    const validationResult = await this.validateContentVersion.execute(newVersion.id);
    return { version: newVersion, validationResult };
  }

  public async restoreVersion(input: RestoreContentVersionInput): Promise<ReviseContentResult> {
    if (!this.permissions.hasAnyRolePermission(input.actorRoles, Permission.EDIT_CONTENT)) {
      throw new ForbiddenError({ publicMessage: 'Permission denied: Cannot edit content.' });
    }

    const targetVersion = await this.repository.findVersionById(input.targetVersionId);
    if (!targetVersion) {
      throw new ValidationError({ publicMessage: 'Target content version not found.' });
    }

    const newVersion = await this.saveNewVersion(
      input.contentJobId,
      targetVersion,
      targetVersion.structuredOutput,
      'RESTORE_VERSION',
    );

    const validationResult = await this.validateContentVersion.execute(newVersion.id);
    return { version: newVersion, validationResult };
  }

  private async saveNewVersion(
    contentJobId: string,
    sourceVersion: ContentVersion,
    output: AIContentOutput,
    _reason: string,
  ): Promise<ContentVersion> {
    if (this.repository.createDirectVersion) {
      return this.repository.createDirectVersion({
        contentJobId,
        output,
        provider: sourceVersion.provider,
        model: sourceVersion.model,
        promptVersion: sourceVersion.promptVersion,
      });
    }

    const begin = await this.repository.beginGeneration({
      contentJobId,
      provider: sourceVersion.provider,
      model: sourceVersion.model,
      promptVersion: sourceVersion.promptVersion,
      staleAfterMs: 60_000,
    });

    if (begin.disposition === 'ALREADY_RUNNING') {
      throw new ValidationError({ publicMessage: 'Content generation is currently in progress.' });
    }

    const attemptId = begin.disposition === 'STARTED' ? begin.attempt.id : 'direct-revision';

    return this.repository.completeGeneration({
      contentJobId,
      attemptId,
      output,
      provider: sourceVersion.provider,
      model: sourceVersion.model,
      promptVersion: sourceVersion.promptVersion,
      latencyMs: 1,
    });
  }
}
