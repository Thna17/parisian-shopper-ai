// Disposable --mcp harness ONLY: real HTTP endpoints and a loopback fake MCP server.
import assert from 'node:assert/strict';
import { URL } from 'node:url';
const { fetch } = globalThis;
import { readFile, writeFile } from 'node:fs/promises';
const e = JSON.parse(await readFile('output/playwright/isolated-environment.json', 'utf8'));
assert.equal(e.mcpMode, true, 'Refusing to run outside the isolated fake MCP harness');
assert.equal(new URL(e.api).hostname, '127.0.0.1');
const base = e.api;
async function state() {
  return (await fetch(base + '/__test/state')).json();
}
assert.equal((await state()).provider, 'isolated-fake-mcp');
async function login(name) {
  const r = await fetch(base + '/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginIdentifier: name, password: e.password }),
  });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const creator = await login(e.creator),
  reviewer = await login(e.reviewer);
async function api(path, body, cookie = creator) {
  const r = await fetch(base + '/v1' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { cookie, 'Content-Type': 'application/json', origin: e.url },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: r.status, data: await r.json() };
}
async function control(path) {
  const r = await fetch(base + '/__test/' + path, { method: 'POST' });
  assert.equal(r.status, 200);
  return r.json();
}
async function wait(id, status) {
  for (let i = 0; i < 120; i++) {
    const g = (await state()).generations.find((g) => g.postId === id);
    if (g?.status === status) return g;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw Error('Timed out awaiting ' + status);
}
async function prepare(brief) {
  const p = await api('/posts', {
    productSnapshotId: e.productId,
    brief,
    channel: 'FACEBOOK',
    language: 'BILINGUAL',
    campaignId: e.campaignId,
  });
  assert.equal(p.status, 201);
  const clicks = await Promise.all(
    Array.from({ length: 8 }, () => api(`/posts/${p.data.id}/generation`, { expectedRevision: 1 })),
  );
  assert(clicks.every((r) => r.status === 201));
  const rows = (await state()).generations.filter((g) => g.postId === p.data.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'AWAITING_CONFIRMATION');
  const q = await api(`/posts/${p.data.id}/generation/quote`, {});
  assert.equal(q.status, 201);
  return { id: p.data.id, generation: q.data.generation };
}
async function confirm(p) {
  const q = p.generation.creditQuote;
  const r = await api(`/posts/${p.id}/generation/confirm-credits`, {
    generationId: p.generation.id,
    fingerprint: q.fingerprint,
    confirmed: true,
  });
  assert.equal(r.status, 201);
}
const checks = [];
for (const [path, body] of [
  ['/integrations/higgsfield-mcp', undefined],
  ['/integrations/higgsfield-mcp/connect', {}],
  ['/integrations/higgsfield-mcp/check', {}],
  ['/integrations/higgsfield-mcp/disconnect', {}],
]) {
  assert.equal((await api(path, body, '')).status, 401);
  assert.equal((await api(path, body, reviewer)).status, 403);
}
assert.equal(
  (await api('/integrations/higgsfield-mcp/callback?code=bad&state=bad', undefined, '')).status,
  400,
);
const checked = await api('/integrations/higgsfield-mcp/check', {});
assert.equal(checked.status, 201);
assert(Number.isFinite(checked.data.balance) && checked.data.balance > 0);
checks.push(
  'Admin-only connection/read-only balance; unauthenticated and non-admin access blocked; unknown OAuth callback state rejected',
);
await control('mode/uncertain');
let before = (await state()).submits.length;
const polling = await prepare('ISOLATED MCP polling timeout and duplicate clicks');
const bad = await api(`/posts/${polling.id}/generation/confirm-credits`, {
  generationId: polling.generation.id,
  fingerprint: '0'.repeat(64),
  confirmed: true,
});
assert.equal(bad.status, 409);
assert.equal((await state()).submits.length, before);
assert.equal(
  (
    await api(
      `/posts/${polling.id}/generation/confirm-credits`,
      {
        generationId: polling.generation.id,
        fingerprint: polling.generation.creditQuote.fingerprint,
        confirmed: true,
      },
      reviewer,
    )
  ).status,
  403,
);
await confirm(polling);
const uncertain = await wait(polling.id, 'UNCERTAIN');
assert(uncertain.requestId);
assert.equal((await state()).submits.length, before + 1);
await control('mode/complete');
await control('restart');
await wait(polling.id, 'COMPLETE');
assert.equal((await state()).submits.length, before + 1);
checks.push(
  'Eight concurrent clicks create one row; exact confirmation and budget permission enforced; polling uncertainty recovers after worker restart with one submission',
);
await control('mode/uncertain-no-id');
before = (await state()).submits.length;
const lost = await prepare('ISOLATED MCP accepted request with lost response');
await confirm(lost);
const unknown = await wait(lost.id, 'UNCERTAIN');
assert.equal(unknown.requestId, null);
assert.equal((await state()).submits.length, before + 1);
await control('mode/complete');
await control('restart');
for (let i = 0; i < 3; i++)
  assert.equal((await api(`/posts/${lost.id}/generation`, { expectedRevision: 1 })).status, 201);
assert.equal((await api(`/posts/${lost.id}/generation/reconcile`, {})).status, 409);
assert.equal((await state()).submits.length, before + 1);
checks.push(
  'Lost submission response stays uncertain; restarts, repeated clicks and reconciliation do not resubmit',
);
await control('mode/failure');
before = (await state()).submits.length;
const failure = await prepare('ISOLATED MCP terminal provider failure');
await confirm(failure);
const failed = await wait(failure.id, 'FAILED');
assert(failed.requestId);
await control('mode/complete');
await control('restart');
assert.equal((await state()).submits.length, before + 1);
checks.push('Terminal provider failure persists and never automatically dispatches again');
const saved = await state();
assert.equal(saved.redisConnected, false);
const proof = {
  checks,
  posts: { polling: polling.id, lost: lost.id, failed: failure.id },
  fakeSubmissions: saved.submits.length,
  realCharges: 0,
  provider: 'isolated-fake-mcp',
};
await writeFile('output/playwright/server-mcp-endpoint-proof.json', JSON.stringify(proof, null, 2));
console.log(proof);
