import React, { useState, useEffect } from 'react';
import {
  Download, Users, UserCheck, UserX, BarChart3,
  ClipboardCheck, Eye, FileBarChart, CheckCircle2, XCircle, AlertTriangle,
  Calendar, Search, ChevronRight, X,
} from 'lucide-react';
import type { StudentData } from '../../../types';
import { API_BASE, formatClassName } from '../../../constants';
import { getAccessToken } from '../../../services/api';
import { cn, getLocalToday, getLocalMonth } from '../../../lib/utils';
import { getAvatarColors, getInitials } from '../../../utils/avatar';
import {
  Button, KpiCard, PageHeader, Badge, DataTable, Th, Td, Tr,
  FilterToolbar, FilterGroup, filterControlClass,
  EmptyState, LoadingSpinner, MobileRowCard, MobileCardList,
  Drawer, inputClass,
} from '../../ui';
import { Form } from '../../ui/Form';
import { RefreshNotice } from '../../ui/DataState';
import { SkeletonTableRows } from '../../ui/Skeleton';

interface MonthlyReportRow {
  studentId: string;
  name: string;
  admissionNo: string;
  workingDays: number;
  present: number;
  absent: number;
  percentage: number;
  cluster?: string;
}

interface DefaulterRow {
  studentId: string;
  name: string;
  admissionNo: string;
  present: number;
  total: number;
  percentage: number;
  cluster?: string;
}

interface TeacherAttendanceProps {
  students: StudentData[];
  teacherId?: string;
  attendanceDate: string;
  attendanceMap: Record<string, 'present' | 'absent'>;
  isAlreadyMarked: boolean;
  onDateChange: (date: string) => void;
  onToggleAttendance: (studentId: string, status: 'present' | 'absent') => void;
  onSubmitAttendance: (e: React.FormEvent) => void;
  /** Whether the register for the selected date has loaded; submitting is blocked until it has. */
  registerStatus?: 'loading' | 'success' | 'error';
  onRetryRegister?: () => unknown;
  attendanceMode?: 'full' | 'half-day';
  morningMap?: Record<string, 'present' | 'absent'>;
  afternoonMap?: Record<string, 'present' | 'absent'>;
  onToggleMorning?: (studentId: string, status: 'present' | 'absent') => void;
  onToggleAfternoon?: (studentId: string, status: 'present' | 'absent') => void;
}

