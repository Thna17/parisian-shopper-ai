import React, { type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../features/auth/context/auth-context.js';
import { ToastProvider } from '../components/feedback/toast.js';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface WrapperProps {
  readonly children: React.ReactNode;
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & {
    readonly initialEntries?: string[];
    readonly queryClient?: QueryClient;
  },
) {
  const testClient = options?.queryClient ?? createTestQueryClient();
  const initialEntries = options?.initialEntries ?? ['/'];

  function Wrapper({ children }: WrapperProps) {
    return (
      <QueryClientProvider client={testClient}>
        <AuthProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient: testClient,
  };
}
