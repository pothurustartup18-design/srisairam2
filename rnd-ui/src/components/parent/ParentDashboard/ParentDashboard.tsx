import React, { useState, useEffect, useMemo } from 'react';
import {
  GraduationCap,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  UserCheck,
  ChevronDown,
  Sparkles,
  Calendar,
  MessageSquare,
  ChevronRight,
  Bus,
  Car,
  Phone,
  Mail,
} from 'lucide-react';
import type { StudentData, TeacherData, EventData, StudentExamResult, UserProfile, HomeworkData } from '../../../types';
import { API_BASE, formatClassName } from '../../../constants';
import { cn } from '../../../lib/utils';
import { getAvatarColors, getInitials } from '../../../utils/avatar';

interface AttendanceSummary {
  workingDays: number;
  presentDays: number;
  percentage: number;
}

interface ParentDashboardProps {
  ward: StudentData | undefined;
  allWards: StudentData[];
  onSelectWard: (wardId: string) => void;
  user: UserProfile;
  teachers?: TeacherData[];
  examResults: StudentExamResult[];
  events: EventData[];
  unreadMessagesCount: number;
  onNavigate: (view: string) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

const ParentDashboard: React.FC<ParentDashboardProps> = ({
  ward,
  allWards,
  onSelectWard,
  teachers = [],
  examResults,
  events,
  unreadMessagesCount,
  onNavigate,
}) => {
  // ─── Time-aware greeting ──────────────────────────────────────────────────
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  // ─── Attendance Fetching ──────────────────────────────────────────────────
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  useEffect(() => {
    if (!ward) return;
    const studentId = ward.id || ward._id;
    let isMounted = true;
    setAttendanceLoading(true);

    fetch(`${API_BASE}/attendance/summary/student/${studentId}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success && data.data) {
          setAttendance(data.data);
        }
      })
      .catch((err) => console.error('Failed to load attendance summary:', err))
      .finally(() => {
        if (isMounted) setAttendanceLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [ward]);

  // ─── Homework Fetching ────────────────────────────────────────────────────
  const [homeworkList, setHomeworkList] = useState<HomeworkData[]>([]);

  useEffect(() => {
    if (!ward) return;
    const classRoom = `${ward.class}-${ward.section}`;
    let isMounted = true;

    fetch(`${API_BASE}/homework/class/${encodeURIComponent(classRoom)}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setHomeworkList(data.data || []);
        }
      })
      .catch((err) => console.error('Failed to load homework:', err));

    return () => {
      isMounted = false;
    };
  }, [ward]);

  // ─── Homework Metrics ─────────────────────────────────────────────────────
  const homeworkMetrics = useMemo(() => {
    if (!ward) return { total: 0, pending: 0, overdue: 0, completed: 0, overdueItems: [] as HomeworkData[] };
    const wardId = ward.id || ward._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let completed = 0;
    let overdue = 0;
    let pending = 0;
    const overdueItems: HomeworkData[] = [];

    homeworkList.forEach((h) => {
      const isAcked = h.acknowledgements?.some((a) => a.student === wardId);
      const dueDate = new Date(h.dueDate);
      dueDate.setHours(23, 59, 59, 999);

      if (isAcked) {
        completed++;
      } else if (dueDate < today) {
        overdue++;
        overdueItems.push(h);
      } else {
        pending++;
      }
    });

    return { total: homeworkList.length, pending, overdue, completed, overdueItems };
  }, [homeworkList, ward]);

  // ─── Academic Performance Metrics ─────────────────────────────────────────
  const academicMetrics = useMemo(() => {
    if (!examResults || examResults.length === 0) {
      return { latestExam: null, latestPct: null, prevPct: null, diff: null, avgPct: null, subjectMarks: [] };
    }

    const sorted = [...examResults];
    const latest = sorted[sorted.length - 1];
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;

    const latestPct = latest.percentage;
    const prevPct = prev ? prev.percentage : null;
    const diff = prevPct !== null ? latestPct - prevPct : null;

    const totalPct = sorted.reduce((sum, e) => sum + e.percentage, 0);
    const avgPct = Math.round(totalPct / sorted.length);

    return {
      latestExam: latest,
      latestPct,
      prevPct,
      diff,
      avgPct,
      subjectMarks: latest.marks || [],
    };
  }, [examResults]);

  // ─── Fee Metrics ──────────────────────────────────────────────────────────
  const feeMetrics = useMemo(() => {
    if (!ward) return { total: 0, paid: 0, pending: 0, pct: 100, isCleared: true, nextDue: null };
    const total = ward.totalFee || ward.feePaid + ward.feePending || 0;
    const paid = ward.feePaid || 0;
    const pending = ward.feePending || 0;
    const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 100;
    const isCleared = pending <= 0;

    let nextDue: string | null = null;
    if (ward.installments && ward.installments.length > 0) {
      const unpaid = ward.installments.find((inst) => inst.status !== 'paid');
      if (unpaid) {
        nextDue = new Date(unpaid.dueDate).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        });
      }
    }

    return { total, paid, pending, pct, isCleared, nextDue };
  }, [ward]);

  // ─── Attendance Status Helper ─────────────────────────────────────────────
  const attendanceStatus = useMemo(() => {
    if (!attendance || attendance.workingDays === 0) return { label: 'No records', color: 'text-slate-400', bg: 'bg-slate-50 border-slate-200' };
    const pct = attendance.percentage;
    if (pct >= 90) return { label: 'Good', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200 text-emerald-700' };
    if (pct >= 75) return { label: 'Needs Attention', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200 text-amber-700' };
    return { label: 'Critical', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200 text-rose-700' };
  }, [attendance]);

  // ─── Upcoming Events & Dates ──────────────────────────────────────────────
  const upcomingEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return events
      .filter((ev) => {
        if (ev.sendAlertsTo === 'teachers') return false;
        const evDate = new Date(ev.date);
        return evDate >= today;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 4);
  }, [events]);

  // ─── "Needs Your Attention" Items ─────────────────────────────────────────
  const attentionItems = useMemo(() => {
    const items: Array<{
      id: string;
      type: 'overdue_homework' | 'pending_fee' | 'unread_messages' | 'low_attendance';
      priority: 'high' | 'medium' | 'info';
      title: string;
      subtitle: string;
      actionText: string;
      onAction: () => void;
      icon: React.ElementType;
      color: string;
    }> = [];

    // 1. Overdue homework
    if (homeworkMetrics.overdue > 0) {
      const firstOverdue = homeworkMetrics.overdueItems[0];
      items.push({
        id: 'hw_overdue',
        type: 'overdue_homework',
        priority: 'high',
        title: `${homeworkMetrics.overdue} Homework Assignment${homeworkMetrics.overdue > 1 ? 's' : ''} Overdue`,
        subtitle: firstOverdue
          ? `${firstOverdue.subject}: "${firstOverdue.title}" (Due ${new Date(firstOverdue.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})`
          : 'Requires submission / acknowledgment.',
        actionText: 'Review Homework',
        onAction: () => onNavigate('homework'),
        icon: AlertCircle,
        color: 'text-rose-600 bg-rose-50 border-rose-200',
      });
    }

    // 2. Pending Fee
    if (!feeMetrics.isCleared && feeMetrics.pending > 0) {
      items.push({
        id: 'fee_pending',
        type: 'pending_fee',
        priority: 'medium',
        title: `₹${feeMetrics.pending.toLocaleString()} Fee Payment Pending`,
        subtitle: feeMetrics.nextDue ? `Next installment scheduled for ${feeMetrics.nextDue}` : 'Outstanding balance for this academic term.',
        actionText: 'View Fee Details',
        onAction: () => onNavigate('fees'),
        icon: CreditCard,
        color: 'text-amber-700 bg-amber-50 border-amber-200',
      });
    }

    // 3. Unread messages
    if (unreadMessagesCount > 0) {
      items.push({
        id: 'unread_msg',
        type: 'unread_messages',
        priority: 'medium',
        title: `${unreadMessagesCount} Unread Message${unreadMessagesCount > 1 ? 's' : ''} from School`,
        subtitle: 'New communication from Administration or Class Teacher.',
        actionText: 'Read Messages',
        onAction: () => onNavigate('messages'),
        icon: MessageSquare,
        color: 'text-indigo-700 bg-indigo-50 border-indigo-200',
      });
    }

    // 4. Low attendance warning
    if (attendance && attendance.workingDays >= 5 && attendance.percentage < 75) {
      items.push({
        id: 'low_att',
        type: 'low_attendance',
        priority: 'high',
        title: `Attendance is below minimum threshold (${attendance.percentage}%)`,
        subtitle: `${attendance.presentDays} of ${attendance.workingDays} working days attended. School policy recommends at least 75%.`,
        actionText: 'Check Attendance Log',
        onAction: () => onNavigate('attendance'),
        icon: AlertCircle,
        color: 'text-rose-600 bg-rose-50 border-rose-200',
      });
    }

    return items;
  }, [homeworkMetrics, feeMetrics, unreadMessagesCount, attendance, onNavigate]);

  if (!ward) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <AlertCircle size={36} className="mx-auto text-amber-500 mb-2" />
        <h3 className="text-base font-bold text-slate-800">No Student Linked</h3>
        <p className="text-xs text-slate-500 mt-1">Please contact school administration to link your student profile.</p>
      </div>
    );
  }

  const [bg, fg] = getAvatarColors(ward.name);

  // ─── Class Teacher Details Lookup ─────────────────────────────────────────
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
  const teacherSubjects = classTeacher?.subjects && classTeacher.subjects.length > 0 ? classTeacher.subjects.join(', ') : null;

  return (
    <div className="flex flex-col gap-4 font-sans text-slate-900">
      {/* ─── Hero Header & Child Identity ─── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500" />
        
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Student Avatar */}
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-base font-extrabold flex-shrink-0 shadow-xs"
              style={{ background: bg, color: fg }}
            >
              {getInitials(ward.name)}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">{greeting} 👋</span>
              </div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight truncate m-0">
                {ward.name}
              </h1>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 flex-wrap">
                <span className="font-semibold text-slate-700">{formatClassName(ward.class, ward.section)}</span>
                <span>·</span>
                <span>Adm: <strong className="text-slate-700">{ward.admissionNo}</strong></span>
                {ward.rollNumber && (
                  <>
                    <span>·</span>
                    <span>Roll #{ward.rollNumber}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Child Switcher (if multi-child) OR quick badges */}
          <div className="flex items-center gap-2 flex-wrap sm:justify-end">
            {allWards.length > 1 ? (
              <div className="relative">
                <select
                  className="h-8 pl-3 pr-8 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 bg-white outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer shadow-2xs"
                  value={ward.id || ward._id}
                  onChange={(e) => onSelectWard(e.target.value)}
                >
                  {allWards.map((w) => (
                    <option key={w.id || w._id} value={w.id || w._id}>
                      {w.name} ({formatClassName(w.class, w.section)})
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg px-2.5 py-1">
                <UserCheck size={12} /> {classTeacherName}
                {teacherPhone && (
                  <a href={`tel:${teacherPhone}`} className="text-emerald-700 font-bold hover:underline flex items-center gap-0.5">
                    · <Phone size={10} className="text-emerald-600 inline" /> {teacherPhone}
                  </a>
                )}
              </span>
            )}

            <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-slate-50 text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1">
              {ward.transportMode === 'school' ? <><Bus size={11} /> School Bus</> : <><Car size={11} /> Private</>}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Class Teacher & Faculty Support Card ─── */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center text-xs font-extrabold flex-shrink-0">
            {getInitials(classTeacherName)}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Class Teacher · {formatClassName(ward.class, ward.section)}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-sm font-bold text-slate-900">{classTeacherName}</span>
              {teacherPhone && (
                <a
                  href={`tel:${teacherPhone}`}
                  className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5 hover:bg-emerald-100 transition-colors"
                  title="Call Class Teacher"
                >
                  <Phone size={11} className="text-emerald-600" />
                  {teacherPhone}
                </a>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
              {teacherEmail && (
                <span className="flex items-center gap-1 text-slate-500">
                  <Mail size={11} className="text-indigo-500" /> {teacherEmail}
                </span>
              )}
              {teacherSubjects && (
                <span className="text-slate-400">
                  Subjects: {teacherSubjects}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
          {teacherPhone && (
            <a
              href={`tel:${teacherPhone}`}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              <Phone size={12} className="text-emerald-600" /> Call
            </a>
          )}
          <button
            type="button"
            onClick={() => onNavigate('messages')}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-700 transition-colors shadow-2xs cursor-pointer"
          >
            <MessageSquare size={12} /> Message Teacher
          </button>
        </div>
      </div>

      {/* ─── Quick Status Overview Cards ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Attendance Card */}
        <div
          onClick={() => onNavigate('attendance')}
          className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs hover:shadow-xs hover:border-slate-300 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Attendance</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <CalendarCheck size={13} />
            </div>
          </div>
          <div className="my-2">
            <div className="text-xl font-extrabold text-slate-900 tracking-tight">
              {attendanceLoading ? (
                <span className="text-sm font-normal text-slate-400">Loading…</span>
              ) : attendance ? (
                `${attendance.percentage}%`
              ) : (
                '—'
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {attendance ? `${attendance.presentDays} / ${attendance.workingDays} days present` : 'Track daily record'}
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', attendanceStatus.bg)}>
              {attendanceStatus.label}
            </span>
            <ArrowRight size={12} className="text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>

        {/* 2. Academic Performance Card */}
        <div
          onClick={() => onNavigate('results')}
          className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs hover:shadow-xs hover:border-slate-300 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Academic Score</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <GraduationCap size={14} />
            </div>
          </div>
          <div className="my-2">
            <div className="text-xl font-extrabold text-slate-900 tracking-tight">
              {academicMetrics.latestPct !== null ? `${academicMetrics.latestPct}%` : '—'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
              {academicMetrics.latestExam ? academicMetrics.latestExam.examName : 'No published exams'}
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            {academicMetrics.diff !== null ? (
              <span
                className={cn(
                  'text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-0.5',
                  academicMetrics.diff >= 0
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : 'text-rose-700 bg-rose-50 border-rose-200'
                )}
              >
                {academicMetrics.diff >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {academicMetrics.diff >= 0 ? `+${academicMetrics.diff}%` : `${academicMetrics.diff}%`}
              </span>
            ) : (
              <span className="text-[10px] font-medium text-slate-400">Recent result</span>
            )}
            <ArrowRight size={12} className="text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>

        {/* 3. Homework Card */}
        <div
          onClick={() => onNavigate('homework')}
          className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs hover:shadow-xs hover:border-slate-300 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Homework</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <ClipboardList size={13} />
            </div>
          </div>
          <div className="my-2">
            <div className="text-xl font-extrabold text-slate-900 tracking-tight">
              {homeworkMetrics.pending + homeworkMetrics.overdue}
              <span className="text-xs font-semibold text-slate-400 ml-1">due</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {homeworkMetrics.completed} acknowledged
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            {homeworkMetrics.overdue > 0 ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-rose-50 border-rose-200 text-rose-700">
                {homeworkMetrics.overdue} overdue
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700">
                All on track
              </span>
            )}
            <ArrowRight size={12} className="text-slate-300 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>

        {/* 4. Fees Card */}
        <div
          onClick={() => onNavigate('fees')}
          className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs hover:shadow-xs hover:border-slate-300 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fee Status</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <CreditCard size={13} />
            </div>
          </div>
          <div className="my-2">
            <div className="text-xl font-extrabold text-slate-900 tracking-tight">
              {feeMetrics.pending > 0 ? `₹${feeMetrics.pending.toLocaleString()}` : 'Cleared ✓'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {feeMetrics.pct}% paid of total
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <span
              className={cn(
                'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                feeMetrics.isCleared
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              )}
            >
              {feeMetrics.isCleared ? 'Fully Paid' : 'Pending Due'}
            </span>
            <ArrowRight size={12} className="text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>
      </div>

      {/* ─── "Needs Your Attention" Smart Section ─── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-indigo-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 m-0">Needs Your Attention</h2>
          </div>
          {attentionItems.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full">
              {attentionItems.length} Action{attentionItems.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="p-3">
          {attentionItems.length === 0 ? (
            <div className="flex items-center gap-3 p-3 bg-emerald-50/70 border border-emerald-100 rounded-lg text-emerald-800">
              <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-emerald-900">You're all caught up! 🎉</div>
                <div className="text-[11px] text-emerald-700 mt-0.5">
                  No overdue homework, outstanding urgent dues, or unread notices for {ward.name}.
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {attentionItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    onClick={item.onAction}
                    className={cn(
                      'flex items-center justify-between gap-3 p-3 rounded-lg border transition-all cursor-pointer hover:shadow-2xs group',
                      item.color
                    )}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Icon size={16} className="flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold leading-snug">{item.title}</div>
                        <div className="text-[11px] opacity-80 mt-0.5 leading-snug truncate">{item.subtitle}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-xs font-bold flex items-center gap-1 flex-shrink-0 opacity-90 group-hover:opacity-100 underline decoration-1 underline-offset-2"
                    >
                      {item.actionText} <ChevronRight size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── 2-Column Grid: Academic Snapshot & Upcoming Schedule ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Academic Subject Highlights */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <GraduationCap size={14} className="text-indigo-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 m-0">Recent Academic Performance</h3>
              </div>
              <button
                onClick={() => onNavigate('results')}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-0.5"
              >
                All Exams <ChevronRight size={12} />
              </button>
            </div>

            <div className="p-4">
              {academicMetrics.latestExam ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-slate-800">{academicMetrics.latestExam.examName}</div>
                      <div className="text-[11px] text-slate-400">
                        Score: {academicMetrics.latestExam.totalObtained} / {academicMetrics.latestExam.totalPossible}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-extrabold text-slate-900">{academicMetrics.latestPct}%</span>
                    </div>
                  </div>

                  {/* Subject progress list */}
                  <div className="flex flex-col gap-2 pt-1 border-t border-slate-100">
                    {academicMetrics.subjectMarks.slice(0, 4).map((sub) => {
                      const maxMark = academicMetrics.latestExam?.subjects.find((s) => s.name === sub.subject)?.totalMarks || 100;
                      const subPct = maxMark > 0 ? Math.round((sub.obtainedMarks / maxMark) * 100) : 0;
                      const barColor = subPct >= 75 ? 'bg-emerald-500' : subPct >= 50 ? 'bg-blue-500' : subPct >= 35 ? 'bg-amber-500' : 'bg-rose-500';

                      return (
                        <div key={sub.subject} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-700">{sub.subject}</span>
                            <span className="text-slate-500 font-medium">{sub.obtainedMarks} / {maxMark}</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${subPct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-slate-400 text-xs">
                  No published exam results available yet.
                </div>
              )}
            </div>
          </div>

          <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
            <button
              onClick={() => onNavigate('results')}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors inline-flex items-center gap-1"
            >
              View Detailed Marksheets & Report Cards <ArrowRight size={12} />
            </button>
          </div>
        </div>

        {/* Right: Upcoming Events & Dates */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-indigo-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 m-0">Upcoming Events & Notices</h3>
              </div>
              <button
                onClick={() => onNavigate('notices')}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-0.5"
              >
                View All <ChevronRight size={12} />
              </button>
            </div>

            <div className="p-3">
              {upcomingEvents.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {upcomingEvents.map((ev) => {
                    const evDate = new Date(ev.date);
                    return (
                      <div
                        key={ev._id}
                        onClick={() => onNavigate('notices')}
                        className="flex items-start gap-3 p-2.5 rounded-lg border border-slate-100 bg-slate-50/60 hover:bg-slate-100/70 transition-colors cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex flex-col items-center justify-center flex-shrink-0 text-blue-800">
                          <span className="text-[9px] font-bold uppercase">{evDate.toLocaleDateString('en-IN', { month: 'short' })}</span>
                          <span className="text-xs font-extrabold leading-none">{evDate.getDate()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate">{ev.title}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{ev.description || 'School event announcement'}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-6 text-center text-slate-400 text-xs">
                  No upcoming school events scheduled.
                </div>
              )}
            </div>
          </div>

          <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
            <button
              onClick={() => onNavigate('notices')}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors inline-flex items-center gap-1"
            >
              Check School Circulars & Calendar <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Quick Access Action Grid ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { label: 'Attendance Log', icon: CalendarCheck, view: 'attendance', color: 'text-blue-600 bg-blue-50' },
          { label: 'Exam Results', icon: GraduationCap, view: 'results', color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Homework Board', icon: ClipboardList, view: 'homework', color: 'text-amber-600 bg-amber-50' },
          { label: 'Fee Breakdown', icon: CreditCard, view: 'fees', color: 'text-emerald-600 bg-emerald-50' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => onNavigate(item.view)}
              className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all text-left shadow-2xs cursor-pointer group"
            >
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform', item.color)}>
                <Icon size={15} />
              </div>
              <span className="text-xs font-bold text-slate-700 group-hover:text-slate-900 transition-colors">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ParentDashboard;
