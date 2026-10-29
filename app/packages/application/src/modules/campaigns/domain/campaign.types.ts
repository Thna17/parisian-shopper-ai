export const CampaignStatus = {
  DRAFT: 'DRAFT',
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];

export const VALID_STATUS_TRANSITIONS: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> =
  {
    DRAFT: [CampaignStatus.PLANNED, CampaignStatus.ARCHIVED],
    PLANNED: [CampaignStatus.DRAFT, CampaignStatus.ACTIVE, CampaignStatus.ARCHIVED],
    ACTIVE: [CampaignStatus.COMPLETED, CampaignStatus.ARCHIVED],
    COMPLETED: [CampaignStatus.ARCHIVED],
    ARCHIVED: [],
  };

export function isAllowedCampaignTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  if (from === to) return true;
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
