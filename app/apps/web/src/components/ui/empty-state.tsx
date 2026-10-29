import React, { type HTMLAttributes } from 'react';
import { PackageOpen } from 'lucide-react';

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  readonly icon?: React.ReactNode;
  readonly title: string;
  readonly description?: string;
  readonly action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 border border-dashed border-app-border rounded-xl bg-app-surface-subtle/30 ${className}`}
      {...props}
    >
      <div className="w-12 h-12 rounded-full bg-app-surface border border-app-border flex items-center justify-center text-app-muted mb-3 shadow-subtle">
        {icon ?? <PackageOpen className="w-6 h-6" />}
      </div>
      <h4 className="text-sm font-semibold text-app-primary mb-1">{title}</h4>
      {description && <p className="text-xs text-app-muted max-w-sm mb-4">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
};
