import { apiClient } from './api-client.js';
import {
  type AuthResponse,
  type LoginCredentials,
  type LogoutResponse,
} from '../../types/auth.types.js';

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    return apiClient.post<AuthResponse>('/v1/auth/login', credentials);
  },

  getCurrentEmployee: async (): Promise<AuthResponse> => {
    return apiClient.get<AuthResponse>('/v1/auth/me');
  },

  logout: async (): Promise<LogoutResponse> => {
    return apiClient.post<LogoutResponse>('/v1/auth/logout');
  },
};
