import React, { useState } from 'react';
import { GraduationCap, ArrowLeft, Lock, ShieldCheck, Eye, EyeOff, CheckCircle2, XCircle, UserCheck } from 'lucide-react';
import { API_BASE } from '../../../constants';
import type { ToastState } from '../../../types';
import AuthLayout from './AuthLayout';
import { Form } from '../../ui/Form';

interface ForgotPasswordPageProps {
  toast: ToastState;
  onBackToLogin: () => void;
  onShowToast: (message: string, type?: 'success' | 'error') => void;
}

const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ toast, onBackToLogin, onShowToast }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<'admin' | 'employee'>('admin');
  const [identifier, setIdentifier] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // Live password validation rules
  const hasMinLength = password.length >= 6;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const isMatchValid = password === confirmPassword && confirmPassword.length > 0;
  const allRulesPass = hasMinLength && hasLetter && hasNumber && isMatchValid;
  const showChecklist = password.length > 0 || confirmPassword.length > 0;

  // STEP 1: Request OTP
  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      onShowToast(
        role === 'admin' ? 'Please enter your Username or Admin ID.' : 'Please enter your Employee ID.',
        'error'
      );
      return;
    }

    setLoading(true);
    try {
      const response = await window.fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          role
        }),
      });

      const data = await response.json();

      if (data.success) {
        setMaskedPhone(data.maskedPhone || 'your registered WhatsApp number');
        setStep(2);
        onShowToast(`Verification code sent to ${data.maskedPhone || 'your WhatsApp number'}.`, 'success');
      } else {
        onShowToast(data.message || 'Account not found.', 'error');
      }
    } catch (error: any) {
      onShowToast(error.message || 'Connection error. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP inside Step 2
  const handleResendOTP = async () => {
    setResending(true);
    try {
      const response = await window.fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          role
        }),
      });

      const data = await response.json();

      if (data.success) {
        setMaskedPhone(data.maskedPhone || 'your registered WhatsApp number');
        onShowToast(`A new 6-digit verification code has been sent.`, 'success');
      } else {
        onShowToast(data.message || 'Failed to resend OTP.', 'error');
      }
    } catch (error: any) {
      onShowToast(error.message || 'Something went wrong.', 'error');
    } finally {
      setResending(false);
    }
  };

  // STEP 2: Verify OTP & Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!otp || otp.length !== 6) {
      onShowToast('Please enter a valid 6-digit OTP.', 'error');
      return;
    }

    if (!allRulesPass) {
      onShowToast('Please meet all password requirements before saving.', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await window.fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          role,
          otp: otp.trim(),
          password
        }),
      });

      const data = await response.json();

      if (data.success) {
        onShowToast('Password updated successfully! Please log in with your new password.', 'success');
        onBackToLogin();
      } else {
        onShowToast(data.message || 'Failed to reset password.', 'error');
      }
    } catch (error: any) {
      onShowToast(error.message || 'Something went wrong. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const RuleRow = ({ ok, text }: { ok: boolean; text: string }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 12, fontWeight: 500,
      color: ok ? '#15803d' : '#94a3b8',
      transition: 'color 0.2s'
    }}>
      {ok
        ? <CheckCircle2 size={13} color="#16a34a" style={{ flexShrink: 0 }} />
        : <XCircle      size={13} color="#cbd5e1" style={{ flexShrink: 0 }} />}
      <span>{text}</span>
    </div>
  );

  return (
    <AuthLayout toast={toast}>
      <div className="login-logo">
        <GraduationCap className="login-logo-icon" />
        <h1 className="login-title">SchoolHub</h1>
      </div>

      <div className="login-divider"></div>

      {step === 1 ? (
        // Step 1: Account Identifier Request View
        <Form onSubmit={handleRequestOTP} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
          <div className="login-welcome-banner">
            <span className="login-welcome-en">Reset Password Request</span>
          </div>

          {/* Role selector tab (Admin vs Employee) */}
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600, fontSize: '13px', color: '#334155' }}>
              Select Account Type
            </label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
              <button
                type="button"
                onClick={() => { setRole('admin'); setIdentifier(''); }}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: role === 'admin' ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                  background: role === 'admin' ? '#eef2ff' : '#ffffff',
                  color: role === 'admin' ? '#4f46e5' : '#64748b',
                  fontWeight: role === 'admin' ? 700 : 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <UserCheck size={15} />
                <span>Admin</span>
              </button>
              <button
                type="button"
                onClick={() => { setRole('employee'); setIdentifier(''); }}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: role === 'employee' ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                  background: role === 'employee' ? '#eef2ff' : '#ffffff',
                  color: role === 'employee' ? '#4f46e5' : '#64748b',
                  fontWeight: role === 'employee' ? 700 : 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <UserCheck size={15} />
                <span>Employee</span>
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600, fontSize: '13px', color: '#334155' }}>
              {role === 'admin' ? 'Username or Admin ID' : 'Employee ID'}
            </label>
            <input
              type="text"
              placeholder={role === 'admin' ? 'e.g. admin1 or ADMIN-001' : 'e.g. EMP-001'}
              className="form-input"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={loading}
            />
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0' }}>
              We will send a 6-digit OTP to the registered WhatsApp number on this account.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            <button
              type="submit"
              className="action-btn"
              style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              disabled={loading || !identifier.trim()}
            >
              <span>{loading ? 'Finding Account & Sending OTP...' : 'Send OTP via WhatsApp'}</span>
            </button>
            <button
              type="button"
              onClick={onBackToLogin}
              className="action-btn secondary"
              style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              disabled={loading}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              <span>Back to Log In</span>
            </button>
          </div>
        </Form>
      ) : (
        // Step 2: OTP Entry & New Password View
        <Form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
          <div className="login-welcome-banner">
            <span className="login-welcome-en">Enter Verification Details</span>
          </div>

          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#eef2ff', color: '#4f46e5', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <ShieldCheck className="w-5 h-5 flex-shrink-0" />
            <span style={{ fontSize: '12px', lineHeight: '1.4' }}>
              Verification code sent to WhatsApp <strong>{maskedPhone}</strong>. Valid for 15 minutes.
            </span>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600, fontSize: '13px', color: '#334155' }}>
              One-Time Password (OTP)
            </label>
            <input
              type="text"
              maxLength={6}
              placeholder="6-digit code"
              className="form-input"
              required
              style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '18px', fontWeight: 700 }}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600, fontSize: '13px', color: '#334155' }}>
              New Password
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="e.g. school24, harsha6"
                className="form-input"
                required
                style={{ width: '100%', paddingRight: '40px' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 10, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600, fontSize: '13px', color: '#334155' }}>
              Confirm New Password
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showConfirm ? 'text' : 'password'}
                placeholder="Repeat new password"
                className="form-input"
                required
                style={{ width: '100%', paddingRight: '40px' }}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                style={{ position: 'absolute', right: 10, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
              >
                {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {/* Live password requirements checklist */}
          {showChecklist && (
            <div style={{
              background: '#f8fafc', border: '1px solid #f1f5f9',
              borderRadius: 10, padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: 7
            }}>
              <RuleRow ok={hasMinLength} text="At least 6 characters" />
              <RuleRow ok={hasLetter}    text="Contains a letter (a–z)" />
              <RuleRow ok={hasNumber}    text="Contains a number (0–9)" />
              <RuleRow ok={isMatchValid} text="Both passwords match" />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '-4px' }}>
            <button
              type="button"
              onClick={() => setStep(1)}
              style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', display: 'flex', alignItems: 'center', cursor: 'pointer', padding: 0 }}
              disabled={loading}
            >
              <ArrowLeft className="w-3 h-3 mr-1" />
              <span>Change Account ID</span>
            </button>
            <button
              type="button"
              onClick={handleResendOTP}
              style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '13px', fontWeight: 500, cursor: 'pointer', padding: 0 }}
              disabled={loading || resending}
            >
              {resending ? 'Resending...' : 'Resend OTP'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <button
              type="submit"
              className="action-btn"
              style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              disabled={loading || otp.length !== 6 || !allRulesPass}
            >
              <Lock className="w-4 h-4 mr-2" />
              <span>{loading ? 'Resetting Password...' : 'Reset Password'}</span>
            </button>
            <button
              type="button"
              onClick={onBackToLogin}
              className="action-btn secondary"
              style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              disabled={loading}
            >
              <span>Cancel</span>
            </button>
          </div>
        </Form>
      )}
    </AuthLayout>
  );
};

export default ForgotPasswordPage;
