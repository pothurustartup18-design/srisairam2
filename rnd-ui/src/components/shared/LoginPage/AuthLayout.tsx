import React from 'react';
import './LoginPage.css';
import { AlertCircle } from 'lucide-react';
import type { ToastState } from '../../../types';

interface AuthLayoutProps {
  children: React.ReactNode;
  toast?: ToastState;
  maxWidth?: string; // e.g., '420px', '460px'
  className?: string;
  showDecorativeGlows?: boolean;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  toast,
  maxWidth = '420px',
  className = '',
  showDecorativeGlows = false,
}) => {
  return (
    <div className="login-page-container">
      {/* Decorative background glows */}
      {showDecorativeGlows && (
        <>
          <div className="auth-glow-top" />
          <div className="auth-glow-bottom" />
        </>
      )}

      {toast && toast.show && (
        <div className="toast-notification">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span>{toast.message}</span>
        </div>
      )}

      <div 
        className={`login-card ${className}`}
        style={{ maxWidth }}
      >
        {children}
      </div>
    </div>
  );
};

export default AuthLayout;
