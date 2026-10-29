import React from 'react';
import { Edit3, History, Sparkles } from 'lucide-react';
import type { ContentVersion } from '../types/content.types.js';

interface ContentVersionHistoryProps {
  versions: ContentVersion[];
  selectedVersionId: string;
  onSelectVersion: (version: ContentVersion) => void;
}

export function ContentVersionHistory({
  versions,
  selectedVersionId,
  onSelectVersion,
}: ContentVersionHistoryProps): React.JSX.Element {
  if (versions.length <= 1) {
    return <></>;
  }

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-5 shadow-sm mb-6">
      <div className="flex items-center gap-2 pb-3 border-b border-neutral-100 dark:border-neutral-800 mb-3">
        <History className="w-4 h-4 text-neutral-500" />
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Version History ({versions.length} versions)
        </h3>
      </div>

      <div className="space-y-2">
        {versions.map((ver) => {
          const isSelected = ver.id === selectedVersionId;
          const isLatest = ver.versionNumber === versions.length;
          const isManual = Boolean(ver.revisionRequestId) || ver.versionNumber > 1;

          return (
            <button
              key={ver.id}
              type="button"
              onClick={() => onSelectVersion(ver)}
              className={`w-full flex items-center justify-between p-3 rounded-xl border text-left text-xs transition-colors ${
                isSelected
                  ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700/80 text-amber-950 dark:text-amber-100 font-medium'
                  : 'bg-neutral-50 dark:bg-neutral-800/40 border-neutral-200/60 dark:border-neutral-700/60 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {isManual ? (
                  <Edit3 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                )}
                <div>
                  <div className="font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                    Version {ver.versionNumber}
                    {isLatest && (
                      <span className="px-1.5 py-0.2 rounded bg-neutral-200 dark:bg-neutral-700 text-[10px] text-neutral-700 dark:text-neutral-300 font-normal">
                        Latest
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-[260px]">
                    {ver.structuredOutput.headline}
                  </div>
                </div>
              </div>

              <div className="text-right text-[11px] text-neutral-400">
                {new Date(ver.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
