import { z } from 'zod';

export const CREATIVE_VIDEO_PROVIDER = Symbol('CREATIVE_VIDEO_PROVIDER');

export const videoResolutionSchema = z.enum(['480p', '720p', '1080p']);
export const videoAspectRatioSchema = z.enum(['16:9', '4:3', '1:1', '3:4', '9:16', '21:9']);
export const videoOutputFormatSchema = z.enum(['mp4', 'mov']);

export const videoCreativeBriefSchema = z
  .object({
    prompt: z.string().trim().min(1).max(4_000),
    durationSeconds: z.number().int().min(4).max(30),
    resolution: videoResolutionSchema,
    aspectRatio: videoAspectRatioSchema,
    outputFormat: videoOutputFormatSchema,
    generateAudio: z.boolean().optional(),
  })
  .strict();

export type VideoResolution = z.infer<typeof videoResolutionSchema>;
export type VideoAspectRatio = z.infer<typeof videoAspectRatioSchema>;
export type VideoOutputFormat = z.infer<typeof videoOutputFormatSchema>;
export type VideoCreativeBrief = z.infer<typeof videoCreativeBriefSchema>;

export interface CreativeVideoOptions {
  readonly timeoutMs?: number;
}

export interface GeneratedVideoAsset {
  readonly providerId: string;
  readonly model: string;
  readonly providerRequestId?: string;
  readonly videoUrl: string;
  readonly durationSeconds: number;
  readonly resolution: VideoResolution;
  readonly aspectRatio: VideoAspectRatio;
  readonly mimeType: 'video/mp4' | 'video/quicktime';
  readonly metadata: Readonly<{
    outputFormat: VideoOutputFormat;
    generateAudio: boolean;
    providerStatus: 'completed';
  }>;
}

/**
 * Provider-neutral text-to-video port. It intentionally remains separate from
 * CreativeProvider (background images) and HeroCompositor (deterministic imagery).
 */
export interface CreativeVideoProvider {
  readonly providerId: string;
  generateVideo(
    brief: VideoCreativeBrief,
    options?: CreativeVideoOptions,
  ): Promise<GeneratedVideoAsset>;
}
