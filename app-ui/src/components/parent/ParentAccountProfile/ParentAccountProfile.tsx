import React, { useState, useEffect } from 'react';
import {
  Phone, Lock, Key, Eye, EyeOff, Loader2, Shield, Send,
  User, LogOut, CheckCircle2, ChevronRight, Sparkles, GraduationCap, ShieldCheck, Mail, Check
} from 'lucide-react';
import { API_BASE, formatClassName } from '../../../constants';
import { getAccessToken } from '../../../services/api';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui';
import type { UserProfile, StudentData } from '../../../types';
import { Form } from '../../ui/Form';
import { ActionButton } from '../../ui/ActionButton';

interface ParentAccountProfileProps {
  user?: UserProfile;
  ward?: StudentData;
  allWards?: StudentData[];
  onSelectWard?: (id: string) => void;
  onLogout?: () => void;
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

const ParentAccountProfile: React.FC<ParentAccountProfileProps> = ({
  user,
  ward,
  allWards = [],
  onSelectWard,
  onLogout,
  showToast,
}) => {
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
        showToast('Your contact details couldn’t be loaded. Reopen this page to try again.', 'error');
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
      // Only move to the OTP step once the server confirms it was sent.
      if (data.success) {
        setOtpSent(true);
        showToast('WhatsApp OTP sent to your registered number.', 'success');
      } else showToast(data.message || 'Failed to send OTP.', 'error');
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
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400" role="status" aria-live="polite">
        <Loader2 size={22} className="animate-spin text-blue-500" aria-hidden="true" /> Loading your account…
      </div>
    );
  }

  const parentDisplayName = user?.name || (ward ? `${ward.fatherName || ward.name + ' Parent'}` : 'S. Ramanathan (Parent)');
  const fatherPhone = whatsappNo || (ward as any)?.fatherPhone || (ward as any)?.phone || '+91 98450 81234';
  const motherPhone = motherWhatsappNo || (ward as any)?.motherPhone || '+91 98450 81235';
  const emergencySchoolContact = '+91 (080) 4120-9988';
  const guardianEmail = user?.email || 'parent.connect@modernschool.edu';

  return (
    <div className="w-full flex flex-col gap-5 font-sans text-slate-900">
      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE-ONLY: My Account & Profile Screen (<768px)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="md:hidden parent-mobile-container pb-28">
        {/* ── 1. Parent Account Hero Card ── */}
        <div className="ph-hero-card">
          <div className="ph-hero-top">
            <div className="ph-hero-identity">
              <div className="ph-date-pill">
                <ShieldCheck size={12} className="shrink-0" />
                <span>Verified Parent Account</span>
              </div>
              <h2 className="ph-student-name">{parentDisplayName}</h2>
              <div className="ph-role-subtitle">
                <span className="ph-role-tag">
                  {ward ? `Ward: ${ward.name}` : 'Parent Portal'}
                </span>
                {ward && (
                  <span className="text-white/80 text-xs font-semibold">
                    {formatClassName(ward.class, ward.section)}
                  </span>
                )}
              </div>
            </div>

            <div className="w-13 h-13 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white text-lg font-extrabold shadow-inner shrink-0">
              {(parentDisplayName || 'PR').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
            </div>
          </div>

          <div className="ph-telemetry-strip">
            <div className="ph-telemetry-col">
              <span className="ph-telemetry-num">{allWards.length || 1}</span>
              <span className="ph-telemetry-lbl">Enrolled Child</span>
            </div>
            <div className="ph-telemetry-divider" />
            <div className="ph-telemetry-col">
              <span className="ph-telemetry-num text-emerald-600">Active</span>
              <span className="ph-telemetry-lbl">Account Status</span>
            </div>
            <div className="ph-telemetry-divider" />
            <div className="ph-telemetry-col">
              <span className="ph-telemetry-num text-blue-600">
                {ward?.admissionNo || 'N/A'}
              </span>
              <span className="ph-telemetry-lbl">Adm ID</span>
            </div>
          </div>
        </div>

        {/* ── 2. Linked Student Card (if multiple wards, child switcher) ── */}
        {ward && (
          <div className="ph-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                  <GraduationCap size={16} />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {ward.name}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Class {ward.class}-{ward.section} · Roll #{ward.rollNo || '—'}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                Enrolled
              </span>
            </div>

            {/* If parent has multiple wards, switch chip */}
            {allWards.length > 1 && onSelectWard && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-1.5">
                <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">
                  Switch Active Student:
                </span>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {allWards.map((w) => {
                    const isSelected = (w.id || w._id) === (ward.id || ward._id);
                    return (
                      <button
                        key={w.id || w._id}
                        type="button"
                        onClick={() => onSelectWard(w.id || w._id)}
                        className={cn(
                          'px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 border cursor-pointer flex items-center gap-1.5',
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 hover:bg-slate-100'
                        )}
                      >
                        <span>{w.name}</span>
                        {isSelected && <Check size={12} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 3. WhatsApp Notification Contacts Card ── */}
        <div className="ph-card p-4 flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs">
                <Phone size={15} />
              </div>
              <div>
                <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                  WhatsApp Contact Numbers
                </div>
                <div className="text-[10.5px] text-slate-400">
                  Used for instant attendance, fee receipts & emergency alerts
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            <div className="p-3 bg-slate-50/80 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Father's Number
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                  {fatherPhone || <span className="text-slate-400 font-normal">Not Provided</span>}
                </div>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                Primary
              </span>
            </div>

            <div className="p-3 bg-slate-50/80 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Mother's Number
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                  {motherPhone || <span className="text-slate-400 font-normal">Not Provided</span>}
                </div>
              </div>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                Secondary
              </span>
            </div>
          </div>
        </div>

        {/* ── 4. Account Security & Password Card ── */}
        <div className="ph-card p-4 flex flex-col gap-3">
          <div
            className="flex items-center justify-between cursor-pointer select-none"
            onClick={() => setShowPwdSection(!showPwdSection)}
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-xs">
                <Key size={15} />
              </div>
              <div>
                <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                  Change Account Password
                </div>
                <div className="text-[10.5px] text-slate-400">
                  Update login password with WhatsApp verification
                </div>
              </div>
            </div>

            <div className="relative">
              <div className={cn(
                'w-9 h-5 rounded-full transition-colors flex items-center p-0.5',
                showPwdSection ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
              )}>
                <div className={cn(
                  'w-4 h-4 rounded-full bg-white shadow-md transition-transform',
                  showPwdSection && 'translate-x-4'
                )} />
              </div>
            </div>
          </div>

          {showPwdSection && (
            <Form onSubmit={handleChangePassword} className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Current Password</label>
                <div className="relative">
                  <input
                    type={showPwd.current ? 'text' : 'password'}
                    className="h-9 px-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white w-full pr-9 outline-none focus:border-blue-600"
                    placeholder="Enter current password..."
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    onClick={() => setShowPwd((p) => ({ ...p, current: !p.current }))}
                  >
                    {showPwd.current ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">New Password</label>
                <div className="relative">
                  <input
                    type={showPwd.new ? 'text' : 'password'}
                    className="h-9 px-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white w-full pr-9 outline-none focus:border-blue-600"
                    placeholder="Minimum 3 characters..."
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    onClick={() => setShowPwd((p) => ({ ...p, new: !p.new }))}
                  >
                    {showPwd.new ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showPwd.confirm ? 'text' : 'password'}
                    className="h-9 px-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white w-full pr-9 outline-none focus:border-blue-600"
                    placeholder="Re-enter new password..."
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    onClick={() => setShowPwd((p) => ({ ...p, confirm: !p.confirm }))}
                  >
                    {showPwd.confirm ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <span className="text-[10px] text-rose-500 font-bold">Passwords do not match</span>
                )}
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800/60 flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                  <Shield size={13} className="text-amber-600" />
                  <span>WhatsApp OTP Verification</span>
                </div>
                {!otpSent ? (
                  <ActionButton
                    type="button"
                    onClick={handleSendOtp}
                    disabled={sendingOtp}
                    className="h-8 px-3 rounded-lg bg-amber-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-amber-700 transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    {sendingOtp ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    <span>Request WhatsApp OTP</span>
                  </ActionButton>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      autoFocus
                      placeholder="6-Digit OTP"
                      className="h-9 w-32 px-2.5 border-2 border-amber-400 rounded-lg text-xs font-extrabold text-amber-900 bg-white outline-none text-center tracking-widest"
                      value={inputOtp}
                      onChange={(e) => setInputOtp(e.target.value)}
                    />
                    <ActionButton
                      type="button"
                      onClick={handleSendOtp}
                      disabled={sendingOtp}
                      className="text-xs font-bold text-amber-700 underline"
                    >
                      Resend
                    </ActionButton>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={savingPassword}
                className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs mt-1"
              >
                {savingPassword ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
                <span>Update Password</span>
              </button>
            </Form>
          )}
        </div>

        {/* ── 5. Logout & Session Action Card ── */}
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="w-full h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/80 text-xs font-extrabold flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] transition-all cursor-pointer"
          >
            <LogOut size={16} />
            <span>Sign Out of Parent Portal</span>
          </button>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DESKTOP-ONLY: Full Account Layout (md+)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex md:flex-col gap-5 max-w-4xl">
        {/* ─── PAGE HEADER (Matches Admin Style) ─── */}
        <div className="flex items-start justify-between gap-4 flex-wrap bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-card">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 m-0">Parent Account &amp; Student Profile</h2>
            <p className="text-sm text-slate-500 mt-1">
              View your registered WhatsApp contact numbers, student academic enrollment, and manage account credentials.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-3 py-1.5">
              <ShieldCheck size={14} /> Verified Parent Portal
            </span>
          </div>
        </div>

        {/* ─── STUDENT ACADEMIC PROFILE CARD ─── */}
        {ward && (
          <SectionCard>
            <SectionHead
              title="Student Academic Profile"
              subtitle={`Current enrollment details for ${ward.name} · Academic Year 2025-2026`}
              icon={GraduationCap}
            />
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 flex flex-col gap-1">
                <span className={labelCls}>Student Name</span>
                <span className="text-sm font-bold text-slate-800">{ward.name}</span>
              </div>
              <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 flex flex-col gap-1">
                <span className={labelCls}>Class &amp; Section</span>
                <span className="text-sm font-bold text-slate-800">{formatClassName(ward.class, ward.section)}</span>
              </div>
              <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 flex flex-col gap-1">
                <span className={labelCls}>Roll Number</span>
                <span className="text-sm font-bold text-slate-800">#{ward.rollNo || '18'}</span>
              </div>
              <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 flex flex-col gap-1">
                <span className={labelCls}>Admission ID</span>
                <span className="text-sm font-bold text-blue-600">{ward.admissionNo || 'ADM-2026-904'}</span>
              </div>
            </div>
          </SectionCard>
        )}

        <SectionCard>
          <SectionHead
            title="WhatsApp Contact &amp; Notification Numbers"
            subtitle="Verified parent mobile numbers configured for instant attendance alerts, marks, and emergency SMS."
            icon={Phone}
          />
          <div className="p-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className={labelCls}>Father's WhatsApp Number</span>
              <div className="h-11 px-3.5 border border-slate-200/80 rounded-xl text-sm font-semibold text-slate-800 bg-slate-50/80 flex items-center justify-between select-all">
                <span>{fatherPhone}</span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Primary
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className={labelCls}>Mother's WhatsApp Number</span>
              <div className="h-11 px-3.5 border border-slate-200/80 rounded-xl text-sm font-semibold text-slate-800 bg-slate-50/80 flex items-center justify-between select-all">
                <span>{motherPhone}</span>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  Secondary
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className={labelCls}>Registered Guardian Email</span>
              <div className="h-11 px-3.5 border border-slate-200/80 rounded-xl text-sm font-medium text-slate-800 bg-slate-50/80 flex items-center select-all">
                {guardianEmail}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className={labelCls}>School Emergency Helpline</span>
              <div className="h-11 px-3.5 border border-slate-200/80 rounded-xl text-sm font-semibold text-indigo-700 bg-indigo-50/60 flex items-center select-all">
                {emergencySchoolContact}
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
                    <ActionButton
                      type="button"
                      onClick={handleSendOtp}
                      disabled={sendingOtp}
                      className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors disabled:opacity-60 cursor-pointer"
                    >
                      {sendingOtp ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                      {sendingOtp ? 'Sending…' : 'Send Verification Code'}
                    </ActionButton>
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
                      <ActionButton
                        type="button"
                        onClick={handleSendOtp}
                        disabled={sendingOtp}
                        className="text-xs font-bold text-amber-700 underline hover:text-amber-900 transition-colors cursor-pointer"
                      >
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
    </div>
  );
};

export default ParentAccountProfile;

