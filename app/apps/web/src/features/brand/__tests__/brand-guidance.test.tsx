import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const renderWithProviders = (view: React.ReactNode) => render(<MemoryRouter>{view}</MemoryRouter>);
import { BrandGuidancePage } from '../pages/BrandGuidancePage.js';
import { apiClient } from '../../../services/api/api-client.js';
vi.mock('../../../services/api/api-client.js', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
const guidance = {
  formality: 'EDITORIAL',
  capitalization: 'SENTENCE_CASE',
  emojiLimit: 0,
  tone: 'Business English tone',
  khmerTone: 'Business Khmer tone',
  headlineFont: 'Playfair Display',
  khmerFont: 'Noto Sans Khmer',
  englishFont: 'Montserrat',
  colors: ['#20313D'],
  ctaEnglish: 'Contact store',
  ctaKhmer: 'ទាក់ទងហាង',
  contact: 'Fixture contact',
  terminology: [],
  claimsRestrictions: ['No unverified claims'],
  lighting: 'Soft light',
  logoSourceId: null,
  textOnlyBrandName: 'Fixture brand',
  channels: {
    FACEBOOK: {
      templateId: 'EDITORIAL_SPLIT',
      panelBackground: '#20313D',
      textColor: '#FFFFFF',
      accentColor: '#FFFFFF',
    },
  },
  referenceSourceIds: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockImplementation(
    (path) =>
      Promise.resolve(
        path.endsWith('/references')
          ? []
          : [
              {
                id: 'profile',
                name: 'Business pack',
                versionNumber: 2,
                status: 'DRAFT',
                digest: 'digest',
                approvalId: null,
                guidance,
                benchmarkReport: null,
              },
            ],
      ) as never,
  );
  vi.mocked(apiClient.post).mockResolvedValue({});
});
describe('business brand guidance approval', () => {
  it('requires explicit confirmation after showing the version and its actual limitations', async () => {
    renderWithProviders(<BrandGuidancePage />);
    const approve = await screen.findByRole('button', { name: 'Approve this brand version' });
    expect(approve).toBeDisabled();
    expect(screen.getByText(/No business-approved brand pack/)).toBeInTheDocument();
    expect(
      screen.getByText(/poster provider currently receives no reference images/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/I reviewed this exact guidance/));
    fireEvent.click(approve);
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/v1/brand/guidance/profile/approve', {
        digest: 'digest',
        confirmed: true,
      }),
    );
  });
  it('keeps imported references unreviewed until a reason and rights confirmation are supplied', async () => {
    vi.mocked(apiClient.get).mockImplementation(
      (path) =>
        Promise.resolve(
          path.endsWith('/references')
            ? [
                {
                  id: 'ref',
                  sourceUrl: 'https://example.invalid/source',
                  sourceSystem: 'FACEBOOK',
                  captionText: 'Example',
                  copyrightDeclared: true,
                  copyrightOwner: 'Fixture owner',
                  licenseReference: 'Fixture permission',
                  tags: [],
                  mediaCasKeys: ['key'],
                  version: 1,
                  status: 'UNREVIEWED',
                  sourceDigest: 'hash',
                  history: [],
                },
              ]
            : [],
        ) as never,
    );
    renderWithProviders(<BrandGuidancePage />);
    const approve = await screen.findByRole('button', { name: 'Approve reference' });
    expect(approve).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Review notes'), {
      target: { value: 'Rights checked' },
    });
    expect(approve).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I inspected this image/));
    fireEvent.click(approve);
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/v1/brand/guidance/references/ref/review', {
        digest: 'hash',
        expectedReviewEventId: null,
        confirmed: true,
        decision: 'APPROVED',
        notes: 'Rights checked',
        rightsConfirmed: true,
      }),
    );
  });
  it('starts a business draft without invented official colors or tone', async () => {
    renderWithProviders(<BrandGuidancePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create brand draft' }));
    expect(screen.getByLabelText('English tone')).toHaveValue('');
    expect(screen.getByLabelText('Profile name')).toHaveValue('');
    expect(screen.getByText(/No official palette/)).toBeInTheDocument();
  });
});
