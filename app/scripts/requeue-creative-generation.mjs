#!/usr/bin/env node

import process from 'node:process';
import { createRequire } from 'node:module';
import { URL } from 'node:url';

const require = createRequire(new URL('../packages/jobs/package.json', import.meta.url));
const { Queue, createValkeyGlideClient } = require('bullmq');
const { GlideClient } = require('@valkey/valkey-glide');

const args = process.argv.slice(2);

function argument(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const contentVersionId = argument('--content-version-id');
const requestedBy = argument('--requested-by');

if (!contentVersionId || !requestedBy) {
  throw new Error(
    'Usage: node scripts/requeue-creative-generation.mjs --content-version-id UUID --requested-by UUID',
  );
}

const host = process.env.VALKEY_HOST ?? '127.0.0.1';
const port = Number(process.env.VALKEY_PORT ?? 6379);
const client = await GlideClient.createClient({
  addresses: [{ host, port }],
  clientName: 'parisian-shopper-creative-requeue',
  requestTimeout: 1_000,
  ...(process.env.VALKEY_PASSWORD
    ? { credentials: { password: process.env.VALKEY_PASSWORD } }
    : {}),
});
const queue = new Queue('creative-generation', {
  connection: createValkeyGlideClient(client),
});

try {
  await queue.waitUntilReady();
  const job = await queue.add(
    'GENERATE_CREATIVE',
    { contentVersionId, requestedBy },
    {
      jobId: `creative-${contentVersionId}-${Date.now()}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
    },
  );
  console.log(`Creative generation requeued: ${job.id}`);
} finally {
  await queue.close();
  client.close();
}
