import type { PostImageProvider, PostImageStatus } from '@parisian-shopper/application';
import { PrismaService } from '@parisian-shopper/database';
import {
  HiggsfieldMcpService,
  McpBeforeSubmitError,
  type McpQuote,
} from './higgsfield-mcp.service.js';
export class HiggsfieldMcpImageProvider implements PostImageProvider {
  readonly id = 'higgsfield_mcp' as const;
  readonly settings = {
    model: 'gpt_image_2_6',
    resolution: '1k' as const,
    aspect_ratio: '1:1' as const,
    quality: 'low' as const,
    enhance_prompt: false as const,
  };
  constructor(
    private readonly mcp: HiggsfieldMcpService,
    private readonly prisma: PrismaService,
    private readonly assetHosts: readonly string[],
  ) {}
  async submit(prompt: string, id: string): Promise<{ requestId: string }> {
    if (!this.assetHosts.length)
      throw new McpBeforeSubmitError(
        'Configure verified Higgsfield output hosts before spending credits.',
      );
    const row = await this.prisma.postGeneration.findUniqueOrThrow({ where: { id } });
    const authorization = row.authorization as { fingerprint?: string; expiresAt?: string } | null;
    const quote = row.creditQuote as unknown as McpQuote | null;
    if (
      row.provider !== this.id ||
      row.status !== 'SUBMITTING' ||
      row.prompt !== prompt ||
      !quote ||
      authorization?.fingerprint !== quote.fingerprint ||
      !authorization.expiresAt ||
      Date.parse(authorization.expiresAt) < Date.now()
    )
      throw new McpBeforeSubmitError(
        'This exact MCP request needs a current quote and spending confirmation.',
      );
    return this.mcp.submit(prompt, quote);
  }
  async status(requestId: string): Promise<PostImageStatus> {
    const saved = await this.prisma.postGeneration.findFirst({
      where: { requestId, provider: this.id },
    });
    if (!saved?.creditQuote) throw new Error('The saved MCP request provenance is unavailable.');
    const record = await this.mcp.poll(requestId, saved.creditQuote as unknown as McpQuote);
    if (['failed', 'canceled', 'nsfw', 'ip_detected'].includes(String(record.status)))
      return {
        state: 'failed',
        reason:
          'Higgsfield could not complete this image. Check the existing request before trying a new draft.',
      };
    if (record.status === 'completed' && typeof record.result_url === 'string')
      return { state: 'complete', imageUrl: record.result_url };
    if (record.status === 'lookup_failed')
      throw new Error('The existing image outcome could not be reconciled.');
    return { state: 'generating' };
  }
  download(url: string): Promise<Buffer> {
    // Same bounded, allowlisted download policy as the separate REST adapter. No API request is made.
    return this.mcp.download(url, this.assetHosts);
  }
}
