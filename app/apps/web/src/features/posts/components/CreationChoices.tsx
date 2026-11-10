import React from 'react';
import type { PostCreationPlan } from '../api/posts-api.js';
export const defaultCreationPlan: PostCreationPlan = {
  format: 'POSTER',
  purpose: 'PRODUCT_SPOTLIGHT',
  style: 'LUXURY',
  feedback: '',
  intent: 'INITIAL',
};
export const purposeLabels = {
  PRODUCT_SPOTLIGHT: 'Product spotlight',
  PROMOTION: 'Promotion',
  NEW_ARRIVAL: 'New arrival',
  EDUCATIONAL: 'Educational',
  GIFT_GUIDE: 'Gift guide',
  LIFESTYLE: 'Lifestyle',
  CUSTOM: 'Custom idea',
};
export const styleLabels = {
  LUXURY: 'Luxury',
  MINIMAL: 'Minimal',
  FESTIVE: 'Festive',
  EDITORIAL: 'Editorial',
};
export function CreationChoices({
  plan,
  onChange,
}: {
  plan: PostCreationPlan;
  onChange: (plan: PostCreationPlan) => void;
}): React.JSX.Element {
  return (
    <div className="space-y-5">
      {plan.purpose === 'EDUCATIONAL' && (
        <label className="block">
          Educational focus
          <select
            className="block rounded border p-2"
            value={plan.educationMode ?? 'PRODUCT_FACTS'}
            onChange={(e) =>
              onChange({
                ...plan,
                educationMode: e.target.value as 'PRODUCT_FACTS' | 'FRAGRANCE_NOTES',
              })
            }
          >
            <option value="PRODUCT_FACTS">General verified product facts</option>
            <option value="FRAGRANCE_NOTES">Verified fragrance notes</option>
          </select>
          <p>
            Fragrance-note education requires verified notes. General education must not invent
            notes or benefits.
          </p>
        </label>
      )}
      <fieldset>
        <legend className="mb-2 font-semibold">What would you like to create?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['POSTER', 'VIDEO'] as const).map((format) => (
            <label
              key={format}
              className={`flex min-h-24 cursor-pointer items-start gap-3 rounded-xl border p-4 ${plan.format === format ? 'border-[#20313d] bg-slate-50' : 'bg-white'}`}
            >
              <input
                className="mt-1"
                type="radio"
                name="post-format"
                value={format}
                checked={plan.format === format}
                onChange={() => onChange({ ...plan, format })}
              />
              <span>
                <strong className="block">
                  {format === 'POSTER' ? 'Poster + captions' : 'Video brief'}
                </strong>
                <span className="mt-1 block text-sm text-neutral-600">
                  {format === 'POSTER'
                    ? 'One product image with Khmer and English captions.'
                    : 'Plan your video. MCP video generation is not connected yet.'}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {plan.format === 'VIDEO' && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
          You can save a video brief. Generating, reviewing and downloading a video are unavailable
          until the application’s Higgsfield video connection is implemented and verified. Saving
          does not use credits.
        </p>
      )}
      <fieldset>
        <legend className="mb-2 font-semibold">Content type</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(purposeLabels).map(([value, label]) => (
            <label
              key={value}
              className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${plan.purpose === value ? 'border-[#20313d] bg-slate-50' : 'bg-white'}`}
            >
              <input
                type="radio"
                name="post-purpose"
                value={value}
                checked={plan.purpose === value}
                onChange={() =>
                  onChange({ ...plan, purpose: value as PostCreationPlan['purpose'] })
                }
              />
              {label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-600">
          Comparison posts need a verified second-product workflow, which is not connected here yet.
        </p>
        <p className="mt-2 text-xs text-neutral-600">
          Promotions, arrival dates, fragrance notes and comparisons require verified supporting
          facts. Choosing a content type does not verify a claim.
        </p>
      </fieldset>
      <fieldset>
        <legend className="mb-2 font-semibold">Visual style</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(styleLabels).map(([value, label]) => (
            <label
              key={value}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 ${plan.style === value ? 'border-[#20313d] bg-slate-50' : 'bg-white'}`}
            >
              <input
                type="radio"
                name="post-style"
                value={value}
                checked={plan.style === value}
                onChange={() => onChange({ ...plan, style: value as PostCreationPlan['style'] })}
              />
              {label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-600">
          These are design directions. Matching historical Parisian Shopper posters requires an
          approved reference library; none is used automatically.
        </p>
      </fieldset>
    </div>
  );
}
