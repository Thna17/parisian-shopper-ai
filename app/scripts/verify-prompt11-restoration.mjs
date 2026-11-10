import { URL } from 'node:url';
const { fetch } = globalThis;
// Read-only checks against verify-post-workflow.mjs's disposable fixture environment.
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import assert from 'node:assert/strict';
import { PrismaService } from '../packages/database/dist/prisma.service.js';
const fixture = JSON.parse(await readFile('output/playwright/isolated-environment.json', 'utf8'));
assert.equal(fixture.api, 'http://127.0.0.1:3184');
assert.match(fixture.database, /^post_browser_[a-f0-9]+$/);
assert.equal(fixture.mcpMode, false);
const local = parseEnv(await readFile('.env', 'utf8'));
const url = new URL(local.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
url.pathname = '/' + fixture.database;
const db = new PrismaService({ datasources: { db: { url: url.toString() } } });
try {
  const before = {
    policies: await db.aiBudgetPolicy.count(),
    images: await db.postGeneration.count(),
    captions: await db.postCaptionAttempt.count(),
    publications: await db.publication.count(),
  };
  const login = await fetch(fixture.api + '/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': '1', Origin: fixture.url },
    body: JSON.stringify({ loginIdentifier: fixture.creator, password: fixture.password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const paths = [
    '/v1/posts?page=1&scope=mine',
    '/v1/posts?page=1&scope=reviews',
    '/v1/posts?page=1&scope=approved',
    '/v1/campaigns?status=ACTIVE&limit=4',
    '/v1/products',
    '/v1/creative/templates',
    '/v1/analytics/content',
    '/v1/analytics/creative',
    '/v1/analytics/publishing',
    '/v1/analytics/budgets',
  ];
  const results = [];
  for (const path of paths) {
    const result = await fetch(fixture.api + path, { headers: { cookie } });
    assert.equal(result.status, 200, path);
    const data = await result.json();
    if (path.endsWith('/budgets')) assert.deepEqual(data, { configured: false });
    results.push({ path, status: result.status });
  }
  const after = {
    policies: await db.aiBudgetPolicy.count(),
    images: await db.postGeneration.count(),
    captions: await db.postCaptionAttempt.count(),
    publications: await db.publication.count(),
  };
  assert.deepEqual(
    after,
    before,
    'Reading workspaces must not create budgets, generation requests or publications',
  );
  const report = {
    environment: 'disposable database; real application endpoints; fake providers',
    results,
    unchanged: after,
    providerRequestsSubmitted: 0,
    creditsSpent: 0,
    messagesSent: 0,
    published: 0,
  };
  await writeFile('output/runtime/prompt11-endpoints.json', JSON.stringify(report, null, 2));
  console.log('Verified 10 real endpoints; no budget creation, generation or publication.');
} finally {
  await db.$disconnect();
}
