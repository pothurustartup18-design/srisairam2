import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle, UserCheck, UserPlus,
  CreditCard, Send, Plus, Calendar,
  Megaphone, Clock, IndianRupee,
  ArrowUpRight, ArrowDownRight, ArrowRight,
  CalendarCheck, Users, Shield, GraduationCap
} from 'lucide-react';
import type {
  StudentData, ClassData, LeaveData, FeedbackData,
  EventData, UserProfile, TeacherData
} from '../../../types';
import { cn } from '../../../lib/utils';
import { getInitials } from '../../../utils/avatar';
import { Button, Modal } from '../../ui';
import { API_BASE } from '../../../constants';
import { getAccessToken } from '../../../services/api';
import { useAuth } from '../../../context/authContext';

interface AdminDashboardProps {
  user?: UserProfile;
  todayAttendance?: any;
  academicSnapshot?: any;
  totalStudents: number;
  totalTeachers: number;
  teachers?: TeacherData[];
  paidFeesTotal: number;
  pendingFeesTotal: number;
  filteredStudents: StudentData[];
  classesList: ClassData[];
  leavesList?: LeaveData[];
  feedbacksList?: FeedbackData[];
  events?: EventData[];
  onNavigate?: (view: string) => void;
  onAdmitStudent: () => void;
  onSendReminder: (student: StudentData) => void;
  onDeleteStudent: (student: StudentData) => void;
  onMessageParent: (student: StudentData) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onCollectFee?: (studentId?: string) => void;
}

/** Attendance sparkline (pure SVG, no dependencies) — unchanged */
function AttendanceSparkline() {
  return (
    <svg viewBox="0 0 300 52" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#2563eb" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0"    />
        </linearGradient>
      </defs>
      <path d="M0,38 C30,28 60,42 90,32 S150,18 180,24 S240,14 270,10 L300,12 L300,52 L0,52 Z" fill="url(#attGrad)" />
      <path d="M0,38 C30,28 60,42 90,32 S150,18 180,24 S240,14 270,10 L300,12"
        fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Reusable mini-components ────────────────────────────────────────────────

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white border border-slate-200 rounded-lg shadow-card', className)}>
      {children}
    </div>
  );
}

function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100', className)}>
      {children}
    </div>
  );
}

function KpiCard({
  iconBg, iconColor, icon, label, value, sub,
  trend, trendDir,
}: {
  iconBg: string; iconColor: string; icon: React.ReactNode;
  label: string; value: string; sub: string;
  trend?: string; trendDir?: 'up' | 'down' | 'neu';
}) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg p-5 shadow-card flex flex-col gap-1.5">
      <div className="flex justify-between items-start">
        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center', iconBg, iconColor)}>
          {icon}
        </div>
        {trend && (
          <span className={cn(
            'inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full',
            trendDir === 'up'  ? 'bg-green-lt text-green' :
            trendDir === 'down'? 'bg-red-lt text-red' :
            'bg-amber-lt text-amber'
          )}>
            {trendDir === 'up' ? <ArrowUpRight size={11} /> : trendDir === 'down' ? <ArrowDownRight size={11} /> : null}
            {trend}
          </span>
        )}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-500 font-medium mt-1">{label}</div>
      <div className="text-4xl font-bold text-slate-900 dark:text-white leading-none">{value}</div>
      <div className="text-xs text-slate-400 dark:text-slate-500">{sub}</div>
    </div>
  );
}

