import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api/api-client.js';
interface Status {
  status: string;
  configured: boolean;
  epoch: number;
  dispatchEnabled: boolean;
  sharedUseConfirmed: boolean;
  billing: string;
  message: string;
}
const base = '/v1/integrations/higgsfield-mcp';
export function HiggsfieldConnectionPage(): React.JSX.Element {
  const cache = useQueryClient(),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const status = useQuery({
    queryKey: ['higgsfield-connection'],
    queryFn: () => apiClient.get<Status>(base),
    retry: false,
  });
  const [workspaceId, setWorkspaceId] = useState('');
  const workspaces = useQuery({
    queryKey: ['higgsfield-workspaces'],
    queryFn: () =>
      apiClient.get<{
        workspaces: { id: string; name: string; type: string; plan: string; selected: boolean }[];
      }>(base + '/workspaces'),
    enabled: status.data?.status === 'CONNECTED',
    retry: false,
  });
  const choose = useMutation({
    mutationFn: () => apiClient.post<Status>(base + '/workspace', { workspaceId }),
    onSuccess: () => {
      check.reset();
      void cache.invalidateQueries({ queryKey: ['higgsfield-workspaces'] });
      void cache.invalidateQueries({ queryKey: ['higgsfield-connection'] });
    },
  });
  const connect = useMutation({
    mutationFn: () => apiClient.post<{ authorizationUrl: string }>(base + '/connect', {}),
    onSuccess: (data) => {
      const url = new URL(data.authorizationUrl);
      if (url.origin !== 'https://clerk.higgsfield.ai')
        throw new Error('The authorization destination could not be verified.');
      window.location.assign(url.toString());
    },
  });
  const check = useMutation({
    mutationFn: () =>
      apiClient.post<{
        workspaceId: string;
        workspaceName: string;
        balance: number;
        captionSource: string;
      }>(base + '/check', {}),
    onSettled: () => {
      void cache.invalidateQueries({ queryKey: ['higgsfield-connection'] });
    },
  });
  const disconnect = useMutation({
    mutationFn: () => apiClient.post(base + '/disconnect', {}),
    onSuccess: () => {
      check.reset();
      void cache.invalidateQueries({ queryKey: ['higgsfield-connection'] });
    },
  });
  const pending = connect.isPending || check.isPending || disconnect.isPending || choose.isPending;
  return (
    <section className="mx-auto max-w-3xl space-y-5 p-4">
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold">
        Connect Higgsfield
      </h1>
      <p>
        Administrator setup for the business connection. Staff create posts using their own staff
        accounts. This connection does not depend on Codex being open.
      </p>
      {status.isLoading && <p role="status">Checking the saved connection…</p>}
      {status.isError && (
        <div role="alert">
          Could not load the connection.{' '}
          <button className="underline" onClick={() => void status.refetch()}>
            Try again
          </button>
        </div>
      )}
      {status.data && (
        <div className="space-y-3 rounded-xl border bg-white p-4">
          <p role="status">Connection: {status.data.status.replaceAll('_', ' ').toLowerCase()}</p>
          <p>{status.data.message}</p>
          <p>{status.data.billing}.</p>
          <p>
            Paid dispatch:{' '}
            {status.data.dispatchEnabled && status.data.sharedUseConfirmed
              ? 'enabled by server configuration; each request still needs an exact quote and confirmation'
              : 'disabled pending administrator setup and deployment verification'}
            .
          </p>
          <p>
            Poster backgrounds are generated through MCP. Captions use the separately configured
            text provider, an explicitly labeled template or staff edits. Historical posters are
            used only when actual approved references are supplied. Video creation is not connected
            here yet.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="min-h-11 rounded border px-4"
              disabled={pending || !status.data.configured}
              onClick={() => connect.mutate()}
            >
              {connect.isPending
                ? 'Opening authorization…'
                : status.data.status === 'CONNECTED'
                  ? 'Reconnect Higgsfield'
                  : 'Connect Higgsfield'}
            </button>
            <button
              className="min-h-11 rounded border px-4"
              disabled={pending || status.data.status !== 'CONNECTED'}
              onClick={() => check.mutate()}
            >
              Check connection and credit balance
            </button>
            <button
              className="min-h-11 rounded border px-4"
              disabled={pending || status.data.status === 'DISCONNECTED'}
              onClick={() => disconnect.mutate()}
            >
              Disconnect Higgsfield
            </button>
          </div>
        </div>
      )}
      {status.data?.status === 'CONNECTED' && (
        <section
          aria-label="Higgsfield workspace"
          className="space-y-3 rounded-xl border bg-white p-4"
        >
          <h2 className="font-semibold">Choose the account workspace for this app</h2>
          <p className="text-sm">
            Choose explicitly before checking a quote. Changing workspace invalidates earlier
            quotes. Choosing one does not generate media or spend credits.
          </p>
          {workspaces.isLoading && <p role="status">Loading accessible workspaces…</p>}
          {workspaces.isError && (
            <p role="alert">
              Workspace list could not be loaded.{' '}
              <button className="underline" onClick={() => void workspaces.refetch()}>
                Try again
              </button>
            </p>
          )}
          {workspaces.data && (
            <>
              <label className="block text-sm" htmlFor="higgsfield-workspace">
                Workspace
              </label>
              <select
                id="higgsfield-workspace"
                className="w-full rounded border p-2"
                value={workspaceId}
                disabled={pending}
                onChange={(event) => setWorkspaceId(event.target.value)}
              >
                <option value="">Choose a workspace</option>
                {workspaces.data.workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} · {workspace.type} · {workspace.plan}
                    {workspace.selected ? ' · selected' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="min-h-11 rounded border px-4"
                disabled={!workspaceId || pending}
                onClick={() => choose.mutate()}
              >
                Use this workspace
              </button>
            </>
          )}
          {choose.isSuccess && (
            <p role="status">Workspace saved. Check the connection and credit balance next.</p>
          )}
          {choose.error && <p role="alert">{choose.error.message}</p>}
        </section>
      )}
      {check.data && (
        <div role="status" className="rounded border p-4">
          Verified workspace: {check.data.workspaceName} ({check.data.workspaceId}). Current
          balance: {check.data.balance} credits. No generation was submitted.
        </div>
      )}
      {disconnect.isSuccess && (
        <p role="status">
          Server access removed. Reconnecting requires new authorization. Remote revocation is
          attempted; if the provider was unavailable, revoke the old authorization in Higgsfield
          too.
        </p>
      )}
      {(connect.error || check.error || disconnect.error) && (
        <p role="alert">{(connect.error || check.error || disconnect.error)?.message}</p>
      )}
      <details>
        <summary className="min-h-11 cursor-pointer">Server setup instructions</summary>
        <p>
          Configure HF_MCP_ENCRYPTION_KEY (a separately generated 32-byte hex key),
          HF_MCP_REDIRECT_URI and an approved HTTPS output-host allowlist on the server. The
          callback must be /v1/integrations/higgsfield-mcp/callback on this staff site's reverse
          proxy. A registered client ID may be supplied when automatic registration is unavailable.
          Enable POST_IMAGE_PROVIDER=higgsfield_mcp only after no-cost verification. Keep dispatch
          disabled until the intended shared use and unattended OAuth renewal have been verified.
        </p>
        <p>
          No verified monthly hard spending limit is enforced. The API dollar balance and MCP credit
          balance are separate.
        </p>
      </details>
    </section>
  );
}
