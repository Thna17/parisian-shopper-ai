#!/usr/bin/env node
/**
 * Queue & Job Operations and Recovery CLI
 * Parisian Shopper AI Telegram Content System — Phase 1G
 *
 * Usage:
 *   node scripts/queue-operations.mjs --status
 *   node scripts/queue-operations.mjs --failed
 *   node scripts/queue-operations.mjs --detect-stuck
 *   node scripts/queue-operations.mjs --retry <jobId>
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Load .env if DATABASE_URL is not set
if (!process.env.DATABASE_URL) {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const envPath = path.resolve(__dirname, '../.env');
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2]?.trim().replace(/^['"](.*)['"]$/, '$1');
      }
    }
  } catch {
    // ignore missing .env
  }
}

const { PrismaClient } = await import('../packages/database/node_modules/@prisma/client/index.js');

const prisma = new PrismaClient();

const STALE_THRESHOLD_MS = parseInt(process.env.AI_ATTEMPT_STALE_AFTER_MS ?? '35000', 10);

async function printStatus() {
  const jobsByStatus = await prisma.contentJob.groupBy({
    by: ['status'],
    _count: { id: true },
  });

  const attemptsByStatus = await prisma.generationAttempt.groupBy({
    by: ['status'],
    _count: { id: true },
  });

  const validationsByStatus = await prisma.validationResult.groupBy({
    by: ['status'],
    _count: { id: true },
  });

  console.log('\n========================================');
  console.log('     QUEUE & CONTENT JOB STATUS         ');
  console.log('========================================');

  console.log('--- Content Jobs by Status ---');
  for (const s of jobsByStatus) {
    console.log(`  - ${s.status.padEnd(20)}: ${s._count.id}`);
  }

  console.log('\n--- Generation Attempts by Status ---');
  for (const a of attemptsByStatus) {
    console.log(`  - ${a.status.padEnd(20)}: ${a._count.id}`);
  }

  console.log('\n--- Validation Results by Status ---');
  for (const v of validationsByStatus) {
    console.log(`  - ${v.status.padEnd(20)}: ${v._count.id}`);
  }

  console.log('========================================\n');
}

async function listFailed() {
  const failedJobs = await prisma.contentJob.findMany({
    where: { status: 'FAILED' },
    include: {
      snapshot: { select: { sku: true, productName: true } },
      generationAttempts: {
        where: { status: 'FAILED' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    take: 20,
  });

  console.log(`\n=== FAILED CONTENT JOBS (${failedJobs.length} found) ===`);
  for (const j of failedJobs) {
    const attempt = j.generationAttempts[0];
    console.log(`\nJob ID:       ${j.id}`);
    console.log(`SKU / Name:   ${j.snapshot.sku} — ${j.snapshot.productName}`);
    console.log(`Created At:   ${j.createdAt.toISOString()}`);
    console.log(`Last Error:   ${attempt?.errorMessage ?? 'Unknown failure'}`);
    console.log(`Error Code:   ${attempt?.errorCode ?? 'N/A'}`);
  }

  const blockedValidations = await prisma.validationResult.findMany({
    where: { status: { in: ['BLOCKED', 'FAILED'] } },
    include: {
      findings: true,
      contentVersion: {
        include: {
          job: {
            include: { snapshot: { select: { sku: true, productName: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  console.log(
    `\n=== BLOCKED / FAILED FACTUAL VALIDATIONS (${blockedValidations.length} found) ===`,
  );
  for (const v of blockedValidations) {
    const job = v.contentVersion.job;
    console.log(`\nValidation ID: ${v.id}`);
    console.log(`Job / Version: ${job.id} (V${v.contentVersion.versionNumber})`);
    console.log(`Product:       ${job.snapshot.sku} — ${job.snapshot.productName}`);
    console.log(`Status:        ${v.status}`);
    console.log('Findings:');
    for (const f of v.findings) {
      console.log(`  - [${f.severity}] ${f.code}: ${f.message}`);
    }
  }
  console.log('\n========================================\n');
}

async function detectStuck() {
  const thresholdDate = new Date(Date.now() - STALE_THRESHOLD_MS);

  const stuckJobs = await prisma.contentJob.findMany({
    where: {
      status: { in: ['GENERATING', 'REQUESTED', 'REVISION_REQUESTED'] },
      updatedAt: { lt: thresholdDate },
    },
    include: {
      productSnapshot: { select: { sku: true, productName: true } },
    },
  });

  const stuckAttempts = await prisma.generationAttempt.findMany({
    where: {
      status: { in: ['RUNNING', 'PENDING'] },
      startedAt: { lt: thresholdDate },
    },
    include: {
      contentJob: { include: { productSnapshot: { select: { sku: true } } } },
    },
  });

  console.log(`\n=== STUCK JOBS & ATTEMPTS DETECTION (Age > ${STALE_THRESHOLD_MS}ms) ===`);
  console.log(`Stuck Jobs in Progress:      ${stuckJobs.length}`);
  console.log(`Stuck Generation Attempts:   ${stuckAttempts.length}`);

  if (stuckJobs.length > 0) {
    console.log('\nStuck Jobs:');
    for (const j of stuckJobs) {
      const ageSec = Math.floor((Date.now() - j.updatedAt.getTime()) / 1000);
      console.log(
        `  - Job ${j.id} (${j.productSnapshot?.sku ?? 'unknown'}) — State: ${j.status}, Stuck for ${ageSec}s`,
      );
    }
  }

  if (stuckAttempts.length > 0) {
    console.log('\nStuck Attempts:');
    for (const a of stuckAttempts) {
      const ageSec = Math.floor((Date.now() - a.startedAt.getTime()) / 1000);
      console.log(
        `  - Attempt ${a.id} (Job ${a.contentJobId}, ${a.contentJob?.productSnapshot?.sku ?? 'unknown'}) — Stuck for ${ageSec}s`,
      );
    }
  }

  if (stuckJobs.length === 0 && stuckAttempts.length === 0) {
    console.log('✅ No stuck jobs or attempts detected.');
  }
  console.log('========================================\n');
}

async function retryJob(jobId) {
  const job = await prisma.contentJob.findUnique({
    where: { id: jobId },
    include: {
      revisionRequests: {
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!job) {
    console.error(`❌ Job ${jobId} not found.`);
    return;
  }

  // CRITICAL SAFETY GUARD: Terminal APPROVED and REJECTED states must NEVER be retried
  if (job.status === 'APPROVED' || job.status === 'REJECTED') {
    console.error(
      `\n❌ SAFETY GUARD REJECTION: ContentJob ${job.id} is in terminal state '${job.status}'.`,
    );
    console.error(
      'Approved and rejected jobs are immutable and cannot be re-executed or retried.\n',
    );
    process.exit(1);
  }

  // If job is in REVISION_REQUESTED and has a pending revision, preserve status
  if (job.status === 'REVISION_REQUESTED' && job.revisionRequests.length > 0) {
    console.log(
      `ℹ️ ContentJob ${jobId} has pending revision request. Maintaining REVISION_REQUESTED status.`,
    );
  } else {
    // Safe retry: reset job to REQUESTED
    await prisma.contentJob.update({
      where: { id: jobId },
      data: { status: 'REQUESTED' },
    });
    console.log(`✅ ContentJob ${jobId} status reset to REQUESTED for safe reprocessing.`);
  }

  // Re-enqueue to BullMQ queue
  try {
    const { GlideClient } =
      await import('../packages/jobs/node_modules/@valkey/valkey-glide/build-ts/index.js');
    const { Queue, createValkeyGlideClient } =
      await import('../packages/jobs/node_modules/bullmq/dist/cjs/index.js');
    const valkeyHost = process.env.VALKEY_HOST || '127.0.0.1';
    const valkeyPort = parseInt(process.env.VALKEY_PORT || '6379', 10);
    const glide = await GlideClient.createClient({
      addresses: [{ host: valkeyHost, port: valkeyPort }],
    });
    const queue = new Queue('content-generation', { connection: createValkeyGlideClient(glide) });

    await queue.add(
      'GENERATE_CONTENT',
      { contentJobId: jobId },
      { jobId: `generate-${jobId}-${Date.now()}` },
    );

    console.log(`🚀 ContentJob ${jobId} enqueued to BullMQ (content-generation).`);
    await queue.close();
    glide.close();
  } catch (err) {
    console.error(`⚠️ Failed to enqueue to BullMQ: ${err?.message || err}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? '--status';

  try {
    if (command === '--status' || command === '-s') {
      await printStatus();
    } else if (command === '--failed' || command === '-f') {
      await listFailed();
    } else if (command === '--detect-stuck' || command === '-d') {
      await detectStuck();
    } else if (command === '--retry' || command === '-r') {
      const jobId = args[1];
      if (!jobId) {
        console.error('Usage: node scripts/queue-operations.mjs --retry <jobId>');
        process.exit(1);
      }
      await retryJob(jobId);
    } else {
      console.log(
        'Usage: node scripts/queue-operations.mjs [--status | --failed | --detect-stuck | --retry <jobId>]',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main();
