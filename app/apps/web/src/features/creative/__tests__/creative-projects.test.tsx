import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/test-utils.js';
import { CreativeProjectsPage } from '../pages/CreativeProjectsPage.js';
import { creativeApi } from '../api/creative-api.js';
import type { PaginatedCreativeProjects } from '../types/creative.types.js';

vi.mock('../api/creative-api.js', () => ({
  creativeApi: {
    getTemplates: vi.fn(),
    getProjects: vi.fn(),
    getProjectById: vi.fn(),
    createProject: vi.fn(),
    reviseProject: vi.fn(),
    getProjectVersions: vi.fn(),
    validateProject: vi.fn(),
    renderPreview: vi.fn(),
    exportProject: vi.fn(),
  },
}));

vi.mock('../../../services/api/auth-api.js', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentEmployee: vi.fn().mockResolvedValue({
      user: {
        id: 'usr-creative-001',
        displayName: 'Creative Editor',
        roles: ['MARKETING_EDITOR'],
        permissions: ['VIEW_OWN_CONTENT', 'EDIT_CREATIVE'],
      },
    }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Creative Projects Feature (WEB-CREATIVE-01 to WEB-CREATIVE-04)', () => {
  const sampleProjects: PaginatedCreativeProjects = {
    items: [
      {
        scene: {
          id: 'scene-001',
          creativeJobId: 'job-001',
          campaignId: null,
          title: 'Moonlit River Launch Poster',
          currentVersionNumber: 1,
          createdAt: '2026-10-29T10:00:00.000Z',
          updatedAt: '2026-10-29T10:00:00.000Z',
        },
        latestVersion: {
          id: 'ver-001',
          sceneId: 'scene-001',
          versionNumber: 1,
          parentVersionId: null,
          aspectRatio: '1:1',
          width: 1080,
          height: 1080,
          templateId: 'EDITORIAL_SPLIT',
          templateVersion: '1.0.0',
          stylePresetId: null,
          language: 'EN',
          safeMargins: { top: 80, bottom: 80, left: 80, right: 80 },
          brandProfileVersionId: 'rule-001',
          sourceContentVersionId: 'cv-001',
          productSnapshotId: 'snap-001',
          sceneHash: 'a'.repeat(64),
          dependencyHash: 'b'.repeat(64),
          changeReason: 'Initial poster composition',
          operationCode: 'INITIAL_DRAFT',
          requestedByUserId: 'usr-creative-001',
          metadata: null,
          createdAt: '2026-10-29T10:00:00.000Z',
          layers: [],
        },
        productSnapshot: {
          id: 'snap-001',
          sku: 'FIC-PERF-001',
          productName: 'Moonlit River Eau de Parfum',
          brand: 'Maison Imaginaire',
          price: 38.0,
        },
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('WEB-CREATIVE-01: renders creative projects listing with project cards, titles, SKU badges, and template badges', async () => {
    vi.mocked(creativeApi.getProjects).mockResolvedValue(sampleProjects);

    renderWithProviders(<CreativeProjectsPage />);

    expect(screen.getByText('Creative Studio')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Moonlit River Launch Poster')).toBeInTheDocument();
      expect(screen.getByText('FIC-PERF-001')).toBeInTheDocument();
      expect(screen.getByText('EDITORIAL_SPLIT')).toBeInTheDocument();
      expect(screen.getByText('1:1')).toBeInTheDocument();
      expect(screen.getByText('$38.00 USD')).toBeInTheDocument();
      expect(screen.getByText('Open Studio')).toBeInTheDocument();
    });
  });

  it('WEB-CREATIVE-02: search input updates filter params and calls api', async () => {
    vi.mocked(creativeApi.getProjects).mockResolvedValue(sampleProjects);
    const user = userEvent.setup();

    renderWithProviders(<CreativeProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText('Moonlit River Launch Poster')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search creative projects/i);
    await user.type(searchInput, 'Moonlit');

    await waitFor(() => {
      expect(creativeApi.getProjects).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Moonlit' }),
      );
    });
  });

  it('WEB-CREATIVE-03: renders empty state when no projects match', async () => {
    vi.mocked(creativeApi.getProjects).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });

    renderWithProviders(<CreativeProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText('No creative projects found')).toBeInTheDocument();
    });
  });

  it('WEB-CREATIVE-04: displays "New Creative Project" button linking to /creative/new', async () => {
    vi.mocked(creativeApi.getProjects).mockResolvedValue(sampleProjects);

    renderWithProviders(<CreativeProjectsPage />);

    await waitFor(() => {
      const newBtn = screen.getByRole('link', { name: /New Creative Project/i });
      expect(newBtn).toBeInTheDocument();
      expect(newBtn).toHaveAttribute('href', '/creative/new');
    });
  });
});
