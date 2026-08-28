import React, { useState, useEffect } from 'react';
import {
  Phone, Lock, Key, Eye, EyeOff, Loader2, Shield, Send,
} from 'lucide-react';
import { API_BASE } from '../../../constants';
import { getAccessToken } from '../../../services/api';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui';

interface ParentAccountProfileProps {
  showToast: (message: string, type?: 'success' | 'error') => void;
}

// ─── Shared field tokens ───────────────────────────────────────────────────────
const labelCls = 'text-[11px] font-bold uppercase tracking-widest text-slate-400';
const inputCls = 'h-11 px-3.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all font-[inherit] w-full';

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm', className)}>
      {children}
    </div>
  );
}
function SectionHead({ title, subtitle, icon: Icon, action }: { title: string; subtitle?: string; icon: React.ElementType; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <Icon size={14} className="text-indigo-600" />
        </div>
        <div>
          <div className="text-sm font-bold text-slate-800">{title}</div>
          {subtitle && <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>}
        </div>
      </div>
      {action}
    </div>
  );
}

const authHeaders = (): HeadersInit => {
  const token = getAccessToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

const ParentAccountProfile: React.FC<ParentAccountProfileProps> = ({ showToast }) => {
  const [loading, setLoading] = useState(true);
  const [whatsappNo, setWhatsappNo] = useState('');
  const [motherWhatsappNo, setMotherWhatsappNo] = useState('');

  // Password & OTP states
  const [showPwdSection, setShowPwdSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState({ current: false, new: false, confirm: false });
  const [savingPassword, setSavingPassword] = useState(false);

  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [inputOtp, setInputOtp] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/parent/profile`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success && data.data) {
          setWhatsappNo(data.data.whatsappNo || '');
          setMotherWhatsappNo(data.data.motherWhatsappNo || '');
        }
      } catch (err) {
        console.error('Failed to load parent profile:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSendOtp = async () => {
    if (!currentPassword) { showToast('Enter your current password first.', 'error'); return; }
    if (!newPassword || newPassword.length < 3) { showToast('New password must be at least 3 characters.', 'error'); return; }
    if (newPassword !== confirmPassword) { showToast('Passwords do not match.', 'error'); return; }

    setSendingOtp(true);
    try {
      const res = await fetch(`${API_BASE}/parent/profile/send-password-otp`, { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      setOtpSent(true);
      if (data.success) showToast(`WhatsApp OTP sent${data.otpCode ? ` (Code: ${data.otpCode})` : '.'}`, 'success');
      else showToast(data.message || 'Failed to send OTP.', 'error');
    } catch {
      showToast('Failed to send OTP.', 'error');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) { showToast('Enter your current password.', 'error'); return; }
    if (!newPassword || newPassword.length < 3) { showToast('New password must be at least 3 characters.', 'error'); return; }
    if (newPassword !== confirmPassword) { showToast('Passwords do not match.', 'error'); return; }
    if (!otpSent) { showToast('Request a WhatsApp OTP to verify your password change.', 'error'); return; }
    if (!inputOtp.trim() || inputOtp.trim().length !== 6) { showToast('Enter the 6-digit OTP.', 'error'); return; }

    setSavingPassword(true);
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ currentPassword, newPassword, otpCode: inputOtp.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Password changed successfully.', 'success');
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
        setShowPwdSection(false); setOtpSent(false); setInputOtp('');
      } else {
        showToast(data.message || 'Failed to change password.', 'error');
      }
    } catch {
      showToast('Error changing password.', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={22} className="animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl flex flex-col gap-4 font-sans text-slate-900">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">My Profile</h1>
        <p className="text-xs text-slate-500 mt-0.5">View your registered contact numbers and manage account security.</p>
      </div>

      <SectionCard>
        <SectionHead title="WhatsApp Contact Numbers" subtitle="Registered numbers used to deliver attendance, fee, and notice updates." icon={Phone} />
        <div className="p-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>Father's WhatsApp Number</span>
            <div className="h-11 px-3.5 border border-slate-200/80 rounded-xl text-sm font-semibold text-slate-800 bg-slate-50/80 flex items-center select-all">
              {whatsappNo || <span className="text-slate-400 font-normal">Not provided</span>}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>Mother's WhatsApp Number</span>
            <div className="h-11 px-3.5 border border-slate-200/80 rounded-xl text-sm font-semibold text-slate-800 bg-slate-50/80 flex items-center select-all">
              {motherWhatsappNo || <span className="text-slate-400 font-normal">Not provided</span>}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHead
          title="Change Account Password"
          subtitle="Enter your current password and verify via WhatsApp OTP to set a new one."
          icon={Key}
          action={
            <label className="flex items-center cursor-pointer">
              <div className="relative">
                <input type="checkbox" className="sr-only peer"
                  checked={showPwdSection}
                  onChange={e => {
                    setShowPwdSection(e.target.checked);
                    if (!e.target.checked) { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setOtpSent(false); setInputOtp(''); }
                  }} />
                <div className="w-9 h-5 rounded-full bg-slate-200 peer-checked:bg-indigo-600 transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
              </div>
            </label>
          }
        />
        {showPwdSection && (
          <form onSubmit={handleChangePassword} className="p-5 grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-slate-100">
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Current Password</label>
              <div className="relative">
                <input type={showPwd.current ? 'text' : 'password'} className={cn(inputCls, 'pr-10')} required
                  placeholder="Enter current password…" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  onClick={() => setShowPwd(p => ({ ...p, current: !p.current }))}>
                  {showPwd.current ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>New Password</label>
              <div className="relative">
                <input type={showPwd.new ? 'text' : 'password'} className={cn(inputCls, 'pr-10')} required
                  placeholder="Min 3 characters…" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  onClick={() => setShowPwd(p => ({ ...p, new: !p.new }))}>
                  {showPwd.new ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className={labelCls}>Confirm New Password</label>
              <div className="relative max-w-[300px]">
                <input type={showPwd.confirm ? 'text' : 'password'} className={cn(inputCls, 'pr-10')} required
                  placeholder="Re-enter new password…" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  onClick={() => setShowPwd(p => ({ ...p, confirm: !p.confirm }))}>
                  {showPwd.confirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <div className="text-[11px] text-red-500 font-semibold">Passwords do not match</div>
              )}
            </div>

            <div className="sm:col-span-2">
              <div className="mt-2 p-4 rounded-lg border-l-4 border-amber-400 bg-amber-50">
                <div className="flex items-start gap-2 mb-3">
                  <Shield size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-amber-800">WhatsApp OTP Verification Required</div>
                    <div className="text-xs text-amber-700 mt-0.5">
                      A security code will be sent to your registered WhatsApp number{whatsappNo ? ` (${whatsappNo})` : ''}.
                    </div>
                  </div>
                </div>
                {!otpSent ? (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={sendingOtp}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    {sendingOtp ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                    {sendingOtp ? 'Sending…' : 'Send Verification Code'}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      maxLength={6}
                      autoFocus
                      placeholder="123456"
                      className="h-11 w-32 px-3 border-2 border-amber-400 rounded-md text-sm font-bold text-amber-900 bg-white outline-none focus:border-amber-500 text-center tracking-[0.25em] font-[inherit]"
                      value={inputOtp}
                      onChange={e => setInputOtp(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={sendingOtp}
                      className="text-xs font-bold text-amber-700 underline hover:text-amber-900 transition-colors cursor-pointer"
                    >
                      Resend
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="sm:col-span-2">
              <Button type="submit" disabled={savingPassword}>
                {savingPassword ? <><Loader2 size={13} className="animate-spin" /> Updating…</> : <><Lock size={13} /> Update Password</>}
              </Button>
            </div>
          </form>
        )}
      </SectionCard>
    </div>
  );
};

export default ParentAccountProfile;

