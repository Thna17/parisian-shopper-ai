import React, { type HTMLAttributes } from 'react';

export interface AppLogoProps extends HTMLAttributes<HTMLDivElement> {
  readonly collapsed?: boolean;
  readonly size?: 'sm' | 'md' | 'lg';
}

export const AppLogo: React.FC<AppLogoProps> = ({
  collapsed = false,
  size = 'md',
  className = '',
  ...props
}) => {
  const markSize =
    size === 'sm'
      ? 'w-7 h-7 text-lg rounded-[8px]'
      : size === 'lg'
        ? 'w-11 h-11 text-3xl rounded-[14px]'
        : 'w-9 h-9 text-2xl rounded-[11px]';

  return (
    <div className={`flex items-center gap-3 select-none ${className}`} {...props}>
      <div
        className={`${markSize} bg-navy-900 text-[#D4BD87] font-serif font-bold flex items-center justify-center shrink-0 shadow-subtle`}
        aria-hidden="true"
      >
        P
      </div>
      {!collapsed && (
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-extrabold text-app-primary tracking-tight leading-tight whitespace-nowrap">
            Parisian Shopper AI
          </span>
          <span className="text-[10px] text-app-muted uppercase tracking-[0.14em] font-semibold mt-0.5 whitespace-nowrap">
            Luxury Retail Marketing
          </span>
        </div>
      )}
    </div>
  );
};
