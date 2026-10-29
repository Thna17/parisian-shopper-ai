import React, { useState } from 'react';
import { Check, Copy, Edit3, MessageSquare, Tag } from 'lucide-react';
import type { ContentVersion } from '../types/content.types.js';

interface ContentPreviewPanelProps {
  version: ContentVersion;
  onStartEditing?: () => void;
  canEdit?: boolean;
}

export function ContentPreviewPanel({
  version,
  onStartEditing,
  canEdit = true,
}: ContentPreviewPanelProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (): Promise<void> => {
    const textToCopy = [
      version.structuredOutput.headline,
      '',
      version.structuredOutput.english_caption ?? '',
      '',
      version.structuredOutput.khmer_caption ?? '',
      '',
      `👉 ${version.structuredOutput.cta}`,
      '',
      version.structuredOutput.hashtags.join(' '),
    ]
      .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
      .join('\n');

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback or ignore
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-6 shadow-sm mb-6">
      <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Generated Studio Copy
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-mono">
            v{version.versionNumber}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyToClipboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-lg transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy Text
              </>
            )}
          </button>

          {canEdit && onStartEditing && (
            <button
              type="button"
              onClick={onStartEditing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-200 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 border border-amber-200/80 dark:border-amber-800/80 rounded-lg transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              Revise Copy
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-5">
        {/* Headline */}
        <div>
          <label className="block text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-1.5">
            Headline
          </label>
          <div className="text-lg font-serif font-medium text-neutral-900 dark:text-neutral-50 leading-snug">
            {version.structuredOutput.headline}
          </div>
        </div>

        {/* English Caption */}
        {version.structuredOutput.english_caption && (
          <div>
            <label className="block text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-1.5">
              English Caption
            </label>
            <div className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
              {version.structuredOutput.english_caption}
            </div>
          </div>
        )}

        {/* Khmer Caption */}
        {version.structuredOutput.khmer_caption && (
          <div>
            <label className="block text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-1.5">
              Khmer Caption (អត្ថបទភាសាខ្មែរ)
            </label>
            <div className="text-sm font-sans text-neutral-800 dark:text-neutral-200 leading-relaxed whitespace-pre-wrap">
              {version.structuredOutput.khmer_caption}
            </div>
          </div>
        )}

        {/* Call To Action */}
        <div>
          <label className="block text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-1.5">
            Call To Action (CTA)
          </label>
          <div className="inline-block px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm font-medium text-amber-700 dark:text-amber-300">
            {version.structuredOutput.cta}
          </div>
        </div>

        {/* Hashtags */}
        {version.structuredOutput.hashtags.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-2">
              Hashtags
            </label>
            <div className="flex flex-wrap gap-1.5">
              {version.structuredOutput.hashtags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  <Tag className="w-2.5 h-2.5 text-neutral-400" />
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
