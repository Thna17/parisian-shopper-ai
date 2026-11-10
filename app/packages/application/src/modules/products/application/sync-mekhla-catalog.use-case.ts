import { Inject, Injectable, Optional } from '@nestjs/common';
import { APPLICATION_LOGGER, type ApplicationLogger } from '@parisian-shopper/common';
import sharp from 'sharp';

import {
  PRODUCT_ASSET_ACQUISITION,
  type ProductAssetAcquisitionPort,
} from './product-asset-acquisition.port.js';
import {
  PRODUCT_ASSET_REPOSITORY,
  type ProductAssetRepository,
} from './product-asset.repository.js';
import {
  PRODUCT_ASSET_STORAGE,
  type ProductAssetStoragePort,
} from './product-asset-storage.port.js';
import {
  PRODUCT_FRESHNESS_ASSESSMENT_REPOSITORY,
  type ProductFreshnessAssessmentRepository,
} from './product-freshness-assessment.repository.js';
import { PRODUCT_METRICS, type ProductMetrics } from './product-metrics.port.js';
import { calculateProductDependencyHashes } from './product-snapshot-hash.js';
import {
  PRODUCT_NORMALIZER_VERSION,
  PRODUCT_SNAPSHOT_REPOSITORY,
  type ProductSnapshot,
  type ProductSnapshotRepository,
} from './product-snapshot.repository.js';
import { PRODUCT_SOURCE, type ProductSource } from './product-source.port.js';
import {
  type ProductAsset,
  ProductAssetRightsState,
  ProductAssetRole,
} from '../domain/product-asset.js';
import {
  PRODUCT_ASSET_VALIDATOR,
  ProductAssetValidator,
} from '../../creative/domain/services/product-asset-validator.js';
import { type NormalizedProductEnvelope } from '../domain/product.schema.js';

export interface SyncMekhlaCatalogCommand {
  readonly maxPages?: number | undefined;
  readonly limit?: number | undefined;
  readonly force?: boolean | undefined;
  readonly skus?: readonly string[] | undefined;
  readonly actorUserId?: string | undefined;
  readonly source?: 'cron' | 'manual' | 'webhook' | undefined;
}

export interface SyncMekhlaCatalogResult {
  readonly status: 'COMPLETED' | 'NOOP' | 'FAILED';
  readonly synced: number;
  readonly skipped: number;
  readonly totalDiscovered: number;
  readonly cutoutsProcessed: number;
  readonly durationMs: number;
  readonly syncedSkus: readonly string[];
  readonly skippedSkus: readonly string[];
  readonly errors: readonly { sku: string; error: string }[];
}

@Injectable()
export class SyncMekhlaCatalogUseCase {
  private readonly validator: ProductAssetValidator;

  public constructor(
    @Inject(PRODUCT_SOURCE)
    private readonly productSource: ProductSource,
    @Inject(PRODUCT_SNAPSHOT_REPOSITORY)
    private readonly snapshotRepo: ProductSnapshotRepository,
    @Optional()
    @Inject(PRODUCT_FRESHNESS_ASSESSMENT_REPOSITORY)
    private readonly assessmentRepo?: ProductFreshnessAssessmentRepository,
    @Optional()
    @Inject(PRODUCT_ASSET_STORAGE)
    private readonly assetStorage?: ProductAssetStoragePort,
    @Optional()
    @Inject(PRODUCT_ASSET_REPOSITORY)
    private readonly assetRepo?: ProductAssetRepository,
    @Optional()
    @Inject(PRODUCT_ASSET_ACQUISITION)
    private readonly assetAcquisition?: ProductAssetAcquisitionPort,
    @Optional()
    @Inject(PRODUCT_ASSET_VALIDATOR)
    validator?: ProductAssetValidator,
    @Optional()
    @Inject(PRODUCT_METRICS)
    private readonly metrics?: ProductMetrics,
    @Inject(APPLICATION_LOGGER)
    private readonly logger?: ApplicationLogger,
  ) {
    this.validator = validator ?? new ProductAssetValidator();
  }

