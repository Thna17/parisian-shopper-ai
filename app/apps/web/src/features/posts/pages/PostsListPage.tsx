import React, { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { postsApi, postStatusLabel, type PostListScope } from '../api/posts-api.js';
import { usePermissions } from '../../auth/hooks/use-permissions.js';
import { Permission } from '../../../types/auth.types.js';
export function PostsListPage({ scope = 'mine' }: { scope?: PostListScope }): React.JSX.Element {
  const [params, setParams] = useSearchParams();
  const requestedPage = Number(params.get('page') ?? 1);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000
      ? requestedPage
      : 1;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [scope, page]);
  const setPage = (next: number): void => setParams(next === 1 ? {} : { page: String(next) });
  const query = useQuery({
    queryKey: ['staff-posts', scope, page],
    queryFn: () => postsApi.list(page, scope),
    retry: false,
  });
  const title = {
    mine: 'My posts',
    reviews: 'Reviews',
    approved: 'Approved posts',
    all: 'All posts',
  }[scope];
  const { hasPermission } = usePermissions();
  return (
    <section aria-label={title} className="mx-auto min-w-0 max-w-5xl space-y-5 break-words pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 ref={heading} tabIndex={-1} className="font-serif text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-sm text-app-muted">
            {scope === 'reviews'
              ? 'Complete posts waiting for independent review. Creators and contributors cannot approve their own work.'
              : scope === 'approved'
                ? 'Approved versions, ready for authorized downloads. Direct publishing availability is shown in each post.'
                : 'Your saved drafts, posters, captions and review history in one place.'}
          </p>
        </div>
        {hasPermission(Permission.CREATE_CONTENT) && (
          <Link className="rounded-lg bg-[#20313d] px-5 py-3 text-white" to="/posts/new">
            Create a post
          </Link>
        )}
      </header>
      {query.isLoading && <p role="status">Loading posts…</p>}
      {query.isError && (
        <p role="alert">
          Could not load posts.{' '}
          <button className="underline" onClick={() => void query.refetch()}>
            Try again
          </button>
        </p>
      )}
      {query.data?.items.length === 0 && (
        <p>
          {scope === 'reviews'
            ? 'No posts are waiting for review.'
            : scope === 'approved'
              ? 'No approved posts yet. Complete posts appear here after independent approval.'
              : 'No saved posts yet. Choose a product to start your first draft.'}
        </p>
      )}
      <ul className="space-y-3">
        {query.data?.items.map((p) => (
          <li key={p.id}>
            <Link
              className="block rounded-xl border bg-white p-4 focus-visible:outline-2 focus-visible:outline-amber-700"
              to={`/posts/${p.id}`}
            >
              <h2 className="font-semibold">{p.productName}</h2>
              <p className="text-sm">
                {postStatusLabel[p.status] ?? p.status} · Revision {p.revisionNumber} ·{' '}
                {p.creatorName}
              </p>
              <p className="text-xs text-app-muted">
                Updated {new Date(p.updatedAt).toLocaleString()}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {query.data && (
        <nav aria-label="Post pages" className="flex gap-4">
          <button
            className="min-h-11 rounded border px-4 focus-visible:outline-2 focus-visible:outline-amber-700 disabled:opacity-40"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <p>
            Page {page} of {query.data.totalPages}
          </p>
          <button
            className="min-h-11 rounded border px-4 focus-visible:outline-2 focus-visible:outline-amber-700 disabled:opacity-40"
            disabled={page >= query.data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
