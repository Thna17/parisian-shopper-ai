import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { PageHeader } from '../../../components/navigation/page-header.js';
import { Button } from '../../../components/ui/button.js';
import { Card } from '../../../components/ui/card.js';
import { Input } from '../../../components/ui/input.js';
import { Label } from '../../../components/ui/label.js';
import { useCreateCampaign } from '../hooks/use-campaigns.js';

type WizardStep = 1 | 2 | 3;

export const CampaignCreationWizard: React.FC = () => {
  const navigate = useNavigate();
  const createMutation = useCreateCampaign();

  const [step, setStep] = useState<WizardStep>(1);

  // Form State
  const [code, setCode] = useState('');
  const [isCodeManuallyEdited, setIsCodeManuallyEdited] = useState(false);
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-generate code from name if code hasn't been manually edited
  const handleNameChange = (val: string) => {
    setName(val);
    if (!isCodeManuallyEdited) {
      const generated = val
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setCode(generated ? `CAMP-${generated.slice(0, 16)}` : '');
    }
  };

  const validateStep1 = (): boolean => {
    setErrorMsg(null);
    if (!code.trim()) {
      setErrorMsg('Campaign code is required (e.g. CAMP-SUMMER-2026).');
      return false;
    }
    if (!name.trim()) {
      setErrorMsg('Campaign name is required.');
      return false;
    }
    if (!objective.trim()) {
      setErrorMsg('Marketing objective is required.');
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    setErrorMsg(null);
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (end < start) {
        setErrorMsg('Campaign end date cannot be earlier than start date.');
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1) {
      if (validateStep1()) setStep(2);
    } else if (step === 2) {
      if (validateStep2()) setStep(3);
    }
  };

  const handleBack = () => {
    setErrorMsg(null);
    if (step > 1) {
      setStep((s) => (s - 1) as WizardStep);
    }
  };

  const handleSubmit = async () => {
    setErrorMsg(null);
    try {
      const campaign = await createMutation.mutateAsync({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        objective: objective.trim(),
        description: description.trim() || null,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        endDate: endDate ? new Date(endDate).toISOString() : null,
      });

      // Navigate to detail page where merchandiser associates verified products
      navigate(`/campaigns/${campaign.id}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create campaign');
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Back Link */}
      <Link
        to="/campaigns"
        className="inline-flex items-center gap-1.5 text-xs text-app-muted hover:text-app-primary transition-colors font-medium mb-1"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Campaigns</span>
      </Link>

      <PageHeader
        eyebrow="Commercial Activation Wizard"
        title="Initialize New Campaign"
        subtitle="Step-by-step campaign setup. Define identity, configure scheduling, and initialize in Draft status ready for product association."
      />

      {/* Wizard Step Indicator */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { num: 1, label: 'Identity & Objective', icon: <Layers className="w-4 h-4" /> },
          { num: 2, label: 'Schedule & Scope', icon: <Calendar className="w-4 h-4" /> },
          { num: 3, label: 'Review & Initialize', icon: <CheckCircle2 className="w-4 h-4" /> },
        ].map((item) => {
          const isActive = step === item.num;
          const isPassed = step > item.num;

          return (
            <div
              key={item.num}
              className={`p-3 rounded-xl border transition-all ${
                isActive
                  ? 'border-gold-500 bg-gold-500/10 shadow-sm'
                  : isPassed
                    ? 'border-app-border bg-app-surface text-app-primary'
                    : 'border-app-border/60 bg-app-surface-subtle text-app-muted opacity-60'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                    isActive
                      ? 'bg-gold-500 text-white'
                      : isPassed
                        ? 'bg-[#23856B] text-white'
                        : 'bg-app-border text-app-muted'
                  }`}
                >
                  {isPassed ? '✓' : item.num}
                </span>
                <span className="text-xs font-semibold truncate text-app-primary">
                  {item.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-status-bad/10 border border-status-bad/20 flex items-center gap-2.5 text-xs text-status-bad">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Step Form Card */}
      <Card elevation="subtle" className="p-6">
        {/* STEP 1: Campaign Identity */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-app-primary mb-1">
                Campaign Identity & Strategic Objective
              </h3>
              <p className="text-xs text-app-muted mb-4">
                Provide a unique operational campaign code and commercial purpose.
              </p>
            </div>

            <div>
              <Label
                htmlFor="campaignName"
                className="text-xs font-semibold text-app-primary mb-1 block"
              >
                Campaign Name *
              </Label>
              <Input
                id="campaignName"
                type="text"
                placeholder="e.g. Rose Impériale Spring Spotlight"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </div>

            <div>
              <Label
                htmlFor="campaignCode"
                className="text-xs font-semibold text-app-primary mb-1 block"
              >
                Unique Campaign Code (Monospace Identifier) *
              </Label>
              <Input
                id="campaignCode"
                type="text"
                placeholder="e.g. CAMP-ROSE-2026"
                value={code}
                onChange={(e) => {
                  setIsCodeManuallyEdited(true);
                  setCode(e.target.value.toUpperCase());
                }}
                className="font-mono uppercase"
              />
              <span className="text-[10px] text-app-muted mt-1 block">
                Used in API endpoints, audit attribution, and content generation tracking.
              </span>
            </div>

            <div>
              <Label
                htmlFor="campaignObjective"
                className="text-xs font-semibold text-app-primary mb-1 block"
              >
                Commercial Objective *
              </Label>
              <textarea
                id="campaignObjective"
                rows={3}
                placeholder="e.g. Drive luxury perfume conversions for Mother's Day with focus on Maison Royale niche floral bouquets."
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-xs focus:ring-1 focus:ring-gold-500"
              />
            </div>
          </div>
        )}

        {/* STEP 2: Schedule & Activation Period */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-app-primary mb-1">
                Schedule & Activation Period
              </h3>
              <p className="text-xs text-app-muted mb-4">
                Optional scheduling dates for campaign runtime. Can be adjusted later in Draft
                status.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label
                  htmlFor="startDate"
                  className="text-xs font-semibold text-app-primary mb-1 block"
                >
                  Campaign Start Date
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <Label
                  htmlFor="endDate"
                  className="text-xs font-semibold text-app-primary mb-1 block"
                >
                  Campaign End Date
                </Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label
                htmlFor="description"
                className="text-xs font-semibold text-app-primary mb-1 block"
              >
                Scope, Description & Channels (Optional)
              </Label>
              <textarea
                id="description"
                rows={3}
                placeholder="e.g. Multi-channel activation across Telegram VIP subscribers, Instagram Stories, and showroom display banners."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-xs focus:ring-1 focus:ring-gold-500"
              />
            </div>
          </div>
        )}

        {/* STEP 3: Review & Initialize */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-app-primary mb-1">
                Review & Initialize Campaign
              </h3>
              <p className="text-xs text-app-muted mb-4">
                Confirm campaign parameters. The campaign will be created in{' '}
                <strong className="text-app-primary">DRAFT</strong> status.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-app-surface-subtle border border-app-border/80 space-y-3 text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-app-border/60">
                <span className="text-app-muted">Campaign Code:</span>
                <span className="font-mono font-bold text-gold-500">{code}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-app-border/60">
                <span className="text-app-muted">Name:</span>
                <span className="font-bold text-app-primary">{name}</span>
              </div>
              <div className="py-1.5 border-b border-app-border/60">
                <span className="text-app-muted block mb-1">Objective:</span>
                <span className="font-medium text-app-primary leading-relaxed">{objective}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-app-border/60">
                <span className="text-app-muted">Schedule:</span>
                <span className="font-medium text-app-primary">
                  {startDate && endDate
                    ? `${startDate} to ${endDate}`
                    : startDate
                      ? `Starts ${startDate}`
                      : 'Unscheduled'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-app-muted">Initial Lifecycle Status:</span>
                <span className="font-semibold text-app-primary">DRAFT</span>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-gold-500/10 border border-gold-500/20 flex items-center gap-2.5 text-xs text-gold-700 dark:text-gold-300">
              <Sparkles className="w-4 h-4 shrink-0 text-gold-500" />
              <span>
                After initialization, you will be redirected to associate verified catalog product
                snapshots and configure proposed promotional pricing targets.
              </span>
            </div>
          </div>
        )}

        {/* Wizard Navigation Actions */}
        <div className="pt-6 mt-6 border-t border-app-border flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={step === 1 ? () => navigate('/campaigns') : handleBack}
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>

          {step < 3 ? (
            <Button
              type="button"
              variant="gold"
              onClick={handleNext}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Next Step
            </Button>
          ) : (
            <Button
              type="button"
              variant="gold"
              onClick={handleSubmit}
              isLoading={createMutation.isPending}
              icon={<CheckCircle2 className="w-4 h-4" />}
            >
              Initialize Campaign
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
};
