import React, { type HTMLAttributes } from 'react';

export type BadgeVariant = 'gold' | 'good' | 'warn' | 'bad' | 'neutral' | 'navy';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly variant?: BadgeVariant;
  readonly dot?: boolean;
}

const variantStyles: Record<BadgeVariant, { pill: string; dot: string }> = {
  gold: {
    pill: 'bg-[#B59761]/12 text-[#9A7D45] dark:text-[#D6BC87] border-[#B59761]/25',
    dot: 'bg-[#B59761]',
  },
  good: {
    pill: 'bg-[#23856B]/12 text-[#1C6C57] dark:text-[#58B79A] border-[#23856B]/25',
    dot: 'bg-[#23856B]',
  },
  warn: {
    pill: 'bg-[#B67C27]/12 text-[#99651D] dark:text-[#E0A64F] border-[#B67C27]/25',
    dot: 'bg-[#B67C27]',
  },
  bad: {
    pill: 'bg-[#C25656]/12 text-[#A54343] dark:text-[#E98181] border-[#C25656]/25',
    dot: 'bg-[#C25656]',
  },
  neutral: {
    pill: 'bg-app-surface-subtle text-app-muted border-app-border',
    dot: 'bg-app-muted',
  },
  navy: {
    pill: 'bg-navy-900/10 text-navy-900 dark:text-[#C9D7D8] border-navy-900/20',
    dot: 'bg-navy-900',
  },
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  dot = false,
  className = '',
  children,
  ...props
}) => {
  const styles = variantStyles[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide border select-none ${styles.pill} ${className}`}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} aria-hidden="true" />}
      {children}
    </span>
  );
};
