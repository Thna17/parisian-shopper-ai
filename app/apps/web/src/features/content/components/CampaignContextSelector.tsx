import React from 'react';
import { Megaphone, ShieldCheck } from 'lucide-react';
import { useCampaigns } from '../../campaigns/hooks/use-campaigns.js';

interface CampaignContextSelectorProps {
  selectedCampaignId: string | null;
  onSelect: (campaignId: string | null) => void;
}

export function CampaignContextSelector({
  selectedCampaignId,
  onSelect,
}: CampaignContextSelectorProps): React.JSX.Element {
  const { data } = useCampaigns({ limit: 50 });
  const campaigns = data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
        <Megaphone className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        Associate Campaign (Optional)
      </div>

      <select
        value={selectedCampaignId ?? ''}
        onChange={(e) => onSelect(e.target.value === '' ? null : e.target.value)}
        className="w-full px-3.5 py-2 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-neutral-900 dark:text-neutral-100"
      >
        <option value="">No Campaign Association (Standalone Spotlight)</option>
        {campaigns.map((camp) => (
          <option key={camp.id} value={camp.id}>
            [{camp.code}] {camp.name} ({camp.status})
          </option>
        ))}
      </select>

      <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/60 dark:border-neutral-700/60 rounded-xl flex items-start gap-2.5 text-xs text-neutral-500">
        <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <span>
          <strong>Commercial Truth Invariant:</strong> Unapproved campaign promotional discount
          targets are never fed into AI prompts as verified catalog facts. Only official MSRP facts
          are verified.
        </span>
      </div>
    </div>
  );
}
