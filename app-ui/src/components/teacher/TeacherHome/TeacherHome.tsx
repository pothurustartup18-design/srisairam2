import {
  ArrowRight, Award, BarChart3, BookOpenCheck, CalendarCheck, CalendarDays, CheckCircle2,
  MessageSquare, TriangleAlert, Users, UserX, Bell,
} from 'lucide-react';
import type { StudentData } from '../../../types';
import { Card, SectionHeader, StatTile, QuickAction, ListRow, Button } from '../../ui';
import { getAvatarColors, getInitials } from '../../../utils/avatar';
import { cn } from '../../../lib/utils';

interface TeacherHomeProps {
  teacherName: string;
  classLabel: string;
  isClassTeacher: boolean;
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  attendanceRate: number;
  isAttendanceMarked: boolean;
  lowAttendance: { student: StudentData; pct: number }[];
  unreadMessages: number;
  /** View keys this teacher is allowed to open. */
  available: Set<string>;
  onMarkAttendance: () => void;
  onNavigate: (view: string) => void;
  /** Row tap on an at-risk student (roster for class teachers, otherwise message parent). */
  onStudentTap: (student: StudentData) => void;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Ring showing today's attendance rate. */
function RateRing({ value, marked }: { value: number; marked: boolean }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const pct = marked ? value : 0;
  const color = !marked ? 'rgb(var(--line-strong))' : value >= 75 ? 'rgb(var(--success))' : 'rgb(var(--warning))';
  return (
    <div className="relative w-[76px] h-[76px] shrink-0" aria-hidden="true">
      <svg width="76" height="76" viewBox="0 0 76 76">
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgb(var(--surface-3))" strokeWidth="7" />
        <circle
          cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 38 38)"
          style={{ transition: 'stroke-dashoffset .6s var(--ease-out)' }}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-extrabold text-ink leading-none tabular">{marked ? `${value}%` : '—'}</span>
        <span className="text-2xs font-semibold text-muted mt-0.5">present</span>
      </span>
    </div>
  );
}

