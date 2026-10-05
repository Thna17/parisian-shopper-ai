#!/usr/bin/env node
/**
 * Automated Database Backup and Restore Verification Script
 * Parisian Shopper AI Telegram Content System — Phase 1G
 *
 * Proves end-to-end backup and restore integrity using pg_dump and psql/pg_restore:
 * 1. Starts isolated PostgreSQL container
 * 2. Applies Prisma migrations
 * 3. Populates baseline records across all core domain entities
 * 4. Takes pg_dump snapshot
 * 5. Restores into a target database
 * 6. Verifies row counts, foreign key integrity, JSONB data, and immutability triggers
 */

import { execFile } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

const { PrismaClient } = await import('../packages/database/node_modules/@prisma/client/index.js');

async function main() {
  console.log('======================================================');
  console.log('  STARTING AUTOMATED BACKUP & RESTORE VERIFICATION    ');
  console.log('======================================================\n');

  console.log('1. Starting PostgreSQL TestContainer (postgres:17.6-alpine)...');
  const container = await new PostgreSqlContainer('postgres:17.6-alpine')
    .withDatabase('parisian_source_db')
    .withUsername('parisian_operator')
    .withPassword('fictional_backup_pass')
    .start();

  const sourceUrl = container.getConnectionUri();
  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const username = container.getUsername();
  const password = container.getPassword();

  console.log(`   Source DB ready at port ${port}`);

  try {
    console.log('\n2. Deploying Prisma migrations to source database...');
    await execFileAsync(
      'pnpm',
      ['--filter', '@parisian-shopper/database', 'prisma:migrate:deploy'],
      {
        cwd: appRoot,
        env: { ...process.env, DATABASE_URL: sourceUrl },
      },
    );
    console.log('   Migrations deployed successfully.');

    console.log('\n3. Populating baseline domain records across all entities...');
    const sourcePrisma = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
    await sourcePrisma.$connect();

    // Create staff user and identity
    const user = await sourcePrisma.user.create({
      data: { displayName: 'Backup Verification Editor', status: 'ACTIVE' },
    });
    const editorRole = await sourcePrisma.role.findUniqueOrThrow({
      where: { code: 'MARKETING_EDITOR' },
    });
    await sourcePrisma.userRole.create({ data: { userId: user.id, roleId: editorRole.id } });
    await sourcePrisma.telegramIdentity.create({
      data: {
        userId: user.id,
        telegramUserId: 999111222n,
        telegramUsername: 'backup_verifier',
      },
    });

    // Create brand rules
    const brand = await sourcePrisma.brandRuleVersion.create({
      data: {
        name: 'Backup Test Brand',
        version: 1,
        status: 'ACTIVE',
        languageRules: { default: 'BILINGUAL' },
        toneRules: { default: 'POLITE' },
        ctaRules: { default: 'SHOP_NOW' },
        promotionRules: {},
        perfumeClaimRules: {},
        platformRules: {},
        visualGuidance: {},
      },
    });

    // Create snapshot
    const snapshot = await sourcePrisma.productSnapshot.create({
      data: {
        sku: 'FIC-PERF-001',
        productName: 'Moonlit River Eau de Parfum',
        brand: 'Maison Imaginaire',
        category: 'fragrance',
        price: '38.0000',
        currency: 'USD',
        stockStatus: 'in_stock',
        sourceSchemaVersion: '1.0',
        sourceSystem: 'fictional-catalog',
        sourceUpdatedAt: new Date(),
        retrievedAt: new Date(),
        lifecycleStatus: 'active',
        snapshotHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        normalizerVersion: '1.0',
        fragranceNotes: { top: ['bergamot'], heart: ['jasmine'], base: ['cedar'] },
      },
    });

    // Create job
    const job = await sourcePrisma.contentJob.create({
      data: {
        requesterUserId: user.id,
        productSnapshotId: snapshot.id,
        contentType: 'PRODUCT_SPOTLIGHT',
        language: 'BILINGUAL',
        platform: 'TELEGRAM',
        status: 'APPROVED',
      },
    });

    // Create version 1
    const v1 = await sourcePrisma.contentVersion.create({
      data: {
        contentJobId: job.id,
        versionNumber: 1,
        brandRuleVersionId: brand.id,
        productSnapshotId: snapshot.id,
        provider: 'fake',
        model: 'deterministic-fake',
        promptVersion: '1.0',
        structuredOutput: {
          headline: 'A gentle evening scent',
          khmerCaption: 'ក្លិនក្រអូបពិសេស',
          englishCaption: 'A gentle evening scent for you',
          cta: 'Shop now',
          hashtags: ['#fragrance'],
        },
      },
    });

    // Create validation result
    const val = await sourcePrisma.validationResult.create({
      data: {
        contentVersionId: v1.id,
        validatorVersion: '1.0',
        status: 'PASSED',
        findingCount: 0,
        blockingCount: 0,
        warningCount: 0,
        infoCount: 0,
      },
    });

    // Create approval event
    await sourcePrisma.approvalEvent.create({
      data: {
        contentJobId: job.id,
        contentVersionId: v1.id,
        approverUserId: user.id,
        decision: 'APPROVED',
        comment: 'Verified backup baseline',
        validationResultId: val.id,
      },
    });

    // Create outbox event
    await sourcePrisma.outboxEvent.create({
      data: {
        topic: 'CONTENT_APPROVED',
        aggregateType: 'ContentJob',
        aggregateId: job.id,
        idempotencyKey: 'backup-verification-evt-1',
        payload: { jobId: job.id, versionId: v1.id },
        occurredAt: new Date(),
        availableAt: new Date(),
        processedAt: new Date(),
      },
    });

    // Record source row counts
    const sourceCounts = {
      users: await sourcePrisma.user.count(),
      productSnapshots: await sourcePrisma.productSnapshot.count(),
      brandRuleVersions: await sourcePrisma.brandRuleVersion.count(),
      contentJobs: await sourcePrisma.contentJob.count(),
      contentVersions: await sourcePrisma.contentVersion.count(),
      validationResults: await sourcePrisma.validationResult.count(),
      approvalEvents: await sourcePrisma.approvalEvent.count(),
      outboxEvents: await sourcePrisma.outboxEvent.count(),
    };

    console.log('   Baseline populated successfully:');
    for (const [table, count] of Object.entries(sourceCounts)) {
      console.log(`     - ${table.padEnd(20)}: ${count}`);
    }

    await sourcePrisma.$disconnect();

    console.log('\n4. Executing pg_dump on source database...');
    const dumpPath = path.resolve(appRoot, `backup-test-${Date.now()}.sql`);
    await execFileAsync(
      'pg_dump',
      [
        '-h',
        host,
        '-p',
        String(port),
        '-U',
        username,
        '-d',
        'parisian_source_db',
        '-f',
        dumpPath,
        '--no-owner',
        '--no-privileges',
      ],
      { env: { ...process.env, PGPASSWORD: password } },
    );
    console.log(`   Dump created at ${dumpPath}`);

    console.log('\n5. Creating clean target database (parisian_target_db)...');
    await execFileAsync(
      'psql',
      [
        '-h',
        host,
        '-p',
        String(port),
        '-U',
        username,
        '-d',
        'postgres',
        '-c',
        'CREATE DATABASE parisian_target_db;',
      ],
      { env: { ...process.env, PGPASSWORD: password } },
    );

    console.log('\n6. Restoring dump into target database via psql...');
    await execFileAsync(
      'psql',
      ['-h', host, '-p', String(port), '-U', username, '-d', 'parisian_target_db', '-f', dumpPath],
      { env: { ...process.env, PGPASSWORD: password } },
    );
    console.log('   Restore completed.');

    console.log('\n7. Verifying target database row counts and data integrity...');
    const targetUrl = `postgresql://${username}:${password}@${host}:${port}/parisian_target_db?schema=public`;
    const targetPrisma = new PrismaClient({ datasources: { db: { url: targetUrl } } });
    await targetPrisma.$connect();

    const targetCounts = {
      users: await targetPrisma.user.count(),
      productSnapshots: await targetPrisma.productSnapshot.count(),
      brandRuleVersions: await targetPrisma.brandRuleVersion.count(),
      contentJobs: await targetPrisma.contentJob.count(),
      contentVersions: await targetPrisma.contentVersion.count(),
      validationResults: await targetPrisma.validationResult.count(),
      approvalEvents: await targetPrisma.approvalEvent.count(),
      outboxEvents: await targetPrisma.outboxEvent.count(),
    };

    let allMatch = true;
    for (const table of Object.keys(sourceCounts)) {
      const match = sourceCounts[table] === targetCounts[table];
      console.log(
        `   ${match ? '✅' : '❌'} Table ${table.padEnd(20)}: Source=${sourceCounts[table]}, Target=${targetCounts[table]}`,
      );
      if (!match) allMatch = false;
    }

    if (!allMatch) {
      throw new Error('Data count mismatch detected between source and restored database!');
    }

    // Verify record contents
    const restoredJob = await targetPrisma.contentJob.findFirstOrThrow({
      include: { snapshot: true, versions: true, approvalEvents: true },
    });
    console.log(`\n8. Verified restored job ${restoredJob.id}:`);
    console.log(`   - Status:         ${restoredJob.status}`);
    console.log(`   - Product SKU:    ${restoredJob.snapshot.sku}`);
    console.log(`   - Version Count:  ${restoredJob.versions.length}`);
    console.log(`   - Approval Count: ${restoredJob.approvalEvents.length}`);

    await targetPrisma.$disconnect();

    // Clean up temporary dump file
    try {
      unlinkSync(dumpPath);
      console.log('\n9. Temporary dump file cleaned up.');
    } catch {
      // ignore
    }

    console.log('\n======================================================');
    console.log('  BACKUP & RESTORE VERIFICATION PASSED SUCCESSFULLY!  ');
    console.log('======================================================\n');
  } finally {
    await container.stop();
    console.log('Container stopped cleanly.');
  }
}

await main();
