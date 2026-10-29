import React from 'react';
import { Eye, Image as ImageIcon, Loader2, Download } from 'lucide-react';
import type { RenderPreviewResult } from '../types/creative.types.js';

export interface CreativeRenderPanelProps {
  readonly renderResult: RenderPreviewResult | null;
  readonly isRendering: boolean;
  readonly onTriggerRender: () => void;
  readonly disabled?: boolean;
}

export const CreativeRenderPanel: React.FC<CreativeRenderPanelProps> = ({
  renderResult,
  isRendering,
  onTriggerRender,
  disabled = false,
}) => {
  return (
    <div className="flex flex-col h-full bg-app-surface border border-app-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-app-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-app-muted" />
          <span className="text-xs font-semibold text-app-primary uppercase tracking-wider">
            High-Fidelity Server Render
          </span>
        </div>
        <button
          type="button"
          disabled={disabled || isRendering}
          onClick={onTriggerRender}
          className="px-3 py-1.5 rounded-lg bg-brand-burgundy hover:bg-brand-burgundy/90 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
        >
          {isRendering ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Compositing...
            </>
          ) : (
            <>
              <ImageIcon className="w-3.5 h-3.5" />
              Render Server Preview
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center">
        {renderResult ? (
          <div className="w-full space-y-4">
            <div className="rounded-xl overflow-hidden border border-app-border bg-[#181615] flex items-center justify-center p-2 relative group">
              <img
                src={renderResult.previewUrl}
                alt="Composited Server Preview"
                className="max-h-[380px] w-auto object-contain rounded-lg shadow-xl"
              />
              <a
                href={renderResult.previewUrl}
                target="_blank"
                rel="noreferrer"
                download="parisian-poster-preview.png"
                className="absolute bottom-4 right-4 px-3 py-1.5 rounded-lg bg-black/80 text-white text-xs font-medium flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur shadow"
              >
                <Download className="w-3.5 h-3.5" />
                Download PNG
              </a>
            </div>

            {/* Metadata Info */}
            <div className="p-3 rounded-lg bg-app-surface-subtle border border-app-border text-[11px] space-y-1 text-app-muted">
              <div className="flex justify-between">
                <span>Compositor Engine:</span>
                <span className="font-mono text-app-primary">Sharp + HarfBuzz Shaper</span>
              </div>
              <div className="flex justify-between">
                <span>Raster Dimensions:</span>
                <span className="font-mono text-app-primary">
                  {renderResult.width} × {renderResult.height} px
                </span>
              </div>
              <div className="flex justify-between">
                <span>Payload Size:</span>
                <span className="font-mono text-app-primary">
                  {(renderResult.byteSize / 1024).toFixed(1)} KB
                </span>
              </div>
              <div className="flex justify-between truncate">
                <span className="shrink-0">SHA-256 Digest:</span>
                <span className="font-mono text-app-primary truncate ml-2">
                  {renderResult.sha256}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-app-muted space-y-2">
            <ImageIcon className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-xs font-medium">No server render composited yet</p>
            <p className="text-[11px] max-w-xs text-app-muted/80">
              Click &quot;Render Server Preview&quot; to execute deterministic Sharp composition and
              generate a high-res preview.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
