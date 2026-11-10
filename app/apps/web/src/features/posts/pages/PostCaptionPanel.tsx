import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/api-client.js';
interface CaptionStatus {
  provider: string;
  enabled: boolean;
  liveDispatchEnabled: boolean;
  attempt: null | {
    id: string;
    status: string;
    sourceRevisionNumber: number;
    error: string | null;
    provenance?: { method?: string };
    output?: unknown;
  };
}
interface ProfilePack {
  id: string;
  name: string;
  versionNumber: number;
  status: string;
  approvalId: string | null;
  ruleVersionId: string;
  guidance: { referenceSourceIds: string[] };
}
interface Example {
  id: string;
  status: string;
  version: number;
  tags: string[];
}
interface Brand {
  version: { id: string; name: string; version: number; rules: unknown };
  digest: string;
  approved: boolean;
  hasPlaceholders: boolean;
}
export function PostCaptionPanel({
  id,
  revision,
  disabled,
  onBusyChange,
  onStatusChange,
}: {
  id: string;
  revision: number;
  disabled: boolean;
  onBusyChange?: (busy: boolean) => void;
  onStatusChange?: (status: string) => void;
}): React.JSX.Element {
  const cache = useQueryClient();
  const [brand, setBrand] = useState('');
  const [profileId, setProfileId] = useState('');
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const packs = useQuery({
    queryKey: ['approved-brand-packs'],
    queryFn: () => apiClient.get<ProfilePack[]>('/v1/brand/guidance'),
    retry: false,
  });
  const examples = useQuery({
    queryKey: ['approved-brand-examples'],
    queryFn: () => apiClient.get<Example[]>('/v1/brand/guidance/references'),
    retry: false,
  });
  const profile = Array.isArray(packs.data)
    ? packs.data.find((p) => p.id === profileId)
    : undefined;
  const availablePacks = Array.isArray(packs.data)
    ? packs.data.filter((p) => p.status === 'ACTIVE' && p.approvalId)
    : [];
  const [polling, setPolling] = useState(false);
  const brands = useQuery({
    queryKey: ['post-caption-brands'],
    queryFn: () => apiClient.get<Brand[]>('/v1/posts/caption/brands'),
    retry: false,
  });
  const state = useQuery({
    queryKey: ['post-caption', id],
    queryFn: () => apiClient.get<CaptionStatus>(`/v1/posts/${id}/caption`),
    retry: false,
    refetchInterval: (q) =>
      polling || ['QUEUED', 'GENERATING'].includes(q.state.data?.attempt?.status ?? '')
        ? 1500
        : false,
  });
  const generate = useMutation({
    onMutate: () => setPolling(true),
    onSettled: async () => {
      await cache.invalidateQueries({ queryKey: ['post-caption', id] });
      setPolling(false);
    },
    mutationFn: (method: 'AI' | 'TEMPLATE') =>
      apiClient.post<CaptionStatus>(`/v1/posts/${id}/caption`, {
        expectedRevision: revision,
        method,
        ...(method === 'AI'
          ? {
              brandRuleVersionId: profile?.ruleVersionId ?? brand,
              ...(profile
                ? { brandProfileVersionId: profile.id, referenceSourceIds: referenceIds }
                : {}),
            }
          : {}),
      }),
    onSuccess: async (data) => {
      cache.setQueryData(['post-caption', id], data);
      await cache.invalidateQueries({ queryKey: ['staff-post', id] });
    },
  });
  const recover = useMutation({
    mutationFn: () => apiClient.post<CaptionStatus>(`/v1/posts/${id}/caption/recover`, {}),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['post-caption', id] });
      await cache.invalidateQueries({ queryKey: ['staff-post', id] });
    },
  });
  useEffect(() => {
    if (state.data?.attempt?.status === 'COMPLETE' && !disabled)
      void cache.invalidateQueries({ queryKey: ['staff-post', id] });
  }, [state.data?.attempt?.id, state.data?.attempt?.status, id, cache, disabled]);
  const approved = brands.data?.filter((b) => b.approved && !b.hasPlaceholders) ?? [];
  const row = state.data?.attempt;
  const usedRevision = Boolean(
    row && row.sourceRevisionNumber === revision && ['BLOCKED', 'FAILED'].includes(row.status),
  );
  const blocked =
    row?.status === 'BLOCKED' && row.output && typeof row.output === 'object'
      ? (row.output as Record<string, unknown>)
      : null;
  const busy =
    generate.isPending ||
    Boolean(row && ['QUEUED', 'GENERATING', 'UNCERTAIN'].includes(row.status));
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  useEffect(() => {
    onStatusChange?.(row?.status ?? (generate.isPending ? 'GENERATING' : ''));
  }, [row?.status, generate.isPending, onStatusChange]);
  const labels: Record<string, string> = {
    QUEUED: 'Caption waiting to start',
    GENERATING: 'Writing your caption',
    COMPLETE: 'Caption saved as a new revision',
    FAILED: 'Caption request failed',
    BLOCKED: 'Caption needs correction',
    UNCERTAIN: 'Caption outcome uncertain — do not submit again',
  };
  return (
    <section aria-label="Prepare caption" className="space-y-3 rounded-xl border bg-white p-4">
      <h2 className="text-lg font-semibold">Prepare your caption</h2>
      <p className="text-sm">
        Generate suggested wording in the post’s selected language from verified facts and approved
        brand guidance. The poster has a separate status. A colleague reviews the complete post
        afterward.
      </p>
      {state.isLoading && <p role="status">Checking caption availability…</p>}
      {state.isError && (
        <p role="alert">
          Could not load caption status.{' '}
          <button className="underline" onClick={() => void state.refetch()}>
            Try again
          </button>
        </p>
      )}
      {!state.data?.enabled && state.data && (
        <p>
          AI captions are disabled or credentials are missing. Ask your administrator, write a
          caption, or choose the labeled template.
        </p>
      )}
      {approved.length === 0 && !brands.isLoading && (
        <p>
          No approved brand-rule version is available. Ask an administrator to complete and
          explicitly approve the brand guidance. Development placeholders cannot be used.
        </p>
      )}
      {packs.isLoading && <p role="status">Loading business-approved brand packs…</p>}
      {packs.isError && (
        <p role="alert">
          Could not load brand packs.{' '}
          <button className="underline" onClick={() => void packs.refetch()}>
            Try again
          </button>
        </p>
      )}
      {!packs.isLoading && !packs.isError && availablePacks.length === 0 && (
        <p>
          No business-approved visual brand pack is available. Caption rules alone do not establish
          official poster colors, fonts or image references.
        </p>
      )}
      <label className="block">
        Business-approved brand pack
        <select
          aria-label="Business-approved brand pack"
          className="ml-2 rounded border p-2"
          value={profileId}
          disabled={busy || disabled}
          onChange={(e) => {
            setProfileId(e.target.value);
            setBrand('');
            setReferenceIds([]);
          }}
        >
          <option value="">Caption rules only — no visual pack</option>
          {availablePacks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · version {p.versionNumber}
            </option>
          ))}
        </select>
      </label>
      {profile && (
        <fieldset className="space-y-2 rounded border p-3">
          <legend>Reviewed historical examples (optional)</legend>
          {examples.isError && (
            <p role="alert">
              Could not load reviewed examples. None will be used unless you select them after
              loading succeeds.{' '}
              <button className="underline" onClick={() => void examples.refetch()}>
                Try again
              </button>
            </p>
          )}
          <p>
            Selected caption text can guide writing style. The image provider does not receive these
            poster images. This is reference guidance, not training or fine-tuning.
          </p>
          {(Array.isArray(examples.data) ? examples.data : [])
            .filter(
              (r) => r.status === 'APPROVED' && profile.guidance.referenceSourceIds.includes(r.id),
            )
            .map((r) => (
              <label key={r.id} className="flex gap-2">
                <input
                  type="checkbox"
                  checked={referenceIds.includes(r.id)}
                  disabled={busy || disabled}
                  onChange={(e) =>
                    setReferenceIds(
                      e.target.checked
                        ? [...referenceIds, r.id]
                        : referenceIds.filter((id) => id !== r.id),
                    )
                  }
                />
                Reference version {r.version} · {r.tags.join(', ') || r.id}
              </label>
            ))}
          {profile.guidance.referenceSourceIds.length === 0 && (
            <p>No historical references are approved for this pack. None will be used.</p>
          )}
        </fieldset>
      )}
      {!profile && (
        <label className="block">
          Approved brand guidance
          <select
            aria-label="Approved caption brand guidance"
            className="ml-2 rounded border p-2"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            disabled={busy || disabled}
          >
            <option value="">Choose a version</option>
            {approved.map((b) => (
              <option key={b.version.id} value={b.version.id}>
                {b.version.name} · version {b.version.version}
              </option>
            ))}
          </select>
        </label>
      )}
      {state.data?.provider === 'fake' && (
        <p className="text-sm">
          Test mode: mock caption provider. This does not demonstrate real AI writing or Khmer
          quality.
        </p>
      )}
      {state.data?.provider !== 'fake' &&
        state.data?.enabled &&
        !state.data?.liveDispatchEnabled && (
          <p>Live caption dispatch is disabled. No paid request will be submitted.</p>
        )}
      {row && (
        <p role="status">
          {labels[row.status] ?? row.status}
          {row.provenance?.method ? ` · ${row.provenance.method}` : ''}
        </p>
      )}
      {row?.error && <p role="alert">{row.error}</p>}
      {usedRevision && (
        <p>
          Save a corrected or new revision in Edit saved draft before making another caption
          request.
        </p>
      )}
      {blocked && (
        <details>
          <summary>Inspect the blocked caption suggestion</summary>
          <p>
            This suggestion failed checks and did not replace your saved caption. Copy useful
            wording into Edit saved draft and correct the findings before review.
          </p>
          <textarea
            readOnly
            aria-label="Blocked caption suggestion"
            className="w-full rounded border p-2"
            rows={7}
            value={[blocked.headline, blocked.english_caption, blocked.khmer_caption, blocked.cta]
              .filter((v): v is string => typeof v === 'string')
              .join('\n\n')}
          />
        </details>
      )}
      {generate.error && <p role="alert">{generate.error.message}</p>}
      {recover.error && <p role="alert">{recover.error.message}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-lg bg-[#20313d] px-4 py-2 text-white disabled:opacity-40"
          disabled={
            disabled ||
            busy ||
            usedRevision ||
            (!brand && !profile) ||
            !state.data?.enabled ||
            (state.data.provider !== 'fake' && !state.data.liveDispatchEnabled)
          }
          onClick={() => generate.mutate('AI')}
        >
          Generate caption
        </button>
        <button
          className="rounded-lg border px-4 py-2 disabled:opacity-40"
          disabled={disabled || busy || usedRevision}
          onClick={() => generate.mutate('TEMPLATE')}
        >
          Use catalog template — no AI
        </button>
        {row?.status === 'UNCERTAIN' && (
          <button
            className="rounded-lg border px-4 py-2"
            onClick={() => recover.mutate()}
            disabled={recover.isPending}
          >
            Recover saved response
          </button>
        )}
      </div>
      <p className="text-sm">
        A new caption preserves earlier revisions and clears the old poster association. Generate a
        poster for the new wording. Unknown provider outcomes must be reconciled before another
        request.
      </p>
    </section>
  );
}
