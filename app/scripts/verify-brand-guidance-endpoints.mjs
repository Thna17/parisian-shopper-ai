// Operates only on the disposable, fake-provider harness; never a configured business database.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { generateTransparentProductPng_TEST_ONLY } from '../packages/application/dist/index.js';
const fixture = JSON.parse(await readFile('output/playwright/isolated-environment.json', 'utf8'));
assert.equal(fixture.api, 'http://127.0.0.1:3184');
assert.match(fixture.database, /^post_browser_[a-f0-9]+$/);
assert.equal(fixture.captionMode, true);
assert.equal(fixture.mcpMode, false);
const base = fixture.api;
async function login(loginIdentifier) {
  const r = await fetch(base + '/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loginIdentifier, password: fixture.password }),
  });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const admin = await login(fixture.creator),
  reviewer = await login(fixture.reviewer);
async function request(path, body, cookie = admin, expected = 201) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { cookie, origin: fixture.url, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await r.json();
  assert.equal(r.status, body ? expected : 200, JSON.stringify(result));
  return result;
}
const root = '/v1/brand/guidance';
const initial = await request(root);
assert.equal(initial.length, 0);
const media = await request(root + '/media', {
  base64: generateTransparentProductPng_TEST_ONLY({ width: 80, height: 140 }).toString('base64'),
  mimeType: 'image/png',
});
const reference = await request(root + '/references', {
  data: {
    sourceSystem: 'FACEBOOK',
    sourceUrl: 'https://example.invalid/brand-fixture',
    captionText: 'Fixture caption style only',
    copyrightDeclared: true,
    copyrightOwner: 'Isolated test owner',
    licenseReference: 'Isolated fixture permission',
    tags: ['historical-poster'],
    mediaCasKeys: [media.storageKey],
  },
});
assert.equal(reference.status, 'UNREVIEWED');
await request(
  root + '/references/' + reference.id + '/review',
  {
    digest: reference.sourceDigest,
    expectedReviewEventId: null,
    confirmed: true,
    decision: 'APPROVED',
    notes: 'Fixture reviewed',
    rightsConfirmed: false,
  },
  admin,
  400,
);
const approved = await request(root + '/references/' + reference.id + '/review', {
  digest: reference.sourceDigest,
  expectedReviewEventId: null,
  confirmed: true,
  decision: 'APPROVED',
  notes: 'Fixture permission verified',
  rightsConfirmed: true,
});
assert.equal(approved.status, 'APPROVED');
await request(
  root + '/references/' + reference.id + '/review',
  {
    digest: reference.sourceDigest,
    expectedReviewEventId: null,
    confirmed: true,
    decision: 'REJECTED',
    notes: 'Stale browser',
    rightsConfirmed: false,
  },
  admin,
  409,
);
const rules = {
  language: ['Natural Khmer and English; fixture only'],
  tone: ['Clear'],
  cta: ['Contact the store'],
  promotion: ['No invented offers'],
  perfumeClaims: ['Verified facts only'],
  platforms: { FACEBOOK: ['Concise'], INSTAGRAM: [], TELEGRAM: [], GENERIC: [] },
  visualGuidance: [],
};
const data = {
  name: 'Isolated brand approval',
  formality: 'EDITORIAL',
  capitalization: 'SENTENCE_CASE',
  emojiLimit: 0,
  tone: 'Clear',
  khmerTone: 'Natural Khmer; requires human assessment',
  terminology: [],
  ctaEnglish: 'Contact the store',
  ctaKhmer: 'ទាក់ទងហាង',
  contact: 'Fixture contact',
  claimsRestrictions: ['No invented claims'],
  colors: ['#20313D', '#FFFFFF'],
  headlineFont: 'Playfair Display',
  khmerFont: 'Noto Sans Khmer',
  englishFont: 'Montserrat',
  logoSourceId: null,
  textOnlyBrandName: 'Fixture brand',
  channels: {
    FACEBOOK: {
      templateId: 'EDITORIAL_SPLIT',
      textColor: '#FFFFFF',
      accentColor: '#FFFFFF',
      panelBackground: '#20313D',
      productPlacement: 'RIGHT',
      textPlacement: 'LEFT',
    },
  },
  lighting: 'Soft light',
  referenceSourceIds: [reference.id],
  captionRules: rules,
};
await request(root, { data }, reviewer, 403);
const draft = await request(root, { data });
assert.equal(draft.status, 'DRAFT');
assert.equal(draft.approvalId, null);
await request(
  root + '/' + draft.id + '/approve',
  { digest: draft.digest, confirmed: false },
  admin,
  400,
);
const active = await request(root + '/' + draft.id + '/approve', {
  digest: draft.digest,
  confirmed: true,
});
assert.equal(active.status, 'ACTIVE');
assert.ok(active.approvalId);
const post = await request('/v1/posts', {
  productSnapshotId: fixture.productId,
  brief: 'A factual fixture introduction',
  channel: 'FACEBOOK',
  language: 'BILINGUAL',
  campaignId: fixture.campaignId,
});
await request('/v1/posts/' + post.id + '/caption', {
  expectedRevision: 1,
  method: 'AI',
  brandProfileVersionId: active.id,
  referenceSourceIds: [reference.id],
});
const saved = await request('/v1/posts/' + post.id);
assert.equal(saved.currentRevision.brandSnapshot.profileId, active.id);
assert.equal(saved.currentRevision.brandSnapshot.references[0].sourceId, reference.id);
assert.equal(saved.currentRevision.captionProvenance.historicalPostersUsed, false);
assert.deepEqual(saved.currentRevision.captionProvenance.imageInputReferences, []);
assert.equal(saved.currentRevision.captionProvenance.referenceGuidedCaption, true);
const report = {
  environment: 'disposable fake-provider harness',
  checks: [
    'session and CSRF-protected routes',
    'unreviewed source defaults',
    'rights confirmation required',
    'stale reference review rejected',
    'nonadmin mutation rejected',
    'explicit exact-profile approval',
    'fake caption Post version/reference provenance',
  ],
  paidRequests: 0,
  messagesSent: 0,
  realBusinessApprovals: 0,
};
await writeFile(
  'output/runtime/brand-guidance-endpoints.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report));
