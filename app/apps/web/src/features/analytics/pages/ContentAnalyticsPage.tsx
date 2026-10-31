import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useContentAnalytics } from '../hooks/use-analytics.js';
import type { DateRangeParams } from '../types/analytics.types.js';
import { DateRangeFilter } from '../components/DateRangeFilter.js';
import { ContentPerformancePanel } from '../components/ContentPerformancePanel.js';

export const ContentAnalyticsPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRangeParams>({});
  const contentQuery = useContentAnalytics(dateRange);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div>
        <Link
          to="/analytics"
          className="inline-flex items-center gap-1.5 text-xs text-app-muted hover:text-navy-900 mb-2 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Analytics Overview
        </Link>
        <h1 className="text-2xl font-bold text-navy-950 font-serif tracking-tight">
          Content Studio Analytics
        </h1>
        <p className="text-xs text-app-muted mt-1">
          Detailed metrics for AI copy generation jobs, provider latency, and Four-Eyes review
          outcomes.
        </p>
      </div>

      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      {contentQuery.data && <ContentPerformancePanel analytics={contentQuery.data} />}
    </div>
  );
};
