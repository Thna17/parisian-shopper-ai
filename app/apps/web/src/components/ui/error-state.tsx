import React, { type HTMLAttributes } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from './button.js';

export interface ErrorStateProps extends HTMLAttributes<HTMLDivElement> {
  readonly title?: string;
  readonly message?: string;
  readonly onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message = 'An unexpected error occurred while loading this view.',
  onRetry,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 border border-status-bad/20 rounded-xl bg-status-bad/5 ${className}`}
      {...props}
    >
      <div className="w-12 h-12 rounded-full bg-app-surface border border-status-bad/30 flex items-center justify-center text-status-bad mb-3 shadow-subtle">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h4 className="text-sm font-semibold text-app-primary mb-1">{title}</h4>
      <p className="text-xs text-app-muted max-w-sm mb-4 leading-relaxed">{message}</p>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          icon={<RotateCcw className="w-3.5 h-3.5" />}
        >
          Try again
        </Button>
      )}
    </div>
  );
};
