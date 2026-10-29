import { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../../types/api.types.js';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      retry: (failureCount: number, error: unknown): boolean => {
        if (error instanceof ApiClientError) {
          // Do not retry client auth/forbidden errors
          if ([401, 403, 404, 422, 429].includes(error.status)) {
            return false;
          }
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
