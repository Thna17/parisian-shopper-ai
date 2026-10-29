import React, { type LabelHTMLAttributes } from 'react';

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  readonly required?: boolean;
}

export const Label: React.FC<LabelProps> = ({
  required = false,
  className = '',
  children,
  ...props
}) => {
  return (
    <label
      className={`block text-xs font-semibold uppercase tracking-wider text-app-muted mb-1.5 ${className}`}
      {...props}
    >
      {children}
      {required && (
        <span className="text-status-bad ml-0.5" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
};
