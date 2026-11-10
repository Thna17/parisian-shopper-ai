import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type JSX } from 'react';
import { apiClient } from '../../../services/api/api-client.js';
export interface ProductCheck {
  eligible: boolean;
  issues: { code: string; message: string; alternatives: string[]; blocking: boolean }[];
  source: {
    system: string;
    url: string | null;
    asOf: string;
    sourceUpdatedAt: string;
    checkedAt: string | null;
    status: string;
    freshness: string;
  };
  changedScopes: string[];
  currentSnapshotId: string | null;
  historyWarnings: { code: string; message: string; postId: string }[];
  policy: { id: string; version: string; stockAction: string | null } | null;
}
export function ProductEligibilityPanel({
  postId,
  revision,
  canEdit,
  preview,
}: {
  postId?: string;
  revision?: number;
  canEdit?: boolean;
  preview?: { snapshotId: string; creationPlan: unknown; brief: string; campaignId?: string };
}): JSX.Element {
  const [settledPreview, setSettledPreview] = useState(preview);
  useEffect(() => {
    const timer = setTimeout(() => setSettledPreview(preview), 450);
    return () => clearTimeout(timer);
  }, [preview?.snapshotId, JSON.stringify(preview)]);
  const cache = useQueryClient();
  const key = ['product-marketing', postId ?? settledPreview?.snapshotId, revision, settledPreview];
  const state = useQuery({
    queryKey: key,
    queryFn: () =>
      postId
        ? apiClient.get<ProductCheck>(`/v1/posts/${postId}/product-check`)
        : apiClient.post<ProductCheck>('/v1/products/marketing/check', settledPreview),
    retry: false,
  });
  const recheck = useMutation({
    mutationFn: () => apiClient.post<ProductCheck>(`/v1/posts/${postId}/product-check`, {}),
    onSuccess: (data) => cache.setQueryData(key, data),
  });
  const refresh = useMutation({
    mutationFn: () =>
      apiClient.post(`/v1/posts/${postId}/refresh-product`, { expectedRevision: revision }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['staff-post', postId] });
      await cache.invalidateQueries({ queryKey: ['product-marketing'] });
    },
  });
  const data = state.data?.source && Array.isArray(state.data.issues) ? state.data : undefined;
  return (
    <section
      aria-label="Product eligibility and freshness"
      className="space-y-3 rounded-xl border bg-white p-4 text-sm"
    >
      <h2 className="text-lg font-semibold">Product facts and source check</h2>
      {state.isLoading && <p role="status">Checking saved product information…</p>}
      {state.error && (
        <p role="alert">
          Product checks could not load. Saved facts are not fresh verification.{' '}
          <button className="underline" onClick={() => void state.refetch()}>
            Try again
          </button>
        </p>
      )}
      {state.data && !data && (
        <p role="alert">
          Product checking returned incomplete information. Do not treat this as fresh verification.
        </p>
      )}
      {data && (
        <>
          <p>
            Source: {data.source.system} · Saved facts as of{' '}
            {new Date(data.source.asOf).toLocaleString()}
          </p>
          <p>
            Source updated: {new Date(data.source.sourceUpdatedAt).toLocaleString()} · Last check:{' '}
            {data.source.checkedAt
              ? new Date(data.source.checkedAt).toLocaleString()
              : 'Not checked'}
          </p>
          <p>
            Status: {data.source.status} · {data.source.freshness}. Cached or test data is not a
            live availability guarantee.
          </p>
          {data.source.url && (
            <a
              className="underline break-all"
              href={data.source.url}
              target="_blank"
              rel="noreferrer"
            >
              View product source
            </a>
          )}
          {data.policy && (
            <p>
              Freshness policy: {data.policy.id} · {data.policy.version}; stock action:{' '}
              {data.policy.stockAction ?? 'Not configured'}.
            </p>
          )}
          {data.issues.map((i) => (
            <div key={i.code} className="rounded bg-amber-50 p-2">
              <strong>{i.message}</strong>
              <p>{i.alternatives.join(' ')}</p>
            </div>
          ))}
          {data.eligible && (
            <p>
              Current checks passed. Facts are rechecked before generation, approval and release.
            </p>
          )}
          {data.historyWarnings.length > 0 && (
            <aside aria-label="Recent product and concept history">
              <h3 className="font-semibold">Recent content — advisory only</h3>
              <p>
                Showing up to 10 accessible recent posts. Campaign repeats are allowed. These
                warnings do not prevent intentional repeats or replace technical request
                deduplication.
              </p>
              {data.historyWarnings.map((w) => (
                <p key={w.postId}>
                  {w.message}{' '}
                  <a className="underline" href={`/posts/${w.postId}`}>
                    Previous post
                  </a>
                </p>
              ))}
            </aside>
          )}
        </>
      )}
      {postId && canEdit && (
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded border p-2 disabled:opacity-40"
            disabled={recheck.isPending || refresh.isPending}
            onClick={() => recheck.mutate()}
          >
            Check source now — no AI credits
          </button>
          {data?.changedScopes.length ? (
            <button
              className="rounded border p-2 disabled:opacity-40"
              disabled={recheck.isPending || refresh.isPending}
              onClick={() => refresh.mutate()}
            >
              Use latest facts in a new revision
            </button>
          ) : null}
        </div>
      )}
      {(recheck.isPending || refresh.isPending) && <p role="status">Checking source facts…</p>}
      {recheck.error && <p role="alert">{recheck.error.message}</p>}
      {refresh.error && <p role="alert">{refresh.error.message}</p>}
      <p>
        Changed facts never rewrite an approved post. A new facts revision clears its caption and
        poster and requires review again.
      </p>
    </section>
  );
}
