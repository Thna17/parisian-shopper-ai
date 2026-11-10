// TEST ONLY. Loopback fixture; never exported by the production package barrel.
import { createServer, type Server } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { FakeCreativeProvider } from '@parisian-shopper/application';
interface FakeMcpState {
  contract: 'legacy' | 'inline' | 'unsafe-inline';
  preflights: number;
  selected: boolean;
  balance: number;
  cost: number;
  mode: string;
  expiresIn: number;
  refreshFails: boolean;
  revokeFails: boolean;
  refreshes: number;
  registrations: number;
  revocations: number;
  submissions: string[];
  workspace: string;
  lastChallenge: string;
  tokensIssued: number;
  requests: string[];
}
export async function fakeHiggsfieldMcpServer(): Promise<{
  fixture: FakeMcpState;
  request: typeof fetch;
  close: () => Promise<void>;
}> {
  const background = await new FakeCreativeProvider().generateBackground({
    creativeJobId: 'mcp-fixture',
    contentVersionId: 'mcp-fixture',
    briefText: 'Mock background',
    stylePrompt: 'Mock',
    targetWidth: 1080,
    targetHeight: 1080,
    aspectRatio: '1:1',
    creativeProfile: 'LUXURY',
  });
  const fixture: FakeMcpState = {
    contract: 'legacy',
    preflights: 0,
    selected: true,
    balance: 100,
    cost: 0.25,
    mode: 'complete',
    expiresIn: 3600,
    refreshFails: false,
    revokeFails: false,
    refreshes: 0,
    registrations: 0,
    revocations: 0,
    submissions: [] as string[],
    workspace: 'fixture-business-workspace',
    lastChallenge: '',
    tokensIssued: 0,
    requests: [] as string[],
  };
  const jobs = new Map<string, string>();
  const send = (res: import('node:http').ServerResponse, value: unknown, status = 200): void => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  const server: Server = createServer((req, res) => {
    void (async (): Promise<void> => {
      const url = new URL(req.url ?? '/', 'http://fixture.local'),
        path = url.pathname;
      fixture.requests.push(`${req.method} ${path}`);
      if (path === '/asset.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(background.imageBuffer);
        return;
      }
      if (path === '/.well-known/oauth-protected-resource/mcp') {
        send(res, {
          resource: 'https://mcp.higgsfield.ai/mcp',
          authorization_servers: ['https://clerk.higgsfield.ai'],
          scopes_supported: ['openid', 'email', 'offline_access'],
        });
        return;
      }
      if (path === '/.well-known/oauth-authorization-server') {
        send(res, {
          issuer: 'https://clerk.higgsfield.ai',
          authorization_endpoint: 'https://clerk.higgsfield.ai/oauth/authorize',
          token_endpoint: 'https://clerk.higgsfield.ai/oauth/token',
          registration_endpoint: 'https://clerk.higgsfield.ai/oauth/register',
          revocation_endpoint: 'https://clerk.higgsfield.ai/oauth/token/revoke',
          code_challenge_methods_supported: ['S256'],
        });
        return;
      }
      let text = '';
      for await (const chunk of req) text += String(chunk);
      if (path === '/oauth/register') {
        fixture.registrations++;
        send(res, { client_id: 'fixture-client', token_endpoint_auth_method: 'none' });
        return;
      }
      if (path === '/oauth/authorize') {
        fixture.lastChallenge = url.searchParams.get('code_challenge') ?? '';
        const redirect = new URL(url.searchParams.get('redirect_uri')!);
        redirect.searchParams.set('code', 'fixture-code');
        redirect.searchParams.set('state', url.searchParams.get('state')!);
        res.writeHead(302, { Location: redirect.toString() });
        res.end();
        return;
      }
      if (path === '/oauth/token') {
        const fields = new URLSearchParams(text);
        if (fields.get('grant_type') === 'refresh_token') {
          fixture.refreshes++;
          if (fixture.refreshFails) {
            send(res, { error: 'invalid_grant' }, 400);
            return;
          }
        } else if (
          fields.get('code') !== 'fixture-code' ||
          !fields.get('code_verifier') ||
          (fixture.lastChallenge &&
            createHash('sha256').update(fields.get('code_verifier')!).digest('base64url') !==
              fixture.lastChallenge)
        ) {
          send(res, { error: 'invalid_grant' }, 400);
          return;
        }
        fixture.tokensIssued++;
        send(res, {
          access_token: 'fixture-access-' + fixture.tokensIssued,
          refresh_token: 'fixture-refresh-' + fixture.tokensIssued,
          token_type: 'Bearer',
          expires_in: fields.get('grant_type') === 'refresh_token' ? 3600 : fixture.expiresIn,
        });
        return;
      }
      if (path === '/oauth/token/revoke') {
        fixture.revocations++;
        send(res, {}, fixture.revokeFails ? 503 : 200);
        return;
      }
      if (path !== '/mcp') {
        send(res, { error: 'not-found' }, 404);
        return;
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' });
        res.end();
        return;
      }
      if (!req.headers.authorization?.startsWith('Bearer fixture-access-')) {
        send(res, { error: 'unauthorized' }, 401);
        return;
      }
      const message = JSON.parse(text) as {
        id?: string | number;
        method: string;
        params?: { name?: string; arguments?: Record<string, unknown>; protocolVersion?: string };
      };
      if (message.id === undefined) {
        res.writeHead(202);
        res.end();
        return;
      }
      const result = (value: unknown): void =>
        send(res, { jsonrpc: '2.0', id: message.id, result: value });
      if (message.method === 'initialize') {
        result({
          protocolVersion: message.params?.protocolVersion ?? '2025-11-25',
          capabilities: { tools: {} },
          serverInfo: { name: 'isolated-fake-higgsfield', version: '1.0.0' },
        });
        return;
      }
      const names = [
        'balance',
        'list_workspaces',
        'select_workspace',
        'get_preferences',
        ...(fixture.contract === 'legacy'
          ? ['models_get', 'estimate_image_cost']
          : ['models_explore']),
        'generate_image',
        'jobs_wait',
      ];
      if (message.method === 'tools/list') {
        result({
          tools: names.map((name) => ({
            name,
            description: 'Isolated fake ' + name,
            inputSchema:
              name === 'generate_image' && fixture.contract === 'inline'
                ? {
                    type: 'object',
                    properties: {
                      params: {
                        anyOf: [
                          {
                            type: 'object',
                            properties: { get_cost: { type: 'boolean' } },
                            additionalProperties: true,
                          },
                          { type: 'string' },
                        ],
                      },
                    },
                  }
                : { type: 'object', properties: {}, additionalProperties: true },
          })),
        });
        return;
      }
      if (message.method !== 'tools/call') {
        send(res, {
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32601, message: 'Unsupported fixture operation' },
        });
        return;
      }
      const name = message.params?.name,
        args = message.params?.arguments ?? {};
      let value: unknown;
      if (name === 'get_preferences') value = { auto_create_project: false };
      else if (name === 'balance')
        value = { credits: fixture.balance, subscription_plan_type: 'fixture-pro' };
      else if (name === 'list_workspaces')
        value = {
          workspaces: [
            {
              id: fixture.workspace,
              name: 'Isolated business',
              is_selected: fixture.selected,
              type: 'shared',
              user_role: 'owner',
            },
          ],
        };
      else if (name === 'select_workspace') {
        if (args.workspace_id !== fixture.workspace) throw new Error('Unknown fixture workspace');
        fixture.selected = true;
        value = { selected: true };
      } else if (name === 'models_get' || name === 'models_explore')
        value = { id: 'gpt_image_2_6', parameters: [], aspect_ratios: ['1:1'], medias: [] };
      else if (name === 'estimate_image_cost')
        value = { cost: { credits: fixture.cost, credits_exact: fixture.cost } };
      else if (
        name === 'generate_image' &&
        (args.params as Record<string, unknown>)?.get_cost === true
      ) {
        fixture.preflights++;
        value = { cost: { credits: fixture.cost, credits_exact: fixture.cost } };
      } else if (name === 'generate_image') {
        const id = randomUUID();
        fixture.submissions.push(id);
        fixture.balance -= fixture.cost;
        jobs.set(id, fixture.mode);
        if (fixture.mode === 'lost-submit') {
          res.destroy();
          return;
        }
        value = {
          results: [
            { id, status: 'pending', type: 'image', model: 'gpt_image_2_6', params: args.params },
          ],
        };
      } else if (name === 'jobs_wait') {
        const input = args.jobs as Array<{ job_id: string; index: number }>,
          id = input[0]!.job_id,
          mode = jobs.get(id);
        if (fixture.mode === 'poll-timeout') {
          res.destroy();
          return;
        }
        value = {
          all_terminal: true,
          jobs: [
            {
              index: 0,
              job_id: id,
              status: mode === 'failure' ? 'failed' : mode ? 'completed' : 'lookup_failed',
              ...(mode && mode !== 'failure'
                ? { result_url: 'https://mcp-fixture.example/asset.png' }
                : {}),
            },
          ],
          summary: { active: 0, completed: 1, errors: 0, failed: 0, total: 1 },
        };
      } else {
        result({ isError: true, content: [{ type: 'text', text: 'Unsupported fixture tool' }] });
        return;
      }
      result({
        content: [{ type: 'text', text: JSON.stringify(value) }],
        structuredContent: value,
      });
    })().catch(() => send(res, { error: 'fixture-failure' }, 500));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No fixture port');
  const origin = `http://127.0.0.1:${address.port}`;
  const request: typeof fetch = async (input, init) => {
    const source = new URL(input instanceof Request ? input.url : input.toString());
    if (
      !['mcp.higgsfield.ai', 'clerk.higgsfield.ai', 'mcp-fixture.example'].includes(source.hostname)
    )
      throw new Error('Fake fixture blocked an external host');
    return fetch(origin + source.pathname + source.search, init);
  };
  return {
    fixture,
    request,
    close: (): Promise<void> =>
      new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}
