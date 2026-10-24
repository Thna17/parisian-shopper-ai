import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  POSTER_COMPOSITOR,
  type PosterCompositor,
  type RenderPosterResult,
} from './poster-compositor.port.js';
import { SharpPosterCompositor } from '../infrastructure/sharp-poster-compositor.adapter.js';
import { type PosterSpec } from '../domain/poster-spec.js';
import { ASSET_STORAGE, type AssetStoragePort } from './asset-storage.port.js';
import { VISUAL_ASSET_REPOSITORY, type VisualAssetRepository } from './visual-asset.repository.js';
import { type ApplicationLogger, APPLICATION_LOGGER } from '@parisian-shopper/common';
import { createHash } from 'node:crypto';

export interface RelayoutPosterInput {
  readonly creativeJobId: string;
  readonly posterSpec: PosterSpec;
  readonly backgroundBuffer: Buffer;
  readonly canonicalProductBuffer: Buffer;
  readonly canonicalProductMimeType?: string;
  readonly canonicalProductSha256?: string;
  readonly logoBuffer?: Buffer;
  readonly generateDebugLayout?: boolean;
}

/**
 * RelayoutPosterUseCase
 *
 * Implements zero-AI-spend deterministic re-layouts:
 * - Switch poster template instantly (EDITORIAL_SPLIT, CENTERED_HERO, SCENT_STORY, KHMER_SEASONAL)
 * - Modify headline, secondaryHeadline, supportingText, price, promotionalPrice, CTA, size, concentration
 * - Toggle readability contrast overlays
 * - Re-render typography and decorative graphics
 * - Zero external AI API calls or CLI invocations
 */
@Injectable()
export class RelayoutPosterUseCase {
  private readonly posterCompositor: PosterCompositor;

  public constructor(
    @Inject(APPLICATION_LOGGER)
    private readonly logger: ApplicationLogger,
    @Optional()
    @Inject(POSTER_COMPOSITOR)
    posterCompositor?: PosterCompositor,
    @Optional()
    @Inject(ASSET_STORAGE)
    private readonly storage?: AssetStoragePort,
    @Optional()
    @Inject(VISUAL_ASSET_REPOSITORY)
    private readonly assetRepo?: VisualAssetRepository,
  ) {
    this.posterCompositor = posterCompositor ?? new SharpPosterCompositor();
  }

  public async execute(input: RelayoutPosterInput): Promise<RenderPosterResult> {
    const startTime = Date.now();
    this.logger.log(
      `Executing zero-AI re-layout for job ${input.creativeJobId} with template ${input.posterSpec.templateId}`,
    );

    const canonicalSha256 =
      input.canonicalProductSha256 ??
      createHash('sha256').update(input.canonicalProductBuffer).digest('hex');

    const backgroundSha256 = createHash('sha256').update(input.backgroundBuffer).digest('hex');

    const renderResult = await this.posterCompositor.renderPoster({
      creativeJobId: input.creativeJobId,
      posterSpec: input.posterSpec,
      canonicalProductBuffer: input.canonicalProductBuffer,
      canonicalProductMimeType: input.canonicalProductMimeType ?? 'image/png',
      canonicalProductSha256: canonicalSha256,
      backgroundBuffer: input.backgroundBuffer,
      backgroundMimeType: 'image/png',
      backgroundSha256,
      ...(input.logoBuffer !== undefined ? { logoBuffer: input.logoBuffer } : {}),
      ...(input.generateDebugLayout !== undefined
        ? { generateDebugLayout: input.generateDebugLayout }
        : {}),
    });

    this.logger.log(
      `Zero-AI re-layout completed in ${Date.now() - startTime}ms (output sha256: ${renderResult.sha256.slice(0, 8)})`,
    );

    return renderResult;
  }
}
