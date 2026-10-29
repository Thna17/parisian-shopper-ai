import React from 'react';
import { Badge, type BadgeVariant } from '../../../components/ui/badge.js';
import type { CampaignStatus } from '../types/campaign.types.js';

interface StatusConfig {
  label: string;
  variant: BadgeVariant;
}

const STATUS_CONFIG: Record<CampaignStatus, StatusConfig> = {
  DRAFT: {
    label: 'Draft',
    variant: 'neutral',
  },
  PLANNED: {
    label: 'Planned',
    variant: 'navy',
  },
  ACTIVE: {
    label: 'Active Live',
    variant: 'good',
  },
  COMPLETED: {
    label: 'Completed',
    variant: 'gold',
  },
  ARCHIVED: {
    label: 'Archived',
    variant: 'neutral',
  },
};

export interface CampaignStatusBadgeProps {
  readonly status: CampaignStatus;
  readonly className?: string;
}

export const CampaignStatusBadge: React.FC<CampaignStatusBadgeProps> = ({
  status,
  className = '',
}) => {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: 'neutral' };

  return (
    <Badge variant={config.variant} dot className={className}>
      {config.label}
    </Badge>
  );
};
