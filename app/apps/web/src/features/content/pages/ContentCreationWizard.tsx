import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, ShieldAlert, Sparkles } from 'lucide-react';

import type { ProductSummary } from '../../products/types/product.types.js';
import type {
  ContentLanguage,
  ContentPlatform,
  ContentType,
  CreateContentJobPayload,
} from '../types/content.types.js';
import { useCreateContentJob } from '../hooks/use-content.js';
import { ProductContextSelector } from '../components/ProductContextSelector.js';
import { CampaignContextSelector } from '../components/CampaignContextSelector.js';

const CONTENT_TYPE_OPTIONS: Array<{
  value: ContentType;
  label: string;
  description: string;
}> = [
  {
    value: 'PRODUCT_SPOTLIGHT',
    label: 'Product Spotlight',
    description: 'Luxury craftsmanship, olfactory character, and emotional allure.',
  },
  {
    value: 'SCENT_PYRAMID',
    label: 'Scent Pyramid',
    description: 'Structured exploration of top, heart, and base notes.',
  },
  {
    value: 'EDUCATIONAL',
    label: 'Educational & Rituals',
    description: 'Application rituals, longevity preservation, and perfume etiquette.',
  },
  {
    value: 'ENGAGEMENT',
    label: 'Lifestyle & Engagement',
    description: 'Social conversational prompt connecting luxury fragrance with lifestyle.',
  },
  {
    value: 'PROMOTION',
    label: 'Promotional Campaign',
    description: 'Active commercial discount announcement (requires verified promotion).',
  },
];

const LANGUAGE_OPTIONS: Array<{
  value: ContentLanguage;
  label: string;
  flag: string;
}> = [
  { value: 'BILINGUAL', label: 'Bilingual (Khmer + English)', flag: '🇰🇭 🇬🇧' },
  { value: 'KM', label: 'Khmer Only', flag: '🇰🇭' },
  { value: 'EN', label: 'English Only', flag: '🇬🇧' },
];

const PLATFORM_OPTIONS: Array<{
  value: ContentPlatform;
  label: string;
  desc: string;
}> = [
  {
    value: 'TELEGRAM',
    label: 'Telegram VIP Channel',
    desc: 'Formatted with luxury bullet points and direct shopper CTA.',
  },
  {
    value: 'INSTAGRAM',
    label: 'Instagram Captions',
    desc: 'Aesthetic luxury copy with curated hashtag blocks.',
  },
  {
    value: 'FACEBOOK',
    label: 'Facebook Commercial',
    desc: 'Extended brand storytelling and rich audience engagement.',
  },
  {
    value: 'GENERIC',
    label: 'Generic Multi-Platform',
    desc: 'Universal luxury marketing copy ready for adaptation.',
  },
];

