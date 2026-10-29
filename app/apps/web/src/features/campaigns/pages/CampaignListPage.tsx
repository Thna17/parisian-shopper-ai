import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Layers, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '../../../components/navigation/page-header.js';
import { Button } from '../../../components/ui/button.js';
import { Skeleton } from '../../../components/ui/skeleton.js';
import { EmptyState } from '../../../components/ui/empty-state.js';
import { CampaignCard } from '../components/CampaignCard.js';
import { CampaignFilterBar } from '../components/CampaignFilterBar.js';
import { useCampaigns } from '../hooks/use-campaigns.js';
import { usePermissions } from '../../auth/hooks/use-permissions.js';
import { Permission } from '../../../types/auth.types.js';
import type { CampaignStatus } from '../types/campaign.types.js';

export const CampaignListPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<CampaignStatus | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(Permission.CREATE_CONTENT);

  const { data, isLoading, isError, error, refetch } = useCampaigns({
    search: search.trim() || undefined,
    status: selectedStatus,
    page,
    limit: 12,
  });

  const campaigns = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const totalItems = data?.total ?? 0;

  const handleSearchChange = (newSearch: string) => {
    setSearch(newSearch);
    setPage(1);
  };

  const handleStatusChange = (newStatus: CampaignStatus | undefined) => {
    setSelectedStatus(newStatus);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setSelectedStatus(undefined);
    setPage(1);
  };

  const hasActiveFilters = Boolean(search.trim()) || selectedStatus !== undefined;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Commercial Orchestration"
        title="Campaign Management"
        subtitle="Coordinate marketing initiatives, align verified luxury products with proposed promo targets, and transition through commercial lifecycles."
        actions={
          canCreate ? (
            <Link to="/campaigns/new">
              <Button variant="gold" icon={<Plus className="w-4 h-4" />}>
                Create Campaign
              </Button>
            </Link>
          ) : undefined
        }
      />

      {/* Filter Bar */}
      <CampaignFilterBar
        search={search}
        onSearchChange={handleSearchChange}
        selectedStatus={selectedStatus}
        onStatusChange={handleStatusChange}
        onReset={handleResetFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Loading Skeletons */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="p-5 rounded-xl border border-app-border bg-app-surface space-y-4"
            >
              <div className="flex justify-between items-center">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-10 w-full" />
              <div className="pt-3 border-t border-app-border/60 flex justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="p-6 rounded-xl bg-status-bad/10 border border-status-bad/20 text-center my-6">
          <AlertCircle className="w-8 h-8 text-status-bad mx-auto mb-2" />
          <h3 className="text-sm font-bold text-app-primary">Failed to load campaigns</h3>
          <p className="text-xs text-app-muted mt-1 max-w-md mx-auto">
            {error?.message || 'An unexpected error occurred while communicating with the server.'}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void refetch()}
            className="mt-4"
          >
            Retry Request
          </Button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && campaigns.length === 0 && (
        <EmptyState
          icon={<Layers className="w-10 h-10 text-app-muted" />}
          title={hasActiveFilters ? 'No matching campaigns' : 'No campaigns yet'}
          description={
            hasActiveFilters
              ? 'Try adjusting your search terms or status filters to locate campaigns.'
              : 'Create your first marketing campaign to organize product promotions and generate high-converting creative scenes.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="secondary" size="sm" onClick={handleResetFilters}>
                Clear All Filters
              </Button>
            ) : canCreate ? (
              <Link to="/campaigns/new">
                <Button variant="gold" size="sm" icon={<Plus className="w-4 h-4" />}>
                  Create First Campaign
                </Button>
              </Link>
            ) : undefined
          }
        />
      )}

      {/* Campaign Grid */}
      {!isLoading && !isError && campaigns.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {campaigns.map((camp) => (
              <CampaignCard key={camp.id} campaign={camp} />
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-8 border-t border-app-border/70 mt-8">
              <span className="text-xs text-app-muted">
                Showing {campaigns.length} of {totalItems} total campaigns
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  icon={<ChevronLeft className="w-4 h-4" />}
                >
                  Previous
                </Button>
                <span className="text-xs font-semibold px-2 text-app-primary">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  icon={<ChevronRight className="w-4 h-4" />}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