const TeacherAttendance: React.FC<TeacherAttendanceProps> = ({
  students,
  teacherId,
  attendanceDate,
  attendanceMap,
  isAlreadyMarked,
  onDateChange,
  onToggleAttendance,
  onSubmitAttendance,
  registerStatus = 'success',
  onRetryRegister,
  attendanceMode = 'full',
  morningMap = {},
  afternoonMap = {},
  onToggleMorning,
  onToggleAfternoon,
}) => {
  const [viewMode, setViewMode] = useState<'mark' | 'view' | 'reports'>('mark');

  // ─── Mobile Quick Filter & Search states ────────────────────────────────────
  const [registerSearch, setRegisterSearch] = useState('');
  const [registerFilter, setRegisterFilter] = useState<'all' | 'present' | 'absent'>('all');
  const [reportSearch, setReportSearch] = useState('');
  const [reportFilter, setReportFilter] = useState<'all' | 'defaulters' | 'good'>('all');

  // ─── Reports state ────────────────────────────────────────────────────────
  const [reportMonth, setReportMonth] = useState(getLocalMonth());
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReportRow[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [defaulterThreshold, setDefaulterThreshold] = useState(75);
  const [defaulters, setDefaulters] = useState<DefaulterRow[]>([]);
  const [loadingDefaulters, setLoadingDefaulters] = useState(false);

  // --- Attendance History Drawer State ---
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string; admissionNo: string; class: string; section: string } | null>(null);
  const [historyList, setHistoryList] = useState<Array<{ date: string; status: 'present' | 'absent'; morningStatus?: string; afternoonStatus?: string }>>([]);
  const [loadingHistoryList, setLoadingHistoryList] = useState(false);

  const handleOpenHistory = async (studentInfo: { id?: string; studentId?: string; name: string; admissionNo: string }) => {
    const id = studentInfo.id || studentInfo.studentId;
    if (!id) return;

    // Find the full student object from the props to read class and section
    const fullStudent = students.find(s => s.id === id);
    const student = {
      id,
      name: studentInfo.name,
      admissionNo: studentInfo.admissionNo,
      class: fullStudent?.class || '',
      section: fullStudent?.section || '',
    };

    setSelectedStudent(student);
    setLoadingHistoryList(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/attendance/history/student/${id}`, { headers });
      const data = await res.json();
      if (data.success) {
        setHistoryList(data.data || []);
      }
    } catch {
      // silently fail; no showToast prop available here
    } finally {
      setLoadingHistoryList(false);
    }
  };

  const loadMonthlyReport = async () => {
    if (!teacherId) { setMonthlyReport([]); return; }
    setLoadingReport(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/attendance/report/monthly?teacherId=${teacherId}&month=${reportMonth}`, { headers });
      const data = await res.json();
      if (data.success) setMonthlyReport(data.data);
    } catch {
      // silent — table shows empty state
    } finally {
      setLoadingReport(false);
    }
  };

  const loadDefaulters = async () => {
    if (!teacherId) { setDefaulters([]); return; }
    setLoadingDefaulters(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/attendance/report/defaulters?teacherId=${teacherId}&threshold=${defaulterThreshold}`, { headers });
      const data = await res.json();
      if (data.success) setDefaulters(data.data);
    } catch {
      // silent — table shows empty state
    } finally {
      setLoadingDefaulters(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'reports') {
      loadMonthlyReport();
      loadDefaulters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, teacherId, reportMonth, defaulterThreshold]);

  const handleDownloadMonthlyCsv = async () => {
    if (!teacherId) return;
    setDownloadingCsv(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/attendance/report/monthly?teacherId=${teacherId}&month=${reportMonth}&format=csv`, { headers });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_${reportMonth}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // silently fail; no showToast prop available here
    } finally {
      setDownloadingCsv(false);
    }
  };

  const todayStr = getLocalToday();
  const isPastDate = attendanceDate < todayStr;

  // Compute stats
  const total = students.length;
  const presentCount = attendanceMode === 'half-day'
    ? students.reduce((acc, s) => {
        let count = 0;
        if ((morningMap[s.id] || 'present') === 'present') count += 0.5;
        if ((afternoonMap[s.id] || 'present') === 'present') count += 0.5;
        return acc + count;
      }, 0)
    : students.filter(s => attendanceMap[s.id] === 'present' || !attendanceMap[s.id]).length;
  const absentCount = total - presentCount;
  const attendanceRate = total > 0 ? Math.round((presentCount / total) * 100) : 0;

  // ─── Mobile Filtered Lists (Instant Search & Filter without endless scrolling)
  const filteredRegisterStudents = students.filter((s) => {
    const status = attendanceMap[s.id] || 'present';
    const morningStatus = morningMap[s.id] || 'present';
    const afternoonStatus = afternoonMap[s.id] || 'present';

    if (registerFilter === 'present') {
      if (attendanceMode === 'half-day') {
        if (morningStatus !== 'present' && afternoonStatus !== 'present') return false;
      } else {
        if (status !== 'present') return false;
      }
    } else if (registerFilter === 'absent') {
      if (attendanceMode === 'half-day') {
        if (morningStatus !== 'absent' && afternoonStatus !== 'absent') return false;
      } else {
        if (status !== 'absent') return false;
      }
    }

    if (registerSearch.trim()) {
      const q = registerSearch.toLowerCase();
      const matchName = (s.name || '').toLowerCase().includes(q);
      const matchAdm = (s.admissionNo || '').toLowerCase().includes(q);
      return matchName || matchAdm;
    }
    return true;
  });

  const reportDefaultersCount = monthlyReport.filter(r => r.percentage < 75).length;
  const reportGoodCount = monthlyReport.length - reportDefaultersCount;

  const filteredReportRows = monthlyReport.filter((row) => {
    if (reportFilter === 'defaulters' && row.percentage >= 75) return false;
    if (reportFilter === 'good' && row.percentage < 75) return false;

    if (reportSearch.trim()) {
      const q = reportSearch.toLowerCase();
      const matchName = (row.name || '').toLowerCase().includes(q);
      const matchAdm = (row.admissionNo || '').toLowerCase().includes(q);
      return matchName || matchAdm;
    }
    return true;
  });

  // ─── Student row — avatar + name cell + View History Trigger ───────────────
  const renderStudentCell = (studentInfo: { id?: string; studentId?: string; name: string; admissionNo: string; cluster?: string }) => {
    const name = studentInfo.name;
    const cluster = studentInfo.cluster;
    const [bg, fg] = getAvatarColors(name);
    return (
      <div className="flex items-center justify-between w-full group">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0"
            style={{ background: bg, color: fg }}
          >
            {getInitials(name)}
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">{name}</div>
            {cluster && <div className="text-xs text-slate-400">📍 {cluster}</div>}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleOpenHistory(studentInfo);
          }}
          className="mr-2 opacity-60 group-hover:opacity-100 p-1 hover:bg-slate-100 rounded text-blue transition-all cursor-pointer flex items-center gap-1 text-[11px] font-bold"
          title="View Attendance History"
        >
          <Eye size={12} /> History
        </button>
      </div>
    );
  };

  // ─── Reusable toggle widget (same dimensions/behavior as Admin) ────────────
  const renderToggle = (currentStatus: 'present' | 'absent', onChange: () => void) => (
    <div className="flex items-center justify-center gap-2.5">
      <label className={cn('inline-flex items-center gap-2.5', isPastDate ? 'cursor-not-allowed' : 'cursor-pointer select-none')}>
        <input
          type="checkbox"
          checked={currentStatus === 'present'}
          disabled={isPastDate}
          onChange={onChange}
          className="hidden"
        />
        <div className={cn(
          'w-[50px] h-[26px] rounded-full p-[2px] relative transition-colors duration-200',
          'shadow-[inset_0_1px_3px_rgba(0,0,0,0.15)]',
          currentStatus === 'present' ? 'bg-[#10b981]' : 'bg-[#ef4444]',
          isPastDate && 'cursor-not-allowed'
        )}>
          <div className={cn(
            'w-[22px] h-[22px] bg-white rounded-full absolute shadow-[0_1px_3px_rgba(0,0,0,0.3)]',
            'transition-[left] duration-200',
            currentStatus === 'present' ? 'left-[26px]' : 'left-[2px]'
          )} />
        </div>
        <span className={cn(
          'inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border',
          currentStatus === 'present'
            ? 'bg-green-50 text-green-800 border-green-200'
            : 'bg-red-lt text-red-700 border-red-200'
        )}>
          {currentStatus === 'present'
            ? <><CheckCircle2 size={12} /> Present</>
            : <><XCircle size={12} /> Absent</>
          }
        </span>
      </label>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 md:gap-5 font-sans text-slate-900">

      {/* ── Mobile Compact Header & Bar (< 768px) ── */}
      <div className="md:hidden flex flex-col gap-2.5">
        {/* Mode Selector & Date in 1 clean row */}
        <div className="flex flex-col gap-2">
          <div className="flex bg-surface-3 p-1 rounded-xl" role="tablist" aria-label="Attendance view">
            {([
              { mode: 'mark', label: 'Mark' },
              { mode: 'view', label: 'Register' },
              { mode: 'reports', label: 'Reports' },
            ] as const).map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                role="tab"
                aria-selected={viewMode === mode}
                className={cn(
                  'flex-1 min-h-[40px] px-3 rounded-lg text-sm font-semibold transition-colors',
                  viewMode === mode
                    ? 'bg-surface text-blue-700 shadow-card dark:text-blue-300'
                    : 'text-muted'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {viewMode !== 'reports' ? (
            <input
              type="date"
              className={cn(inputClass, 'font-semibold')}
              aria-label="Attendance date"
              value={attendanceDate}
              max={todayStr}
              onChange={(e) => onDateChange(e.target.value)}
            />
          ) : (
            <input
              type="month"
              className={cn(inputClass, 'font-semibold')}
              aria-label="Report month"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
            />
          )}
        </div>

        {/* Compact Quick Stats Bar */}
        {viewMode !== 'reports' && (
          <div className="flex items-center justify-between bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span className="font-semibold text-slate-500">
                Total: <b className="text-slate-800">{total}</b>
              </span>
              <span className="font-semibold text-emerald-600">
                ● <b className="text-emerald-700">{presentCount} Present</b>
              </span>
              <span className="font-semibold text-rose-500">
                ● <b className="text-rose-600">{absentCount} Absent</b>
              </span>
            </div>
            <span className="font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px]">
              {attendanceRate}%
            </span>
          </div>
        )}
      </div>

      {/* ── DESKTOP PAGE HEADER (hidden on mobile) ───────────────────────────── */}
      <div className="hidden md:block">
        <PageHeader
          title="Daily Attendance Register"
          subtitle="Mark, view, and report attendance for your assigned class."
          actions={
            <div className="flex gap-1 bg-slate-100 rounded-md p-1 w-full sm:w-auto">
              {([
                { mode: 'mark',    icon: <ClipboardCheck size={15} />, label: 'Mark Attendance' },
                { mode: 'view',    icon: <Eye size={15} />,            label: 'View Register' },
                { mode: 'reports', icon: <FileBarChart size={15} />,   label: 'Reports' },
              ] as const).map(({ mode, icon, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  title={label}
                  className={cn(
                    'flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-2 sm:px-3.5 h-11 sm:h-auto sm:py-2 rounded text-sm font-semibold transition-all whitespace-nowrap',
                    viewMode === mode
                      ? 'bg-white text-blue shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                  )}
                >
                  {icon} <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          }
        />
      </div>

      {/* ── DESKTOP FILTER TOOLBAR (hidden on mobile) ────────────────────────── */}
      <div className="hidden md:block">
        <FilterToolbar>
          {viewMode !== 'reports' ? (
            <FilterGroup label="Date">
              <input
                type="date"
                className={cn(filterControlClass, 'min-w-[170px]')}
                value={attendanceDate}
                max={todayStr}
                onChange={(e) => onDateChange(e.target.value)}
              />
            </FilterGroup>
          ) : (
            <>
              <FilterGroup label="Month">
                <input type="month" className={cn(filterControlClass, 'w-40')}
                  value={reportMonth} onChange={e => setReportMonth(e.target.value)} />
              </FilterGroup>
              <FilterGroup label="Threshold (%)">
                <input type="number" min={0} max={100} className={cn(filterControlClass, 'w-24')}
                  value={defaulterThreshold} onChange={e => setDefaulterThreshold(Number(e.target.value) || 0)} />
              </FilterGroup>
              <div className="flex gap-2 items-end ml-auto">
                <Button variant="secondary" onClick={handleDownloadMonthlyCsv}
                  disabled={downloadingCsv || monthlyReport.length === 0} loading={downloadingCsv}>
                  <Download size={14} /> Download CSV
                </Button>
              </div>
            </>
          )}
        </FilterToolbar>
      </div>

      {/* ── ALERT banners ───────────────────────────────────────────────────── */}
      {viewMode === 'mark' && isPastDate && (
        <div className="flex items-center gap-2.5 px-4 py-3 bg-blue-lt border border-blue-200 border-l-4 border-l-blue rounded-md text-blue-700 text-sm font-semibold">
          <AlertTriangle size={16} />
          Viewing archived attendance records. Editing is disabled for past dates.
        </div>
      )}
      {viewMode === 'mark' && !isPastDate && isAlreadyMarked && (
        <div className="flex items-center gap-2.5 px-4 py-3 bg-amber-lt border border-amber-200 border-l-4 border-l-amber rounded-md text-amber-800 text-sm font-semibold">
          <AlertTriangle size={16} />
          Attendance already submitted for this date. You are editing the saved record.
        </div>
      )}

      {/* ── KPI STRIP (Desktop only) ─────────────────────────────────────────── */}
      {viewMode !== 'reports' && (
        <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Students" value={total}
            icon={<Users size={17} />} iconBg="bg-purple-lt" iconColor="text-purple" />
          <KpiCard label="Present" value={presentCount}
            subtext={`${attendanceRate}% rate`}
            icon={<UserCheck size={17} />} iconBg="bg-green-lt" iconColor="text-green" valueColor="text-green" />
          <KpiCard label="Absent" value={absentCount} subtext="students today"
            icon={<UserX size={17} />} iconBg="bg-red-lt" iconColor="text-red" valueColor="text-red" />
          <KpiCard label="Attendance Rate" value={`${attendanceRate}%`}
            icon={<BarChart3 size={17} />} iconBg="bg-blue-lt" iconColor="text-blue" valueColor="text-blue" />
        </div>
      )}

      {/* ── REPORTS VIEW ────────────────────────────────────────────────────── */}
      {viewMode === 'reports' ? (
        <div className="flex flex-col gap-6">
          <div>
            {/* Desktop/tablet table */}
            <div className="hidden md:block">
              <DataTable
                card
                header={
                  <div>
                    <div className="text-md font-bold text-slate-900">Monthly Attendance Report</div>
                    <div className="text-sm text-slate-500">{reportMonth}</div>
                  </div>
                }
              >
                <thead>
                  <tr>
                    <Th>Admission ID</Th>
                    <Th>Student Name</Th>
                    <Th className="text-center">Working Days</Th>
                    <Th className="text-center">Present</Th>
                    <Th className="text-center">Absent</Th>
                    <Th className="text-center">Attendance %</Th>
                  </tr>
                </thead>
                <tbody>
                  {loadingReport ? (
                    <tr><Td colSpan={6}><LoadingSpinner fullPage /></Td></tr>
                  ) : monthlyReport.length === 0 ? (
                    <tr><Td colSpan={6}><EmptyState title={`No registers found for ${reportMonth}`} /></Td></tr>
                  ) : (
                    monthlyReport.map(row => (
                      <Tr key={row.studentId}>
                        <Td><span className="text-sm font-semibold text-slate-700">{row.admissionNo}</span></Td>
                        <Td>{renderStudentCell(row)}</Td>
                        <Td className="text-center font-semibold">{row.workingDays}</Td>
                        <Td className="text-center"><Badge variant="green">{row.present}</Badge></Td>
                        <Td className="text-center"><Badge variant="red">{row.absent}</Badge></Td>
                        <Td className="text-center font-bold">{row.percentage}%</Td>
                      </Tr>
                    ))
                  )}
                </tbody>
              </DataTable>
            </div>

            {/* Mobile compact iOS-style grouped list */}
            <div className="md:hidden flex flex-col gap-3">
              {/* Header + Quick Search + Filter chips */}
              <div className="flex flex-col gap-2">
                <div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-slate-100">Monthly Attendance Report</div>
                  <div className="text-xs text-slate-500">{reportMonth} · {monthlyReport.length} Students</div>
                </div>

                {/* Search & Filter Toolbar */}
                <div className="flex flex-col gap-2">
                  <div className="relative flex items-center">
                    <Search size={14} className="absolute left-3 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search by name or admission..."
                      value={reportSearch}
                      onChange={(e) => setReportSearch(e.target.value)}
                      className="w-full pl-8 pr-8 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-2xs"
                    />
                    {reportSearch && (
                      <button
                        type="button"
                        onClick={() => setReportSearch('')}
                        className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-0.5"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                    <button
                      type="button"
                      onClick={() => setReportFilter('all')}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shrink-0',
                        reportFilter === 'all'
                          ? 'bg-slate-900 text-white dark:bg-blue-600'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                      )}
                    >
                      All ({monthlyReport.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportFilter('defaulters')}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5',
                        reportFilter === 'defaulters'
                          ? 'bg-rose-600 text-white'
                          : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50 dark:bg-slate-800 dark:text-rose-400 dark:border-rose-900/40'
                      )}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      At Risk &lt;75% ({reportDefaultersCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportFilter('good')}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5',
                        reportFilter === 'good'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50 dark:bg-slate-800 dark:text-emerald-400 dark:border-emerald-900/40'
                      )}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Good ≥75% ({reportGoodCount})
                    </button>
                  </div>
                </div>
              </div>

              {loadingReport ? (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm"><LoadingSpinner fullPage /></div>
              ) : monthlyReport.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm"><EmptyState title={`No registers found for ${reportMonth}`} /></div>
              ) : filteredReportRows.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center shadow-sm">
                  <p className="text-xs text-slate-500">No students match your search or filter.</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 rounded-2xl shadow-sm divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
                  {filteredReportRows.map((row) => {
                    const [bg, fg] = getAvatarColors(row.name);
                    return (
                      <div
                        key={row.studentId}
                        onClick={() => handleOpenHistory(row)}
                        className="flex items-center justify-between px-3.5 py-2.5 hover:bg-slate-50/80 active:bg-slate-100/70 transition-colors cursor-pointer gap-2.5"
                      >
                        {/* Left: Avatar + Name + Adm / Working days */}
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs"
                            style={{ background: bg, color: fg }}
                          >
                            {getInitials(row.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13.5px] font-bold text-slate-900 dark:text-slate-100 truncate">{row.name}</div>
                            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                              Adm: {row.admissionNo} · {row.present}/{row.workingDays} days{row.cluster ? ` · 📍 ${row.cluster}` : ''}
                            </div>
                          </div>
                        </div>

                        {/* Right: Percentage Badge + Chevron */}
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant={row.percentage >= 75 ? 'green' : 'red'}
                            className="font-bold text-[11px] px-2 py-0.5"
                          >
                            {row.percentage}%
                          </Badge>
                          <ChevronRight size={15} className="text-slate-400 shrink-0" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="hidden md:block">
              <DataTable
                card
                header={
                  <div>
                    <div className="text-md font-bold text-slate-900">Attendance Defaulters</div>
                    <div className="text-sm text-slate-500">All-time · below threshold</div>
                  </div>
                }
              >
                <thead>
                  <tr>
                    <Th>Admission ID</Th>
                    <Th>Student Name</Th>
                    <Th className="text-center">Present / Total</Th>
                    <Th className="text-center">Attendance %</Th>
                  </tr>
                </thead>
                <tbody>
                  {loadingDefaulters ? (
                    <tr><Td colSpan={4}><LoadingSpinner fullPage /></Td></tr>
                  ) : defaulters.length === 0 ? (
                    <tr><Td colSpan={4}><EmptyState title={`No students below ${defaulterThreshold}%`} /></Td></tr>
                  ) : (
                    defaulters.map(row => (
                      <Tr key={row.studentId}>
                        <Td><span className="text-sm font-semibold text-slate-700">{row.admissionNo}</span></Td>
                        <Td>{renderStudentCell(row)}</Td>
                        <Td className="text-center font-semibold">{row.present} / {row.total}</Td>
                        <Td className="text-center"><Badge variant="red" className="font-bold">{row.percentage}%</Badge></Td>
                      </Tr>
                    ))
                  )}
                </tbody>
              </DataTable>
            </div>

            <div className="md:hidden flex flex-col gap-2.5">
              <div>
                <div className="text-base font-extrabold text-slate-900 dark:text-slate-100">Attendance Defaulters</div>
                <div className="text-xs text-slate-500">All-time · below threshold ({defaulters.length})</div>
              </div>
              {loadingDefaulters ? (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-6"><LoadingSpinner fullPage /></div>
              ) : defaulters.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-6"><EmptyState title={`No students below ${defaulterThreshold}%`} /></div>
              ) : (
                <div className="bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 rounded-2xl shadow-sm divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
                  {defaulters.map((row) => {
                    const [bg, fg] = getAvatarColors(row.name);
                    return (
                      <div
                        key={row.studentId}
                        onClick={() => handleOpenHistory(row)}
                        className="flex items-center justify-between px-3.5 py-2.5 hover:bg-slate-50/80 active:bg-slate-100/70 transition-colors cursor-pointer gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs"
                            style={{ background: bg, color: fg }}
                          >
                            {getInitials(row.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13.5px] font-bold text-slate-900 dark:text-slate-100 truncate">{row.name}</div>
                            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                              Adm: {row.admissionNo} · {row.present}/{row.total} days
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="red" className="font-bold text-[11px] px-2 py-0.5">
                            {row.percentage}%
                          </Badge>
                          <ChevronRight size={15} className="text-slate-400 shrink-0" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Clearance for floating tab bar */}
              <div style={{ height: '90px' }} />
            </div>
          </div>
        </div>

      ) : viewMode === 'mark' ? (
        /* ── MARK ATTENDANCE ────────────────────────────────────────────────── */
        <Form onSubmit={onSubmitAttendance} className="flex flex-col gap-4">
          {registerStatus === 'loading' && (
            <div role="status" className="flex items-center gap-2 text-sm font-semibold text-slate-500">
              <LoadingSpinner size="sm" /> Loading the register for this date…
            </div>
          )}
          {registerStatus === 'error' && (
            <RefreshNotice error="The saved register for this date couldn’t be loaded, so submitting is paused." onRetry={onRetryRegister} />
          )}
          {/* Desktop/tablet table */}
          <div className="hidden md:block">
            <DataTable
              card
              header={
                <div>
                  <div className="text-md font-bold text-slate-900">
                    {attendanceMode === 'half-day' ? 'Half-Day Attendance Register' : 'Daily Attendance Register'}
                  </div>
                  <div className="text-sm text-slate-500">{total} of {total} students</div>
                </div>
              }
              footer={
                students.length > 0 && !isPastDate ? (
                  <div className="flex items-center justify-between gap-4 px-2 py-1">
                    <div className="text-sm text-slate-500">
                      <strong className="text-slate-900">{presentCount}</strong> present ·{' '}
                      <strong className="text-slate-900">{absentCount}</strong> absent ·{' '}
                      {total} total
                    </div>
                    <Button type="submit" className="min-w-[200px]" disabled={registerStatus !== 'success'}>
                      <CheckCircle2 size={16} /> Submit Attendance Register
                    </Button>
                  </div>
                ) : isPastDate ? (
                  <div className="flex items-center gap-2 px-2 py-1 text-blue text-sm font-semibold">
                    <AlertTriangle size={15} /> Viewing past record — editing disabled for past dates.
                  </div>
                ) : null
              }
            >
              <thead>
                <tr>
                  <Th style={{ width: '130px' }}>Admission ID</Th>
                  <Th>Student Name</Th>
                  <Th style={{ width: '110px' }}>Class</Th>
                  {attendanceMode === 'half-day' ? (
                    <>
                      <Th className="text-center" style={{ width: '200px' }}>Morning Session</Th>
                      <Th className="text-center" style={{ width: '200px' }}>Afternoon Session</Th>
                    </>
                  ) : (
                    <Th className="text-center" style={{ width: '220px' }}>Attendance</Th>
                  )}
                </tr>
              </thead>
              <tbody>
                {students.length === 0 && registerStatus === 'loading' ? (
                  <SkeletonTableRows rows={6} cols={attendanceMode === 'half-day' ? 5 : 4} />
                ) : students.length === 0 ? (
                  <tr><Td colSpan={attendanceMode === 'half-day' ? 5 : 4}>
                    <EmptyState icon={<Users size={36} />} title="No students found"
                      subtitle="No students in your assigned class." />
                  </Td></tr>
                ) : (
                  students.map((s) => {
                    const status = attendanceMap[s.id] || 'present';
                    const morningStatus = morningMap[s.id] || 'present';
                    const afternoonStatus = afternoonMap[s.id] || 'present';
                    return (
                      <Tr key={s.id}>
                        <Td><span className="text-sm font-semibold text-slate-700">{s.admissionNo}</span></Td>
                        <Td>{renderStudentCell(s)}</Td>
                        <Td><Badge variant="blue" size="sm">{formatClassName(s.class, s.section)}</Badge></Td>
                        {attendanceMode === 'half-day' ? (
                          <>
                            <Td className="text-center">
                              {renderToggle(morningStatus, () =>
                                onToggleMorning && onToggleMorning(s.id, morningStatus === 'present' ? 'absent' : 'present')
                              )}
                            </Td>
                            <Td className="text-center">
                              {renderToggle(afternoonStatus, () =>
                                onToggleAfternoon && onToggleAfternoon(s.id, afternoonStatus === 'present' ? 'absent' : 'present')
                              )}
                            </Td>
                          </>
                        ) : (
                          <Td className="text-center">
                            {renderToggle(status, () =>
                              onToggleAttendance(s.id, status === 'present' ? 'absent' : 'present')
                            )}
                          </Td>
                        )}
                      </Tr>
                    );
                  })
                )}
              </tbody>
            </DataTable>
          </div>

          {/* Mobile compact attendance list — pill toggle same as desktop */}
          <div className="md:hidden flex flex-col gap-1.5 pt-0.5">
            {students.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
                <Users size={32} className="mx-auto text-slate-300 mb-2" />
                <div className="text-sm font-semibold text-slate-500">No students found</div>
              </div>
            ) : (
              students.map((s) => {
                const status = attendanceMap[s.id] || 'present';
                const morningStatus = morningMap[s.id] || 'present';
                const afternoonStatus = afternoonMap[s.id] || 'present';
                const [bg] = getAvatarColors(s.name);

                if (attendanceMode === 'half-day') {
                  const hasAbsence = morningStatus === 'absent' || afternoonStatus === 'absent';
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        'flex items-center justify-between px-3 py-2.5 bg-white border rounded-xl gap-2 shadow-2xs',
                        hasAbsence ? 'border-rose-200' : 'border-slate-100'
                      )}
                    >
                      {/* Avatar + Name */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ background: bg }}
                        >
                          {getInitials(s.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-bold text-slate-800 truncate">{s.name}</div>
                          <div className="text-[10.5px] text-slate-400">{s.admissionNo}</div>
                        </div>
                      </div>

                      {/* AM + PM pill toggles */}
                      <div className="flex items-center gap-3 shrink-0">
                        {/* AM */}
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[9px] font-bold text-slate-400 uppercase">AM</span>
                          {!isPastDate ? (
                            <button
                              type="button"
                              className={`att-pill-switch ${morningStatus}`}
                              onClick={() => onToggleMorning && onToggleMorning(s.id, morningStatus === 'present' ? 'absent' : 'present')}
                            >
                              <div className="att-pill-knob" />
                            </button>
                          ) : (
                            <span className={`att-status-badge ${morningStatus}`}>{morningStatus === 'present' ? '✓ P' : '✗ A'}</span>
                          )}
                        </div>
                        {/* PM */}
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[9px] font-bold text-slate-400 uppercase">PM</span>
                          {!isPastDate ? (
                            <button
                              type="button"
                              className={`att-pill-switch ${afternoonStatus}`}
                              onClick={() => onToggleAfternoon && onToggleAfternoon(s.id, afternoonStatus === 'present' ? 'absent' : 'present')}
                            >
                              <div className="att-pill-knob" />
                            </button>
                          ) : (
                            <span className={`att-status-badge ${afternoonStatus}`}>{afternoonStatus === 'present' ? '✓ P' : '✗ A'}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                // ── Daily Mode ── sliding pill toggle exactly like desktop
                return (
                  <div
                    key={s.id}
                    className={cn(
                      'flex items-center justify-between px-3 py-2.5 bg-white border rounded-xl gap-3 shadow-2xs',
                      status === 'absent' ? 'border-rose-200' : 'border-slate-100'
                    )}
                  >
                    {/* Avatar + Name */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ background: bg }}
                      >
                        {getInitials(s.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-slate-800 truncate">{s.name}</div>
                        <div className="text-[10.5px] text-slate-400">{s.admissionNo}</div>
                      </div>
                    </div>

                    {/* Pill toggle + status badge */}
                    <div className="att-row-toggle-wrap">
                      {!isPastDate ? (
                        <>
                          <button
                            type="button"
                            className={`att-pill-switch ${status}`}
                            onClick={() => onToggleAttendance(s.id, status === 'present' ? 'absent' : 'present')}
                          >
                            <div className="att-pill-knob" />
                          </button>
                          <span className={`att-status-badge ${status}`}>
                            {status === 'present' ? <><CheckCircle2 size={11} /> Present</> : <><XCircle size={11} /> Absent</>}
                          </span>
                        </>
                      ) : (
                        <span className={`att-status-badge ${status}`}>
                          {status === 'present' ? <><CheckCircle2 size={11} /> Present</> : <><XCircle size={11} /> Absent</>}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Extra spacer for the FAB and bottom nav bar */}
            <div style={{ height: '120px' }} />
          </div>

          {/* Floating submit FAB — mobile only */}
          {students.length > 0 && !isPastDate && (
            <button type="submit" className="mobile-submit-fab md:hidden" disabled={registerStatus !== 'success'}>
              <CheckCircle2 size={18} />
              Submit Attendance
            </button>
          )}
          {isPastDate && (
            <div className="md:hidden flex items-center gap-2 px-4 py-3 bg-blue-lt border border-blue-200 rounded-md text-blue-700 text-sm font-semibold">
              <AlertTriangle size={15} /> Viewing past record — editing disabled for past dates.
            </div>
          )}
        </Form>

      ) : (
        /* ── VIEW REGISTER ───────────────────────────────────────────────────── */
        <div>
          <div className="hidden md:block">
            <DataTable
              card
              header={
                <div>
                  <div className="text-md font-bold text-slate-900">Register Summary</div>
                  <div className="text-sm text-slate-500">{total} students · {attendanceDate}</div>
                </div>
              }
            >
              <thead>
                <tr>
                  <Th style={{ width: '130px' }}>Admission ID</Th>
                  <Th>Student Name</Th>
                  <Th style={{ width: '110px' }}>Class</Th>
                  {attendanceMode === 'half-day' ? (
                    <>
                      <Th className="text-center" style={{ width: '150px' }}>Morning</Th>
                      <Th className="text-center" style={{ width: '150px' }}>Afternoon</Th>
                    </>
                  ) : (
                    <Th className="text-center" style={{ width: '160px' }}>Status</Th>
                  )}
                </tr>
              </thead>
              <tbody>
                {students.length === 0 && registerStatus === 'loading' ? (
                  <SkeletonTableRows rows={6} cols={attendanceMode === 'half-day' ? 5 : 4} />
                ) : students.length === 0 ? (
                  <tr><Td colSpan={attendanceMode === 'half-day' ? 5 : 4}>
                    <EmptyState icon={<Users size={36} />} title="No students found"
                      subtitle="No students in your assigned class." />
                  </Td></tr>
                ) : (
                  students.map((s) => {
                    const status = attendanceMap[s.id] || 'present';
                    const morningStatus = morningMap[s.id] || 'present';
                    const afternoonStatus = afternoonMap[s.id] || 'present';
                    const renderStatus = (st: 'present' | 'absent') => (
                      <span className={cn(
                        'inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border',
                        st === 'present'
                          ? 'bg-green-50 text-green-800 border-green-200'
                          : 'bg-red-lt text-red-700 border-red-200'
                      )}>
                        {st === 'present' ? <><CheckCircle2 size={12} /> Present</> : <><XCircle size={12} /> Absent</>}
                      </span>
                    );
                    return (
                      <Tr key={s.id}>
                        <Td><span className="text-sm font-semibold text-slate-700">{s.admissionNo}</span></Td>
                        <Td>{renderStudentCell(s)}</Td>
                        <Td><Badge variant="blue" size="sm">{formatClassName(s.class, s.section)}</Badge></Td>
                        {attendanceMode === 'half-day' ? (
                          <>
                            <Td className="text-center">{renderStatus(morningStatus)}</Td>
                            <Td className="text-center">{renderStatus(afternoonStatus)}</Td>
                          </>
                        ) : (
                          <Td className="text-center">{renderStatus(status)}</Td>
                        )}
                      </Tr>
                    );
                  })
                )}
              </tbody>
            </DataTable>
          </div>

          {/* Mobile compact iOS-style grouped list */}
          <div className="md:hidden flex flex-col gap-3">
            {/* Header + Quick Search + Filter chips */}
            <div className="flex flex-col gap-2">
              <div>
                <div className="text-base font-extrabold text-slate-900 dark:text-slate-100">Register Summary</div>
                <div className="text-xs text-slate-500">{total} students · {attendanceDate}</div>
              </div>

              {/* Quick Search & Filter Toolbar */}
              <div className="flex flex-col gap-2">
                {/* Search input */}
                <div className="relative flex items-center">
                  <Search size={14} className="absolute left-3 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search by name or admission..."
                    value={registerSearch}
                    onChange={(e) => setRegisterSearch(e.target.value)}
                    className="w-full pl-8 pr-8 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-2xs"
                  />
                  {registerSearch && (
                    <button
                      type="button"
                      onClick={() => setRegisterSearch('')}
                      className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Filter chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setRegisterFilter('all')}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shrink-0',
                      registerFilter === 'all'
                        ? 'bg-slate-900 text-white dark:bg-blue-600'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                    )}
                  >
                    All ({total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegisterFilter('present')}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5',
                      registerFilter === 'present'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50 dark:bg-slate-800 dark:text-emerald-400 dark:border-emerald-900/40'
                    )}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Present ({presentCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegisterFilter('absent')}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5',
                      registerFilter === 'absent'
                        ? 'bg-rose-600 text-white'
                        : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50 dark:bg-slate-800 dark:text-rose-400 dark:border-rose-900/40'
                    )}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    Absent ({absentCount})
                  </button>
                </div>
              </div>
            </div>

            {/* List */}
            {students.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center shadow-sm">
                <EmptyState icon={<Users size={32} />} title="No students found" subtitle="No students in your assigned class." />
              </div>
            ) : filteredRegisterStudents.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center shadow-sm">
                <p className="text-xs text-slate-500">No students match your search or filter.</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 rounded-2xl shadow-sm divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
                {filteredRegisterStudents.map((s) => {
                  const status = attendanceMap[s.id] || 'present';
                  const morningStatus = morningMap[s.id] || 'present';
                  const afternoonStatus = afternoonMap[s.id] || 'present';
                  const [bg, fg] = getAvatarColors(s.name);

                  return (
                    <div
                      key={s.id}
                      onClick={() => handleOpenHistory(s)}
                      className="flex items-center justify-between px-3.5 py-2.5 hover:bg-slate-50/80 active:bg-slate-100/70 transition-colors cursor-pointer gap-2.5"
                    >
                      {/* Left: Avatar + Name + Adm */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs"
                          style={{ background: bg, color: fg }}
                        >
                          {getInitials(s.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-bold text-slate-900 dark:text-slate-100 truncate">{s.name}</div>
                          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                            Adm: {s.admissionNo} · {formatClassName(s.class, s.section)}
                          </div>
                        </div>
                      </div>

                      {/* Right: Status Pills + History Chevron */}
                      <div className="flex items-center gap-2 shrink-0">
                        {attendanceMode === 'half-day' ? (
                          <div className="flex items-center gap-1">
                            <span className={cn(
                              'px-2 py-0.5 rounded-md text-[10.5px] font-bold',
                              morningStatus === 'present'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                                : 'bg-rose-50 text-rose-700 border border-rose-200/80'
                            )}>
                              {morningStatus === 'present' ? 'AM ✓' : 'AM ✗'}
                            </span>
                            <span className={cn(
                              'px-2 py-0.5 rounded-md text-[10.5px] font-bold',
                              afternoonStatus === 'present'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                                : 'bg-rose-50 text-rose-700 border border-rose-200/80'
                            )}>
                              {afternoonStatus === 'present' ? 'PM ✓' : 'PM ✗'}
                            </span>
                          </div>
                        ) : (
                          <span className={cn(
                            'px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1',
                            status === 'present'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                              : 'bg-rose-50 text-rose-700 border border-rose-200/80'
                          )}>
                            {status === 'present' ? <><CheckCircle2 size={11} /> Present</> : <><XCircle size={11} /> Absent</>}
                          </span>
                        )}
                        <ChevronRight size={15} className="text-slate-400 shrink-0" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Clearance for floating tab bar */}
            <div style={{ height: '90px' }} />
          </div>
        </div>
      )}

      {/* ── Attendance History Drawer ────────────────────────────────────────── */}
      <Drawer
        isOpen={!!selectedStudent}
        onClose={() => setSelectedStudent(null)}
        title="Attendance History"
        subtitle={selectedStudent ? `${selectedStudent.name} (ID: ${selectedStudent.admissionNo}) · Class ${selectedStudent.class}-${selectedStudent.section}` : undefined}
      >
        <div className="flex flex-col gap-5 pt-2">
          {loadingHistoryList ? (
            <div className="py-12 flex justify-center"><LoadingSpinner /></div>
          ) : historyList.length === 0 ? (
            <EmptyState
              icon={<Calendar size={36} />}
              title="No attendance records found."
              subtitle="No registers containing this student have been submitted yet."
            />
          ) : (
            <>
              {/* Overall Summary Stats inside Drawer */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-150">
                <div className="text-center">
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
                    {historyList.length}
                  </div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Working Days</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green">
                    {historyList.filter(h => h.status === 'present').length}
                  </div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Present</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red">
                    {historyList.filter(h => h.status === 'absent').length}
                  </div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Absent</div>
                </div>
              </div>

              {/* Scrollable list of records */}
              <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
                {historyList.map((rec, i) => {
                  const d = new Date(rec.date);
                  const dateStr = d.toLocaleDateString('en-IN', {
                    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
                  });
                  return (
                    <div key={i} className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-900 border border-slate-100 rounded-lg shadow-sm">
                      <div className="flex items-center gap-2">
                        <Calendar size={13} className="text-slate-400" />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{dateStr}</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-bold">
                        {rec.morningStatus || rec.afternoonStatus ? (
                          <>
                            <span className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded border uppercase',
                              rec.morningStatus === 'present' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                            )}>
                              AM: {rec.morningStatus === 'present' ? 'Pres' : 'Abs'}
                            </span>
                            <span className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded border uppercase',
                              rec.afternoonStatus === 'present' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                            )}>
                              PM: {rec.afternoonStatus === 'present' ? 'Pres' : 'Abs'}
                            </span>
                          </>
                        ) : (
                          <span className={cn(
                            'text-[10px] px-2 py-0.5 rounded-full border uppercase',
                            rec.status === 'present' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                          )}>
                            {rec.status}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Drawer>
    </div>
  );
};

export default TeacherAttendance;
