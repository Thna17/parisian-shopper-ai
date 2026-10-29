import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/test-utils.js';
import { LoginCard } from '../components/login-card.js';
import { authApi } from '../../../services/api/auth-api.js';
import { ApiClientError } from '../../../types/api.types.js';

vi.mock('../../../services/api/auth-api.js', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentEmployee: vi.fn().mockResolvedValue({ user: null }),
    logout: vi.fn().mockResolvedValue({ ok: true, message: 'Logged out' }),
  },
}));

describe('Login Flow (WEB-AUTH-01 to WEB-AUTH-06, WEB-AUTH-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('WEB-AUTH-01: renders login form with brand logo, identifier, password, and submit button', () => {
    renderWithProviders(<LoginCard />);

    expect(screen.getByText('Parisian Shopper AI')).toBeInTheDocument();
    expect(screen.getByText('Employee Portal Sign In')).toBeInTheDocument();
    expect(screen.getByLabelText(/Employee Username or ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In to Workspace/i })).toBeInTheDocument();
  });

  it('WEB-AUTH-02: performs client-side input validation on empty submission', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginCard />);

    const submitBtn = screen.getByRole('button', { name: /Sign In to Workspace/i });
    await user.click(submitBtn);

    expect(screen.getByText(/Please enter your employee username or ID/i)).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();

    // Fill identifier, submit with empty password
    const idInput = screen.getByLabelText(/Employee Username or ID/i);
    await user.type(idInput, 'Thna Chan');
    await user.click(submitBtn);

    expect(screen.getByText(/Please enter your password/i)).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('WEB-AUTH-03: toggles password field visibility securely', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginCard />);

    const passwordInput = screen.getByLabelText(/^Password/i) as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    const toggleBtn = screen.getByLabelText(/Show password/i);
    await user.click(toggleBtn);

    expect(passwordInput.type).toBe('text');
    expect(screen.getByLabelText(/Hide password/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/Hide password/i));
    expect(passwordInput.type).toBe('password');
  });

  it('WEB-AUTH-04 & WEB-AUTH-06: displays loading spinner and executes login', async () => {
    const user = userEvent.setup();
    let resolveLogin: (val: unknown) => void;
    const loginPromise = new Promise((res) => {
      resolveLogin = res;
    });

    vi.mocked(authApi.login).mockReturnValueOnce(loginPromise as any);

    renderWithProviders(<LoginCard />);

    await user.type(screen.getByLabelText(/Employee Username or ID/i), 'admin_paris');
    await user.type(screen.getByLabelText(/^Password/i), 'ValidPassword123!');

    const submitBtn = screen.getByRole('button', { name: /Sign In to Workspace/i });
    await user.click(submitBtn);

    // Verify loading state
    expect(submitBtn).toBeDisabled();
    expect(submitBtn).toHaveAttribute('aria-busy', 'true');

    // Complete login response
    resolveLogin!({
      user: {
        id: 'user-1',
        displayName: 'Admin User',
        status: 'ACTIVE',
        roles: ['ADMIN'],
        permissions: ['APPROVE_CONTENT'],
      },
    });

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith({
        loginIdentifier: 'admin_paris',
        password: 'ValidPassword123!',
      });
    });
  });

  it('WEB-AUTH-05: displays generic error feedback on 401 invalid credentials', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockRejectedValueOnce(
      new ApiClientError('Invalid credentials provided', 401, 'INVALID_CREDENTIALS'),
    );

    renderWithProviders(<LoginCard />);

    await user.type(screen.getByLabelText(/Employee Username or ID/i), 'wrong_user');
    await user.type(screen.getByLabelText(/^Password/i), 'wrong_pass');

    await user.click(screen.getByRole('button', { name: /Sign In to Workspace/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Invalid login credentials. Please verify your identifier and password./i),
      ).toBeInTheDocument();
    });
  });

  it('WEB-AUTH-15: supports keyboard Enter submission and accessibility focus', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockResolvedValueOnce({
      user: {
        id: 'user-1',
        displayName: 'Keyboard User',
        status: 'ACTIVE',
        roles: ['VIEWER'],
        permissions: [],
      },
    });

    renderWithProviders(<LoginCard />);

    const idInput = screen.getByLabelText(/Employee Username or ID/i);
    const passwordInput = screen.getByLabelText(/^Password/i);

    await user.type(idInput, 'keyboard_user');
    await user.type(passwordInput, 'SomePassword123!{Enter}');

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith({
        loginIdentifier: 'keyboard_user',
        password: 'SomePassword123!',
      });
    });
  });
});
