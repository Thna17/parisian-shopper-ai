import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { AppConfigService } from '@parisian-shopper/config';
import { PrismaService } from '@parisian-shopper/database';
import { HiggsfieldImageProvider } from '../higgsfield-image-provider.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export const HF_MCP_FETCH = Symbol('HF_MCP_FETCH');
const RESOURCE = 'https://mcp.higgsfield.ai/mcp';
const ISSUER = 'https://clerk.higgsfield.ai';
const SCOPES = 'openid email offline_access';
interface Secrets {
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  clientAuthMethod?: string;
  tokens?: { access_token: string; refresh_token?: string; expiresAt: number };
  pending?: {
    stateHash: string;
    verifier: string;
    actor: string;
    expiresAt: number;
    redirectUri: string;
  };
  workspaceId?: string;
}
export interface McpQuote {
  credits: number;
  balance: number;
  workspaceId: string;
  connectionEpoch: number;
  fingerprint: string;
  expiresAt: string;
  params: Record<string, unknown>;
}
export interface McpConnectionStatus {
  status: string;
  configured: boolean;
  epoch: number;
  dispatchEnabled: boolean;
  sharedUseConfirmed: boolean;
  billing: string;
  message: string;
}
function endpoint(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Unsupported OAuth endpoint metadata.');
  return value;
}
export class McpBeforeSubmitError extends Error {}
export function mcpParams(prompt: string): Record<string, unknown> {
  return {
    model: 'gpt_image_2_6',
    prompt,
    aspect_ratio: '1:1',
    resolution: '1k',
    quality: 'low',
    output_format: 'png',
    count: 1,
    batch_size: 1,
    use_unlim: false,
  };
}
export function mcpFingerprint(
  params: Record<string, unknown>,
  epoch: number,
  workspaceId: string,
  credits: number,
  expiresAt: string,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        params: Object.fromEntries(Object.entries(params).sort(([a], [b]) => a.localeCompare(b))),
        epoch,
        workspaceId,
        credits,
        expiresAt,
      }),
    )
    .digest('hex');
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Higgsfield returned an unsupported response.');
  return value as Record<string, unknown>;
}
export function structuredMcpResult(result: unknown): Record<string, unknown> {
  const raw = object(result);
  if (raw.isError)
    throw new Error('Higgsfield refused the operation. Check the connection and request.');
  if (raw.structuredContent) return object(raw.structuredContent);
  const texts = Array.isArray(raw.content)
    ? raw.content.map(object).filter((x) => x.type === 'text' && typeof x.text === 'string')
    : [];
  for (const item of texts) {
    try {
      return object(JSON.parse(String(item.text)));
    } catch {
      /* Only structured JSON is trusted. */
    }
  }
  throw new Error('Higgsfield returned no supported structured response.');
}

