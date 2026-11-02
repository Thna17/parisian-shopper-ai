import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  Building,
  ShieldCheck,
  Bell,
  DollarSign,
  Check,
  AlertCircle,
  ExternalLink,
  Save,
} from 'lucide-react';
import { adminApi } from '../api/admin-api.js';
import type { SystemSettingsOverview } from '../types/admin.types.js';

export const OrganizationSettingsPage: React.FC = () => {
  const navigate = useNavigate();

  const [settings, setSettings] = useState<SystemSettingsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form states
  const [orgName, setOrgName] = useState('Parisian Shopper AI');
  const [contactEmail, setContactEmail] = useState('contact@parisianshopper.com');
  const [timezone, setTimezone] = useState('UTC');
  const [defaultLanguage, setDefaultLanguage] = useState('fr');

  const [sessionTtlHours, setSessionTtlHours] = useState(8);
  const [maxLoginFailures, setMaxLoginFailures] = useState(5);
  const [lockoutDurationMinutes, setLockoutDurationMinutes] = useState(15);
  const [requireFourEyesCreative, setRequireFourEyesCreative] = useState(true);
  const [requireFourEyesContent, setRequireFourEyesContent] = useState(true);

  const [telegramNotificationsEnabled, setTelegramNotificationsEnabled] = useState(true);
  const [alertThresholdPercent, setAlertThresholdPercent] = useState(80);

  const [savingKey, setSavingKey] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminApi.getSettings();
      setSettings(res);

      // Populate forms
      if (res.organization) {
        setOrgName((res.organization['name'] as string) ?? 'Parisian Shopper AI');
        setContactEmail(
          (res.organization['contactEmail'] as string) ?? 'contact@parisianshopper.com',
        );
        setTimezone((res.organization['timezone'] as string) ?? 'UTC');
        setDefaultLanguage((res.organization['defaultLanguage'] as string) ?? 'fr');
      }

      if (res.workflow) {
        setSessionTtlHours(Number(res.workflow['sessionTtlHours'] ?? 8));
        setMaxLoginFailures(Number(res.workflow['maxLoginFailures'] ?? 5));
        setLockoutDurationMinutes(Number(res.workflow['lockoutDurationMinutes'] ?? 15));
        setRequireFourEyesCreative(Boolean(res.workflow['requireFourEyesCreative'] ?? true));
        setRequireFourEyesContent(Boolean(res.workflow['requireFourEyesContent'] ?? true));
      }

      if (res.notifications) {
        setTelegramNotificationsEnabled(
          Boolean(res.notifications['telegramNotificationsEnabled'] ?? true),
        );
        setAlertThresholdPercent(Number(res.notifications['alertThresholdPercent'] ?? 80));
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load system settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingKey('ORGANIZATION_PROFILE');
      setError(null);
      await adminApi.updateSetting({
        key: 'ORGANIZATION_PROFILE',
        category: 'ORGANIZATION',
        description: 'Brand identity and localization defaults',
        value: {
          name: orgName.trim(),
          contactEmail: contactEmail.trim(),
          timezone,
          defaultLanguage,
        },
      });
      showSuccess('Organization profile saved successfully.');
    } catch (err: any) {
      setError(err?.message || 'Failed to save organization profile');
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingKey('WORKFLOW_POLICIES');
      setError(null);
      await adminApi.updateSetting({
        key: 'WORKFLOW_POLICIES',
        category: 'WORKFLOW',
        description: 'Session timeout, authentication security, and Four-Eyes rules',
        value: {
          sessionTtlHours,
          maxLoginFailures,
          lockoutDurationMinutes,
          requireFourEyesCreative,
          requireFourEyesContent,
        },
      });
      showSuccess('Workflow & Four-Eyes policies saved.');
    } catch (err: any) {
      setError(err?.message || 'Failed to save workflow policies');
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingKey('NOTIFICATION_PREFERENCES');
      setError(null);
      await adminApi.updateSetting({
        key: 'NOTIFICATION_PREFERENCES',
        category: 'NOTIFICATIONS',
        description: 'Channel delivery and alert threshold settings',
        value: {
          telegramNotificationsEnabled,
          alertThresholdPercent,
        },
      });
      showSuccess('Notification preferences saved.');
    } catch (err: any) {
      setError(err?.message || 'Failed to save notifications');
    } finally {
      setSavingKey(null);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-app-muted flex flex-col items-center justify-center gap-2">
        <div className="w-6 h-6 border-2 border-[#243746] border-t-transparent rounded-full animate-spin" />
        <span>Loading workspace configuration...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between pb-4 border-b border-app-border/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#243746]/10 rounded-lg text-[#243746]">
            <Settings className="w-5 h-5 text-[#243746]" />
          </div>
          <div>
            <h1 className="text-xl font-serif tracking-tight text-[#243746]">
              Workspace Configuration & Policies
            </h1>
            <p className="text-xs text-app-muted">
              Centralized platform parameters, security policies, and Four-Eyes governance
            </p>
          </div>
        </div>
      </div>

      {/* Notifications and Alerts */}
      {error && (
        <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Organization Profile */}
        <div className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-app-border/60 pb-3">
            <Building className="w-4 h-4 text-[#243746]" />
            <h3 className="text-sm font-serif font-medium text-[#243746]">Organization Profile</h3>
          </div>

          <form onSubmit={handleSaveOrganization} className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="font-medium text-[#243746]">Workspace Name</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full p-2 bg-app-surface-subtle border border-app-border rounded-lg text-app-primary focus:outline-none focus:ring-1 focus:ring-[#B59761]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-[#243746]">Administrative Contact Email</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full p-2 bg-app-surface-subtle border border-app-border rounded-lg text-app-primary focus:outline-none focus:ring-1 focus:ring-[#B59761]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-medium text-[#243746]">System Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full p-2 bg-app-surface-subtle border border-app-border rounded-lg text-app-primary focus:outline-none focus:ring-1 focus:ring-[#B59761]"
                >
                  <option value="UTC">UTC</option>
                  <option value="Europe/Paris">Europe/Paris (CET)</option>
                  <option value="Asia/Phnom_Penh">Asia/Phnom_Penh (ICT)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-medium text-[#243746]">Primary Editorial Language</label>
                <select
                  value={defaultLanguage}
                  onChange={(e) => setDefaultLanguage(e.target.value)}
                  className="w-full p-2 bg-app-surface-subtle border border-app-border rounded-lg text-app-primary focus:outline-none focus:ring-1 focus:ring-[#B59761]"
                >
                  <option value="fr">French (Français)</option>
                  <option value="km">Khmer (ខ្មែរ)</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingKey === 'ORGANIZATION_PROFILE'}
                className="px-3.5 py-1.5 bg-[#243746] text-white rounded-lg text-xs font-medium hover:bg-[#1b2b37] disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Profile</span>
              </button>
            </div>
          </form>
        </div>

        {/* Card 2: Workflow & Four-Eyes Policies */}
        <div className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-app-border/60 pb-3">
            <ShieldCheck className="w-4 h-4 text-[#243746]" />
            <h3 className="text-sm font-serif font-medium text-[#243746]">
              Workflow & Four-Eyes Governance
            </h3>
          </div>

          <form onSubmit={handleSaveWorkflow} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-medium text-[#243746]">Session TTL (Hours)</label>
                <input
                  type="number"
                  min={1}
                  max={72}
                  value={sessionTtlHours}
                  onChange={(e) => setSessionTtlHours(Number(e.target.value))}
                  className="w-full p-2 bg-app-surface-subtle border border-app-border rounded-lg text-app-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-[#243746]">Max Failed Logins</label>
                <input
                  type="number"
                  min={3}
                  max={10}
                  value={maxLoginFailures}
                  onChange={(e) => setMaxLoginFailures(Number(e.target.value))}
                  className="w-full p-2 bg-app-surface-subtle border border-app-border rounded-lg text-app-primary"
                />
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <div className="p-2.5 rounded-xl border border-app-border bg-app-surface-subtle/40 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-[#243746]">
                    <span>Four-Eyes Copy Approval</span>
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Enforced Invariant
                    </span>
                  </div>
                  <div className="text-[10px] text-app-muted">
                    Prohibits self-approval for content versions (Mandatory Server-Side Policy)
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={true}
                  disabled={true}
                  className="rounded border-app-border text-[#243746] focus:ring-[#B59761] opacity-60 cursor-not-allowed"
                />
              </div>

              <div className="p-2.5 rounded-xl border border-app-border bg-app-surface-subtle/40 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-[#243746]">
                    <span>Four-Eyes Creative Approval</span>
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Enforced Invariant
                    </span>
                  </div>
                  <div className="text-[10px] text-app-muted">
                    Requires independent signoff on exact creative scenes (Mandatory Server-Side
                    Policy)
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={true}
                  disabled={true}
                  className="rounded border-app-border text-[#243746] focus:ring-[#B59761] opacity-60 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingKey === 'WORKFLOW_POLICIES'}
                className="px-3.5 py-1.5 bg-[#243746] text-white rounded-lg text-xs font-medium hover:bg-[#1b2b37] disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Policies</span>
              </button>
            </div>
          </form>
        </div>

        {/* Card 3: Notification Preferences */}
        <div className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-app-border/60 pb-3">
            <Bell className="w-4 h-4 text-[#243746]" />
            <h3 className="text-sm font-serif font-medium text-[#243746]">
              Operational Notifications
            </h3>
          </div>

          <form onSubmit={handleSaveNotifications} className="space-y-3 text-xs">
            <label className="p-2.5 rounded-xl border border-app-border bg-app-surface-subtle/40 flex items-center justify-between cursor-pointer">
              <div>
                <div className="font-semibold text-[#243746]">Telegram Notifications</div>
                <div className="text-[10px] text-app-muted">
                  Send real-time alerts for review requests and publications
                </div>
              </div>
              <input
                type="checkbox"
                checked={telegramNotificationsEnabled}
                onChange={(e) => setTelegramNotificationsEnabled(e.target.checked)}
                className="rounded border-app-border text-[#243746] focus:ring-[#B59761]"
              />
            </label>

            <div className="space-y-1">
              <label className="font-medium text-[#243746]">Budget Alert Threshold (%)</label>
              <input
                type="number"
                min={50}
                max={99}
                value={alertThresholdPercent}
                onChange={(e) => setAlertThresholdPercent(Number(e.target.value))}
                className="w-full p-2 bg-app-surface-subtle border border-app-border rounded-lg text-app-primary"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingKey === 'NOTIFICATION_PREFERENCES'}
                className="px-3.5 py-1.5 bg-[#243746] text-white rounded-lg text-xs font-medium hover:bg-[#1b2b37] disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Preferences</span>
              </button>
            </div>
          </form>
        </div>

        {/* Card 4: AI Operating Budget Governance */}
        <div className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-app-border/60 pb-3">
              <DollarSign className="w-4 h-4 text-[#243746]" />
              <h3 className="text-sm font-serif font-medium text-[#243746]">
                AI Spending Budget Governance
              </h3>
            </div>

            <p className="text-xs text-app-muted mt-3">
              Enforceable atomic limits protecting the Parisian Shopper operating budget.
            </p>

            <div className="mt-4 p-3 bg-app-surface-subtle border border-app-border rounded-xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-app-muted">Monthly Spending Limit:</span>
                <span className="font-semibold text-[#243746]">
                  ${settings?.aiBudgetSummary?.monthlyCeiling?.toFixed(2) ?? '20.00'} USD
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-app-muted">Max Charge Per Request:</span>
                <span className="font-semibold text-[#243746]">
                  ${settings?.aiBudgetSummary?.perRequestCeiling?.toFixed(2) ?? '1.00'} USD
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3">
            <button
              type="button"
              onClick={() => navigate('/analytics/costs')}
              className="w-full py-2 bg-app-surface border border-app-border text-[#243746] hover:bg-app-surface-subtle rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <span>Manage Budgets in Cost Control Hub</span>
              <ExternalLink className="w-3.5 h-3.5 text-[#B59761]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
