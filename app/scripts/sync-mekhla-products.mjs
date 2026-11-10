#!/usr/bin/env node
/**
 * Parisian Shopper AI — Production Mekhla Digital Product Catalog Synchronizer
 *
 * Automated production catalog synchronization pipeline that connects to
 * https://api.mekhla.digital, performs cryptographic hash change detection,
 * persists immutable snapshots and freshness assessments, and downloads & verifies
 * high-resolution transparent PNG cutouts via Sharp with CAS SHA-256 storage.
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
function getArg(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}
const forceFlag = args.includes('--force');
const maxPagesArg = getArg('--pages');
const limitArg = getArg('--limit');
const skusArg = getArg('--skus');

const { PrismaClient } = await import(
  path.join(appRoot, 'packages/database/node_modules/@prisma/client/index.js')
);
const {
  DiskProductAssetStorageAdapter,
  MekhlaProductSource,
  ProductAssetValidator,
  SafeProductAssetAcquisitionService,
  SyncMekhlaCatalogUseCase,
} = await import(path.join(appRoot, 'packages/application/dist/index.js'));
const {
  PrismaProductAssetRepository,
  PrismaProductFreshnessAssessmentRepository,
  PrismaProductSnapshotRepository,
} = await import(path.join(appRoot, 'packages/database/dist/index.js'));

const BASE_URL = process.env.PRODUCT_API_BASE_URL || 'https://api.mekhla.digital';
const BUSINESS_ID = process.env.PRODUCT_API_BUSINESS_ID || 'cmpwgnlpv0001li15e3n16uhc';
const STORAGE_ROOT = process.env.ASSET_STORAGE_ROOT || path.join(appRoot, '.data', 'assets');

const prisma = new PrismaClient();

async function main() {
  console.log('======================================================');
  console.log('   PRODUCTION MEKHLA DIGITAL CATALOG PIPELINE         ');
  console.log(`   Source:   ${BASE_URL} (Business: ${BUSINESS_ID})`);
  console.log(`   Storage:  ${STORAGE_ROOT}`);
  console.log(
    `   Force:    ${forceFlag ? 'YES (Bypassing hash cache)' : 'NO (Change detection enabled)'}`,
  );
  if (skusArg) console.log(`   Filter:   SKUs [${skusArg}]`);
  console.log('======================================================\n');

  try {
    await prisma.$connect();
    console.log('Connected to database.');

    const adminUser = await prisma.user.findFirst({
      where: { status: 'ACTIVE' },
    });
    if (!adminUser) {
      throw new Error('No active user found in database. Run seed-demo-data.mjs first.');
    }

    const productSource = new MekhlaProductSource({
      baseUrl: BASE_URL,
      businessId: BUSINESS_ID,
      currency: process.env.PRODUCT_API_CURRENCY || 'USD',
      timeoutMs: 10_000,
      maxRetries: 3,
    });

    const snapshotRepo = new PrismaProductSnapshotRepository(prisma);
    const assessmentRepo = new PrismaProductFreshnessAssessmentRepository(prisma);
    const assetRepo = new PrismaProductAssetRepository(prisma);
    const assetStorage = new DiskProductAssetStorageAdapter({
      storageRoot: STORAGE_ROOT,
      maxBytes: 25 * 1024 * 1024,
    });
    const assetAcquisition = new SafeProductAssetAcquisitionService({
      allowedHosts: ['api.mekhla.digital', 'cdn.mekhla.digital', 'images.mekhla.digital'],
      maxFileSizeBytes: 25 * 1024 * 1024,
      requestTimeoutMs: 15_000,
    });
    const validator = new ProductAssetValidator();

    const consoleLogger = {
      log: (msg, meta) => console.log(`[INFO] ${msg}`, meta ? JSON.stringify(meta) : ''),
      warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta ? JSON.stringify(meta) : ''),
      error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta ? JSON.stringify(meta) : ''),
      debug: (msg, meta) => console.debug(`[DEBUG] ${msg}`, meta ? JSON.stringify(meta) : ''),
    };

    const useCase = new SyncMekhlaCatalogUseCase(
      productSource,
      snapshotRepo,
      assessmentRepo,
      assetStorage,
      assetRepo,
      assetAcquisition,
      validator,
      undefined,
      consoleLogger,
    );

    const result = await useCase.execute({
      force: forceFlag,
      maxPages: maxPagesArg ? parseInt(maxPagesArg, 10) : 20,
      limit: limitArg ? parseInt(limitArg, 10) : 50,
      skus: skusArg ? skusArg.split(',').map((s) => s.trim()) : undefined,
      actorUserId: adminUser.id,
      source: 'manual',
    });

    console.log('\n======================================================');
    console.log('   PIPELINE SYNCHRONIZATION RESULTS SUMMARY           ');
    console.log('======================================================');
    console.log(`   Status:             ${result.status}`);
    console.log(`   Total Discovered:   ${result.totalDiscovered}`);
    console.log(`   Newly Synced/Drift: ${result.synced}`);
    console.log(`   Skipped/Unchanged:  ${result.skipped}`);
    console.log(`   Cutouts Verified:   ${result.cutoutsProcessed}`);
    console.log(`   Duration:           ${result.durationMs}ms`);
    if (result.errors.length > 0) {
      console.log(`   Errors Encountered: ${result.errors.length}`);
      for (const err of result.errors) {
        console.log(`     - [${err.sku}]: ${err.error}`);
      }
    }
    console.log('======================================================\n');

    if (result.status === 'FAILED') {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Production sync pipeline execution failed:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
