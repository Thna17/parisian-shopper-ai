import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, User } from 'lucide-react';
import { useAuth } from '../context/auth-context.js';
import { Button } from '../../../components/ui/button.js';
import { Input } from '../../../components/ui/input.js';
import { PasswordInput } from '../../../components/ui/password-input.js';
import { Alert } from '../../../components/ui/alert.js';
import { AppLogo } from '../../../components/ui/app-logo.js';
import { ApiClientError } from '../../../types/api.types.js';

export const LoginCard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoggingIn } = useAuth();

  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Return to intended location after login
  const returnTo = (location.state as { from?: string })?.from ?? '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    setServerError(null);

    const trimmedIdentifier = loginIdentifier.trim();
    if (!trimmedIdentifier) {
      setClientError('Please enter your employee username or ID.');
      return;
    }

    if (!password) {
      setClientError('Please enter your password.');
      return;
    }

    try {
      await login({
        loginIdentifier: trimmedIdentifier,
        password,
      });
      navigate(returnTo, { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 401) {
          setServerError('Invalid login credentials. Please verify your identifier and password.');
        } else if (err.status === 429) {
          setServerError(
            'Account temporarily locked due to multiple failed attempts. Please try again in 15 minutes.',
          );
        } else if (err.status === 403) {
          setServerError(
            'Your account has been deactivated. Please contact your system administrator.',
          );
        } else {
          setServerError(err.message || 'Authentication failed. Please check your credentials.');
        }
      } else {
        setServerError(
          'Unable to reach the authentication service. Please check your network connection.',
        );
      }
    }
  };

  return (
    <div className="w-full max-w-[420px] bg-app-surface border border-app-border rounded-2xl shadow-elevated p-8 sm:p-10 transition-all">
      <div className="flex flex-col items-center text-center mb-8">
        <AppLogo size="lg" className="mb-4" />
        <h2 className="text-xl font-bold tracking-tight text-app-primary">
          Employee Portal Sign In
        </h2>
        <p className="text-xs text-app-muted mt-1.5 max-w-[280px] leading-relaxed">
          Authorized Parisian Shopper retail and marketing staff access only.
        </p>
      </div>

      {(clientError || serverError) && (
        <Alert type="bad" className="mb-6">
          {clientError ?? serverError}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Employee Username or ID"
          placeholder="Display Name, UUID, or @telegram"
          value={loginIdentifier}
          onChange={(e) => {
            setLoginIdentifier(e.target.value);
            if (clientError) setClientError(null);
          }}
          prefixIcon={<User className="w-4 h-4" />}
          autoComplete="username"
          required
          autoFocus
        />

        <PasswordInput
          label="Password"
          placeholder="Enter your credential password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (clientError) setClientError(null);
          }}
          prefixIcon={<Lock className="w-4 h-4" />}
          autoComplete="current-password"
          required
        />

        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoggingIn}
            className="w-full"
          >
            Sign In to Workspace
          </Button>
        </div>
      </form>

      <div className="mt-8 pt-6 border-t border-app-border/70 text-center">
        <p className="text-[11px] text-app-muted leading-relaxed">
          Parisian Shopper AI enforces authoritative Four-Eyes approvals and security auditing. All
          authentication events are attitudinally logged.
        </p>
      </div>
    </div>
  );
};
