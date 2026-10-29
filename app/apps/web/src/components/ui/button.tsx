import React, { type ButtonHTMLAttributes } from 'react';
import { Spinner } from './spinner.js';

export type ButtonVariant = 'primary' | 'secondary' | 'gold' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly isLoading?: boolean;
  readonly icon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-navy-900 text-white hover:bg-[#1a2833] active:bg-[#152029] border border-transparent shadow-subtle',
  secondary:
    'bg-app-surface text-app-primary border border-app-border hover:bg-app-surface-subtle active:bg-[#EAE9E4] shadow-subtle',
  gold: 'bg-gold-500 text-white hover:bg-gold-400 active:bg-[#9d814d] border border-transparent shadow-subtle',
  ghost:
    'bg-transparent text-app-muted hover:text-app-primary hover:bg-app-surface-subtle active:bg-[#EAE9E4] border border-transparent',
  destructive:
    'bg-status-bad text-white hover:bg-[#b04a4a] active:bg-[#993e3e] border border-transparent shadow-subtle',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-[9px]',
  md: 'h-10 px-4 text-sm gap-2 rounded-[11px]',
  lg: 'h-12 px-5 text-base gap-2.5 rounded-xl font-medium',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    isLoading = false,
    icon,
    disabled = false,
    className = '',
    children,
    ...props
  },
  ref,
) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      aria-busy={isLoading}
      className={`inline-flex items-center justify-center font-medium transition-all duration-150 select-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-gold-500 focus-visible:outline-offset-2 ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {isLoading ? <Spinner size={size === 'sm' ? 'sm' : 'md'} className="text-current" /> : icon}
      {children}
    </button>
  );
});
