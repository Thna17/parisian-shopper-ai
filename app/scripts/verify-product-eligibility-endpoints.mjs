// Local disposable harness only. No provider generation, external transport or business-policy seeding.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const f = JSON.parse(await readFile('output/playwright/isolated-environment.json', 'utf8'));
assert.equal(f.api, 'http://127.0.0.1:3184');
assert.match(f.database, /^post_browser_[a-f0-9]+$/);
assert.equal(f.mcpMode, false);
const base = f.api;
async function login(name) {
  const r = await fetch(base + '/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loginIdentifier: name, password: f.password }),
  });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const creator = await login(f.creator),
  reviewer = await login(f.reviewer);
async function request(path, body, cookie = creator, expected = 201) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { cookie, origin: f.url, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.equal(r.status, body ? expected : 200, JSON.stringify(data));
  return data;
}
async function mode(value) {
  assert.equal((await fetch(base + '/__test/source/' + value, { method: 'POST' })).status, 200);
}
const before = await request('/__test/state');
assert.equal(before.provider, 'fake');
assert.equal(before.redisConnected, false);
const postInput = {
  productSnapshotId: f.productId,
  brief: 'A factual fixture product introduction',
  channel: 'FACEBOOK',
  language: 'BILINGUAL',
  campaignId: f.campaignId,
};
const post = await request('/v1/posts', postInput);
const cached = await request(`/v1/posts/${post.id}/product-check`);
assert.equal(cached.source.status, 'CACHED');
assert.equal(cached.eligible, false);
const fresh = await request(`/v1/posts/${post.id}/product-check`, {});
assert.equal(fresh.source.status, 'MOCK');
assert.equal(fresh.eligible, true);
await mode('offline');
const outage = await request(`/v1/posts/${post.id}/product-check`, {});
assert.equal(outage.source.status, 'UNAVAILABLE');
assert.equal(outage.eligible, false);
assert.equal(outage.source.asOf, cached.source.asOf);
const readiness = await request(`/v1/products/${f.productId}/readiness`);
assert.notEqual(readiness.freshnessState, 'FRESH');
assert.equal(readiness.sourceCheck.status, 'UNAVAILABLE');
await mode('price-change');
const changed = await request(`/v1/posts/${post.id}/product-check`, {});
assert.equal(changed.eligible, false);
assert.ok(changed.changedScopes.includes('catalogPrice'));
assert.ok(changed.currentSnapshotId);
const original = await request(`/v1/posts/${post.id}`);
assert.equal(original.revisionNumber, 1);
assert.equal(original.currentRevision.productSnapshotId, f.productId);
const updated = await request(`/v1/posts/${post.id}/refresh-product`, { expectedRevision: 1 });
assert.equal(updated.status, 'DRAFT');
assert.equal(updated.revisionNumber, 2);
assert.notEqual(updated.currentRevision.productSnapshotId, f.productId);
assert.equal(updated.currentRevision.generationId, null);
assert.equal(updated.caption, null);
await mode('current');
const repeat = await request('/v1/posts', postInput);
const warning = await request(`/v1/posts/${repeat.id}/product-check`, {});
assert.equal(warning.eligible, true);
assert.ok(warning.historyWarnings.some((w) => w.code === 'CAMPAIGN_REPEAT'));
await mode('low-stock');
const unconfigured = await request(`/v1/posts/${repeat.id}/product-check`, {});
assert.ok(unconfigured.issues.some((i) => i.code === 'STOCK_POLICY_MISSING'));
const data = {
  policyId: 'isolated-product-policy',
  version: '1',
  confirmed: false,
  ttl: {
    stockSeconds: 300,
    catalogPriceSeconds: 900,
    campaignPriceSeconds: 900,
    promotionSeconds: 900,
    promotionRecheckWindowSeconds: 3600,
    permanentFactsSeconds: 86400,
    hardExpiryBoundarySeconds: 172800,
  },
  marketing: { stockActions: { low_stock: 'WARN', out_of_stock: 'BLOCK', unknown: 'BLOCK' } },
};
await request('/v1/products/marketing/policy', { data }, creator, 400);
await request(
  '/v1/products/marketing/policy',
  { data: { ...data, confirmed: true } },
  reviewer,
  403,
);
await request('/v1/products/marketing/policy', { data: { ...data, confirmed: true } });
const lowRevision = await request(`/v1/posts/${repeat.id}/refresh-product`, {
  expectedRevision: 1,
});
const allowedLow = await request(`/v1/posts/${repeat.id}/product-check`, {});
assert.equal(allowedLow.eligible, true);
assert.ok(allowedLow.issues.some((i) => i.code === 'STOCK_WARNING' && !i.blocking));
assert.equal(lowRevision.status, 'DRAFT');
await mode('out-of-stock');
const blocked = await request(`/v1/posts/${repeat.id}/product-check`, {});
assert.equal(blocked.eligible, false);
assert.ok(blocked.issues.some((i) => i.code === 'STOCK_BLOCKED'));
const after = await request('/__test/state');
assert.equal(after.generations.length, before.generations.length);
assert.equal(after.submits.length, before.submits.length);
const report = {
  environment: 'isolated fake product source, real Nest endpoints and disposable PostgreSQL',
  checks: [
    'cached and checked facts distinguished',
    'source outage preserves original as-of time',
    'changed prices require new revision',
    'new facts clear caption and poster',
    'campaign repeat advisory',
    'stock policy missing handled explicitly',
    'business policy confirmation required',
    'unauthorized policy approval rejected',
    'approved low-stock warning and out-of-stock block',
  ],
  providerRequests: 0,
  externalMessages: 0,
  published: 0,
};
await writeFile(
  'output/runtime/product-eligibility-endpoints.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report));
