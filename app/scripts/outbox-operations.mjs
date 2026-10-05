#!/usr/bin/env node
/**
 * Outbox Operations and Recovery CLI
 * Parisian Shopper AI Telegram Content System — Phase 1G
 *
 * Usage:
 *   node scripts/outbox-operations.mjs --status
 *   node scripts/outbox-operations.mjs --failed
 *   node scripts/outbox-operations.mjs --retry [--id <eventId>]
 *   node scripts/outbox-operations.mjs --dead-letter
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

const MAX_ATTEMPTS_DEAD_LETTER = 5;

async function printStatus() {
  const total = await prisma.outboxEvent.count();
  const processed = await prisma.outboxEvent.count({
    where: { processedAt: { not: null } },
  });
  const pending = await prisma.outboxEvent.count({
    where: { processedAt: null },
  });
  const failed = await prisma.outboxEvent.count({
    where: {
      processedAt: null,
      attemptCount: { gt: 0 },
    },
  });
  const deadLetter = await prisma.outboxEvent.count({
    where: {
      processedAt: null,
      attemptCount: { gte: MAX_ATTEMPTS_DEAD_LETTER },
    },
  });

  const oldestPending = await prisma.outboxEvent.findFirst({
    where: { processedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, topic: true, id: true },
  });

  const backlogAgeSec = oldestPending
    ? Math.floor((Date.now() - new Date(oldestPending.createdAt).getTime()) / 1000)
    : 0;

  const topics = await prisma.outboxEvent.groupBy({
    by: ['topic'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  console.log('\n========================================');
  console.log('   TRANSACTIONAL OUTBOX STATUS REPORT   ');
  console.log('========================================');
  console.log(`Total Events:       ${total}`);
  console.log(`Processed:          ${processed}`);
  console.log(`Pending Backlog:    ${pending}`);
  console.log(`Failed / Retrying:  ${failed}`);
  console.log(`Dead-Lettered:      ${deadLetter} (>= ${MAX_ATTEMPTS_DEAD_LETTER} attempts)`);
  console.log(
    `Oldest Backlog Age: ${backlogAgeSec}s ${backlogAgeSec > 60 ? '⚠️ [WARN: BACKLOG DELAY]' : '✅ [HEALTHY]'}`,
  );
  if (oldestPending) {
    console.log(`Oldest Pending ID:  ${oldestPending.id} (${oldestPending.topic})`);
  }
  console.log('\n--- Events by Topic ---');
  for (const t of topics) {
    console.log(`  - ${t.topic.padEnd(32)}: ${t._count.id}`);
  }
  console.log('========================================\n');
}

async function listFailed(deadLetterOnly = false) {
  const events = await prisma.outboxEvent.findMany({
    where: {
      processedAt: null,
      attemptCount: deadLetterOnly ? { gte: MAX_ATTEMPTS_DEAD_LETTER } : { gt: 0 },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const title = deadLetterOnly ? 'DEAD-LETTER OUTBOX EVENTS' : 'FAILED / RETRYING OUTBOX EVENTS';
  console.log(`\n=== ${title} (${events.length} found) ===`);
  if (events.length === 0) {
    console.log('No matching events found. All outbox deliveries healthy.');
    return;
  }

  for (const e of events) {
    console.log(`\nID:           ${e.id}`);
    console.log(`Topic:        ${e.topic}`);
    console.log(`Attempts:     ${e.attemptCount}/${MAX_ATTEMPTS_DEAD_LETTER}`);
    console.log(`Last Error:   ${e.lastErrorCode ?? 'N/A'}`);
    console.log(`Created:      ${e.createdAt.toISOString()}`);
    console.log(`Next Retry:   ${e.availableAt ? e.availableAt.toISOString() : 'Immediate'}`);
    console.log(`Payload:      ${JSON.stringify(e.payload).slice(0, 100)}...`);
  }
  console.log('\n========================================\n');
}

async function retryEvents(targetId) {
  const where = targetId
    ? { id: targetId, processedAt: null }
    : { processedAt: null, attemptCount: { gt: 0 } };

  const count = await prisma.outboxEvent.count({ where });
  if (count === 0) {
    console.log('No eligible failed outbox events found to retry.');
    return;
  }

  const updated = await prisma.outboxEvent.updateMany({
    where,
    data: {
      attemptCount: 0,
      lastErrorCode: null,
      availableAt: new Date(),
      claimedAt: null,
    },
  });

  console.log(`✅ Successfully reset ${updated.count} event(s) for immediate delivery retry.`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? '--status';

  try {
    if (command === '--status' || command === '-s') {
      await printStatus();
    } else if (command === '--failed' || command === '-f') {
      await listFailed(false);
    } else if (command === '--dead-letter') {
      await listFailed(true);
    } else if (command === '--retry' || command === '-r') {
      const idIdx = args.indexOf('--id');
      const targetId = idIdx !== -1 ? args[idIdx + 1] : undefined;
      await retryEvents(targetId);
    } else {
      console.log(
        'Usage: node scripts/outbox-operations.mjs [--status | --failed | --dead-letter | --retry [--id <id>]]',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main();
