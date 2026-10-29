import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/test-utils.js';
import { CampaignCreationWizard } from '../pages/CampaignCreationWizard.js';
import { campaignsApi } from '../api/campaigns-api.js';
import type { CampaignDetail } from '../types/campaign.types.js';

vi.mock('../api/campaigns-api.js', () => ({
  campaignsApi: {
    createCampaign: vi.fn(),
  },
}));

vi.mock('../../../services/api/auth-api.js', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentEmployee: vi.fn().mockResolvedValue({
      user: {
        id: 'user-admin',
        displayName: 'Merchandising Admin',
        roles: ['ADMIN'],
        permissions: ['CREATE_CONTENT', 'VIEW_OWN_CONTENT'],
      },
    }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Campaign Creation Wizard (WEB-CAMP-13 to WEB-CAMP-16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('WEB-CAMP-13 & WEB-CAMP-14: auto-generates code from name and navigates between wizard steps', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CampaignCreationWizard />);

    expect(screen.getByText('Initialize New Campaign')).toBeInTheDocument();
    expect(screen.getByText('Identity & Objective')).toBeInTheDocument();

    // Type Name -> should auto-generate code
    const nameInput = screen.getByLabelText(/campaign name \*/i);
    await user.type(nameInput, 'Autumn Amber Premiere');

    const codeInput = screen.getByLabelText(/unique campaign code/i) as HTMLInputElement;
    expect(codeInput.value).toBe('CAMP-AUTUMN-AMBER-PRE');

    // Type Objective
    const objectiveInput = screen.getByLabelText(/commercial objective \*/i);
    await user.type(objectiveInput, 'Promote amber and woody fragrances for fall season.');

    // Next step -> Schedule
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));

    await waitFor(() => {
      expect(screen.getByText('Schedule & Activation Period')).toBeInTheDocument();
    });

    // Back step -> Identity
    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/campaign name \*/i)).toBeInTheDocument();
    });
  });

  it('WEB-CAMP-15: validates required fields before allowing progression', async () => {
    renderWithProviders(<CampaignCreationWizard />);

    // Try to advance without filling required fields
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));

    await waitFor(() => {
      expect(screen.getByText(/campaign code is required/i)).toBeInTheDocument();
    });
  });

  it('WEB-CAMP-16: completes wizard flow and creates campaign in DRAFT status', async () => {
    const user = userEvent.setup();

    const createdCampaign: CampaignDetail = {
      id: 'camp-new-123',
      code: 'CAMP-WINTER-2026',
      name: 'Winter Solstice Cashmere Collection',
      objective: 'Holiday gift set spotlight',
      description: 'Showroom display and digital brochure',
      status: 'DRAFT',
      startDate: '2026-11-01T00:00:00.000Z',
      endDate: '2026-12-25T00:00:00.000Z',
      createdById: 'user-admin',
      createdByDisplayName: 'Merchandising Admin',
      productCount: 0,
      heroProductSku: null,
      heroProductTitle: null,
      products: [],
      createdAt: '2026-10-29T00:00:00.000Z',
      updatedAt: '2026-10-29T00:00:00.000Z',
    };

    vi.mocked(campaignsApi.createCampaign).mockResolvedValueOnce(createdCampaign);

    renderWithProviders(<CampaignCreationWizard />);

    // Step 1: Fill Identity
    await user.type(
      screen.getByLabelText(/campaign name \*/i),
      'Winter Solstice Cashmere Collection',
    );
    await user.type(
      screen.getByLabelText(/commercial objective \*/i),
      'Holiday gift set spotlight',
    );

    fireEvent.click(screen.getByRole('button', { name: /next step/i }));

    // Step 2: Fill Schedule
    await waitFor(() => {
      expect(screen.getByText('Schedule & Activation Period')).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText(/scope, description & channels/i),
      'Showroom display and digital brochure',
    );

    fireEvent.click(screen.getByRole('button', { name: /next step/i }));

    // Step 3: Review & Submit
    await waitFor(() => {
      expect(screen.getByText('Review & Initialize Campaign')).toBeInTheDocument();
      expect(screen.getByText('Winter Solstice Cashmere Collection')).toBeInTheDocument();
      expect(screen.getByText('Holiday gift set spotlight')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /initialize campaign/i }));

    await waitFor(() => {
      expect(campaignsApi.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Winter Solstice Cashmere Collection',
          objective: 'Holiday gift set spotlight',
          description: 'Showroom display and digital brochure',
        }),
      );
    });
  });
});
