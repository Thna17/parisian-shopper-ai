import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Clock,
  Filter,
  Plus,
  Radio,
  Send,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '../../../components/navigation/page-header.js';
import { Button } from '../../../components/ui/button.js';
import { Card } from '../../../components/ui/card.js';
import { EmptyState } from '../../../components/ui/empty-state.js';
import { Skeleton } from '../../../components/ui/skeleton.js';
import { Permission } from '../../../types/auth.types.js';
import { usePermissions } from '../../auth/hooks/use-permissions.js';
import { ChannelBadge } from '../components/ChannelBadge.js';
import { PublicationStatusBadge } from '../components/PublicationStatusBadge.js';
import { useDestinations, usePublications } from '../hooks/use-publishing.js';
import {
  PublicationChannel,
  type PublicationRecord,
  PublicationStatus,
} from '../types/publishing.types.js';

export const PublishingDashboardPage: React.FC = () => {
  const [selectedStatus, setSelectedStatus] = useState<PublicationStatus | undefined>(undefined);
  const [selectedChannel, setSelectedChannel] = useState<PublicationChannel | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { hasPermission } = usePermissions();
  const canPublish = hasPermission(Permission.PUBLISH_CREATIVE);

  const { data: destinationsData } = useDestinations();
  const { data, isLoading, isError, error, refetch } = usePublications({
    status: selectedStatus,
    channel: selectedChannel,
    page,
    limit: 15,
  });

  const publications = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  // Compute stat counts
  const publishedCount = publications.filter(
    (p) => p.status === PublicationStatus.PUBLISHED,
  ).length;
  const pendingCount = publications.filter(
    (p) =>
      p.status === PublicationStatus.DRAFT ||
      p.status === PublicationStatus.READY ||
      p.status === PublicationStatus.QUEUED ||
      p.status === PublicationStatus.PROCESSING,
  ).length;
  const failedCount = publications.filter((p) => p.status === PublicationStatus.FAILED).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        eyebrow="Asset Distribution"
        title="Publishing & Distribution Desk"
        subtitle="Manage secure, deliberate distribution of verified content and creative assets across authorized destinations."
        actions={
          <div className="flex items-center gap-3">
            <Link to="/publishing/history">
              <Button variant="secondary">History & Audit</Button>
            </Link>
            {canPublish && (
              <Link to="/publishing/new">
                <Button variant="gold" icon={<Plus className="w-4 h-4" />}>
                  New Publication
                </Button>
              </Link>
            )}
          </div>
        }
      />

      {/* Destination Readiness Banner */}
      <Card className="p-4 bg-app-surface border border-app-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-navy-50 flex items-center justify-center text-navy-700">
              <Radio className="w-5 h-5 text-gold-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-app-primary">
                Destination Channel Readiness
              </h3>
              <p className="text-xs text-app-muted">
                External social delivery safely gated. Manual export downloads are active.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {destinationsData?.map((dest) => (
              <div
                key={dest.channel}
                className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 border ${
                  dest.enabled
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
                title={dest.reason ?? (dest.enabled ? 'Active and ready' : 'Disabled')}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    dest.enabled ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span>{dest.displayName}</span>
                <span className="text-[10px] opacity-75">
                  ({dest.enabled ? 'Active' : 'Disabled'})
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Summary Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-4 border border-app-border">
          <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-app-primary">{publishedCount}</div>
            <div className="text-xs text-app-muted font-medium">Distributed / Published</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4 border border-app-border">
          <div className="p-3 bg-amber-50 rounded-lg text-amber-600">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-app-primary">{pendingCount}</div>
            <div className="text-xs text-app-muted font-medium">Pending Confirmation</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4 border border-app-border">
          <div className="p-3 bg-rose-50 rounded-lg text-rose-600">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-app-primary">{failedCount}</div>
            <div className="text-xs text-app-muted font-medium">Failed Dispatches</div>
          </div>
        </Card>
      </div>

      {/* Filter and Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-app-surface p-3 rounded-lg border border-app-border">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-app-muted" />
            <span className="text-xs font-semibold text-app-primary uppercase tracking-wider">
              Filters:
            </span>
          </div>

          <select
            value={selectedStatus ?? ''}
            onChange={(e) => {
              setSelectedStatus(e.target.value ? (e.target.value as PublicationStatus) : undefined);
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
            value={selectedChannel ?? ''}
            onChange={(e) => {
              setSelectedChannel(
                e.target.value ? (e.target.value as PublicationChannel) : undefined,
              );
              setPage(1);
            }}
            aria-label="Filter by Channel"
            className="text-xs px-2.5 py-1.5 rounded-md border border-app-border bg-white text-app-primary focus:outline-none focus:ring-1 focus:ring-gold-500"
          >
            <option value="">All Destinations</option>
            <option value={PublicationChannel.MANUAL_EXPORT}>Manual Export</option>
            <option value={PublicationChannel.TELEGRAM_CHANNEL}>Telegram Channel</option>
            <option value={PublicationChannel.FACEBOOK_PAGE}>Facebook Page</option>
            <option value={PublicationChannel.INSTAGRAM}>Instagram</option>
          </select>
        </div>

        <div className="text-xs text-app-muted">
          Showing <span className="font-semibold text-app-primary">{publications.length}</span> of{' '}
          <span className="font-semibold text-app-primary">{total}</span> records
        </div>
      </div>

      {/* Publications Table / List */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : isError ? (
        <Card className="p-8 text-center border-rose-200 bg-rose-50/40">
          <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <div className="text-sm font-semibold text-rose-900">Failed to load publications</div>
          <div className="text-xs text-rose-700 mt-1">
            {(error as Error)?.message ?? 'An unknown error occurred'}
          </div>
          <Button variant="secondary" size="sm" onClick={() => void refetch()} className="mt-4">
            Retry
          </Button>
        </Card>
      ) : publications.length === 0 ? (
        <EmptyState
          icon={<Send className="w-10 h-10 text-app-muted" />}
          title="No Publications Found"
          description="Create your first publication request to distribute approved content and posters to supported destinations."
          action={
            canPublish ? (
              <Link to="/publishing/new">
                <Button variant="gold" icon={<Plus className="w-4 h-4" />}>
                  Distribute Asset
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="bg-white rounded-xl border border-app-border overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-app-surface border-b border-app-border text-[11px] font-semibold text-app-muted uppercase tracking-wider">
                <th className="py-3 px-4">Publication ID</th>
                <th className="py-3 px-4">Destination</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Idempotency Key</th>
                <th className="py-3 px-4">Created Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {publications.map((pub: PublicationRecord) => (
                <tr key={pub.id} className="hover:bg-app-surface/50 transition-colors">
                  <td className="py-3 px-4 font-mono font-medium text-navy-800">
                    <Link
                      to={`/publishing/${pub.id}`}
                      className="hover:underline flex items-center gap-1.5"
                    >
                      <span>{pub.id.slice(0, 8)}…</span>
                    </Link>
                  </td>
                  <td className="py-3 px-4">
                    <ChannelBadge channel={pub.destinationChannel} />
                  </td>
                  <td className="py-3 px-4">
                    <PublicationStatusBadge status={pub.status} />
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-app-muted truncate max-w-[160px]">
                    {pub.idempotencyKey}
                  </td>
                  <td className="py-3 px-4 text-app-muted">
                    {new Date(pub.createdAt).toLocaleDateString()}
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

          {/* Pagination Controls */}
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
