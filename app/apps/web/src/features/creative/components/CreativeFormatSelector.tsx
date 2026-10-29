import React from 'react';
import type { PosterAspectRatio } from '../types/creative.types.js';

export interface CreativeFormatSelectorProps {
  readonly value: PosterAspectRatio;
  readonly onChange: (aspectRatio: PosterAspectRatio) => void;
  readonly disabled?: boolean;
}

const FORMAT_CONFIGS: {
  readonly id: PosterAspectRatio;
  readonly label: string;
  readonly dimensions: string;
  readonly description: string;
}[] = [
  {
    id: '1:1',
    label: 'Square Feed',
    dimensions: '1080 × 1080',
    description: 'Instagram & Facebook main post feed',
  },
  {
    id: '4:5',
    label: 'Portrait Feed',
    dimensions: '1080 × 1350',
    description: 'Max vertical engagement in mobile feeds',
  },
  {
    id: '9:16',
    label: 'Story / Reel',
    dimensions: '1080 × 1920',
    description: 'Full-screen mobile story format',
  },
];

export const CreativeFormatSelector: React.FC<CreativeFormatSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold text-app-primary uppercase tracking-wider">
        Canvas Aspect Ratio
      </label>
      <div className="grid grid-cols-3 gap-2">
        {FORMAT_CONFIGS.map((fmt) => {
          const isSelected = value === fmt.id;
          return (
            <button
              key={fmt.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(fmt.id)}
              className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between ${
                isSelected
                  ? 'border-brand-burgundy bg-brand-burgundy/5 ring-1 ring-brand-burgundy'
                  : 'border-app-border bg-app-surface hover:border-app-muted/60'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-app-primary">{fmt.id}</span>
                  <span className="text-[11px] font-mono text-app-muted">{fmt.dimensions}</span>
                </div>
                <div className="text-xs font-medium text-app-primary">{fmt.label}</div>
              </div>
              <div className="text-[10px] text-app-muted mt-2 truncate">{fmt.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
