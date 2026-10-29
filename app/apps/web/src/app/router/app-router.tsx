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
