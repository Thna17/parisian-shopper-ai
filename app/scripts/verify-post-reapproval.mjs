const { fetch } = globalThis;
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const e = JSON.parse(await readFile('output/playwright/isolated-environment.json', 'utf8')),
  old = JSON.parse(await readFile('output/playwright/approved-browser-post.json', 'utf8'));
const login = await fetch(e.api + '/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ loginIdentifier: e.reviewer, password: e.password }),
});
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';')[0];
const r = await fetch(e.api + '/v1/posts/' + old.id, { headers: { cookie } }),
  p = await r.json();
assert.equal(p.status, 'DRAFT');
assert.equal(p.revisionNumber, 4);
assert.equal(p.canDownload, false);
assert(p.events.some((x) => x.action === 'APPROVAL_INVALIDATED_BY_EDIT'));
const url =
  e.api +
  `/v1/posts/${p.id}/download/poster?revisionId=${old.currentRevision.id}&reviewRound=${old.reviewRound}`;
const blocked = await fetch(url, { headers: { cookie } });
assert.equal(blocked.status, 409);
const stale = await fetch(e.api + `/v1/posts/${p.id}/actions`, {
  method: 'POST',
  headers: { cookie, 'Content-Type': 'application/json', origin: e.url },
  body: JSON.stringify({ action: 'APPROVE', expectedRevision: 3, expectedReviewRound: 1 }),
});
assert.equal(stale.status, 409);
const proof = {
  postId: p.id,
  status: p.status,
  revision: p.revisionNumber,
  approvalInvalidated: true,
  oldDownloadStatus: blocked.status,
  staleApprovalStatus: stale.status,
  historyRetained: p.revisions.length === 4,
};
await writeFile('output/playwright/reapproval-proof.json', JSON.stringify(proof, null, 2));
console.log(proof);
