import React from 'react';
import { History, GitCommit } from 'lucide-react';
import type { CreativeSceneVersionRecord } from '../types/creative.types.js';

export interface CreativeVersionHistoryProps {
  readonly versions: readonly CreativeSceneVersionRecord[];
  readonly currentVersionNumber: number;
  readonly onSelectVersion?: (versionNumber: number) => void;
}

export const CreativeVersionHistory: React.FC<CreativeVersionHistoryProps> = ({
  versions,
  currentVersionNumber,
  onSelectVersion,
}) => {
  // Sort descending by versionNumber
  const sortedVersions = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);

  return (
    <div className="flex flex-col h-full bg-app-surface border border-app-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-app-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-app-muted" />
          <span className="text-xs font-semibold text-app-primary uppercase tracking-wider">
            Immutable Revision Ledger ({versions.length})
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sortedVersions.map((ver) => {
          const isCurrent = ver.versionNumber === currentVersionNumber;

          return (
            <div
              key={ver.id}
              data-testid={`version-item-${ver.versionNumber}`}
              onClick={() => onSelectVersion?.(ver.versionNumber)}
              className={`p-3.5 rounded-xl border transition-all text-xs ${
                isCurrent
                  ? 'border-brand-burgundy bg-brand-burgundy/5 ring-1 ring-brand-burgundy'
                  : 'border-app-border bg-app-surface hover:border-app-muted/60 cursor-pointer'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold font-mono text-sm text-app-primary">
                    v{ver.versionNumber}
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-burgundy text-white uppercase">
                      Current Active
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-app-muted font-mono">
                  {new Date(ver.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded bg-app-surface-subtle text-[10px] font-mono font-medium text-app-muted border border-app-border">
                  {ver.operationCode}
                </span>
                <span className="text-[11px] text-app-muted font-mono">
                  {ver.layers.length} layers
                </span>
              </div>

              <p className="text-xs text-app-primary leading-relaxed line-clamp-2">
                {ver.changeReason || 'Scene layout modifications.'}
              </p>

              <div className="mt-2.5 pt-2 border-t border-app-border/40 text-[10px] font-mono text-app-muted flex items-center justify-between truncate">
                <span className="truncate">Hash: {ver.sceneHash.substring(0, 12)}...</span>
                <GitCommit className="w-3 h-3 shrink-0 ml-1 opacity-50" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
