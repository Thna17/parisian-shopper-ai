import React, { type HTMLAttributes } from 'react';

export interface PageHeaderProps extends HTMLAttributes<HTMLDivElement> {
  readonly eyebrow?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  subtitle,
  actions,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-app-border/70 mb-6 ${className}`}
      {...props}
    >
      <div>
        {eyebrow && (
          <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-gold-500 mb-1">
            {eyebrow}
          </div>
        )}
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-app-primary leading-tight">
          {title}
        </h1>
        {subtitle && <p className="text-xs sm:text-sm text-app-muted mt-1 max-w-2xl">{subtitle}</p>}
      </div>

      {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
};
