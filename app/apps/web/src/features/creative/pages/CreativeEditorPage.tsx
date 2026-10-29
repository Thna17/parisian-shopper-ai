import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  ShieldAlert,
  Eye,
  Download,
  Sliders,
  History,
  Loader2,
} from 'lucide-react';
import {
  useCreativeProjectDetail,
  useCreativeProjectVersions,
  useReviseCreativeProject,
  useValidateCreativeProject,
  useRenderCreativePreview,
  useExportCreativeProject,
} from '../hooks/use-creative.js';
import { CreativeCanvas } from '../components/CreativeCanvas.js';
import { CreativeLayersPanel } from '../components/CreativeLayersPanel.js';
import { CreativePropertiesPanel } from '../components/CreativePropertiesPanel.js';
import { CreativeValidationPanel } from '../components/CreativeValidationPanel.js';
import { CreativeRenderPanel } from '../components/CreativeRenderPanel.js';
import { CreativeVersionHistory } from '../components/CreativeVersionHistory.js';
import { CreativeExportDialog } from '../components/CreativeExportDialog.js';
import type {
  SceneLayerDraft,
  SceneLayerRecord,
  ValidationAssessmentResult,
  RenderPreviewResult,
} from '../types/creative.types.js';

export const CreativeEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  // Selected right sidebar tab
  const [activeTab, setActiveTab] = useState<'properties' | 'validation' | 'render' | 'history'>(
    'properties',
  );
  const [selectedLayerKey, setSelectedLayerKey] = useState<string | undefined>(undefined);
  const [showSafeMargins, setShowSafeMargins] = useState(true);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

  // Local working copy of layers for interactive manipulation before commit
  const [localLayers, setLocalLayers] = useState<readonly (SceneLayerDraft | SceneLayerRecord)[]>(
    [],
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [changeReason] = useState('Manual scene composition adjustment');

  // Queries & Mutations
  const { data: projectDetail, isLoading, error } = useCreativeProjectDetail(id);
  const { data: versions = [] } = useCreativeProjectVersions(id);

  const reviseMutation = useReviseCreativeProject(id!);
  const validateMutation = useValidateCreativeProject(id!);
  const renderMutation = useRenderCreativePreview(id!);
  const exportMutation = useExportCreativeProject(id!);

  const [validationResult, setValidationResult] = useState<ValidationAssessmentResult | null>(null);
  const [renderResult, setRenderResult] = useState<RenderPreviewResult | null>(null);

  // Sync initial layers from current version
  useEffect(() => {
    if (projectDetail?.currentVersion.layers && !hasUnsavedChanges) {
      setLocalLayers([...projectDetail.currentVersion.layers]);
      if (projectDetail.currentVersion.layers.length > 0 && !selectedLayerKey) {
        setSelectedLayerKey(projectDetail.currentVersion.layers[0]?.layerKey);
      }
    }
  }, [projectDetail, hasUnsavedChanges, selectedLayerKey]);

  const selectedLayer = useMemo(() => {
    return localLayers.find((l) => l.layerKey === selectedLayerKey);
  }, [localLayers, selectedLayerKey]);

  // Handlers
  const handleUpdateLayer = (updated: SceneLayerDraft | SceneLayerRecord) => {
    setLocalLayers((prev) => prev.map((l) => (l.layerKey === updated.layerKey ? updated : l)));
    setHasUnsavedChanges(true);
  };

  const handleToggleVisibility = (layerKey: string) => {
    setLocalLayers((prev) =>
      prev.map((l) => (l.layerKey === layerKey ? { ...l, visible: !l.visible } : l)),
    );
    setHasUnsavedChanges(true);
  };

  const handleSaveRevision = async () => {
    if (!projectDetail) return;
    try {
      await reviseMutation.mutateAsync({
        expectedVersionNumber: projectDetail.currentVersion.versionNumber,
        changeReason: changeReason || 'Adjusted layer positions & properties',
        operationCode: 'EDIT_LAYOUT',
        layers: localLayers,
      });
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Failed to save revision:', err);
    }
  };

  const handleRunValidation = async () => {
    try {
      const res = await validateMutation.mutateAsync({
        versionNumber: projectDetail?.currentVersion.versionNumber,
        layers: localLayers,
      });
      setValidationResult(res);
      setActiveTab('validation');
    } catch (err) {
      console.error('Validation error:', err);
    }
  };

  const handleTriggerRender = async () => {
    try {
      const res = await renderMutation.mutateAsync({
        versionNumber: projectDetail?.currentVersion.versionNumber,
        layers: localLayers,
      });
      setRenderResult(res);
      setActiveTab('render');
    } catch (err) {
      console.error('Render error:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[70vh] text-app-muted gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-brand-burgundy" />
        <span className="text-sm">Loading Creative Studio Workstation...</span>
      </div>
    );
  }

  if (error || !projectDetail) {
    return (
      <div className="p-8 rounded-2xl border border-red-500/20 bg-red-500/5 text-center text-red-400 max-w-lg mx-auto mt-12">
        <p className="font-semibold text-sm">Error Loading Creative Project</p>
        <p className="text-xs text-app-muted mt-1">{error?.message || 'Project not found'}</p>
        <Link
          to="/creative"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-burgundy"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Projects
        </Link>
      </div>
    );
  }

  const { project, currentVersion, productSnapshot, canEdit, canExport } = projectDetail;

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] space-y-3">
      {/* Workstation Top Bar */}
      <div className="px-4 py-2.5 rounded-xl border border-app-border bg-app-surface flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            to="/creative"
            className="p-1.5 rounded-lg border border-app-border hover:bg-app-surface-subtle text-app-muted hover:text-app-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-serif font-bold text-app-primary truncate max-w-md">
                {project.title}
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#EAD9BD]/20 text-[#5F4A2C] font-bold border border-[#EAD9BD]/40">
                {productSnapshot.sku}
              </span>
              <span className="text-[10px] font-mono font-bold text-brand-burgundy bg-brand-burgundy/10 px-1.5 py-0.5 rounded">
                v{currentVersion.versionNumber}
              </span>
            </div>
            <div className="text-[11px] text-app-muted truncate">
              {productSnapshot.brand} • {productSnapshot.productName} • $
              {productSnapshot.price.toFixed(2)} USD
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Safe Margins Guide Toggle */}
          <button
            type="button"
            onClick={() => setShowSafeMargins(!showSafeMargins)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              showSafeMargins
                ? 'border-[#A88448] bg-[#A88448]/10 text-[#A88448]'
                : 'border-app-border text-app-muted hover:text-app-primary'
            }`}
          >
            Safe Margins
          </button>

          {/* Validation Button */}
          <button
            type="button"
            disabled={validateMutation.isPending}
            onClick={handleRunValidation}
            className="px-3 py-1.5 rounded-lg border border-app-border hover:bg-app-surface-subtle text-xs font-medium text-app-primary flex items-center gap-1.5 transition-colors"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-app-muted" />
            Validate Gates
          </button>

          {/* Render Preview Button */}
          <button
            type="button"
            disabled={renderMutation.isPending}
            onClick={handleTriggerRender}
            className="px-3 py-1.5 rounded-lg border border-app-border hover:bg-app-surface-subtle text-xs font-medium text-app-primary flex items-center gap-1.5 transition-colors"
          >
            <Eye className="w-3.5 h-3.5 text-app-muted" />
            Render Preview
          </button>

          {/* Export Dialog Button */}
          <button
            type="button"
            onClick={() => setIsExportDialogOpen(true)}
            className="px-3.5 py-1.5 rounded-lg bg-brand-burgundy hover:bg-brand-burgundy/90 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>

          {/* Save Revision Button */}
          {canEdit && (
            <button
              type="button"
              disabled={!hasUnsavedChanges || reviseMutation.isPending}
              onClick={handleSaveRevision}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm ${
                hasUnsavedChanges
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-app-surface-subtle text-app-muted border border-app-border cursor-not-allowed opacity-60'
              }`}
            >
              {reviseMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Save Revision
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Main Studio Body: 3-column Layout */}
      <div className="flex-1 grid grid-cols-12 gap-3 min-h-0 overflow-hidden">
        {/* Left Column: Layers Panel (Col 3) */}
        <div className="col-span-12 lg:col-span-3 h-full min-h-0">
          <CreativeLayersPanel
            layers={localLayers}
            selectedLayerKey={selectedLayerKey}
            onSelectLayer={(key) => {
              setSelectedLayerKey(key);
              setActiveTab('properties');
            }}
            onToggleVisibility={handleToggleVisibility}
          />
        </div>

        {/* Center Column: Interactive Canvas Viewport (Col 5) */}
        <div className="col-span-12 lg:col-span-5 h-full min-h-0">
          <CreativeCanvas
            aspectRatio={currentVersion.aspectRatio}
            width={currentVersion.width}
            height={currentVersion.height}
            safeMargins={currentVersion.safeMargins}
            layers={localLayers}
            selectedLayerKey={selectedLayerKey}
            onSelectLayer={(key) => {
              setSelectedLayerKey(key);
              setActiveTab('properties');
            }}
            showSafeMargins={showSafeMargins}
          />
        </div>

        {/* Right Column: Tabbed Inspector (Col 4) */}
        <div className="col-span-12 lg:col-span-4 h-full min-h-0 flex flex-col bg-app-surface border border-app-border rounded-xl overflow-hidden">
          {/* Tab Headers */}
          <div className="px-2 py-1.5 bg-app-surface-subtle border-b border-app-border grid grid-cols-4 gap-1 text-[11px] font-semibold text-app-muted">
            <button
              type="button"
              onClick={() => setActiveTab('properties')}
              className={`py-1.5 px-2 rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'properties'
                  ? 'bg-app-surface text-app-primary shadow-sm'
                  : 'hover:text-app-primary'
              }`}
            >
              <Sliders className="w-3 h-3" />
              Props
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('validation')}
              className={`py-1.5 px-2 rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'validation'
                  ? 'bg-app-surface text-app-primary shadow-sm'
                  : 'hover:text-app-primary'
              }`}
            >
              <ShieldAlert className="w-3 h-3" />
              Gates
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('render')}
              className={`py-1.5 px-2 rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'render'
                  ? 'bg-app-surface text-app-primary shadow-sm'
                  : 'hover:text-app-primary'
              }`}
            >
              <Eye className="w-3 h-3" />
              Render
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`py-1.5 px-2 rounded-lg transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'history'
                  ? 'bg-app-surface text-app-primary shadow-sm'
                  : 'hover:text-app-primary'
              }`}
            >
              <History className="w-3 h-3" />
              History
            </button>
          </div>

          {/* Active Tab Panel */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {activeTab === 'properties' && (
              <CreativePropertiesPanel
                selectedLayer={selectedLayer}
                onUpdateLayer={handleUpdateLayer}
                disabled={!canEdit}
              />
            )}

            {activeTab === 'validation' && (
              <CreativeValidationPanel
                validationResult={validationResult}
                isValidating={validateMutation.isPending}
                onRunValidation={handleRunValidation}
              />
            )}

            {activeTab === 'render' && (
              <CreativeRenderPanel
                renderResult={renderResult}
                isRendering={renderMutation.isPending}
                onTriggerRender={handleTriggerRender}
              />
            )}

            {activeTab === 'history' && (
              <CreativeVersionHistory
                versions={versions}
                currentVersionNumber={currentVersion.versionNumber}
              />
            )}
          </div>
        </div>
      </div>

      {/* Export Dialog */}
      <CreativeExportDialog
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        canExport={canExport}
        jobStatus={project.creativeJobId ? 'READY_FOR_REVIEW' : 'DRAFT'}
        onExport={async (opts) => {
          return exportMutation.mutateAsync(opts);
        }}
      />
    </div>
  );
};
