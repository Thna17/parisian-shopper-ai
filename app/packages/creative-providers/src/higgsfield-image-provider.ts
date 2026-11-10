import type {
  PostImageProvider,
  PostImageSettings,
  PostImageStatus,
} from '@parisian-shopper/application';

/** Official asynchronous REST API. OAuth/MCP tokens are never accepted as app credentials. */
export class HiggsfieldImageProvider implements PostImageProvider {
  readonly id = 'higgsfield' as const;
  readonly settings: PostImageSettings = {
    model: 'marketing-studio/image',
    resolution: '1k',
    aspect_ratio: '1:1',
    quality: 'low',
    enhance_prompt: false,
  };
  constructor(
    private readonly apiKey: string,
    private readonly assetHosts: readonly string[],
    private readonly request: typeof fetch = fetch,
  ) {
    if (!apiKey.trim() || assetHosts.length === 0)
      throw new Error('Higgsfield image API key and exact output host allowlist are required.');
  }
  async submit(prompt: string, _dispatchId: string): Promise<{ requestId: string }> {
    // The API does not document idempotency keys. The durable application ledger owns deduplication.
    const { model, ...settings } = this.settings;
    const result = await this.json(`/${model}`, {
      method: 'POST',
      body: JSON.stringify({ ...settings, prompt }),
    });
    if (
      typeof result.request_id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,200}$/.test(result.request_id)
    ) {
      throw new Error(
        'Provider accepted no verifiable request ID; submission outcome is uncertain.',
      );
    }
    return { requestId: result.request_id };
  }
  async status(requestId: string): Promise<PostImageStatus> {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(requestId)) throw new Error('Invalid provider request ID.');
    const result = await this.json(`/requests/${encodeURIComponent(requestId)}/status`, {
      method: 'GET',
    });
    if (['failed', 'nsfw', 'canceled'].includes(String(result.status)))
      return { state: 'failed', reason: 'The image service could not complete this request.' };
    if (result.status === 'completed') {
      const image = Array.isArray(result.images)
        ? (result.images[0] as { url?: unknown } | undefined)
        : undefined;
      if (typeof image?.url !== 'string')
        throw new Error('Completed request did not contain an image.');
      // No documented actual-cost field: keep cost unknown rather than infer it from marketing prices.
      return { state: 'complete', imageUrl: image.url };
    }
    if (['queued', 'in_progress', 'pending', 'processing'].includes(String(result.status)))
      return { state: 'generating' };
    throw new Error('Unrecognized provider status; check again without resubmitting.');
  }
  private async json(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    const response = await this.request(`https://api.higgsfield.ai${path}`, {
      ...init,
      headers: { Authorization: `Key ${this.apiKey}`, 'Content-Type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    // Never expose provider response bodies or credentials through staff errors/logs.
    if (!response.ok) throw new Error(`Image service returned HTTP ${response.status}.`);
    return (await response.json()) as Record<string, unknown>;
  }
  async download(imageUrl: string): Promise<Buffer> {
    const url = new URL(imageUrl);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !this.assetHosts.includes(url.hostname)
    )
      throw new Error('Image output host is not approved.');
    const response = await this.request(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    if (
      !response.ok ||
      !response.body ||
      !/^image\/(png|jpeg|webp)(;|$)/.test(response.headers.get('content-type') ?? '')
    )
      throw new Error('Image service output is unavailable or invalid.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 15 * 1024 * 1024) throw new Error('Generated image exceeds the supported size.');
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
    }
    return Buffer.concat(chunks);
  }
}
