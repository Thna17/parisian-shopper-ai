import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Package, ArrowRight, User } from 'lucide-react';
import { Card } from '../../../components/ui/card.js';
import { CampaignStatusBadge } from './CampaignStatusBadge.js';
import type { CampaignSummary } from '../types/campaign.types.js';

export interface CampaignCardProps {
  readonly campaign: CampaignSummary;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Unscheduled';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Invalid Date';
  }
}

export const CampaignCard: React.FC<CampaignCardProps> = ({ campaign }) => {
  const scheduleText =
    campaign.startDate && campaign.endDate
      ? `${formatDate(campaign.startDate)} – ${formatDate(campaign.endDate)}`
      : campaign.startDate
        ? `Starts ${formatDate(campaign.startDate)}`
        : 'No schedule set';

  return (
    <Card
      elevation="subtle"
      className="group hover:border-gold-500/40 hover:shadow-elevated transition-all duration-200 flex flex-col justify-between"
    >
      <div className="p-5 flex-1 flex flex-col">
        {/* Header: Code & Status */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-gold-500 dark:text-gold-400">
            {campaign.code}
          </span>
          <CampaignStatusBadge status={campaign.status} />
        </div>

        {/* Title */}
        <Link
          to={`/campaigns/${campaign.id}`}
          className="text-base font-bold text-app-primary hover:text-gold-500 transition-colors line-clamp-1 mb-2"
        >
          {campaign.name}
        </Link>

        {/* Objective */}
        <p className="text-xs text-app-muted line-clamp-2 leading-relaxed mb-4 flex-1">
          {campaign.objective}
        </p>

        {/* Hero Product if assigned */}
        {campaign.heroProductTitle && (
          <div className="mb-4 px-2.5 py-1.5 rounded-lg bg-app-surface-subtle border border-app-border/70 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gold-500 shrink-0">
              Hero
            </span>
            <span className="text-xs text-app-primary font-medium truncate">
              {campaign.heroProductTitle}
            </span>
            {campaign.heroProductSku && (
              <span className="text-[10px] font-mono text-app-muted shrink-0">
                ({campaign.heroProductSku})
              </span>
            )}
          </div>
        )}

        {/* Metadata Footer: Schedule, Products Count, Creator */}
        <div className="pt-3 border-t border-app-border/60 space-y-2 text-xs text-app-muted">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 truncate">
              <Calendar className="w-3.5 h-3.5 shrink-0 text-app-muted" />
              <span className="truncate">{scheduleText}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0 font-medium text-app-primary">
              <Package className="w-3.5 h-3.5 text-app-muted" />
              <span>
                {campaign.productCount} {campaign.productCount === 1 ? 'product' : 'products'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5 truncate text-[11px]">
              <User className="w-3 h-3 shrink-0 text-app-muted" />
              <span className="truncate">
                {campaign.createdByDisplayName || 'Commercial Merchandiser'}
              </span>
            </div>

            <Link
              to={`/campaigns/${campaign.id}`}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-gold-500 hover:text-gold-400 transition-colors"
            >
              <span>Manage</span>
              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
};
