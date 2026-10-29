import React from 'react';
import { Badge, type BadgeVariant } from '../../../components/ui/badge.js';
import type { PublicationStatus } from '../types/publishing.types.js';

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: 'Draft', variant: 'neutral' },
  READY: { label: 'Ready', variant: 'navy' },
  QUEUED: { label: 'Queued', variant: 'gold' },
  PROCESSING: { label: 'Processing', variant: 'warn' },
  PUBLISHED: { label: 'Published', variant: 'good' },
  FAILED: { label: 'Failed', variant: 'bad' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
  UNKNOWN_OUTCOME: { label: 'Unknown Outcome', variant: 'warn' },
};

interface PublicationStatusBadgeProps {
  readonly status: PublicationStatus;
  readonly className?: string;
}

export const PublicationStatusBadge: React.FC<PublicationStatusBadgeProps> = ({
  status,
  className,
}) => {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: 'neutral' as const };
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
};
