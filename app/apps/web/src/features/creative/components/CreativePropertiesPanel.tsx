import React from 'react';
import { Settings, ShieldCheck } from 'lucide-react';
import type { SceneLayerDraft, SceneLayerRecord } from '../types/creative.types.js';

export interface CreativePropertiesPanelProps {
  readonly selectedLayer?: SceneLayerDraft | SceneLayerRecord;
  readonly onUpdateLayer: (updatedLayer: SceneLayerDraft | SceneLayerRecord) => void;
  readonly disabled?: boolean;
}

export const CreativePropertiesPanel: React.FC<CreativePropertiesPanelProps> = ({
  selectedLayer,
  onUpdateLayer,
  disabled = false,
}) => {
  if (!selectedLayer) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-app-muted bg-app-surface border border-app-border rounded-xl">
        <Settings className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-xs font-medium">
          Select a layer on canvas or layers list to edit properties
        </p>
      </div>
    );
  }

  const payload = (selectedLayer.payload ?? {}) as Record<string, any>;

  const handleBoundsChange = (field: 'x' | 'y' | 'width' | 'height', val: number) => {
    onUpdateLayer({
      ...selectedLayer,
      bounds: {
        ...selectedLayer.bounds,
        [field]: Number.isNaN(val) ? 0 : val,
      },
    });
  };

  const handleOpacityChange = (val: number) => {
    onUpdateLayer({
      ...selectedLayer,
      opacity: Math.max(0, Math.min(1, val)),
    });
  };

  const handleTypographyPayloadChange = (
    subfield: 'headline' | 'subheadline' | 'priceBadge',
    key: string,
    value: any,
  ) => {
    onUpdateLayer({
      ...selectedLayer,
      payload: {
        ...payload,
        [subfield]: {
          ...(payload[subfield] ?? {}),
          [key]: value,
        },
      },
    });
  };

  return (
    <div className="flex flex-col h-full bg-app-surface border border-app-border rounded-xl overflow-y-auto">
      <div className="px-4 py-3 border-b border-app-border flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-app-primary uppercase tracking-wider block">
            {selectedLayer.name}
          </span>
          <span className="text-[10px] font-mono text-app-muted">
            Group: {selectedLayer.layerGroup} • Type: {selectedLayer.layerType}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Bounds & Coordinates */}
        <div>
          <label className="text-xs font-semibold text-app-primary uppercase tracking-wider mb-2 block">
            Geometry & Bounds
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-[10px] text-app-muted uppercase font-mono block mb-1">
                X (px)
              </span>
              <input
                type="number"
                disabled={disabled}
                value={selectedLayer.bounds.x}
                onChange={(e) => handleBoundsChange('x', parseInt(e.target.value, 10))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-app-border bg-app-surface text-app-primary font-mono text-xs focus:ring-1 focus:ring-brand-burgundy outline-none"
              />
            </div>
            <div>
              <span className="text-[10px] text-app-muted uppercase font-mono block mb-1">
                Y (px)
              </span>
              <input
                type="number"
                disabled={disabled}
                value={selectedLayer.bounds.y}
                onChange={(e) => handleBoundsChange('y', parseInt(e.target.value, 10))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-app-border bg-app-surface text-app-primary font-mono text-xs focus:ring-1 focus:ring-brand-burgundy outline-none"
              />
            </div>
            <div>
              <span className="text-[10px] text-app-muted uppercase font-mono block mb-1">
                Width (px)
              </span>
              <input
                type="number"
                disabled={disabled}
                value={selectedLayer.bounds.width}
                onChange={(e) => handleBoundsChange('width', parseInt(e.target.value, 10))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-app-border bg-app-surface text-app-primary font-mono text-xs focus:ring-1 focus:ring-brand-burgundy outline-none"
              />
            </div>
            <div>
              <span className="text-[10px] text-app-muted uppercase font-mono block mb-1">
                Height (px)
              </span>
              <input
                type="number"
                disabled={disabled}
                value={selectedLayer.bounds.height}
                onChange={(e) => handleBoundsChange('height', parseInt(e.target.value, 10))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-app-border bg-app-surface text-app-primary font-mono text-xs focus:ring-1 focus:ring-brand-burgundy outline-none"
              />
            </div>
          </div>
        </div>

        {/* Opacity Slider */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-app-primary uppercase tracking-wider">
              Opacity
            </label>
            <span className="text-xs font-mono text-app-muted">
              {Math.round(selectedLayer.opacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            disabled={disabled}
            value={selectedLayer.opacity}
            onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
            className="w-full accent-brand-burgundy"
          />
        </div>

        {/* Typography Specific Editor */}
        {selectedLayer.layerGroup === 'TYPOGRAPHY' && (
          <div className="space-y-4 pt-3 border-t border-app-border">
            <div>
              <label className="text-xs font-semibold text-app-primary uppercase tracking-wider mb-1.5 block">
                Headline Text
              </label>
              <input
                type="text"
                disabled={disabled}
                value={payload.headline?.text ?? ''}
                onChange={(e) => handleTypographyPayloadChange('headline', 'text', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-app-border bg-app-surface text-app-primary text-xs focus:ring-1 focus:ring-brand-burgundy outline-none"
                placeholder="Poster Headline"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] text-app-muted uppercase font-mono block mb-1">
                  Font Family
                </label>
                <select
                  disabled={disabled}
                  value={payload.headline?.fontFamily ?? 'Playfair Display'}
                  onChange={(e) =>
                    handleTypographyPayloadChange('headline', 'fontFamily', e.target.value)
                  }
                  className="w-full px-2 py-1.5 rounded-lg border border-app-border bg-app-surface text-app-primary text-xs focus:ring-1 focus:ring-brand-burgundy outline-none"
                >
                  <option value="Playfair Display">Playfair Display (Serif)</option>
                  <option value="Montserrat">Montserrat (Sans)</option>
                  <option value="Noto Sans Khmer">Noto Sans Khmer</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-app-muted uppercase font-mono block mb-1">
                  Font Size (px)
                </label>
                <input
                  type="number"
                  disabled={disabled}
                  value={payload.headline?.fontSize ?? 44}
                  onChange={(e) =>
                    handleTypographyPayloadChange(
                      'headline',
                      'fontSize',
                      parseInt(e.target.value, 10),
                    )
                  }
                  className="w-full px-2 py-1.5 rounded-lg border border-app-border bg-app-surface text-app-primary text-xs font-mono focus:ring-1 focus:ring-brand-burgundy outline-none"
                />
              </div>
            </div>

            {/* Subheadline Text */}
            <div>
              <label className="text-xs font-semibold text-app-primary uppercase tracking-wider mb-1.5 block">
                Subheadline
              </label>
              <textarea
                rows={2}
                disabled={disabled}
                value={payload.subheadline?.text ?? ''}
                onChange={(e) =>
                  handleTypographyPayloadChange('subheadline', 'text', e.target.value)
                }
                className="w-full px-3 py-2 rounded-lg border border-app-border bg-app-surface text-app-primary text-xs focus:ring-1 focus:ring-brand-burgundy outline-none resize-none"
                placeholder="Product description or subtitle"
              />
            </div>

            {/* Price Badge Info */}
            {payload.priceBadge && (
              <div className="p-3 rounded-lg bg-[#EAD9BD]/10 border border-[#EAD9BD]/30">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#A88448] block mb-1">
                  Commercial Integrity (Catalog MSRP)
                </span>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-app-primary font-medium">Verified Price:</span>
                  <span className="font-mono font-bold text-app-primary">
                    {payload.priceBadge.regularPrice}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Product Hero Cutout Specific info */}
        {selectedLayer.layerGroup === 'PRODUCT_HERO' && (
          <div className="space-y-3 pt-3 border-t border-app-border">
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <div className="flex items-center gap-1.5 mb-1 font-semibold text-xs text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                Asset Rights Verified
              </div>
              <p className="text-[11px] text-emerald-400/90 leading-relaxed">
                Hero cutout validated by asset registry with verified commercial rights and
                authorized alpha channel.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
