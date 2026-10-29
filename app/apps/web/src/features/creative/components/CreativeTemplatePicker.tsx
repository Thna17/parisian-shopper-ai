import React from 'react';
import type { SceneTemplateId, TemplateDefinition } from '../types/creative.types.js';

export interface CreativeTemplatePickerProps {
  readonly templates: readonly TemplateDefinition[];
  readonly selectedId: SceneTemplateId;
  readonly onSelect: (templateId: SceneTemplateId) => void;
  readonly disabled?: boolean;
}

const TEMPLATE_METADATA: Record<
  SceneTemplateId,
  { readonly badge: string; readonly visualDescription: string; readonly accentColor: string }
> = {
  EDITORIAL_SPLIT: {
    badge: 'High Fashion',
    visualDescription:
      'Diagonal asymmetrical split with hero offset and editorial serif typography',
    accentColor: '#8C2437',
  },
  CENTERED_HERO: {
    badge: 'Classic Luxury',
    visualDescription: 'Central pedestal bottle hero with symmetrical framed brand typography',
    accentColor: '#A88448',
  },
  KHMER_SEASONAL: {
    badge: 'Cultural Prestige',
    visualDescription:
      'Bilingual typography with seasonal Khmer botanical motifs and golden highlights',
    accentColor: '#1E4839',
  },
  SCENT_STORY: {
    badge: 'Olfactory Notes',
    visualDescription: 'Top/Heart/Base olfactory note pyramid breakdown beside product bottle',
    accentColor: '#533B6A',
  },
  PROMOTION_PRICE_CTA: {
    badge: 'Commercial Launch',
    visualDescription:
      'Prominent catalog-verified MSRP truth badge with clear luxury call-to-action',
    accentColor: '#2B3A4A',
  },
};

export const CreativeTemplatePicker: React.FC<CreativeTemplatePickerProps> = ({
  templates,
  selectedId,
  onSelect,
  disabled = false,
}) => {
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-app-primary uppercase tracking-wider">
        Canonical Poster Template
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {templates.map((tpl) => {
          const isSelected = selectedId === tpl.id;
          const meta = TEMPLATE_METADATA[tpl.id] ?? {
            badge: 'Standard',
            visualDescription: tpl.description,
            accentColor: '#8C2437',
          };

          return (
            <button
              key={tpl.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(tpl.id)}
              className={`p-4 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                isSelected
                  ? 'border-brand-burgundy bg-brand-burgundy/5 ring-2 ring-brand-burgundy shadow-sm'
                  : 'border-app-border bg-app-surface hover:border-app-muted/60'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: meta.accentColor }}
                  >
                    {meta.badge}
                  </span>
                  <span className="text-[11px] font-mono text-app-muted">v{tpl.version}</span>
                </div>
                <h4 className="font-semibold text-sm text-app-primary mb-1">{tpl.name}</h4>
                <p className="text-xs text-app-muted leading-relaxed line-clamp-2">
                  {meta.visualDescription}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-app-border/60 flex items-center justify-between text-[11px] text-app-muted">
                <span>Ratios: {tpl.supportedAspectRatios.join(', ')}</span>
                <span className="font-medium text-app-primary">{tpl.defaultLanguage}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
