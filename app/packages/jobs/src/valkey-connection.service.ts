import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '@parisian-shopper/config';
import { GlideClient, type GlideClientConfiguration } from '@valkey/valkey-glide';

@Injectable()
export class ValkeyConnectionService implements OnModuleInit, OnModuleDestroy {
  private client: GlideClient | undefined;
  private readonly dedicatedClients: GlideClient[] = [];

  public constructor(private readonly config: AppConfigService) {}

  public async onModuleInit(): Promise<void> {
    await this.connect();
  }

  public onModuleDestroy(): void {
    for (const client of this.dedicatedClients) client.close();
    this.dedicatedClients.length = 0;
    this.client?.close();
    this.client = undefined;
  }

  public async createDedicatedClient(suffix: string): Promise<GlideClient> {
    const valkey = this.config.valkey;
    const client = await GlideClient.createClient({
      addresses: [{ host: valkey.host, port: valkey.port }],
      clientName: `${this.config.application.name}-${suffix}`,
      requestTimeout: 1_000,
      ...(valkey.password === undefined ? {} : { credentials: { password: valkey.password } }),
    });
    this.dedicatedClients.push(client);
    return client;
  }

  public async connect(): Promise<GlideClient> {
    if (this.client !== undefined) {
      return this.client;
    }

    const valkey = this.config.valkey;
    const options: GlideClientConfiguration = {
      addresses: [{ host: valkey.host, port: valkey.port }],
      clientName: `${this.config.application.name}-foundation`,
      requestTimeout: 1_000,
      ...(valkey.password === undefined ? {} : { credentials: { password: valkey.password } }),
    };

    this.client = await GlideClient.createClient(options);
    return this.client;
  }

  public getClient(): GlideClient {
    if (this.client === undefined) {
      throw new Error('Valkey connection has not been initialized');
    }
    return this.client;
  }

  public async ping(): Promise<void> {
    const response = await this.getClient().ping();
    if (response !== 'PONG') {
      throw new Error('Valkey returned an unexpected health response');
    }
  }
}
