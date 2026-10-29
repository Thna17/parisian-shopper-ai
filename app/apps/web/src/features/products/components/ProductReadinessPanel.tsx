import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { Badge } from '../../../components/ui/badge.js';
import type { ProductReadiness, ProductReadinessFinding } from '../types/product.types.js';

export interface ProductReadinessPanelProps {
  readonly readiness?: ProductReadiness | null;
  readonly isLoading?: boolean;
}

export const ProductReadinessPanel: React.FC<ProductReadinessPanelProps> = ({
  readiness,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="bg-app-surface border border-app-border rounded-xl p-6 shadow-subtle space-y-4 animate-pulse">
        <div className="h-4 bg-app-surface-subtle w-1/3 rounded" />
        <div className="h-12 bg-app-surface-subtle rounded-lg" />
        <div className="space-y-2">
          <div className="h-8 bg-app-surface-subtle rounded" />
          <div className="h-8 bg-app-surface-subtle rounded" />
        </div>
      </div>
    );
  }

  if (!readiness) {
    return null;
  }

  const renderFindingIcon = (status: ProductReadinessFinding['status']) => {
    switch (status) {
      case 'PASSED':
        return <CheckCircle2 className="w-4 h-4 text-[#23856B] shrink-0" />;
      case 'WARNING':
        return <AlertTriangle className="w-4 h-4 text-[#B67C27] shrink-0" />;
      case 'BLOCKED':
        return <XCircle className="w-4 h-4 text-[#C25656] shrink-0" />;
      default:
        return <AlertCircle className="w-4 h-4 text-app-muted shrink-0" />;
    }
  };

  const getStatusBadge = (status: ProductReadinessFinding['status']) => {
    switch (status) {
      case 'PASSED':
        return (
          <Badge variant="good" className="text-[10px]">
            Verified
          </Badge>
        );
      case 'WARNING':
        return (
          <Badge variant="warn" className="text-[10px]">
            Attention
          </Badge>
        );
      case 'BLOCKED':
        return (
          <Badge variant="bad" className="text-[10px]">
            Blocking
          </Badge>
        );
    }
  };

  return (
    <div
      data-testid="product-readiness-panel"
      className="bg-app-surface border border-app-border rounded-xl p-6 shadow-subtle space-y-5"
    >
      <div className="flex items-center justify-between border-b border-app-border/60 pb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#9A7D45]" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-app-primary">
            Creative Readiness & Commercial Truth
          </h3>
        </div>
        <Badge variant={readiness.isReadyForContent ? 'good' : 'warn'} dot className="text-xs">
          {readiness.isReadyForContent ? 'Eligible for Creative Studio' : 'Generation Blocked'}
        </Badge>
      </div>

      {/* Disposition Banner */}
      <div
        className={`p-4 rounded-xl border flex items-start gap-3.5 ${
          readiness.isReadyForContent
            ? 'bg-[#23856B]/8 border-[#23856B]/20'
            : 'bg-[#B67C27]/8 border-[#B67C27]/20'
        }`}
      >
        {readiness.isReadyForContent ? (
          <CheckCircle2 className="w-5 h-5 text-[#23856B] shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-[#B67C27] shrink-0 mt-0.5" />
        )}
        <div className="space-y-1">
          <div className="text-sm font-bold text-app-primary">
            {readiness.isReadyForContent
              ? 'All Authoritative Commercial Facts & Rights Satisfied'
              : 'Action Required Before Campaign Generation'}
          </div>
          <p className="text-xs text-app-secondary leading-relaxed">
            {readiness.isReadyForContent
              ? 'This product has verified pricing, active inventory, and valid asset rights. Creative poster generation can safely proceed without risking commercial drift.'
              : 'Product facts are incomplete, stale, or lack approved marketing packshots. Review findings below before initiating creative jobs.'}
          </p>
        </div>
      </div>

      {/* Findings Breakdown */}
      <div className="space-y-2.5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-app-muted">
          Readiness Gate Findings ({readiness.findings.length})
        </h4>

        <div className="space-y-2">
          {readiness.findings.map((f, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-3 p-3 rounded-lg bg-app-surface-subtle/50 border border-app-border text-xs"
            >
              <div className="flex items-start gap-2.5">
                {renderFindingIcon(f.status)}
                <div>
                  <div className="font-semibold text-app-primary">
                    {f.category.replace(/_/g, ' ')}
                  </div>
                  <div className="text-app-muted mt-0.5">{f.message}</div>
                </div>
              </div>
              {getStatusBadge(f.status)}
            </div>
          ))}
        </div>
      </div>

      {/* Footer Audit */}
      {readiness.lastAssessedAt && (
        <div className="pt-2 text-[11px] text-app-muted flex items-center justify-between">
          <span>Freshness State: {readiness.freshnessState}</span>
          <span>Last Audited: {new Date(readiness.lastAssessedAt).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
};
