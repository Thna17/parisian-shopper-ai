import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const { fetch } = globalThis;
const e = JSON.parse(await readFile('output/playwright/isolated-environment.json', 'utf8'));
assert(e.mcpMode && e.api === 'http://127.0.0.1:3184');
const login = await fetch(e.api + '/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ loginIdentifier: e.reviewer, password: e.password }),
});
const cookie = login.headers.get('set-cookie').split(';')[0];
const id = JSON.parse(
  await readFile('output/playwright/content-flow-feedback-proof.json', 'utf8'),
).postId;
const post = await (await fetch(e.api + '/v1/posts/' + id, { headers: { cookie } })).json();
assert.equal(post.status, 'APPROVED');
assert.equal(post.revisionNumber, 5);
assert.equal(post.reviewRound, 2);
const prefix = `/Users/macbookpro/Downloads/post-${id}-r5`;
const image = await readFile(prefix + '.png'),
  captions = JSON.parse(await readFile(prefix + '-captions.json', 'utf8')),
  text = await readFile(prefix + '-captions.txt'),
  manifest = JSON.parse(await readFile(prefix + '-manifest.json', 'utf8'));
const saved = Buffer.from(
  await (await fetch(e.api + post.previewUrl, { headers: { cookie } })).arrayBuffer(),
);
const hash = (b) => createHash('sha256').update(b).digest('hex');
assert.deepEqual(image, saved);
assert.deepEqual(captions, post.caption);
assert.equal(hash(image), manifest.poster.sha256);
assert.equal(hash(text), manifest.captions.textSha256);
assert.equal(manifest.revisionId, post.currentRevision.id);
const sharp = createRequire(import.meta.url)('../packages/application/node_modules/sharp');
const dimensions = await sharp(image).metadata();
assert.equal(dimensions.width, 1080);
assert.equal(dimensions.height, 1080);
const state = await (await fetch(e.api + '/__test/state')).json();
assert.equal(state.submits.length, 2);
assert.equal(state.redisConnected, false);
assert.equal(post.revisions.length, 5);
assert(post.events.some((x) => x.action === 'REJECT'));
assert(post.events.some((x) => x.action === 'APPROVE' && x.reviewRound === 2));
assert.equal(post.currentRevision.creationPlan.style, 'EDITORIAL');
const proof = {
  postId: id,
  approvedRevision: 5,
  reviewRound: 2,
  historyVersions: 5,
  reviewerRejectedEarlierVersion: true,
  captionExact: true,
  imageBytes: image.length,
  imageSha256: hash(image),
  width: 1080,
  height: 1080,
  provider: 'isolated-fake-mcp',
  fakeSubmissions: 2,
  realCharges: 0,
};
await writeFile(
  'output/playwright/content-flow-download-proof.json',
  JSON.stringify(proof, null, 2),
);
console.log(proof);
