export const POST_IMAGE_PROVIDER = Symbol('POST_IMAGE_PROVIDER');
export interface PostImageSettings {
  model: string;
  resolution: '1k';
  aspect_ratio: '1:1';
  quality: 'low';
  enhance_prompt: false;
}
export type PostImageStatus =
  | { state: 'generating' }
  | { state: 'failed'; reason: string }
  | { state: 'complete'; imageUrl: string; actualCostUsd?: number };
/** Submit is deliberately separate from polling. Never retry submit after an ambiguous error. */
export interface PostImageProvider {
  readonly id: 'higgsfield' | 'fake' | 'higgsfield_mcp';
  readonly settings: PostImageSettings;
  readonly testOnly?: boolean;
  submit(prompt: string, dispatchId: string): Promise<{ requestId: string }>;
  status(requestId: string): Promise<PostImageStatus>;
  download(imageUrl: string): Promise<Buffer>;
}
