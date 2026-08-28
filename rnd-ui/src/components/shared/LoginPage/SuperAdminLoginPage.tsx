import React, { useState } from 'react';
import './LoginPage.css';
import { GraduationCap, Lock, Loader2 } from 'lucide-react';
import type { ToastState } from '../../../types';
import { useAuth } from '../../../context/authContext';
import { useSchool } from '../../../context/schoolContext';
import AuthLayout from './AuthLayout';

interface SuperAdminLoginPageProps {
  toast: ToastState;
  onShowToast: (message: string, type?: 'success' | 'error') => void;
  onForgotPasswordClick: () => void;
}

const SuperAdminLoginPage: React.FC<SuperAdminLoginPageProps> = ({ toast, onShowToast, onForgotPasswordClick }) => {
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const { login } = useAuth();
  const { schoolProfile } = useSchool();

  const schoolName = schoolProfile?.schoolInfo?.schoolName || 'SchoolHub';
  const schoolLogo = schoolProfile?.schoolInfo?.logo;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername || !loginPassword) {
      onShowToast('Please fill out all credentials.', 'error'); 
      return;
    }

    setIsLoggingIn(true);
    try {
      const profile = await login(loginUsername, loginPassword, 'superadmin');
      onShowToast(`Welcome back, Super Admin ${profile.name}!`);
      setLoginUsername(''); 
      setLoginPassword('');
    } catch (error: any) {
      onShowToast(error.message || 'Invalid credentials.', 'error');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <AuthLayout toast={toast}>
      <div className="login-logo">
        {schoolLogo ? (
          <img src={schoolLogo} alt="School Logo" className="login-logo-icon" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
        ) : (
          <GraduationCap className="login-logo-icon" />
        )}
        <h1 className="login-title">{schoolName}</h1>
      </div>

      <div className="login-divider"></div>

      <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
        <div className="login-welcome-banner">
          <span className="login-welcome-en">SuperAdmin Portal Authentication</span>
        </div>

        <div className="form-group">
          <label className="form-label">SuperAdmin Username</label>
          <input
            type="text"
            placeholder="e.g. superadmin"
            className="form-input"
            required
            value={loginUsername}
            onChange={(e) => setLoginUsername(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            type="password"
            placeholder="••••••••"
            className="form-input"
            required
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-8px' }}>
          <button
            type="button"
            onClick={onForgotPasswordClick}
            style={{
              background: 'none',
              border: 'none',
              color: '#4f46e5',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'inherit'
            }}
          >
            Forgot Password?
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
          <button
            type="submit"
            className="action-btn"
            disabled={isLoggingIn}
            style={{
              flex: 1,
              justifyContent: 'center',
              padding: '10px',
              opacity: isLoggingIn ? 0.75 : 1,
              cursor: isLoggingIn ? 'not-allowed' : 'pointer'
            }}
          >
            {isLoggingIn ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                <span>Logging in...</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 mr-2" />
                <span>Log In as SuperAdmin</span>
              </>
            )}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
};

export default SuperAdminLoginPage;
