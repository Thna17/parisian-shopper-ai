import React from 'react';
import { ShieldCheck, ShieldAlert, AlertOctagon, Activity } from 'lucide-react';
import type { CircuitBreakerStatus, AiModality } from '../types/budget.types.js';
import { Badge } from '../../../components/ui/badge.js';

export interface CircuitBreakerStatusCardProps {
  readonly statuses?: readonly CircuitBreakerStatus[];
}

function getModalityBadge(modality: AiModality): string {
  switch (modality) {
    case 'TEXT':
      return 'bg-blue-50 text-blue-800 border-blue-200';
    case 'IMAGE':
      return 'bg-purple-50 text-purple-800 border-purple-200';
    case 'VIDEO':
      return 'bg-amber-50 text-amber-800 border-amber-200';
  }
}

export const CircuitBreakerStatusCard: React.FC<CircuitBreakerStatusCardProps> = ({
  statuses = [],
}) => {
  return (
    <div className="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-app-border/70">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-gold-500" />
          <h2 className="font-serif font-bold text-sm text-[#243746]">
            Modality Circuit Breaker Health
          </h2>
        </div>
        <span className="text-[10px] font-mono text-app-muted uppercase tracking-wider">
          Status
        </span>
      </div>

      {statuses.length === 0 && (
        <p className="text-xs text-app-muted">Circuit breaker status is not available.</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {statuses.map((circuit) => {
          const isClosed = circuit.state === 'CLOSED';
          const isHalfOpen = circuit.state === 'HALF_OPEN';

          return (
            <div
              key={`${circuit.providerId}-${circuit.modality}`}
              className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-3 transition-all ${
                isClosed
                  ? 'bg-emerald-50/20 border-emerald-200/70'
                  : isHalfOpen
                    ? 'bg-amber-50/20 border-amber-200/70'
                    : 'bg-rose-50/20 border-rose-200/70'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded border ${getModalityBadge(
                    circuit.modality,
                  )}`}
                >
                  {circuit.modality}
                </span>
                <Badge variant={isClosed ? 'good' : isHalfOpen ? 'warn' : 'bad'} dot>
                  {circuit.state}
                </Badge>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-semibold text-app-primary font-mono truncate">
                  {circuit.providerId}
                </div>
                <div className="text-[11px] text-app-muted flex justify-between">
                  <span>Failures:</span>
                  <span className="font-mono font-medium text-app-primary">
                    {circuit.consecutiveFailures}
                  </span>
                </div>
                <div className="text-[11px] text-app-muted flex justify-between">
                  <span>Cooldown:</span>
                  <span className="font-mono font-medium text-app-primary">
                    {circuit.cooldownSecondsRemaining > 0
                      ? `${circuit.cooldownSecondsRemaining}s`
                      : '0s'}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-app-border/40 flex items-center gap-1.5 text-[10px] text-app-muted">
                {isClosed ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : isHalfOpen ? (
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                ) : (
                  <AlertOctagon className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                )}
                <span className="truncate">
                  {isClosed
                    ? 'Traffic Nominally Routed'
                    : isHalfOpen
                      ? 'Canary Probe Allowed'
                      : 'Dispatch Halted'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
