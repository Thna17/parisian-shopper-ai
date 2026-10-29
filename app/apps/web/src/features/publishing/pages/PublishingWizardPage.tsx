import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  FileCheck,
  Key,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { PageHeader } from '../../../components/navigation/page-header.js';
import { Button } from '../../../components/ui/button.js';
import { Card } from '../../../components/ui/card.js';
import { Skeleton } from '../../../components/ui/skeleton.js';
import { ChannelBadge } from '../components/ChannelBadge.js';
import {
  useCreatePublication,
  useDestinations,
  useEligibleAssets,
} from '../hooks/use-publishing.js';
import { type EligibleAsset, PublicationChannel } from '../types/publishing.types.js';

export const PublishingWizardPage: React.FC = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedAsset, setSelectedAsset] = useState<EligibleAsset | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<PublicationChannel>(
    PublicationChannel.MANUAL_EXPORT,
  );
  const [idempotencyKey, setIdempotencyKey] = useState<string>(
    () => `pub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: assetsData, isLoading: isLoadingAssets } = useEligibleAssets({ limit: 50 });
  const { data: destinationsData } = useDestinations();
  const createMutation = useCreatePublication();

  const eligibleAssets = assetsData?.items ?? [];

  const handleSubmit = async () => {
    if (!selectedAsset) return;
    setErrorMessage(null);

    try {
      const result = await createMutation.mutateAsync({
        contentVersionId: selectedAsset.contentVersionId,
        destinationChannel: selectedChannel,
        idempotencyKey,
      });

      navigate(`/publishing/${result.id}`);
    } catch (err) {
      setErrorMessage((err as Error).message ?? 'Failed to create publication');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        eyebrow="Distribution Wizard"
        title="Create Publication Request"
        subtitle="Distribute verified content and visual assets to authorized internal and external destinations."
        actions={
          <Button
            variant="secondary"
            icon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate('/publishing')}
          >
            Back to Desk
          </Button>
        }
      />

      {/* Step Progress Indicators */}
      <div className="grid grid-cols-3 gap-2 border-b border-app-border pb-4">
        <div
          className={`flex items-center gap-2 p-2 rounded-lg text-xs font-semibold ${
            step === 1 ? 'bg-navy-50 text-navy-800' : 'text-app-muted'
          }`}
        >
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
              step > 1
                ? 'bg-emerald-500 text-white'
                : step === 1
                  ? 'bg-navy-700 text-white'
                  : 'bg-app-border text-app-muted'
            }`}
          >
            {step > 1 ? <Check className="w-3.5 h-3.5" /> : '1'}
          </div>
          <span>1. Select Asset</span>
        </div>

        <div
          className={`flex items-center gap-2 p-2 rounded-lg text-xs font-semibold ${
            step === 2 ? 'bg-navy-50 text-navy-800' : 'text-app-muted'
          }`}
        >
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
              step > 2
                ? 'bg-emerald-500 text-white'
                : step === 2
                  ? 'bg-navy-700 text-white'
                  : 'bg-app-border text-app-muted'
            }`}
          >
            {step > 2 ? <Check className="w-3.5 h-3.5" /> : '2'}
          </div>
          <span>2. Choose Destination</span>
        </div>

        <div
          className={`flex items-center gap-2 p-2 rounded-lg text-xs font-semibold ${
            step === 3 ? 'bg-navy-50 text-navy-800' : 'text-app-muted'
          }`}
        >
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
              step === 3 ? 'bg-navy-700 text-white' : 'bg-app-border text-app-muted'
            }`}
          >
            3
          </div>
          <span>3. Review & Dispatch</span>
        </div>
      </div>

      {errorMessage && (
        <Card className="p-4 bg-rose-50 border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{errorMessage}</span>
        </Card>
      )}

      {/* Step 1: Asset Selection */}
      {step === 1 && (
        <Card className="p-6 space-y-4 border border-app-border">
          <div>
            <h3 className="text-sm font-semibold text-app-primary">
              Select Approved Content Version
            </h3>
            <p className="text-xs text-app-muted mt-0.5">
              Only content versions that have received independent Four-Eyes approval are eligible.
            </p>
          </div>

          {isLoadingAssets ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          ) : eligibleAssets.length === 0 ? (
            <div className="p-8 text-center bg-app-surface rounded-lg border border-app-border">
              <FileCheck className="w-8 h-8 text-app-muted mx-auto mb-2" />
              <div className="text-sm font-medium text-app-primary">
                No Approved Content Versions Available
              </div>
              <p className="text-xs text-app-muted mt-1">
                Content must be reviewed and approved at the Four-Eyes Review Desk before it can be
                distributed.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {eligibleAssets.map((asset) => {
                const isSelected = selectedAsset?.contentVersionId === asset.contentVersionId;
                return (
                  <div
                    key={asset.contentVersionId}
                    onClick={() => setSelectedAsset(asset)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-gold-500 bg-gold-50/20 ring-1 ring-gold-500'
                        : 'border-app-border hover:border-app-border-hover bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                          isSelected
                            ? 'border-gold-600 bg-gold-500 text-white'
                            : 'border-app-border text-transparent'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-app-primary">
                          {asset.productName}
                        </div>
                        <div className="text-[11px] text-app-muted flex items-center gap-2 mt-0.5">
                          <span>Version #{asset.versionNumber}</span>
                          <span>•</span>
                          <span>Job: {asset.contentJobId.slice(0, 8)}…</span>
                          {asset.hasCreativeExports && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-700 font-medium">
                                Has Creative Export
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-[11px] text-app-muted">
                      Approved: {new Date(asset.approvedAt).toLocaleDateString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end pt-4 border-t border-app-border">
            <Button
              variant="primary"
              disabled={!selectedAsset}
              onClick={() => setStep(2)}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Continue to Destination
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Destination Channel Selection */}
      {step === 2 && (
        <Card className="p-6 space-y-4 border border-app-border">
          <div>
            <h3 className="text-sm font-semibold text-app-primary">Choose Destination Channel</h3>
            <p className="text-xs text-app-muted mt-0.5">
              Select an authorized channel destination. Channels are evaluated against platform
              readiness.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {destinationsData?.map((dest) => {
              const isSelected = selectedChannel === dest.channel;
              return (
                <div
                  key={dest.channel}
                  onClick={() => setSelectedChannel(dest.channel)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all space-y-2 ${
                    isSelected
                      ? 'border-gold-500 bg-gold-50/20 ring-1 ring-gold-500'
                      : 'border-app-border hover:border-app-border-hover bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <ChannelBadge channel={dest.channel} />
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        dest.enabled
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {dest.enabled ? 'Enabled' : 'Live Gated'}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-app-primary">{dest.displayName}</div>
                  <p className="text-[11px] text-app-muted leading-relaxed">
                    {dest.reason ?? 'Ready for production asset generation and dispatch.'}
                  </p>
                </div>
              );
            })}
          </div>

          {selectedChannel !== PublicationChannel.MANUAL_EXPORT && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-800 text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Live External Delivery Gated: </span>
                External social dispatches are currently disabled pending controlled publishing
                verification. Draft publication records will be created safely without pushing real
                external network calls.
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-app-border">
            <Button
              variant="secondary"
              onClick={() => setStep(1)}
              icon={<ArrowLeft className="w-4 h-4" />}
            >
              Back
            </Button>
            <Button
              variant="primary"
              onClick={() => setStep(3)}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Review Details
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3: Review & Dispatch */}
      {step === 3 && (
        <Card className="p-6 space-y-6 border border-app-border">
          <div>
            <h3 className="text-sm font-semibold text-app-primary">Review & Confirm Publication</h3>
            <p className="text-xs text-app-muted mt-0.5">
              Verify all distribution parameters before submitting the durable publication record.
            </p>
          </div>

          <div className="space-y-3 bg-app-surface p-4 rounded-xl border border-app-border text-xs">
            <div className="flex justify-between py-1 border-b border-app-border/60">
              <span className="text-app-muted font-medium">Selected Product:</span>
              <span className="font-semibold text-app-primary">{selectedAsset?.productName}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-app-border/60">
              <span className="text-app-muted font-medium">Content Version:</span>
              <span className="font-mono text-app-primary">
                Version #{selectedAsset?.versionNumber} (
                {selectedAsset?.contentVersionId.slice(0, 8)}…)
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-app-border/60">
              <span className="text-app-muted font-medium">Destination Channel:</span>
              <ChannelBadge channel={selectedChannel} />
            </div>
            <div className="flex justify-between py-1">
              <span className="text-app-muted font-medium">Idempotency Key:</span>
              <span className="font-mono text-[11px] text-app-primary">{idempotencyKey}</span>
            </div>
          </div>

          {/* Idempotency Key Customization */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-app-primary flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-gold-600" />
              <span>Idempotency Key (Duplicate Prevention)</span>
            </label>
            <input
              type="text"
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
              className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-app-border bg-white text-app-primary focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
            <p className="text-[11px] text-app-muted">
              Auto-generated unique token preventing duplicate submissions across network retries.
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-app-border">
            <Button
              variant="secondary"
              onClick={() => setStep(2)}
              icon={<ArrowLeft className="w-4 h-4" />}
            >
              Back
            </Button>
            <Button
              variant="gold"
              onClick={() => void handleSubmit()}
              isLoading={createMutation.isPending}
              icon={<Send className="w-4 h-4" />}
            >
              Submit Publication Request
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};
