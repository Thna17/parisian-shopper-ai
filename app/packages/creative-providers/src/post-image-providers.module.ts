import { DatabaseModule, PrismaService } from '@parisian-shopper/database';
import { HiggsfieldMcpService, HF_MCP_FETCH } from './mcp/higgsfield-mcp.service.js';
import { HiggsfieldMcpImageProvider } from './mcp/higgsfield-mcp-image-provider.js';
import { Global, Module } from '@nestjs/common';
import { POST_IMAGE_PROVIDER, type PostImageProvider } from '@parisian-shopper/application';
import { AppConfigService } from '@parisian-shopper/config';
import { HiggsfieldImageProvider } from './higgsfield-image-provider.js';
import { FakePostImageProvider } from './fake-post-image-provider.js';
@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: HF_MCP_FETCH, useValue: fetch },
    HiggsfieldMcpService,
    {
      provide: POST_IMAGE_PROVIDER,
      inject: [AppConfigService, HiggsfieldMcpService, PrismaService],
      useFactory: (
        config: AppConfigService,
        mcp: HiggsfieldMcpService,
        prisma: PrismaService,
      ): PostImageProvider | null => {
        const settings = config.postImages;
        if (settings.provider === 'disabled') return null;
        if (settings.provider === 'higgsfield_mcp')
          return new HiggsfieldMcpImageProvider(mcp, prisma, settings.assetHosts);
        if (settings.provider === 'fake') return new FakePostImageProvider();
        return new HiggsfieldImageProvider(settings.apiKey ?? '', settings.assetHosts);
      },
    },
  ],
  exports: [POST_IMAGE_PROVIDER, HiggsfieldMcpService],
})
export class PostImageProvidersModule {}
