import { Buffer } from 'node:buffer';
const { fetch } = globalThis;
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const e = JSON.parse(await readFile('output/playwright/isolated-environment.json', 'utf8'));
const base = e.api;
async function login(name) {
  const r = await fetch(base + '/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginIdentifier: name, password: e.password }),
  });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const cookie = await login(e.creator);
async function req(path, body) {
  const r = await fetch(base + '/v1' + path, {
    method: body ? 'POST' : 'GET',
    headers: { cookie, 'Content-Type': 'application/json', origin: e.url },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  return { status: r.status, data: JSON.parse(text) };
}
const state = await (await fetch(base + '/__test/state')).json();
const postId = state.posts.find(
  (post) => post.revisionNumber === 3 && ['UNDER_REVIEW', 'APPROVED'].includes(post.status),
).id;
const self = await req(`/posts/${postId}/actions`, {
  expectedRevision: 3,
  expectedReviewRound: 1,
  action: 'APPROVE',
});
console.log(JSON.stringify(self));
await writeFile('output/playwright/backend-self-approval.json', JSON.stringify(self, null, 2));
assert.equal(self.status, 403);
if (process.argv.includes('--self-only')) process.exit(0);
const reviewerCookie = await login(e.reviewer);
const r = await fetch(base + `/v1/posts/${postId}`, { headers: { cookie: reviewerCookie } });
const detail = await r.json();
console.log('detail keys', Object.keys(detail));
await writeFile('output/playwright/approved-browser-post.json', JSON.stringify(detail, null, 2));
assert.equal(detail.status, 'APPROVED');
assert.equal(detail.events.filter((x) => x.action === 'APPROVE').length, 1);
const { createHash } = await import('node:crypto');
const hash = (b) => createHash('sha256').update(b).digest('hex');
const { createRequire } = await import('node:module');
const sharp = createRequire(import.meta.url)('../packages/application/node_modules/sharp');
const prefix = `post-${postId}-r${detail.revisionNumber}`;
const downloaded = await readFile(`/Users/macbookpro/Downloads/${prefix}.png`);
const json = JSON.parse(
  await readFile(`/Users/macbookpro/Downloads/${prefix}-captions.json`, 'utf8'),
);
const manifest = JSON.parse(
  await readFile(`/Users/macbookpro/Downloads/${prefix}-manifest.json`, 'utf8'),
);
const txt = await readFile(`/Users/macbookpro/Downloads/${prefix}-captions.txt`);
const image = Buffer.from(
  await (
    await fetch(base + detail.previewUrl, { headers: { cookie: reviewerCookie } })
  ).arrayBuffer(),
);
assert.deepEqual(downloaded, image);
assert.deepEqual(json, detail.caption);
assert.equal(hash(downloaded), manifest.poster.sha256);
assert.equal(hash(txt), manifest.captions.textSha256);
assert.equal(manifest.revisionId, detail.currentRevision.id);
assert.equal(manifest.captionRevisionId, detail.currentRevision.id);
const metadata = await sharp(downloaded).metadata();
assert.equal(metadata.width, 1080);
assert.equal(metadata.height, 1080);
const proof = {
  postId,
  approvedRevision: detail.currentRevision.id,
  imageSha256: hash(downloaded),
  width: metadata.width,
  height: metadata.height,
  bytes: downloaded.length,
  captionsExact: true,
  provider: e.mcpMode ? 'isolated-fake-mcp' : 'fake',
  costUsd: 0,
  independentTestAccounts: true,
};
await writeFile('output/playwright/download-proof.json', JSON.stringify(proof, null, 2));
await writeFile('output/playwright/verified-approved-poster.png', downloaded);
console.log(proof);
