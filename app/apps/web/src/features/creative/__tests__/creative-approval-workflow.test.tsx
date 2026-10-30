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
    approveProject: vi.fn(),
    rejectProject: vi.fn(),
    submitProject: vi.fn(),
  },
}));

vi.mock('../../../services/api/auth-api.js', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentEmployee: vi.fn().mockResolvedValue({
      user: {
        id: 'usr-approver-999',
        displayName: 'Independent Approver',
        roles: ['MARKETING_APPROVER'],
        permissions: [
          'VIEW_OWN_CONTENT',
          'VIEW_ALL_CONTENT',
          'APPROVE_CREATIVE',
          'EXPORT_CREATIVE',
        ],
      },
    }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Creative Approval Workflow & Security Governance (WEB-CREATIVE-SEC-01 to 15)', () => {
  const sampleSceneVersionV1: CreativeSceneVersionRecord = {
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
    requestedByUserId: 'usr-creator-111',
    metadata: null,
    createdAt: '2026-10-29T10:00:00.000Z',
    layers: [],
    state: {
      id: 'state-001',
      sceneVersionId: 'ver-001',
      status: 'READY_FOR_REVIEW',
      isExportEligible: false,
      updatedAt: '2026-10-29T10:00:00.000Z',
    },
  };

  const sampleProjectDetailReady: CreativeProjectDetail = {
    project: {
      id: 'scene-001',
      creativeJobId: 'job-001',
      campaignId: 'camp-001',
      title: 'Saint-Germain Autumn Poster',
      currentVersionNumber: 1,
      createdAt: '2026-10-29T10:00:00.000Z',
      updatedAt: '2026-10-29T10:00:00.000Z',
    },
    currentVersion: sampleSceneVersionV1,
    productSnapshot: {
      id: 'snap-001',
      sku: 'MM-REPLICA-JC-100',
      productName: 'Replica Jazz Club Fragrance',
      brand: 'Maison Margiela',
      price: 135.0,
      currency: 'EUR',
    },
    campaign: {
      id: 'camp-001',
      name: 'Autumn Paris Elegance 2026',
      code: 'PARIS-FALL-26',
    },
    availableHeroAssets: [],
    creativeJob: {
      id: 'job-001',
      status: 'READY_FOR_REVIEW',
      requestedByUserId: 'usr-creator-111',
    },
    canEdit: true,
    canApprove: true,
    canExport: false,
    approvalIneligibilityReasons: [],
  };

  const sampleValidationResult: ValidationAssessmentResult = {
    isPassed: true,
    aestheticScore: 9.5,
    findings: [],
    blockingCount: 0,
    warningCount: 0,
    infoCount: 0,
    scoreBreakdown: {
      typographyLegibility: 9.5,
      spatialBalance: 9.0,
      focalProminence: 9.4,
      brandDignity: 9.0,
      colorHarmony: 9.1,
    },
  };

  const samplePreviewResult: RenderPreviewResult = {
    visualAssetId: 'asset-preview-001',
    previewUrl: 'https://cdn.example.com/renders/preview-001.png',
    width: 1080,
    height: 1080,
    byteSize: 154200,
    sha256: '9'.repeat(64),
    validation: sampleValidationResult,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(creativeApi.getProjectById).mockResolvedValue(sampleProjectDetailReady);
    vi.mocked(creativeApi.getProjectVersions).mockResolvedValue([sampleSceneVersionV1]);
    vi.mocked(creativeApi.validateProject).mockResolvedValue(sampleValidationResult);
    vi.mocked(creativeApi.renderPreview).mockResolvedValue(samplePreviewResult);
  });

  const renderComponent = () =>
    renderWithProviders(
      <Routes>
        <Route path="/creative/projects/:id" element={<CreativeEditorPage />} />
      </Routes>,
      { initialEntries: ['/creative/projects/scene-001'] },
    );

  it('WEB-CREATIVE-SEC-01: Displays exact creative version number and state badge', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('exact-version-badge')).toBeInTheDocument();
    });

    expect(screen.getByTestId('exact-version-badge')).toHaveTextContent('v1');
    expect(screen.getByTestId('status-review-badge')).toBeInTheDocument();
  });

  it('WEB-CREATIVE-SEC-02: Displays disabled self-approval button when user is creator or reviser', async () => {
    vi.mocked(creativeApi.getProjectById).mockResolvedValueOnce({
      ...sampleProjectDetailReady,
      canApprove: false,
      approvalIneligibilityReasons: [
        'Four-eyes policy: You requested this creative job and cannot approve your own work.',
      ],
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('self-approval-disabled-button')).toBeInTheDocument();
    });

    const disabledBtn = screen.getByTestId('self-approval-disabled-button');
    expect(disabledBtn).toBeDisabled();
    expect(screen.queryByTestId('approve-scene-button')).not.toBeInTheDocument();
  });

  it('WEB-CREATIVE-SEC-03: Displays enabled approve button for eligible independent reviewer', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('approve-scene-button')).toBeInTheDocument();
    });

    const approveBtn = screen.getByTestId('approve-scene-button');
    expect(approveBtn).not.toBeDisabled();
  });

  it('WEB-CREATIVE-SEC-04: Independent reviewer approves scene and triggers success feedback', async () => {
    const user = userEvent.setup();
    vi.mocked(creativeApi.approveProject).mockResolvedValueOnce({
      approvalEventId: 'app-evt-001',
      approverUserId: 'usr-approver-999',
      decision: 'CREATIVE_APPROVED',
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('approve-scene-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('approve-scene-button'));

    await waitFor(() => {
      expect(creativeApi.approveProject).toHaveBeenCalledWith('scene-001', {
        versionNumber: 1,
        sceneVersionId: 'ver-001',
      });
      expect(screen.getByTestId('approval-feedback-success')).toBeInTheDocument();
    });
  });

  it('WEB-CREATIVE-SEC-05: Rejection modal opens on click of reject button', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('reject-scene-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('reject-scene-button'));

    expect(screen.getByTestId('reject-reason-textarea')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-reject-button')).toBeInTheDocument();
  });

  it('WEB-CREATIVE-SEC-06: Submitting rejection without reason displays validation error', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('reject-scene-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('reject-scene-button'));
    await user.click(screen.getByTestId('confirm-reject-button'));

    expect(screen.getByTestId('reject-error-message')).toHaveTextContent(
      'Rejection reason is required',
    );
    expect(creativeApi.rejectProject).not.toHaveBeenCalled();
  });

  it('WEB-CREATIVE-SEC-07: Submitting valid rejection calls rejectProject and shows feedback', async () => {
    const user = userEvent.setup();
    vi.mocked(creativeApi.rejectProject).mockResolvedValueOnce({
      approvalEventId: 'rej-evt-001',
      approverUserId: 'usr-approver-999',
      decision: 'CREATIVE_REJECTED',
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('reject-scene-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('reject-scene-button'));
    await user.type(
      screen.getByTestId('reject-reason-textarea'),
      'Gold leaf divider lacks sufficient contrast with the dark walnut background',
    );
    await user.click(screen.getByTestId('confirm-reject-button'));

    await waitFor(() => {
      expect(creativeApi.rejectProject).toHaveBeenCalledWith('scene-001', {
        versionNumber: 1,
        sceneVersionId: 'ver-001',
        reason: 'Gold leaf divider lacks sufficient contrast with the dark walnut background',
      });
      expect(screen.getByTestId('approval-feedback-success')).toBeInTheDocument();
    });
  });

  it('WEB-CREATIVE-SEC-08: Renders visual validation findings in review inspector', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Validate Gates/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Validate Gates/i }));

    await waitFor(() => {
      expect(screen.getByText('Visual & Commercial Gates Passed')).toBeInTheDocument();
    });
  });

  it('WEB-CREATIVE-SEC-09: Renders product context and SKU in header', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('MM-REPLICA-JC-100')).toBeInTheDocument();
    });

    expect(screen.getByText(/Maison Margiela/)).toBeInTheDocument();
    expect(screen.getByText(/Replica Jazz Club Fragrance/)).toBeInTheDocument();
  });

  it('WEB-CREATIVE-SEC-10: Renders version history entries with version attribution', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /History/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /History/i }));

    expect(screen.getByTestId('version-item-1')).toBeInTheDocument();
  });

  it('WEB-CREATIVE-SEC-11: Shows superseded warning banner when viewing older version', async () => {
    vi.mocked(creativeApi.getProjectById).mockResolvedValueOnce({
      ...sampleProjectDetailReady,
      project: {
        ...sampleProjectDetailReady.project,
        currentVersionNumber: 2, // Latest is 2, viewing 1
      },
      currentVersion: sampleSceneVersionV1,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('superseded-warning')).toBeInTheDocument();
    });

    expect(screen.getByTestId('superseded-warning')).toHaveTextContent(
      /superseded by active revision v2/i,
    );
  });

  it('WEB-CREATIVE-SEC-12: Hides approval actions when viewing superseded version', async () => {
    vi.mocked(creativeApi.getProjectById).mockResolvedValueOnce({
      ...sampleProjectDetailReady,
      project: {
        ...sampleProjectDetailReady.project,
        currentVersionNumber: 2,
      },
      currentVersion: sampleSceneVersionV1,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('superseded-warning')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('approve-scene-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reject-scene-button')).not.toBeInTheDocument();
  });

  it('WEB-CREATIVE-SEC-13: Handles server approval conflict error and displays error banner', async () => {
    const user = userEvent.setup();
    vi.mocked(creativeApi.approveProject).mockRejectedValueOnce(
      new Error('Conflict: Exact scene version has already been approved.'),
    );

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('approve-scene-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('approve-scene-button'));

    await waitFor(() => {
      expect(screen.getByTestId('approval-feedback-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('approval-feedback-error')).toHaveTextContent(
      'Conflict: Exact scene version has already been approved.',
    );
  });

  it('WEB-CREATIVE-SEC-14: Enables export button when scene is approved', async () => {
    vi.mocked(creativeApi.getProjectById).mockResolvedValueOnce({
      ...sampleProjectDetailReady,
      canExport: true,
      currentVersion: {
        ...sampleSceneVersionV1,
        state: {
          id: 'state-001',
          sceneVersionId: 'ver-001',
          status: 'APPROVED',
          isExportEligible: true,
          updatedAt: '2026-10-29T10:15:00.000Z',
        },
      },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('export-dialog-button')).toBeInTheDocument();
    });

    expect(screen.getByTestId('export-dialog-button')).not.toBeDisabled();
  });

  it('WEB-CREATIVE-SEC-15: Displays submit-review button when status is draft or rejected', async () => {
    vi.mocked(creativeApi.getProjectById).mockResolvedValueOnce({
      ...sampleProjectDetailReady,
      canApprove: false,
      creativeJob: {
        ...sampleProjectDetailReady.creativeJob!,
        status: 'FAILED',
      },
      currentVersion: {
        ...sampleSceneVersionV1,
        state: {
          id: 'state-001',
          sceneVersionId: 'ver-001',
          status: 'DRAFT',
          isExportEligible: false,
          updatedAt: '2026-10-29T10:00:00.000Z',
        },
      },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('submit-review-button')).toBeInTheDocument();
    });
  });
});
