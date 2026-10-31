import React, { useMemo } from 'react';
import {
  Bus,
  Car,
  TrendingUp,
  Phone,
  Mail,
  CreditCard,
  GraduationCap,
  Calendar,
} from 'lucide-react';
import type { StudentData, TeacherData, EventData, UserProfile } from '../../../types';
import { formatClassName } from '../../../constants';
import { cn } from '../../../lib/utils';
import { getAvatarColors, getInitials } from '../../../utils/avatar';
import { EmptyState } from '../../ui';

interface ParentProfileProps {
  ward: StudentData | undefined;
  user: UserProfile;
  teachers?: TeacherData[];
  events: EventData[];
}

const ParentProfile: React.FC<ParentProfileProps> = ({ ward, user, teachers = [], events }) => {
  // Before the early return so hooks run in the same order every render
  const classTeacher = useMemo(() => {
    if (!ward) return null;
    const room = `${ward.class}-${ward.section}`;
    let teacher = teachers.find(
      (t) => (t._id && t._id === ward.classTeacher) || (t._id && (ward.classTeacher as any)?._id === t._id)
    );
    if (!teacher) {
      teacher = teachers.find((t) => t.classTeacherOf === room);
    }
    if (!teacher && typeof ward.classTeacher === 'string') {
      teacher = teachers.find((t) => t.name.toLowerCase() === (ward.classTeacher as string).toLowerCase());
    }
    return teacher;
  }, [ward, teachers]);

  if (!ward) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-card">
        <EmptyState title={`Student record not found for admission number: ${user.admissionNo}`} />
      </div>
    );
  }

  const totalFee = ward.totalFee || ward.feePaid + ward.feePending || 0;
  const feePaidPct = totalFee > 0 ? Math.min(100, Math.round((ward.feePaid / totalFee) * 100)) : 100;
  const [bg, fg] = getAvatarColors(ward.name);
  const visibleEvents = events.filter((ev) => ev.sendAlertsTo !== 'teachers').slice(0, 4);
  const isFeeCleared = ward.feePending <= 0;


  const classTeacherName =
    classTeacher?.name ||
    (typeof ward.classTeacher === 'string'
      ? ward.classTeacher
      : (ward.classTeacher as any)?.name) ||
    'Class Teacher';
  const teacherPhone =
    ward.classTeacherPhone ||
    classTeacher?.phone ||
    (typeof ward.classTeacher === 'object' ? ward.classTeacher?.phone : undefined);
  const teacherEmail =
    ward.classTeacherEmail ||
    classTeacher?.email ||
    (typeof ward.classTeacher === 'object' ? ward.classTeacher?.email : undefined);

  return (
    <div className="flex flex-col gap-4 font-sans text-slate-900">
      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE-ONLY: Child Profile (<768px)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="md:hidden parent-mobile-container">
        {/* ── 1. Mobile Identity Hero ── */}
        <div className="ph-hero-card">
          <div className="ph-hero-top">
            <div className="ph-hero-identity">
              <div className="ph-date-pill">
                <GraduationCap size={12} className="shrink-0 text-blue-500" />
                <span>Student Profile</span>
              </div>
              <h2 className="ph-student-name">{ward.name}</h2>
              <div className="ph-role-subtitle">
                <span className="ph-role-tag">
                  {formatClassName(ward.class, ward.section)}
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  Adm: {ward.admissionNo}
                </span>
              </div>
            </div>

            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-extrabold flex-shrink-0 shadow-sm"
              style={{ background: bg, color: fg }}
            >
              {getInitials(ward.name)}
            </div>
          </div>
        </div>

        {/* ── 2. Academic & Registration Details ── */}
        <div className="flex flex-col gap-2">
          <div className="mobile-section-header">
            <span className="mobile-section-title">Academic &amp; School Info</span>
          </div>

          <div className="ph-list-row flex-col !items-stretch gap-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Class &amp; Section
                </span>
                <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  {formatClassName(ward.class, ward.section)}
                </span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Roll Number
                </span>
                <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  {ward.rollNumber || 'Not Assigned'}
                </span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-100 dark:border-slate-700/60 col-span-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Transport Facility
                </span>
                <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100 text-sm">
                  {ward.transportMode === 'school' ? (
                    <>
                      <Bus size={15} className="text-blue-600" />
                      <span>School Bus Transport</span>
                    </>
                  ) : (
                    <>
                      <Car size={15} className="text-slate-600" />
                      <span>Self / Private Transport</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 3. Guardian & Contact Info ── */}
        <div className="flex flex-col gap-2">
          <div className="mobile-section-header">
            <span className="mobile-section-title">Guardian Contacts</span>
          </div>

          <div className="ph-list-row flex-col !items-stretch gap-3">
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
                  <Phone size={14} />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Primary Contact</span>
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate block">
                    {ward.whatsappNo || 'Not Provided'}
                  </span>
                </div>
              </div>
              {ward.whatsappNo && (
                <a
                  href={`tel:${ward.whatsappNo}`}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold shrink-0"
                >
                  Call
                </a>
              )}
            </div>

            {ward.motherWhatsappNo && (
              <div className="flex items-center justify-between py-1 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                    <Phone size={14} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Secondary Contact</span>
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate block">
                      {ward.motherWhatsappNo}
                    </span>
                  </div>
                </div>
                <a
                  href={`tel:${ward.motherWhatsappNo}`}
                  className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold shrink-0"
                >
                  Call
                </a>
              </div>
            )}
          </div>
        </div>

        {/* ── 4. Assigned Class Teacher Card ── */}
        <div className="flex flex-col gap-2">
          <div className="mobile-section-header">
            <span className="mobile-section-title">Class Teacher</span>
          </div>

          <div className="ph-teacher-card">
            <div className="ph-teacher-avatar">
              {getInitials(classTeacherName)}
            </div>
            <div className="ph-teacher-meta">
              <span className="ph-teacher-name">{classTeacherName}</span>
              <span className="ph-teacher-role">Class Teacher · {formatClassName(ward.class, ward.section)}</span>
            </div>
            {teacherPhone && (
              <a
                href={`tel:${teacherPhone}`}
                className="ph-teacher-btn"
                aria-label="Call Class Teacher"
              >
                <Phone size={14} />
                <span>Call</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DESKTOP-ONLY: Full Grid View (md+)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex flex-col gap-5">
        {/* ─── PAGE HEADER (Matches Admin Style) ─── */}
        <div className="flex items-start justify-between gap-4 flex-wrap bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-card">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 m-0">Student Profile &amp; Overview</h2>
            <p className="text-sm text-slate-500 mt-1">
              Complete academic registration details, guardian information, and official records for {ward.name}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100 rounded-lg px-3 py-1.5">
              <GraduationCap size={14} /> {formatClassName(ward.class, ward.section)}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5">
              {ward.transportMode === 'school' ? <><Bus size={13} /> School Bus</> : <><Car size={13} /> Private Transport</>}
            </span>
          </div>
        </div>

        {/* ─── 2-COLUMN BALANCED LAYOUT ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
          {/* ─── LEFT COLUMN: Student Details & Info Card ─── */}
          <div className="flex flex-col gap-5">
            {/* Identity & Bio Card */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-card overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-extrabold flex-shrink-0 shadow-xs"
                  style={{ background: bg, color: fg }}
                >
                  {getInitials(ward.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-bold text-slate-900 truncate">{ward.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Admission No: <strong className="text-slate-800">{ward.admissionNo}</strong> · Roll Number: <strong className="text-slate-800">{ward.rollNumber || 'N/A'}</strong>
                  </div>
                </div>
              </div>

              {/* Structured Info Grid */}
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Academic Class</span>
                  <span className="font-bold text-slate-900 text-sm">{formatClassName(ward.class, ward.section)}</span>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Transport Facility</span>
                  <span className="font-bold text-slate-900 text-sm capitalize">{ward.transportMode || 'Self / Private'}</span>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Primary WhatsApp Contact</span>
                  <span className="font-bold text-slate-900 text-sm">{ward.whatsappNo || 'Not Provided'}</span>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Secondary Contact</span>
                  <span className="font-bold text-slate-900 text-sm">{ward.motherWhatsappNo || 'Not Provided'}</span>
                </div>
              </div>
            </div>

            {/* Fee Overview Card */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-card p-5">
              <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <CreditCard size={16} className="text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900 m-0">Term Fee Overview</h3>
                </div>
                <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', isFeeCleared ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
                  {isFeeCleared ? '✓ Cleared' : 'Pending Payment'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 my-4">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Fee</div>
                  <div className="text-base font-extrabold text-slate-900 mt-0.5">₹{totalFee.toLocaleString()}</div>
                </div>
                <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Fee Paid</div>
                  <div className="text-base font-extrabold text-emerald-700 mt-0.5">₹{ward.feePaid.toLocaleString()}</div>
                </div>
                <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-100 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Balance Due</div>
                  <div className="text-base font-extrabold text-rose-700 mt-0.5">
                    {isFeeCleared ? '₹0' : `₹${ward.feePending.toLocaleString()}`}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="pt-2">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-600 flex items-center gap-1">
                    <TrendingUp size={12} className="text-slate-400" /> Payment Completion
                  </span>
                  <span className="font-bold text-slate-900">{feePaidPct}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-700',
                      feePaidPct === 100 ? 'bg-emerald-500' : feePaidPct >= 50 ? 'bg-blue-600' : 'bg-amber-500'
                    )}
                    style={{ width: `${feePaidPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ─── RIGHT COLUMN: Faculty Support & Upcoming Dates ─── */}
          <div className="flex flex-col gap-5">
            {/* Class Teacher Card */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-card p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                Assigned Faculty
              </div>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {getInitials(classTeacherName)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900">{classTeacherName}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Class Teacher · {formatClassName(ward.class, ward.section)}</div>
                </div>
              </div>
              {(teacherPhone || teacherEmail) && (
                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2 text-xs text-slate-600">
                  {teacherPhone && (
                    <div className="flex items-center gap-2">
                      <Phone size={13} className="text-slate-400" />
                      <span>{teacherPhone}</span>
                    </div>
                  )}
                  {teacherEmail && (
                    <div className="flex items-center gap-2">
                      <Mail size={13} className="text-slate-400" />
                      <span className="truncate">{teacherEmail}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParentProfile;
