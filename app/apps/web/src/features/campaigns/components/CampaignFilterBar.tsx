import React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '../../../components/ui/input.js';
import type { CampaignStatus } from '../types/campaign.types.js';

export interface CampaignFilterBarProps {
  readonly search: string;
  readonly onSearchChange: (search: string) => void;
  readonly selectedStatus?: CampaignStatus;
  readonly onStatusChange: (status: CampaignStatus | undefined) => void;
  readonly onReset: () => void;
  readonly hasActiveFilters: boolean;
}

const STATUS_OPTIONS: Array<{ label: string; value: CampaignStatus | undefined }> = [
  { label: 'All Statuses', value: undefined },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Planned', value: 'PLANNED' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Archived', value: 'ARCHIVED' },
];

export const CampaignFilterBar: React.FC<CampaignFilterBarProps> = ({
  search,
  onSearchChange,
  selectedStatus,
  onStatusChange,
  onReset,
  hasActiveFilters,
}) => {
  return (
    <div className="bg-app-surface p-4 rounded-xl border border-app-border shadow-subtle mb-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-app-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            type="search"
            placeholder="Search campaigns by code, name, or objective..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-4 h-10 w-full"
          />
        </div>

        {/* Reset button if active filters */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 text-xs text-app-muted hover:text-app-primary py-1.5 px-3 rounded-lg border border-app-border hover:bg-app-surface-subtle transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            <span>Reset Filters</span>
          </button>
        )}
      </div>

      {/* Status Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar border-t border-app-border/40">
        <span className="text-xs font-semibold text-app-muted mr-1 shrink-0">Status:</span>
        {STATUS_OPTIONS.map((option) => {
          const isSelected = selectedStatus === option.value;
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => onStatusChange(option.value)}
              className={`px-3 py-1 text-xs rounded-full font-medium transition-all shrink-0 select-none ${
                isSelected
                  ? 'bg-navy-900 text-white shadow-sm'
                  : 'bg-app-surface-subtle text-app-muted hover:text-app-primary hover:bg-[#EAE9E4] border border-app-border/70'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
