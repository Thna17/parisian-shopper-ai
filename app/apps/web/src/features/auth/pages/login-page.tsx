import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context.js';
import { LoginCard } from '../components/login-card.js';

export const LoginPage: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-app-bg relative overflow-hidden">
      {/* Subtle luxury ambient background glows */}
      <div
        className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-[#B59761]/5 blur-3xl pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-[#243746]/5 blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative z-10 w-full flex justify-center">
        <LoginCard />
      </div>
    </div>
  );
};
