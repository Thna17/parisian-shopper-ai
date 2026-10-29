import React, { useState } from 'react';
import { X, Download, ShieldAlert, CheckCircle2, Lock, Loader2, FileArchive } from 'lucide-react';
import type { ExportFormatOption, ExportResult } from '../types/creative.types.js';

export interface CreativeExportDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly canExport: boolean;
  readonly jobStatus?: string;
  readonly onExport: (options: ExportFormatOption) => Promise<ExportResult>;
}

export const CreativeExportDialog: React.FC<CreativeExportDialogProps> = ({
  isOpen,
  onClose,
  canExport,
  jobStatus,
  onExport,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<
    'SQUARE_1080' | 'PORTRAIT_4_5' | 'STORY_9_16'
  >('SQUARE_1080');
  const [selectedEncoding, setSelectedEncoding] = useState<'PNG' | 'JPEG' | 'WEBP'>('PNG');
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const isApproved = canExport || jobStatus === 'CREATIVE_APPROVED';

  const handleExecuteExport = async () => {
    setIsExporting(true);
    setErrorMessage(null);
    try {
      const result = await onExport({
        format: selectedFormat,
        encoding: selectedEncoding,
      });
      setExportResult(result);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Export execution failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-app-surface border border-app-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-app-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-brand-burgundy" />
            <h3 id="export-dialog-title" className="text-sm font-semibold text-app-primary">
              Multi-Format Poster Export
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-app-muted hover:text-app-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Four-Eyes Approval Status Callout */}
          {!isApproved ? (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">Four-Eyes Approval Required</span>
                <p className="opacity-90 leading-relaxed text-[11px]">
                  Publishable poster export is blocked until this creative passes independent
                  Four-Eyes review (current status:{' '}
                  <span className="font-mono">{jobStatus ?? 'DRAFT'}</span>).
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="font-medium">
                Governance Verified: Authorized for Multi-Format Export
              </span>
            </div>
          )}

          {exportResult ? (
            <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
                <FileArchive className="w-5 h-5" />
                Asset Export Generated
              </div>
              <div className="text-xs text-app-muted space-y-1 font-mono">
                <div>
                  Format: {exportResult.format} ({exportResult.width}×{exportResult.height})
                </div>
                <div>Size: {(exportResult.byteSize / 1024).toFixed(1)} KB</div>
                <div className="truncate">Digest: {exportResult.sha256.substring(0, 16)}...</div>
              </div>
              <a
                href={exportResult.downloadUrl}
                target="_blank"
                rel="noreferrer"
                download
                className="w-full py-2.5 rounded-lg bg-brand-burgundy text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow"
              >
                <Download className="w-4 h-4" />
                Download Poster Asset
              </a>
            </div>
          ) : (
            <>
              {/* Format selection */}
              <div>
                <label className="text-xs font-semibold text-app-primary uppercase tracking-wider block mb-2">
                  Target Canvas Format
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'SQUARE_1080', label: '1:1 Square', dims: '1080×1080' },
                      { id: 'PORTRAIT_4_5', label: '4:5 Feed', dims: '1080×1350' },
                      { id: 'STORY_9_16', label: '9:16 Story', dims: '1080×1920' },
                    ] as const
                  ).map((fmt) => (
                    <button
                      key={fmt.id}
                      type="button"
                      disabled={!isApproved}
                      onClick={() => setSelectedFormat(fmt.id)}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        selectedFormat === fmt.id
                          ? 'border-brand-burgundy bg-brand-burgundy/5 ring-1 ring-brand-burgundy'
                          : 'border-app-border bg-app-surface'
                      } ${!isApproved ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div className="font-semibold text-xs text-app-primary">{fmt.label}</div>
                      <div className="text-[10px] text-app-muted font-mono mt-0.5">{fmt.dims}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Encoding selection */}
              <div>
                <label className="text-xs font-semibold text-app-primary uppercase tracking-wider block mb-2">
                  Output Image Format
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['PNG', 'JPEG', 'WEBP'] as const).map((enc) => (
                    <button
                      key={enc}
                      type="button"
                      disabled={!isApproved}
                      onClick={() => setSelectedEncoding(enc)}
                      className={`p-2 rounded-lg border text-center font-mono text-xs transition-all ${
                        selectedEncoding === enc
                          ? 'border-brand-burgundy bg-brand-burgundy/5 text-brand-burgundy font-bold ring-1 ring-brand-burgundy'
                          : 'border-app-border bg-app-surface text-app-primary'
                      } ${!isApproved ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {enc}
                    </button>
                  ))}
                </div>
              </div>

              {errorMessage && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  {errorMessage}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-app-surface-subtle border-t border-app-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-app-border text-xs font-medium text-app-primary hover:bg-app-surface transition-colors"
          >
            Close
          </button>
          {!exportResult && (
            <button
              type="button"
              disabled={!isApproved || isExporting}
              onClick={handleExecuteExport}
              className={`px-4 py-2 rounded-lg bg-brand-burgundy text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow ${
                !isApproved || isExporting
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-brand-burgundy/90'
              }`}
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating...
                </>
              ) : !isApproved ? (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  Export Locked
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Execute Export
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
