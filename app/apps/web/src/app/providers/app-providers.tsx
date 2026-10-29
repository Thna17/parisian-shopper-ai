import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../services/api/query-client.js';
import { AuthProvider } from '../../features/auth/context/auth-context.js';
import { ToastProvider } from '../../components/feedback/toast.js';

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};
