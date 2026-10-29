import React from 'react';
import { Loader2 } from 'lucide-react';
import type { ContentJobStatus } from '../types/content.types.js';

interface ContentJobStatusBadgeProps {
  status: ContentJobStatus;
  className?: string;
}

export function ContentJobStatusBadge({
  status,
  className = '',
}: ContentJobStatusBadgeProps): React.JSX.Element {
  switch (status) {
    case 'REQUESTED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-pulse" />
          Queued
        </span>
      );
    case 'GENERATING':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-900 border border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800 ${className}`}
        >
          <Loader2 className="w-3 h-3 animate-spin text-amber-600 dark:text-amber-400" />
          Generating AI Copy
        </span>
      );
    case 'DRAFT':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          Draft Copy
        </span>
      );
    case 'UNDER_REVIEW':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-800 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800 ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
          Under Review
        </span>
      );
    case 'REVISION_REQUESTED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-800 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800 ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          Revision Requested
        </span>
      );
    case 'APPROVED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Approved
        </span>
      );
    case 'REJECTED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          Rejected
        </span>
      );
    case 'FAILED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800 ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          Failed
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800 border border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700 ${className}`}
        >
          {status}
        </span>
      );
  }
}
