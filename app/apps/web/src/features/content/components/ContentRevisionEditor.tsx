import React, { useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import type { ContentVersion } from '../types/content.types.js';

interface ContentRevisionEditorProps {
  version: ContentVersion;
  onSave: (
    field: 'headline' | 'englishCaption' | 'khmerCaption' | 'cta',
    newValue: string,
  ) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

export function ContentRevisionEditor({
  version,
  onSave,
  onCancel,
  isSaving,
}: ContentRevisionEditorProps): React.JSX.Element {
  const [headline, setHeadline] = useState(version.structuredOutput.headline);
  const [englishCaption, setEnglishCaption] = useState(
    version.structuredOutput.english_caption ?? '',
  );
  const [khmerCaption, setKhmerCaption] = useState(version.structuredOutput.khmer_caption ?? '');
  const [cta, setCta] = useState(version.structuredOutput.cta);

  const isHeadlineChanged = headline !== version.structuredOutput.headline;
  const isEnglishChanged = englishCaption !== (version.structuredOutput.english_caption ?? '');
  const isKhmerChanged = khmerCaption !== (version.structuredOutput.khmer_caption ?? '');
  const isCtaChanged = cta !== version.structuredOutput.cta;

  const isDirty = isHeadlineChanged || isEnglishChanged || isKhmerChanged || isCtaChanged;

  const handleSave = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!isDirty) return;

    // Apply primary changed field
    if (isHeadlineChanged) {
      await onSave('headline', headline);
    } else if (isEnglishChanged) {
      await onSave('englishCaption', englishCaption);
    } else if (isKhmerChanged) {
      await onSave('khmerCaption', khmerCaption);
    } else if (isCtaChanged) {
      await onSave('cta', cta);
    }
  };

  return (
    <form
      onSubmit={handleSave}
      className="bg-white dark:bg-neutral-900 border border-amber-300 dark:border-amber-700/80 rounded-2xl p-6 shadow-sm mb-6 relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-amber-600" />

      <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-neutral-800">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Revise Copy (Creates New Immutable Version)
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Original v{version.versionNumber} remains immutable in version history. Saving creates v
            {version.versionNumber + 1}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isDirty || isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Saving Version...
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                Save New Version
              </>
            )}
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {/* Headline Field */}
        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
            Headline
          </label>
          <input
            type="text"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            disabled={isSaving}
            className="w-full px-3.5 py-2 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-neutral-900 dark:text-neutral-100"
          />
        </div>

        {/* English Caption Field */}
        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
            English Caption
          </label>
          <textarea
            rows={4}
            value={englishCaption}
            onChange={(e) => setEnglishCaption(e.target.value)}
            disabled={isSaving}
            className="w-full px-3.5 py-2 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-neutral-900 dark:text-neutral-100 resize-y"
          />
        </div>

        {/* Khmer Caption Field */}
        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
            Khmer Caption (អត្ថបទភាសាខ្មែរ)
          </label>
          <textarea
            rows={4}
            value={khmerCaption}
            onChange={(e) => setKhmerCaption(e.target.value)}
            disabled={isSaving}
            className="w-full px-3.5 py-2 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-neutral-900 dark:text-neutral-100 resize-y"
          />
        </div>

        {/* Call to Action Field */}
        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
            Call To Action (CTA)
          </label>
          <input
            type="text"
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            disabled={isSaving}
            className="w-full px-3.5 py-2 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-neutral-900 dark:text-neutral-100"
          />
        </div>
      </div>
    </form>
  );
}
