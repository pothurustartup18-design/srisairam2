import React, { useState } from 'react';
import {
  User, Save, Shield, Key, Camera,
  Send, Trash2, Eye, EyeOff, Loader2
} from 'lucide-react';
import { useSchool } from '../../../context/schoolContext';
import { useAuth } from '../../../context/authContext';
import ImageCropper from '../../shared/ImageCropper/ImageCropper';
import { API_BASE } from '../../../constants';
import { getAccessToken } from '../../../services/api';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui';

interface AdminProfileProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

// ─── Shared field tokens ───────────────────────────────────────────────────────
const labelCls = 'text-[11px] font-bold uppercase tracking-wider text-slate-400';
const inputCls = 'h-10 px-3 border border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all font-[inherit] w-full';

// ─── Section card wrapper ──────────────────────────────────────────────────────
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

export default function AdminProfile({ showToast }: AdminProfileProps) {
  const { user, updateUserProfile } = useAuth();
  const { updateAdminProfile } = useSchool();

  const initialPhone = user?.phone || '';
  const [name,        setName]        = useState(user?.name  || '');
  const [email,       setEmail]       = useState(user?.email || '');
  const [phone,       setPhone]       = useState(initialPhone);
  const [profilePhoto,setProfilePhoto]= useState(user?.avatar || '');
  const [showPhotoMenu,setShowPhotoMenu]= useState(false);
  const [pendingImage,setPendingImage]= useState<string | null>(null);

  // Password
  const [showPwdSection,  setShowPwdSection]  = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd,         setShowPwd]         = useState({ current: false, new: false, confirm: false });

  // OTP
  const [otpSent,    setOtpSent]    = useState(false);
  const [inputOtp,   setInputOtp]   = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);

  const [saving, setSaving] = useState(false);

  const isPhoneChanged    = phone.replace(/\D/g, '') !== initialPhone.replace(/\D/g, '');
  const isPhoneValid      = /^[6-9]\d{9}$/.test(phone.trim().replace(/\D/g, ''));
  const isPasswordChanged = showPwdSection && !!newPassword;
  const isProfileChanged  = (isPhoneChanged && isPhoneValid) || isPasswordChanged;

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Please upload a valid image file', 'error'); return; }
    const reader = new FileReader();
    reader.onload = ev => setPendingImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = (croppedBase64: string) => {
    setProfilePhoto(croppedBase64);
    updateUserProfile({ avatar: croppedBase64 });
    showToast('Profile photo updated.', 'success');
    setPendingImage(null);
  };

  const handleSendOtp = async () => {
    if (isPasswordChanged) {
      if (!currentPassword) { showToast('Enter your current password first.', 'error'); return; }
      if (!newPassword || newPassword.length < 4) { showToast('New password must be at least 4 characters.', 'error'); return; }
      if (newPassword !== confirmPassword) { showToast('Passwords do not match.', 'error'); return; }
    }
    const recipient = isPhoneChanged ? phone.trim() : initialPhone.trim();
    const cleanPhone = recipient.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      showToast('WhatsApp number must be exactly 10 digits.', 'error');
      return;
    }
    setSendingOtp(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res  = await fetch(`${API_BASE}/school-profile/send-otp`, { method: 'POST', headers, body: JSON.stringify({ phone: recipient }) });
      const data = await res.json();
      setOtpSent(true);
      if (data.success) showToast(`WhatsApp OTP sent to ${recipient}${data.otpCode ? ` (Code: ${data.otpCode})` : ''}.`, 'success');
      else showToast(data.message || 'Failed to send OTP.', 'error');
    } catch {
      setOtpSent(true);
      showToast('OTP simulation activated.', 'success');
    } finally { setSendingOtp(false); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (showPwdSection) {
      if (!currentPassword) { showToast('Enter current password.', 'error'); return; }
      if (!newPassword || newPassword.length < 4) { showToast('New password must be ≥ 4 chars.', 'error'); return; }
      if (newPassword !== confirmPassword) { showToast('Passwords do not match.', 'error'); return; }
    }
    if (isProfileChanged) {
      if (!otpSent) { showToast('Request a WhatsApp OTP to verify sensitive changes.', 'error'); return; }
      if (!inputOtp.trim() || inputOtp.trim().length !== 6) { showToast('Enter the 6-digit OTP.', 'error'); return; }
    }
    setSaving(true);
    const res = await updateAdminProfile({
      name, email, phone, profilePhoto,
      newPassword:     (showPwdSection && newPassword)     ? newPassword     : undefined,
      currentPassword: (showPwdSection && currentPassword) ? currentPassword : undefined,
      otpCode: isProfileChanged ? inputOtp.trim() : undefined,
    });
    setSaving(false);
    if (res.success) {
      showToast('Profile updated successfully!', 'success');
      updateUserProfile({ name, avatar: profilePhoto, email, phone });
      setNewPassword(''); setConfirmPassword(''); setCurrentPassword('');
      setShowPwdSection(false); setOtpSent(false); setInputOtp('');
    } else {
      showToast(res.message || 'Failed to update profile.', 'error');
    }
  };

  // ─── Avatar initials ───────────────────────────────────────────────────────
  const initials = (name || '?').split(' ').map(n => n[0] || '').join('').toUpperCase().slice(0, 2);

  // ─── OTP box (reused for phone and password flows) ─────────────────────────
  const OtpBox = ({ recipient }: { recipient: string }) => {
    const cleanNumber = recipient.replace(/\D/g, '');
    const displayNum = cleanNumber.length === 10 ? `+91 ${cleanNumber.slice(0, 5)} ${cleanNumber.slice(5)}` : recipient;
    
    return (
      <div className="mt-2 p-4 rounded-lg border border-amber-200 bg-amber-50/50 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-1.5 bg-amber-100 rounded-md text-amber-700 flex-shrink-0">
            <Shield size={16} />
          </div>
          <div className="flex-1">
            <div className="text-xs font-bold text-slate-800">Verify WhatsApp Ownership</div>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              We need to send a secure One-Time Password (OTP) to <strong>{displayNum}</strong> via WhatsApp to confirm you own this number before saving your profile.
            </p>
            
            <div className="mt-4 flex flex-col gap-3">
              {!otpSent ? (
                <div>
                  <button type="button" onClick={handleSendOtp} disabled={sendingOtp}
                    className="inline-flex items-center gap-1.5 h-8.5 px-4 rounded-md bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold transition-colors disabled:opacity-60 shadow-sm">
                    {sendingOtp ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    {sendingOtp ? 'Requesting OTP…' : 'Send OTP via WhatsApp'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Enter 6-Digit Security Code:
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="text" maxLength={6} autoFocus placeholder="· · · · · ·"
                      className="h-9.5 w-36 px-3 border-2 border-amber-300 rounded-md text-sm font-bold text-slate-900 bg-white outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 text-center tracking-[0.3em] font-[inherit]"
                      value={inputOtp} onChange={e => setInputOtp(e.target.value.replace(/\D/g, ''))} />
                    
                    <button type="button" onClick={handleSendOtp} disabled={sendingOtp}
                      className="inline-flex items-center gap-1 h-8.5 px-3 rounded-md border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-600 text-xs font-bold transition-colors disabled:opacity-50">
                      {sendingOtp ? <Loader2 size={11} className="animate-spin" /> : 'Resend Code'}
                    </button>
                  </div>
                  
                  {inputOtp.length === 6 ? (
                    <div className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1 animate-pulse">
                      ✓ OTP entered. Now click "Save Profile Changes" at the bottom to apply changes.
                    </div>
                  ) : (
                    <div className="text-[10px] text-amber-700 font-medium mt-1">
                      📩 Check your WhatsApp. If you don't receive it, click "Resend Code".
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl flex flex-col gap-5 font-sans text-slate-900">
      {/* Page heading */}
      <div>
        <h1 className="text-[22px] font-extrabold text-slate-900 tracking-tight">My Profile</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your personal information and account security.</p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        {/* ── Profile Identity card ──────────────────────────────────────── */}
        <SectionCard>
          {/* Avatar + name banner */}
          <div className="flex items-center gap-5 px-5 py-5 border-b border-slate-100">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div
                className="w-16 h-16 rounded-full border-2 border-slate-200 overflow-hidden cursor-pointer bg-violet-100 flex items-center justify-center text-xl font-bold text-violet-700"
                onClick={() => setShowPhotoMenu(m => !m)}>
                {profilePhoto
                  ? <img src={profilePhoto} alt="Avatar" className="w-full h-full object-cover" />
                  : initials}
              </div>
              {/* Camera overlay */}
              <div
                className="absolute inset-0 rounded-full bg-slate-900/50 flex flex-col items-center justify-center gap-0.5 opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                onClick={() => setShowPhotoMenu(m => !m)}>
                <Camera size={14} className="text-white" />
                <span className="text-[9px] font-bold text-white">EDIT</span>
              </div>
              {/* Photo dropdown */}
              {showPhotoMenu && (
                <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-20 min-w-[140px]"
                  onClick={e => e.stopPropagation()}>
                  <label className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                    <Camera size={13} className="text-slate-400" /> Upload Photo
                    <input type="file" accept="image/*" className="hidden" onChange={e => { handlePhotoUpload(e); setShowPhotoMenu(false); }} />
                  </label>
                  {profilePhoto && (
                    <button type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      onClick={() => { setProfilePhoto(''); updateUserProfile({ avatar: '' }); showToast('Photo removed.'); setShowPhotoMenu(false); }}>
                      <Trash2 size={13} /> Remove Photo
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Name + role */}
            <div>
              <div className="text-lg font-bold text-slate-900">{name || 'Admin User'}</div>
              <div className="flex items-center gap-1.5 mt-1">
                <Shield size={12} className="text-violet-500" />
                <span className="text-xs font-semibold text-violet-700">Super Administrator</span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{email}</div>
            </div>
          </div>

          {/* Personal info fields */}
          <SectionHead title="Personal Information" icon={User} />
          <div className="p-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Full Name</label>
              <input type="text" className={inputCls} required value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Email Address</label>
              <input type="email" className={inputCls} required value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className={labelCls}>Registered WhatsApp Number</label>
              <input type="text" className={cn(inputCls, 'max-w-[300px]',
                isPhoneChanged && !isPhoneValid ? 'border-red-300 focus:border-red-500 focus:ring-red-100 bg-red-50/10' :
                isPhoneChanged && isPhoneValid ? 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-100 bg-emerald-50/10' : ''
              )} required value={phone} onChange={e => {
                setPhone(e.target.value);
                setOtpSent(false);
                setInputOtp('');
              }} placeholder="e.g. 9876543210" />
              {isPhoneChanged && (
                <div className="mt-1">
                  {!isPhoneValid ? (
                    <span className="text-xs text-red-500 font-medium">
                      ⚠️ Must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.
                    </span>
                  ) : (
                    <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                      ✓ Valid Indian mobile number format. Please send and enter OTP verification code below.
                    </span>
                  )}
                </div>
              )}
            </div>
            {isPhoneChanged && isPhoneValid && <div className="sm:col-span-2"><OtpBox recipient={phone} /></div>}
          </div>
        </SectionCard>

        {/* ── Security / Password card ──────────────────────────────────── */}
        <SectionCard>
          <SectionHead
            title="Change Account Password"
            subtitle="Enable to update your administrative access password."
            icon={Key}
            action={
              <label className="flex items-center cursor-pointer">
                <div className="relative">
                  <input type="checkbox" className="sr-only peer"
                    checked={showPwdSection}
                    onChange={e => {
                      setShowPwdSection(e.target.checked);
                      if (!e.target.checked) { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }
                    }} />
                  <div className="w-9 h-5 rounded-full bg-slate-200 peer-checked:bg-violet-600 transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                </div>
              </label>
            }
          />
          {showPwdSection && (
            <div className="p-5 grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-slate-100">
              {/* Current */}
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Current Password</label>
                <div className="relative">
                  <input type={showPwd.current ? 'text' : 'password'} className={cn(inputCls, 'pr-10')} required={showPwdSection}
                    placeholder="Enter current password…" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    onClick={() => setShowPwd(p => ({ ...p, current: !p.current }))}>
                    {showPwd.current ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              {/* New */}
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>New Password</label>
                <div className="relative">
                  <input type={showPwd.new ? 'text' : 'password'} className={cn(inputCls, 'pr-10')} required={showPwdSection}
                    placeholder="Min 4 characters…" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    onClick={() => setShowPwd(p => ({ ...p, new: !p.new }))}>
                    {showPwd.new ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              {/* Confirm */}
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Confirm New Password</label>
                <div className="relative">
                  <input type={showPwd.confirm ? 'text' : 'password'} className={cn(inputCls, 'pr-10')} required={showPwdSection}
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
              {/* OTP box for password change */}
              {isPasswordChanged && <div className="sm:col-span-2"><OtpBox recipient={initialPhone} /></div>}
            </div>
          )}
        </SectionCard>

        {/* ── Save bar ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><Save size={13} /> Save Profile Changes</>}
          </Button>
        </div>
      </form>

      {/* Image cropper overlay */}
      {pendingImage && (
        <ImageCropper
          imageSrc={pendingImage}
          onConfirm={handleCropConfirm}
          onClose={() => setPendingImage(null)}
          onSelectNewFile={handlePhotoUpload}
        />
      )}
    </div>
  );
}
