import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useContentJobDetail,
  useReviseContent,
  useSubmitContentForReview,
} from '../../content/hooks/use-content.js';
import { usePermissions } from '../../auth/hooks/use-permissions.js';
import { Permission } from '../../../types/auth.types.js';
import type { ManualRevisePayload } from '../../content/types/content.types.js';

const button =
  'inline-flex min-h-11 items-center rounded-lg bg-[#20313d] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700';
const statusText: Record<string, string> = {
  REQUESTED: 'Waiting to create caption',
  GENERATING: 'Creating caption',
  DRAFT: 'Caption ready to review',
  UNDER_REVIEW: 'Caption awaiting a colleague’s review',
  REVISION_REQUESTED: 'Caption needs changes',
  APPROVED: 'Caption approved',
  REJECTED: 'Caption not approved',
  FAILED: 'Caption could not be created',
};

type Field = ManualRevisePayload['field'];
export function PostDraftPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const detail = useContentJobDetail(id);
  const revise = useReviseContent(id ?? '');
  const submit = useSubmitContentForReview(id ?? '');
  const { hasPermission } = usePermissions();
  const [field, setField] = useState<Field>('headline');
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(false);
  const data = detail.data;
  const version = data?.currentVersion;
  const canEdit = Boolean(
    data &&
    version &&
    (data.job.status === 'DRAFT' || data.job.status === 'REVISION_REQUESTED') &&
    hasPermission(Permission.EDIT_CONTENT),
  );
  const valid =
    data?.latestValidationResult &&
    ['PASSED', 'PASSED_WITH_WARNINGS'].includes(data.latestValidationResult.status) &&
    data.latestValidationResult.blockingCount === 0;
  const fields = version
    ? {
        headline: version.structuredOutput.headline,
        englishCaption: version.structuredOutput.english_caption ?? '',
        khmerCaption: version.structuredOutput.khmer_caption ?? '',
        cta: version.structuredOutput.cta,
      }
    : null;
  function startEdit() {
    if (fields) {
      setField('headline');
      setValue(fields.headline);
      setEditing(true);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!version) return;
    try {
      await revise.mutateAsync({ currentVersionId: version.id, field, newValue: value });
      setEditing(false);
    } catch {
      /* error shown below */
    }
  }
  if (detail.isLoading) return <p role="status">Loading your draft…</p>;
  if (detail.isError || !data)
    return (
      <div role="alert">
        Could not load this draft.{' '}
        <button className="underline" onClick={() => void detail.refetch()}>
          Try again
        </button>{' '}
        <Link className="underline" to="/content">
          View captions
        </Link>
      </div>
    );
  return (
    <main className="mx-auto max-w-6xl space-y-6 pb-10">
      <header>
        <Link to="/posts/new" className="text-sm underline">
          Create another post
        </Link>
        <h1 className="mt-2 font-serif text-3xl">Standalone Caption (legacy link)</h1>
        <p role="status" className="mt-2 text-sm font-semibold">
          {statusText[data.job.status] ?? 'Check draft status'}
        </p>
        <p className="mt-1 text-sm text-neutral-600">
          {data.product?.title ?? 'Product'}
          {data.campaign ? ` · ${data.campaign.name}` : ''}
        </p>
      </header>
      <ol aria-label="Post progress" className="grid gap-2 text-sm sm:grid-cols-4">
        <li className="rounded-lg border p-3">1. Product selected</li>
        <li className="rounded-lg border p-3">2. Caption: {statusText[data.job.status]}</li>
        <li className="rounded-lg border p-3">3. Poster: separate workspace</li>
        <li className="rounded-lg border p-3">4. Final review &amp; share</li>
      </ol>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="text-xl font-semibold">Poster image</h2>
          <div className="mt-4 flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed bg-neutral-50 p-5 text-center">
            <p className="font-semibold">No poster is linked to this view</p>
            <p className="mt-2 text-sm text-neutral-600">
              This older link opens a standalone caption. Complete posts now keep the poster,
              Caption and final review together in one workspace.
            </p>
          </div>
          <p className="mt-4 text-sm">
            For the complete post workflow,{' '}
            <Link className="font-semibold underline" to="/posts/new">
              Create a post
            </Link>
            . Caption approval is not required before preparing its poster. Existing standalone
            approvals remain in their original tools.
          </p>
        </section>
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="text-xl font-semibold">Caption</h2>
          {(data.job.status === 'REQUESTED' || data.job.status === 'GENERATING') && (
            <p role="status" className="mt-4">
              Creating your caption. This page updates automatically.
            </p>
          )}
          {data.job.status === 'FAILED' && (
            <p role="alert" className="mt-4 text-red-700">
              The caption could not be created. Check the details or contact an administrator.{' '}
              <Link className="underline" to={`/content/jobs/${data.job.id}`}>
                Open details
              </Link>
            </p>
          )}
          {version && fields && (
            <div className="mt-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Headline</h3>
                <p>{fields.headline}</p>
              </div>
              {fields.englishCaption && (
                <div>
                  <h3 className="text-sm font-semibold">English caption</h3>
                  <p className="whitespace-pre-wrap">{fields.englishCaption}</p>
                </div>
              )}
              {fields.khmerCaption && (
                <div>
                  <h3 className="text-sm font-semibold">Khmer caption</h3>
                  <p className="whitespace-pre-wrap">{fields.khmerCaption}</p>
                </div>
              )}
              <div>
                <h3 className="text-sm font-semibold">Call to action</h3>
                <p>{fields.cta}</p>
              </div>
              <p className="text-sm">{version.structuredOutput.hashtags.join(' ')}</p>
              {canEdit && !editing && (
                <button type="button" className={button} onClick={startEdit}>
                  Edit caption
                </button>
              )}
              {editing && (
                <form onSubmit={(e) => void save(e)} className="space-y-3">
                  <p className="text-sm">
                    Save one field at a time. Each change is checked against the product facts.
                  </p>
                  <label htmlFor="edit-field" className="block font-semibold">
                    Field to edit
                  </label>
                  <select
                    id="edit-field"
                    className="w-full rounded-lg border p-2"
                    value={field}
                    onChange={(e) => {
                      const next = e.target.value as Field;
                      setField(next);
                      setValue(fields[next]);
                    }}
                  >
                    <option value="headline">Headline</option>
                    <option value="englishCaption">English caption</option>
                    <option value="khmerCaption">Khmer caption</option>
                    <option value="cta">Call to action</option>
                  </select>
                  <label htmlFor="edit-value" className="block font-semibold">
                    Text
                  </label>
                  <textarea
                    id="edit-value"
                    className="w-full rounded-lg border p-2"
                    rows={5}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    required
                  />
                  <div className="flex flex-wrap gap-3">
                    <button className={button} disabled={revise.isPending}>
                      {revise.isPending ? 'Saving…' : 'Save change'}
                    </button>
                    <button type="button" className="underline" onClick={() => setEditing(false)}>
                      Cancel
                    </button>
                  </div>
                  {revise.isError && (
                    <p role="alert" className="text-red-700">
                      Could not save your change: {revise.error.message}
                    </p>
                  )}
                </form>
              )}
            </div>
          )}
        </section>
      </div>
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-xl font-semibold">Review and share</h2>
        <p className="mt-2 text-sm text-neutral-700">
          Caption and poster are reviewed separately today. A different authorized colleague must
          approve work you created or edited.
        </p>
        {canEdit && version && (
          <div className="mt-4">
            {!valid && (
              <p className="mb-3 text-sm text-amber-800">
                Wait for the caption checks to pass or open the details to resolve any issues.
              </p>
            )}
            <button
              type="button"
              className={button}
              disabled={!valid || editing || submit.isPending}
              onClick={() => void submit.mutateAsync(version.id).catch(() => {})}
            >
              {submit.isPending ? 'Sending…' : 'Send caption for review'}
            </button>
            {submit.isError && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                Could not send for review: {submit.error.message}
              </p>
            )}
          </div>
        )}
        {data.job.status === 'UNDER_REVIEW' && (
          <p className="mt-3 text-sm">
            Ask an authorized colleague to open{' '}
            <Link to="/reviews" className="underline">
              Reviews
            </Link>
            . You cannot approve your own caption.
          </p>
        )}
        {data.job.status === 'APPROVED' && (
          <p className="mt-3 text-sm">
            Create and approve the poster before using the existing export or publishing tools.
            Availability depends on your permissions.
          </p>
        )}
        <p className="mt-4 text-sm">
          <Link className="underline" to={`/content/jobs/${data.job.id}`}>
            Open caption details and checks
          </Link>
        </p>
      </section>
    </main>
  );
}
