import React from 'react';
import { AlertCircle, CheckCircle2, Clock, Cpu, Loader2, Sparkles } from 'lucide-react';
import type { ContentJobStatus, GenerationAttempt } from '../types/content.types.js';

interface GenerationProgressCardProps {
  status: ContentJobStatus;
  attempts: GenerationAttempt[];
  onRetry?: () => void;
}

export function GenerationProgressCard({
  status,
  attempts,
}: GenerationProgressCardProps): React.JSX.Element {
  const latestAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;

  if (status === 'REQUESTED') {
    return (
      <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 rounded-xl p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="p-2.5 bg-amber-100 dark:bg-amber-900/40 rounded-lg text-amber-700 dark:text-amber-300">
            <Clock className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Queued in BullMQ Workflow
            </h3>
            <p className="text-xs text-amber-700 dark:text-amber-300/80 mt-1">
              Generation job has been safely enqueued to queue{' '}
              <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">
                CONTENT_GENERATION
              </code>
              . A background worker will claim the lease and generate luxury draft copy shortly.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'GENERATING') {
    return (
      <div className="bg-gold-50/60 dark:bg-amber-950/30 border border-gold-300/60 dark:border-amber-700/60 rounded-xl p-5 mb-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-2.5 bg-gold-100 dark:bg-amber-900/50 rounded-lg text-gold-800 dark:text-amber-300">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Synthesizing Luxury Marketing Copy...
              </h3>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                Attempt #{latestAttempt?.attemptNumber ?? 1}
              </span>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1">
              Executing brand-safe text synthesis with strictly uncorrupted catalog MSRP facts and
              strategy constraints.
            </p>
            {latestAttempt && (
              <div className="mt-3 flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
                <span className="flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-neutral-400" />
                  Provider:{' '}
                  <span className="font-medium text-neutral-700 dark:text-neutral-200">
                    {latestAttempt.provider}
                  </span>{' '}
                  ({latestAttempt.model})
                </span>
                <span>•</span>
                <span>Prompt Context v{latestAttempt.promptVersion}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (status === 'FAILED') {
    return (
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-xl p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="p-2.5 bg-red-100 dark:bg-red-900/40 rounded-lg text-red-600 dark:text-red-400">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-900 dark:text-red-200">
              Content Generation Encountered an Issue
            </h3>
            <p className="text-xs text-red-700 dark:text-red-300 mt-1">
              {latestAttempt?.errorCode ?? 'The AI generation attempt could not be completed.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 rounded-xl px-4 py-3 mb-6 flex items-center justify-between text-xs">
      <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-medium">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        AI Generation Lease Succeeded
      </div>
      {latestAttempt && (
        <div className="text-neutral-500 dark:text-neutral-400 flex items-center gap-3">
          <span>
            Engine: {latestAttempt.provider} / {latestAttempt.model}
          </span>
          <span>•</span>
          <span>Attempt #{latestAttempt.attemptNumber}</span>
        </div>
      )}
    </div>
  );
}
