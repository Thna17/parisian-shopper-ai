import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import { AppLogo } from '../../../components/ui/app-logo.js';

export const ForbiddenPage: React.FC = () => {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-app-bg text-center">
      <AppLogo size="md" className="mb-8" />

      <div className="w-16 h-16 rounded-full bg-status-bad/10 text-status-bad flex items-center justify-center mb-4 border border-status-bad/20 shadow-subtle">
        <ShieldAlert className="w-8 h-8" />
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-app-primary mb-2">
        Access Restricted (403)
      </h1>
      <p className="text-xs text-app-muted max-w-md mb-8 leading-relaxed">
        Your employee account lacks the required RBAC permissions to access this view. If you
        believe this is in error, please contact your administrative supervisor.
      </p>

      <div className="flex items-center gap-3">
        <Link to="/">
          <Button variant="secondary" icon={<ArrowLeft className="w-4 h-4" />}>
            Back to Overview
          </Button>
        </Link>
      </div>
    </div>
  );
};