export default function TeacherHome({
  teacherName, classLabel, isClassTeacher, totalStudents, presentCount, absentCount,
  attendanceRate, isAttendanceMarked, lowAttendance, unreadMessages, available,
  onMarkAttendance, onNavigate, onStudentTap,
}: TeacherHomeProps) {
  const firstName = teacherName.split(' ')[0] || 'Teacher';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const rosterView = isClassTeacher ? 'students' : 'attendance';

  const actions = [
    { key: 'attendance', label: 'Attendance', icon: <CalendarCheck size={20} />, tone: 'brand' as const, onClick: onMarkAttendance },
    { key: 'marks', label: 'Marks entry', icon: <Award size={20} />, tone: 'warning' as const },
    { key: 'homework', label: 'Homework', icon: <BookOpenCheck size={20} />, tone: 'success' as const },
    { key: 'messages', label: 'Messages', icon: <MessageSquare size={20} />, tone: 'brand' as const, badge: unreadMessages },
    { key: 'students', label: 'Class roster', icon: <Users size={20} />, tone: 'neutral' as const },
    { key: 'analytics', label: 'Exam analytics', icon: <BarChart3 size={20} />, tone: 'neutral' as const },
    { key: 'leaves', label: 'Leave requests', icon: <CalendarDays size={20} />, tone: 'neutral' as const },
    { key: 'notices', label: 'Notices', icon: <Bell size={20} />, tone: 'neutral' as const },
  ].filter((a) => available.has(a.key));

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* Greeting */}
      <header className="flex flex-col gap-1">
        <p className="m-0 text-xs font-semibold text-muted">{today}</p>
        <h1 className="m-0 text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
          {greeting()}, {firstName}
        </h1>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-accent-soft text-accent-ink text-xs font-bold">
            {isClassTeacher ? 'Class teacher' : 'Subject teacher'}
          </span>
          <span className="inline-flex items-center h-7 px-2.5 rounded-full bg-surface border border-line text-xs font-semibold text-ink-2">
            {classLabel}
          </span>
        </div>
      </header>

      {/* Today's register — the primary task */}
      <Card className={cn('relative overflow-hidden', !isAttendanceMarked && 'border-amber-200 dark:border-amber-900/60')}>
        <div className="flex items-center gap-4">
          <RateRing value={attendanceRate} marked={isAttendanceMarked} />
          <div className="flex-1 min-w-0">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-xs font-bold',
                isAttendanceMarked ? 'text-success' : 'text-warning',
              )}
            >
              {isAttendanceMarked ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
              {isAttendanceMarked ? 'Register submitted' : 'Roll call due'}
            </span>
            <h2 className="m-0 mt-1 text-lg font-bold text-ink leading-snug">
              {isAttendanceMarked ? "Today's attendance is complete" : "Today's attendance is pending"}
            </h2>
            <p className="m-0 mt-0.5 text-sm text-muted">
              {isAttendanceMarked
                ? `${presentCount} present · ${absentCount} absent of ${totalStudents}`
                : totalStudents > 0
                  ? `${totalStudents} students in ${classLabel} are waiting for roll call`
                  : 'Daily roll call has not been recorded yet'}
            </p>
          </div>
        </div>
        <Button
          className="w-full mt-4 sm:w-auto"
          variant={isAttendanceMarked ? 'secondary' : 'primary'}
          onClick={onMarkAttendance}
        >
          {isAttendanceMarked ? 'View or edit register' : 'Mark attendance now'}
          <ArrowRight size={16} />
        </Button>
      </Card>

      {/* Key figures */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Enrolled" value={totalStudents} icon={<Users size={15} />} onClick={() => onNavigate(rosterView)} />
        <StatTile
          label="Present today" value={isAttendanceMarked ? presentCount : '—'} tone="success"
          icon={<CheckCircle2 size={15} />} onClick={onMarkAttendance}
        />
        <StatTile
          label="Absent today" value={isAttendanceMarked ? absentCount : '—'} tone="danger"
          icon={<UserX size={15} />} onClick={onMarkAttendance}
        />
        <StatTile
          label="At risk (<75%)" value={lowAttendance.length} tone="warning"
          icon={<TriangleAlert size={15} />} onClick={() => onNavigate(rosterView)}
        />
      </div>

      {unreadMessages > 0 && available.has('messages') && (
        <button
          type="button"
          onClick={() => onNavigate('messages')}
          className="flex items-center gap-3 w-full p-3.5 rounded-xl border border-blue-200 bg-blue-50 text-left hover:bg-blue-100 transition-colors dark:bg-blue-900/30 dark:border-blue-800"
        >
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-600 text-white shrink-0">
            <MessageSquare size={18} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-ink">
              {unreadMessages} unread parent message{unreadMessages > 1 ? 's' : ''}
            </span>
            <span className="block text-xs text-muted">Review and reply</span>
          </span>
          <ArrowRight size={16} className="text-blue-600 shrink-0" />
        </button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-5 items-start">
        {/* At-risk students */}
        <section className="lg:col-span-3 flex flex-col gap-3">
          <SectionHeader
            title="Students needing attention"
            subtitle="Attendance below 75% this term"
            actionLabel={lowAttendance.length > 0 ? `View all (${lowAttendance.length})` : undefined}
            onAction={() => onNavigate(rosterView)}
          />
          <Card flush className="overflow-hidden">
            {lowAttendance.length === 0 ? (
              <div className="flex items-center gap-3 p-4">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-success-soft text-success shrink-0">
                  <CheckCircle2 size={18} />
                </span>
                <div>
                  <p className="m-0 text-sm font-bold text-ink">Everyone is in good standing</p>
                  <p className="m-0 text-xs text-muted">Every student has at least 75% attendance.</p>
                </div>
              </div>
            ) : (
              <ul className="m-0 p-0 list-none divide-y divide-line">
                {lowAttendance.slice(0, 5).map(({ student: s, pct }) => {
                  const [bg, fg] = getAvatarColors(s.name);
                  const danger = pct < 50;
                  return (
                    <li key={s.id || s._id}>
                      <ListRow
                        onClick={() => onStudentTap(s)}
                        leading={
                          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full text-xs font-bold" style={{ background: bg, color: fg }}>
                            {getInitials(s.name)}
                          </span>
                        }
                        title={s.name}
                        subtitle={
                          <span className="flex items-center gap-2">
                            <span className="truncate">{s.admissionNo}</span>
                            <span className="flex-1 max-w-[120px] h-1.5 rounded-full bg-surface-3 overflow-hidden">
                              <span
                                className={cn('block h-full rounded-full', danger ? 'bg-danger' : 'bg-warning')}
                                style={{ width: `${Math.max(5, Math.min(100, pct))}%` }}
                              />
                            </span>
                          </span>
                        }
                        trailing={
                          <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full tabular', danger ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
                            {pct}%
                          </span>
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>

        {/* Shortcuts */}
        {actions.length > 0 && (
          <section className="lg:col-span-2 flex flex-col gap-3">
            <SectionHeader title="Quick actions" />
            <div className="grid grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-2 max-[359px]:grid-cols-3">
              {actions.map((a) => (
                <QuickAction
                  key={a.key}
                  label={a.label}
                  icon={a.icon}
                  tone={a.tone}
                  badge={a.badge}
                  onClick={a.onClick ?? (() => onNavigate(a.key))}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
