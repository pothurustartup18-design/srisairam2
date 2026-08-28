import React, { useState } from 'react';
import './LoginPage.css';
import { GraduationCap, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import type { UserProfile, StudentData, TeacherData, ToastState } from '../../../types';
import { useAuth } from '../../../context/authContext';
import { useSchool } from '../../../context/schoolContext';
import AuthLayout from './AuthLayout';

interface LoginPageProps {
  teachers: TeacherData[];
  students: StudentData[];
  toast: ToastState;
  onLogin: (user: UserProfile) => void;
  onShowToast: (message: string, type?: 'success' | 'error') => void;
  onForgotPasswordClick: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ toast, onShowToast, onForgotPasswordClick }) => {
  const [loginRole, setLoginRole] = useState<'admin' | 'teacher' | 'parent'>('admin');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const { login } = useAuth();
  const { schoolProfile } = useSchool();

  const schoolName = schoolProfile?.schoolInfo?.schoolName || 'SchoolHub';
  const schoolLogo = schoolProfile?.schoolInfo?.logo;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername || !loginPassword) {
      onShowToast('Please fill out all credentials.', 'error'); return;
    }

    setIsLoggingIn(true);
    try {
      const profile = await login(loginUsername, loginPassword, loginRole);
      onShowToast(`Welcome back, ${profile.name}!`);
      setLoginUsername(''); setLoginPassword('');
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
          <span className="login-welcome-en">SchoolHub ERP Authentication</span>
        </div>

        <div className="form-group">
          <label className="form-label">Portal Role</label>
          <select
            className="form-input"
            value={loginRole}
            onChange={(e) => {
              setLoginRole(e.target.value as 'admin' | 'teacher' | 'parent');
              setLoginUsername('');
              setLoginPassword('');
            }}
            style={{ width: '100%', cursor: 'pointer', appearance: 'auto' }}
          >
            <option value="admin">Admin Portal</option>
            <option value="teacher">Employee Portal</option>
            <option value="parent">Parent Portal</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">
            {loginRole === 'admin' ? 'Email or Username' : loginRole === 'teacher' ? 'Employee ID' : 'Student Admission No.'}
          </label>
          <input
            type="text"
            placeholder={loginRole === 'admin' ? 'e.g. admin@school.com' : loginRole === 'teacher' ? 'e.g. EMP-001' : 'e.g. 2026-0001'}
            className="form-input"
            required
            value={loginUsername}
            onChange={(e) => setLoginUsername(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Password</label>
          <div style={{ position: 'relative', width: '100%' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              className="form-input"
              required
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              style={{ width: '100%', paddingRight: '40px' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: 'none'
              }}
            >
              {showPassword ? <EyeOff size={16} className="text-slate-400 hover:text-slate-600 transition-colors" /> : <Eye size={16} className="text-slate-400 hover:text-slate-600 transition-colors" />}
            </button>
          </div>
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
                <span>Log In</span>
              </>
            )}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
};

export default LoginPage;
