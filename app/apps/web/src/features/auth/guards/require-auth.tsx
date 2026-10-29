import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth-context.js';
import { Spinner } from '../../../components/ui/spinner.js';
import { AppLogo } from '../../../components/ui/app-logo.js';

export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <RouteLoadingState />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
};

export const RouteLoadingState: React.FC = () => {
  return (
    <div
      role="status"
      aria-label="Restoring session"
      className="min-h-screen w-full flex flex-col items-center justify-center bg-app-bg p-6"
    >
      <AppLogo size="lg" className="mb-6 animate-pulse" />
      <div className="flex items-center gap-2.5 text-xs text-app-muted font-medium">
        <Spinner size="sm" className="text-gold-500" />
        <span>Restoring authenticated session...</span>
      </div>
    </div>
  );
};
