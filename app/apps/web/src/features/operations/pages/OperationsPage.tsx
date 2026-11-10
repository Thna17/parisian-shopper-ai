import React from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { analyticsApi } from '../../analytics/api/analytics-api.js';
export function OperationsPage(): React.JSX.Element {
  const [content, creative, publishing] = useQueries({
    queries: [
      {
        queryKey: ['workspace-operations', 'content'],
        queryFn: () => analyticsApi.getContent(),
        retry: false,
      },
      {
        queryKey: ['workspace-operations', 'creative'],
        queryFn: () => analyticsApi.getCreative(),
        retry: false,
      },
      {
        queryKey: ['workspace-operations', 'publishing'],
        queryFn: () => analyticsApi.getPublishing(),
        retry: false,
      },
    ],
  });
  const sections = [
    {
      name: 'Caption production',
      query: content,
      to: '/content',
      values: [
        ['Successful attempts', content.data?.successfulAttempts],
        ['Failed attempts', content.data?.failedAttempts],
        ['Waiting for review', content.data?.pendingReviewJobs],
      ],
    },
    {
      name: 'Creative production',
      query: creative,
      to: '/creative',
      values: [
        ['Successful renders', creative.data?.successfulRenders],
        ['Failed renders', creative.data?.failedRenders],
        ['Saved exports', creative.data?.exportArtifacts],
      ],
    },
    {
      name: 'Publishing operations',
      query: publishing,
      to: '/publishing',
      values: [
        ['Delivered publications', publishing.data?.publishedCount],
        ['Failed publications', publishing.data?.failedCount],
        ['Uncertain outcomes', publishing.data?.unknownOutcomes],
      ],
    },
  ];
  return (
    <section className="space-y-6">
      <header>
        <p className="workspace-eyebrow">Intelligence / Operations</p>
        <h1 className="mt-2 text-3xl font-semibold">Workflow Operations</h1>
        <p className="mt-2 text-sm text-app-muted">
          Production and delivery outcomes from saved application records.
        </p>
      </header>
      <div className="grid gap-5 lg:grid-cols-3">
        {sections.map((section) => (
          <article key={section.name} className="workspace-panel">
            <h2 className="mb-5 text-base font-semibold">{section.name}</h2>
            {section.query.isLoading ? (
              <p role="status">Loading outcomes…</p>
            ) : section.query.isError ? (
              <p role="alert">
                Could not load these records.{' '}
                <button className="workspace-link" onClick={() => void section.query.refetch()}>
                  Try again
                </button>
              </p>
            ) : (
              <dl className="space-y-4">
                {section.values.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-sm text-app-muted">{label}</dt>
                    <dd className="font-semibold tabular-nums">{value ?? 'Unavailable'}</dd>
                  </div>
                ))}
              </dl>
            )}
            <Link to={section.to} className="workspace-link mt-6 inline-block">
              Open records ↗
            </Link>
          </article>
        ))}
      </div>
      <p className="text-xs leading-6 text-app-muted">
        These are recorded workflow totals, not an infrastructure health check. Unknown delivery
        outcomes require reconciliation before another attempt. Viewing this page does not restart
        work or send content.
      </p>
    </section>
  );
}
