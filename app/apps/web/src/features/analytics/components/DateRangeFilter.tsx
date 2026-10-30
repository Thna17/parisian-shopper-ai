import React, { useState } from 'react';
import { Calendar, Filter } from 'lucide-react';
import type { DateRangeParams } from '../types/analytics.types.js';

interface DateRangeFilterProps {
  readonly value: DateRangeParams;
  readonly onChange: (range: DateRangeParams) => void;
  readonly className?: string;
}

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ value, onChange, className }) => {
  const [activePreset, setActivePreset] = useState<string>('30d');
  const [customStart, setCustomStart] = useState<string>(value.startDate ?? '');
  const [customEnd, setCustomEnd] = useState<string>(value.endDate ?? '');

  const handlePreset = (preset: string) => {
    setActivePreset(preset);
    const now = new Date();
    if (preset === '7d') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      onChange({
        startDate: start.toISOString(),
        endDate: now.toISOString(),
        timezone: 'UTC',
      });
    } else if (preset === '30d') {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      onChange({
        startDate: start.toISOString(),
        endDate: now.toISOString(),
        timezone: 'UTC',
      });
    } else if (preset === 'all') {
      onChange({});
    }
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    setActivePreset('custom');
    onChange({
      startDate: customStart ? new Date(customStart).toISOString() : undefined,
      endDate: customEnd ? new Date(customEnd).toISOString() : undefined,
      timezone: 'UTC',
    });
  };

  return (
    <div
      data-testid="date-range-filter"
      className={`bg-white rounded-xl border border-app-border p-4 shadow-sm flex flex-wrap items-center justify-between gap-4 ${className ?? ''}`}
    >
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-app-muted" />
        <span className="text-xs font-semibold uppercase tracking-wider text-app-muted">
          Period Preset:
        </span>
        <div className="inline-flex rounded-lg border border-app-border p-1 bg-app-surface-subtle">
          <button
            type="button"
            onClick={() => handlePreset('7d')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              activePreset === '7d'
                ? 'bg-navy-900 text-white shadow-sm'
                : 'text-app-primary hover:text-navy-900'
            }`}
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => handlePreset('30d')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              activePreset === '30d'
                ? 'bg-navy-900 text-white shadow-sm'
                : 'text-app-primary hover:text-navy-900'
            }`}
          >
            Last 30 Days
          </button>
          <button
            type="button"
            onClick={() => handlePreset('all')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              activePreset === 'all'
                ? 'bg-navy-900 text-white shadow-sm'
                : 'text-app-primary hover:text-navy-900'
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      <form onSubmit={handleApplyCustom} className="flex items-center gap-2 text-xs">
        <Calendar className="w-4 h-4 text-app-muted" />
        <input
          type="date"
          aria-label="Start Date"
          value={customStart}
          onChange={(e) => setCustomStart(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-app-border bg-white text-app-primary text-xs focus:ring-1 focus:ring-navy-600 focus:border-navy-600"
        />
        <span className="text-app-muted">to</span>
        <input
          type="date"
          aria-label="End Date"
          value={customEnd}
          onChange={(e) => setCustomEnd(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-app-border bg-white text-app-primary text-xs focus:ring-1 focus:ring-navy-600 focus:border-navy-600"
        />
        <button
          type="submit"
          className="px-3 py-1.5 rounded-lg bg-navy-600 hover:bg-navy-700 text-white font-medium text-xs transition-colors"
        >
          Apply
        </button>
      </form>
    </div>
  );
};
