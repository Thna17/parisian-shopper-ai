import React, { type InputHTMLAttributes, useId } from 'react';
import { Label } from './label.js';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label?: string;
  readonly error?: string;
  readonly hint?: string;
  readonly prefixIcon?: React.ReactNode;
  readonly suffixIcon?: React.ReactNode;
  readonly isKhmer?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    error,
    hint,
    prefixIcon,
    suffixIcon,
    isKhmer = false,
    id: explicitId,
    required,
    disabled,
    className = '',
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const inputId = explicitId ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div className="w-full">
      {label && (
        <Label htmlFor={inputId} required={required}>
          {label}
        </Label>
      )}

      <div className="relative flex items-center">
        {prefixIcon && (
          <div className="absolute left-3.5 flex items-center pointer-events-none text-app-muted">
            {prefixIcon}
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          required={required}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={`w-full h-11 px-3.5 bg-app-surface text-app-primary border rounded-[11px] text-sm transition-all duration-150 placeholder:text-app-muted/60 focus:bg-white disabled:opacity-50 disabled:bg-app-surface-subtle disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-gold-500 focus-visible:outline-offset-1 ${
            prefixIcon ? 'pl-10' : ''
          } ${suffixIcon ? 'pr-10' : ''} ${
            error
              ? 'border-status-bad focus:border-status-bad'
              : 'border-app-border focus:border-app-primary'
          } ${isKhmer ? 'font-khmer leading-relaxed' : ''} ${className}`}
          {...props}
        />

        {suffixIcon && (
          <div className="absolute right-3 flex items-center text-app-muted">{suffixIcon}</div>
        )}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-status-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-app-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
