import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Sparkles, Package, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { productsApi } from '../../products/api/products-api.js';
import { contentApi } from '../../content/api/content-api.js';
import { useCreateCreativeProject, useCreativeTemplates } from '../hooks/use-creative.js';
import { CreativeFormatSelector } from '../components/CreativeFormatSelector.js';
import { CreativeTemplatePicker } from '../components/CreativeTemplatePicker.js';
import type { PosterAspectRatio, SceneLanguage, SceneTemplateId } from '../types/creative.types.js';

export const CreativeWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Form State
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedContentVersionId, setSelectedContentVersionId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<SceneTemplateId>('EDITORIAL_SPLIT');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<PosterAspectRatio>('1:1');
  const [selectedLanguage] = useState<SceneLanguage>('EN');
  const [projectTitle, setProjectTitle] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Queries
  const { data: productsData, isLoading: isLoadingProducts } = useQuery({
    queryKey: ['products-for-creative'],
    queryFn: () => productsApi.getProducts({ limit: 50 }),
  });

  const { data: contentJobsData, isLoading: isLoadingContentJobs } = useQuery({
    queryKey: ['content-jobs-for-creative', selectedProductId],
    queryFn: () => contentApi.getJobs({ limit: 50 }),
    enabled: Boolean(selectedProductId),
  });

  const { data: templates = [] } = useCreativeTemplates();
  const createMutation = useCreateCreativeProject();

  const selectedProduct = productsData?.data.find((p) => p.id === selectedProductId);

  // Set default title when product is selected
  const handleSelectProduct = (productId: string) => {
    setSelectedProductId(productId);
    const prod = productsData?.data.find((p) => p.id === productId);
    if (prod && !projectTitle) {
      setProjectTitle(`${prod.title} — Official Poster`);
    }
  };

  const handleNext = () => {
    setErrorMessage(null);
    if (currentStep === 1 && !selectedProductId) {
      setErrorMessage('Please select a verified product to continue.');
      return;
    }
    if (currentStep === 2 && !selectedContentVersionId) {
      setErrorMessage('Please select an authorized content version.');
      return;
    }
    if (currentStep === 3 && !selectedTemplateId) {
      setErrorMessage('Please select a poster template.');
      return;
    }
    setCurrentStep((prev) => Math.min(4, prev + 1) as any);
  };

  const handleBack = () => {
    setErrorMessage(null);
    setCurrentStep((prev) => Math.max(1, prev - 1) as any);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectTitle.trim()) {
      setErrorMessage('Project title is required.');
      return;
    }
    if (!selectedProductId || !selectedContentVersionId) {
      setErrorMessage('Required associations missing.');
      return;
    }

    try {
      const result = await createMutation.mutateAsync({
        title: projectTitle.trim(),
        productSnapshotId: selectedProductId,
        sourceContentVersionId: selectedContentVersionId,
        templateId: selectedTemplateId,
        aspectRatio: selectedAspectRatio,
        language: selectedLanguage,
      });

      navigate(`/creative/projects/${result.scene.id}`);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to initialize creative project');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-app-border">
        <div className="flex items-center gap-3">
          <Link
            to="/creative"
            className="p-2 rounded-lg border border-app-border hover:bg-app-surface text-app-muted hover:text-app-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-serif font-bold text-app-primary">
              New Creative Poster Composition
            </h1>
            <p className="text-xs text-app-muted">
              Step {currentStep} of 4: {getStepTitle(currentStep)}
            </p>
          </div>
        </div>
      </div>

      {/* Stepper Wizard Progress */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { step: 1, label: 'Product Snapshot' },
          { step: 2, label: 'Content Version' },
          { step: 3, label: 'Template & Format' },
          { step: 4, label: 'Review & Initialize' },
        ].map((s) => (
          <div
            key={s.step}
            className={`p-2.5 rounded-lg border text-center transition-all ${
              currentStep === s.step
                ? 'border-brand-burgundy bg-brand-burgundy/5 text-brand-burgundy font-semibold'
                : currentStep > s.step
                  ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400 font-medium'
                  : 'border-app-border bg-app-surface text-app-muted'
            }`}
          >
            <div className="text-[11px] font-mono">Step {s.step}</div>
            <div className="text-xs truncate">{s.label}</div>
          </div>
        ))}
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          {errorMessage}
        </div>
      )}

      {/* Step 1: Select Verified Product */}
      {currentStep === 1 && (
        <div className="p-6 rounded-2xl border border-app-border bg-app-surface space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-app-primary uppercase tracking-wider">
              Select Verified Product Snapshot
            </h3>
            <p className="text-xs text-app-muted mt-1">
              Every poster must be anchored to an immutable ProductSnapshot with verified MSRP
              truth.
            </p>
          </div>

          {isLoadingProducts ? (
            <div className="text-center py-12 text-app-muted">Loading products...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
              {productsData?.data.map((product) => {
                const isSelected = selectedProductId === product.id;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleSelectProduct(product.id)}
                    className={`p-4 rounded-xl border text-left transition-all flex items-start gap-3.5 ${
                      isSelected
                        ? 'border-brand-burgundy bg-brand-burgundy/5 ring-1 ring-brand-burgundy'
                        : 'border-app-border bg-app-surface hover:border-app-muted/60'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-app-surface-subtle border border-app-border flex items-center justify-center shrink-0">
                      <Package className="w-5 h-5 text-brand-burgundy" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#EAD9BD]/20 text-[#5F4A2C]">
                          {product.sku}
                        </span>
                        <span className="text-xs font-mono font-bold text-app-primary">
                          ${product.price.amount.toFixed(2)} {product.price.currency}
                        </span>
                      </div>
                      <div className="font-semibold text-xs text-app-primary truncate">
                        {product.title}
                      </div>
                      <div className="text-[11px] text-app-muted truncate">{product.brand}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Select Content Version */}
      {currentStep === 2 && (
        <div className="p-6 rounded-2xl border border-app-border bg-app-surface space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-app-primary uppercase tracking-wider">
              Select Source Content Version
            </h3>
            <p className="text-xs text-app-muted mt-1">
              Select the validated headline and advertising copy that will populate the poster
              typography.
            </p>
          </div>

          {isLoadingContentJobs ? (
            <div className="text-center py-12 text-app-muted">Loading content versions...</div>
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {contentJobsData?.items.map((job) => {
                // Use job's latest contentVersion or dummy fallback
                const versionId = job.id; // job id or associated version
                const isSelected = selectedContentVersionId === versionId;

                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => setSelectedContentVersionId(versionId)}
                    className={`p-4 rounded-xl border text-left w-full transition-all ${
                      isSelected
                        ? 'border-brand-burgundy bg-brand-burgundy/5 ring-1 ring-brand-burgundy'
                        : 'border-app-border bg-app-surface hover:border-app-muted/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-app-primary">
                        Content Job #{job.id.substring(0, 8)}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">
                        {job.status}
                      </span>
                    </div>
                    <p className="text-xs text-app-primary leading-relaxed mb-2">
                      &quot;{job.contentType} • Language: {job.language}&quot;
                    </p>
                    <div className="text-[10px] text-app-muted font-mono flex items-center gap-2">
                      <span>Platform: {job.platform ?? 'Omnichannel'}</span>
                      <span>•</span>
                      <span>Created: {new Date(job.createdAt).toLocaleDateString()}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Select Template & Format */}
      {currentStep === 3 && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-app-border bg-app-surface">
            <CreativeFormatSelector value={selectedAspectRatio} onChange={setSelectedAspectRatio} />
          </div>

          <div className="p-6 rounded-2xl border border-app-border bg-app-surface">
            <CreativeTemplatePicker
              templates={templates}
              selectedId={selectedTemplateId}
              onSelect={setSelectedTemplateId}
            />
          </div>
        </div>
      )}

      {/* Step 4: Review & Initialize */}
      {currentStep === 4 && (
        <form
          onSubmit={handleSubmit}
          className="p-6 rounded-2xl border border-app-border bg-app-surface space-y-6"
        >
          <div>
            <h3 className="text-sm font-semibold text-app-primary uppercase tracking-wider mb-1">
              Initialize Scene Composition
            </h3>
            <p className="text-xs text-app-muted">
              Confirm poster configuration to generate the initial deterministic scene graph.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-app-primary uppercase tracking-wider mb-2 block">
              Poster Project Title
            </label>
            <input
              type="text"
              required
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-app-border bg-app-surface text-app-primary text-xs focus:ring-1 focus:ring-brand-burgundy outline-none"
              placeholder="e.g. Moonlit River Summer Campaign Launch Poster"
            />
          </div>

          {/* Summary checklist */}
          <div className="p-4 rounded-xl bg-app-surface-subtle border border-app-border text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-app-muted">Selected Product:</span>
              <span className="font-semibold text-app-primary">
                {selectedProduct?.sku} — {selectedProduct?.title}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-app-muted">Catalog MSRP Truth:</span>
              <span className="font-mono font-bold text-app-primary">
                ${selectedProduct?.price.amount.toFixed(2)} {selectedProduct?.price.currency}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-app-muted">Template:</span>
              <span className="font-semibold text-app-primary">{selectedTemplateId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-app-muted">Canvas Aspect Ratio:</span>
              <span className="font-mono text-app-primary">{selectedAspectRatio}</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-app-border">
            <button
              type="button"
              onClick={handleBack}
              className="px-4 py-2.5 rounded-lg border border-app-border text-xs font-semibold text-app-primary hover:bg-app-surface-subtle transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-5 py-2.5 rounded-lg bg-brand-burgundy hover:bg-brand-burgundy/90 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow disabled:opacity-50"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Initializing Scene Graph...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Create & Launch Studio
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Stepper Navigation Buttons (Steps 1 to 3) */}
      {currentStep < 4 && (
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            disabled={currentStep === 1}
            onClick={handleBack}
            className="px-4 py-2.5 rounded-lg border border-app-border text-xs font-semibold text-app-primary hover:bg-app-surface transition-colors disabled:opacity-30"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="px-5 py-2.5 rounded-lg bg-brand-burgundy text-white text-xs font-semibold flex items-center gap-2 hover:bg-brand-burgundy/90 transition-colors shadow"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

function getStepTitle(step: number): string {
  switch (step) {
    case 1:
      return 'Select Verified Product Snapshot';
    case 2:
      return 'Select Authorized Content Version';
    case 3:
      return 'Choose Canonical Template & Ratio';
    case 4:
      return 'Review & Initialize Scene Graph';
    default:
      return '';
  }
}