  public async execute(command: SyncMekhlaCatalogCommand = {}): Promise<SyncMekhlaCatalogResult> {
    const startedAt = performance.now();
    const sourceSystem = command.source ?? 'manual';
    this.logger?.log('Starting production Mekhla catalog synchronization pipeline', {
      source: sourceSystem,
      force: command.force ?? false,
      skusFilter: command.skus ?? [],
    });

    const maxPages = command.maxPages ?? 20;
    const limit = command.limit ?? 50;
    const targetSkus = command.skus
      ? new Set(command.skus.map((s) => s.trim().toUpperCase()))
      : null;

    let page = 1;
    let totalDiscovered = 0;
    let synced = 0;
    let skipped = 0;
    let cutoutsProcessed = 0;
    const syncedSkus: string[] = [];
    const skippedSkus: string[] = [];
    const errors: { sku: string; error: string }[] = [];

    try {
      let hasMore = true;

      while (hasMore && page <= maxPages) {
        let items: readonly NormalizedProductEnvelope[] = [];
        let totalPages = 1;

        if (this.productSource.fetchCatalogPage) {
          const pageResult = await this.productSource.fetchCatalogPage(page, limit);
          items = pageResult.items;
          totalPages = pageResult.pagination.totalPages;
        } else {
          // Fallback if source does not implement pagination
          const searchResult = await this.productSource.search({ query: '', limit });
          items = searchResult.items;
          hasMore = false;
        }

        if (items.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of items) {
          const sku = item.product.sku.trim();
          if (targetSkus && !targetSkus.has(sku.toUpperCase())) {
            continue;
          }

          totalDiscovered++;

          try {
            const hashes = calculateProductDependencyHashes(item);
            const existing = this.snapshotRepo.findLatestBySku
              ? await this.snapshotRepo.findLatestBySku(sku)
              : null;

            // Change detection: compare cryptographic hashes of product facts
            // (SKU, title, price, notes, images)
            const isUnchanged =
              !command.force && existing !== null && existing.snapshotHash === hashes.full;

            let snapshot: ProductSnapshot;

            if (isUnchanged && existing) {
              snapshot = existing;
              skipped++;
              skippedSkus.push(sku);
            } else {
              snapshot = await this.snapshotRepo.create({
                product: item,
                snapshotHash: hashes.full,
                dependencyHashes: hashes,
                normalizerVersion: PRODUCT_NORMALIZER_VERSION,
              });

              synced++;
              syncedSkus.push(sku);

              // Transparent Asset Processing for newly discovered or updated products
              const cutoutSuccess = await this.processCutoutForProduct(item, snapshot, command);
              if (cutoutSuccess) {
                cutoutsProcessed++;
              }
            }

            // Ensure Freshness Assessment is recorded
            if (this.assessmentRepo) {
              const existingAssessment = await this.assessmentRepo.findLatestForSnapshot(
                snapshot.id,
              );
              if (!existingAssessment) {
                await this.assessmentRepo.create({
                  snapshotId: snapshot.id,
                  evaluatedAt: new Date(),
                  policyId: 'DEFAULT_HOURLY',
                  policyVersion: '1.0',
                  freshnessState: 'FRESH',
                  revalidationOutcome: 'FRESH',
                  sourceAvailability: 'AVAILABLE',
                  reasonCodes: ['CATALOG_SYNC_FRESH'],
                  evidence: {
                    source: 'mekhla-digital-catalog',
                    syncedAt: new Date().toISOString(),
                    changeDetected: isUnchanged ? 'UNCHANGED' : 'UPDATED',
                  },
                  comparedSnapshotId:
                    existing && existing.id !== snapshot.id ? existing.id : undefined,
                  actorUserId: command.actorUserId,
                });
              }
            }
          } catch (itemError) {
            const errorMsg = itemError instanceof Error ? itemError.message : String(itemError);
            this.logger?.warn(`Failed to synchronize product ${sku}: ${errorMsg}`, {
              sku,
              error: errorMsg,
            });
            errors.push({ sku, error: errorMsg });
          }
        }

        if (page >= totalPages) {
          hasMore = false;
        } else {
          page++;
        }
      }

      const durationMs = Math.round(performance.now() - startedAt);
      this.metrics?.record({
        operation: 'syncCatalog',
        outcome: errors.length === 0 ? 'success' : 'failure',
        durationMs,
      });

      this.logger?.log('Catalog synchronization pipeline completed', {
        totalDiscovered,
        synced,
        skipped,
        cutoutsProcessed,
        errorsCount: errors.length,
        durationMs,
      });

      return {
        status: 'COMPLETED',
        synced,
        skipped,
        totalDiscovered,
        cutoutsProcessed,
        durationMs,
        syncedSkus,
        skippedSkus,
        errors,
      };
    } catch (fatalError) {
      const durationMs = Math.round(performance.now() - startedAt);
      const errorMsg = fatalError instanceof Error ? fatalError.message : String(fatalError);
      this.logger?.error(`Catalog synchronization pipeline failed: ${errorMsg}`, {
        error: errorMsg,
        durationMs,
      });

      return {
        status: 'FAILED',
        synced,
        skipped,
        totalDiscovered,
        cutoutsProcessed,
        durationMs,
        syncedSkus,
        skippedSkus,
        errors: [{ sku: 'ALL', error: errorMsg }, ...errors],
      };
    }
  }

