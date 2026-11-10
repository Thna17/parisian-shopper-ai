import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, Link } from 'react-router-dom';
import { UnsavedPostGuard } from '../UnsavedPostGuard.js';
function Draft() {
  const [dirty, setDirty] = useState(false);
  return (
    <>
      <UnsavedPostGuard active={dirty} />
      <label>
        Brief
        <input aria-label="Brief" onChange={() => setDirty(true)} />
      </label>
      <Link to="/posts">My posts</Link>
    </>
  );
}
describe('unsaved Post navigation', () => {
  it('protects internal navigation and browser unload, and allows explicit discard', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const router = createMemoryRouter(
      [
        { path: '/draft', element: <Draft /> },
        { path: '/posts', element: <h1>My posts</h1> },
      ],
      { initialEntries: ['/draft'] },
    );
    render(<RouterProvider router={router} />);
    fireEvent.change(screen.getByLabelText('Brief'), { target: { value: 'Unsaved brief' } });
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('link', { name: 'My posts' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(router.state.location.pathname).toBe('/draft');
    expect(screen.getByLabelText('Brief')).toHaveValue('Unsaved brief');
    const signout = new Event('parisian:before-signout', { cancelable: true });
    window.dispatchEvent(signout);
    expect(signout.defaultPrevented).toBe(true);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('link', { name: 'My posts' }));
    expect(await screen.findByRole('heading', { name: 'My posts' })).toBeInTheDocument();
    confirm.mockRestore();
  });
});
