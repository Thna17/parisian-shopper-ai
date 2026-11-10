import React from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  downloadApprovedPost,
  savePostDownload,
  type PostDownloadKind,
  type StaffPost,
} from '../api/posts-api.js';
export function ApprovedPostActions({
  post,
  dirty,
}: {
  post: StaffPost;
  dirty: boolean;
}): React.JSX.Element {
  const cache = useQueryClient();
  const download = useMutation({
    mutationFn: (kind: PostDownloadKind) =>
      downloadApprovedPost(post.id, post.currentRevision.id, post.reviewRound, kind),
    onSuccess: savePostDownload,
  });
  return (
    <section
      aria-label="Approved downloads and publishing"
      className="space-y-4 rounded-xl border bg-white p-4"
    >
      <h2 className="text-lg font-semibold">Download &amp; share</h2>
      {post.status === 'APPROVED' ? (
        <p>
          Revision {post.revisionNumber} is approved. Downloads contain exactly the saved poster and
          captions for this approval.
        </p>
      ) : (
        <p>Downloads unlock after an independent colleague approves this complete post.</p>
      )}
      {post.canDownload ? (
        <div className="flex flex-wrap gap-3">
          {(
            [
              ['poster', 'Download poster'],
              ['caption-text', 'Download captions (.txt)'],
              ['caption-json', 'Download captions (.json)'],
              ['manifest', 'Download verification details'],
            ] as const
          ).map(([kind, label]) => (
            <button
              type="button"
              key={kind}
              className="min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:opacity-40"
              disabled={dirty || download.isPending}
              onClick={() => download.mutate(kind)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm">
          {post.downloadReason ?? 'Ask an authorized colleague to download approved files.'}
        </p>
      )}
      {dirty && (
        <p role="status">
          Save your edits and have the changed revision reviewed before downloading.
        </p>
      )}
      {download.isPending && (
        <p role="status">Checking the approved image and preparing your download…</p>
      )}
      {download.isError && (
        <p role="alert">
          {download.error.message}{' '}
          <button
            type="button"
            className="underline"
            onClick={() => download.mutate(download.variables!)}
          >
            Try download again
          </button>{' '}
          <button
            type="button"
            className="underline"
            onClick={() => void cache.invalidateQueries({ queryKey: ['staff-post', post.id] })}
          >
            Refresh approval status
          </button>
        </p>
      )}
      {download.isSuccess && (
        <p role="status">The approved file passed its checksum check. Download started.</p>
      )}
      <h3 className="font-semibold">Publishing destinations</h3>
      <p className="text-sm">
        Direct publishing of complete Posts is not connected. Download approved files for your usual
        publishing process.
      </p>
      <ul className="space-y-1 text-sm">
        {['Facebook', 'Instagram', 'Telegram'].map((name) => (
          <li key={name}>{name}: unavailable for this Post. Nothing will be sent.</li>
        ))}
      </ul>
      {Boolean(post.existingPublications?.length) && (
        <div className="space-y-2">
          <p className="text-sm">
            These existing publication records match the exact standalone caption and poster linked
            to this Post:
          </p>
          {post.existingPublications?.map((publication) => (
            <Link
              className="block text-sm underline"
              key={publication.id}
              to={`/publishing/${publication.id}`}
            >
              View existing {publication.destinationChannel.replaceAll('_', ' ')} record ·{' '}
              {publication.status.replaceAll('_', ' ')}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
