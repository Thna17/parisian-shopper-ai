import React, { useEffect, useState } from 'react';
import {
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Plus,
  Layers,
  Languages,
  Ban,
  RefreshCw,
} from 'lucide-react';
import { brandApi } from '../api/brand-api.js';
import { createParisianPageDraft } from '../parisian-page-draft.js';
import type { BrandProfileVersionRecord, CreateBrandProfileInput } from '../types/brand.types.js';
import { Badge } from '../../../components/ui/badge.js';
import { Button } from '../../../components/ui/button.js';

export const BrandProfilePage: React.FC = () => {
  const [activeProfile, setActiveProfile] = useState<BrandProfileVersionRecord | null>(null);
  const [profiles, setProfiles] = useState<readonly BrandProfileVersionRecord[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<BrandProfileVersionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Rollback modal state
  const [rollbackTargetId, setRollbackTargetId] = useState<string | null>(null);
  const [rollbackReason, setRollbackReason] = useState('');
  const [isRollbackOpen, setIsRollbackOpen] = useState(false);

  // Create Draft modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftSource, setDraftSource] = useState<'current' | 'page'>('page');
  const [draftColor, setDraftColor] = useState('#B52230');
  const [draftTone, setDraftTone] = useState('Warm, helpful and clear');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [active, all] = await Promise.all([
        brandApi.getActiveBrandProfile(),
        brandApi.listBrandProfiles(),
      ]);
      setActiveProfile(active);
      setProfiles(all);
      setSelectedProfile(active || all[0] || null);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load brand profiles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleActivate = async (id: string) => {
    try {
      setActionLoading(true);
      setError(null);
      await brandApi.activateBrandProfile(id);
      setSuccessMessage(`Profile version activated successfully.`);
      await loadData();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to activate profile.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRollback = async () => {
    if (!rollbackTargetId) return;
    try {
      setActionLoading(true);
      setError(null);
      await brandApi.rollbackBrandProfile(rollbackTargetId, rollbackReason);
      setSuccessMessage('Emergency rollback completed successfully.');
      setIsRollbackOpen(false);
      setRollbackReason('');
      await loadData();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to execute rollback.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftName.trim()) return;
    try {
      setActionLoading(true);
      setError(null);
      const payload: CreateBrandProfileInput = {
        name: draftName.trim(),
        evaluationPolicyId: 'default-anti-regurgitation-policy-v1',
        languagePolicy: activeProfile?.languagePolicy ?? {
          formality: 'LUXURY_FORMAL',
          primaryLanguage: 'BILINGUAL',
          khmerConventions: {
            scriptStyle: 'Moul',
            spacingRules: 'Zero-width space between phrases, standard punctuation',
            disallowedLoanwords: ['discount', 'cheap', 'best price'],
          },
          englishConventions: {
            tone: 'Understated Parisian Elegance',
            capitalization: 'SENTENCE_CASE',
          },
        },
        toneRules: activeProfile?.toneRules ?? {
          luxuryAttributes: ['Elegance', 'Exclusivity', 'Restraint', 'Clarity'],
          prohibitedHyperbole: [
            'cheapest',
            'unbelievable deal',
            '100% best',
            'crazy price',
            'free giveaway',
          ],
          allowedEmojis: ['✨', '💎', '🏛️', '🌿'],
          maxEmojisPerPost: 2,
        },
        visualAestheticRules: activeProfile?.visualAestheticRules ?? {
          approvedColorPalettes: [
            { name: 'Haussmann Cream & Obsidian', hexCodes: ['#F9F6F0', '#1A1A1A', '#C9A96E'] },
          ],
          lightingStyles: ['Soft Daylight Atelier', 'Nocturne Chiaroscuro'],
          textures: ['Fine French Linen', 'Brushed Brass', 'Carrara Marble'],
          pedestals: ['Minimalist Stone Slab', 'Parisian Parquet'],
        },
        typographyRules: activeProfile?.typographyRules ?? {
          headlineFont: 'Playfair Display',
          bodyFontKhmer: 'Battambang',
          bodyFontLatin: 'Inter',
          minimumLeadingRatio: 1.4,
        },
        logoRules: activeProfile?.logoRules ?? {
          clearSpaceRatio: 0.25,
          allowedPlacements: ['TOP_CENTER', 'BOTTOM_CENTER'],
          defaultVariant: 'GOLD',
        },
        approvedExampleIds: activeProfile?.approvedExampleIds ?? [],
        prohibitedPatterns: activeProfile?.prohibitedPatterns ?? [],
      };
      const pageDraft = createParisianPageDraft(draftName);
      if (draftSource === 'page' && pageDraft.visualAestheticRules && pageDraft.languagePolicy) {
        await brandApi.createBrandProfile({
          ...pageDraft,
          languagePolicy: {
            ...pageDraft.languagePolicy,
            englishConventions: {
              ...pageDraft.languagePolicy.englishConventions,
              tone: draftTone.trim(),
            },
          },
          visualAestheticRules: {
            ...pageDraft.visualAestheticRules,
            approvedColorPalettes: [
              {
                name: 'Provisional red and white — pending brand approval',
                hexCodes: [draftColor, '#FFFFFF'],
              },
            ],
          },
        });
      } else {
        await brandApi.createBrandProfile(payload);
      }
      setSuccessMessage('New brand profile draft created.');
      setIsCreateOpen(false);
      setDraftName('');
      await loadData();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to create profile draft.');
    } finally {
      setActionLoading(false);
    }
  };

  const displayedProfile = selectedProfile || activeProfile;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <a href="/brand/guidance" className="mb-4 block rounded border bg-amber-50 p-4 underline">
        Manage business-approved brand guidance and reviewed references →
      </a>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-app-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-serif tracking-tight text-[#243746]">
              Brand Intelligence Studio
            </h1>
            <Badge variant="gold" dot>
              W40 & W41 Governed
            </Badge>
          </div>
          <p className="text-xs text-app-muted mt-1">
            Authoritative tone attributes, prohibited vocabulary, Khmer conventions & profile
            lifecycle
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
            onClick={() => setIsCreateOpen(true)}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            New Profile Draft
          </Button>
        </div>
      </div>

      <section
        className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
        aria-label="Brand discovery status"
      >
        <strong>Preliminary page review.</strong> The Facebook page suggests a red and white
        identity, clean product cards, and warm conversational Khmer. These are observations from a
        small sample, not approved rules. Exact colors, fonts, logo assets and video style still
        need review.{' '}
        <a
          className="font-semibold underline"
          href="https://www.facebook.com/ParisianShopper"
          target="_blank"
          rel="noreferrer"
        >
          View the source page
        </a>
        .
        <p className="mt-2">
          Brand profiles are managed separately from the rules currently used for content and
          posters. Creating or activating a profile here does not yet apply it to generation.
        </p>
      </section>

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

      {/* Main Grid: Profiles List / Version History + Active Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Version History & Archives */}
        <div className="space-y-4">
          <div className="bg-app-surface border border-app-border rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-app-border/60">
              <span className="text-xs font-semibold uppercase tracking-wider text-app-muted">
                Profile Versions ({profiles.length})
              </span>
              <span className="text-[10px] text-app-muted font-mono">Single-Active Rule</span>
            </div>

            <div className="mt-3 space-y-2 max-h-[500px] overflow-y-auto">
              {profiles.map((p) => {
                const isActive = p.status === 'ACTIVE';
                const isSelected = displayedProfile?.id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProfile(p)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? 'border-gold-500 bg-gold-50/20 shadow-xs'
                        : 'border-app-border/80 hover:border-app-border bg-app-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-serif text-sm font-semibold text-[#243746]">
                          {p.name}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-app-surface-subtle text-app-muted">
                          v{p.versionNumber}
                        </span>
                      </div>
                      <Badge
                        variant={
                          isActive
                            ? 'good'
                            : p.status === 'DRAFT'
                              ? 'gold'
                              : p.status === 'RETIRED'
                                ? 'neutral'
                                : 'bad'
                        }
                      >
                        {p.status}
                      </Badge>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-app-muted">
                      <span>Policy: {p.evaluationPolicyId}</span>
                      <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}

              {profiles.length === 0 && !loading && (
                <div className="text-center py-8 text-xs text-app-muted">
                  No brand profiles configured yet.
                </div>
              )}
            </div>
          </div>

          {/* Quick Rollback Panel */}
          {activeProfile && (
            <div className="bg-amber-50/50 border border-amber-200/80 rounded-2xl p-4 shadow-sm space-y-2">
              <div className="flex items-center gap-2 text-amber-900 text-xs font-semibold">
                <RotateCcw className="w-4 h-4 text-amber-700" />
                <span>Governance Rollback Safeguard</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Roll back from active version v{activeProfile.versionNumber} to an approved
                historical profile version with automated audit trail.
              </p>
            </div>
          )}
        </div>

        {/* Right 2 Columns: Active Profile Inspector */}
        <div className="lg:col-span-2 space-y-6">
          {displayedProfile ? (
            <>
              {/* Header Card */}
              <div className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-app-border/80">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-serif font-bold text-[#243746]">
                        {displayedProfile.name}
                      </h2>
                      <Badge
                        variant={
                          displayedProfile.status === 'ACTIVE'
                            ? 'good'
                            : displayedProfile.status === 'DRAFT'
                              ? 'gold'
                              : 'neutral'
                        }
                        dot={displayedProfile.status === 'ACTIVE'}
                      >
                        {displayedProfile.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-app-muted mt-1 font-mono">
                      ID: {displayedProfile.id} • Version #{displayedProfile.versionNumber}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {displayedProfile.status !== 'ACTIVE' && (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={actionLoading}
                        onClick={() => void handleActivate(displayedProfile.id)}
                        icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                      >
                        Activate Profile
                      </Button>
                    )}

                    {displayedProfile.status === 'RETIRED' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={actionLoading}
                        onClick={() => {
                          setRollbackTargetId(displayedProfile.id);
                          setIsRollbackOpen(true);
                        }}
                        icon={<RotateCcw className="w-3.5 h-3.5" />}
                      >
                        Rollback to This
                      </Button>
                    )}
                  </div>
                </div>

                {/* Tone Attributes Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-app-muted">
                    <Sparkles className="w-3.5 h-3.5 text-gold-500" />
                    <span>Authoritative Tone Attributes</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {['Elegance', 'Exclusivity', 'Restraint', 'Clarity'].map((attr) => {
                      const isDefined = (displayedProfile.toneRules?.luxuryAttributes ?? []).some(
                        (a) => a.toLowerCase().includes(attr.toLowerCase()),
                      );
                      return (
                        <div
                          key={attr}
                          className={`p-3 rounded-xl border flex flex-col justify-between ${
                            isDefined
                              ? 'bg-gold-50/40 border-gold-200 text-gold-900'
                              : 'bg-app-surface-subtle/50 border-app-border text-app-muted'
                          }`}
                        >
                          <span className="text-xs font-semibold">{attr}</span>
                          <span className="text-[10px] mt-1 text-app-muted font-mono">
                            {isDefined ? 'Authoritative' : 'Standard'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Language & Prohibited Rules Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Prohibited Hyperbole Terms */}
                <div className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-700">
                    <Ban className="w-3.5 h-3.5" />
                    <span>Prohibited Hyperbole Terms</span>
                  </div>
                  <p className="text-[11px] text-app-muted">
                    Terms that trigger deterministic validation failure or originality blocks:
                  </p>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(displayedProfile.toneRules?.prohibitedHyperbole?.length
                      ? displayedProfile.toneRules.prohibitedHyperbole
                      : [
                          'cheapest',
                          'unbelievable deal',
                          'crazy price',
                          'free giveaway',
                          '100% best',
                        ]
                    ).map((term) => (
                      <span
                        key={term}
                        className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs bg-rose-50 text-rose-800 border border-rose-200 font-mono"
                      >
                        {term}
                      </span>
                    ))}
                  </div>

                  <div className="pt-2 text-[11px] text-app-muted">
                    Max Emojis per Post:{' '}
                    <span className="font-semibold text-app-primary">
                      {displayedProfile.toneRules?.maxEmojisPerPost ?? 2}
                    </span>
                  </div>
                </div>

                {/* Khmer & Language Conventions */}
                <div className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#243746]">
                    <Languages className="w-3.5 h-3.5" />
                    <span>Khmer Loanwords & Formality</span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-app-border/60">
                      <span className="text-app-muted">Formality:</span>
                      <span className="font-semibold text-app-primary">
                        {displayedProfile.languagePolicy?.formality ?? 'LUXURY_FORMAL'}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-app-border/60">
                      <span className="text-app-muted">Khmer Script:</span>
                      <span className="font-semibold text-app-primary">
                        {displayedProfile.languagePolicy?.khmerConventions?.scriptStyle ??
                          'Moul / Battambang'}
                      </span>
                    </div>

                    <div className="pt-1">
                      <span className="text-app-muted block mb-1">Disallowed Loanwords:</span>
                      <div className="flex flex-wrap gap-1">
                        {(
                          displayedProfile.languagePolicy?.khmerConventions
                            ?.disallowedLoanwords ?? ['discount', 'cheap', 'best price']
                        ).map((loanword) => (
                          <span
                            key={loanword}
                            className="px-2 py-0.5 rounded text-[10px] bg-neutral-100 text-neutral-700 border border-neutral-200 font-mono"
                          >
                            {loanword}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Aesthetic & Collateral Archives */}
              <div className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-app-muted">
                  <Layers className="w-3.5 h-3.5 text-gold-500" />
                  <span>Visual Aesthetics & Provenance Rules</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                  <div className="p-3 rounded-xl bg-app-surface-subtle border border-app-border">
                    <span className="text-app-muted block text-[10px] uppercase font-bold">
                      Typography
                    </span>
                    <p className="mt-1 font-semibold text-app-primary">
                      {displayedProfile.typographyRules?.headlineFont ?? 'Playfair Display'}
                    </p>
                    <span className="text-[10px] text-app-muted font-mono">
                      Khmer: {displayedProfile.typographyRules?.bodyFontKhmer ?? 'Battambang'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-app-surface-subtle border border-app-border">
                    <span className="text-app-muted block text-[10px] uppercase font-bold">
                      Logo Placement
                    </span>
                    <p className="mt-1 font-semibold text-app-primary">
                      {displayedProfile.logoRules?.allowedPlacements?.join(', ') ??
                        'TOP_CENTER, BOTTOM_CENTER'}
                    </p>
                    <span className="text-[10px] text-app-muted font-mono">
                      Variant: {displayedProfile.logoRules?.defaultVariant ?? 'GOLD'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-app-surface-subtle border border-app-border">
                    <span className="text-app-muted block text-[10px] uppercase font-bold">
                      Evaluation Policy
                    </span>
                    <p className="mt-1 font-semibold text-app-primary truncate">
                      {displayedProfile.evaluationPolicyId}
                    </p>
                    <span className="text-[10px] text-emerald-700 font-medium">
                      Anti-regurgitation active
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-app-surface border border-app-border rounded-2xl p-12 text-center text-app-muted text-xs">
              Select or create a brand profile to inspect governance settings.
            </div>
          )}
        </div>
      </div>

      {/* Emergency Rollback Modal */}
      {isRollbackOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-app-surface border border-app-border rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-rose-700 font-serif font-bold text-base">
              <RotateCcw className="w-5 h-5 text-rose-600" />
              <span>Confirm Profile Rollback</span>
            </div>

            <p className="text-xs text-app-muted leading-relaxed">
              This action will atomically retire the currently active profile and restore target
              version ID <code className="font-mono text-app-primary">{rollbackTargetId}</code> as
              active.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-medium text-app-primary">
                Rollback Reason / Justification
              </label>
              <textarea
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                placeholder="Describe reason for emergency rollback (e.g. terminology drift)..."
                rows={3}
                className="w-full text-xs p-2.5 rounded-xl border border-app-border bg-app-surface focus:outline-hidden focus:ring-1 focus:ring-gold-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setIsRollbackOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={actionLoading || !rollbackReason.trim()}
                onClick={() => void handleRollback()}
              >
                Confirm Rollback
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* New Profile Draft Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-app-surface border border-app-border rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-[#243746] font-serif font-bold text-base">
              <Plus className="w-5 h-5 text-gold-500" />
              <span>Create New Brand Profile Draft</span>
            </div>

            <p className="text-xs text-app-muted">
              Choose a starting point. A draft is not an approved brand guide. Review the source,
              colors, fonts, logo and language with the team before using it.
            </p>

            <form onSubmit={(e) => void handleCreateDraft(e)} className="space-y-3">
              <fieldset className="space-y-2 text-xs text-app-primary">
                <legend className="mb-2 font-semibold">Starting point</legend>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="draft-source"
                    checked={draftSource === 'page'}
                    onChange={() => setDraftSource('page')}
                  />{' '}
                  <span>
                    <strong>Facebook page observations</strong>
                    <br />A provisional red-and-white product-card direction and conversational
                    Khmer. The color and font choices are placeholders.
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="draft-source"
                    disabled={!activeProfile}
                    checked={draftSource === 'current'}
                    onChange={() => setDraftSource('current')}
                  />{' '}
                  <span>
                    <strong>Copy current profile</strong>
                    <br />
                    Start from the active profile. Available when an active profile exists.
                  </span>
                </label>
              </fieldset>
              {draftSource === 'page' && (
                <div className="space-y-3 rounded-xl border border-app-border p-3">
                  <p className="text-xs text-app-muted">
                    These values are editable proposals. Confirm the official red and typography
                    from your brand assets.
                  </p>
                  <label className="block text-xs font-medium" htmlFor="brand-draft-color">
                    Proposed brand red
                  </label>
                  <input
                    id="brand-draft-color"
                    type="color"
                    value={draftColor}
                    onChange={(e) => setDraftColor(e.target.value)}
                    className="h-10 w-20 cursor-pointer"
                  />
                  <label className="block text-xs font-medium" htmlFor="brand-draft-tone">
                    Tone description
                  </label>
                  <input
                    id="brand-draft-tone"
                    required
                    maxLength={150}
                    value={draftTone}
                    onChange={(e) => setDraftTone(e.target.value)}
                    className="w-full rounded-xl border border-app-border bg-app-surface p-2.5 text-xs"
                  />
                </div>
              )}
              <div className="space-y-1">
                <label htmlFor="brand-draft-name" className="text-xs font-medium text-app-primary">
                  Profile Version Name
                </label>
                <input
                  id="brand-draft-name"
                  type="text"
                  required
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="e.g. PARISIAN_LUXURY_V2_HOLIDAY"
                  className="w-full text-xs p-2.5 rounded-xl border border-app-border bg-app-surface focus:outline-hidden focus:ring-1 focus:ring-gold-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button variant="ghost" size="sm" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={actionLoading || !draftName.trim()}
                >
                  Create Draft
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
