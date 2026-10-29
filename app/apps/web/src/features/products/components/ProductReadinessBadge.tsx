import React from 'react';
import { Badge, type BadgeVariant } from '../../../components/ui/badge.js';

export interface ProductReadinessBadgeProps {
  readonly state?: 'FRESH' | 'AGING' | 'STALE' | 'INVALID' | 'UNASSESSED' | string;
  readonly isReadyForContent?: boolean;
  readonly className?: string;
}

export const ProductReadinessBadge: React.FC<ProductReadinessBadgeProps> = ({
  state = 'UNASSESSED',
  isReadyForContent,
  className = '',
}) => {
  let variant: BadgeVariant = 'neutral';
  let label = 'Unassessed';

  switch (state.toUpperCase()) {
    case 'FRESH':
      variant = 'good';
      label = isReadyForContent ? 'Ready for Studio' : 'Facts Fresh';
      break;
    case 'AGING':
      variant = 'warn';
      label = 'Revalidation Due';
      break;
    case 'STALE':
      variant = 'warn';
      label = 'Stale Facts';
      break;
    case 'INVALID':
      variant = 'bad';
      label = 'Facts Invalid';
      break;
    default:
      variant = 'neutral';
      label = 'Pending Audit';
      break;
  }

  return (
    <Badge variant={variant} dot className={`text-[11px] ${className}`}>
      {label}
    </Badge>
  );
};
