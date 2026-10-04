import { type GlideClient } from '@valkey/valkey-glide';
import { createValkeyGlideClient, type IRedisClient } from 'bullmq';

export function createBullMqConnection(client: GlideClient): IRedisClient {
  return createValkeyGlideClient(client);
}
