import {
  FakeCreativeProvider,
  type PostImageProvider,
  type PostImageStatus,
} from '@parisian-shopper/application';
export class FakePostImageProvider implements PostImageProvider {
  readonly id = 'fake' as const;
  readonly settings = {
    model: 'fake-background-v1',
    resolution: '1k' as const,
    aspect_ratio: '1:1' as const,
    quality: 'low' as const,
    enhance_prompt: false as const,
  };
  submit(_prompt: string, dispatchId: string): Promise<{ requestId: string }> {
    return Promise.resolve({ requestId: `fake-${dispatchId}` });
  }
  status(requestId: string): Promise<PostImageStatus> {
    return Promise.resolve({ state: 'complete', imageUrl: requestId, actualCostUsd: 0 });
  }
  async download(_imageUrl: string): Promise<Buffer> {
    const result = await new FakeCreativeProvider().generateBackground({
      creativeJobId: 'post-fake',
      contentVersionId: 'post-fake',
      briefText: 'Mock neutral studio background',
      stylePrompt: 'neutral studio',
      targetWidth: 1080,
      targetHeight: 1080,
      aspectRatio: '1:1',
      creativeProfile: 'LUXURY',
    });
    return result.imageBuffer;
  }
}
