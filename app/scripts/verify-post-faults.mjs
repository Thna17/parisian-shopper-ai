const { fetch } = globalThis;
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const e = JSON.parse(await readFile('output/playwright/isolated-environment.json', 'utf8')),
  base = e.api;
const login = await fetch(base + '/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ loginIdentifier: e.creator, password: e.password }),
});
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';')[0];
async function api(path, body) {
  const r = await fetch(base + '/v1' + path, {
    method: body ? 'POST' : 'GET',
    headers: { cookie, 'Content-Type': 'application/json', origin: e.url },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
async function control(path) {
  return (await fetch(base + '/__test/' + path, { method: 'POST' })).json();
}
async function state() {
  return (await fetch(base + '/__test/state')).json();
}
async function create(brief) {
  const r = await api('/posts', {
    productSnapshotId: e.productId,
    brief,
    channel: 'FACEBOOK',
    language: 'BILINGUAL',
    campaignId: e.campaignId,
  });
  assert.equal(r.status, 201);
  return r.data;
}
async function awaitStatus(id, status) {
  for (let i = 0; i < 40; i++) {
    const s = await state(),
      g = s.generations.find((g) => g.postId === id);
    if (g?.status === status) return g;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Timed out waiting for ' + status);
}
const checks = [];
await control('mode/uncertain');
const polling = await create('ISOLATED polling uncertainty');
const clicks = await Promise.all(
  Array.from({ length: 8 }, () => api(`/posts/${polling.id}/generation`, { expectedRevision: 1 })),
);
assert(clicks.every((r) => r.status === 201));
const uncertain = await awaitStatus(polling.id, 'UNCERTAIN');
assert(uncertain.requestId);
assert.equal((await state()).submits.filter((id) => id === uncertain.id).length, 1);
await control('mode/complete');
await control('restart');
await awaitStatus(polling.id, 'COMPLETE');
assert.equal((await state()).submits.filter((id) => id === uncertain.id).length, 1);
checks.push(
  '8 concurrent generation calls: one ledger row and one submission; polling timeout recovers after worker restart without resubmission',
);
await control('mode/uncertain-no-id');
const ambiguous = await create('ISOLATED lost submission response');
await api(`/posts/${ambiguous.id}/generation`, { expectedRevision: 1 });
const unknown = await awaitStatus(ambiguous.id, 'UNCERTAIN');
assert.equal(unknown.requestId, null);
await control('mode/complete');
await control('restart');
const repeated = await Promise.all(
  Array.from({ length: 5 }, () =>
    api(`/posts/${ambiguous.id}/generation`, { expectedRevision: 1 }),
  ),
);
assert(repeated.every((r) => r.status === 201));
const reconcile = await api(`/posts/${ambiguous.id}/generation/reconcile`, {});
assert.equal(reconcile.status, 409);
assert.equal((await state()).generations.filter((g) => g.postId === ambiguous.id).length, 1);
assert.equal((await state()).submits.filter((id) => id === unknown.id).length, 1);
checks.push(
  'Lost submission response without ID stays uncertain; restart, repeated clicks and reconciliation cannot cause another submission',
);
await control('mode/failure');
const failed = await create('ISOLATED terminal provider failure');
await api(`/posts/${failed.id}/generation`, { expectedRevision: 1 });
const terminal = await awaitStatus(failed.id, 'FAILED');
assert(terminal.requestId);
await control('mode/complete');
await control('restart');
assert.equal((await state()).submits.filter((id) => id === terminal.id).length, 1);
checks.push('Terminal provider failure persists FAILED across restart; no duplicate dispatch');
const saved = await state();
assert.equal(saved.redisConnected, false);
assert(
  saved.generations
    .filter((g) => g.status === 'COMPLETE')
    .every((g) => Number(g.actualCostUsd) === 0),
);
await writeFile(
  'output/playwright/fault-proof.json',
  JSON.stringify(
    {
      checks,
      posts: { polling: polling.id, ambiguous: ambiguous.id, failed: failed.id },
      submissions: saved.submits,
      realCharges: 0,
    },
    null,
    2,
  ),
);
console.log(checks);
