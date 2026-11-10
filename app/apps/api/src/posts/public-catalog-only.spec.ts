import { describe, it, expect } from '@jest/globals';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { publicCatalogOnly } from './public-catalog-only.js';
describe('public catalog versus private generated files', () => {
  it('keeps public catalog photos while denying static access to CAS, including encoded/traversal variants', async () => {
    const root = await mkdtemp(join(tmpdir(), 'post-public-assets-'));
    try {
      await mkdir(join(root, 'cas'), { recursive: true });
      await writeFile(join(root, 'cas', 'private.png'), 'private unapproved bytes');
      await writeFile(join(root, 'catalog.png'), 'public catalog bytes');
      const app = express();
      app.use('/assets', publicCatalogOnly(express.static(root)));
      expect((await request(app).get('/assets/catalog.png')).status).toBe(200);
      for (const url of [
        '/assets/cas/private.png',
        '/assets/%63as/private.png',
        '/assets/CAS/private.png',
        '/assets/nested/%2e%2e/cas/private.png',
        '/assets/%5ccas%5cprivate.png',
      ]) {
        const result = await request(app).get(url);
        expect(result.status).not.toBe(200);
        expect(result.text).not.toContain('private unapproved bytes');
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
