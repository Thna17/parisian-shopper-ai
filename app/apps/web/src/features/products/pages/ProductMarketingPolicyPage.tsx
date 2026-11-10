import { useState, type JSX, type FormEvent } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/api-client.js';
const windows = [
  'stockSeconds',
  'catalogPriceSeconds',
  'campaignPriceSeconds',
  'promotionSeconds',
  'promotionRecheckWindowSeconds',
  'permanentFactsSeconds',
  'hardExpiryBoundarySeconds',
] as const;
const stocks = [
  'in_stock',
  'low_stock',
  'out_of_stock',
  'preorder',
  'discontinued',
  'unknown',
] as const;
export function ProductMarketingPolicyPage(): JSX.Element {
  const current = useQuery({
    queryKey: ['product-marketing-policy'],
    queryFn: () =>
      apiClient.get<{
        policyId: string;
        version: string;
        marketing?: unknown;
        ttl: unknown;
      } | null>('/v1/products/marketing/policy'),
  });
  const [id, setId] = useState(''),
    [version, setVersion] = useState(''),
    [ttl, setTtl] = useState<Record<string, string>>({}),
    [actions, setActions] = useState<Record<string, string>>({}),
    [confirmed, setConfirmed] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      apiClient.post('/v1/products/marketing/policy', {
        data: {
          policyId: id,
          version,
          ttl: Object.fromEntries(windows.map((k) => [k, Number(ttl[k])])),
          marketing: {
            stockActions: Object.fromEntries(Object.entries(actions).filter(([, v]) => v)),
          },
          confirmed: true,
        },
      }),
    onSuccess: () => {
      setConfirmed(false);
      void current.refetch();
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (confirmed) save.mutate();
  }
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <h1 className="text-3xl font-semibold">Product freshness and stock policy</h1>
      <p>
        Enter actual business decisions. This version applies to web and Telegram. No stock action
        or production freshness window is invented for you. Existing versions and approvals are
        preserved.
      </p>
      {current.isLoading && <p role="status">Loading policy…</p>}
      {current.error && (
        <p role="alert">Could not load the current policy. {current.error.message}</p>
      )}
      {current.data ? (
        <section className="rounded border p-3">
          <h2>
            Current policy: {current.data.policyId} · {current.data.version}
          </h2>
          {current.data.policyId === 'development-v1' && (
            <p>This is the development TTL benchmark, not a business stock policy.</p>
          )}
          <pre className="overflow-auto whitespace-pre-wrap text-xs">
            {JSON.stringify(
              {
                ttl: current.data.ttl,
                stockPolicy: current.data.marketing ?? 'No business stock policy configured',
              },
              null,
              2,
            )}
          </pre>
        </section>
      ) : (
        !current.isLoading && !current.error && <p>No approved policy is active.</p>
      )}
      <form className="space-y-4 rounded border bg-white p-4" onSubmit={submit}>
        <fieldset disabled={save.isPending} className="space-y-4">
          <legend className="font-semibold">Approve a new version</legend>
          <label className="block">
            Policy name
            <input
              required
              className="block w-full rounded border p-2"
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                setConfirmed(false);
              }}
            />
          </label>
          <label className="block">
            Version
            <input
              required
              className="block w-full rounded border p-2"
              value={version}
              onChange={(e) => {
                setVersion(e.target.value);
                setConfirmed(false);
              }}
            />
          </label>
          <p>
            Freshness windows are in seconds. Enter all seven values; no window may exceed the hard
            expiry boundary. Shorter windows require more frequent source checks.
          </p>
          {windows.map((k) => (
            <label className="block" key={k}>
              {k.replaceAll(/([A-Z])/g, ' $1')}
              <input
                required
                type="number"
                min="1"
                max="31536000"
                className="block rounded border p-2"
                value={ttl[k] ?? ''}
                onChange={(e) => {
                  setTtl({ ...ttl, [k]: e.target.value });
                  setConfirmed(false);
                }}
              />
            </label>
          ))}
          <h2 className="font-semibold">Stock decisions</h2>
          <p>
            Allow: permit marketing from verified facts. Warn: permit it with a staff warning.
            Block: stop generation and release. Unconfigured low stock, out of stock, preorder or
            unknown stock blocks those actions. Discontinued products remain blocked.
          </p>
          {stocks.map((s) => (
            <label key={s} className="block">
              {s.replaceAll('_', ' ')}
              <select
                className="ml-2 rounded border p-2"
                value={actions[s] ?? ''}
                onChange={(e) => {
                  setActions({ ...actions, [s]: e.target.value });
                  setConfirmed(false);
                }}
              >
                <option value="">Not configured</option>
                {s !== 'discontinued' && <option value="ALLOW">Allow</option>}
                {s !== 'discontinued' && <option value="WARN">Warn</option>}
                <option value="BLOCK">Block</option>
              </select>
            </label>
          ))}
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I am authorized to approve these exact freshness windows and stock decisions for the
            business.
          </label>
          <button
            className="rounded border px-4 py-2 disabled:opacity-40"
            disabled={!confirmed || save.isPending}
          >
            Approve and activate this policy version
          </button>
        </fieldset>
      </form>
      {save.isPending && <p role="status">Saving policy version…</p>}
      {save.error && <p role="alert">{save.error.message}</p>}
      {save.isSuccess && (
        <p role="status">Policy version saved. Older policy records are unchanged.</p>
      )}
      <p>
        Promotion approval and valid dates must come from the product source. This screen cannot
        turn an unapproved offer into an approved promotion.
      </p>
    </main>
  );
}
