/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  type AuthenticateEmployeeUseCase,
  type LogoutUseCase,
  type SanitizedEmployeeDto,
} from '@parisian-shopper/application';
import { type Request, type Response } from 'express';
import { AuthController } from './auth.controller.js';
import { type AuthenticatedRequest } from './guards/session-auth.guard.js';

describe('AuthController', () => {
  const mockUser: SanitizedEmployeeDto = {
    id: 'user-uuid-123',
    displayName: 'Thna Chan',
    roles: ['ADMIN'],
    status: 'ACTIVE',
    permissions: ['VIEW_PRODUCTS', 'VIEW_ALL_CONTENT', 'APPROVE_CONTENT'],
  };

  let mockAuthenticateUseCase: jest.Mocked<AuthenticateEmployeeUseCase>;
  let mockLogoutUseCase: jest.Mocked<LogoutUseCase>;

  const createController = (): AuthController =>
    new AuthController(mockAuthenticateUseCase, mockLogoutUseCase);

  beforeEach(() => {
    mockAuthenticateUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<AuthenticateEmployeeUseCase>;

    mockLogoutUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<LogoutUseCase>;
  });

  describe('login', () => {
    it('authenticates employee, sets cookie, and returns sanitized user', async () => {
      const controller = createController();
      mockAuthenticateUseCase.execute.mockResolvedValueOnce({
        user: mockUser,
        rawSessionToken: 'raw-token-456',
        session: {
          id: 'sess-1',
          userId: mockUser.id,
          sessionTokenHash: 'hash-456',
          ipAddress: null,
          userAgent: null,
          revokedAt: null,
          createdAt: new Date(),
          lastActiveAt: new Date(),
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        },
      });

      const mockReq = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'JestTestRunner' },
      } as unknown as Request;

      const mockRes = {
        cookie: jest.fn(),
      } as unknown as Response;

      const result = await controller.login(
        { loginIdentifier: 'thna', password: 'ValidPassword123!' },
        mockReq,
        mockRes,
      );

      expect(mockAuthenticateUseCase.execute).toHaveBeenCalledWith({
        loginIdentifier: 'thna',
        password: 'ValidPassword123!',
        ipAddress: '127.0.0.1',
        userAgent: 'JestTestRunner',
      });
      expect(mockRes.cookie).toHaveBeenCalled();
      expect(result).toEqual({ user: mockUser });
    });
  });

  describe('me', () => {
    it('returns the authenticated employee profile', () => {
      const controller = createController();
      const result = controller.me(mockUser);
      expect(result).toEqual({ user: mockUser });
    });
  });

  describe('logout', () => {
    it('revokes session token and clears session cookie', async () => {
      const controller = createController();
      mockLogoutUseCase.execute.mockResolvedValueOnce(undefined);

      const mockReq = {
        sessionToken: 'raw-token-to-revoke',
      } as unknown as AuthenticatedRequest;

      const mockRes = {
        clearCookie: jest.fn(),
      } as unknown as Response;

      const result = await controller.logout(mockReq, mockRes);

      expect(mockLogoutUseCase.execute).toHaveBeenCalledWith({
        rawSessionToken: 'raw-token-to-revoke',
      });
      expect(mockRes.clearCookie).toHaveBeenCalled();
      expect(result).toEqual({
        ok: true,
        message: 'Logged out successfully',
      });
    });

    it('clears cookie even if sessionToken is absent on req', async () => {
      const controller = createController();
      const mockReq = {} as unknown as AuthenticatedRequest;
      const mockRes = {
        clearCookie: jest.fn(),
      } as unknown as Response;

      const result = await controller.logout(mockReq, mockRes);

      expect(mockLogoutUseCase.execute).not.toHaveBeenCalled();
      expect(mockRes.clearCookie).toHaveBeenCalled();
      expect(result).toEqual({
        ok: true,
        message: 'Logged out successfully',
      });
    });
  });
});
