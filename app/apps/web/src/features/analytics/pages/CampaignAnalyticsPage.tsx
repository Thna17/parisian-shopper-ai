import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCampaignAnalytics } from '../hooks/use-analytics.js';
import type { DateRangeParams } from '../types/analytics.types.js';
import { DateRangeFilter } from '../components/DateRangeFilter.js';
import { CampaignActivityPanel } from '../components/CampaignActivityPanel.js';

export const CampaignAnalyticsPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRangeParams>({});
  const campaignsQuery = useCampaignAnalytics(dateRange);

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
          Campaign Workflow Intelligence
        </h1>
        <p className="text-xs text-app-muted mt-1">
          Catalog associations, content linkage, and lifecycle distribution across campaigns.
        </p>
      </div>

      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      {campaignsQuery.data && <CampaignActivityPanel analytics={campaignsQuery.data} />}
    </div>
  );
};
