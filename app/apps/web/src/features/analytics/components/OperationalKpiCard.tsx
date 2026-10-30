import React from 'react';

interface OperationalKpiCardProps {
  readonly title: string;
  readonly value: string | number;
  readonly subtitle?: string;
  readonly icon?: React.ReactNode;
  readonly trend?: 'positive' | 'negative' | 'neutral';
  readonly badgeText?: string;
  readonly className?: string;
  readonly testId?: string;
}

export const OperationalKpiCard: React.FC<OperationalKpiCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  badgeText,
  className,
  testId,
}) => {
  return (
    <div
      data-testid={testId ?? `kpi-card-${title.toLowerCase().replace(/\s+/g, '-')}`}
      className={`bg-white rounded-xl border border-app-border p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden ${
        className ?? ''
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-app-muted truncate">
          {title}
        </span>
        {icon && (
          <div className="w-8 h-8 rounded-lg bg-app-surface-subtle border border-app-border/80 flex items-center justify-center text-navy-800">
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-navy-950 font-serif">{value}</span>
        {badgeText && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-gold-50 text-gold-800 border border-gold-200">
            {badgeText}
          </span>
        )}
      </div>

      {subtitle && <p className="mt-1.5 text-xs text-app-muted truncate">{subtitle}</p>}
    </div>
  );
};
