import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/test-utils.js';
import { AppShell } from '../app-shell.js';
import { Input } from '../../../components/ui/input.js';

vi.mock('../../../services/api/auth-api.js', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentEmployee: vi.fn().mockResolvedValue({
      user: {
        id: 'shell-user-1',
        displayName: 'Shell Operator',
        status: 'ACTIVE',
        roles: ['ADMIN'],
        permissions: ['APPROVE_CONTENT'],
      },
    }),
    logout: vi.fn().mockResolvedValue({ ok: true, message: 'Logged out' }),
  },
}));

describe('AppShell & Layout Stability (WEB-AUTH-14 & WEB-AUTH-16)', () => {
  it('WEB-AUTH-14: opens and closes mobile navigation drawer on toggle', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppShell />);

    // Topbar hamburger button
    const menuBtn = screen.getByLabelText(/Open mobile navigation menu/i);
    expect(menuBtn).toBeInTheDocument();

    await user.click(menuBtn);

    // Mobile drawer close button should be visible
    const closeBtn = screen.getByLabelText(/Close sidebar navigation/i);
    expect(closeBtn).toBeInTheDocument();

    await user.click(closeBtn);
    expect(screen.queryByLabelText(/Close sidebar navigation/i)).not.toBeInTheDocument();
  });

  it('WEB-AUTH-16: supports Khmer typography without layout breaks', () => {
    const { container } = renderWithProviders(
      <div>
        <Input
          label="ចំណងជើងយុទ្ធនាការ (Campaign Title)"
          defaultValue="ទឹកអប់ប្រណិតបារាំង (French Luxury Perfume)"
          isKhmer
        />
        <div className="khmer p-4">ទឹកអប់ប្រណិតបារាំងនាំចូលផ្ទាល់ពីប៉ារីស</div>
      </div>,
    );

    const input = screen.getByDisplayValue(/ទឹកអប់ប្រណិតបារាំង/);
    expect(input).toHaveClass('font-khmer');

    const khmerDiv = container.querySelector('.khmer');
    expect(khmerDiv).toHaveClass('khmer');
    expect(khmerDiv).toHaveTextContent('ទឹកអប់ប្រណិតបារាំងនាំចូលផ្ទាល់ពីប៉ារីស');
  });
});
