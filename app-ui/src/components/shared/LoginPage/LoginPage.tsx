import React, { useEffect, useState } from 'react';
import './LoginPage.css';
import { GraduationCap, Lock, Eye, EyeOff, Server } from 'lucide-react';
import { Button, Field, inputClass } from '../../ui';
import type { UserProfile, StudentData, TeacherData, ToastState } from '../../../types';
import { useAuth } from '../../../context/authContext';
import { useSchool } from '../../../context/schoolContext';
import { API_BASE, isNativeApp } from '../../../constants';
import { cn } from '../../../lib/utils';
import AuthLayout from './AuthLayout';
import SavedLoginsSheet from './SavedLoginsSheet';
import { forgetLogin, loadSavedLogins, saveLogin, savedLoginsAvailable, type LoginRole, type SavedLogin } from '../../../services/savedLogins';
import { Form } from '../../ui/Form';

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
  const [showServerModal, setShowServerModal] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(API_BASE);

  const { login } = useAuth();
  const { schoolProfile } = useSchool();

  const schoolName = schoolProfile?.schoolInfo?.schoolName || 'SchoolHub';
  const schoolLogo = schoolProfile?.schoolInfo?.logo;

  // Saved logins: accounts remembered on this phone (encrypted, installed app only).
  const vaultAvailable = savedLoginsAvailable();
  const [rememberPassword, setRememberPassword] = useState(true);
  const [savedLogins, setSavedLogins] = useState<SavedLogin[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  // Offer them as soon as the login screen opens (e.g. after logging out).
  useEffect(() => {
    if (!vaultAvailable) return;
    let cancelled = false;
    loadSavedLogins().then(list => {
      if (cancelled) return;
      setSavedLogins(list);
      if (list.length > 0) setShowSaved(true);
    });
    return () => { cancelled = true; };
  }, [vaultAvailable]);

  const signIn = async (role: LoginRole, username: string, password: string, remember: boolean) => {
    setIsLoggingIn(true);
    try {
      const profile = await login(username, password, role);
      // Only after a successful sign-in, so a wrong password is never remembered.
      if (vaultAvailable && remember) await saveLogin({ role, username, password, name: profile.name });
      onShowToast(`Welcome back, ${profile.name}!`);
      setLoginUsername(''); setLoginPassword('');
    } catch (error: any) {
      onShowToast(error.message || 'Invalid credentials.', 'error');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword.trim()) {
      onShowToast('Please fill out all credentials.', 'error');
      setIsLoggingIn(false);
      return;
    }
    await signIn(loginRole, loginUsername.trim(), loginPassword.trim(), rememberPassword);
  };

  const handlePickSaved = async (saved: SavedLogin) => {
    setShowSaved(false);
    setLoginRole(saved.role);
    setLoginUsername(saved.username);
    setLoginPassword(saved.password);
    await signIn(saved.role, saved.username, saved.password, true);
  };

  const handleRemoveSaved = async (saved: SavedLogin) => {
    const next = await forgetLogin(saved.id);
    setSavedLogins(next);
    if (next.length === 0) setShowSaved(false);
  };

  const roleCopy = {
    admin: { label: 'Email or username', placeholder: 'e.g. admin@school.com', cta: 'Sign in to Admin' },
    teacher: { label: 'Employee ID', placeholder: 'e.g. EMP-001', cta: 'Sign in to Teacher Portal' },
    parent: { label: 'Student admission no.', placeholder: 'e.g. 2026-0001', cta: 'Sign in to Parent Portal' },
  }[loginRole];

  return (
    <AuthLayout toast={toast}>
      <div className="login-logo">
        {schoolLogo ? (
          <img src={schoolLogo} alt="School Logo" className="login-logo-icon" />
        ) : (
          <GraduationCap className="login-logo-icon" />
        )}
        <div>
          <h1 className="login-title">{schoolName}</h1>
          <p className="login-welcome-en m-0 mt-1">Sign in to your SchoolHub account</p>
        </div>
      </div>

      <Form onSubmit={handleLoginSubmit} className="flex flex-col gap-4 w-full" noValidate={false}>
        <div className="login-role-selector" role="tablist" aria-label="Sign in as">
          {(['admin', 'teacher', 'parent'] as const).map((role) => (
            <button
              key={role}
              type="button"
              role="tab"
              aria-selected={loginRole === role}
              className={cn('login-role-tab', loginRole === role && 'active')}
              onClick={() => {
                setLoginRole(role);
                setLoginUsername('');
                setLoginPassword('');
                setIsLoggingIn(false);
              }}
            >
              <span>{role === 'admin' ? 'Admin' : role === 'teacher' ? 'Teacher' : 'Parent'}</span>
            </button>
          ))}
        </div>

        <Field label={roleCopy.label} htmlFor="login-username">
          <input
            id="login-username"
            type="text"
            placeholder={roleCopy.placeholder}
            className={inputClass}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={loginUsername}
            onChange={(e) => {
              setLoginUsername(e.target.value);
              if (isLoggingIn) setIsLoggingIn(false);
            }}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="login-password"
          hint={loginRole === 'parent' ? "Default password is your child's date of birth (DDMMYYYY)" : undefined}
        >
          <div className="relative w-full">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              placeholder={loginRole === 'parent' ? 'Date of Birth (DDMMYYYY)' : '••••••••'}
              className={cn(inputClass, 'pr-12')}
              name="password"
              autoComplete="current-password"
              required
              value={loginPassword}
              onChange={(e) => {
              setLoginPassword(e.target.value);
              if (isLoggingIn) setIsLoggingIn(false);
            }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-0 top-0 h-control w-11 inline-flex items-center justify-center text-faint hover:text-ink-2 rounded-r-md"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 -mt-1">
          {vaultAvailable ? (
            <label className="flex items-center gap-2 min-h-tap text-sm text-ink-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberPassword}
                onChange={(e) => setRememberPassword(e.target.checked)}
                className="w-[18px] h-[18px] accent-[rgb(var(--brand-600))]"
              />
              Remember on this phone
            </label>
          ) : <span />}
          <button
            type="button"
            onClick={onForgotPasswordClick}
            className="min-h-tap px-1 -mr-1 text-sm font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300"
          >
            Forgot password?
          </button>
        </div>

        {vaultAvailable && savedLogins.length > 0 && (
          <button
            type="button"
            onClick={() => setShowSaved(true)}
            className="-mt-2 self-start min-h-tap text-sm font-semibold text-blue-700 dark:text-blue-300"
          >
            Saved logins ({savedLogins.length})
          </button>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full mt-1"
          loading={isLoggingIn}
          loadingText="Signing in…"
        >
          <Lock size={16} aria-hidden="true" /> {roleCopy.cta}
        </Button>
      </Form>

      {showSaved && savedLogins.length > 0 && (
        <SavedLoginsSheet
          logins={savedLogins}
          busy={isLoggingIn}
          onPick={handlePickSaved}
          onRemove={handleRemoveSaved}
          onClose={() => setShowSaved(false)}
        />
      )}

      {/* Server URL Configuration Modal */}
      {showServerModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '400px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Server className="w-5 h-5" style={{ color: '#4f46e5' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', margin: 0 }}>Backend Server URL</h3>
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px', lineHeight: 1.4 }}>
              Enter your backend API endpoint (e.g. <code>https://your-server/api</code> or your production domain).
            </p>
            <input
              type="text"
              value={serverUrlInput}
              onChange={(e) => setServerUrlInput(e.target.value)}
              placeholder="https://your-server/api"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                marginBottom: '16px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('CUSTOM_API_BASE');
                  window.location.reload();
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  color: '#64748b',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Reset Default
              </button>
              <button
                type="button"
                onClick={() => {
                  if (serverUrlInput.trim()) {
                    localStorage.setItem('CUSTOM_API_BASE', serverUrlInput.trim().replace(/\/+$/, ''));
                    window.location.reload();
                  }
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#4f46e5',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Save & Reload
              </button>
              <button
                type="button"
                onClick={() => setShowServerModal(false)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthLayout>
  );
};

export default LoginPage;