type McpCall = (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
/** Inline quotes are safe only when the authenticated server explicitly advertises get_cost. */
export function supportsInlineImageQuote(schema: Record<string, unknown> | undefined): boolean {
  if (!schema) return false;
  const properties = schema.properties as Record<string, unknown> | undefined;
  const params = properties?.params as Record<string, unknown> | undefined;
  if (!params) return false;
  const variants = Array.isArray(params.anyOf) ? params.anyOf : [params];
  return variants.some((variant: unknown) => {
    if (!variant || typeof variant !== 'object') return false;
    const fields = (variant as Record<string, unknown>).properties as
      Record<string, unknown> | undefined;
    const cost = fields?.get_cost as Record<string, unknown> | undefined;
    return cost?.type === 'boolean';
  });
}

/** A business-owned OAuth client, never a Codex token reader. Network dependencies are injectable only for tests. */
@Injectable()
export class HiggsfieldMcpService {
  private readonly request: typeof fetch;
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    @Optional() @Inject(HF_MCP_FETCH) request?: typeof fetch,
  ) {
    this.request = request ?? fetch;
  }
  private key(): Buffer {
    const value = this.config.higgsfieldMcp.encryptionKey;
    if (!value || !/^[a-f0-9]{64}$/.test(value))
      throw new Error('Ask an administrator to configure the server encryption key.');
    return Buffer.from(value, 'hex');
  }
  private seal(value: Secrets): string {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from('parisian-shopper:higgsfield-mcp:business:v1'));
    const bytes = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      bytes.toString('base64url'),
    ].join('.');
  }
  private open(value: string | null): Secrets {
    if (!value) return {};
    const [version, iv, tag, data] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !data)
      throw new Error('The saved connection cannot be read. Reconnect Higgsfield.');
    const cipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64url'));
    cipher.setAAD(Buffer.from('parisian-shopper:higgsfield-mcp:business:v1'));
    cipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(
      Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString(),
    ) as Secrets;
  }
  private async locked<T>(
    work: (
      state: Secrets,
      epoch: number,
      status: string,
    ) => Promise<{ result: T; status?: string; bump?: boolean }>,
  ): Promise<T> {
    await this.prisma.higgsfieldMcpConnection.upsert({
      where: { id: 'business' },
      create: { id: 'business' },
      update: {},
    });
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM higgsfield_mcp_connections WHERE id = 'business' FOR UPDATE`;
        const row = await tx.higgsfieldMcpConnection.findUniqueOrThrow({
          where: { id: 'business' },
        });
        const state = this.open(row.encryptedState),
          outcome = await work(state, row.epoch, row.status);
        await tx.higgsfieldMcpConnection.update({
          where: { id: 'business' },
          data: {
            encryptedState: this.seal(state),
            ...(outcome.status ? { status: outcome.status } : {}),
            ...(outcome.bump ? { epoch: { increment: 1 } } : {}),
          },
        });
        return outcome.result;
      },
      { timeout: 100000, maxWait: 10000 },
    );
  }
  async status(): Promise<McpConnectionStatus> {
    const row = await this.prisma.higgsfieldMcpConnection.findUnique({ where: { id: 'business' } });
    const ready = Boolean(
      this.config.higgsfieldMcp.encryptionKey && this.config.higgsfieldMcp.redirectUri,
    );
    return {
      status: row?.status ?? 'DISCONNECTED',
      configured: ready,
      epoch: row?.epoch ?? 1,
      dispatchEnabled: this.config.higgsfieldMcp.dispatchEnabled,
      sharedUseConfirmed: this.config.higgsfieldMcp.sharedUseConfirmed,
      billing: 'Higgsfield MCP credits, separate from developer API USD',
      message: !ready
        ? 'Configure a server encryption key and OAuth callback URL before connecting.'
        : 'Connection alone does not authorize spending. Video is not connected to the staff workflow.',
    };
  }
  private async json(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    if (
      new URL(url).origin !== ISSUER &&
      url !== 'https://mcp.higgsfield.ai/.well-known/oauth-protected-resource/mcp'
    )
      throw new Error('Untrusted OAuth endpoint.');
    const response = await this.request(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        `Higgsfield authorization returned HTTP ${response.status}. Reconnect or ask an administrator.`,
      );
    const body = await response.text();
    return body ? object(JSON.parse(body)) : {};
  }
  private async metadata(): Promise<Record<string, unknown>> {
    const resource = await this.json(
      'https://mcp.higgsfield.ai/.well-known/oauth-protected-resource/mcp',
    );
    if (
      resource.resource !== RESOURCE ||
      !Array.isArray(resource.authorization_servers) ||
      !resource.authorization_servers.includes(ISSUER)
    )
      throw new Error(
        'Higgsfield OAuth discovery changed. Administrator verification is required.',
      );
    const meta = await this.json(ISSUER + '/.well-known/oauth-authorization-server');
    if (
      meta.issuer !== ISSUER ||
      !Array.isArray(meta.code_challenge_methods_supported) ||
      !meta.code_challenge_methods_supported.includes('S256')
    )
      throw new Error('Higgsfield PKCE support could not be verified.');
    for (const field of [
      'authorization_endpoint',
      'token_endpoint',
      'registration_endpoint',
      'revocation_endpoint',
    ]) {
      if (meta[field] && new URL(endpoint(meta[field])).origin !== ISSUER)
        throw new Error('Untrusted OAuth discovery response.');
    }
    return meta;
  }
  async connect(actor: string): Promise<{ authorizationUrl: string }> {
    const redirectUri = this.config.higgsfieldMcp.redirectUri;
    if (!redirectUri) throw new Error('Configure the application OAuth callback URL first.');
    const target = new URL(redirectUri);
    if (
      target.username ||
      target.password ||
      target.search ||
      target.hash ||
      (target.protocol !== 'https:' &&
        !(
          this.config.nodeEnvironment !== 'production' &&
          ['localhost', '127.0.0.1'].includes(target.hostname) &&
          target.protocol === 'http:'
        ))
    )
      throw new Error(
        'OAuth callback must use HTTPS (loopback HTTP is allowed only in development).',
      );
    this.key();
    const meta = await this.metadata();
    const stateToken = randomBytes(32).toString('base64url');
    const result = await this.locked(async (state) => {
      if (
        this.config.higgsfieldMcp.clientId &&
        this.config.higgsfieldMcp.clientId !== state.clientId
      ) {
        state.clientId = this.config.higgsfieldMcp.clientId;
        delete state.clientSecret;
      }
      if (this.config.higgsfieldMcp.clientId)
        state.clientAuthMethod = this.config.higgsfieldMcp.clientAuthMethod ?? 'client_secret_post';
      state.clientSecret = this.config.higgsfieldMcp.clientSecret ?? state.clientSecret;
      if (!state.clientId) {
        if (!meta.registration_endpoint)
          throw new Error('Higgsfield requires a registered application client ID.');
        const client = await this.json(endpoint(meta.registration_endpoint), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: 'Parisian Shopper AI',
            redirect_uris: [redirectUri],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
          }),
        });
        if (typeof client.client_id !== 'string')
          throw new Error('Higgsfield did not register an application client.');
        state.clientId = client.client_id;
        state.clientAuthMethod =
          typeof client.token_endpoint_auth_method === 'string'
            ? client.token_endpoint_auth_method
            : 'none';
        if (!['none', 'client_secret_post', 'client_secret_basic'].includes(state.clientAuthMethod))
          throw new Error('The registered OAuth client authentication method is unsupported.');
        if (state.clientAuthMethod !== 'none' && typeof client.client_secret === 'string')
          state.clientSecret = client.client_secret;
      }
      const verifier = randomBytes(48).toString('base64url');
      state.pending = {
        stateHash: createHash('sha256').update(stateToken).digest('hex'),
        verifier,
        actor,
        expiresAt: Date.now() + 600000,
        redirectUri,
      };
      const url = new URL(endpoint(meta.authorization_endpoint));
      url.search = new URLSearchParams({
        client_id: state.clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: SCOPES,
        state: stateToken,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
        resource: RESOURCE,
      }).toString();
      return { result: { authorizationUrl: url.toString() }, status: 'CONNECTING', bump: true };
    });
    await this.prisma.higgsfieldMcpAudit.create({
      data: { actorUserId: actor, action: 'OAUTH_STARTED' },
    });
    return result;
  }
  private grant(
    state: Secrets,
    fields: Record<string, string>,
  ): { headers: Record<string, string>; body: URLSearchParams } {
    if (!state.clientId) throw new Error('Reconnect Higgsfield.');
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const body = new URLSearchParams({ ...fields, client_id: state.clientId, resource: RESOURCE });
    if (state.clientSecret && state.clientAuthMethod !== 'none') {
      if (state.clientAuthMethod === 'client_secret_basic')
        headers.Authorization =
          'Basic ' +
          Buffer.from(
            encodeURIComponent(state.clientId) + ':' + encodeURIComponent(state.clientSecret),
          ).toString('base64');
      else body.set('client_secret', state.clientSecret);
    }
    return { headers, body };
  }
  private async token(
    meta: Record<string, unknown>,
    state: Secrets,
    fields: Record<string, string>,
  ): Promise<void> {
    if (!state.clientId) throw new Error('Reconnect Higgsfield.');
    const result = await this.json(endpoint(meta.token_endpoint), {
      method: 'POST',
      ...this.grant(state, fields),
    });
    if (
      typeof result.access_token !== 'string' ||
      typeof result.expires_in !== 'number' ||
      result.expires_in <= 0 ||
      (result.token_type !== undefined &&
        (typeof result.token_type !== 'string' || result.token_type.toLowerCase() !== 'bearer'))
    )
      throw new Error('Unsupported OAuth token response.');
    state.tokens = {
      access_token: result.access_token,
      expiresAt: Date.now() + result.expires_in * 1000,
      ...(typeof result.refresh_token === 'string'
        ? { refresh_token: result.refresh_token }
        : state.tokens?.refresh_token
          ? { refresh_token: state.tokens.refresh_token }
          : {}),
    };
  }
  async callbackActor(stateToken: string): Promise<string> {
    const row = await this.prisma.higgsfieldMcpConnection.findUnique({ where: { id: 'business' } });
    const pending = this.open(row?.encryptedState ?? null).pending;
    if (
      !pending ||
      pending.expiresAt < Date.now() ||
      pending.stateHash !== createHash('sha256').update(stateToken).digest('hex')
    )
      throw new Error('Authorization expired or could not be verified.');
    return pending.actor;
  }
  async callback(actor: string, stateToken: string, code: string, issuer?: string): Promise<void> {
    const meta = await this.metadata();
    await this.locked(async (state) => {
      const pending = state.pending;
      if (
        !pending ||
        pending.actor !== actor ||
        pending.expiresAt < Date.now() ||
        pending.stateHash !== createHash('sha256').update(stateToken).digest('hex') ||
        (issuer && issuer !== ISSUER)
      )
        throw new Error(
          'Authorization expired or belongs to another session. Start Connect Higgsfield again.',
        );
      await this.token(meta, state, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: pending.redirectUri,
        code_verifier: pending.verifier,
      });
      delete state.pending;
      delete state.workspaceId;
      return { result: undefined, status: 'CONNECTED', bump: true };
    });
    await this.prisma.higgsfieldMcpAudit.create({
      data: { actorUserId: actor, action: 'CONNECTED' },
    });
  }
  async disconnect(actor: string): Promise<void> {
    // Erase locally under the same lock as dispatch/refresh, before any network operation.
    const encrypted = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM higgsfield_mcp_connections WHERE id = 'business' FOR UPDATE`;
      const current = await tx.higgsfieldMcpConnection.findUnique({ where: { id: 'business' } });
      await tx.higgsfieldMcpConnection.upsert({
        where: { id: 'business' },
        create: { id: 'business' },
        update: { encryptedState: null, status: 'DISCONNECTED', epoch: { increment: 1 } },
      });
      await tx.higgsfieldMcpAudit.create({
        data: { actorUserId: actor, action: 'DISCONNECTED_LOCALLY' },
      });
      return current?.encryptedState;
    });
    if (!encrypted) return;
    try {
      const state = this.open(encrypted),
        meta = await this.metadata();
      const token = state.tokens?.refresh_token ?? state.tokens?.access_token;
      if (token && meta.revocation_endpoint)
        await this.json(endpoint(meta.revocation_endpoint), {
          method: 'POST',
          ...this.grant(state, { token }),
        });
    } catch {
      // Remote revocation is best effort; failure cannot restore local credentials.
    }
  }
  private async credentials(): Promise<{
    accessToken: string;
    epoch: number;
    workspaceId?: string;
  }> {
    const result = await this.locked(async (state, epoch, status) => {
      if (status !== 'CONNECTED') return { result: null, status };
      if (!state.tokens) return { result: null, status: 'RECONNECT_REQUIRED' };
      if (state.tokens.expiresAt < Date.now() + 60000) {
        if (!state.tokens.refresh_token) {
          delete state.tokens;
          return { result: null, status: 'RECONNECT_REQUIRED' };
        }
        try {
          await this.token(await this.metadata(), state, {
            grant_type: 'refresh_token',
            refresh_token: state.tokens.refresh_token,
          });
        } catch {
          delete state.tokens;
          return { result: null, status: 'RECONNECT_REQUIRED' };
        }
      }
      return {
        result: {
          accessToken: state.tokens.access_token,
          epoch,
          ...(state.workspaceId ? { workspaceId: state.workspaceId } : {}),
        },
        status: 'CONNECTED',
      };
    });
    if (!result)
      throw new Error('The Higgsfield connection expired. Ask an administrator to reconnect.');
    return result;
  }
  async session<T>(
    operation: (
      call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>,
      epoch: number,
      tools: ReadonlySet<string>,
      schemas: ReadonlyMap<string, Record<string, unknown>>,
    ) => Promise<T>,
  ): Promise<T> {
    const credential = await this.credentials();
    const transport = new StreamableHTTPClientTransport(new URL(RESOURCE), {
      requestInit: {
        headers: { Authorization: `Bearer ${credential.accessToken}` },
        redirect: 'error',
      },
      fetch: this.request,
      reconnectionOptions: {
        maxRetries: 0,
        initialReconnectionDelay: 1000,
        maxReconnectionDelay: 1000,
        reconnectionDelayGrowFactor: 1,
      },
    });
    const client = new Client(
      { name: 'parisian-shopper-ai', version: '0.1.0' },
      { capabilities: {} },
    );
    try {
      await client.connect(transport, { timeout: 15000 });
      const tools: Array<{ name: string; inputSchema?: Record<string, unknown> }> = [];
      let cursor: string | undefined;
      do {
        const page = await client.listTools(cursor ? { cursor } : {});
        tools.push(...page.tools);
        cursor = page.nextCursor;
        if (tools.length > 2000) throw new Error('Unsupported MCP catalog size.');
      } while (cursor);
      const names = new Set(tools.map((t) => t.name));
      const call: McpCall = async (name, args) => {
        if (!names.has(name))
          throw new McpBeforeSubmitError(
            `The direct MCP server does not expose required tool ${name}. Administrator contract verification is required.`,
          );
        return structuredMcpResult(
          await client.callTool({ name, arguments: args }, undefined, { timeout: 30000 }),
        );
      };
      // Bind each new MCP session to the explicitly chosen app workspace, never an inferred default.
      if (credential.workspaceId)
        await call('select_workspace', { workspace_id: credential.workspaceId });
      return await operation(
        call,
        credential.epoch,
        names,
        new Map(tools.map((tool) => [tool.name, tool.inputSchema ?? {}])),
      );
    } catch (error) {
      if (error instanceof McpBeforeSubmitError) throw error;
      if (error instanceof UnauthorizedError)
        await this.locked((state, epoch) => {
          if (epoch === credential.epoch) delete state.tokens;
          return Promise.resolve({
            result: undefined,
            ...(epoch === credential.epoch ? { status: 'RECONNECT_REQUIRED' } : {}),
          });
        });
      // eslint-disable-next-line preserve-caught-error -- Provider errors may include credentials; do not attach them to application logs.
      throw new Error(
        'Higgsfield MCP operation failed. Reconnect or verify the server tool contract. A dispatched request must not be resubmitted.',
      );
    } finally {
      await client.close().catch(() => undefined);
    }
  }
  async workspaces(): Promise<{
    workspaces: { id: string; name: string; type: string; plan: string; selected: boolean }[];
  }> {
    return this.session(async (call) => {
      const result = await call('list_workspaces', {});
      if (!Array.isArray(result.workspaces))
        throw new McpBeforeSubmitError('The workspace list is unavailable. Nothing was generated.');
      return {
        workspaces: result.workspaces
          .map(object)
          .filter((row) => typeof row.id === 'string')
          .map((row) => ({
            id: String(row.id),
            name: typeof row.name === 'string' ? row.name : 'Personal workspace',
            type: typeof row.type === 'string' ? row.type : 'unknown',
            plan: typeof row.plan_type === 'string' ? row.plan_type : 'unknown',
            selected: row.is_selected === true,
          })),
      };
    });
  }
  async selectWorkspace(actor: string, workspaceId: string): Promise<McpConnectionStatus> {
    const expectedEpoch = await this.session(async (call, epoch) => {
      const result = await call('list_workspaces', {});
      const accessible = Array.isArray(result.workspaces) ? result.workspaces.map(object) : [];
      if (!accessible.some((row) => row.id === workspaceId))
        throw new McpBeforeSubmitError(
          'Choose a workspace from your accessible Higgsfield account list.',
        );
      await call('select_workspace', { workspace_id: workspaceId });
      const checked = await call('list_workspaces', {});
      if (
        !Array.isArray(checked.workspaces) ||
        !checked.workspaces
          .map(object)
          .some((row) => row.id === workspaceId && row.is_selected === true)
      )
        throw new McpBeforeSubmitError(
          'Higgsfield did not confirm the workspace selection. Nothing was generated.',
        );
      return epoch;
    });
    await this.locked((state, epoch) => {
      if (epoch !== expectedEpoch)
        throw new McpBeforeSubmitError('The connection changed. Reload the workspace list.');
      state.workspaceId = workspaceId;
      return Promise.resolve({ result: undefined, bump: true });
    });
    await this.prisma.higgsfieldMcpAudit.create({
      data: { actorUserId: actor, action: 'WORKSPACE_SELECTED' },
    });
    return this.status();
  }
  async connectionCheck(): Promise<Record<string, unknown>> {
    return this.session(async (call, epoch, names, schemas) => {
      this.requireContract(names, schemas);
      const info = await this.inspect(call),
        model = await this.imageModel(call, names);
      return {
        ...info,
        epoch,
        model,
        captionSource:
          'Captions use the separately configured text provider, an explicitly labeled template or staff edits. MCP generates the image background.',
        historicalPostersUsed: false,
      };
    });
  }
  private async inspect(
    call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>,
  ): Promise<{ workspaceId: string; workspaceName: string; plan: unknown; balance: number }> {
    const workspaces = await call('list_workspaces', {});
    if (!Array.isArray(workspaces.workspaces))
      throw new Error('The MCP workspace identity could not be verified.');
    const selected = workspaces.workspaces.map(object).find((w) => w.is_selected === true);
    if (!selected || typeof selected.id !== 'string')
      throw new McpBeforeSubmitError(
        'Choose the intended Higgsfield workspace in connection settings, then check the balance again. No generation was submitted.',
      );
    const balance = await call('balance', {});
    if (
      typeof balance.credits !== 'number' ||
      !Number.isFinite(balance.credits) ||
      balance.credits < 0
    )
      throw new Error('The MCP credit balance could not be verified.');
    return {
      workspaceId: selected.id,
      workspaceName: typeof selected.name === 'string' ? selected.name : 'Private workspace',
      plan: balance.subscription_plan_type,
      balance: balance.credits,
    };
  }
  private requireContract(
    names: ReadonlySet<string>,
    schemas: ReadonlyMap<string, Record<string, unknown>>,
  ): void {
    if (
      ['balance', 'list_workspaces', 'get_preferences', 'generate_image', 'jobs_wait'].some(
        (name) => !names.has(name),
      ) ||
      (!names.has('models_get') && !names.has('models_explore')) ||
      (!names.has('estimate_image_cost') &&
        !supportsInlineImageQuote(schemas.get('generate_image')))
    )
      throw new McpBeforeSubmitError(
        'Required direct MCP tool schemas are unavailable. Administrator verification is required.',
      );
  }
  private imageModel(call: McpCall, names: ReadonlySet<string>): Promise<Record<string, unknown>> {
    return names.has('models_get')
      ? call('models_get', { model_id: 'gpt_image_2_6' })
      : call('models_explore', { action: 'get', model_id: 'gpt_image_2_6' });
  }
  private estimate(
    call: McpCall,
    names: ReadonlySet<string>,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // Caller has already verified the advertised get_cost contract. Never fall back to a paid call.
    return names.has('estimate_image_cost')
      ? call('estimate_image_cost', { params })
      : call('generate_image', { params: { ...params, get_cost: true } });
  }
  async quote(prompt: string): Promise<McpQuote> {
    return this.session(async (call, epoch, names, schemas) => {
      this.requireContract(names, schemas);
      const preference = await call('get_preferences', {});
      if (preference.auto_create_project !== false)
        throw new McpBeforeSubmitError(
          'Use a business MCP workspace configured without automatic project creation before preparing this request.',
        );
      const model = await this.imageModel(call, names);
      if (
        model.id !== 'gpt_image_2_6' ||
        !Array.isArray(model.aspect_ratios) ||
        !model.aspect_ratios.includes('1:1')
      )
        throw new McpBeforeSubmitError('The requested square image model could not be verified.');
      const info = await this.inspect(call),
        params = mcpParams(prompt);
      const result = await this.estimate(call, names, params);
      const cost = object(result.cost);
      if (
        typeof cost.credits_exact !== 'number' ||
        !Number.isFinite(cost.credits_exact) ||
        cost.credits_exact <= 0
      )
        throw new Error('No exact MCP credit quote was returned.');
      if (result.adjustments && Object.keys(object(result.adjustments)).length)
        throw new Error(
          'Provider settings changed. Administrator verification is required before quoting.',
        );
      const expiresAt = new Date(Date.now() + 300000).toISOString();
      return {
        credits: cost.credits_exact,
        balance: info.balance,
        workspaceId: info.workspaceId,
        connectionEpoch: epoch,
        fingerprint: mcpFingerprint(params, epoch, info.workspaceId, cost.credits_exact, expiresAt),
        expiresAt,
        params,
      };
    });
  }
  async submit(prompt: string, quote: McpQuote): Promise<{ requestId: string }> {
    const cfg = this.config.higgsfieldMcp;
    if (
      !cfg.dispatchEnabled ||
      !cfg.sharedUseConfirmed ||
      !this.config.featureFlags.AI_IMAGE_GENERATION ||
      !this.config.featureFlags.CREATIVE_GENERATION
    )
      throw new McpBeforeSubmitError(
        'MCP dispatch is disabled pending administrator setup and deployment verification.',
      );
    if (
      !Number.isFinite(Date.parse(quote.expiresAt)) ||
      Date.parse(quote.expiresAt) < Date.now() ||
      quote.fingerprint !==
        mcpFingerprint(
          mcpParams(prompt),
          quote.connectionEpoch,
          quote.workspaceId,
          quote.credits,
          quote.expiresAt,
        )
    )
      throw new McpBeforeSubmitError('The quote expired or changed. Prepare a new quote.');
    return this.session(async (call, epoch, names, schemas) => {
      this.requireContract(names, schemas);
      if ((await call('get_preferences', {})).auto_create_project !== false)
        throw new McpBeforeSubmitError('The workspace preferences changed. Nothing was submitted.');
      const info = await this.inspect(call);
      if (epoch !== quote.connectionEpoch || info.workspaceId !== quote.workspaceId)
        throw new McpBeforeSubmitError(
          'The connected account or workspace changed. A new quote and confirmation are required.',
        );
      const estimate = await this.estimate(call, names, quote.params);
      const cost = object(estimate.cost).credits_exact;
      if (
        cost !== quote.credits ||
        info.balance < quote.credits ||
        (estimate.adjustments && Object.keys(object(estimate.adjustments)).length)
      )
        throw new McpBeforeSubmitError(
          'The price, settings or available balance changed. Nothing was submitted.',
        );
      // Exactly one paid tool call. Never configure SDK automatic auth or retry for this operation.
      const result = await this.locked(async (state, currentEpoch) => {
        if (currentEpoch !== epoch || !state.tokens)
          throw new McpBeforeSubmitError(
            'The connection changed before submission. Prepare a new quote.',
          );
        return { result: await call('generate_image', { params: quote.params }) };
      });
      const images = Array.isArray(result.results) ? result.results.map(object) : [];
      if (images.length !== 1 || typeof images[0]?.id !== 'string')
        throw new Error('No single verifiable generation ID returned; outcome uncertain.');
      return { requestId: images[0].id };
    });
  }
  download(url: string, hosts: readonly string[]): Promise<Buffer> {
    return new HiggsfieldImageProvider('download-only-never-used', hosts, this.request).download(
      url,
    );
  }
  async poll(requestId: string, quote?: McpQuote): Promise<Record<string, unknown>> {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(requestId)) throw new Error('Invalid MCP request ID.');
    return this.session(async (call) => {
      if (quote) {
        const info = await this.inspect(call);
        if (info.workspaceId !== quote.workspaceId)
          throw new Error('Reconnect the original generation workspace to check this request.');
      }
      const result = await call('jobs_wait', {
        jobs: [{ index: 0, job_id: requestId }],
        timeout_seconds: 0,
      });
      const row = Array.isArray(result.jobs)
        ? result.jobs.map(object).find((j) => j.job_id === requestId)
        : undefined;
      if (!row) throw new Error('The existing request could not be located.');
      return row;
    });
  }
}
