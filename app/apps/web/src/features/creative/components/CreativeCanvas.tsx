import React, { useState, useMemo } from 'react';
import type {
  PosterAspectRatio,
  SafeMargins,
  SceneLayerDraft,
  SceneLayerRecord,
} from '../types/creative.types.js';

export interface CreativeCanvasProps {
  readonly aspectRatio: PosterAspectRatio;
  readonly width: number;
  readonly height: number;
  readonly safeMargins: SafeMargins;
  readonly layers: readonly (SceneLayerDraft | SceneLayerRecord)[];
  readonly selectedLayerKey?: string;
  readonly onSelectLayer?: (layerKey: string) => void;
  readonly onLayerBoundsChange?: (
    layerKey: string,
    bounds: { x: number; y: number; width: number; height: number },
  ) => void;
  readonly showSafeMargins?: boolean;
}

export const CreativeCanvas: React.FC<CreativeCanvasProps> = ({
  aspectRatio,
  width,
  height,
  safeMargins,
  layers,
  selectedLayerKey,
  onSelectLayer,
  showSafeMargins = true,
}) => {
  const [zoomLevel, setZoomLevel] = useState<'fit' | 0.5 | 0.75 | 1.0>('fit');

  // Sort layers by zIndex ascending so higher zIndex renders on top
  const sortedLayers = useMemo(() => {
    return [...layers].sort((a, b) => a.zIndex - b.zIndex);
  }, [layers]);

  // Dimensions of the viewport scale
  // At 1080px base width, calculate display scale
  const displayScale = zoomLevel === 'fit' ? 0.45 : zoomLevel;
  const scaledWidth = width * displayScale;
  const scaledHeight = height * displayScale;

  return (
    <div className="flex flex-col h-full bg-[#181615] rounded-xl overflow-hidden border border-app-border/40 select-none">
      {/* Canvas Header Controls */}
      <div className="px-4 py-2 bg-[#201D1C] border-b border-app-border/40 flex items-center justify-between text-xs text-app-muted">
        <div className="flex items-center gap-3">
          <span className="font-mono text-white font-semibold">
            {width} × {height} px
          </span>
          <span className="px-2 py-0.5 rounded bg-brand-burgundy/20 text-brand-burgundy text-[11px] font-bold">
            {aspectRatio}
          </span>
          {showSafeMargins && (
            <span className="text-[11px] text-[#A88448] flex items-center gap-1 font-medium">
              <span className="w-2 h-2 rounded-full border border-dashed border-[#A88448]" />
              Safe Margins ({safeMargins.top}px)
            </span>
          )}
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-[#151312] p-0.5 rounded-lg border border-app-border/40">
          {(['fit', 0.5, 0.75, 1.0] as const).map((z) => (
            <button
              key={String(z)}
              type="button"
              onClick={() => setZoomLevel(z)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                zoomLevel === z
                  ? 'bg-brand-burgundy text-white shadow-sm'
                  : 'text-app-muted hover:text-white'
              }`}
            >
              {z === 'fit' ? 'Fit' : `${Math.round(z * 100)}%`}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas Viewport Area */}
      <div className="flex-1 overflow-auto p-8 flex items-center justify-center relative">
        <div
          data-testid="creative-canvas-container"
          style={{
            width: scaledWidth,
            height: scaledHeight,
            minWidth: scaledWidth,
            minHeight: scaledHeight,
          }}
          className="relative shadow-2xl rounded-sm overflow-hidden bg-[#0F0D0C] transition-all"
        >
          {/* Inner 1080px scaled coordinate space */}
          <div
            style={{
              width,
              height,
              transform: `scale(${displayScale})`,
              transformOrigin: 'top left',
            }}
            className="absolute top-0 left-0"
          >
            {/* Render Layers */}
            {sortedLayers.map((layer) => {
              if (!layer.visible) return null;
              const isSelected = selectedLayerKey === layer.layerKey;

              return (
                <div
                  key={layer.layerKey}
                  data-testid={`canvas-layer-${layer.layerKey}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectLayer?.(layer.layerKey);
                  }}
                  style={{
                    position: 'absolute',
                    left: `${layer.bounds.x}px`,
                    top: `${layer.bounds.y}px`,
                    width: `${layer.bounds.width}px`,
                    height: `${layer.bounds.height}px`,
                    zIndex: layer.zIndex,
                    opacity: layer.opacity,
                    cursor: onSelectLayer ? 'pointer' : 'default',
                  }}
                  className={`transition-shadow ${
                    isSelected
                      ? 'ring-2 ring-brand-burgundy ring-offset-2 ring-offset-transparent'
                      : ''
                  }`}
                >
                  {/* Layer Content Renderer */}
                  {renderLayerContent(layer)}

                  {/* Selected Handles */}
                  {isSelected && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-brand-burgundy border-2 border-white rounded-full shadow" />
                      <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-brand-burgundy border-2 border-white rounded-full shadow" />
                      <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-brand-burgundy border-2 border-white rounded-full shadow" />
                      <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-brand-burgundy border-2 border-white rounded-full shadow" />
                      <div className="absolute -top-6 left-0 bg-brand-burgundy text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                        {layer.name} ({layer.layerKey})
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Safe Margins Overlay Guide */}
            {showSafeMargins && (
              <div
                style={{
                  position: 'absolute',
                  left: `${safeMargins.left}px`,
                  top: `${safeMargins.top}px`,
                  width: `${width - safeMargins.left - safeMargins.right}px`,
                  height: `${height - safeMargins.top - safeMargins.bottom}px`,
                  zIndex: 9999,
                  pointerEvents: 'none',
                }}
                className="border-2 border-dashed border-[#A88448]/60"
              >
                <div className="absolute top-2 left-2 text-[10px] font-mono uppercase tracking-widest text-[#A88448] bg-black/60 px-1 rounded">
                  Safe Area
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function renderLayerContent(layer: SceneLayerDraft | SceneLayerRecord): React.ReactNode {
  const payload = layer.payload as Record<string, any> | undefined;

  switch (layer.layerGroup) {
    case 'BACKGROUND':
      if (layer.layerType === 'GENERATED_BACKGROUND') {
        return (
          <div className="w-full h-full bg-gradient-to-br from-[#2D2426] via-[#1B1718] to-[#0E0C0D] flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(168,132,72,0.18),transparent_60%)]" />
            <div className="text-[14px] font-mono tracking-widest uppercase text-white/10 select-none">
              Parisian Atelier Ambiance
            </div>
          </div>
        );
      }
      return <div className="w-full h-full bg-[#181615]" />;

    case 'SURFACE_SHADOW':
      return (
        <div className="w-full h-full rounded-full bg-black/40 blur-xl filter transform scale-90" />
      );

    case 'PRODUCT_HERO':
      return (
        <div className="w-full h-full relative flex items-center justify-center">
          <div className="w-4/5 h-4/5 rounded-2xl bg-gradient-to-b from-[#FFF5EA]/10 via-[#FFF5EA]/5 to-transparent border border-[#EAD9BD]/20 flex flex-col items-center justify-center p-6 shadow-2xl relative">
            <div className="w-12 h-16 rounded-t-lg bg-[#A88448]/30 border border-[#A88448]/50 mb-2" />
            <div className="w-32 h-44 rounded-2xl bg-gradient-to-b from-[#EAD9BD]/30 to-[#5F4A2C]/40 border-2 border-[#EAD9BD]/60 shadow-inner flex items-center justify-center">
              <span className="text-[12px] font-serif tracking-widest text-white/80 font-bold uppercase text-center px-2">
                Parisian Luxury
              </span>
            </div>
            <div className="absolute bottom-2 text-[9px] font-mono text-emerald-400 bg-black/60 px-1.5 py-0.5 rounded">
              Verified Hero Cutout
            </div>
          </div>
        </div>
      );

    case 'TYPOGRAPHY': {
      const headline = payload?.headline;
      const subheadline = payload?.subheadline;
      const priceBadge = payload?.priceBadge;
      const cta = payload?.cta;

      return (
        <div className="w-full h-full flex flex-col justify-between p-4 pointer-events-auto">
          <div>
            {headline?.text && (
              <h2
                style={{
                  fontFamily: headline.fontFamily ?? 'Playfair Display',
                  fontSize: `${headline.fontSize ?? 42}px`,
                  fontWeight: headline.fontWeight ?? 700,
                  color: headline.color ?? '#FFFFFF',
                  lineHeight: 1.15,
                }}
                className="tracking-tight text-shadow-sm mb-2"
              >
                {headline.text}
              </h2>
            )}

            {subheadline?.text && (
              <p
                style={{
                  fontFamily: subheadline.fontFamily ?? 'Montserrat',
                  fontSize: `${subheadline.fontSize ?? 20}px`,
                  fontWeight: subheadline.fontWeight ?? 500,
                  color: subheadline.color ?? '#C5BCB3',
                  lineHeight: 1.3,
                }}
                className="tracking-normal mb-3"
              >
                {subheadline.text}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 mt-auto">
            {priceBadge?.regularPrice && (
              <div className="px-3.5 py-1.5 rounded-lg bg-[#EAD9BD]/10 border border-[#EAD9BD]/40 text-[#EAD9BD]">
                <span className="text-xs uppercase tracking-wider text-[#A88448] font-bold block">
                  Catalog Truth
                </span>
                <span className="text-xl font-bold font-mono">{priceBadge.regularPrice}</span>
              </div>
            )}

            {cta?.text && (
              <div
                style={{
                  fontFamily: cta.fontFamily ?? 'Montserrat',
                  fontSize: `${cta.fontSize ?? 16}px`,
                  fontWeight: cta.fontWeight ?? 600,
                }}
                className="px-5 py-2.5 rounded-lg bg-[#8C2437] text-white font-semibold shadow-lg text-center tracking-wider uppercase text-xs"
              >
                {cta.text}
              </div>
            )}
          </div>
        </div>
      );
    }

    case 'BRAND_DECORATION':
      return (
        <div className="w-full h-full border border-[#A88448]/30 flex items-center justify-center">
          <span className="text-[10px] font-mono text-[#A88448] tracking-widest uppercase">
            Maison Atelier Decal
          </span>
        </div>
      );

    default:
      return (
        <div className="w-full h-full border border-dashed border-white/20 p-2 text-[10px] text-white/50">
          {layer.name}
        </div>
      );
  }
}
