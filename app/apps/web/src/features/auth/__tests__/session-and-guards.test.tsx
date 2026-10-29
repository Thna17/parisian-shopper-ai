import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../../../test/test-utils.js';
import { RequireAuth } from '../guards/require-auth.js';
import { RequirePermission } from '../guards/require-permission.js';
import { authApi } from '../../../services/api/auth-api.js';
import { ApiClientError } from '../../../types/api.types.js';
import { useAuth } from '../context/auth-context.js';
import { Permission } from '../../../types/auth.types.js';

vi.mock('../../../services/api/auth-api.js', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentEmployee: vi.fn(),
    logout: vi.fn(),
  },
}));

const TestDashboard: React.FC = () => {
  const { employee, logout } = useAuth();
  return (
    <div>
      <h1>Protected Dashboard</h1>
      <p>Welcome, {employee?.displayName}</p>
      <button onClick={logout}>Sign Out Button</button>
    </div>
  );
};

const TestLogin: React.FC = () => <div>Login Screen</div>;
const TestForbidden: React.FC = () => <div>Access Denied 403</div>;

describe('Session Restoration, Guards & Logout (WEB-AUTH-07 to WEB-AUTH-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('WEB-AUTH-07: restores session from GET /v1/auth/me on mount', async () => {
    vi.mocked(authApi.getCurrentEmployee).mockResolvedValueOnce({
      user: {
        id: 'user-restore-1',
        displayName: 'Restored Employee',
        status: 'ACTIVE',
        roles: ['MARKETING_EDITOR'],
        permissions: ['CREATE_CONTENT'],
      },
    });

    renderWithProviders(
      <RequireAuth>
        <TestDashboard />
      </RequireAuth>,
    );

    // Initial loading state
    expect(screen.getByLabelText(/Restoring session/i)).toBeInTheDocument();

    // Resolves and renders protected content
    await waitFor(() => {
      expect(screen.getByText('Protected Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Welcome, Restored Employee')).toBeInTheDocument();
    });
  });

  it('WEB-AUTH-08 & WEB-AUTH-09: redirects to /login when session is absent or expired', async () => {
    vi.mocked(authApi.getCurrentEmployee).mockRejectedValueOnce(
      new ApiClientError('Unauthorized', 401, 'UNAUTHORIZED_SESSION'),
    );

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<TestLogin />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <TestDashboard />
            </RequireAuth>
          }
        />
      </Routes>,
      { initialEntries: ['/'] },
    );

    await waitFor(() => {
      expect(screen.getByText('Login Screen')).toBeInTheDocument();
      expect(screen.queryByText('Protected Dashboard')).not.toBeInTheDocument();
    });
  });

  it('WEB-AUTH-10: blocks access to permission-guarded routes when permission is missing', async () => {
    vi.mocked(authApi.getCurrentEmployee).mockResolvedValueOnce({
      user: {
        id: 'user-viewer',
        displayName: 'Viewer Employee',
        status: 'ACTIVE',
        roles: ['VIEWER'],
        permissions: ['VIEW_PRODUCTS'],
      },
    });

    renderWithProviders(
      <Routes>
        <Route path="/403" element={<TestForbidden />} />
        <Route
          path="/admin-only"
          element={
            <RequireAuth>
              <RequirePermission permission={Permission.APPROVE_CONTENT}>
                <div>Approval Zone</div>
              </RequirePermission>
            </RequireAuth>
          }
        />
      </Routes>,
      { initialEntries: ['/admin-only'] },
    );

    await waitFor(() => {
      expect(screen.getByText('Access Denied 403')).toBeInTheDocument();
      expect(screen.queryByText('Approval Zone')).not.toBeInTheDocument();
    });
  });

  it('WEB-AUTH-11 & WEB-AUTH-12: invokes logout API and wipes query cache', async () => {
    const user = userEvent.setup();

    vi.mocked(authApi.getCurrentEmployee).mockResolvedValueOnce({
      user: {
        id: 'user-logout',
        displayName: 'Logging Out Employee',
        status: 'ACTIVE',
        roles: ['ADMIN'],
        permissions: ['APPROVE_CONTENT'],
      },
    });

    vi.mocked(authApi.logout).mockResolvedValueOnce({
      ok: true,
      message: 'Logged out successfully',
    });

    const { queryClient } = renderWithProviders(
      <RequireAuth>
        <TestDashboard />
      </RequireAuth>,
    );

    await waitFor(() => {
      expect(screen.getByText('Welcome, Logging Out Employee')).toBeInTheDocument();
    });

    // Populate a sensitive cache key to test cleanup
    queryClient.setQueryData(['sensitive-campaign-data'], { secret: 'secret-token' });
    expect(queryClient.getQueryData(['sensitive-campaign-data'])).toBeDefined();

    // Trigger logout
    const logoutBtn = screen.getByRole('button', { name: /Sign Out Button/i });
    await user.click(logoutBtn);

    await waitFor(() => {
      expect(authApi.logout).toHaveBeenCalledTimes(1);
      // Query cache wiped
      expect(queryClient.getQueryData(['sensitive-campaign-data'])).toBeUndefined();
    });
  });
});
