import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Key,
  Layers,
  RefreshCw,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '../../../components/navigation/page-header.js';
import { Button } from '../../../components/ui/button.js';
import { Card } from '../../../components/ui/card.js';
import { Skeleton } from '../../../components/ui/skeleton.js';
import { Permission } from '../../../types/auth.types.js';
import { usePermissions } from '../../auth/hooks/use-permissions.js';
import { ChannelBadge } from '../components/ChannelBadge.js';
import { PublicationStatusBadge } from '../components/PublicationStatusBadge.js';
import {
  useCancelPublication,
  useConfirmPublication,
  usePublicationDetail,
  useRetryPublication,
} from '../hooks/use-publishing.js';
import { PublicationChannel, PublicationStatus } from '../types/publishing.types.js';

export const PublicationDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const { hasPermission } = usePermissions();
  const canPublish = hasPermission(Permission.PUBLISH_CREATIVE);

  const { data: publication, isLoading, isError, error, refetch } = usePublicationDetail(id);
  const confirmMutation = useConfirmPublication();
  const retryMutation = useRetryPublication();
  const cancelMutation = useCancelPublication();

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !publication) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Card className="p-8 text-center border-rose-200 bg-rose-50/40">
          <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <div className="text-sm font-semibold text-rose-900">Publication Not Found</div>
          <div className="text-xs text-rose-700 mt-1">
            {(error as Error)?.message ?? 'The requested publication could not be located.'}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/publishing')}
            className="mt-4"
          >
            Back to Publishing Desk
          </Button>
        </Card>
      </div>
    );
  }

  const handleConfirm = async () => {
    setActionError(null);
    try {
      await confirmMutation.mutateAsync(publication.id);
      void refetch();
    } catch (err) {
      setActionError((err as Error).message ?? 'Failed to confirm publication');
    }
  };

  const handleRetry = async () => {
    setActionError(null);
    try {
      await retryMutation.mutateAsync(publication.id);
      void refetch();
    } catch (err) {
      setActionError((err as Error).message ?? 'Failed to retry publication');
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) return;
    setActionError(null);
    try {
      await cancelMutation.mutateAsync({
        id: publication.id,
        reason: cancelReason.trim(),
      });
      setIsCancelModalOpen(false);
      setCancelReason('');
      void refetch();
    } catch (err) {
      setActionError((err as Error).message ?? 'Failed to cancel publication');
    }
  };

  const canConfirm =
    canPublish &&
    (publication.status === PublicationStatus.DRAFT ||
      publication.status === PublicationStatus.READY);

  const canRetry = canPublish && publication.status === PublicationStatus.FAILED;

  const canCancel =
    canPublish &&
    (publication.status === PublicationStatus.DRAFT ||
      publication.status === PublicationStatus.READY ||
      publication.status === PublicationStatus.QUEUED);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        eyebrow="Publication Record"
        title={`Publication #${publication.id.slice(0, 8)}`}
        subtitle="Detailed record of publication parameters, delivery state, attempt audit trail, and export package."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<ArrowLeft className="w-4 h-4" />}
              onClick={() => navigate('/publishing')}
            >
              Back
            </Button>
            {canRetry && (
              <Button
                variant="gold"
                size="sm"
                icon={<RefreshCw className="w-4 h-4" />}
                isLoading={retryMutation.isPending}
                onClick={() => void handleRetry()}
              >
                Retry Dispatch
              </Button>
            )}
            {canConfirm && (
              <Button
                variant="primary"
                size="sm"
                icon={<Send className="w-4 h-4" />}
                isLoading={confirmMutation.isPending}
                onClick={() => void handleConfirm()}
              >
                Confirm & Dispatch
              </Button>
            )}
            {canCancel && (
              <Button
                variant="destructive"
                size="sm"
                icon={<X className="w-4 h-4" />}
                onClick={() => setIsCancelModalOpen(true)}
              >
                Cancel
              </Button>
            )}
          </div>
        }
      />

      {actionError && (
        <Card className="p-4 bg-rose-50 border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{actionError}</span>
        </Card>
      )}

      {/* Main Status & Destination Banner */}
      <Card className="p-6 border border-app-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-app-border">
          <div className="flex items-center gap-3">
            <ChannelBadge channel={publication.destinationChannel} />
            <PublicationStatusBadge status={publication.status} />
          </div>
          <div className="text-xs text-app-muted">
            Created: {new Date(publication.createdAt).toLocaleString()}
          </div>
        </div>

        {publication.status === PublicationStatus.PUBLISHED && (
          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Distribution completed successfully on{' '}
                {publication.publishedAt
                  ? new Date(publication.publishedAt).toLocaleString()
                  : 'N/A'}
                .
              </span>
            </div>
            {publication.destinationChannel === PublicationChannel.MANUAL_EXPORT && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Download className="w-3.5 h-3.5" />}
                onClick={() => window.open(`/v1/creative/renders/download`, '_blank')}
              >
                Download Package
              </Button>
            )}
          </div>
        )}

        {publication.status === PublicationStatus.FAILED && (
          <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Distribution failed. Inspect attempt logs below and retry safely.</span>
          </div>
        )}

        {publication.cancellationReason && (
          <div className="p-3 bg-app-surface rounded-lg border border-app-border text-xs text-app-muted">
            <span className="font-semibold text-app-primary">Cancellation Reason: </span>
            {publication.cancellationReason}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
          <div className="space-y-1.5">
            <div className="text-app-muted font-medium">Idempotency Key:</div>
            <div className="font-mono text-[11px] text-app-primary bg-app-surface p-2 rounded border border-app-border truncate">
              {publication.idempotencyKey}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-app-muted font-medium">Requested By:</div>
            <div className="text-app-primary font-medium bg-app-surface p-2 rounded border border-app-border">
              {publication.requestedByUser.displayName}
            </div>
          </div>
        </div>
      </Card>

      {/* Associated Content and Campaign */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card className="p-5 border border-app-border space-y-3">
          <h4 className="text-xs font-semibold text-app-primary uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-gold-600" />
            <span>Content Version Reference</span>
          </h4>
          <div className="text-xs space-y-2">
            <div className="flex justify-between py-1 border-b border-app-border/60">
              <span className="text-app-muted">Version Number:</span>
              <span className="font-semibold text-app-primary">
                #{publication.contentVersion.versionNumber}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-app-border/60">
              <span className="text-app-muted">Content Job:</span>
              <span className="font-mono text-app-primary">
                {publication.contentVersion.contentJobId.slice(0, 8)}…
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-app-muted">Content Version ID:</span>
              <span className="font-mono text-app-primary">
                {publication.contentVersion.id.slice(0, 8)}…
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-5 border border-app-border space-y-3">
          <h4 className="text-xs font-semibold text-app-primary uppercase tracking-wider flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-gold-600" />
            <span>Associated Creative Export</span>
          </h4>
          {publication.creativeExport ? (
            <div className="text-xs space-y-2">
              <div className="flex justify-between py-1 border-b border-app-border/60">
                <span className="text-app-muted">Format:</span>
                <span className="font-semibold text-app-primary">
                  {publication.creativeExport.format}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-app-border/60">
                <span className="text-app-muted">Dimensions:</span>
                <span className="font-mono text-app-primary">
                  {publication.creativeExport.width} × {publication.creativeExport.height} (
                  {publication.creativeExport.encoding})
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-app-muted py-2">
              No visual poster export attached to this distribution request.
            </div>
          )}
        </Card>
      </div>

      {/* Attempt History Timeline */}
      <Card className="p-6 border border-app-border space-y-4">
        <h4 className="text-xs font-semibold text-app-primary uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-gold-600" />
          <span>Dispatch & Delivery Attempts ({publication.attempts.length})</span>
        </h4>

        {publication.attempts.length === 0 ? (
          <div className="text-xs text-app-muted py-4 text-center bg-app-surface rounded-lg border border-app-border">
            No dispatch attempts recorded yet. Confirmation will trigger the first attempt.
          </div>
        ) : (
          <div className="space-y-3">
            {publication.attempts.map((att) => (
              <div
                key={att.id}
                className="p-3 bg-app-surface rounded-lg border border-app-border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-app-primary">
                      Attempt #{att.attemptNumber}
                    </span>
                    <PublicationStatusBadge status={att.status} />
                  </div>
                  {att.errorMessage && (
                    <div className="text-rose-600 text-[11px]">{att.errorMessage}</div>
                  )}
                  {att.externalPublicationId && (
                    <div className="text-[11px] font-mono text-app-muted">
                      Ext ID: {att.externalPublicationId}
                    </div>
                  )}
                </div>
                <div className="text-right text-[11px] text-app-muted shrink-0">
                  <div>Started: {new Date(att.startedAt).toLocaleTimeString()}</div>
                  {att.completedAt && (
                    <div>Completed: {new Date(att.completedAt).toLocaleTimeString()}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Cancel Confirmation Modal */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl border border-app-border">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-app-primary">Cancel Publication Request</h3>
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="p-1 rounded text-app-muted hover:text-app-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-app-muted">
              Provide a deliberate cancellation reason. This will transition the record to CANCELLED
              and prevent dispatch.
            </p>

            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Content update required before distribution..."
              rows={3}
              className="w-full text-xs p-2.5 rounded-lg border border-app-border bg-white text-app-primary focus:outline-none focus:ring-1 focus:ring-gold-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setIsCancelModalOpen(false)}>
                Back
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={!cancelReason.trim()}
                isLoading={cancelMutation.isPending}
                onClick={() => void handleCancel()}
              >
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
