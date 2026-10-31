import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from '../layouts/app-shell.js';
import { RequireAuth } from '../../features/auth/guards/require-auth.js';
import { RequirePermission } from '../../features/auth/guards/require-permission.js';
import { LoginPage } from '../../features/auth/pages/login-page.js';
import { ForbiddenPage } from '../../features/auth/pages/forbidden-page.js';
import { NotFoundPage } from '../../features/auth/pages/not-found-page.js';
import { OverviewPage } from '../../features/overview/pages/overview-page.js';
import { ProductCatalogPage } from '../../features/products/pages/ProductCatalogPage.js';
import { ProductDetailPage } from '../../features/products/pages/ProductDetailPage.js';
import { CampaignListPage } from '../../features/campaigns/pages/CampaignListPage.js';
import { CampaignDetailPage } from '../../features/campaigns/pages/CampaignDetailPage.js';
import { CampaignCreationWizard } from '../../features/campaigns/pages/CampaignCreationWizard.js';
import { ContentJobsPage } from '../../features/content/pages/ContentJobsPage.js';
import { ContentCreationWizard } from '../../features/content/pages/ContentCreationWizard.js';
import { ContentJobDetailPage } from '../../features/content/pages/ContentJobDetailPage.js';
import { ReviewQueuePage } from '../../features/approvals/pages/ReviewQueuePage.js';
import { ApprovalHistoryPage } from '../../features/approvals/pages/ApprovalHistoryPage.js';
import { ReviewDetailPage } from '../../features/approvals/pages/ReviewDetailPage.js';
import { CreativeProjectsPage } from '../../features/creative/pages/CreativeProjectsPage.js';
import { CreativeWizardPage } from '../../features/creative/pages/CreativeWizardPage.js';
import { CreativeEditorPage } from '../../features/creative/pages/CreativeEditorPage.js';
import { PublishingDashboardPage } from '../../features/publishing/pages/PublishingDashboardPage.js';
import { PublishingWizardPage } from '../../features/publishing/pages/PublishingWizardPage.js';
import { PublicationDetailPage } from '../../features/publishing/pages/PublicationDetailPage.js';
import { PublicationHistoryPage } from '../../features/publishing/pages/PublicationHistoryPage.js';
import { AnalyticsOverviewPage } from '../../features/analytics/pages/AnalyticsOverviewPage.js';
import { CostControlPage } from '../../features/analytics/pages/CostControlPage.js';
import { ContentAnalyticsPage } from '../../features/analytics/pages/ContentAnalyticsPage.js';
import { CampaignAnalyticsPage } from '../../features/analytics/pages/CampaignAnalyticsPage.js';
import { CreativeAnalyticsPage } from '../../features/analytics/pages/CreativeAnalyticsPage.js';
import { PublishingAnalyticsPage } from '../../features/analytics/pages/PublishingAnalyticsPage.js';
import { Permission } from '../../types/auth.types.js';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/403',
    element: <ForbiddenPage />,
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      {
        index: true,
        element: <OverviewPage />,
      },
      {
        path: 'products',
        element: (
          <RequirePermission permission={Permission.VIEW_PRODUCTS}>
            <ProductCatalogPage />
          </RequirePermission>
        ),
      },
      {
        path: 'products/:id',
        element: (
          <RequirePermission permission={Permission.VIEW_PRODUCTS}>
            <ProductDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'campaigns',
        element: (
          <RequirePermission permission={Permission.VIEW_OWN_CONTENT}>
            <CampaignListPage />
          </RequirePermission>
        ),
      },
      {
        path: 'campaigns/new',
        element: (
          <RequirePermission permission={Permission.CREATE_CONTENT}>
            <CampaignCreationWizard />
          </RequirePermission>
        ),
      },
      {
        path: 'campaigns/:id',
        element: (
          <RequirePermission permission={Permission.VIEW_OWN_CONTENT}>
            <CampaignDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'content',
        element: (
          <RequirePermission permission={Permission.VIEW_OWN_CONTENT}>
            <ContentJobsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'content/new',
        element: (
          <RequirePermission permission={Permission.CREATE_CONTENT}>
            <ContentCreationWizard />
          </RequirePermission>
        ),
      },
      {
        path: 'content/jobs/:id',
        element: (
          <RequirePermission permission={Permission.VIEW_OWN_CONTENT}>
            <ContentJobDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'creative',
        element: (
          <RequirePermission permission={Permission.VIEW_OWN_CONTENT}>
            <CreativeProjectsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'creative/new',
        element: (
          <RequirePermission permission={Permission.EDIT_CREATIVE}>
            <CreativeWizardPage />
          </RequirePermission>
        ),
      },
      {
        path: 'creative/projects/:id',
        element: (
          <RequirePermission permission={Permission.VIEW_OWN_CONTENT}>
            <CreativeEditorPage />
          </RequirePermission>
        ),
      },
      {
        path: 'approvals',
        element: (
          <RequirePermission permission={Permission.VIEW_OWN_CONTENT}>
            <ReviewQueuePage />
          </RequirePermission>
        ),
      },
      {
        path: 'approvals/pending',
        element: (
          <RequirePermission permission={Permission.VIEW_OWN_CONTENT}>
            <ReviewQueuePage />
          </RequirePermission>
        ),
      },
      {
        path: 'approvals/history',
        element: (
          <RequirePermission permission={Permission.VIEW_OWN_CONTENT}>
            <ApprovalHistoryPage />
          </RequirePermission>
        ),
      },
      {
        path: 'approvals/:id',
        element: (
          <RequirePermission permission={Permission.VIEW_OWN_CONTENT}>
            <ReviewDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'reviews',
        element: (
          <RequirePermission permission={Permission.VIEW_OWN_CONTENT}>
            <ReviewQueuePage />
          </RequirePermission>
        ),
      },
      {
        path: 'publishing',
        element: (
          <RequirePermission permission={Permission.VIEW_OWN_CONTENT}>
            <PublishingDashboardPage />
          </RequirePermission>
        ),
      },
      {
        path: 'publishing/new',
        element: (
          <RequirePermission permission={Permission.PUBLISH_CREATIVE}>
            <PublishingWizardPage />
          </RequirePermission>
        ),
      },
      {
        path: 'publishing/history',
        element: (
          <RequirePermission permission={Permission.VIEW_OWN_CONTENT}>
            <PublicationHistoryPage />
          </RequirePermission>
        ),
      },
      {
        path: 'publishing/:id',
        element: (
          <RequirePermission permission={Permission.VIEW_OWN_CONTENT}>
            <PublicationDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'analytics',
        element: (
          <RequirePermission permission={Permission.VIEW_OPERATIONAL_ANALYTICS}>
            <AnalyticsOverviewPage />
          </RequirePermission>
        ),
      },
      {
        path: 'analytics/costs',
        element: (
          <RequirePermission permission={Permission.VIEW_AI_COSTS}>
            <CostControlPage />
          </RequirePermission>
        ),
      },
      {
        path: 'analytics/content',
        element: (
          <RequirePermission permission={Permission.VIEW_OPERATIONAL_ANALYTICS}>
            <ContentAnalyticsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'analytics/campaigns',
        element: (
          <RequirePermission permission={Permission.VIEW_OPERATIONAL_ANALYTICS}>
            <CampaignAnalyticsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'analytics/creative',
        element: (
          <RequirePermission permission={Permission.VIEW_OPERATIONAL_ANALYTICS}>
            <CreativeAnalyticsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'analytics/publishing',
        element: (
          <RequirePermission permission={Permission.VIEW_OPERATIONAL_ANALYTICS}>
            <PublishingAnalyticsPage />
          </RequirePermission>
        ),
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);

export const AppRouter: React.FC = () => {
  return <RouterProvider router={router} />;
};
