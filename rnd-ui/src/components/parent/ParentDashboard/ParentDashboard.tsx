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
  Calendar,
  MessageSquare,
  ChevronRight,
  Bus,
  Car,
  Phone,
  Mail,
  BookOpen,
  FileText,
  Clock,
  Sparkles,
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
  user,
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

  useEffect(() => {
    if (!ward) return;
    const studentId = ward.id || ward._id;
    let isMounted = true;

    fetch(`${API_BASE}/attendance/summary/student/${studentId}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success && data.data) {
          setAttendance(data.data);
        }
      })
      .catch((err) => console.error('Failed to load attendance summary:', err));

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
      const upcoming = ward.installments.find((i) => i.status !== 'paid');
      if (upcoming) {
        nextDue = new Date(upcoming.dueDate).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        });
      }
    }

    return { total, paid, pending, pct, isCleared, nextDue };
  }, [ward]);

  // ─── Action Center Tab State ──────────────────────────────────────────────
  const [actionTab, setActionTab] = useState<'attention' | 'homework' | 'fees'>('attention');

  // ─── Attention Items ──────────────────────────────────────────────────────
  const attentionItems = useMemo(() => {
    const items: Array<{
      id: string;
      type: 'overdue_homework' | 'pending_fee' | 'unread_messages' | 'low_attendance';
      title: string;
      subtitle: string;
      actionText: string;
      onAction: () => void;
      amount?: string;
      icon: React.ElementType;
      color: string;
    }> = [];

    // 1. Pending Fee
    if (!feeMetrics.isCleared && feeMetrics.pending > 0) {
      items.push({
        id: 'fee_pending',
        type: 'pending_fee',
        title: `₹${feeMetrics.pending.toLocaleString()} Fee Pending`,
        subtitle: feeMetrics.nextDue ? `Next installment scheduled for ${feeMetrics.nextDue}` : 'Outstanding balance for this academic term.',
        actionText: 'View Fees',
        amount: `₹${feeMetrics.pending.toLocaleString()}`,
        onAction: () => onNavigate('fees'),
        icon: CreditCard,
        color: 'text-amber-600 bg-amber-50',
      });
    }

    // 2. Low attendance warning
    if (attendance && attendance.workingDays >= 5 && attendance.percentage < 75) {
      items.push({
        id: 'low_att',
        type: 'low_attendance',
        title: `Attendance is below minimum threshold (${attendance.percentage}%)`,
        subtitle: `${attendance.presentDays} of ${attendance.workingDays} working days attended. School guideline requires >= 75%.`,
        actionText: 'View Log',
        onAction: () => onNavigate('attendance'),
        icon: AlertCircle,
        color: 'text-rose-600 bg-rose-50',
      });
    }

    // 3. Overdue homework
    if (homeworkMetrics.overdue > 0) {
      const firstOverdue = homeworkMetrics.overdueItems[0];
      items.push({
        id: 'hw_overdue',
        type: 'overdue_homework',
        title: `${homeworkMetrics.overdue} Homework Assignment${homeworkMetrics.overdue > 1 ? 's' : ''} Overdue`,
        subtitle: firstOverdue
          ? `${firstOverdue.subject}: "${firstOverdue.title}"`
          : 'Submission pending acknowledgment.',
        actionText: 'Review',
        onAction: () => onNavigate('homework'),
        icon: ClipboardList,
        color: 'text-rose-600 bg-rose-50',
      });
    }

    // 4. Unread messages
    if (unreadMessagesCount > 0) {
      items.push({
        id: 'unread_msg',
        type: 'unread_messages',
        title: `${unreadMessagesCount} Unread Message${unreadMessagesCount > 1 ? 's' : ''} from School`,
        subtitle: 'New direct updates from School Administration or Class Teacher.',
        actionText: 'Read',
        onAction: () => onNavigate('messages'),
        icon: MessageSquare,
        color: 'text-blue-600 bg-blue-50',
      });
    }

    return items;
  }, [homeworkMetrics, feeMetrics, unreadMessagesCount, attendance, onNavigate]);

  // ─── Upcoming Events ──────────────────────────────────────────────────────
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

  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900">
      {/* ─── PAGE HEADER (Matches Admin Dashboard) ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-card">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3 m-0">
            {greeting}, {user?.name?.split(' ')[0] || 'Parent'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} · {ward.name} · {formatClassName(ward.class, ward.section)} · Adm: {ward.admissionNo}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {allWards.length > 1 && (
            <div className="relative">
              <select
                className="h-9 pl-3 pr-8 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 bg-white outline-none focus:border-blue-600 transition-colors appearance-none cursor-pointer shadow-2xs"
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
          )}

          <button
            type="button"
            onClick={() => onNavigate('messages:teacher')}
            className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <MessageSquare size={13} className="text-slate-500" />
            Message Teacher
          </button>

          <button
            type="button"
            onClick={() => onNavigate('fees')}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors cursor-pointer shadow-sm"
          >
            <CreditCard size={13} />
            Fee Details
          </button>
        </div>
      </div>

      {/* ─── 4 KPI STAT CARDS (Matches Admin Design) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Attendance Card */}
        <div
          onClick={() => onNavigate('attendance')}
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-card flex flex-col justify-between hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold">
              <CalendarCheck size={18} />
            </div>
            <span
              className={cn(
                'text-xs font-bold px-2 py-0.5 rounded-full',
                (attendance?.percentage || 0) >= 75
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-rose-50 text-rose-700'
              )}
            >
              {(attendance?.percentage || 0) >= 75 ? '✓ On Track' : '⚠️ Critical'}
            </span>
          </div>
          <div className="mt-3">
            <div className="text-xs font-semibold text-slate-500">Overall Attendance</div>
            <div className="text-2xl font-extrabold text-slate-900 mt-0.5">
              {attendance ? `${attendance.percentage}%` : '—'}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {attendance ? `${attendance.presentDays}/${attendance.workingDays} days present` : 'Calculating sessions…'}
            </div>
          </div>
        </div>

        {/* 2. Academic Score */}
        <div
          onClick={() => onNavigate('results')}
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-card flex flex-col justify-between hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center text-xs font-bold">
              <GraduationCap size={18} />
            </div>
            {academicMetrics.diff !== null && (
              <span
                className={cn(
                  'text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5',
                  academicMetrics.diff >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                )}
              >
                {academicMetrics.diff >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {Math.abs(academicMetrics.diff)}%
              </span>
            )}
          </div>
          <div className="mt-3">
            <div className="text-xs font-semibold text-slate-500">Academic Score</div>
            <div className="text-2xl font-extrabold text-slate-900 mt-0.5">
              {academicMetrics.latestPct !== null ? `${academicMetrics.latestPct}%` : 'N/A'}
            </div>
            <div className="text-xs text-slate-400 mt-1 truncate">
              {academicMetrics.latestExam ? `${academicMetrics.latestExam.examName} (Latest)` : 'No exam published'}
            </div>
          </div>
        </div>

        {/* 3. Fee Status */}
        <div
          onClick={() => onNavigate('fees')}
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-card flex flex-col justify-between hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-xs font-bold">
              <CreditCard size={18} />
            </div>
            <span
              className={cn(
                'text-xs font-bold px-2 py-0.5 rounded-full',
                feeMetrics.isCleared ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
              )}
            >
              {feeMetrics.isCleared ? '✓ Cleared' : 'Pending Due'}
            </span>
          </div>
          <div className="mt-3">
            <div className="text-xs font-semibold text-slate-500">Fee Status</div>
            <div
              className={cn(
                'text-2xl font-extrabold mt-0.5',
                feeMetrics.isCleared ? 'text-emerald-600' : 'text-slate-900'
              )}
            >
              {feeMetrics.isCleared ? '₹0' : `₹${feeMetrics.pending.toLocaleString()}`}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {feeMetrics.isCleared ? 'Full term fees paid' : `${feeMetrics.pct}% paid of total`}
            </div>
          </div>
        </div>

        {/* 4. Homework Status */}
        <div
          onClick={() => onNavigate('homework')}
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-card flex flex-col justify-between hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs font-bold">
              <ClipboardList size={18} />
            </div>
            <span
              className={cn(
                'text-xs font-bold px-2 py-0.5 rounded-full',
                homeworkMetrics.overdue === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              )}
            >
              {homeworkMetrics.overdue === 0 ? 'All on track' : `${homeworkMetrics.overdue} Overdue`}
            </span>
          </div>
          <div className="mt-3">
            <div className="text-xs font-semibold text-slate-500">Homework &amp; Tasks</div>
            <div className="text-2xl font-extrabold text-slate-900 mt-0.5">
              {homeworkMetrics.pending} Due
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {homeworkMetrics.completed} acknowledged
            </div>
          </div>
        </div>
      </div>

      {/* ─── MAIN 2-COLUMN BALANCED GRID (Matches Admin Grid) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
        {/* ─── LEFT COLUMN ─── */}
        <div className="flex flex-col gap-5">
          {/* Action Center Card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h3 className="text-sm font-bold text-slate-900 m-0">Action Center</h3>
                <p className="text-xs text-slate-500 m-0 mt-0.5">Important items requiring your review or payment</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('fees')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer bg-transparent border-0"
              >
                View all <ArrowRight size={12} />
              </button>
            </div>

            {/* Tab bar */}
            <div className="px-5 pt-3">
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto">
                {[
                  { key: 'attention' as const, label: 'Needs Attention', count: attentionItems.length },
                  { key: 'fees' as const, label: 'Fee Dues', count: feeMetrics.isCleared ? 0 : 1 },
                  { key: 'homework' as const, label: 'Homework', count: homeworkMetrics.pending },
                ].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActionTab(t.key)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap cursor-pointer border-0',
                      actionTab === t.key
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800 bg-transparent'
                    )}
                  >
                    {t.label}
                    <span
                      className={cn(
                        'text-[10px] font-extrabold px-1.5 py-0.5 rounded-full',
                        actionTab === t.key ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                      )}
                    >
                      {t.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content list */}
            <div className="px-5 py-3 flex flex-col divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
              {actionTab === 'attention' && (
                attentionItems.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs font-medium">
                    🎉 Everything is in good standing! No urgent items pending.
                  </div>
                ) : (
                  attentionItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.id} className="flex items-center gap-3 py-3.5 first:pt-2 last:pb-2">
                        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs', item.color)}>
                          <Icon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">{item.title}</div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">{item.subtitle}</div>
                        </div>
                        <div className="flex items-center gap-2.5 flex-shrink-0">
                          {item.amount && (
                            <span className="text-xs font-extrabold text-slate-900">{item.amount}</span>
                          )}
                          <button
                            type="button"
                            onClick={item.onAction}
                            className="flex items-center gap-1 h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors cursor-pointer"
                          >
                            {item.actionText}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )
              )}

              {actionTab === 'fees' && (
                feeMetrics.isCleared ? (
                  <div className="py-8 text-center text-slate-400 text-xs font-medium">
                    ✅ All fees are fully paid! No outstanding dues.
                  </div>
                ) : (
                  <div className="flex items-center justify-between py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
                        <CreditCard size={16} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">Term Academic Dues</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">Due for current academic semester</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-extrabold text-rose-600">₹{feeMetrics.pending.toLocaleString()}</span>
                      <button
                        type="button"
                        onClick={() => onNavigate('fees')}
                        className="h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors cursor-pointer"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                )
              )}

              {actionTab === 'homework' && (
                homeworkList.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs font-medium">
                    No homework assigned for this week.
                  </div>
                ) : (
                  homeworkList.slice(0, 3).map((h) => (
                    <div key={h._id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0 text-xs font-bold">
                          <BookOpen size={14} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">{h.title}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{h.subject} · Due {new Date(h.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate('homework')}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 ml-2"
                      >
                        View →
                      </button>
                    </div>
                  ))
                )
              )}
            </div>
          </div>

          {/* Academic Performance & Marks Breakdown */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-card p-5">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 m-0">Recent Academic Performance</h3>
                <p className="text-xs text-slate-500 m-0 mt-0.5">
                  {academicMetrics.latestExam ? `${academicMetrics.latestExam.examName} · Total: ${academicMetrics.latestExam.totalObtained ?? (academicMetrics.latestExam as any).totalMarks ?? 0}/${academicMetrics.latestExam.totalPossible ?? (academicMetrics.latestExam as any).maxMarks ?? 100} (${academicMetrics.latestPct}%)` : 'No marks recorded yet'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('results')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer bg-transparent border-0"
              >
                All Exams <ArrowRight size={12} />
              </button>
            </div>

            {academicMetrics.subjectMarks.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No subject marks published for this term yet.
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3.5">
                {academicMetrics.subjectMarks.map((s: any, idx) => {
                  const obtained = typeof s.obtainedMarks === 'number' ? s.obtainedMarks : (typeof s.marks === 'number' ? s.marks : (Number(s.obtainedMarks) || 0));
                  const subDef = academicMetrics.latestExam?.subjects?.find((sub: any) => sub.name === s.subject);
                  const max = subDef?.totalMarks || (typeof s.maxMarks === 'number' ? s.maxMarks : 100);
                  const pct = max > 0 ? Math.round((obtained / max) * 100) : 0;
                  const isGood = pct >= 50;
                  const barColor =
                    pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-600' : pct >= 35 ? 'bg-amber-500' : 'bg-rose-500';

                  return (
                    <div key={idx} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <span className={cn('w-2 h-2 rounded-full', barColor)} />
                          {s.subject}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900">{obtained}/{max}</span>
                          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', isGood ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
                            {pct}%
                          </span>
                        </div>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all duration-500', barColor)} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Shortcuts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Attendance Log', sub: 'Full calendar', icon: CalendarCheck, view: 'attendance', color: 'text-blue-600 bg-blue-50' },
              { label: 'Exam Results', sub: 'Report cards', icon: GraduationCap, view: 'results', color: 'text-purple-600 bg-purple-50' },
              { label: 'Fee Receipts', sub: 'Download bills', icon: CreditCard, view: 'fees', color: 'text-emerald-600 bg-emerald-50' },
              { label: 'School Notices', sub: `${events.length} announcements`, icon: Calendar, view: 'notices', color: 'text-amber-600 bg-amber-50' },
            ].map((tile) => {
              const TileIcon = tile.icon;
              return (
                <button
                  key={tile.label}
                  type="button"
                  onClick={() => onNavigate(tile.view)}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all flex flex-col items-start text-left cursor-pointer group"
                >
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2.5', tile.color)}>
                    <TileIcon size={15} />
                  </div>
                  <div className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{tile.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{tile.sub}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── RIGHT COLUMN (Sidebar matching Admin) ─── */}
        <div className="flex flex-col gap-5">
          {/* Class Teacher Profile Card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-card p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
              Class Teacher &amp; Support
            </div>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center font-bold text-sm flex-shrink-0">
                {getInitials(classTeacherName)}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 truncate">{classTeacherName}</div>
                <div className="text-xs text-slate-500 truncate mt-0.5">
                  Class Teacher · {formatClassName(ward.class, ward.section)}
                </div>
              </div>
            </div>

            <div className="mt-3.5 flex flex-col gap-2">
              {teacherPhone && (
                <a
                  href={`tel:${teacherPhone}`}
                  className="flex items-center justify-center gap-2 h-8 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors"
                >
                  <Phone size={12} className="text-emerald-600" /> {teacherPhone}
                </a>
              )}
              <button
                type="button"
                onClick={() => onNavigate('messages:teacher')}
                className="flex items-center justify-center gap-2 h-8 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors cursor-pointer"
              >
                <MessageSquare size={12} /> Direct Message
              </button>
            </div>
          </div>

          {/* Attendance Trend Widget */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-800">Attendance Overview</div>
                <div className="text-[11px] text-slate-400">Current Academic Term</div>
              </div>
              <span className="text-sm font-extrabold text-blue-600">
                {attendance ? `${attendance.percentage}%` : '—'}
              </span>
            </div>

            {/* Sparkline Graphic */}
            <div className="mt-3 h-14 w-full">
              <svg viewBox="0 0 100 35" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="parentAttGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,28 Q15,25 30,18 T60,20 T85,12 T100,8 L100,35 L0,35 Z"
                  fill="url(#parentAttGrad)"
                />
                <path
                  d="M0,28 Q15,25 30,18 T60,20 T85,12 T100,8"
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2 pt-2.5 border-t border-slate-100 text-center">
              <div className="bg-slate-50 rounded-lg p-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Present</div>
                <div className="text-sm font-extrabold text-emerald-600 mt-0.5">
                  {attendance?.presentDays || 0} Days
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Absent</div>
                <div className="text-sm font-extrabold text-rose-600 mt-0.5">
                  {(attendance?.workingDays || 0) - (attendance?.presentDays || 0)} Days
                </div>
              </div>
            </div>
          </div>

          {/* School Events & Circulars */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold text-slate-800">School Notices &amp; Events</div>
              <button
                type="button"
                onClick={() => onNavigate('notices')}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer bg-transparent border-0"
              >
                View all →
              </button>
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs">
                No upcoming school events scheduled.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {upcomingEvents.map((ev) => {
                  const d = new Date(ev.date);
                  return (
                    <div
                      key={ev._id}
                      onClick={() => onNavigate('notices')}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex flex-col items-center justify-center flex-shrink-0 leading-none">
                        <span className="text-[9px] font-extrabold text-blue-600 uppercase">
                          {d.toLocaleDateString('en-IN', { month: 'short' })}
                        </span>
                        <span className="text-xs font-extrabold text-slate-900 mt-0.5">
                          {d.getDate()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 truncate">{ev.title}</div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {d.toLocaleDateString('en-IN', { weekday: 'short' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParentDashboard;