export function ContentCreationWizard(): React.JSX.Element {
  const navigate = useNavigate();
  const createJob = useCreateContentJob();

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedProduct, setSelectedProduct] = useState<ProductSummary | null>(null);
  const [language, setLanguage] = useState<ContentLanguage>('BILINGUAL');
  const [contentType, setContentType] = useState<ContentType>('PRODUCT_SPOTLIGHT');
  const [platform, setPlatform] = useState<ContentPlatform>('TELEGRAM');
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canProceedStep1 = selectedProduct !== null;
  const canProceedStep2 = Boolean(contentType) && Boolean(language);
  const canProceedStep3 = Boolean(platform);

  const handleProductSelect = (product: ProductSummary): void => {
    setSelectedProduct(product);
  };

  const handleSubmit = async (): Promise<void> => {
    if (!selectedProduct) return;
    setSubmitError(null);

    const payload: CreateContentJobPayload = {
      productSnapshotId: selectedProduct.id,
      contentType,
      language,
      platform,
      campaignId: campaignId ?? undefined,
    };

    try {
      const createdJob = await createJob.mutateAsync(payload);
      navigate(`/content/jobs/${createdJob.id}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to create content generation job';
      setSubmitError(message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <Link
            to="/content"
            className="p-2 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-serif font-semibold text-neutral-900 dark:text-neutral-100">
              Create AI Marketing Content
            </h1>
            <p className="text-xs text-neutral-500">
              Step {step} of 4 —{' '}
              {step === 1
                ? 'Select Verified Product'
                : step === 2
                  ? 'Strategy & Language'
                  : step === 3
                    ? 'Platform & Campaign'
                    : 'Review & Enqueue Job'}
            </p>
          </div>
        </div>

        {/* Step Progress Indicators */}
        <div className="hidden sm:flex items-center gap-2">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                s === step
                  ? 'bg-amber-600 text-white ring-2 ring-amber-600/30'
                  : s < step
                    ? 'bg-emerald-600 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'
              }`}
            >
              {s < step ? '✓' : s}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Select Verified Product */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                1. Select Product Context
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Content is anchored to immutable verified catalog facts (MSRP price, olfactory
                notes, brand lineage).
              </p>
            </div>
            {selectedProduct && (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Selected: {selectedProduct.title}
              </span>
            )}
          </div>

          <ProductContextSelector
            selectedSnapshotId={selectedProduct?.id ?? null}
            onSelect={handleProductSelect}
          />

          <div className="flex justify-end pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              disabled={!canProceedStep1}
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-amber-600 dark:hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue to Strategy
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Choose Strategy and Language */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              2. Content Strategy & Language
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Select the editorial angle and language orientation for the luxury marketing copy.
            </p>
          </div>

          {/* Language Selection */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
              Target Language
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {LANGUAGE_OPTIONS.map((lang) => (
                <button
                  key={lang.value}
                  type="button"
                  onClick={() => setLanguage(lang.value)}
                  className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                    language === lang.value
                      ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-500 shadow-sm ring-1 ring-amber-500'
                      : 'bg-white dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 hover:border-neutral-300'
                  }`}
                >
                  <span className="text-xl">{lang.flag}</span>
                  <div>
                    <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      {lang.label}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Content Type / Strategy Selection */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
              Editorial Strategy
            </label>
            <div className="space-y-2.5">
              {CONTENT_TYPE_OPTIONS.map((strat) => (
                <button
                  key={strat.value}
                  type="button"
                  onClick={() => setContentType(strat.value)}
                  className={`w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${
                    contentType === strat.value
                      ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-500 shadow-sm ring-1 ring-amber-500'
                      : 'bg-white dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 hover:border-neutral-300'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      contentType === strat.value
                        ? 'bg-amber-600 text-white'
                        : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      {strat.label}
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5">{strat.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 px-4 py-2 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-medium rounded-xl transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              type="button"
              disabled={!canProceedStep2}
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-amber-600 dark:hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors disabled:opacity-40"
            >
              Continue to Platform & Campaign
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Target Platform & Campaign Association */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              3. Target Platform & Campaign Context
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Format for your publishing destination and optionally link to an active promotional
              campaign.
            </p>
          </div>

          {/* Platform Selection */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
              Distribution Platform
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PLATFORM_OPTIONS.map((ch) => (
                <button
                  key={ch.value}
                  type="button"
                  onClick={() => setPlatform(ch.value)}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    platform === ch.value
                      ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-500 shadow-sm ring-1 ring-amber-500'
                      : 'bg-white dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 hover:border-neutral-300'
                  }`}
                >
                  <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                    {ch.label}
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">{ch.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Optional Campaign Association */}
          <CampaignContextSelector selectedCampaignId={campaignId} onSelect={setCampaignId} />

          <div className="flex justify-between pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 px-4 py-2 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-medium rounded-xl transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              type="button"
              disabled={!canProceedStep3}
              onClick={() => setStep(4)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-amber-600 dark:hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors disabled:opacity-40"
            >
              Review & Enqueue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Review and Generate */}
      {step === 4 && selectedProduct && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              4. Review & Enqueue Content Generation
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Confirm the parameters before enqueuing the background BullMQ generation job.
            </p>
          </div>

          {submitError && (
            <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-800 dark:text-red-300 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              Job Configuration Summary
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl space-y-1">
                <span className="text-neutral-400 font-medium">Product / SKU:</span>
                <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {selectedProduct.title} ({selectedProduct.sku})
                </p>
                <p className="text-neutral-500 font-mono">
                  MSRP: ${selectedProduct.price.amount.toFixed(2)}
                </p>
              </div>

              <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl space-y-1">
                <span className="text-neutral-400 font-medium">Brand & Lineage:</span>
                <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {selectedProduct.brand}
                </p>
                <p className="text-neutral-500">Category: {selectedProduct.category}</p>
              </div>

              <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl space-y-1">
                <span className="text-neutral-400 font-medium">Strategy & Language:</span>
                <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {contentType} • {language}
                </p>
              </div>

              <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl space-y-1">
                <span className="text-neutral-400 font-medium">Platform & Campaign:</span>
                <p className="font-semibold text-neutral-900 dark:text-neutral-100">{platform}</p>
                <p className="text-neutral-500">
                  {campaignId ? `Campaign ID: ${campaignId}` : 'Standalone Spotlight'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              disabled={createJob.isPending}
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-2 px-4 py-2 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-medium rounded-xl transition-colors disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <button
              type="button"
              disabled={createJob.isPending}
              onClick={() => void handleSubmit()}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-amber-600 dark:hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createJob.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enqueuing Generation Job...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Brand-Safe Copy
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
