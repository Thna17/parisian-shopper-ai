import React, { createContext, useContext, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../../../services/api/auth-api.js';
import { ApiClientError } from '../../../types/api.types.js';
import { type AuthenticatedEmployee, type LoginCredentials } from '../../../types/auth.types.js';

interface AuthContextValue {
  employee: AuthenticatedEmployee | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoggingIn: boolean;
  isLoggingOut: boolean;
  loginError: ApiClientError | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refetchEmployee: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AUTH_QUERY_KEY = ['auth', 'current-employee'] as const;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();

  // Session restoration query: executes on app mount and page refresh
  const { data, isLoading, refetch } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      try {
        const response = await authApi.getCurrentEmployee();
        return response.user;
      } catch (err) {
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          // Unauthenticated or revoked session
          return null;
        }
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const employee = data ?? null;
  const isAuthenticated = Boolean(employee && employee.status === 'ACTIVE');

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginCredentials) => {
      const response = await authApi.login(credentials);
      return response.user;
    },
    onSuccess: (newUser) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, newUser);
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        await authApi.logout();
      } catch (err) {
        // Even if network or server error occurs, we wipe local authenticated cache
        if (!(err instanceof ApiClientError && err.status === 401)) {
          // Log or handle unexpected error
        }
      }
    },
    onSettled: () => {
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      queryClient.clear(); // Wipes all sensitive query cache from memory
    },
  });

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      await loginMutation.mutateAsync(credentials);
    },
    [loginMutation],
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const refetchEmployee = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const loginError = (loginMutation.error as ApiClientError) ?? null;

  return (
    <AuthContext.Provider
      value={{
        employee,
        isAuthenticated,
        isLoading,
        isLoggingIn: loginMutation.isPending,
        isLoggingOut: logoutMutation.isPending,
        loginError,
        login,
        logout,
        refetchEmployee,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
