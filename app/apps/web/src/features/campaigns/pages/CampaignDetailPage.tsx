import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Plus,
  Play,
  CheckCircle2,
  Archive,
  AlertCircle,
  FileEdit,
  Save,
} from 'lucide-react';
import { PageHeader } from '../../../components/navigation/page-header.js';
import { Button } from '../../../components/ui/button.js';
import { Card, CardHeader, CardTitle } from '../../../components/ui/card.js';
import { Input } from '../../../components/ui/input.js';
import { Label } from '../../../components/ui/label.js';
import { Spinner } from '../../../components/ui/spinner.js';
import { CampaignStatusBadge } from '../components/CampaignStatusBadge.js';
import { CampaignProductList } from '../components/CampaignProductList.js';
import { CampaignTargetPricingPanel } from '../components/CampaignTargetPricingPanel.js';
import { CampaignProductPicker } from '../components/CampaignProductPicker.js';
import {
  useCampaignDetail,
  useUpdateCampaign,
  useChangeCampaignStatus,
  useAssociateCampaignProduct,
  useRemoveCampaignProduct,
} from '../hooks/use-campaigns.js';
import { usePermissions } from '../../auth/hooks/use-permissions.js';
import { Permission } from '../../../types/auth.types.js';
import type { AssociateProductInput, CampaignStatus } from '../types/campaign.types.js';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Not set';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Invalid Date';
  }
}

