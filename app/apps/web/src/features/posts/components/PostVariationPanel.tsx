import { UnsavedPostGuard } from '../UnsavedPostGuard.js';
import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postsApi, type StaffPost, type PostCreationPlan } from '../api/posts-api.js';
import { defaultCreationPlan, styleLabels } from './CreationChoices.js';
export function PostVariationPanel({
  post,
  disabled,
  feedback,
}: {
  post: StaffPost;
  disabled: boolean;
  feedback: string;
}): React.JSX.Element {
  const cache = useQueryClient(),
    plan = post.currentRevision.creationPlan ?? defaultCreationPlan;
  const [note, setNote] = useState(feedback),
    [style, setStyle] = useState<PostCreationPlan['style']>(plan.style);
  const variation = useMutation({
    mutationFn: (intent: 'REGENERATE' | 'NEW_DESIGN') =>
      postsApi.variation(post.id, post.revisionNumber, intent, style, note.trim()),
    onSuccess: async (data) => {
      cache.setQueryData(['staff-post', post.id], data);
      await cache.invalidateQueries({ queryKey: ['post-generation', post.id] });
      await cache.invalidateQueries({ queryKey: ['staff-posts'] });
    },
  });
  return (
    <section aria-label="Make another version" className="space-y-3 rounded-xl border bg-white p-5">
      <UnsavedPostGuard
        active={!variation.isSuccess && (note.trim() !== feedback.trim() || style !== plan.style)}
      />
      <h2 className="text-lg font-semibold">Make another version</h2>
      {!post.currentRevision.creationPlan && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm">
          This older post has no recorded style. Choose a style and use New design.
        </p>
      )}
      <p className="text-sm text-neutral-600">
        Keep this product and caption. Describe what should change, then prepare a new poster
        version. Previous versions and review decisions are kept. No generation starts until you
        confirm its cost.
      </p>
      <label className="block font-semibold" htmlFor="variation-feedback">
        What should change?
      </label>
      <textarea
        id="variation-feedback"
        rows={3}
        maxLength={1000}
        className="w-full rounded-lg border p-3"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="For example: Make the background lighter and leave more space around the product."
      />
      <label className="block" htmlFor="variation-style">
        New design style
      </label>
      <select
        id="variation-style"
        className="min-h-11 w-full rounded-lg border bg-white p-2 sm:w-auto"
        value={style}
        onChange={(e) => setStyle(e.target.value as PostCreationPlan['style'])}
      >
        {Object.entries(styleLabels).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-3">
        <button
          className="min-h-11 rounded-lg border px-4 disabled:opacity-40"
          disabled={
            disabled ||
            variation.isPending ||
            note.trim().length < 3 ||
            !post.currentRevision.creationPlan
          }
          onClick={() => variation.mutate('REGENERATE')}
        >
          Regenerate poster
        </button>
        <button
          className="min-h-11 rounded-lg bg-[#20313d] px-4 text-white disabled:opacity-40"
          disabled={disabled || variation.isPending || note.trim().length < 3}
          onClick={() => variation.mutate('NEW_DESIGN')}
        >
          New design
        </button>
      </div>
      <p className="text-xs text-neutral-600">
        Regenerate keeps the current style. New design uses the selected style. Captions stay
        editable; these actions do not regenerate captions with a language model.
      </p>
      {variation.isPending && <p role="status">Saving your next version…</p>}
      {variation.error && (
        <p role="alert">Could not prepare the new version: {variation.error.message}</p>
      )}
    </section>
  );
}
