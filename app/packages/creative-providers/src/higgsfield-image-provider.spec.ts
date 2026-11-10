import { describe, it, expect, jest } from '@jest/globals';
import { HiggsfieldImageProvider } from './higgsfield-image-provider.js';
describe('app-side Higgsfield image REST adapter', () => {
  it('submits one background with server credentials and polls the saved ID', async () => {
    const request = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ request_id: 'req-1' }))
      .mockResolvedValueOnce(
        Response.json({
          status: 'completed',
          images: [{ url: 'https://images.higgsfield.ai/result.png' }],
        }),
      );
    const provider = new HiggsfieldImageProvider(
      'test-only-key',
      ['images.higgsfield.ai'],
      request,
    );
    expect(await provider.submit('Background only', 'dispatch')).toEqual({ requestId: 'req-1' });
    expect(await provider.status('req-1')).toEqual({
      state: 'complete',
      imageUrl: 'https://images.higgsfield.ai/result.png',
    });
    expect(request.mock.calls[0]?.[0]).toBe('https://api.higgsfield.ai/marketing-studio/image');
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: 'Key test-only-key' },
    });
    expect(JSON.parse(request.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      resolution: '1k',
      aspect_ratio: '1:1',
      quality: 'low',
      enhance_prompt: false,
    });
    expect(request.mock.calls[1]?.[1]?.method).toBe('GET');
  });
  it('never retries a timed out POST or a response without an ID', async () => {
    const request = jest.fn<typeof fetch>().mockRejectedValue(new Error('timeout'));
    await expect(
      new HiggsfieldImageProvider('test', ['images.higgsfield.ai'], request).submit(
        'background',
        'id',
      ),
    ).rejects.toThrow('timeout');
    expect(request).toHaveBeenCalledTimes(1);
    request.mockReset().mockResolvedValue(Response.json({ status: 'queued' }));
    await expect(
      new HiggsfieldImageProvider('test', ['images.higgsfield.ai'], request).submit(
        'background',
        'id',
      ),
    ).rejects.toThrow('uncertain');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('rejects redirects, private/unapproved output hosts and wrong content types', async () => {
    const request = jest
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('not an image', { headers: { 'content-type': 'text/html' } }),
      );
    const provider = new HiggsfieldImageProvider('test', ['images.higgsfield.ai'], request);
    await expect(provider.download('http://127.0.0.1/secret')).rejects.toThrow('host');
    await expect(
      provider.download('https://images.higgsfield.ai.evil.example/a.png'),
    ).rejects.toThrow('host');
    expect(request).not.toHaveBeenCalled();
    await expect(provider.download('https://images.higgsfield.ai/a.png')).rejects.toThrow(
      'invalid',
    );
    expect(request.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
    expect(request.mock.calls[0]?.[1]?.headers).toBeUndefined();
  });
  it('records blocked results as terminal failures and unknown statuses as uncertain', async () => {
    const request = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ status: 'nsfw' }))
      .mockResolvedValueOnce(Response.json({ status: 'new-status' }));
    const provider = new HiggsfieldImageProvider('test', ['images.higgsfield.ai'], request);
    expect((await provider.status('req-1')).state).toBe('failed');
    await expect(provider.status('req-1')).rejects.toThrow('Unrecognized');
  });
});
