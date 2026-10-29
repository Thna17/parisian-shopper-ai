import React from 'react';
import { GitCompare, ArrowRight } from 'lucide-react';
import type { ReviewDeskDetail } from '../types/approvals.types.js';

interface VersionComparisonPanelProps {
  currentVersion: ReviewDeskDetail['targetVersion'];
  allVersions: ReviewDeskDetail['versions'];
}

export const VersionComparisonPanel: React.FC<VersionComparisonPanelProps> = ({
  currentVersion,
  allVersions,
}) => {
  if (currentVersion.versionNumber <= 1) {
    return null;
  }

  const previousVersion = allVersions.find(
    (v) => v.versionNumber === currentVersion.versionNumber - 1,
  );

  if (!previousVersion) {
    return null;
  }

  return (
    <div
      data-testid="version-comparison-panel"
      className="rounded-xl border border-white/10 bg-zinc-900/60 p-5 space-y-4"
    >
      <div className="flex items-center gap-2 border-b border-white/5 pb-3">
        <GitCompare className="h-4 w-4 text-amber-400" />
        <h3 className="text-xs font-semibold tracking-wider text-amber-400 uppercase">
          Version Revision Diff (v{previousVersion.versionNumber} → v{currentVersion.versionNumber})
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Previous Version */}
        <div className="rounded-lg border border-white/5 bg-black/40 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-xs font-semibold text-zinc-400">
              Version {previousVersion.versionNumber} (Previous)
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">
              {new Date(previousVersion.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-zinc-500 text-[10px] uppercase block">Headline</span>
              <p className="text-zinc-300 font-medium">{previousVersion.headline}</p>
            </div>
            {previousVersion.englishCaption && (
              <div>
                <span className="text-zinc-500 text-[10px] uppercase block">Caption</span>
                <p className="text-zinc-400 line-clamp-3">{previousVersion.englishCaption}</p>
              </div>
            )}
            {previousVersion.cta && (
              <div>
                <span className="text-zinc-500 text-[10px] uppercase block">CTA</span>
                <p className="text-zinc-300">{previousVersion.cta}</p>
              </div>
            )}
          </div>
        </div>

        {/* Current Version */}
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-amber-500/10 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-amber-400">
                Version {currentVersion.versionNumber} (Target Under Review)
              </span>
              <ArrowRight className="h-3 w-3 text-amber-400" />
            </div>
            <span className="text-[10px] text-amber-400/80 font-mono">
              {new Date(currentVersion.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-amber-500/80 text-[10px] uppercase block">Headline</span>
              <p className="text-white font-medium">{currentVersion.headline}</p>
            </div>
            {currentVersion.englishCaption && (
              <div>
                <span className="text-amber-500/80 text-[10px] uppercase block">Caption</span>
                <p className="text-zinc-200 line-clamp-3">{currentVersion.englishCaption}</p>
              </div>
            )}
            {currentVersion.cta && (
              <div>
                <span className="text-amber-500/80 text-[10px] uppercase block">CTA</span>
                <p className="text-zinc-200">{currentVersion.cta}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
