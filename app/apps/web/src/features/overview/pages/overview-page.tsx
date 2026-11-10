import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, FileText, Image, Plus, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../auth/context/auth-context.js';
import { usePermissions } from '../../auth/hooks/use-permissions.js';
import { Permission } from '../../../types/auth.types.js';
import { postsApi, postStatusLabel } from '../../posts/api/posts-api.js';
import { campaignsApi } from '../../campaigns/api/campaigns-api.js';

export const OverviewPage: React.FC = () => {
  const { employee } = useAuth();
  const { hasPermission } = usePermissions();
  const canView = hasPermission(Permission.VIEW_OWN_CONTENT);
  const canCreate = hasPermission(Permission.CREATE_CONTENT);
  const mine = useQuery({
    queryKey: ['staff-posts', 'mine', 1],
    queryFn: () => postsApi.list(1, 'mine'),
    enabled: canView,
    retry: false,
  });
  const reviews = useQuery({
    queryKey: ['staff-posts', 'reviews', 1],
    queryFn: () => postsApi.list(1, 'reviews'),
    enabled: canView,
    retry: false,
  });
  const approved = useQuery({
    queryKey: ['staff-posts', 'approved', 1],
    queryFn: () => postsApi.list(1, 'approved'),
    enabled: canView,
    retry: false,
  });
  const campaigns = useQuery({
    queryKey: ['workspace-campaigns'],
    queryFn: () => campaignsApi.getCampaigns({ page: 1, limit: 4, status: 'ACTIVE' }),
    enabled: canView,
    retry: false,
  });
  const metrics = [
    {
      label: 'Your saved posts',
      query: mine,
      to: '/posts',
      hint: 'Drafts and their saved revisions',
    },
    {
      label: 'Reviews pending',
      query: reviews,
      to: '/posts/reviews',
      hint: 'Complete posts awaiting a decision',
    },
    {
      label: 'Approved posts',
      query: approved,
      to: '/posts/approved',
      hint: 'Available to your account',
    },
    {
      label: 'Active campaigns',
      query: campaigns,
      to: '/campaigns',
      hint: 'From saved campaign records',
    },
  ];
  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="workspace-eyebrow">Workspace / Overview</p>
          <h1 className="mt-2 text-[30px] font-semibold tracking-tight">
            Welcome back, {employee?.displayName?.split(/\s+/)[0] ?? 'there'}.
          </h1>
          <p className="mt-2 text-sm text-app-muted">
            Your campaigns, product content and creative production, together in one workspace.
          </p>
        </div>
        {canCreate && (
          <Link to="/posts/new" className="workspace-primary">
            <Plus className="h-4 w-4" />
            Create a post
          </Link>
        )}
      </header>
      <div className="workspace-panel flex flex-wrap items-center justify-between gap-3 !bg-app-bg !py-3">
        <p className="flex items-center gap-2 text-xs text-app-muted">
          <ShieldCheck className="h-4 w-4 text-status-good" />
          Content stays in draft until an independent colleague approves it.
        </p>
        {canView && (
          <Link className="text-xs font-semibold" to="/posts/reviews">
            Open reviews <span aria-hidden="true">↗</span>
          </Link>
        )}
      </div>
      {canView && (
        <section
          aria-label="Workspace summary"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {metrics.map(({ label, query, to, hint }) => (
            <Link
              key={label}
              to={to}
              className="workspace-panel block transition hover:border-gold-500"
            >
              <p className="text-xs font-medium text-app-muted">{label}</p>
              <p className="my-4 text-[30px] font-semibold tabular-nums">
                {query.isLoading ? '…' : query.isError ? 'Unavailable' : (query.data?.total ?? '—')}
              </p>
              <p className="text-[11px] text-app-muted">
                {query.isError ? 'Open this section to retry.' : hint}
              </p>
            </Link>
          ))}
        </section>
      )}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Quick create</h2>
          <span className="text-xs text-app-muted">Start with a verified product</span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: 'Product post',
              text: 'Prepare a poster and Khmer / English Caption in one saved post.',
              to: '/posts/new',
              Icon: Plus,
              enabled: canCreate,
            },
            {
              title: 'Campaign',
              text: 'Plan a launch, select products and organize your content.',
              to: '/campaigns/new',
              Icon: CalendarDays,
              enabled: canCreate,
            },
            {
              title: 'Creative Studio',
              text: 'Continue existing poster projects and their saved artwork.',
              to: '/creative',
              Icon: Image,
              enabled: canView,
            },
          ]
            .filter((item) => item.enabled)
            .map(({ title, text, to, Icon }) => (
              <Link
                key={title}
                to={to}
                className="workspace-panel flex items-start gap-4 hover:border-gold-500"
              >
                <span className="rounded-lg bg-app-bg p-3 text-[#a48652]">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="mt-2 text-xs leading-5 text-app-muted">{text}</p>
                </div>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-app-muted" />
              </Link>
            ))}
        </div>
      </section>
      {canView && (
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <section className="workspace-panel">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold">Recent posts</h2>
              <Link to="/posts" className="workspace-link">
                View all ↗
              </Link>
            </div>
            {mine.isLoading ? (
              <p role="status">Loading saved posts…</p>
            ) : mine.isError ? (
              <p role="alert">
                Posts could not be loaded.{' '}
                <button className="workspace-link" onClick={() => void mine.refetch()}>
                  Try again
                </button>
              </p>
            ) : !mine.data?.items.length ? (
              <div className="py-10 text-center text-app-muted">
                <FileText className="mx-auto mb-3 h-8 w-8" />
                <p className="text-sm">Your first post starts with a product.</p>
                {canCreate && (
                  <Link to="/posts/new" className="workspace-link mt-3 inline-block">
                    Create a post
                  </Link>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-app-border">
                {mine.data.items.slice(0, 5).map((post) => (
                  <li key={post.id}>
                    <Link
                      to={'/posts/' + post.id}
                      className="flex items-center justify-between gap-4 py-4"
                    >
                      <div>
                        <p className="text-sm font-semibold">{post.productName}</p>
                        <p className="mt-1 text-[11px] text-app-muted">
                          Revision {post.revisionNumber} ·{' '}
                          {new Date(post.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="workspace-status">
                        {postStatusLabel[post.status] ?? post.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="workspace-panel">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold">Active campaigns</h2>
              <Link to="/campaigns" className="workspace-link">
                View all ↗
              </Link>
            </div>
            {campaigns.isLoading ? (
              <p role="status">Loading campaigns…</p>
            ) : campaigns.isError ? (
              <p role="alert">
                Campaigns could not be loaded.{' '}
                <button className="workspace-link" onClick={() => void campaigns.refetch()}>
                  Try again
                </button>
              </p>
            ) : !campaigns.data?.items.length ? (
              <p className="py-8 text-sm text-app-muted">
                No active campaigns. You can create a post without one.
              </p>
            ) : (
              <ul className="divide-y divide-app-border">
                {campaigns.data.items.map((campaign) => (
                  <li key={campaign.id}>
                    <Link to={'/campaigns/' + campaign.id} className="block py-4">
                      <p className="text-sm font-semibold">{campaign.name}</p>
                      <p className="mt-2 text-xs text-app-muted">
                        {campaign.productCount} products · {campaign.code}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
