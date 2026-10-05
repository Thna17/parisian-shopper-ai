import { Inject, Injectable } from '@nestjs/common';
import { ApplicationError } from '@parisian-shopper/common';

import {
  CONTENT_GENERATION_REPOSITORY,
  type ContentGenerationRepository,
} from '../../content/application/content-generation.repository.js';
import {
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshotRepository,
} from '../../products/application/product-snapshot.repository.js';
import { FACTUAL_VALIDATOR, type FactualValidator } from '../domain/factual-validator.js';
import {
  VALIDATION_REPOSITORY,
  type PersistedValidationResult,
  type ValidationRepository,
} from './validation.repository.js';

@Injectable()
export class ValidateContentVersionUseCase {
  public constructor(
    @Inject(CONTENT_GENERATION_REPOSITORY)
    private readonly content: ContentGenerationRepository,
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly snapshots: ProductSnapshotRepository,
    @Inject(VALIDATION_REPOSITORY)
    private readonly results: ValidationRepository,
    @Inject(FACTUAL_VALIDATOR) private readonly validator: FactualValidator,
  ) {}

  public async execute(contentVersionId: string): Promise<PersistedValidationResult> {
    const version = await this.content.findVersionById(contentVersionId);
    if (version === null) {
      throw new ApplicationError({
        code: 'CONTENT_VERSION_NOT_FOUND',
        publicMessage: 'Content version was not found.',
      });
    }
    const snapshot = await this.snapshots.findById(version.productSnapshotId);
    if (snapshot === null) {
      throw new ApplicationError({
        code: 'PRODUCT_SNAPSHOT_NOT_FOUND',
        publicMessage: 'Product snapshot was not found.',
      });
    }
    return this.results.create({
      contentVersionId,
      outcome: this.validator.validate({ productSnapshot: snapshot, contentVersion: version }),
    });
  }
}
