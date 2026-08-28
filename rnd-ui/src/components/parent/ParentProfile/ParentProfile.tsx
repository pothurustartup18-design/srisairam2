import React, { useMemo } from 'react';
import { Bus, Car, TrendingUp, CalendarDays, UserCheck, Phone, Mail } from 'lucide-react';
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
  if (!ward) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <EmptyState title={`Student record not found for admission number: ${user.admissionNo}`} />
      </div>
    );
  }

  const feePaidPct = Math.min(100, Math.round((ward.feePaid / ((ward.feePaid + ward.feePending) || 1)) * 100));
  const [bg, fg] = getAvatarColors(ward.name);
  const visibleEvents = events.filter((ev) => ev.sendAlertsTo !== 'teachers').slice(0, 4);
  const progressColor = feePaidPct === 100 ? '#10b981' : feePaidPct >= 70 ? '#3b82f6' : feePaidPct >= 40 ? '#f59e0b' : '#ef4444';

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
      {/* Page title */}
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Child Overview</h1>
        <p className="text-xs text-slate-500 mt-0.5">Academic profile, class teacher contact, and fee overview for your ward.</p>
      </div>

      {/* Student Card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400" />

        {/* Student info row */}
        <div className="px-4 py-3 flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-extrabold flex-shrink-0"
            style={{ background: bg, color: fg }}
          >
            {getInitials(ward.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-900 truncate">{ward.name}</div>
            <div className="text-xs text-slate-500 truncate">
              {ward.admissionNo} · {formatClassName(ward.class, ward.section)}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5">
              <UserCheck size={10} /> {classTeacherName}
              {teacherPhone && (
                <a href={`tel:${teacherPhone}`} className="text-emerald-700 font-bold hover:underline ml-0.5">
                  · {teacherPhone}
                </a>
              )}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 rounded-full px-2 py-0.5">
              {ward.transportMode === 'school' ? <><Bus size={10} /> Bus</> : <><Car size={10} /> Private</>}
            </span>
          </div>
        </div>

        {/* Class Teacher contact banner */}
        <div className="px-4 py-2.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <UserCheck size={14} className="text-indigo-600 flex-shrink-0" />
            <span className="font-semibold text-slate-700">Class Teacher:</span>
            <span className="font-bold text-slate-900">{classTeacherName}</span>
            {teacherPhone && (
              <a
                href={`tel:${teacherPhone}`}
                className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.2 hover:bg-emerald-100 transition-colors"
              >
                <Phone size={10} className="text-emerald-600" /> {teacherPhone}
              </a>
            )}
          </div>
          <div className="flex items-center gap-3">
            {teacherEmail && (
              <span className="flex items-center gap-1 text-slate-500">
                <Mail size={11} className="text-indigo-500" /> {teacherEmail}
              </span>
            )}
          </div>
        </div>

        {/* Fee stats */}
        <div className="grid grid-cols-3 border-t border-slate-100 divide-x divide-slate-100">
          {[
            { label: 'Books Fee', value: `₹${(ward.booksFee || 0).toLocaleString()}`, cls: 'text-blue-600' },
            { label: 'Fee Paid', value: `₹${ward.feePaid.toLocaleString()}`, cls: 'text-emerald-600' },
            {
              label: 'Pending',
              value: ward.feePending > 0 ? `₹${ward.feePending.toLocaleString()}` : 'Cleared ✓',
              cls: ward.feePending > 0 ? 'text-red-600' : 'text-emerald-600',
            },
          ].map((item) => (
            <div key={item.label} className="px-4 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{item.label}</div>
              <div className={cn('text-sm font-extrabold mt-0.5', item.cls)}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="px-4 pb-3 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="font-semibold text-slate-500 flex items-center gap-1">
              <TrendingUp size={10} className="text-slate-400" /> Fee Payment Progress
            </span>
            <span className="font-bold" style={{ color: progressColor }}>{feePaidPct}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${feePaidPct}%`, background: progressColor }}
            />
          </div>
        </div>
      </div>

      {/* Upcoming Events */}
      {visibleEvents.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
            <CalendarDays size={13} className="text-slate-400" />
            <span className="text-xs font-bold text-slate-700">Upcoming Events</span>
            <span className="ml-auto text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
              {visibleEvents.length}
            </span>
          </div>
          <div className="divide-y divide-slate-50">
            {visibleEvents.map((ev) => (
              <div key={ev._id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                <span className="flex-1 text-xs font-semibold text-slate-800 truncate">{ev.title}</span>
                <span className="text-[10px] text-slate-400 flex-shrink-0">
                  {new Date(ev.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentProfile;
