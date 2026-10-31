import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCreativeAnalytics } from '../hooks/use-analytics.js';
import type { DateRangeParams } from '../types/analytics.types.js';
import { DateRangeFilter } from '../components/DateRangeFilter.js';
import { CreativeProductionPanel } from '../components/CreativeProductionPanel.js';

export const CreativeAnalyticsPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRangeParams>({});
  const creativeQuery = useCreativeAnalytics(dateRange);

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
          Creative Studio Analytics
        </h1>
        <p className="text-xs text-app-muted mt-1">
          Scene graph rendering telemetry, visual approval governance, and export artifact
          generation.
        </p>
      </div>

      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      {creativeQuery.data && <CreativeProductionPanel analytics={creativeQuery.data} />}
    </div>
  );
};
