import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../../test/test-utils.js';
import { CreativeEditorPage } from '../pages/CreativeEditorPage.js';
import { creativeApi } from '../api/creative-api.js';
import type {
  CreativeProjectDetail,
  CreativeSceneVersionRecord,
  ValidationAssessmentResult,
  RenderPreviewResult,
} from '../types/creative.types.js';

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
        permissions: ['VIEW_OWN_CONTENT', 'EDIT_CREATIVE', 'EXPORT_CREATIVE'],
      },
    }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Creative Studio Editor Workstation (WEB-CREATIVE-05 to WEB-CREATIVE-12)', () => {
  const sampleSceneVersion: CreativeSceneVersionRecord = {
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
    layers: [
      {
        id: 'layer-bg-1',
        sceneVersionId: 'ver-001',
        layerKey: 'bg_01',
        layerGroup: 'BACKGROUND',
        layerType: 'GENERATED_BACKGROUND',
        name: 'Background Ambiance',
        zIndex: 0,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 0, y: 0, width: 1080, height: 1080 },
        payloadSchemaVersion: 1,
        sortOrder: 0,
        layerHash: '1'.repeat(64),
        createdAt: '2026-10-29T10:00:00.000Z',
        payload: {
          assetType: 'GENERATED_BACKGROUND',
          casStorageKey: 'cas/bg.png',
          sha256: 'a'.repeat(64),
        },
      },
      {
        id: 'layer-hero-1',
        sceneVersionId: 'ver-001',
        layerKey: 'hero_01',
        layerGroup: 'PRODUCT_HERO',
        layerType: 'HERO_CUTOUT',
        name: 'Product Hero',
        zIndex: 200,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 240, y: 300, width: 600, height: 600 },
        payloadSchemaVersion: 1,
        sortOrder: 1,
        layerHash: '2'.repeat(64),
        createdAt: '2026-10-29T10:00:00.000Z',
        payload: {
          productSnapshotId: 'snap-001',
          productAssetId: 'asset-hero-1',
          assetRole: 'HERO_CUTOUT',
          casStorageKey: 'cas/hero.png',
          sha256: 'h'.repeat(64),
          mimeType: 'image/png',
          format: 'png',
          byteSize: 100000,
          width: 600,
          height: 600,
          pixelCount: 360000,
          channels: 4,
          hasAlpha: true,
          transparencyRatio: 0.35,
          rightsState: 'VERIFIED',
          approvalDecision: 'APPROVED',
        },
      },
      {
        id: 'layer-typo-1',
        sceneVersionId: 'ver-001',
        layerKey: 'typo_01',
        layerGroup: 'TYPOGRAPHY',
        layerType: 'TYPOGRAPHY_BLOCK',
        name: 'Typography Block',
        zIndex: 300,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        bounds: { x: 80, y: 900, width: 920, height: 80 },
        payloadSchemaVersion: 1,
        sortOrder: 2,
        layerHash: '3'.repeat(64),
        createdAt: '2026-10-29T10:00:00.000Z',
        payload: {
          headline: {
            text: 'Moonlit River Luxury EDP',
            fontFamily: 'Playfair Display',
            fontWeight: 700,
            fontSize: 44,
            color: '#FFFFFF',
          },
          subheadline: {
            text: 'A sensory voyage to Grasse with notes of Damask rose.',
            fontFamily: 'Montserrat',
            fontWeight: 500,
            fontSize: 20,
            color: '#C5BCB3',
          },
          priceBadge: {
            regularPrice: '$38.00 USD',
            currency: 'USD',
          },
        },
      },
    ],
  };

  const sampleDetail: CreativeProjectDetail = {
    project: {
      id: 'scene-001',
      creativeJobId: 'job-001',
      campaignId: null,
      title: 'Moonlit River Launch Poster',
      currentVersionNumber: 1,
      createdAt: '2026-10-29T10:00:00.000Z',
      updatedAt: '2026-10-29T10:00:00.000Z',
    },
    currentVersion: sampleSceneVersion,
    productSnapshot: {
      id: 'snap-001',
      sku: 'FIC-PERF-001',
      productName: 'Moonlit River Eau de Parfum',
      brand: 'Maison Imaginaire',
      price: 38.0,
      currency: 'USD',
    },
    campaign: null,
    availableHeroAssets: [],
    canEdit: true,
    canApprove: true,
    canExport: true,
  };

  const sampleValidation: ValidationAssessmentResult = {
    isPassed: true,
    blockingCount: 0,
    warningCount: 0,
    infoCount: 0,
    findings: [],
    aestheticScore: 9.2,
    scoreBreakdown: {
      typographyLegibility: 9.5,
      spatialBalance: 9.0,
      focalProminence: 9.4,
      brandDignity: 9.0,
      colorHarmony: 9.1,
    },
  };

  const sampleRenderResult: RenderPreviewResult = {
    visualAssetId: 'asset-render-001',
    width: 1080,
    height: 1080,
    byteSize: 45000,
    sha256: '9'.repeat(64),
    previewUrl: '/v1/creative/renders/asset-render-001/file',
    validation: sampleValidation,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(creativeApi.getProjectById).mockResolvedValue(sampleDetail);
    vi.mocked(creativeApi.getProjectVersions).mockResolvedValue([sampleSceneVersion]);
  });

  function renderEditor() {
    return renderWithProviders(
      <Routes>
        <Route path="/creative/projects/:id" element={<CreativeEditorPage />} />
      </Routes>,
      { initialEntries: ['/creative/projects/scene-001'] },
    );
  }

  it('WEB-CREATIVE-05: renders workstation with title, SKU badge, version badge, and canvas viewport', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('Moonlit River Launch Poster')).toBeInTheDocument();
      expect(screen.getByText('FIC-PERF-001')).toBeInTheDocument();
      expect(screen.getByText('v1')).toBeInTheDocument();
      expect(screen.getByTestId('creative-canvas-container')).toBeInTheDocument();
    });
  });

  it('WEB-CREATIVE-06: toggles safe margins guide overlay on canvas', async () => {
    const user = userEvent.setup();
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText(/Safe Area/i)).toBeInTheDocument();
    });

    const toggleBtn = screen.getByRole('button', { name: /Safe Margins/i });
    await user.click(toggleBtn);

    expect(screen.queryByText(/Safe Area/i)).not.toBeInTheDocument();
  });

  it('WEB-CREATIVE-07: selecting a layer in Layers panel opens and highlights layer properties', async () => {
    const user = userEvent.setup();
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('Typography Block')).toBeInTheDocument();
    });

    const typoLayerItem = screen.getByTestId('layer-item-typo_01');
    await user.click(typoLayerItem);

    await waitFor(() => {
      expect(screen.getByText(/Headline Text/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue('Moonlit River Luxury EDP')).toBeInTheDocument();
    });
  });

  it('WEB-CREATIVE-08: modifying layer coordinates marks unsaved changes and enables "Save Revision"', async () => {
    const user = userEvent.setup();
    vi.mocked(creativeApi.reviseProject).mockResolvedValue({
      ...sampleSceneVersion,
      versionNumber: 2,
    });

    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('Moonlit River Launch Poster')).toBeInTheDocument();
    });

    // Select typography layer
    await user.click(screen.getByTestId('layer-item-typo_01'));

    const headlineInput = screen.getByDisplayValue('Moonlit River Luxury EDP');
    await user.clear(headlineInput);
    await user.type(headlineInput, 'Moonlit River Special Edition');

    const saveBtn = screen.getByRole('button', { name: /Save Revision/i });
    expect(saveBtn).not.toBeDisabled();

    await user.click(saveBtn);

    await waitFor(() => {
      expect(creativeApi.reviseProject).toHaveBeenCalledWith(
        'scene-001',
        expect.objectContaining({
          expectedVersionNumber: 1,
          operationCode: 'EDIT_LAYOUT',
        }),
      );
    });
  });

  it('WEB-CREATIVE-09: validates visual hard gates and displays aesthetic quality score breakdown', async () => {
    const user = userEvent.setup();
    vi.mocked(creativeApi.validateProject).mockResolvedValue(sampleValidation);

    renderEditor();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Validate Gates/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Validate Gates/i }));

    await waitFor(() => {
      expect(creativeApi.validateProject).toHaveBeenCalled();
      expect(screen.getByText(/Visual & Commercial Gates Passed/i)).toBeInTheDocument();
      expect(screen.getByText('9.2 / 10.0')).toBeInTheDocument();
      expect(screen.getByText('Typography:')).toBeInTheDocument();
    });
  });

  it('WEB-CREATIVE-10: triggers high-fidelity server preview and displays raster stream', async () => {
    const user = userEvent.setup();
    vi.mocked(creativeApi.renderPreview).mockResolvedValue(sampleRenderResult);

    renderEditor();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Render Preview/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Render Preview/i }));

    await waitFor(() => {
      expect(creativeApi.renderPreview).toHaveBeenCalled();
      expect(screen.getByAltText('Composited Server Preview')).toBeInTheDocument();
      expect(screen.getByText('Sharp + HarfBuzz Shaper')).toBeInTheDocument();
      expect(screen.getByText(/Download PNG/i)).toBeInTheDocument();
    });
  });

  it('WEB-CREATIVE-11: shows revision ledger history with version numbers and change reasons', async () => {
    const user = userEvent.setup();
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('History')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /History/i }));

    await waitFor(() => {
      expect(screen.getByText(/Immutable Revision Ledger/i)).toBeInTheDocument();
      expect(screen.getByTestId('version-item-1')).toBeInTheDocument();
      expect(screen.getByText('Initial poster composition')).toBeInTheDocument();
    });
  });

  it('WEB-CREATIVE-12: multi-format export dialog opens and allows export execution', async () => {
    const user = userEvent.setup();
    vi.mocked(creativeApi.exportProject).mockResolvedValue({
      exportJobId: 'exp-001',
      assetId: 'asset-exp-001',
      format: 'SQUARE_1080',
      encoding: 'PNG',
      width: 1080,
      height: 1080,
      byteSize: 60000,
      sha256: 'e'.repeat(64),
      downloadToken: 'tok-001',
      downloadUrl: '/v1/creative/exports/exp-001/download?token=tok-001',
      expiresAt: '2026-10-30T10:00:00.000Z',
    });

    renderEditor();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Export/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Export/i }));

    await waitFor(() => {
      expect(screen.getByText('Multi-Format Poster Export')).toBeInTheDocument();
      expect(screen.getByText(/Governance Verified/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Execute Export/i }));

    await waitFor(() => {
      expect(creativeApi.exportProject).toHaveBeenCalledWith(
        'scene-001',
        expect.objectContaining({ format: 'SQUARE_1080', encoding: 'PNG' }),
      );
      expect(screen.getByText(/Download Poster Asset/i)).toBeInTheDocument();
    });
  });
});
