import React, { useEffect, useState } from 'react';
import {
  FlaskConical,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BarChart3,
  ShieldAlert,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { brandApi } from '../api/brand-api.js';
import type {
  BenchmarkEvaluationReport,
  BrandProfileVersionRecord,
  TestCaseInput,
} from '../types/brand.types.js';
import { Badge } from '../../../components/ui/badge.js';
import { Button } from '../../../components/ui/button.js';

export const BrandBenchmarkLabPage: React.FC = () => {
  const [activeProfile, setActiveProfile] = useState<BrandProfileVersionRecord | null>(null);
  const [profiles, setProfiles] = useState<readonly BrandProfileVersionRecord[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Candidate evaluation inputs
  const [candidatePrompt, setCandidatePrompt] = useState(
    'Introduce Moonlit River Eau de Parfum in an elegant, refined Parisian style with French notes and Khmer bilingual translation.',
  );
  const [candidateCopy, setCandidateCopy] = useState(
    'Moonlit River Eau de Parfum — A whisper of evening jasmine and crisp French bergamot drifting across the Seine. Crafted with restrained mastery for the discerning collector.\n\nក្លិនក្រអូបដ៏ប្រណិតនៃផ្កាម្លិះ និងប៊ឺហ្គាម៉ុតពីទីក្រុងប៉ារីស។',
  );

  // Results
  const [report, setReport] = useState<BenchmarkEvaluationReport | null>(null);
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const [active, all] = await Promise.all([
          brandApi.getActiveBrandProfile(),
          brandApi.listBrandProfiles(),
        ]);
        setActiveProfile(active);
        setProfiles(all);
        if (active) setSelectedProfileId(active.id);
        else if (all.length > 0 && all[0]) setSelectedProfileId(all[0].id);
      } catch (err: unknown) {
        setError((err as Error).message || 'Failed to initialize benchmark laboratory.');
      }
    }
    void init();
  }, []);

  const handleRunBenchmark = async () => {
    if (!selectedProfileId && !activeProfile?.id) {
      setError('Please select a target brand profile version.');
      return;
    }

    try {
      setRunning(true);
      setError(null);

      const customCases: TestCaseInput[] = [
        {
          testCaseId: 'custom-user-candidate-01',
          prompt: candidatePrompt,
          candidateText: candidateCopy,
          category: 'INTERACTIVE_EVALUATION',
        },
      ];

      const res = await brandApi.runBrandBenchmark({
        profileId: selectedProfileId || activeProfile?.id,
        testCases: customCases,
      });

      setReport(res);
      if (res.testCaseEvaluations.length > 0 && res.testCaseEvaluations[0]) {
        setExpandedCaseId(res.testCaseEvaluations[0].testCaseId);
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to run benchmark evaluation.');
    } finally {
      setRunning(false);
    }
  };

  const handleRunPredefinedSuite = async () => {
    try {
      setRunning(true);
      setError(null);
      const res = await brandApi.runBrandBenchmark({
        profileId: selectedProfileId || activeProfile?.id,
      });
      setReport(res);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to run full test suite.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-app-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-serif tracking-tight text-[#243746]">
              Brand Benchmark & Anti-Regurgitation Lab
            </h1>
            <Badge variant="navy">W41 Laboratory</Badge>
          </div>
          <p className="text-xs text-app-muted mt-1">
            Evaluate candidate copy against tone attributes, 3-gram Jaccard overlap, and prohibited
            terminology
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-app-muted">Target Profile:</span>
            <select
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              className="text-xs font-mono py-1.5 px-2.5 rounded-xl border border-app-border bg-app-surface text-app-primary"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (v{p.versionNumber}) {p.status === 'ACTIVE' ? '★ ACTIVE' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Input / Control Bench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive Test Bench */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-app-border/70">
              <span className="text-xs font-bold uppercase tracking-wider text-app-muted flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 text-gold-500" />
                Candidate Copy Evaluator
              </span>
              <button
                type="button"
                onClick={() => void handleRunPredefinedSuite()}
                className="text-xs text-gold-600 hover:text-gold-700 font-medium underline"
              >
                Run Standard Suite
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-app-primary">Prompt Directive</label>
              <textarea
                value={candidatePrompt}
                onChange={(e) => setCandidatePrompt(e.target.value)}
                rows={2}
                placeholder="Enter prompt instruction..."
                className="w-full text-xs p-2.5 rounded-xl border border-app-border bg-app-surface focus:outline-hidden focus:ring-1 focus:ring-gold-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-app-primary">
                Candidate Copy to Benchmark
              </label>
              <textarea
                value={candidateCopy}
                onChange={(e) => setCandidateCopy(e.target.value)}
                rows={6}
                placeholder="Enter draft copy to benchmark..."
                className="w-full text-xs p-2.5 rounded-xl border border-app-border bg-app-surface font-sans focus:outline-hidden focus:ring-1 focus:ring-gold-500 leading-relaxed"
              />
            </div>

            <Button
              variant="primary"
              size="md"
              disabled={running || !candidateCopy.trim()}
              onClick={() => void handleRunBenchmark()}
              icon={<Play className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />}
              className="w-full justify-center"
            >
              {running ? 'Evaluating Candidate...' : 'Execute Benchmark Suite'}
            </Button>
          </div>
        </div>

        {/* Right: Scores & Visualizations */}
        <div className="lg:col-span-7 space-y-4">
          {report ? (
            <div className="bg-app-surface border border-app-border rounded-2xl p-6 shadow-sm space-y-6">
              {/* Overall Benchmark Banner */}
              <div
                className={`p-4 rounded-xl border flex items-center justify-between ${
                  report.passed
                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50/60 border-rose-200 text-rose-950'
                }`}
              >
                <div className="flex items-center gap-3">
                  {report.passed ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-6 h-6 text-rose-600 shrink-0" />
                  )}
                  <div>
                    <h3 className="font-serif font-bold text-sm">
                      {report.passed ? 'Benchmark Quality Gate PASSED' : 'Benchmark Gate VIOLATION'}
                    </h3>
                    <p className="text-xs opacity-80 mt-0.5">
                      Evaluated against policy {report.policyId} • {report.passedTestCases} of{' '}
                      {report.totalTestCases} test cases passed
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-serif font-bold">
                    {Math.round(report.overallScore * 100)}%
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider opacity-75">
                    Overall Score
                  </span>
                </div>
              </div>

              {/* Three Core Attribute Metric Bars */}
              <div className="space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-app-muted">
                  Dimensional Score Breakdown
                </span>

                <div className="space-y-3">
                  {/* Tone Fidelity */}
                  <div>
                    <div className="flex justify-between text-xs font-medium mb-1">
                      <span className="flex items-center gap-1.5 text-app-primary">
                        <Sparkles className="w-3.5 h-3.5 text-gold-500" />
                        Tone & Luxury Fidelity
                      </span>
                      <span className="font-mono text-app-primary font-semibold">
                        {Math.round(report.toneScoreAverage * 100)}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-app-surface-subtle overflow-hidden">
                      <div
                        className="h-full bg-gold-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.round(report.toneScoreAverage * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Anti-Regurgitation / Originality */}
                  <div>
                    <div className="flex justify-between text-xs font-medium mb-1">
                      <span className="flex items-center gap-1.5 text-app-primary">
                        <ShieldAlert className="w-3.5 h-3.5 text-blue-500" />
                        Anti-Regurgitation & Novelty
                      </span>
                      <span className="font-mono text-app-primary font-semibold">
                        {Math.round(report.originalityScoreAverage * 100)}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-app-surface-subtle overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full transition-all duration-500"
                        style={{ width: `${Math.round(report.originalityScoreAverage * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Script & Typography */}
                  <div>
                    <div className="flex justify-between text-xs font-medium mb-1">
                      <span className="flex items-center gap-1.5 text-app-primary">
                        <BarChart3 className="w-3.5 h-3.5 text-emerald-500" />
                        Script & Formatting Discipline
                      </span>
                      <span className="font-mono text-app-primary font-semibold">
                        {Math.round(report.typographyScoreAverage * 100)}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-app-surface-subtle overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                        style={{ width: `${Math.round(report.typographyScoreAverage * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary Violations (if any) */}
              {report.summaryViolations.length > 0 && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs space-y-1.5">
                  <span className="font-bold text-rose-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    Detected Violations ({report.summaryViolations.length})
                  </span>
                  <ul className="list-disc list-inside space-y-0.5 text-rose-900 font-mono text-[11px]">
                    {report.summaryViolations.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Detailed Test Cases List */}
              <div className="space-y-3 pt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-app-muted">
                  Test Case Results ({report.testCaseEvaluations.length})
                </span>

                <div className="space-y-2">
                  {report.testCaseEvaluations.map((tc) => {
                    const isExpanded = expandedCaseId === tc.testCaseId;
                    return (
                      <div
                        key={tc.testCaseId}
                        className="rounded-xl border border-app-border overflow-hidden bg-app-surface"
                      >
                        <div
                          onClick={() => setExpandedCaseId(isExpanded ? null : tc.testCaseId)}
                          className="p-3 flex items-center justify-between cursor-pointer hover:bg-app-surface-subtle transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            {tc.passed ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-rose-600" />
                            )}
                            <span className="font-mono text-xs font-semibold text-app-primary">
                              {tc.testCaseId}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs font-bold text-app-primary">
                              {Math.round(tc.totalScore * 100)}%
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-app-muted" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-app-muted" />
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="p-4 border-t border-app-border bg-app-surface-subtle/40 space-y-3 text-xs">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-app-muted">
                                Prompt
                              </span>
                              <p className="mt-0.5 text-app-primary">{tc.prompt}</p>
                            </div>

                            <div>
                              <span className="text-[10px] uppercase font-bold text-app-muted">
                                Evaluated Candidate Text
                              </span>
                              <p className="mt-0.5 p-2 rounded-lg bg-white border border-app-border font-serif text-app-primary whitespace-pre-wrap text-[11px]">
                                {tc.candidateText}
                              </p>
                            </div>

                            <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[10px]">
                              <div className="p-2 rounded bg-white border border-app-border">
                                <span className="text-app-muted block">Tone</span>
                                <span className="font-bold text-app-primary">
                                  {Math.round(tc.toneScore * 100)}%
                                </span>
                              </div>
                              <div className="p-2 rounded bg-white border border-app-border">
                                <span className="text-app-muted block">Originality</span>
                                <span className="font-bold text-app-primary">
                                  {Math.round(tc.originalityScore * 100)}%
                                </span>
                              </div>
                              <div className="p-2 rounded bg-white border border-app-border">
                                <span className="text-app-muted block">Typography</span>
                                <span className="font-bold text-app-primary">
                                  {Math.round(tc.typographyScore * 100)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-app-surface border border-app-border rounded-2xl p-12 text-center text-app-muted text-xs space-y-2">
              <FlaskConical className="w-8 h-8 text-app-muted/60 mx-auto" />
              <p>Ready to benchmark candidate copy against active brand rules.</p>
              <p className="text-[11px] text-app-muted/80">
                Click "Execute Benchmark Suite" to compute fidelity and anti-regurgitation metrics.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
