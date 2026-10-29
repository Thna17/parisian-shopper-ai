import React from 'react';
import { Eye, EyeOff, Layers, Type, Image as ImageIcon, Sparkles, Box } from 'lucide-react';
import type { LayerGroup, SceneLayerDraft, SceneLayerRecord } from '../types/creative.types.js';

export interface CreativeLayersPanelProps {
  readonly layers: readonly (SceneLayerDraft | SceneLayerRecord)[];
  readonly selectedLayerKey?: string;
  readonly onSelectLayer: (layerKey: string) => void;
  readonly onToggleVisibility: (layerKey: string) => void;
}

const LAYER_GROUP_ICONS: Record<LayerGroup, React.ReactNode> = {
  BACKGROUND: <ImageIcon className="w-3.5 h-3.5 text-blue-400" />,
  SURFACE_SHADOW: <Box className="w-3.5 h-3.5 text-gray-400" />,
  PRODUCT_HERO: <Sparkles className="w-3.5 h-3.5 text-emerald-400" />,
  TYPOGRAPHY: <Type className="w-3.5 h-3.5 text-amber-400" />,
  BRAND_DECORATION: <Layers className="w-3.5 h-3.5 text-purple-400" />,
};

export const CreativeLayersPanel: React.FC<CreativeLayersPanelProps> = ({
  layers,
  selectedLayerKey,
  onSelectLayer,
  onToggleVisibility,
}) => {
  // Sort descending by zIndex so top layers appear at the top of the panel
  const sortedLayers = [...layers].sort((a, b) => b.zIndex - a.zIndex);

  return (
    <div className="flex flex-col h-full bg-app-surface border border-app-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-app-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-app-muted" />
          <span className="text-xs font-semibold text-app-primary uppercase tracking-wider">
            Scene Layers ({layers.length})
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-app-border/40 p-2 space-y-1">
        {sortedLayers.map((layer) => {
          const isSelected = selectedLayerKey === layer.layerKey;

          return (
            <div
              key={layer.layerKey}
              data-testid={`layer-item-${layer.layerKey}`}
              onClick={() => onSelectLayer(layer.layerKey)}
              className={`p-2.5 rounded-lg flex items-center justify-between transition-all cursor-pointer ${
                isSelected
                  ? 'bg-brand-burgundy/10 border border-brand-burgundy text-app-primary'
                  : 'hover:bg-app-surface-subtle text-app-primary border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="shrink-0">
                  {LAYER_GROUP_ICONS[layer.layerGroup] ?? <Layers className="w-3.5 h-3.5" />}
                </span>
                <div className="truncate">
                  <div className="text-xs font-medium truncate">{layer.name}</div>
                  <div className="text-[10px] font-mono text-app-muted truncate">
                    {layer.layerKey} • z:{layer.zIndex}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <button
                  type="button"
                  data-testid={`toggle-visibility-${layer.layerKey}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(layer.layerKey);
                  }}
                  className={`p-1 rounded hover:bg-app-surface transition-colors ${
                    layer.visible ? 'text-app-muted hover:text-app-primary' : 'text-red-400'
                  }`}
                  aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
                >
                  {layer.visible ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