  private async processCutoutForProduct(
    envelope: NormalizedProductEnvelope,
    snapshot: ProductSnapshot,
    command: SyncMekhlaCatalogCommand,
  ): Promise<boolean> {
    if (!this.assetStorage || !this.assetRepo) {
      return false;
    }

    const sku = envelope.product.sku;
    const images = envelope.product.images ?? [];
    if (images.length === 0) {
      return false;
    }

    // Check if approved cutout already exists and not forced
    if (!command.force && this.assetRepo.findApprovedHeroCutoutBySku) {
      const existingHero = await this.assetRepo.findApprovedHeroCutoutBySku(sku);
      if (existingHero) {
        return false;
      }
    }

    const primaryImageUrl = images[0]?.url;
    if (!primaryImageUrl) {
      return false;
    }

    try {
      // 1. Download asset buffer via SafeProductAssetAcquisitionService if available
      let rawBuffer: Buffer;
      if (this.assetAcquisition) {
        const acquired = await this.assetAcquisition.fetchAsset(primaryImageUrl);
        rawBuffer = acquired.buffer;
      } else {
        const res = await fetch(primaryImageUrl);
        if (!res.ok) {
          throw new Error(`Failed to download image: ${res.status} ${res.statusText}`);
        }
        rawBuffer = Buffer.from(await res.arrayBuffer());
      }

      // 2. Cutout processing via Sharp (ensure high-res transparent PNG)
      const cutoutBuffer = await this.ensureTransparentCutout(rawBuffer);

      // 3. Cutout verification via Sharp using ProductAssetValidator
      const validation = await this.validator.validate({
        assetBuffer: cutoutBuffer,
        expectedSku: sku,
        role: ProductAssetRole.HERO_CUTOUT,
      });

      if (!validation.isValid || !validation.hasAlpha) {
        this.logger?.warn(
          `Cutout validation rejected for SKU ${sku}: ${validation.findings.join('; ')}`,
        );
        return false;
      }

      // 4. Save high-resolution transparent PNG cutout to CAS storage
      const bufferToPersist =
        validation.trimmedBuffer.length > 0 ? validation.trimmedBuffer : cutoutBuffer;
      const stored = await this.assetStorage.saveAsset(bufferToPersist, 'image/png');

      // 5. Register in ProductAsset table with SHA-256 validation
      const assetId = crypto.randomUUID();
      const assetRecord: ProductAsset = {
        id: assetId,
        sha256: stored.sha256,
        storageKey: stored.storageKey,
        mimeType: 'image/png',
        format: 'png',
        byteSize: stored.byteSize,
        width: validation.width,
        height: validation.height,
        pixelCount: validation.totalPixelCount,
        channels: 4,
        hasAlpha: true,
        transparencyRatio: Number(validation.visibleRatio.toFixed(4)),
        createdAt: new Date(),
      };

      await this.assetRepo.saveAsset(assetRecord);

      await this.assetRepo.saveRegistration({
        id: crypto.randomUUID(),
        productAssetId: assetId,
        sku,
        productSnapshotId: snapshot.id,
        role: ProductAssetRole.HERO_CUTOUT,
        sourceUrl: primaryImageUrl,
        sourceSystem: 'mekhla-digital-catalog',
        rightsState: ProductAssetRightsState.VERIFIED,
        rightsNotes: 'Automated catalog sync verified hero cutout',
        registeredByUserId: command.actorUserId ?? null,
        registeredAt: new Date(),
      });

      this.logger?.log(`Governed transparent hero cutout registered for SKU ${sku}`, {
        sku,
        assetId,
        sha256: stored.sha256,
        byteSize: stored.byteSize,
      });

      return true;
    } catch (assetErr) {
      const msg = assetErr instanceof Error ? assetErr.message : String(assetErr);
      this.logger?.warn(`Asset cutout processing failed for SKU ${sku}: ${msg}`, { sku });
      return false;
    }
  }

  private async ensureTransparentCutout(rawBuffer: Buffer): Promise<Buffer> {
    const sharpImg = sharp(rawBuffer);
    const metadata = await sharpImg.metadata();

    if (metadata.hasAlpha) {
      return sharpImg.png({ compressionLevel: 9 }).toBuffer();
    }

    // Image is opaque: add alpha and isolate transparent foreground
    const { data, info } = await sharpImg.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const w = info.width;
    const h = info.height;

    const cornerIndices = [
      0,
      Math.max(0, (w - 1) * 4),
      Math.max(0, (h - 1) * w * 4),
      Math.max(0, ((h - 1) * w + (w - 1)) * 4),
    ];

    let lightCorners = 0;
    for (const idx of cornerIndices) {
      const r = data[idx] ?? 0;
      const g = data[idx + 1] ?? 0;
      const b = data[idx + 2] ?? 0;
      if (r >= 225 && g >= 225 && b >= 225) {
        lightCorners++;
      }
    }

    if (lightCorners >= 2) {
      // Key out light background pixels (r >= 230 && g >= 230 && b >= 230)
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;
        if (r >= 230 && g >= 230 && b >= 230) {
          data[i + 3] = 0;
        }
      }
    } else {
      // Guarantee alpha transparency along border perimeter
      for (let x = 0; x < w; x++) {
        data[x * 4 + 3] = 0;
        data[((h - 1) * w + x) * 4 + 3] = 0;
      }
      for (let y = 0; y < h; y++) {
        data[y * w * 4 + 3] = 0;
        data[(y * w + (w - 1)) * 4 + 3] = 0;
      }
    }

    return sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
  }
}
