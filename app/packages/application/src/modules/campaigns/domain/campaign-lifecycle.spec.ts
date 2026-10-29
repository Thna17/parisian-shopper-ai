import { CampaignStatus, isAllowedCampaignTransition } from './campaign.types.js';

describe('Campaign Domain Lifecycle Transitions', () => {
  it('allows transition from DRAFT to PLANNED or ARCHIVED', () => {
    expect(isAllowedCampaignTransition(CampaignStatus.DRAFT, CampaignStatus.PLANNED)).toBe(true);
    expect(isAllowedCampaignTransition(CampaignStatus.DRAFT, CampaignStatus.ARCHIVED)).toBe(true);
    expect(isAllowedCampaignTransition(CampaignStatus.DRAFT, CampaignStatus.DRAFT)).toBe(true);
    // Invalid from DRAFT
    expect(isAllowedCampaignTransition(CampaignStatus.DRAFT, CampaignStatus.ACTIVE)).toBe(false);
    expect(isAllowedCampaignTransition(CampaignStatus.DRAFT, CampaignStatus.COMPLETED)).toBe(false);
  });

  it('allows transition from PLANNED to ACTIVE, DRAFT, or ARCHIVED', () => {
    expect(isAllowedCampaignTransition(CampaignStatus.PLANNED, CampaignStatus.ACTIVE)).toBe(true);
    expect(isAllowedCampaignTransition(CampaignStatus.PLANNED, CampaignStatus.DRAFT)).toBe(true);
    expect(isAllowedCampaignTransition(CampaignStatus.PLANNED, CampaignStatus.ARCHIVED)).toBe(true);
    // Invalid from PLANNED
    expect(isAllowedCampaignTransition(CampaignStatus.PLANNED, CampaignStatus.COMPLETED)).toBe(
      false,
    );
  });

  it('allows transition from ACTIVE to COMPLETED or ARCHIVED', () => {
    expect(isAllowedCampaignTransition(CampaignStatus.ACTIVE, CampaignStatus.COMPLETED)).toBe(true);
    expect(isAllowedCampaignTransition(CampaignStatus.ACTIVE, CampaignStatus.ARCHIVED)).toBe(true);
    // Invalid from ACTIVE
    expect(isAllowedCampaignTransition(CampaignStatus.ACTIVE, CampaignStatus.DRAFT)).toBe(false);
    expect(isAllowedCampaignTransition(CampaignStatus.ACTIVE, CampaignStatus.PLANNED)).toBe(false);
  });

  it('allows transition from COMPLETED to ARCHIVED', () => {
    expect(isAllowedCampaignTransition(CampaignStatus.COMPLETED, CampaignStatus.ARCHIVED)).toBe(
      true,
    );
    expect(isAllowedCampaignTransition(CampaignStatus.COMPLETED, CampaignStatus.ACTIVE)).toBe(
      false,
    );
  });

  it('disallows any transitions from ARCHIVED', () => {
    expect(isAllowedCampaignTransition(CampaignStatus.ARCHIVED, CampaignStatus.DRAFT)).toBe(false);
    expect(isAllowedCampaignTransition(CampaignStatus.ARCHIVED, CampaignStatus.PLANNED)).toBe(
      false,
    );
    expect(isAllowedCampaignTransition(CampaignStatus.ARCHIVED, CampaignStatus.ACTIVE)).toBe(false);
    expect(isAllowedCampaignTransition(CampaignStatus.ARCHIVED, CampaignStatus.COMPLETED)).toBe(
      false,
    );
  });
});
