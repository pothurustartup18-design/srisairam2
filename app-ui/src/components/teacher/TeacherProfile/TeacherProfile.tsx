import React, { useState, useEffect } from 'react';
import {
  User, Mail, Phone, MapPin, Home, Lock, Save, Shield, Key,
  Send, Eye, EyeOff, Loader2,
} from 'lucide-react';
import { API_BASE } from '../../../constants';
import { getAccessToken } from '../../../services/api';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui';
import { Form } from '../../ui/Form';
import { ActionButton } from '../../ui/ActionButton';

interface TeacherProfileProps {
  showToast: (message: string, type?: 'success' | 'error') => void;
}

// ─── Shared field tokens ───────────────────────────────────────────────────────
const labelCls = 'text-[11px] font-bold uppercase tracking-wider text-slate-400';
const inputCls = 'h-11 px-3 border border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all font-[inherit] w-full';

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white border border-slate-200 rounded-lg overflow-hidden', className)}>
      {children}
    </div>
  );
}
function SectionHead({ title, subtitle, icon: Icon, action }: { title: string; subtitle?: string; icon: React.ElementType; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
      <div className="flex items-center gap-3">
        <Icon size={15} className="text-slate-500 flex-shrink-0" />
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

const validatePhoneNumber = (val: string): { isValid: boolean; error?: string } => {
  if (!val) {
    return { isValid: false, error: 'Phone number is required.' };
  }
  const digits = val.replace(/\D/g, '');
  let localNum = '';
  if (digits.length === 12 && digits.startsWith('91')) {
    localNum = digits.slice(2);
  } else if (digits.length === 10) {
    localNum = digits;
  } else {
    return { isValid: false, error: 'Phone number must be a valid 10-digit Indian number (optionally with +91 country code).' };
  }
  const indianMobileRegex = /^[6-9]\d{9}$/;
  if (!indianMobileRegex.test(localNum)) {
    return { isValid: false, error: 'Phone number must be a valid Indian mobile number starting with 6, 7, 8, or 9.' };
  }
  return { isValid: true };
};

const TeacherProfile: React.FC<TeacherProfileProps> = ({ showToast }) => {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [cluster, setCluster] = useState('');
  const [address, setAddress] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  const handlePhoneChange = (val: string) => {
    setPhone(val);
    if (phoneError) setPhoneError('');
  };

  // Password
  const [showPwdSection, setShowPwdSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState({ current: false, new: false, confirm: false });
  const [savingPassword, setSavingPassword] = useState(false);

  // OTP (password change only — profile fields never require it)
  const [otpSent, setOtpSent] = useState(false);
  const [inputOtp, setInputOtp] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/teachers/me`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success && data.data) {
          setName(data.data.name || '');
          setEmployeeId(data.data.employeeId || '');
          setPhone(data.data.phone || '');
          setEmail(data.data.email || '');
          setCluster(data.data.cluster || '');
          setAddress(data.data.address || '');
        }
      } catch (err) {
        console.error('Failed to load teacher profile:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validatePhoneNumber(phone);
    if (!validation.isValid) {
      setPhoneError(validation.error || 'Invalid phone number');
      showToast(validation.error || 'Invalid phone number.', 'error');
      return;
    }

    setSavingProfile(true);
    try {
      const res = await fetch(`${API_BASE}/teachers/me`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ phone, email, cluster, address }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Profile updated successfully.', 'success');
        if (data.data?.phone) {
          setPhone(data.data.phone);
        }
      } else {
        showToast(data.message || 'Failed to update profile.', 'error');
      }
    } catch {
      showToast('Error updating profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSendOtp = async () => {
    if (!currentPassword) { showToast('Enter your current password first.', 'error'); return; }
    if (!newPassword || newPassword.length < 3) { showToast('New password must be at least 3 characters.', 'error'); return; }
    if (newPassword !== confirmPassword) { showToast('Passwords do not match.', 'error'); return; }

    setSendingOtp(true);
    try {
      const res = await fetch(`${API_BASE}/teachers/me/send-password-otp`, { method: 'POST', headers: authHeaders() });
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

  const initials = (name || '?').split(' ').map(n => n[0] || '').join('').toUpperCase().slice(0, 2);



  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={22} className="animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl flex flex-col gap-5 font-sans text-slate-900">
      <div>
        <h1 className="text-[22px] font-extrabold text-slate-900 tracking-tight">My Profile</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your contact details and account security.</p>
      </div>

      <SectionCard>
        <div className="flex items-center gap-5 px-5 py-5 border-b border-slate-100">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold bg-violet-100 text-violet-700 flex-shrink-0">
            {initials}
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900">{name || 'Teacher'}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <User size={12} className="text-violet-500" />
              <span className="text-xs font-semibold text-violet-700">Teacher{employeeId ? ` · ${employeeId}` : ''}</span>
            </div>
          </div>
        </div>

        <Form onSubmit={handleSaveProfile}>
          <SectionHead title="Contact Information" subtitle="Name and employee ID are managed by the school admin." icon={User} />
          <div className="p-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className={cn(labelCls, phoneError && 'text-red-500')}><Phone size={11} className="inline mr-1" />Phone Number</label>
              <input 
                type="text" 
                className={cn(inputCls, phoneError && 'border-red-300 focus:border-red-500 focus:ring-red-100')} 
                value={phone} 
                onChange={e => handlePhoneChange(e.target.value)} 
                placeholder="e.g. 9876543210" 
              />
              {phoneError && <span className="text-[11px] text-red-500 font-semibold">{phoneError}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}><Mail size={11} className="inline mr-1" />Email Address</label>
              <input type="email" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. name@school.com" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}><MapPin size={11} className="inline mr-1" />Area / Village Cluster</label>
              <input type="text" className={inputCls} value={cluster} onChange={e => setCluster(e.target.value)} placeholder="e.g. Madhapur" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}><Home size={11} className="inline mr-1" />Address</label>
              <input type="text" className={inputCls} value={address} onChange={e => setAddress(e.target.value)} placeholder="e.g. Plot 42, Jubilee Hills" />
            </div>
          </div>
          <div className="px-5 pb-5">
            <Button type="submit" disabled={savingProfile}>
              {savingProfile ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><Save size={13} /> Save Profile Changes</>}
            </Button>
          </div>
        </Form>
      </SectionCard>

      <SectionCard>
        <SectionHead
          title="Change Account Password"
          subtitle="Requires your current password and a WhatsApp verification code."
          icon={Key}
          action={
            <label className="flex items-center cursor-pointer">
              <div className="relative">
                <input type="checkbox" className="sr-only peer"
                  checked={showPwdSection}
                  onChange={e => {
                    setShowPwdSection(e.target.checked);
                    if (!e.target.checked) {
                      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
                      setOtpSent(false); setInputOtp('');
                    }
                  }} />
                <div className="w-9 h-5 rounded-full bg-slate-200 peer-checked:bg-violet-600 transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
              </div>
            </label>
          }
        />
        {showPwdSection && (
          <Form onSubmit={handleChangePassword} className="p-5 grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-slate-100">
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
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Confirm New Password</label>
              <div className="relative">
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
              <div className="mt-3 p-4 rounded-lg border-l-4 border-amber-400 bg-amber-50">
                <div className="flex items-start gap-2 mb-3">
                  <Shield size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-amber-800">WhatsApp Verification Required</div>
                    <div className="text-xs text-amber-700 mt-0.5">
                      A security code will be sent to your registered WhatsApp number{phone ? ` (${phone})` : ''}.
                    </div>
                  </div>
                </div>
                {!otpSent ? (
                  <ActionButton type="button" onClick={handleSendOtp} disabled={sendingOtp}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors disabled:opacity-60">
                    {sendingOtp ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                    {sendingOtp ? 'Sending…' : 'Send Verification Code'}
                  </ActionButton>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="text" maxLength={6} autoFocus placeholder="123456"
                      className="h-11 w-32 px-3 border-2 border-amber-400 rounded-md text-sm font-bold text-amber-900 bg-white outline-none focus:border-amber-500 text-center tracking-[0.25em] font-[inherit]"
                      value={inputOtp} onChange={e => setInputOtp(e.target.value)} />
                    <ActionButton type="button" onClick={handleSendOtp} disabled={sendingOtp}
                      className="text-xs font-bold text-amber-700 underline hover:text-amber-900 transition-colors">
                      Resend
                    </ActionButton>
                  </div>
                )}
              </div>
            </div>

            <div className="sm:col-span-2">
              <Button type="submit" disabled={savingPassword}>
                {savingPassword ? <><Loader2 size={13} className="animate-spin" /> Updating…</> : <><Lock size={13} /> Update Password</>}
              </Button>
            </div>
          </Form>
        )}
      </SectionCard>
    </div>
  );
};

export default TeacherProfile;
