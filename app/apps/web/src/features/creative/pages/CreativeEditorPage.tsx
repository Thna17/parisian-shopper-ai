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
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Send,
  X,
} from 'lucide-react';
import {
  useCreativeProjectDetail,
  useCreativeProjectVersions,
  useReviseCreativeProject,
  useValidateCreativeProject,
  useRenderCreativePreview,
  useExportCreativeProject,
  useApproveCreativeProject,
  useRejectCreativeProject,
  useSubmitCreativeProject,
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

  // Rejection modal
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Approval feedback
  const [approvalFeedback, setApprovalFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

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
  const approveMutation = useApproveCreativeProject(id!);
  const rejectMutation = useRejectCreativeProject(id!);
  const submitMutation = useSubmitCreativeProject(id!);

  const [validationResult, setValidationResult] = useState<ValidationAssessmentResult | null>(null);
  const [renderResult, setRenderResult] = useState<RenderPreviewResult | null>(null);

  useEffect(() => {
    setRenderResult(null);
  }, [projectDetail?.currentVersion.id]);

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

  const handleApproveScene = async () => {
    try {
      setApprovalFeedback(null);
      await approveMutation.mutateAsync({
        versionNumber: projectDetail?.currentVersion.versionNumber,
        sceneVersionId: projectDetail?.currentVersion.id,
      });
      setApprovalFeedback({ type: 'success', message: 'Creative scene approved successfully.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setApprovalFeedback({ type: 'error', message: msg });
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectReason.trim()) {
      setRejectError('Rejection reason is required.');
      return;
    }
    try {
      setRejectError(null);
      await rejectMutation.mutateAsync({
        reason: rejectReason.trim(),
        versionNumber: projectDetail?.currentVersion.versionNumber,
        sceneVersionId: projectDetail?.currentVersion.id,
      });
      setIsRejectModalOpen(false);
      setRejectReason('');
      setApprovalFeedback({ type: 'success', message: 'Creative scene rejected.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setRejectError(msg);
    }
  };

  const handleSubmitForReview = async () => {
    try {
      setApprovalFeedback(null);
      await submitMutation.mutateAsync({
        versionNumber: projectDetail?.currentVersion.versionNumber,
      });
      setApprovalFeedback({ type: 'success', message: 'Submitted for independent review.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setApprovalFeedback({ type: 'error', message: msg });
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

  const { project, currentVersion, productSnapshot, canEdit, canApprove, canExport } =
    projectDetail;
  const isSuperseded = project.currentVersionNumber > currentVersion.versionNumber;
  const sceneState = currentVersion.state?.status ?? 'DRAFT';
  const isApproved = sceneState === 'APPROVED';

  return (
    <div
      className="flex min-h-[calc(100vh-80px)] flex-col space-y-3"
      data-testid="creative-editor-page"
    >
      {projectDetail.sourceContentInvalid && (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700"
        >
          Source copy is invalid or uses an older format. Approval and export are unavailable in
          this view until it is repaired.
        </div>
      )}
      {/* Feedback Banner */}
      {approvalFeedback && (
        <div
          data-testid={`approval-feedback-${approvalFeedback.type}`}
          className={`px-4 py-2.5 rounded-xl border text-xs font-medium flex items-center justify-between ${
            approvalFeedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {approvalFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{approvalFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setApprovalFeedback(null)}
            className="p-1 rounded hover:bg-black/10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Superseded Version Warning Banner */}
      {isSuperseded && (
        <div
          data-testid="superseded-warning"
          className="px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs rounded-xl flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            This scene version (v{currentVersion.versionNumber}) is superseded by active revision v
            {project.currentVersionNumber}. Historical versions cannot be approved for publishing.
          </span>
        </div>
      )}

      {/* Workstation Top Bar */}
      <div className="px-4 py-2.5 rounded-xl border border-app-border bg-app-surface flex flex-wrap gap-3 items-center justify-between shrink-0 shadow-sm">
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
              <span
                data-testid="exact-version-badge"
                className="text-[10px] font-mono font-bold text-brand-burgundy bg-brand-burgundy/10 px-1.5 py-0.5 rounded"
              >
                v{currentVersion.versionNumber}
              </span>

              {/* Status Badge */}
              {isApproved && (
                <span
                  data-testid="status-approved-badge"
                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3 h-3" /> Approved
                </span>
              )}
              {sceneState === 'READY_FOR_REVIEW' && (
                <span
                  data-testid="status-review-badge"
                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30"
                >
                  In Review
                </span>
              )}
              {sceneState === 'REJECTED' && (
                <span
                  data-testid="status-rejected-badge"
                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/30"
                >
                  Rejected
                </span>
              )}
              {sceneState === 'DRAFT' && (
                <span
                  data-testid="status-draft-badge"
                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-500/10 text-zinc-400 border border-zinc-500/30"
                >
                  Draft
                </span>
              )}
            </div>
            <div className="text-[11px] text-app-muted truncate">
              {productSnapshot.brand} • {productSnapshot.productName} • $
              {typeof productSnapshot.price === 'number'
                ? productSnapshot.price.toFixed(2)
                : '0.00'}{' '}
              USD
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
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

          {/* Four-Eyes Approval Controls */}
          {sceneState === 'READY_FOR_REVIEW' && !isSuperseded && (
            <>
              {canApprove ? (
                <div className="flex items-center gap-1.5">
                  <button
                    data-testid="approve-scene-button"
                    type="button"
                    disabled={approveMutation.isPending || !renderResult || hasUnsavedChanges}
                    onClick={handleApproveScene}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    {approveMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    Approve poster
                  </button>

                  <button
                    data-testid="reject-scene-button"
                    type="button"
                    onClick={() => setIsRejectModalOpen(true)}
                    className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Request changes
                  </button>
                </div>
              ) : (
                <button
                  data-testid="self-approval-disabled-button"
                  type="button"
                  disabled
                  title={
                    projectDetail.approvalIneligibilityReasons?.join(' ') ?? 'Approval unavailable.'
                  }
                  className="px-3.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700 text-xs font-semibold cursor-not-allowed"
                >
                  Approval Unavailable
                </button>
              )}
            </>
          )}

          {/* Submit for Review (if DRAFT or REJECTED) */}
          {(sceneState === 'DRAFT' || sceneState === 'REJECTED') && !isSuperseded && canEdit && (
            <button
              data-testid="submit-review-button"
              type="button"
              disabled={submitMutation.isPending || projectDetail.sourceContentInvalid}
              onClick={handleSubmitForReview}
              className="px-3.5 py-1.5 rounded-lg border border-[#A88448] text-[#A88448] hover:bg-[#A88448]/10 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              {submitMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Submit for Review
            </button>
          )}

          {/* Export Dialog Button */}
          <button
            data-testid="export-dialog-button"
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

      {sceneState === 'READY_FOR_REVIEW' && (
        <section
          aria-labelledby="post-review-heading"
          className="shrink-0 rounded-xl border border-app-border bg-white p-4 text-app-primary"
        >
          <h2 id="post-review-heading" className="text-lg font-semibold">
            Review the post
          </h2>
          <p className="mt-1 text-sm text-app-muted">
            You are deciding on the poster. Its caption was reviewed separately; this decision does
            not approve a new caption.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">Poster preview</h3>
              {renderResult ? (
                <img
                  src={renderResult.previewUrl}
                  alt="Rendered poster preview"
                  className="mt-2 max-h-64 rounded-lg object-contain"
                />
              ) : (
                <p className="mt-2 text-sm">
                  No rendered preview is shown yet. Select “Render Preview” to see the saved poster
                  before deciding.
                </p>
              )}
              {renderMutation.isError && (
                <p role="alert" className="mt-2 text-sm text-red-700">
                  Could not load the poster preview. Try again or ask an administrator for help.
                </p>
              )}
              {canApprove && !renderResult && (
                <p className="mt-2 text-sm text-amber-800">
                  Open the rendered preview before approving this poster.
                </p>
              )}
              {hasUnsavedChanges && (
                <p role="alert" className="mt-2 text-sm text-amber-800">
                  Unsaved edits are not the saved version being reviewed.
                </p>
              )}
            </div>
            <div className="space-y-2 text-sm">
              <h3 className="font-semibold">Caption and product</h3>
              <p>
                {productSnapshot.productName} · {productSnapshot.brand} · {productSnapshot.currency}{' '}
                {productSnapshot.price.toFixed(2)}
              </p>
              <p>Campaign: {projectDetail.campaign?.name ?? 'No campaign linked'}</p>
              {projectDetail.contentVersion ? (
                <div className="space-y-2">
                  <p className="font-semibold">{projectDetail.contentVersion.headline}</p>
                  {projectDetail.contentVersion.englishCaption && (
                    <p className="whitespace-pre-wrap">
                      {projectDetail.contentVersion.englishCaption}
                    </p>
                  )}
                  {projectDetail.contentVersion.khmerCaption && (
                    <p className="whitespace-pre-wrap">
                      {projectDetail.contentVersion.khmerCaption}
                    </p>
                  )}
                  {projectDetail.contentVersion.cta && <p>{projectDetail.contentVersion.cta}</p>}
                  {projectDetail.contentVersion.hashtags && (
                    <p>{projectDetail.contentVersion.hashtags.join(' ')}</p>
                  )}
                </div>
              ) : (
                <p role="status">
                  The linked caption is unavailable in this view. Check the source before deciding.
                </p>
              )}
            </div>
          </div>
          {!canApprove && (
            <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
              You cannot approve this poster.{' '}
              {projectDetail.approvalIneligibilityReasons?.join(' ') ||
                'Ask an authorized colleague to review it.'}{' '}
              Ask an authorized colleague who did not create or edit it. A second account used by
              the same person is not an independent review.
            </p>
          )}
          <p className="mt-3 text-sm text-app-muted">
            If the poster is changed after approval, the new version needs validation and
            independent review again.
          </p>
        </section>
      )}

      {/* Main Studio Body: 3-column Layout */}
      <div className="grid min-h-0 grid-cols-12 gap-3 lg:min-h-[640px]">
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
        jobStatus={isApproved ? 'CREATIVE_APPROVED' : sceneState}
        onExport={async (opts) => {
          return exportMutation.mutateAsync(opts);
        }}
      />

      {/* Rejection Modal */}
      {isRejectModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-app-surface border border-app-border rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-app-border pb-3">
              <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
                <XCircle className="w-4 h-4" />
                Reject Creative Scene (v{currentVersion.versionNumber})
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsRejectModalOpen(false);
                  setRejectError(null);
                }}
                className="p-1 rounded text-app-muted hover:text-app-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label
                htmlFor="reject-reason-input"
                className="block text-xs font-semibold text-app-primary mb-1.5"
              >
                Rejection Reason (Mandatory)
              </label>
              <textarea
                id="reject-reason-input"
                data-testid="reject-reason-textarea"
                rows={3}
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  setRejectError(null);
                }}
                placeholder="Specify the brand, visual, or copy defect that requires remediation..."
                className="w-full p-2.5 rounded-xl border border-app-border bg-app-surface-subtle text-xs text-app-primary placeholder:text-app-muted focus:outline-none focus:ring-1 focus:ring-brand-burgundy resize-none"
              />
              {rejectError && (
                <p data-testid="reject-error-message" className="text-red-400 text-xs mt-1">
                  {rejectError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsRejectModalOpen(false);
                  setRejectError(null);
                }}
                className="px-3 py-1.5 rounded-lg border border-app-border text-xs text-app-muted hover:text-app-primary"
              >
                Cancel
              </button>
              <button
                data-testid="confirm-reject-button"
                type="button"
                disabled={rejectMutation.isPending}
                onClick={handleConfirmReject}
                className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5"
              >
                {rejectMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
