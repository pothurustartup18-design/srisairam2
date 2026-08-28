import React, { useState } from 'react';
import { API_BASE } from '../../../constants';
import { Lock, RefreshCw, LogOut, Eye, EyeOff, CheckCircle2, XCircle, Shield, AlertTriangle } from 'lucide-react';
import AuthLayout from './AuthLayout';
import './LoginPage.css';

interface ForcePasswordChangePageProps {
  user: any;
  onPasswordChanged: () => void;
  onLogout: () => Promise<void>;
  showToast?: (msg: string, type?: 'success' | 'error') => void;
}

export default function ForcePasswordChangePage({ 
  user, 
  onPasswordChanged, 
  onLogout,
  showToast 
}: ForcePasswordChangePageProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting]           = useState(false);
  const [errorMsg, setErrorMsg]               = useState('');
  const [wrongCurrentPw, setWrongCurrentPw]   = useState(false);
  const [success, setSuccess]                 = useState(false);

  // Password visibility toggles
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Live validation — mirrors backend validatePassword() rules
  const hasMinLength  = newPassword.length >= 6;
  const hasLetter     = /[a-zA-Z]/.test(newPassword);
  const hasNumber     = /[0-9]/.test(newPassword);
  const isMatchValid  = newPassword === confirmPassword && confirmPassword.length > 0;
  const allRulesPass  = hasMinLength && hasLetter && hasNumber && isMatchValid;

  // Button only active when all fields filled and rules pass
  const canSubmit     = currentPassword.trim().length > 0 && allRulesPass && !submitting;
  const showChecklist = newPassword.length > 0 || confirmPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setWrongCurrentPw(false);

    if (!currentPassword.trim()) {
      setErrorMsg('Please enter your current temporary password.');
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('schoolhub_access_token');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res  = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess(true);
        if (showToast) showToast('Password changed successfully.', 'success');
        setTimeout(() => onPasswordChanged(), 1800);
      } else {
        const msg: string = data.message || 'Failed to change password.';
        // Show inline field error for wrong current password
        if (msg.toLowerCase().includes('incorrect') || msg.toLowerCase().includes('current')) {
          setWrongCurrentPw(true);
        } else {
          setErrorMsg(msg);
        }
      }
    } catch {
      setErrorMsg('Connection error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Success Screen ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <AuthLayout maxWidth="420px" showDecorativeGlows={true}>
        <div style={{ textAlign: 'center', padding: '20px 0 12px', width: '100%' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 22px auto',
            boxShadow: '0 8px 24px -4px rgba(22,163,74,0.20)'
          }}>
            <CheckCircle2 size={36} color="#16a34a" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 10px' }}>
            Password Updated
          </h2>
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: 0 }}>
            Your new password has been set successfully.<br />
            Redirecting you to your dashboard…
          </p>
        </div>
      </AuthLayout>
    );
  }

  // ─── Checklist Row ──────────────────────────────────────────────────────────
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

  // ─── Main Form ──────────────────────────────────────────────────────────────
  return (
    <AuthLayout maxWidth="460px" showDecorativeGlows={true}>

      {/* Header */}
      <div style={{ marginBottom: 28, textAlign: 'center', width: '100%' }}>
        <div style={{
          background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
          color: '#0284c7', margin: '0 auto 18px auto',
          width: 64, height: 64, borderRadius: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 16px -4px rgba(2,132,199,0.15)'
        }}>
          <Shield size={28} />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.4px', margin: 0 }}>
          Set Your Password
        </h2>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 8, marginBottom: 0, lineHeight: 1.55, padding: '0 4px' }}>
          Hi <strong style={{ color: '#0f172a' }}>{user?.name || 'there'}</strong> — your account was
          created with a temporary password. Please set a new one to continue.
        </p>
      </div>

      {/* General error banner */}
      {errorMsg && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
          padding: '11px 14px', borderRadius: 10, fontSize: 13,
          marginBottom: 18, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8, width: '100%'
        }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 17 }}>

        {/* ── Field 1: Current Password ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>
            Current Password
          </label>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
            The temporary password your admin sent you.
          </p>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 3 }}>
            <input
              type={showCurrent ? 'text' : 'password'}
              required
              className="form-input"
              placeholder="Enter temporary password"
              value={currentPassword}
              onChange={(e) => { setCurrentPassword(e.target.value); setWrongCurrentPw(false); }}
              style={{
                width: '100%', paddingRight: 44, borderRadius: 10,
                borderColor: wrongCurrentPw ? '#ef4444' : '#cbd5e1',
                boxShadow: wrongCurrentPw ? '0 0 0 3px rgba(239,68,68,0.10)' : undefined,
                transition: 'border-color 0.2s, box-shadow 0.2s'
              }}
            />
            <button type="button" onClick={() => setShowCurrent(!showCurrent)}
              style={{ position: 'absolute', right: 12, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}>
              {showCurrent ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {wrongCurrentPw && (
            <p style={{ fontSize: 12, color: '#dc2626', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
              <XCircle size={13} style={{ flexShrink: 0 }} />
              Incorrect password — please check and try again.
            </p>
          )}
        </div>

        {/* ── Field 2: New Password ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>
            New Password
          </label>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
            Minimum 6 characters with at least one letter and one number.
          </p>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 3 }}>
            <input
              type={showNew ? 'text' : 'password'}
              required
              className="form-input"
              placeholder="e.g. school24, harsha6"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={{ width: '100%', paddingRight: 44, borderRadius: 10, borderColor: '#cbd5e1' }}
            />
            <button type="button" onClick={() => setShowNew(!showNew)}
              style={{ position: 'absolute', right: 12, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}>
              {showNew ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        {/* ── Field 3: Confirm Password ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>
            Confirm New Password
          </label>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
            Type your new password once more to confirm.
          </p>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 3 }}>
            <input
              type={showConfirm ? 'text' : 'password'}
              required
              className="form-input"
              placeholder="Repeat new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{
                width: '100%', paddingRight: 44, borderRadius: 10,
                borderColor: confirmPassword.length > 0 && !isMatchValid ? '#ef4444' : '#cbd5e1',
                transition: 'border-color 0.2s'
              }}
            />
            <button type="button" onClick={() => setShowConfirm(!showConfirm)}
              style={{ position: 'absolute', right: 12, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}>
              {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        {/* ── Live Checklist ── */}
        {showChecklist && (
          <div style={{
            background: '#f8fafc', border: '1px solid #f1f5f9',
            borderRadius: 10, padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: 7
          }}>
            <RuleRow ok={hasMinLength} text="At least 6 characters" />
            <RuleRow ok={hasLetter}    text="Contains a letter  (a–z)" />
            <RuleRow ok={hasNumber}    text="Contains a number  (0–9)" />
            <RuleRow ok={isMatchValid} text="Both passwords match" />
          </div>
        )}

        {/* ── Action Buttons ── */}
        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          <button
            type="button"
            onClick={onLogout}
            className="action-btn secondary"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, flex: 1, borderColor: '#cbd5e1', borderRadius: 10, height: 44
            }}
          >
            <LogOut size={15} />
            <span>Log Out</span>
          </button>

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              background: canSubmit
                ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
                : '#e2e8f0',
              color: canSubmit ? 'white' : '#94a3b8',
              flex: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, borderRadius: 10, height: 44,
              border: 'none',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontWeight: 600, fontSize: 14,
              boxShadow: canSubmit ? '0 4px 12px rgba(2,132,199,0.25)' : 'none',
              transition: 'all 0.25s'
            }}
          >
            {submitting
              ? <><RefreshCw size={15} className="spinning" /><span>Saving…</span></>
              : <><Lock size={15} /><span>Set Password</span></>}
          </button>
        </div>

      </form>
    </AuthLayout>
  );
}
