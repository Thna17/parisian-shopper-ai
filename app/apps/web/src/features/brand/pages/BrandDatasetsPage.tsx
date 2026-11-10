import React, { useEffect, useState } from 'react';
import {
  Database,
  GitCommit,
  Plus,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  MessageSquare,
} from 'lucide-react';
import { brandApi } from '../api/brand-api.js';
import type {
  BrandDatasetVersionRecord,
  CurateBrandDatasetParams,
  ReviewFeedbackRecord,
} from '../types/brand.types.js';
import { Badge } from '../../../components/ui/badge.js';
import { Button } from '../../../components/ui/button.js';

export const BrandDatasetsPage: React.FC = () => {
  const [datasets, setDatasets] = useState<readonly BrandDatasetVersionRecord[]>([]);
  const [feedbackList, setFeedbackList] = useState<readonly ReviewFeedbackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter
  const [feedbackFilter, setFeedbackFilter] = useState<'ALL' | 'APPROVED' | 'REJECTED' | 'REVISED'>(
    'ALL',
  );

  // Curate modal
  const [isCurateOpen, setIsCurateOpen] = useState(false);
  const [datasetName, setDatasetName] = useState('');
  const [versionString, setVersionString] = useState('');
  const [gitCommitHash, setGitCommitHash] = useState('');
  const [selectedFeedbackIds, setSelectedFeedbackIds] = useState<string[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [allDatasets, feedback] = await Promise.all([
        brandApi.listBrandDatasets(),
        brandApi.listBrandFeedback({ limit: 100 }),
      ]);
      setDatasets(allDatasets);
      setFeedbackList(feedback);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load brand datasets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleCurateDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!datasetName.trim() || !versionString.trim()) return;

    try {
      setActionLoading(true);
      setError(null);

      const params: CurateBrandDatasetParams = {
        name: datasetName.trim(),
        versionString: versionString.trim(),
        status: 'CURATING',
        gitCommitHash: gitCommitHash.trim() || undefined,
        initialFeedbackIds: selectedFeedbackIds.length > 0 ? selectedFeedbackIds : undefined,
      };

      await brandApi.curateBrandDataset(params);
      setSuccessMessage(`Dataset snapshot "${datasetName}" curated successfully.`);
      setIsCurateOpen(false);
      setDatasetName('');
      setVersionString('');
      setGitCommitHash('');
      setSelectedFeedbackIds([]);
      await loadData();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to curate dataset snapshot.');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleSelectFeedback = (id?: string) => {
    if (!id) return;
    setSelectedFeedbackIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const filteredFeedback = feedbackList.filter((fb) => {
    if (feedbackFilter === 'ALL') return true;
    return fb.decision === feedbackFilter;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-app-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-serif tracking-tight text-[#243746]">
              Curated Datasets & Review Feedback Ingestion
            </h1>
            <Badge variant="gold">W41 LoRA / DPO</Badge>
          </div>
          <p className="text-xs text-app-muted mt-1">
            Versioned fine-tuning dataset partitions (Train / Val / Test), Git SHA provenance, and
            review telemetry
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadData()}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setVersionString(`v${new Date().toISOString().slice(0, 10).replace(/-/g, '.')}-gold`);
              setIsCurateOpen(true);
            }}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Curate New Snapshot
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Datasets Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {datasets.map((ds) => (
          <div
            key={ds.id}
            className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-gold-500" />
                <h3 className="font-serif font-bold text-sm text-[#243746]">{ds.name}</h3>
              </div>
              <Badge
                variant={
                  ds.status === 'ACTIVE' ? 'good' : ds.status === 'CURATING' ? 'gold' : 'neutral'
                }
              >
                {ds.status}
              </Badge>
            </div>

            <div className="text-xs space-y-1.5 pt-1 text-app-muted">
              <div className="flex justify-between">
                <span>Version:</span>
                <span className="font-mono text-app-primary font-semibold">{ds.versionString}</span>
              </div>
              <div className="flex justify-between">
                <span>Asset Count:</span>
                <span className="font-mono text-app-primary font-semibold">{ds.assetCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Git Commit:</span>
                <span className="font-mono text-[10px] bg-app-surface-subtle px-1.5 py-0.5 rounded text-app-muted flex items-center gap-1">
                  <GitCommit className="w-3 h-3" />
                  {ds.gitCommitHash ? ds.gitCommitHash.slice(0, 7) : 'HEAD'}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-app-border/60 flex items-center justify-between text-[10px] text-app-muted font-mono">
              <span>Partition: 70/15/15 Split</span>
              <span>{new Date(ds.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}

        {datasets.length === 0 && !loading && (
          <div className="col-span-3 bg-app-surface border border-app-border rounded-2xl p-8 text-center text-xs text-app-muted">
            No dataset snapshots created yet. Click "Curate New Snapshot" to compile review feedback
            into a training corpus.
          </div>
        )}
      </div>

      {/* Ingested Review Feedback Table */}
      <div className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-app-border/80">
          <div>
            <h2 className="text-sm font-serif font-bold text-[#243746] flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-gold-500" />
              Ingested Human Review Feedback ({feedbackList.length})
            </h2>
            <p className="text-[11px] text-app-muted mt-0.5">
              Reviewer decisions and critique notes ingested for direct preference optimization
              (DPO)
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1.5">
            {(['ALL', 'APPROVED', 'REJECTED', 'REVISED'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFeedbackFilter(mode)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  feedbackFilter === mode
                    ? 'bg-[#243746] text-white shadow-xs'
                    : 'bg-app-surface-subtle text-app-muted hover:text-app-primary'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-app-surface-subtle/80 text-[10px] font-bold uppercase tracking-wider text-app-muted border-b border-app-border">
              <tr>
                <th className="p-3 w-10">Select</th>
                <th className="p-3">Decision</th>
                <th className="p-3">Original / Prompt Copy</th>
                <th className="p-3">Critique & Tone Flags</th>
                <th className="p-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border/60">
              {filteredFeedback.map((fb, idx) => (
                <tr key={fb.id ?? idx} className="hover:bg-app-surface-subtle/50 transition-colors">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selectedFeedbackIds.includes(fb.id ?? String(idx))}
                      onChange={() => toggleSelectFeedback(fb.id ?? String(idx))}
                      className="rounded border-app-border text-gold-500 focus:ring-gold-500"
                    />
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <Badge
                      variant={
                        fb.decision === 'APPROVED'
                          ? 'good'
                          : fb.decision === 'REJECTED'
                            ? 'bad'
                            : 'warn'
                      }
                    >
                      {fb.decision}
                    </Badge>
                  </td>
                  <td className="p-3 max-w-md">
                    <div className="font-serif text-[11px] text-app-primary line-clamp-2">
                      {fb.originalText}
                    </div>
                    {fb.revisedText && (
                      <div className="mt-1 text-[10px] text-emerald-800 font-mono bg-emerald-50/70 p-1 rounded border border-emerald-100">
                        Revised: {fb.revisedText}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="text-[11px] text-app-muted italic">
                      {fb.critiqueNotes || 'No reviewer notes provided'}
                    </div>
                    {fb.toneFlags && fb.toneFlags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {fb.toneFlags.map((flag) => (
                          <span
                            key={flag}
                            className="px-1.5 py-0.5 rounded text-[9px] bg-rose-50 text-rose-800 border border-rose-200 font-mono"
                          >
                            {flag}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap font-mono text-[10px] text-app-muted">
                    {fb.sourceType}
                  </td>
                </tr>
              ))}

              {filteredFeedback.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-xs text-app-muted">
                    No review feedback matching filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Curate Dataset Modal */}
      {isCurateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-app-surface border border-app-border rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-[#243746] font-serif font-bold text-base">
              <Database className="w-5 h-5 text-gold-500" />
              <span>Curate Brand Dataset Snapshot</span>
            </div>

            <p className="text-xs text-app-muted">
              Assemble approved review feedback into a versioned training split with git SHA
              provenance.
            </p>

            <form onSubmit={(e) => void handleCurateDataset(e)} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-app-primary">Dataset Name</label>
                <input
                  type="text"
                  required
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  placeholder="e.g. Parisian Autumn 2026 Golden Corpus"
                  className="w-full text-xs p-2.5 rounded-xl border border-app-border bg-app-surface focus:outline-hidden focus:ring-1 focus:ring-gold-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-app-primary">Version String</label>
                <input
                  type="text"
                  required
                  value={versionString}
                  onChange={(e) => setVersionString(e.target.value)}
                  placeholder="e.g. v2026.11.01-gold"
                  className="w-full text-xs p-2.5 rounded-xl border border-app-border bg-app-surface font-mono focus:outline-hidden focus:ring-1 focus:ring-gold-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-app-primary">
                  Git Commit SHA (Optional)
                </label>
                <input
                  type="text"
                  value={gitCommitHash}
                  onChange={(e) => setGitCommitHash(e.target.value)}
                  placeholder="e.g. 5bb16ab"
                  className="w-full text-xs p-2.5 rounded-xl border border-app-border bg-app-surface font-mono focus:outline-hidden focus:ring-1 focus:ring-gold-500"
                />
              </div>

              <div className="text-[11px] text-app-muted pt-1">
                Selected Feedback Records:{' '}
                <span className="font-semibold text-app-primary">
                  {selectedFeedbackIds.length} records selected
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button variant="ghost" size="sm" onClick={() => setIsCurateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={actionLoading || !datasetName.trim() || !versionString.trim()}
                >
                  Curate Snapshot
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