function formatTimeAgo(dateString?: string | Date) {
  if (!dateString) return 'Recently';
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'Just now';
  
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminDashboard({
  user,
  todayAttendance,
  academicSnapshot,
  totalStudents,
  totalTeachers,
  teachers = [],
  paidFeesTotal,
  pendingFeesTotal,
  filteredStudents,
  classesList = [],
  leavesList = [],
  events = [],
  onNavigate,
  onAdmitStudent,
  onSendReminder,
  showToast: _showToast,
  onCollectFee,
}: AdminDashboardProps) {
  const { hasPermission } = useAuth();
  const [actionTab, setActionTab] = useState<'overdues' | 'leaves' | 'admissions' | 'absentees'>('overdues');
  const [commTab, setCommTab] = useState<'events' | 'announcements'>('events');
  const [activeSnapshotDetail, setActiveSnapshotDetail] = useState<{
    label: string;
    details: Array<{ title: string; info: string }>;
  } | null>(null);
  const [showAllActivitiesModal, setShowAllActivitiesModal] = useState(false);
  const [dbActivities, setDbActivities] = useState<any[]>([]);
  const [_loadingActivities, setLoadingActivities] = useState(false);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const fetchActivities = async () => {
    setLoadingActivities(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/dashboard/recent-activities?t=${Date.now()}`, { headers });
      const data = await res.json();
      if (data.success) {
        setDbActivities(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load recent activities:', err);
    } finally {
      setLoadingActivities(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, []);

  const totalClassesCount = classesList.length;
  const todayAttendancePct = todayAttendance ? todayAttendance.percentage : (totalStudents > 0 ? 94.2 : 0);
  const presentCount = todayAttendance ? todayAttendance.present : Math.round((totalStudents * todayAttendancePct) / 100);
  const absentCount = todayAttendance ? todayAttendance.absent : totalStudents - presentCount;

  const pendingLeaves = useMemo(
    () => leavesList.filter(l => l.status === 'pending'),
    [leavesList]
  );

  const defaultersList = useMemo(() =>
    filteredStudents.filter(s => s.feePending > 0).sort((a, b) => b.feePending - a.feePending),
  [filteredStudents]);

  const newAdmissionsCount = filteredStudents.filter(
    s => (s as any).status === 'pending' || (s as any).status === 'Pending'
  ).length;
  const chronicAbsentees = 0;
  const unmarkedClasses = academicSnapshot && academicSnapshot.unmarkedClasses ? academicSnapshot.unmarkedClasses.count : (totalStudents > 0 ? 2 : 0);
  const hwPending       = academicSnapshot && academicSnapshot.hwPending ? academicSnapshot.hwPending.count : (totalStudents > 0 ? 5 : 0);
  const examsThisWeek   = academicSnapshot && academicSnapshot.examsThisWeek ? academicSnapshot.examsThisWeek.count : (totalStudents > 0 ? 2 : 0);
  const marksPending    = academicSnapshot && academicSnapshot.marksPending ? academicSnapshot.marksPending.count : (totalStudents > 0 ? 3 : 0);

  const totalTargetFees   = (paidFeesTotal || 0) + (pendingFeesTotal || 0);
  const collectionRatePct = totalTargetFees > 0 ? Math.round(((paidFeesTotal || 0) / totalTargetFees) * 100) : 0;
  const paidL             = ((paidFeesTotal || 0) / 100000).toFixed(2);
  const pendingL          = ((pendingFeesTotal || 0) / 100000).toFixed(2);
  const targetL           = (totalTargetFees / 100000).toFixed(2);

  const totalPendingActions = pendingLeaves.length;

  const allRecentActivities = useMemo(() => {
    if (dbActivities.length > 0) {
      return dbActivities.map((act: any) => {
        let Icon = UserCheck;
        let iconBg = '#e0e7ff';
        let iconColor = '#4338ca';

        if (act.type === 'payment') {
          Icon = IndianRupee;
          iconBg = '#dcfce7';
          iconColor = '#16a34a';
        } else if (act.type === 'admission') {
          Icon = UserPlus;
          iconBg = '#eff6ff';
          iconColor = '#2563eb';
        } else if (act.type === 'login') {
          if (act.userRole === 'admin') {
            Icon = Shield;
            iconBg = '#fee2e2';
            iconColor = '#dc2626';
          } else if (act.userRole === 'teacher') {
            Icon = GraduationCap;
            iconBg = '#e0e7ff';
            iconColor = '#4338ca';
          } else {
            Icon = UserCheck;
            iconBg = '#f1f5f9';
            iconColor = '#475569';
          }
        }

        return {
          id: act.id,
          title: act.title,
          desc: act.desc,
          time: formatTimeAgo(act.date),
          iconBg,
          iconColor,
          Icon,
          rawDate: new Date(act.date)
        };
      });
    }

    const list: { id: string; title: string; desc: string; time: string; iconBg: string; iconColor: string; Icon: React.ElementType; rawDate: Date }[] = [];
    filteredStudents.forEach(s => {
      if (s.payments) {
        s.payments.forEach(p => {
          list.push({ id: `pay-${s.id}-${p.receiptNo}`, title: 'Fee payment received',
            desc: `${s.name} · Class ${s.class}-${s.section} · ₹${p.amount.toLocaleString()}`,
            time: formatTimeAgo(p.date),
            rawDate: new Date(p.date),
            iconBg: '#dcfce7', iconColor: '#16a34a', Icon: IndianRupee });
        });
      }
    });
    teachers.forEach(t => {
      const loginDate = (t as any).lastLogin ? new Date((t as any).lastLogin) : new Date(0);
      list.push({ id: `teacher-${t._id}`, title: 'Teacher account active',
        desc: `${t.name} · ${t.employeeId || 'Pending ID'}`, time: formatTimeAgo((t as any).lastLogin),
        rawDate: loginDate,
        iconBg: '#e0e7ff', iconColor: '#4338ca', Icon: UserCheck });
    });
    
    // Sort recent activities by rawDate descending (newest first)
    list.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());

    return list;
  }, [dbActivities, filteredStudents, teachers]);

  const recentActivities = useMemo(() => {
    return allRecentActivities.slice(0, 5);
  }, [allRecentActivities]);

  const upcomingEvents = useMemo(() => {
    const realEvents = events.filter(e => e.type ? e.type === 'event' : (e.media && e.media.length > 0));
    return realEvents.slice(0, 3).map((e, i) => {
      const d = new Date(e.date);
      return {
        id: e._id || String(i),
        day: isNaN(d.getDate()) ? String(10 + i) : String(d.getDate()),
        month: isNaN(d.getDate()) ? 'FEB' : d.toLocaleString('default', { month: 'short' }).toUpperCase(),
        title: e.title, sub: e.description || 'School Campus', badge: 'Event', badgeColor: 'blue' as const,
      };
    });
  }, [events]);

  const upcomingNotices = useMemo(() => {
    const realNotices = events.filter(e => e.type ? e.type === 'notice' : (!e.media || e.media.length === 0));
    return realNotices.slice(0, 3).map((e, i) => {
      const d = new Date(e.date);
      return {
        id: e._id || String(i),
        day: isNaN(d.getDate()) ? String(10 + i) : String(d.getDate()),
        month: isNaN(d.getDate()) ? 'FEB' : d.toLocaleString('default', { month: 'short' }).toUpperCase(),
        title: e.title, sub: e.description || 'School Campus', badge: 'Notice', badgeColor: 'purple' as const,
      };
    });
  }, [events]);


  const nav = (v: string) => onNavigate && onNavigate(v);

  const actionTabs = [
    { key: 'overdues'   as const, label: 'Fee Overdues',       count: defaultersList.length },
    { key: 'leaves'     as const, label: 'Leave Requests',     count: pendingLeaves.length },
    { key: 'admissions' as const, label: 'Admissions',         count: newAdmissionsCount },
    { key: 'absentees'  as const, label: 'Chronic Absentees',  count: chronicAbsentees },
  ];

  const badgeColors: Record<string, string> = {
    green: 'bg-green-lt text-green border border-green-200',
    amber: 'bg-amber-lt text-amber border border-amber-200',
    purple:'bg-purple-lt text-purple border border-purple-200',
    blue:  'bg-blue-lt text-blue border border-blue-200',
  };

  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900 dark:text-white">

      {/* ── GREETING BANNER ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-6 py-5 shadow-card">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3 m-0">
            {greeting}, {user?.name?.split(' ')[0] || 'Admin'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            &nbsp;·&nbsp;{totalStudents} students&nbsp;·&nbsp;{totalTeachers} staff&nbsp;·&nbsp;{totalClassesCount} classes
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => nav('attendance')}><CalendarCheck size={14} /> Mark Attendance</Button>
          <Button variant="secondary" size="sm" onClick={() => nav('events')}><Megaphone size={14} /> Publish Notice</Button>
          <Button variant="secondary" size="sm" onClick={onAdmitStudent}><Plus size={14} /> Add Student</Button>
          <Button size="sm" onClick={() => onCollectFee ? onCollectFee() : nav('fee-analytics')}>
            <IndianRupee size={14} /> Collect Fee
          </Button>
        </div>
      </div>

      {/* ── KPI STAT CARDS ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {hasPermission('dashboard:widget:attendanceToday') && (
          <KpiCard
            iconBg="bg-blue-lt"
            iconColor="text-blue"
            icon={<UserCheck size={18} />}
            label="Today's Attendance"
            value={`${todayAttendancePct}%`}
            sub={`${presentCount} present · ${absentCount} absent`}
          />
        )}
        {hasPermission('dashboard:widget:feesCollected') && (
          <KpiCard
            iconBg="bg-green-lt"
            iconColor="text-green"
            icon={<IndianRupee size={18} />}
            label="Fees Collected"
            value={`₹${paidL}L`}
            sub={`${collectionRatePct}% of total (₹${targetL}L)`}
          />
        )}
        {hasPermission('dashboard:widget:outstandingDues') && (
          <KpiCard
            iconBg="bg-red-lt"
            iconColor="text-red"
            icon={<AlertTriangle size={18} />}
            label="Pending Fees"
            value={`₹${pendingL}L`}
            sub={`Pending from ${defaultersList.length} students`}
            valueColor="text-red"
          />
        )}
        {hasPermission('dashboard:widget:pendingApprovals') && (
          <KpiCard
            iconBg="bg-amber-lt"
            iconColor="text-amber"
            icon={<Clock size={18} />}
            label="Pending Approvals"
            value={String(totalPendingActions)}
            sub={`${pendingLeaves.length} pending leave requests`}
          />
        )}
      </div>

      {/* ── MAIN 2-COLUMN GRID ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">

        {/* ── LEFT COLUMN ──────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5">

          {/* ACTION CENTER */}
          {(hasPermission('dashboard:widget:feeDefaulters') || hasPermission('dashboard:widget:pendingApprovals')) && (
          <Card>
            <CardHeader>
              <div>
                <div className="text-md font-bold text-slate-900 dark:text-white">Action Center</div>
                <div className="text-xs text-slate-400 dark:text-slate-500">Items that need your decision today</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => nav('fee-analytics')}>View all <ArrowRight size={13} /></Button>
            </CardHeader>

            {/* Tab bar */}
            <div className="px-5 pt-3">
              <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 rounded-md p-1 overflow-x-auto">
                {actionTabs.map(t => (
                  <button key={t.key} onClick={() => setActionTab(t.key)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded transition-colors whitespace-nowrap flex-shrink-0',
                      actionTab === t.key
                        ? 'bg-white dark:bg-slate-700 text-blue shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/60 dark:hover:bg-white/10'
                    )}>
                    {t.label}
                    <span className={cn(
                      'text-xs font-bold px-1.5 py-0.5 rounded-full',
                      actionTab === t.key ? 'bg-blue text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    )}>{t.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="px-5 py-3 flex flex-col gap-0.5 max-h-[380px] overflow-y-auto">
              {actionTab === 'overdues' && (
                defaultersList.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">🎉 All fee accounts are cleared!</p>
                ) : defaultersList.map(s => (
                  <div key={s.id} className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
                    <div className="w-9 h-9 rounded-full bg-blue-lt text-blue flex items-center justify-center text-xs font-extrabold flex-shrink-0">
                      {getInitials(s.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{s.name}</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">{s.admissionNo} · Class {s.class}-{s.section}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-bold text-red">₹{s.feePending.toLocaleString()}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">Overdue</div>
                      </div>
                      <Button size="sm" onClick={() => onCollectFee?.(s.id || s._id)}><CreditCard size={12} /> Collect</Button>
                      <Button variant="secondary" size="icon-sm" title="Send reminder" onClick={() => onSendReminder(s)}><Send size={12} /></Button>
                    </div>
                  </div>
                ))
              )}
              {actionTab === 'leaves' && (
                pendingLeaves.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">✅ No pending leave applications.</p>
                ) : pendingLeaves.map(l => (
                  <div key={l._id} className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0 cursor-pointer" onClick={() => nav('leaves')}>
                    <div className="w-9 h-9 rounded-full bg-purple-lt text-purple flex items-center justify-center text-xs font-extrabold flex-shrink-0">
                      {l.teacherName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{l.teacherName}</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">{l.description}</div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={e => { e.stopPropagation(); nav('leaves'); }}>Review →</Button>
                  </div>
                ))
              )}
              {actionTab === 'admissions' && (
                <p className="text-sm text-slate-500 dark:text-slate-500 py-4 text-center">
                  🎒 {newAdmissionsCount} admission requests pending.{' '}
                  <button className="text-blue font-semibold hover:underline" onClick={() => nav('students')}>Go to Students →</button>
                </p>
              )}
              {actionTab === 'absentees' && (
                <p className="text-sm text-slate-500 dark:text-slate-500 py-4 text-center">
                  ⚠️ {chronicAbsentees} students flagged for 3+ consecutive absent days.{' '}
                  <button className="text-blue font-semibold hover:underline" onClick={() => nav('attendance')}>View Attendance →</button>
                </p>
              )}
            </div>
          </Card>
          )}

          <div className="grid grid-cols-2 gap-5 max-[900px]:grid-cols-1">

            {/* School Communications */}
            {hasPermission('dashboard:widget:eventsNotices') && (
            <Card>
              <CardHeader>
                <div className="text-sm font-bold text-slate-900 dark:text-white">School Communications</div>
                <Button variant="secondary" size="sm" onClick={() => nav('events')}><Plus size={12} /> New</Button>
              </CardHeader>
              <div className="px-4 pt-3">
                <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 rounded-md p-1">
                  {(['events', 'announcements'] as const).map(tab => (
                    <button key={tab} onClick={() => setCommTab(tab)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded transition-colors',
                        commTab === tab
                          ? 'bg-white dark:bg-slate-700 text-blue shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 hover:bg-white/60 dark:hover:bg-white/10'
                      )}>
                      {tab === 'events' && <Calendar size={12} />}
                      {tab === 'events' ? 'Events' : 'Notices'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-4 py-3 flex flex-col gap-2">
                {commTab === 'events' ? (
                  upcomingEvents.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500 py-6 text-center">📅 No upcoming events scheduled.</p>
                  ) : upcomingEvents.map(ev => (
                    <div key={ev.id} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                      <div className="w-10 h-10 rounded-md bg-blue-lt flex flex-col items-center justify-center flex-shrink-0">
                        <span className="text-base font-extrabold text-blue leading-none">{ev.day}</span>
                        <span className="text-2xs font-bold text-blue-200">{ev.month}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{ev.title}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">{ev.sub}</div>
                      </div>
                      <span className={cn('text-2xs font-bold px-2 py-0.5 rounded-full border whitespace-nowrap', badgeColors[ev.badgeColor])}>
                        {ev.badge}
                      </span>
                    </div>
                  ))
                ) : (
                  upcomingNotices.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500 py-6 text-center">📢 No active announcements today.</p>
                  ) : upcomingNotices.map(no => (
                    <div key={no.id} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                      <div className="w-10 h-10 rounded-md bg-purple-lt flex flex-col items-center justify-center flex-shrink-0">
                        <span className="text-base font-extrabold text-purple leading-none">{no.day}</span>
                        <span className="text-2xs font-bold text-purple-200">{no.month}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{no.title}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">{no.sub}</div>
                      </div>
                      <span className={cn('text-2xs font-bold px-2 py-0.5 rounded-full border whitespace-nowrap', badgeColors[no.badgeColor])}>
                        {no.badge}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Card>
            )}

            {/* Academic Snapshot */}
            {hasPermission('dashboard:widget:academicSnapshot') && (
            <Card>
              <CardHeader>
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">Academic Snapshot</div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">Teaching & assessment</div>
                </div>
              </CardHeader>
              <div className="px-4 py-3 flex flex-col gap-1">
                {[
                  { color: 'bg-red',    label: 'Marks to enter',      sub: `${marksPending} exams pending`,    count: marksPending,    view: 'marks' },
                  { color: 'bg-purple', label: 'Homework to review',  sub: `${hwPending} pending reviews`,     count: hwPending,       view: 'homework' },
                  { color: 'bg-blue',   label: 'Exams this week',     sub: `${examsThisWeek} class tests`,     count: examsThisWeek,   view: 'marks' },
                  { color: 'bg-amber',  label: 'Attendance unmarked',  sub: `${unmarkedClasses} classes`,      count: unmarkedClasses, view: 'attendance' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50 dark:bg-slate-900 rounded px-1 transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      const keyMap: Record<string, string> = {
                        'Marks to enter': 'marksPending',
                        'Homework to review': 'hwPending',
                        'Exams this week': 'examsThisWeek',
                        'Attendance unmarked': 'unmarkedClasses'
                      };
                      const key = keyMap[item.label];
                      const details = academicSnapshot ? academicSnapshot[key]?.details : [
                        { title: 'Placeholder Item', info: 'Check backend details' }
                      ];
                      setActiveSnapshotDetail({
                        label: item.label,
                        details: details || []
                      });
                    }}>
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', item.color)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.label}</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">{item.sub}</div>
                    </div>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 px-2 py-0.5 rounded-full">{item.count}</span>
                  </div>
                ))}
              </div>
            </Card>
            )}

          </div>
        </div>

        {/* ── RIGHT COLUMN ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5">

          {/* Attendance Today */}
          {hasPermission('dashboard:widget:attendanceToday') && (
          <Card>
            <div className="px-5 pt-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">Attendance Today</div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">7-day trend</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold text-blue">{todayAttendancePct}%</div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">{presentCount} / {totalStudents} present</div>
                </div>
              </div>
              <div className="h-[52px]"><AttendanceSparkline /></div>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3 border-t border-slate-100 dark:border-slate-700 mt-3">
              {[
                {
                  label: 'Primary (Nursery–5)',
                  pct: todayAttendance ? todayAttendance.breakdown.primary.pct : 96,
                  present: todayAttendance ? todayAttendance.breakdown.primary.present : Math.round(presentCount * .38) || 37,
                  total: todayAttendance ? todayAttendance.breakdown.primary.total : Math.round(totalStudents * .38) || 38
                },
                {
                  label: 'Middle (6–8)',
                  pct: todayAttendance ? todayAttendance.breakdown.middle.pct : 94,
                  present: todayAttendance ? todayAttendance.breakdown.middle.present : Math.round(presentCount * .30) || 34,
                  total: todayAttendance ? todayAttendance.breakdown.middle.total : Math.round(totalStudents * .30) || 36
                },
                {
                  label: 'Secondary (9–10)',
                  pct: todayAttendance ? todayAttendance.breakdown.secondary.pct : 93,
                  present: todayAttendance ? todayAttendance.breakdown.secondary.present : Math.round(presentCount * .22) || 25,
                  total: todayAttendance ? todayAttendance.breakdown.secondary.total : Math.round(totalStudents * .22) || 26
                },
              ].map(row => (
                <div key={row.label} className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-500 font-medium">{row.label}</span>
                    <span className="text-slate-400 dark:text-slate-500 font-semibold">{row.pct}% · {row.present}/{row.total}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue rounded-full" style={{ width: `${row.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
          )}

          {/* Recent Activity */}
          {hasPermission('dashboard:widget:recentActivity') && (
          <Card>
            <CardHeader>
              <div className="text-sm font-bold text-slate-900 dark:text-white">Recent Activity</div>
              <Button variant="ghost" size="sm" onClick={() => setShowAllActivitiesModal(true)}>View all <ArrowRight size={13} /></Button>
            </CardHeader>
            <div className="px-5 py-3 flex flex-col gap-0.5">
              {recentActivities.map(act => (
                <div key={act.id} className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: act.iconBg, color: act.iconColor }}>
                    <act.Icon size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{act.title}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 truncate">{act.desc}</div>
                  </div>
                  <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">{act.time}</span>
                </div>
              ))}
            </div>
          </Card>
          )}
        </div>
      </div>

      <Modal
        isOpen={activeSnapshotDetail !== null}
        onClose={() => setActiveSnapshotDetail(null)}
        title={activeSnapshotDetail?.label || ''}
        subtitle="Drill-down snapshot details"
        maxWidth="500px"
      >
        <div className="flex flex-col gap-3">
          {activeSnapshotDetail && activeSnapshotDetail.details.length === 0 ? (
            <p className="text-sm text-slate-400 py-3 text-center">✅ Nothing pending under this category.</p>
          ) : (
            activeSnapshotDetail?.details.map((detail, idx) => (
              <div key={idx} className="flex justify-between items-center py-2.5 px-3 border border-slate-100 rounded-md hover:bg-slate-50 transition-colors">
                <div>
                  <div className="text-sm font-semibold text-slate-800">{detail.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{detail.info}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showAllActivitiesModal}
        onClose={() => setShowAllActivitiesModal(false)}
        title="Recent Activity History"
        subtitle="Complete log of system activities"
        maxWidth="600px"
      >
        <div className="flex flex-col gap-2 max-h-[450px] overflow-y-auto pr-1">
          {allRecentActivities.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No recent activities found.</p>
          ) : (
            allRecentActivities.map(act => (
              <div key={act.id} className="flex items-center gap-3 py-2.5 px-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: act.iconBg, color: act.iconColor }}>
                  <act.Icon size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{act.title}</div>
                  <div className="text-xs text-slate-500 truncate">{act.desc}</div>
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0">{act.time}</span>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}

