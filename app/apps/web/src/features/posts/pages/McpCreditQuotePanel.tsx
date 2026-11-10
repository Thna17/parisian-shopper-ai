import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postsApi, type PostGeneration } from '../api/posts-api.js';
import { usePermissions } from '../../auth/hooks/use-permissions.js';
import { Permission } from '../../../types/auth.types.js';
export function McpCreditQuotePanel({
  id,
  row,
  disabled,
  dispatchEnabled,
  canQuote = true,
}: {
  id: string;
  row: PostGeneration;
  disabled: boolean;
  dispatchEnabled: boolean;
  canQuote?: boolean;
}): React.JSX.Element {
  const cache = useQueryClient(),
    permissions = usePermissions();
  const [accepted, setAccepted] = useState<string | null>(null);
  const quote = useMutation({
    mutationFn: () => postsApi.quoteCredits(id),
    onSuccess: (data) => {
      setAccepted(null);
      cache.setQueryData(['post-generation', id], data);
    },
  });
  const confirm = useMutation({
    mutationFn: () => postsApi.confirmCredits(id, row.id, row.creditQuote!.fingerprint),
    onSuccess: (data) => {
      setAccepted(null);
      cache.setQueryData(['post-generation', id], data);
    },
  });
  const q = row.creditQuote,
    pending = quote.isPending || confirm.isPending;
  return (
    <section aria-label="Higgsfield credit quote" className="space-y-3 rounded border p-3">
      {!dispatchEnabled && (
        <p>
          Spending is disabled pending administrator connection and deployment verification. You can
          still check a quote.
        </p>
      )}
      <h3 className="font-semibold">Check the exact cost before creating the poster</h3>
      <button
        className="min-h-11 rounded border px-4"
        disabled={disabled || pending || !canQuote}
        onClick={() => quote.mutate()}
      >
        Get current credit quote
      </button>
      {!canQuote && (
        <p>
          Ask the creator to refresh the quote if it expires. Your authorization does not count as
          final content approval.
        </p>
      )}
      {q && (
        <div className="space-y-2 text-sm">
          <p>
            Higgsfield MCP · {String(q.params.model)} · one image · square · 1k · low quality · PNG.
          </p>
          <p>
            Workspace: {q.workspaceId}. Quoted cost: <strong>{q.credits} credits</strong>. Balance
            checked with this quote: {q.balance} credits.
          </p>
          <p>
            Quote expires: {new Date(q.expiresAt).toLocaleString()}. External image references:
            none. The approved product photo is added locally. Captions use verified catalog facts
            or saved staff edits.
          </p>
          <details>
            <summary className="min-h-11 cursor-pointer">
              Exact background prompt and settings
            </summary>
            <pre className="whitespace-pre-wrap break-words">
              {JSON.stringify(q.params, null, 2)}
            </pre>
          </details>
          <p>
            No verified monthly hard spending limit is enforced. This spends MCP account credits,
            not the developer API dollar balance.
          </p>
          {permissions.hasPermission(Permission.MANAGE_AI_BUDGETS) ? (
            <>
              <label className="flex min-h-11 items-start gap-2">
                <input
                  type="checkbox"
                  checked={accepted === `${row.id}:${q.fingerprint}`}
                  onChange={(e) =>
                    setAccepted(e.target.checked ? `${row.id}:${q.fingerprint}` : null)
                  }
                  className="mt-1"
                />
                I authorize this exact request for {q.credits} Higgsfield credits.
              </label>
              <button
                className="min-h-11 rounded border px-4"
                disabled={
                  disabled ||
                  !dispatchEnabled ||
                  pending ||
                  accepted !== `${row.id}:${q.fingerprint}` ||
                  q.balance < q.credits ||
                  Date.parse(q.expiresAt) < Date.now()
                }
                onClick={() => confirm.mutate()}
              >
                Confirm {q.credits} credits and generate
              </button>
            </>
          ) : (
            <p>
              Ask an authorized budget administrator to open this Post and confirm the exact
              spending.
            </p>
          )}
        </div>
      )}
      {(quote.error || confirm.error) && (
        <p role="alert">{(quote.error || confirm.error)?.message}</p>
      )}
    </section>
  );
}
