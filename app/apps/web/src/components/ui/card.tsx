import React, { type HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly elevation?: 'flat' | 'subtle' | 'elevated';
}

const elevationMap = {
  flat: 'border border-app-border shadow-none',
  subtle: 'border border-app-border shadow-subtle',
  elevated: 'border border-app-border shadow-elevated',
};

export const Card: React.FC<CardProps> = ({
  elevation = 'subtle',
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`bg-app-surface rounded-xl overflow-hidden transition-shadow ${elevationMap[elevation]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`p-5 pb-3 border-b border-app-border/60 flex items-center justify-between gap-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardTitle: React.FC<HTMLAttributes<HTMLHeadingElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <h3
      className={`text-base font-semibold text-app-primary tracking-tight leading-snug ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
};

export const CardDescription: React.FC<HTMLAttributes<HTMLParagraphElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <p className={`text-xs text-app-muted mt-0.5 ${className}`} {...props}>
      {children}
    </p>
  );
};

export const CardContent: React.FC<HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`p-5 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const CardFooter: React.FC<HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`p-4 bg-app-surface-subtle/50 border-t border-app-border flex items-center justify-end gap-3 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
