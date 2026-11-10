import { webcrypto, createHash } from 'node:crypto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadApprovedPost } from '../api/posts-api.js';
const data = new TextEncoder().encode('exact approved bytes');
const sha = createHash('sha256').update(data).digest('hex');
function response(checksum = sha, revision = 'revision') {
  return new Response(data, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': 'attachment; filename="approved.png"',
      'X-Content-SHA256': checksum,
      'X-Post-Revision': revision,
    },
  });
}
afterEach(() => vi.unstubAllGlobals());
describe('verified browser downloads', () => {
  it('sends the pinned approval and checks exact bytes before creating a download', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const fetcher = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetcher);
    const file = await downloadApprovedPost('post', 'revision', 2, 'poster');
    expect(fetcher).toHaveBeenCalledWith(
      '/v1/posts/post/download/poster?revisionId=revision&reviewRound=2',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(file.filename).toBe('approved.png');
    expect(file.blob.size).toBe(data.length);
  });
  it('rejects altered bytes or a different revision instead of saving them', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response('0'.repeat(64)))
      .mockResolvedValueOnce(response(sha, 'different-revision'));
    vi.stubGlobal('fetch', fetcher);
    await expect(downloadApprovedPost('post', 'revision', 2, 'poster')).rejects.toThrow(
      'No file was saved',
    );
    await expect(downloadApprovedPost('post', 'revision', 2, 'poster')).rejects.toThrow(
      'No file was saved',
    );
  });
  it('shows the server approval/permission error without treating JSON as an image', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { message: 'This revision is no longer approved.' } },
            { status: 409 },
          ),
        ),
    );
    await expect(downloadApprovedPost('post', 'revision', 2, 'poster')).rejects.toThrow(
      'no longer approved',
    );
  });
});
