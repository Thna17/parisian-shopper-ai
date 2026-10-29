import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, Filter, History } from 'lucide-react';
import { PageHeader } from '../../../components/navigation/page-header.js';
import { Button } from '../../../components/ui/button.js';
import { Card } from '../../../components/ui/card.js';
import { EmptyState } from '../../../components/ui/empty-state.js';
import { Skeleton } from '../../../components/ui/skeleton.js';
import { ChannelBadge } from '../components/ChannelBadge.js';
import { PublicationStatusBadge } from '../components/PublicationStatusBadge.js';
import { usePublications } from '../hooks/use-publishing.js';
import {
  PublicationChannel,
  type PublicationRecord,
  PublicationStatus,
} from '../types/publishing.types.js';

export const PublicationHistoryPage: React.FC = () => {
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<PublicationStatus | undefined>(undefined);
  const [channelFilter, setChannelFilter] = useState<PublicationChannel | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = usePublications({
    status: statusFilter,
    channel: channelFilter,
    page,
    limit: 20,
  });

  const publications = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        eyebrow="Audit & Compliance"
        title="Publication History & Audit Log"
        subtitle="Complete ledger of historical distribution actions, dispatch outcomes, retry attempts, and cancellations."
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate('/publishing')}
          >
            Back to Desk
          </Button>
        }
      />

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-app-surface p-3 rounded-lg border border-app-border">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-app-muted" />
            <span className="text-xs font-semibold text-app-primary uppercase tracking-wider">
              Filter By:
            </span>
          </div>

          <select
            value={statusFilter ?? ''}
            onChange={(e) => {
              setStatusFilter(e.target.value ? (e.target.value as PublicationStatus) : undefined);
              setPage(1);
            }}
            aria-label="Filter by Status"
            className="text-xs px-2.5 py-1.5 rounded-md border border-app-border bg-white text-app-primary focus:outline-none focus:ring-1 focus:ring-gold-500"
          >
            <option value="">All Statuses</option>
            <option value={PublicationStatus.DRAFT}>Draft</option>
            <option value={PublicationStatus.READY}>Ready</option>
            <option value={PublicationStatus.QUEUED}>Queued</option>
            <option value={PublicationStatus.PROCESSING}>Processing</option>
            <option value={PublicationStatus.PUBLISHED}>Published</option>
            <option value={PublicationStatus.FAILED}>Failed</option>
            <option value={PublicationStatus.CANCELLED}>Cancelled</option>
          </select>

          <select
            value={channelFilter ?? ''}
            onChange={(e) => {
              setChannelFilter(e.target.value ? (e.target.value as PublicationChannel) : undefined);
              setPage(1);
            }}
            aria-label="Filter by Channel"
            className="text-xs px-2.5 py-1.5 rounded-md border border-app-border bg-white text-app-primary focus:outline-none focus:ring-1 focus:ring-gold-500"
          >
            <option value="">All Channels</option>
            <option value={PublicationChannel.MANUAL_EXPORT}>Manual Export</option>
            <option value={PublicationChannel.TELEGRAM_CHANNEL}>Telegram Channel</option>
            <option value={PublicationChannel.FACEBOOK_PAGE}>Facebook Page</option>
            <option value={PublicationChannel.INSTAGRAM}>Instagram</option>
          </select>
        </div>

        <div className="text-xs text-app-muted">
          Total Recorded: <span className="font-semibold text-app-primary">{total}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : isError ? (
        <Card className="p-8 text-center border-rose-200 bg-rose-50/40">
          <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <div className="text-sm font-semibold text-rose-900">Failed to load audit history</div>
          <div className="text-xs text-rose-700 mt-1">
            {(error as Error)?.message ?? 'An unknown error occurred'}
          </div>
          <Button variant="secondary" size="sm" onClick={() => void refetch()} className="mt-4">
            Retry
          </Button>
        </Card>
      ) : publications.length === 0 ? (
        <EmptyState
          icon={<History className="w-10 h-10 text-app-muted" />}
          title="No Historical Records Found"
          description="There are no publishing audit records matching your current filter criteria."
        />
      ) : (
        <div className="bg-white rounded-xl border border-app-border overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-app-surface border-b border-app-border text-[11px] font-semibold text-app-muted uppercase tracking-wider">
                <th className="py-3 px-4">Publication ID</th>
                <th className="py-3 px-4">Channel</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Idempotency Key</th>
                <th className="py-3 px-4">Published Timestamp</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {publications.map((pub: PublicationRecord) => (
                <tr key={pub.id} className="hover:bg-app-surface/50 transition-colors">
                  <td className="py-3 px-4 font-mono font-medium text-navy-800">
                    <Link to={`/publishing/${pub.id}`} className="hover:underline">
                      {pub.id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="py-3 px-4">
                    <ChannelBadge channel={pub.destinationChannel} />
                  </td>
                  <td className="py-3 px-4">
                    <PublicationStatusBadge status={pub.status} />
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-app-muted truncate max-w-[180px]">
                    {pub.idempotencyKey}
                  </td>
                  <td className="py-3 px-4 text-app-muted">
                    {pub.publishedAt ? new Date(pub.publishedAt).toLocaleString() : '—'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link to={`/publishing/${pub.id}`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<ArrowRight className="w-3.5 h-3.5" />}
                      >
                        View
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="p-3 border-t border-app-border flex items-center justify-between text-xs">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-app-muted">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
