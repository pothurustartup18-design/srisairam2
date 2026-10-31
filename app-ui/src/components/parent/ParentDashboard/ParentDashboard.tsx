import React, { useState, useEffect, useMemo } from 'react';
import {
  GraduationCap,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  UserCheck,
  Calendar,
  MessageSquare,
  Phone,
  Mail,
  Megaphone,
} from 'lucide-react';
import type { StudentData, TeacherData, EventData, StudentExamResult, UserProfile, HomeworkData } from '../../../types';
import { API_BASE, formatClassName } from '../../../constants';
import { cn } from '../../../lib/utils';
import { getAvatarColors, getInitials } from '../../../utils/avatar';
import { Button, Card, ListRow, QuickAction, SectionHeader, Skeleton, StatTile, selectClass } from '../../ui';
import { readJson } from '../../../lib/http';

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
  /** True until the ward's exam results have loaded for the first time. */
  resultsLoading?: boolean;
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
  resultsLoading = false,
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
  const [attendanceState, setAttendanceState] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (!ward) return;
    const studentId = ward.id || ward._id;
    let isMounted = true;
    setAttendance(null);
    setAttendanceState('loading');

    fetch(`${API_BASE}/attendance/summary/student/${studentId}`)
      .then(readJson)
      .then((data) => {
        if (!isMounted) return;
        if (data.data) setAttendance(data.data);
        setAttendanceState('success');
      })
      .catch((err) => {
        console.error('Failed to load attendance summary:', err);
        if (isMounted) setAttendanceState('error');
      });

    return () => {
      isMounted = false;
    };
  }, [ward]);

  // ─── Homework Fetching ────────────────────────────────────────────────────
  const [homeworkList, setHomeworkList] = useState<HomeworkData[]>([]);
  const [homeworkState, setHomeworkState] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (!ward) return;
    const classRoom = `${ward.class}-${ward.section}`;
    let isMounted = true;
    setHomeworkList([]);
    setHomeworkState('loading');

    fetch(`${API_BASE}/homework/class/${encodeURIComponent(classRoom)}`)
      .then(readJson)
      .then((data) => {
        if (!isMounted) return;
        setHomeworkList(data.data || []);
        setHomeworkState('success');
      })
      .catch((err) => {
        console.error('Failed to load homework:', err);
        if (isMounted) setHomeworkState('error');
      });

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

  const latestNotice = useMemo(() => {
    if (!events || events.length === 0) return null;
    const parentVisible = events.filter((e) => e.sendAlertsTo !== 'teachers');
    return parentVisible[0] || null;
  }, [events]);

  const latestHomework = useMemo(() => {
    if (!homeworkList || homeworkList.length === 0) return null;
    return homeworkList[0] || null;
  }, [homeworkList]);

  // ─── Class Teacher Details Lookup (before any early return: hook order) ───
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
      <Card className="text-center py-10">
        <AlertCircle size={36} className="mx-auto text-warning mb-2" />
        <h3 className="text-base font-bold text-ink m-0">No Student Linked</h3>
        <p className="text-sm text-muted mt-1 mb-0">Please contact school administration to link your student profile.</p>
      </Card>
    );
  }

  const [bg, fg] = getAvatarColors(ward.name);

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

  const absentDays = Math.max(0, (attendance?.workingDays || 0) - (attendance?.presentDays || 0));
  const attendanceTone = !attendance ? 'neutral' : attendance.percentage >= 75 ? 'success' : 'danger';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const parentFirstName = (user?.name || '').split(' ')[0];

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* ── Greeting + child identity ─────────────────────────────────── */}
      <header className="flex flex-col gap-3">
        <div>
          <p className="m-0 text-xs font-semibold text-muted">{today}</p>
          <h1 className="m-0 mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
            {greeting}{parentFirstName ? `, ${parentFirstName}` : ''}
          </h1>
        </div>

        <Card className="flex items-center gap-3.5">
          <span
            className="inline-flex items-center justify-center w-12 h-12 rounded-2xl text-base font-bold shrink-0"
            style={{ background: bg, color: fg }}
            aria-hidden="true"
          >
            {getInitials(ward.name)}
          </span>
          <div className="flex-1 min-w-0">
            {allWards.length > 1 ? (
              <select
                className={cn(selectClass, 'h-10 font-bold')}
                value={ward.id || ward._id}
                onChange={(e) => onSelectWard(e.target.value)}
                aria-label="Select child"
              >
                {allWards.map((w) => (
                  <option key={w.id || w._id} value={w.id || w._id}>
                    {w.name} · {formatClassName(w.class, w.section)}
                  </option>
                ))}
              </select>
            ) : (
              <p className="m-0 text-md font-bold text-ink truncate">{ward.name}</p>
            )}
            <p className="m-0 mt-1 text-xs text-muted truncate">
              {formatClassName(ward.class, ward.section)} · Adm. {ward.admissionNo}
            </p>
          </div>
          <Button variant="secondary" size="sm" className="hidden sm:inline-flex" onClick={() => onNavigate('profile')}>
            Child profile
          </Button>
        </Card>
      </header>

      {/* ── Key figures ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Attendance"
          value={attendanceState === 'loading' ? <Skeleton className="h-7 w-16" /> : attendance ? `${attendance.percentage}%` : '—'}
          hint={attendanceState === 'loading' ? 'Loading…' : attendanceState === 'error' ? 'Couldn’t load' : attendance ? `${attendance.presentDays}/${attendance.workingDays} days present` : 'No records yet'}
          tone={attendanceTone}
          icon={<CalendarCheck size={15} />}
          onClick={() => onNavigate('attendance')}
        />
        <StatTile
          label="Latest score"
          value={resultsLoading ? <Skeleton className="h-7 w-16" /> : academicMetrics.latestPct !== null ? `${academicMetrics.latestPct}%` : 'N/A'}
          hint={
            academicMetrics.diff !== null ? (
              <span className={cn('inline-flex items-center gap-1', academicMetrics.diff >= 0 ? 'text-success' : 'text-danger')}>
                {academicMetrics.diff >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {academicMetrics.diff >= 0 ? '+' : ''}{academicMetrics.diff.toFixed(1)}% vs previous
              </span>
            ) : resultsLoading ? 'Loading…' : (academicMetrics.latestExam?.examName || 'No exams yet')
          }
          tone="brand"
          icon={<GraduationCap size={15} />}
          onClick={() => onNavigate('results')}
        />
        <StatTile
          label="Fee balance"
          value={feeMetrics.isCleared ? 'Paid' : `₹${feeMetrics.pending.toLocaleString('en-IN')}`}
          hint={feeMetrics.isCleared ? 'No dues this term' : feeMetrics.nextDue ? `Next due ${feeMetrics.nextDue}` : `${feeMetrics.pct}% paid`}
          tone={feeMetrics.isCleared ? 'success' : 'warning'}
          icon={<CreditCard size={15} />}
          onClick={() => onNavigate('fees')}
        />
        <StatTile
          label="Homework"
          value={homeworkState === 'loading' ? <Skeleton className="h-7 w-10" /> : homeworkState === 'error' ? '—' : homeworkMetrics.pending + homeworkMetrics.overdue}
          hint={homeworkState === 'loading' ? 'Loading…' : homeworkState === 'error' ? 'Couldn’t load' : homeworkMetrics.overdue > 0 ? `${homeworkMetrics.overdue} overdue` : `${homeworkMetrics.completed} completed`}
          tone={homeworkMetrics.overdue > 0 ? 'danger' : 'neutral'}
          icon={<ClipboardList size={15} />}
          onClick={() => onNavigate('homework')}
        />
      </div>

      {/* ── Needs attention ───────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <SectionHeader title="Needs your attention" subtitle={attentionItems.length ? `${attentionItems.length} item${attentionItems.length > 1 ? 's' : ''}` : undefined} />
        <Card flush className="overflow-hidden">
          {attentionItems.length === 0 ? (
            <div className="flex items-center gap-3 p-4">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-success-soft text-success shrink-0">
                <CheckCircle2 size={18} />
              </span>
              <div>
                <p className="m-0 text-sm font-bold text-ink">You're all caught up</p>
                <p className="m-0 text-xs text-muted">No pending fees, overdue homework or unread messages.</p>
              </div>
            </div>
          ) : (
            <ul className="m-0 p-0 list-none divide-y divide-line">
              {attentionItems.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <ListRow
                      onClick={item.onAction}
                      leading={
                        <span className={cn('inline-flex items-center justify-center w-10 h-10 rounded-xl', item.color)}>
                          <Icon size={18} />
                        </span>
                      }
                      title={item.title}
                      subtitle={item.subtitle}
                      trailing={<span className="hidden sm:inline text-xs font-semibold text-blue-700 dark:text-blue-300">{item.actionText}</span>}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 items-start">
        {/* ── Left: academics + fees ──────────────────────────────────── */}
        <div className="lg:col-span-2 flex flex-col gap-4 sm:gap-5">
          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Recent academic performance"
              subtitle={academicMetrics.latestExam
                ? `${academicMetrics.latestExam.examName} · ${academicMetrics.latestExam.totalObtained ?? (academicMetrics.latestExam as any).totalMarks ?? 0}/${academicMetrics.latestExam.totalPossible ?? (academicMetrics.latestExam as any).maxMarks ?? 100} (${academicMetrics.latestPct}%)`
                : 'No marks recorded yet'}
              actionLabel="All exams"
              onAction={() => onNavigate('results')}
            />
            <Card>
              {academicMetrics.subjectMarks.length === 0 ? (
                <p className="m-0 py-6 text-center text-sm text-muted">No subject marks published for this term yet.</p>
              ) : (
                <ul className="m-0 p-0 list-none flex flex-col gap-3.5">
                  {academicMetrics.subjectMarks.map((s: any, idx) => {
                    const obtained = typeof s.obtainedMarks === 'number' ? s.obtainedMarks : (typeof s.marks === 'number' ? s.marks : (Number(s.obtainedMarks) || 0));
                    const subDef = academicMetrics.latestExam?.subjects?.find((sub: any) => sub.name === s.subject);
                    const max = subDef?.totalMarks || (typeof s.maxMarks === 'number' ? s.maxMarks : 100);
                    const pct = max > 0 ? Math.round((obtained / max) * 100) : 0;
                    const barColor = pct >= 75 ? 'bg-success' : pct >= 50 ? 'bg-blue-600' : pct >= 35 ? 'bg-warning' : 'bg-danger';
                    return (
                      <li key={idx} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-semibold text-ink truncate">{s.subject}</span>
                          <span className="flex items-center gap-2 shrink-0 tabular">
                            <span className="font-bold text-ink">{obtained}/{max}</span>
                            <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded-full', pct >= 50 ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>{pct}%</span>
                          </span>
                        </div>
                        <div className="h-2 w-full bg-surface-3 rounded-full overflow-hidden" role="presentation">
                          <div className={cn('h-full rounded-full', barColor)} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Fees */}
            <Card className="flex flex-col gap-3">
              <SectionHeader title="Fees" actionLabel="Details" onAction={() => onNavigate('fees')} />
              <div className="flex items-baseline justify-between gap-2 tabular">
                <span className="text-2xl font-extrabold text-ink">₹{feeMetrics.paid.toLocaleString('en-IN')}</span>
                <span className="text-xs text-muted">of ₹{feeMetrics.total.toLocaleString('en-IN')} paid</span>
              </div>
              <div className="h-2 w-full bg-surface-3 rounded-full overflow-hidden" role="progressbar" aria-valuenow={feeMetrics.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Fees paid">
                <div className={cn('h-full rounded-full', feeMetrics.isCleared ? 'bg-success' : 'bg-blue-600')} style={{ width: `${feeMetrics.pct}%` }} />
              </div>
              <p className="m-0 text-xs text-muted">
                {feeMetrics.isCleared
                  ? 'All dues cleared for this term.'
                  : `₹${feeMetrics.pending.toLocaleString('en-IN')} pending${feeMetrics.nextDue ? ` · next installment ${feeMetrics.nextDue}` : ''}`}
              </p>
            </Card>

            {/* Homework */}
            <Card className="flex flex-col gap-3">
              <SectionHeader title="Homework" actionLabel="Open" onAction={() => onNavigate('homework')} />
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'Pending', value: homeworkMetrics.pending, cls: 'text-ink' },
                  { label: 'Overdue', value: homeworkMetrics.overdue, cls: homeworkMetrics.overdue > 0 ? 'text-danger' : 'text-ink' },
                  { label: 'Done', value: homeworkMetrics.completed, cls: 'text-success' },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg bg-surface-2 py-2">
                    <div className={cn('text-lg font-extrabold tabular', m.cls)}>
                      {homeworkState === 'loading' ? <Skeleton className="h-6 w-6 mx-auto" /> : homeworkState === 'error' ? '—' : m.value}
                    </div>
                    <div className="text-2xs font-semibold text-muted uppercase tracking-wide">{m.label}</div>
                  </div>
                ))}
              </div>
              <p className="m-0 text-xs text-muted truncate">
                {homeworkState === 'loading' ? 'Loading homework…' : homeworkState === 'error' ? 'Homework couldn’t be loaded. Open Homework to retry.' : latestHomework ? <>Latest: <span className="font-semibold text-ink-2">{latestHomework.subject} — {latestHomework.title}</span></> : 'No homework assigned yet.'}
              </p>
            </Card>
          </div>
        </div>

        {/* ── Right: teacher, attendance, notices ────────────────────── */}
        <div className="flex flex-col gap-4 sm:gap-5">
          <Card className="flex flex-col gap-3.5">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-accent-soft text-accent-ink text-sm font-bold shrink-0">
                {getInitials(classTeacherName)}
              </span>
              <div className="min-w-0">
                <p className="m-0 text-sm font-bold text-ink truncate">{classTeacherName}</p>
                <p className="m-0 text-xs text-muted truncate">Class teacher · {formatClassName(ward.class, ward.section)}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => onNavigate('messages:teacher')} className="w-full">
                <MessageSquare size={16} /> Message teacher
              </Button>
              {(teacherPhone || teacherEmail) && (
                <div className="grid grid-cols-2 gap-2">
                  {teacherPhone ? (
                    <a href={`tel:${teacherPhone}`} className="inline-flex items-center justify-center gap-1.5 h-control rounded-md border border-line-strong bg-surface text-sm font-semibold text-ink-2 hover:bg-surface-2 col-span-1" aria-label={`Call ${classTeacherName}`}>
                      <Phone size={15} className="text-success" /> Call
                    </a>
                  ) : <span />}
                  {teacherEmail ? (
                    <a href={`mailto:${teacherEmail}`} className="inline-flex items-center justify-center gap-1.5 h-control rounded-md border border-line-strong bg-surface text-sm font-semibold text-ink-2 hover:bg-surface-2" aria-label={`Email ${classTeacherName}`}>
                      <Mail size={15} className="text-blue-600" /> Email
                    </a>
                  ) : <span />}
                </div>
              )}
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <SectionHeader title="Attendance this term" actionLabel="Log" onAction={() => onNavigate('attendance')} />
            <div className="h-2 w-full bg-surface-3 rounded-full overflow-hidden" role="progressbar" aria-valuenow={attendance?.percentage || 0} aria-valuemin={0} aria-valuemax={100} aria-label="Attendance rate">
              <div className={cn('h-full rounded-full', attendanceTone === 'danger' ? 'bg-danger' : 'bg-success')} style={{ width: `${attendance?.percentage || 0}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-surface-2 py-2">
                <div className="text-2xs font-semibold text-muted uppercase tracking-wide">Present</div>
                <div className="text-md font-extrabold text-success tabular">{attendanceState === 'loading' ? <Skeleton className="h-5 w-14 mx-auto" /> : attendanceState === 'error' ? '—' : `${attendance?.presentDays || 0} days`}</div>
              </div>
              <div className="rounded-lg bg-surface-2 py-2">
                <div className="text-2xs font-semibold text-muted uppercase tracking-wide">Absent</div>
                <div className="text-md font-extrabold text-danger tabular">{attendanceState === 'loading' ? <Skeleton className="h-5 w-14 mx-auto" /> : attendanceState === 'error' ? '—' : `${absentDays} days`}</div>
              </div>
            </div>
          </Card>

          <section className="flex flex-col gap-3">
            <SectionHeader title="Notices & events" actionLabel="View all" onAction={() => onNavigate('notices')} />
            <Card flush className="overflow-hidden">
              {upcomingEvents.length === 0 ? (
                latestNotice ? (
                  <ListRow
                    onClick={() => onNavigate('notices')}
                    leading={<span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/40"><Megaphone size={17} /></span>}
                    title={latestNotice.title}
                    subtitle="Latest announcement"
                  />
                ) : (
                  <p className="m-0 p-5 text-center text-sm text-muted">No upcoming school events scheduled.</p>
                )
              ) : (
                <ul className="m-0 p-0 list-none divide-y divide-line">
                  {upcomingEvents.map((ev) => {
                    const d = new Date(ev.date);
                    return (
                      <li key={ev._id}>
                        <ListRow
                          onClick={() => onNavigate('notices')}
                          leading={
                            <span className="inline-flex flex-col items-center justify-center w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/40 leading-none">
                              <span className="text-[9.5px] font-extrabold text-blue-600 uppercase">{d.toLocaleDateString('en-IN', { month: 'short' })}</span>
                              <span className="text-sm font-extrabold text-ink mt-0.5">{d.getDate()}</span>
                            </span>
                          }
                          title={ev.title}
                          subtitle={d.toLocaleDateString('en-IN', { weekday: 'long' })}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </section>
        </div>
      </div>

      {/* ── Shortcuts ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <SectionHeader title="Shortcuts" />
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <QuickAction label="Attendance log" icon={<CalendarCheck size={20} />} onClick={() => onNavigate('attendance')} />
          <QuickAction label="Exam results" icon={<GraduationCap size={20} />} tone="warning" onClick={() => onNavigate('results')} />
          <QuickAction label="Fee receipts" icon={<CreditCard size={20} />} tone="success" onClick={() => onNavigate('fees')} />
          <QuickAction label="Notices" icon={<Calendar size={20} />} tone="neutral" onClick={() => onNavigate('notices')} />
          <QuickAction label="Messages" icon={<MessageSquare size={20} />} badge={unreadMessagesCount} onClick={() => onNavigate('messages')} />
          <QuickAction label="Child profile" icon={<UserCheck size={20} />} tone="neutral" onClick={() => onNavigate('profile')} />
        </div>
      </section>
    </div>
  );
};

export default ParentDashboard;