export const CampaignDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isEditingBrief, setIsEditingBrief] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedObjective, setEditedObjective] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: campaign, isLoading, isError, error } = useCampaignDetail(id);

  const updateMutation = useUpdateCampaign(campaign?.id ?? '');
  const statusMutation = useChangeCampaignStatus(campaign?.id ?? '');
  const associateMutation = useAssociateCampaignProduct(campaign?.id ?? '');
  const removeMutation = useRemoveCampaignProduct(campaign?.id ?? '');

  const { hasPermission } = usePermissions();
  const canEdit = hasPermission(Permission.EDIT_CONTENT);
  const canApprove = hasPermission(Permission.APPROVE_CONTENT);

  if (isLoading) {
    return (
      <div className="p-12 text-center">
        <Spinner size="lg" className="mx-auto mb-3 text-gold-500" />
        <p className="text-sm text-app-muted">Loading campaign details...</p>
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <AlertCircle className="w-10 h-10 text-status-bad mx-auto mb-3" />
        <h2 className="text-lg font-bold text-app-primary">Campaign Not Found</h2>
        <p className="text-xs text-app-muted mt-1 mb-6">
          {error?.message ||
            'The requested campaign identifier does not exist or you lack permission to view it.'}
        </p>
        <Link to="/campaigns">
          <Button variant="secondary" icon={<ArrowLeft className="w-4 h-4" />}>
            Back to Campaigns
          </Button>
        </Link>
      </div>
    );
  }

  const isEditable = (campaign.status === 'DRAFT' || campaign.status === 'PLANNED') && canEdit;
  const existingSnapshotIds = campaign.products.map((p) => p.productSnapshotId);

  const startEditing = () => {
    setEditedName(campaign.name);
    setEditedObjective(campaign.objective);
    setEditedDescription(campaign.description ?? '');
    setIsEditingBrief(true);
    setActionError(null);
  };

  const handleSaveBrief = async () => {
    setActionError(null);
    try {
      await updateMutation.mutateAsync({
        name: editedName.trim() || campaign.name,
        objective: editedObjective.trim() || campaign.objective,
        description: editedDescription.trim() || null,
      });
      setIsEditingBrief(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update campaign brief');
    }
  };

  const handleStatusTransition = async (nextStatus: CampaignStatus) => {
    setActionError(null);
    try {
      await statusMutation.mutateAsync(nextStatus);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : `Failed to transition status to ${nextStatus}`,
      );
    }
  };

  const handleAssociateProduct = async (input: AssociateProductInput) => {
    await associateMutation.mutateAsync(input);
  };

  const handleRemoveProduct = async (associationId: string) => {
    setActionError(null);
    try {
      await removeMutation.mutateAsync(associationId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove product from campaign');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Back Link & Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-app-muted mb-2">
        <Link
          to="/campaigns"
          className="inline-flex items-center gap-1 hover:text-app-primary transition-colors font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Campaigns</span>
        </Link>
        <span>/</span>
        <span className="font-mono text-gold-500 font-semibold">{campaign.code}</span>
      </div>

      {/* Detail Header */}
      <PageHeader
        eyebrow={`Campaign Code: ${campaign.code}`}
        title={campaign.name}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <CampaignStatusBadge status={campaign.status} />

            {/* Status Transition Actions */}
            {campaign.status === 'DRAFT' && isEditable && (
              <Button
                variant="gold"
                size="sm"
                icon={<CheckCircle2 className="w-4 h-4" />}
                disabled={campaign.productCount === 0 || statusMutation.isPending}
                isLoading={statusMutation.isPending}
                onClick={() => handleStatusTransition('PLANNED')}
                title={
                  campaign.productCount === 0
                    ? 'Associate at least 1 verified product before advancing to Planned'
                    : 'Advance to Planned'
                }
              >
                Advance to Planned
              </Button>
            )}

            {campaign.status === 'PLANNED' && canApprove && (
              <Button
                variant="primary"
                size="sm"
                icon={<Play className="w-4 h-4" />}
                isLoading={statusMutation.isPending}
                onClick={() => handleStatusTransition('ACTIVE')}
              >
                Activate Campaign
              </Button>
            )}

            {campaign.status === 'ACTIVE' && canEdit && (
              <Button
                variant="secondary"
                size="sm"
                icon={<CheckCircle2 className="w-4 h-4" />}
                isLoading={statusMutation.isPending}
                onClick={() => handleStatusTransition('COMPLETED')}
              >
                Mark as Completed
              </Button>
            )}

            {(campaign.status === 'COMPLETED' || campaign.status === 'ACTIVE') && canEdit && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Archive className="w-4 h-4" />}
                isLoading={statusMutation.isPending}
                onClick={() => handleStatusTransition('ARCHIVED')}
              >
                Archive
              </Button>
            )}
          </div>
        }
      />

      {/* Action Error Alert */}
      {actionError && (
        <div className="p-3.5 rounded-xl bg-status-bad/10 border border-status-bad/20 flex items-center justify-between text-xs text-status-bad">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-app-muted hover:text-app-primary p-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): Brief, Associated Products, Target Pricing */}
        <div className="lg:col-span-2 space-y-6">
          {/* Campaign Brief Card */}
          <Card elevation="subtle">
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileEdit className="w-4 h-4 text-gold-500" />
                <CardTitle className="text-sm font-bold text-app-primary">
                  Campaign Strategic Brief
                </CardTitle>
              </div>
              {isEditable && !isEditingBrief && (
                <Button variant="ghost" size="sm" onClick={startEditing}>
                  Edit Brief
                </Button>
              )}
            </CardHeader>

            <div className="p-5 space-y-4">
              {isEditingBrief ? (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="campaignName" className="text-xs font-semibold mb-1 block">
                      Campaign Name
                    </Label>
                    <Input
                      id="campaignName"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="campaignObjective" className="text-xs font-semibold mb-1 block">
                      Marketing Objective
                    </Label>
                    <textarea
                      id="campaignObjective"
                      rows={2}
                      value={editedObjective}
                      onChange={(e) => setEditedObjective(e.target.value)}
                      className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-xs focus:ring-1 focus:ring-gold-500"
                    />
                  </div>
                  <div>
                    <Label htmlFor="campaignDesc" className="text-xs font-semibold mb-1 block">
                      Campaign Scope & Notes (Optional)
                    </Label>
                    <textarea
                      id="campaignDesc"
                      rows={3}
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-xs focus:ring-1 focus:ring-gold-500"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingBrief(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="gold"
                      size="sm"
                      icon={<Save className="w-3.5 h-3.5" />}
                      isLoading={updateMutation.isPending}
                      onClick={handleSaveBrief}
                    >
                      Save Changes
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-app-muted">
                      Objective
                    </div>
                    <p className="text-xs text-app-primary leading-relaxed mt-1">
                      {campaign.objective}
                    </p>
                  </div>

                  {campaign.description && (
                    <div className="pt-3 border-t border-app-border/60">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-app-muted">
                        Description & Channels
                      </div>
                      <p className="text-xs text-app-muted leading-relaxed mt-1">
                        {campaign.description}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* Associated Products Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-app-primary">
                  Associated Catalog Products ({campaign.products.length})
                </h3>
                <p className="text-xs text-app-muted mt-0.5">
                  Products registered for this campaign activation with immutable catalog facts.
                </p>
              </div>

              {isEditable && (
                <Button
                  variant="gold"
                  size="sm"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => setIsPickerOpen(true)}
                >
                  Associate Product
                </Button>
              )}
            </div>

            <CampaignProductList
              products={campaign.products}
              isEditable={isEditable}
              onRemoveProduct={handleRemoveProduct}
              isRemoving={removeMutation.isPending}
            />
          </div>

          {/* Target Pricing Commercial Integrity Panel */}
          {campaign.products.length > 0 && (
            <CampaignTargetPricingPanel products={campaign.products} />
          )}
        </div>

        {/* Right Column (1 col): Schedule & Metadata Card */}
        <div className="space-y-6">
          <Card elevation="subtle">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gold-500" />
                <CardTitle className="text-sm font-bold text-app-primary">
                  Timeline & Schedule
                </CardTitle>
              </div>
            </CardHeader>

            <div className="p-5 space-y-4 text-xs">
              <div className="flex justify-between items-center py-2 border-b border-app-border/60">
                <span className="text-app-muted">Start Date</span>
                <span className="font-semibold text-app-primary">
                  {formatDate(campaign.startDate)}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-app-border/60">
                <span className="text-app-muted">End Date</span>
                <span className="font-semibold text-app-primary">
                  {formatDate(campaign.endDate)}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-app-border/60">
                <span className="text-app-muted">Created By</span>
                <span className="font-semibold text-app-primary flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-app-muted" />
                  {campaign.createdByDisplayName || 'Commercial Merchandiser'}
                </span>
              </div>

              <div className="flex justify-between items-center py-2">
                <span className="text-app-muted">Last Updated</span>
                <span className="font-medium text-app-muted flex items-center gap-1">
                  <Clock className="w-3 h-3 text-app-muted" />
                  {formatDate(campaign.updatedAt)}
                </span>
              </div>
            </div>
          </Card>

          {/* Commercial Lifecycle Guidelines Card */}
          <Card elevation="subtle" className="bg-app-surface-subtle border-app-border/70">
            <div className="p-5 space-y-3 text-xs text-app-muted">
              <div className="font-bold text-app-primary text-xs uppercase tracking-wider">
                Lifecycle Progression Rules
              </div>
              <ul className="space-y-2 list-disc list-inside leading-relaxed text-[11px]">
                <li>
                  <strong className="text-app-primary">Draft:</strong> Open for editing and product
                  association. Requires ≥1 product to advance.
                </li>
                <li>
                  <strong className="text-app-primary">Planned:</strong> Schedule & products locked
                  for review. Activation requires approver permissions.
                </li>
                <li>
                  <strong className="text-app-primary">Active:</strong> In-flight campaign. Eligible
                  for AI content and creative scene synthesis.
                </li>
                <li>
                  <strong className="text-app-primary">Completed / Archived:</strong> Closed
                  commercial activations preserved for auditing.
                </li>
              </ul>
            </div>
          </Card>
        </div>
      </div>

      {/* Product Picker Modal */}
      <CampaignProductPicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onAssociate={handleAssociateProduct}
        existingSnapshotIds={existingSnapshotIds}
        isSubmitting={associateMutation.isPending}
      />
    </div>
  );
};
