import { Link } from 'react-router-dom';
import { usePermissions } from '../../auth/hooks/use-permissions.js';
import { Permission } from '../../../types/auth.types.js';
import { McpCreditQuotePanel } from './McpCreditQuotePanel.js';
import React, { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { postsApi } from '../api/posts-api.js';
const labels: Record<string, string> = {
  AWAITING_CONFIRMATION: 'Waiting for spending confirmation',
  QUEUED: 'Waiting to start',
  PREPARING: 'Preparing your draft',
  SUBMITTING: 'Creating the poster background',
  GENERATING: 'Creating the poster background',
  COMPOSITING: 'Adding your actual product and text',
  COMPLETE: 'Poster saved with its caption',
  FAILED: 'Draft creation failed',
  UNCERTAIN: 'Checking the image request — do not submit again',
};
export function PostGenerationPanel({
  id,
  revision,
  disabled,
  canPrepare = true,
  hasSavedPoster = false,
  hasSavedCaption = true,
}: {
  id: string;
  revision: number;
  disabled: boolean;
  canPrepare?: boolean;
  hasSavedPoster?: boolean;
  hasSavedCaption?: boolean;
}): React.JSX.Element {
  const cache = useQueryClient();
  const admin = usePermissions().hasPermission(Permission.ADMIN);
  const info = useQuery({
    queryKey: ['post-generation', id],
    queryFn: () => postsApi.generation(id),
    refetchInterval: (query) => {
      const row = query.state.data?.generation;
      return row &&
        (['QUEUED', 'PREPARING', 'SUBMITTING', 'GENERATING', 'COMPOSITING'].includes(row.status) ||
          (row.status === 'AWAITING_CONFIRMATION' &&
            Boolean(row.spendingConfirmed || row.authorization)))
        ? 5000
        : false;
    },
    retry: false,
  });
  const start = useMutation({
    mutationFn: async () => {
      const prepared = await postsApi.generate(id, revision);
      cache.setQueryData(['post-generation', id], prepared);
      return prepared.provider === 'higgsfield_mcp' &&
        prepared.generation?.status === 'AWAITING_CONFIRMATION'
        ? postsApi.quoteCredits(id)
        : prepared;
    },
    onSuccess: (data) => cache.setQueryData(['post-generation', id], data),
  });
  const cancel = useMutation({
    mutationFn: () => postsApi.cancelGeneration(id),
    onSuccess: (data) => cache.setQueryData(['post-generation', id], data),
  });
  const check = useMutation({
    mutationFn: () => postsApi.reconcile(id),
    onSuccess: (data) => cache.setQueryData(['post-generation', id], data),
  });
  const row = info.data?.generation;
  useEffect(() => {
    if (row?.status === 'COMPLETE') void cache.invalidateQueries({ queryKey: ['staff-post', id] });
  }, [row?.status, id, cache]);
  const needsConnection =
    info.data?.provider === 'higgsfield_mcp' && info.data.mcpConnection?.status !== 'CONNECTED';
  const active = row && !['COMPLETE', 'FAILED'].includes(row.status);
  return (
    <section
      aria-label="Create poster and caption"
      className="space-y-3 rounded-xl border bg-white p-4"
    >
      <h2 className="text-lg font-semibold">Create your poster</h2>
      {!hasSavedCaption && (
        <p>
          Prepare or write the caption first. Human approval is needed after the complete poster and
          caption are ready.
        </p>
      )}
      {info.isLoading && <p role="status">Checking poster availability…</p>}
      {info.isError && (
        <p role="alert">
          Could not check poster availability.{' '}
          <button className="underline" onClick={() => void info.refetch()}>
            Try again
          </button>
        </p>
      )}
      {info.data && <p className="text-sm">{info.data.setupMessage}</p>}
      {(needsConnection || info.data?.provider === 'disabled') && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
          Higgsfield setup is needed before a poster can be created.{' '}
          {admin ? (
            <Link className="font-semibold underline" to="/settings/higgsfield">
              Open Higgsfield connection
            </Link>
          ) : (
            'Ask your administrator to connect the business account.'
          )}
        </p>
      )}
      {row && (
        <>
          <p role="status">
            {row.status === 'AWAITING_CONFIRMATION' && (row.spendingConfirmed || row.authorization)
              ? 'Spending confirmed — waiting to start'
              : (labels[row.status] ?? 'Checking draft status')}
          </p>
          <p className="text-sm">
            {row.provider === 'fake' || row.provenance?.kind === 'MOCK'
              ? 'Mock image — for testing only.'
              : row.status === 'COMPLETE'
                ? 'AI background with the approved product photo added locally.'
                : 'Planned image: AI background with the approved product photo added locally.'}{' '}
            Caption factual checks must pass before review. No historical posters were used. This is
            not model training.
          </p>
          {row.provider === 'higgsfield_mcp' &&
            row.status === 'AWAITING_CONFIRMATION' &&
            !row.spendingConfirmed &&
            !row.authorization && (
              <McpCreditQuotePanel
                key={row.creditQuote?.fingerprint ?? row.id}
                id={id}
                row={row}
                canQuote={canPrepare}
                disabled={disabled}
                dispatchEnabled={Boolean(
                  info.data?.mcpConnection?.dispatchEnabled &&
                  info.data?.mcpConnection?.sharedUseConfirmed,
                )}
              />
            )}
          {row.error && <p role="alert">{row.error}</p>}
          {canPrepare && ['QUEUED', 'AWAITING_CONFIRMATION'].includes(row.status) && (
            <button
              className="min-h-11 rounded border px-4"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              Cancel before generation
            </button>
          )}
          {canPrepare &&
            (row.status === 'UNCERTAIN' || (row.status === 'FAILED' && row.canRecover)) && (
              <button
                className="min-h-11 rounded border px-4"
                disabled={check.isPending}
                onClick={() => check.mutate()}
              >
                {row.status === 'FAILED'
                  ? 'Try recovering the existing image'
                  : 'Check existing request'}
              </button>
            )}
          <details className="text-sm">
            <summary className="cursor-pointer">Generation details and cost</summary>
            <p>
              {row.provider} · {row.model}
            </p>
            <pre className="overflow-auto whitespace-pre-wrap">
              {JSON.stringify(row.settings, null, 2)}
            </pre>
            <p>
              External image references: {row.references.length}. Product photo is composited
              locally.
            </p>
            <p>
              {row.provider === 'higgsfield_mcp'
                ? `MCP credit estimate: ${row.estimatedCredits ?? 'Not verified'}; actual credits: ${row.actualCredits ?? 'Unknown'}. Separate API USD fields below do not represent MCP spending.`
                : ''}
              Estimated API USD cost:{' '}
              {row.estimatedCostUsd === null ? 'Not verified' : `USD ${row.estimatedCostUsd}`}.
              Actual cost: {row.actualCostUsd === null ? 'Unknown' : `USD ${row.actualCostUsd}`}.
            </p>
            <p>
              Current developer API balance: not verified. No verified monthly spending limit is
              enforced.
            </p>
            <p className="whitespace-pre-wrap">{row.prompt}</p>
          </details>
        </>
      )}
      {canPrepare && !hasSavedPoster && (!row || ['COMPLETE', 'FAILED'].includes(row.status)) && (
        <button
          className="min-h-11 rounded-lg bg-[#20313d] px-4 text-white disabled:opacity-40"
          disabled={
            !hasSavedCaption ||
            disabled ||
            start.isPending ||
            !info.data ||
            info.data.provider === 'disabled' ||
            needsConnection ||
            Boolean(row && row.sourceRevisionNumber === revision)
          }
          onClick={() => start.mutate()}
        >
          {start.isPending
            ? 'Preparing…'
            : ['higgsfield', 'higgsfield_mcp'].includes(info.data?.provider ?? '')
              ? 'Check cost to create poster'
              : 'Create poster using saved caption'}
        </button>
      )}
      {active && (
        <p className="text-sm">
          Progress is saved. You can leave this page and return later. Editing is paused until the
          request is resolved.
        </p>
      )}
      {row && ['COMPLETE', 'FAILED'].includes(row.status) && (
        <p className="text-sm">
          To create a different draft, save a new revision first. Repeated clicks never submit this
          request again.
        </p>
      )}
      {(start.error || check.error || cancel.error) && (
        <p role="alert">{(start.error || check.error || cancel.error)?.message}</p>
      )}
    </section>
  );
}
