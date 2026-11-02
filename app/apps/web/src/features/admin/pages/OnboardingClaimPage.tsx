import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { KeyRound, Check, AlertCircle, Lock, ArrowRight } from 'lucide-react';
import { adminApi } from '../api/admin-api.js';

export const OnboardingClaimPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimedUser, setClaimedUser] = useState<{ displayName: string } | null>(null);

  useEffect(() => {
    const qToken = searchParams.get('token');
    if (qToken) {
      setToken(qToken);
    }
  }, [searchParams]);

  // Password complexity checks
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumberOrSymbol = /[\d\W]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isFormValid =
    token.trim().length >= 16 &&
    hasMinLength &&
    hasUppercase &&
    hasLowercase &&
    hasNumberOrSymbol &&
    passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    try {
      setSubmitting(true);
      setError(null);
      const res = await adminApi.claimOnboarding({
        token: token.trim(),
        password,
      });
      setClaimedUser({ displayName: res.displayName });
    } catch (err: any) {
      setError(
        err?.message || 'Failed to claim onboarding invitation. Token may be invalid or expired.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F7F4] flex flex-col items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-app-surface border border-app-border rounded-2xl shadow-xl overflow-hidden">
        {/* Brand Lockup */}
        <div className="p-6 bg-app-surface-subtle/50 border-b border-app-border text-center space-y-1">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#243746] text-[#B59761] mb-2 shadow-sm">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-serif font-semibold text-[#243746]">
            Welcome to Parisian Shopper AI
          </h1>
          <p className="text-xs text-app-muted">
            Claim your authorized employee credentials and configure your password
          </p>
        </div>

        <div className="p-6">
          {claimedUser ? (
            <div className="space-y-5 text-center">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>

              <div className="space-y-1">
                <h2 className="text-base font-serif font-semibold text-[#243746]">
                  Account Successfully Activated!
                </h2>
                <p className="text-xs text-app-muted">
                  Welcome, <strong>{claimedUser.displayName}</strong>. Your account is now active
                  and secured with Argon2id password hashing.
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full py-2.5 bg-[#243746] text-white rounded-xl text-xs font-semibold hover:bg-[#1b2b37] flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <span>Proceed to Staff Login</span>
                <ArrowRight className="w-4 h-4 text-[#B59761]" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Invitation Token */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#243746]">
                  Onboarding Invitation Token *
                </label>
                <input
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your 64-character token"
                  className="w-full p-2.5 font-mono text-xs bg-app-surface-subtle border border-app-border rounded-xl text-app-primary focus:outline-none focus:ring-1 focus:ring-[#B59761]"
                />
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#243746]">Initial Password *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-app-muted" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter strong password"
                    className="w-full pl-9 pr-3 py-2.5 text-xs bg-app-surface-subtle border border-app-border rounded-xl text-app-primary focus:outline-none focus:ring-1 focus:ring-[#B59761]"
                  />
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#243746]">Confirm Password *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-app-muted" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full pl-9 pr-3 py-2.5 text-xs bg-app-surface-subtle border border-app-border rounded-xl text-app-primary focus:outline-none focus:ring-1 focus:ring-[#B59761]"
                  />
                </div>
              </div>

              {/* Password Strength Checklist */}
              <div className="p-3 bg-app-surface-subtle rounded-xl border border-app-border/80 space-y-1.5 text-[11px]">
                <div className="font-semibold text-[#243746] mb-1">Password Requirements:</div>
                <div
                  className={`flex items-center gap-1.5 ${
                    hasMinLength ? 'text-emerald-700 font-medium' : 'text-app-muted'
                  }`}
                >
                  <Check
                    className={`w-3.5 h-3.5 ${hasMinLength ? 'text-emerald-600' : 'opacity-30'}`}
                  />
                  <span>At least 8 characters in length</span>
                </div>
                <div
                  className={`flex items-center gap-1.5 ${
                    hasUppercase ? 'text-emerald-700 font-medium' : 'text-app-muted'
                  }`}
                >
                  <Check
                    className={`w-3.5 h-3.5 ${hasUppercase ? 'text-emerald-600' : 'opacity-30'}`}
                  />
                  <span>At least one uppercase letter (A-Z)</span>
                </div>
                <div
                  className={`flex items-center gap-1.5 ${
                    hasLowercase ? 'text-emerald-700 font-medium' : 'text-app-muted'
                  }`}
                >
                  <Check
                    className={`w-3.5 h-3.5 ${hasLowercase ? 'text-emerald-600' : 'opacity-30'}`}
                  />
                  <span>At least one lowercase letter (a-z)</span>
                </div>
                <div
                  className={`flex items-center gap-1.5 ${
                    hasNumberOrSymbol ? 'text-emerald-700 font-medium' : 'text-app-muted'
                  }`}
                >
                  <Check
                    className={`w-3.5 h-3.5 ${hasNumberOrSymbol ? 'text-emerald-600' : 'opacity-30'}`}
                  />
                  <span>At least one number or special character</span>
                </div>
                {password.length > 0 && (
                  <div
                    className={`flex items-center gap-1.5 ${
                      passwordsMatch ? 'text-emerald-700 font-medium' : 'text-red-600'
                    }`}
                  >
                    <Check
                      className={`w-3.5 h-3.5 ${passwordsMatch ? 'text-emerald-600' : 'opacity-30'}`}
                    />
                    <span>Passwords match</span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!isFormValid || submitting}
                className="w-full py-2.5 bg-[#243746] text-white rounded-xl text-xs font-semibold hover:bg-[#1b2b37] disabled:opacity-40 flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Activating Account...</span>
                  </>
                ) : (
                  <span>Claim Account & Activate</span>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
