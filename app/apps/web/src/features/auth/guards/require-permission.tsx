import React from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../hooks/use-permissions.js';
import { type Permission } from '../../../types/auth.types.js';

export interface RequirePermissionProps {
  readonly permission: Permission;
  readonly fallback?: React.ReactNode;
  readonly children: React.ReactNode;
}

export const RequirePermission: React.FC<RequirePermissionProps> = ({
  permission,
  fallback,
  children,
}) => {
  const { hasPermission } = usePermissions();

  if (!hasPermission(permission)) {
    if (fallback !== undefined) {
      return <>{fallback}</>;
    }
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
};
