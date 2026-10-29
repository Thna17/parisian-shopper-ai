import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Globe, Plus, RefreshCw, Sparkles } from 'lucide-react';

import { useContentJobs } from '../hooks/use-content.js';
import type { ContentJobStatus } from '../types/content.types.js';
import { ContentJobStatusBadge } from '../components/ContentJobStatusBadge.js';

export function ContentJobsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [selectedStatus, setSelectedStatus] = useState<ContentJobStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch, isFetching } = useContentJobs({
    page,
    limit: 20,
    status: selectedStatus === 'ALL' ? undefined : selectedStatus,
  });

  const jobs = data?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-serif font-semibold text-neutral-900 dark:text-neutral-50 tracking-tight">
              AI Content Studio
            </h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800/60">
              Luxury Copy
            </span>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Generate and refine brand-safe multilingual marketing copy with strict factual MSRP
            truth.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="p-2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            title="Refresh jobs"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>

          <Link
            to="/content/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-amber-600 dark:hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Generate New Content
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-neutral-200 dark:border-neutral-800 text-xs">
        {(
          [
            { label: 'All Jobs', value: 'ALL' },
            { label: 'Generating', value: 'GENERATING' },
            { label: 'Drafts', value: 'DRAFT' },
            { label: 'Under Review', value: 'UNDER_REVIEW' },
            { label: 'Approved', value: 'APPROVED' },
            { label: 'Failed', value: 'FAILED' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setSelectedStatus(tab.value);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              selectedStatus === tab.value
                ? 'bg-neutral-900 text-white dark:bg-amber-600 dark:text-white'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Jobs Table / Grid */}
      {isLoading ? (
        <div className="py-20 text-center text-sm text-neutral-500">
          Loading content studio jobs...
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            No Content Jobs Found
          </h3>
          <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
            {selectedStatus === 'ALL'
              ? 'Start by creating your first AI generation job with a verified product snapshot.'
              : `No content jobs currently in ${selectedStatus} status.`}
          </p>
          <div className="mt-6">
            <Link
              to="/content/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-amber-600 dark:hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Generate Content Now
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {jobs.map((job) => (
              <div
                key={job.id}
                onClick={() => navigate(`/content/jobs/${job.id}`)}
                className="p-5 hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <ContentJobStatusBadge status={job.status} />
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 font-mono">
                      {job.contentType.replace('_', ' ')}
                    </span>
                    <span className="text-neutral-300 dark:text-neutral-700">•</span>
                    <span className="text-xs font-mono text-neutral-500">
                      Channel: {job.platform}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-neutral-400" />
                    Snapshot:{' '}
                    <span className="font-mono text-xs">
                      {job.productSnapshotId.slice(0, 8)}...
                    </span>
                  </h3>

                  {job.campaignContext && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1 italic">
                      “{job.campaignContext}”
                    </p>
                  )}
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between text-xs text-neutral-400 shrink-0">
                  <div className="flex items-center gap-1.5 font-medium text-neutral-600 dark:text-neutral-300">
                    <Globe className="w-3.5 h-3.5 text-neutral-400" />
                    {job.language}
                  </div>
                  <span className="mt-1">
                    {new Date(job.createdAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
