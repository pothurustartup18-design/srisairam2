import React, { useState, useEffect } from 'react';
import {
  Download, Users, UserCheck, UserX, BarChart3,
  ClipboardCheck, Eye, FileBarChart, GraduationCap, Calendar,
  User, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Search
} from 'lucide-react';
import type { StudentData, TeacherData, ClassData } from '../../../types';
import { API_BASE, sortClasses } from '../../../constants';
import { getAccessToken } from '../../../services/api';
import { cn } from '../../../lib/utils';
import { getAvatarColors, getInitials } from '../../../utils/avatar';
import {
  Button, KpiCard, PageHeader, Badge, DataTable, Th, Td, Tr,
  FilterToolbar, FilterGroup, filterControlClass, ToolbarDivider,
  EmptyState, LoadingSpinner, Drawer, MobileCardList, MobileRowCard,
} from '../../ui';

interface AdminAttendanceProps {
  students: StudentData[];
  teachers: TeacherData[];
  classesList?: ClassData[];
  showToast: (message: string, type?: 'success' | 'error') => void;
}

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

const AdminAttendance: React.FC<AdminAttendanceProps> = ({
  students,
  teachers,
  classesList = [],
  showToast,
}) => {
  const [selectedClass, setSelectedClass] = useState('10');
  const [selectedSection, setSelectedSection] = useState('A');
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (classesList.length > 0) {
      const sorted = sortClasses(Array.from(new Set(classesList.map(c => c.className))));
      if (sorted.length > 0 && !sorted.includes(selectedClass)) {
        setSelectedClass(sorted[0]);
        const secs = classesList.filter(c => c.className === sorted[0]).map(c => c.section);
        if (secs.length > 0) setSelectedSection(secs[0]);
      }
    }
  }, [classesList]);

  // ─── Attendance state (ALL preserved unchanged) ─────────────────────────────
  const [attendanceMap, setAttendanceMap] = useState<Record<string, 'present' | 'absent'>>({});
  const [isAlreadyMarked, setIsAlreadyMarked] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'mark' | 'view' | 'reports'>('mark');
  const [attendanceMode, setAttendanceMode] = useState<'full' | 'half-day'>('full');
  const [morningMap, setMorningMap] = useState<Record<string, 'present' | 'absent'>>({});
  const [afternoonMap, setAfternoonMap] = useState<Record<string, 'present' | 'absent'>>({});

  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
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

  const handleOpenHistory = async (student: { id: string; name: string; admissionNo: string; class: string; section: string }) => {
    setSelectedStudent(student);
    setLoadingHistoryList(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/attendance/history/student/${student.id}`, { headers });
      const data = await res.json();
      if (data.success) {
        setHistoryList(data.data || []);
      } else {
        showToast(data.message || 'Failed to fetch history.', 'error');
      }
    } catch {
      showToast('Failed to connect to server.', 'error');
    } finally {
      setLoadingHistoryList(false);
    }
  };

  const roomName = `${selectedClass}-${selectedSection}`;
  const assignedTeacher = teachers.find(t =>
    t.assignedClass
      ? t.assignedClass.split(',').map(s => s.trim().toUpperCase()).includes(roomName.toUpperCase())
      : false
  );

  const classStudents = students.filter(s =>
    s.class === selectedClass && s.section.toUpperCase() === selectedSection.toUpperCase()
  );
  const filteredStudents = searchQuery.trim()
    ? classStudents.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.admissionNo.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : classStudents;

  // ─── API handlers (ALL preserved unchanged) ──────────────────────────────────
  const loadAttendanceHistory = async () => {
    if (!assignedTeacher) {
      const map: Record<string, 'present' | 'absent'> = {};
      const amMap: Record<string, 'present' | 'absent'> = {};
      const pmMap: Record<string, 'present' | 'absent'> = {};
      classStudents.forEach(s => { map[s.id] = 'present'; amMap[s.id] = 'present'; pmMap[s.id] = 'present'; });
      setAttendanceMap(map); setMorningMap(amMap); setAfternoonMap(pmMap);
      setIsAlreadyMarked(false); return;
    }
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_BASE}/attendance/history?teacherId=${assignedTeacher._id}&date=${attendanceDate}`);
      const data = await res.json();
      if (data.success && data.data) {
        const map: Record<string, 'present' | 'absent'> = {};
        const amMap: Record<string, 'present' | 'absent'> = {};
        const pmMap: Record<string, 'present' | 'absent'> = {};
        data.data.records.forEach((r: { studentId: string; status: 'present' | 'absent'; morningStatus?: 'present' | 'absent'; afternoonStatus?: 'present' | 'absent' }) => {
          map[r.studentId] = r.status;
          amMap[r.studentId] = r.morningStatus || 'present';
          pmMap[r.studentId] = r.afternoonStatus || 'present';
        });
        setAttendanceMap(map); setMorningMap(amMap); setAfternoonMap(pmMap);
        setIsAlreadyMarked(true);
      } else {
        const map: Record<string, 'present' | 'absent'> = {};
        const amMap: Record<string, 'present' | 'absent'> = {};
        const pmMap: Record<string, 'present' | 'absent'> = {};
        classStudents.forEach(s => { map[s.id] = 'present'; amMap[s.id] = 'present'; pmMap[s.id] = 'present'; });
        setAttendanceMap(map); setMorningMap(amMap); setAfternoonMap(pmMap);
        setIsAlreadyMarked(false);
      }
    } catch {
      const map: Record<string, 'present' | 'absent'> = {};
      const amMap: Record<string, 'present' | 'absent'> = {};
      const pmMap: Record<string, 'present' | 'absent'> = {};
      classStudents.forEach(s => { map[s.id] = 'present'; amMap[s.id] = 'present'; pmMap[s.id] = 'present'; });
      setAttendanceMap(map); setMorningMap(amMap); setAfternoonMap(pmMap);
      setIsAlreadyMarked(false);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchSystemConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings/system-config`);
      const data = await res.json();
      if (data.success && data.data) setAttendanceMode(data.data.attendanceMode || 'full');
    } catch (err) { console.error('Failed to load system config:', err); }
  };

  useEffect(() => { fetchSystemConfig(); }, []);
  useEffect(() => { loadAttendanceHistory(); }, [selectedClass, selectedSection, attendanceDate, teachers]);

  const loadMonthlyReport = async () => {
    if (!assignedTeacher) { setMonthlyReport([]); return; }
    setLoadingReport(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/attendance/report/monthly?teacherId=${assignedTeacher._id}&month=${reportMonth}`, { headers });
      const data = await res.json();
      if (data.success) setMonthlyReport(data.data);
    } catch { showToast('Failed to load monthly report.', 'error'); }
    finally { setLoadingReport(false); }
  };

  const loadDefaulters = async () => {
    if (!assignedTeacher) { setDefaulters([]); return; }
    setLoadingDefaulters(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/attendance/report/defaulters?teacherId=${assignedTeacher._id}&threshold=${defaulterThreshold}`, { headers });
      const data = await res.json();
      if (data.success) setDefaulters(data.data);
    } catch { showToast('Failed to load defaulters.', 'error'); }
    finally { setLoadingDefaulters(false); }
  };

  useEffect(() => {
    if (viewMode === 'reports') { loadMonthlyReport(); loadDefaulters(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedClass, selectedSection, reportMonth, defaulterThreshold]);

  const handleDownloadMonthlyCsv = async () => {
    if (!assignedTeacher) return;
    setDownloadingCsv(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/attendance/report/monthly?teacherId=${assignedTeacher._id}&month=${reportMonth}&format=csv`, { headers });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `attendance_${roomName}_${reportMonth}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Attendance report CSV downloaded.');
    } catch { showToast('Failed to download CSV.', 'error'); }
    finally { setDownloadingCsv(false); }
  };

  // ─── Toggle handlers (ALL preserved unchanged) ───────────────────────────────
  const handleToggleAttendance = (studentId: string, status: 'present' | 'absent') => {
    setAttendanceMap(prev => ({ ...prev, [studentId]: status }));
  };

  const handleSubmitAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignedTeacher) { showToast('No teacher assigned to this class.', 'error'); return; }
    setSaving(true);
    const records = Object.keys(attendanceMap).map(sId => {
      const morningStatus = morningMap[sId] || 'present';
      const afternoonStatus = afternoonMap[sId] || 'present';
      const status = attendanceMode === 'half-day'
        ? (morningStatus === 'present' && afternoonStatus === 'present' ? 'present' : 'absent')
        : (attendanceMap[sId] || 'present');
      return { studentId: sId, status, morningStatus, afternoonStatus };
    });
    try {
      const res = await fetch(`${API_BASE}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: attendanceDate, classTeacherId: assignedTeacher._id, class: roomName, records, sendAlerts: true }),
      });
      const data = await res.json();
      if (data.success) {
        const absentees = classStudents.filter(s => attendanceMap[s.id] === 'absent');
        showToast(absentees.length > 0
          ? `Register saved. Sent alerts for ${absentees.length} absent students.`
          : 'Class attendance register saved successfully.');
        setIsAlreadyMarked(true);
      } else { showToast(data.message || 'Failed to save.', 'error'); }
    } catch { showToast('Failed to connect to server.', 'error'); }
    finally { setSaving(false); }
  };

  const handleMarkAllPresent = () => {
    const map: Record<string, 'present' | 'absent'> = {};
    classStudents.forEach(s => { map[s.id] = 'present'; });
    setAttendanceMap({ ...map }); setMorningMap({ ...map }); setAfternoonMap({ ...map });
  };
  const handleMarkAllAbsent = () => {
    const map: Record<string, 'present' | 'absent'> = {};
    classStudents.forEach(s => { map[s.id] = 'absent'; });
    setAttendanceMap({ ...map }); setMorningMap({ ...map }); setAfternoonMap({ ...map });
  };

  // ─── Computed stats ───────────────────────────────────────────────────────────
  const total = classStudents.length;
  const presentCount = classStudents.filter(s => attendanceMap[s.id] === 'present' || !attendanceMap[s.id]).length;
  const morningPresent = classStudents.filter(s => morningMap[s.id] === 'present' || !morningMap[s.id]).length;
  const afternoonPresent = classStudents.filter(s => afternoonMap[s.id] === 'present' || !afternoonMap[s.id]).length;
  const absentCount = total - presentCount;
  const attendanceRate = total > 0 ? Math.round((presentCount / total) * 100) : 0;
  const morningRate = total > 0 ? Math.round((morningPresent / total) * 100) : 0;
  const afternoonRate = total > 0 ? Math.round((afternoonPresent / total) * 100) : 0;

  const todayStr = new Date().toISOString().split('T')[0];
  const isPastDate = attendanceDate < todayStr;

  // ─── Reusable toggle widget (preserved exactly — same DOM, Tailwind styles) ───
  const renderToggle = (
    _studentId: string,
    currentStatus: 'present' | 'absent',
    onChange: () => void,
  ) => (
    <div className="flex items-center justify-center gap-2.5">
      <label className={cn('inline-flex items-center gap-2.5', isPastDate ? 'cursor-not-allowed' : 'cursor-pointer select-none')}>
        <input
          type="checkbox"
          checked={currentStatus === 'present'}
          disabled={isPastDate}
          onChange={onChange}
          className="hidden"
        />
        {/* Toggle track — exact same 50×26px dimensions */}
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

  // ─── Student row — avatar + name cell + View History Trigger ───────────────
  const renderStudentCell = (student: { id: string; name: string; admissionNo: string; class: string; section: string }, cluster?: string) => {
    const [bg, fg] = getAvatarColors(student.name);
    return (
      <div className="flex items-center justify-between w-full group">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0"
            style={{ background: bg, color: fg }}
          >
            {getInitials(student.name)}
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">{student.name}</div>
            {cluster && <div className="text-xs text-slate-400 dark:text-slate-500">📍 {cluster}</div>}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleOpenHistory(student);
          }}
          className="mr-2 opacity-60 group-hover:opacity-100 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-blue transition-all cursor-pointer flex items-center gap-1 text-[11px] font-bold"
          title="View Attendance History"
        >
          <Eye size={12} /> History
        </button>
      </div>
    );
  };

  // ─── Progress bar helper ─────────────────────────────────────────────────────
  const renderPctBar = (pct: number) => {
    const color = pct >= 75 ? 'bg-green' : pct >= 50 ? 'bg-amber' : 'bg-red';
    const textColor = pct >= 75 ? 'text-green' : pct >= 50 ? 'text-amber' : 'text-red';
    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
        </div>
        <span className={cn('text-xs font-bold min-w-[36px] text-right', textColor)}>{pct}%</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900 dark:text-white">

      {/* ── PAGE HEADER ─────────────────────────────────────────────────────── */}
      <PageHeader
        title="Attendance Register"
        subtitle="Mark, view, and report daily student attendance."
        actions={
          <div className="flex gap-1 bg-slate-100 rounded-md p-1">
            {([
              { mode: 'mark',    icon: <ClipboardCheck size={15} />, label: 'Mark Attendance' },
              { mode: 'view',    icon: <Eye size={15} />,            label: 'View Summary' },
              { mode: 'reports', icon: <FileBarChart size={15} />,   label: 'Reports' },
            ] as const).map(({ mode, icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded text-sm font-semibold transition-all whitespace-nowrap',
                  viewMode === mode
                    ? 'bg-white text-blue shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                )}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        }
      />

      {/* ── FILTER TOOLBAR ──────────────────────────────────────────────────── */}
      <FilterToolbar>
        {/* Class */}
        <FilterGroup label="Class">
          <select
            className={cn(filterControlClass, 'min-w-[110px]')}
            value={selectedClass}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedClass(val);
              const secs = classesList.filter(c => c.className === val).map(c => c.section);
              if (secs.length > 0) setSelectedSection(secs[0]);
            }}
          >
            {classesList.length === 0 ? (
              <><option value="10">Class 10</option><option value="9">Class 9</option><option value="8">Class 8</option></>
            ) : (
              sortClasses(Array.from(new Set(classesList.map(c => c.className)))).map(cls => (
                <option key={cls} value={cls}>{isNaN(Number(cls)) ? cls : `Class ${cls}`}</option>
              ))
            )}
          </select>
        </FilterGroup>

        {/* Section */}
        <FilterGroup label="Section">
          <select
            className={cn(filterControlClass, 'min-w-[110px]')}
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
          >
            {classesList.length === 0 ? (
              <><option value="A">Section A</option><option value="B">Section B</option></>
            ) : (
              classesList.filter(c => c.className === selectedClass).map(c => (
                <option key={c._id} value={c.section}>{c.section === '-' ? 'No Section' : `Section ${c.section}`}</option>
              ))
            )}
          </select>
        </FilterGroup>

        {/* Date */}
        <FilterGroup label="Date">
          <input type="date" className={cn(filterControlClass, 'min-w-[150px]')}
            value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} />
        </FilterGroup>

        {/* Search */}
        {viewMode !== 'reports' && (
          <FilterGroup label="Search" className="flex-1 min-w-[200px]">
            <div className="relative flex items-center">
              <Search size={14} className="absolute left-3 text-slate-400 dark:text-slate-500 pointer-events-none" />
              <input
                type="text"
                className={cn(filterControlClass, 'pl-8')}
                placeholder="Name or admission ID…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </FilterGroup>
        )}

        {/* Bulk actions */}
        {viewMode === 'mark' && (
          <>
            <ToolbarDivider />
            <div className="flex gap-2 items-end">
              <Button variant="success" size="sm" onClick={handleMarkAllPresent}>
                <CheckCircle2 size={13} /> All Present
              </Button>
              <Button variant="danger" size="sm" onClick={handleMarkAllAbsent}>
                <XCircle size={13} /> All Absent
              </Button>
              <Button variant="secondary" size="sm" onClick={() => loadAttendanceHistory()}>
                <RefreshCw size={13} /> Reset
              </Button>
            </div>
          </>
        )}
      </FilterToolbar>

      {/* ── INFO BAR ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-5 px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <GraduationCap size={16} className="text-blue" />
          <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500 font-medium">Class:</span>
          <Badge variant="blue" size="sm">{roomName}</Badge>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <User size={16} className="text-purple" />
          <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500 font-medium">Teacher:</span>
          {assignedTeacher ? (
            <span className="font-bold text-slate-900 dark:text-white">{assignedTeacher.name}</span>
          ) : (
            <span className="flex items-center gap-1 font-bold text-red text-sm">
              <AlertTriangle size={14} /> No teacher assigned to {roomName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Calendar size={16} className="text-green" />
          <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500 font-medium">Date:</span>
          <span className="font-bold text-slate-900 dark:text-white">
            {new Date(attendanceDate + 'T00:00:00').toLocaleDateString('en-IN', {
              weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
            })}
          </span>
          {isPastDate && <Badge variant="gray" size="sm">Past Record</Badge>}
        </div>
      </div>

      {/* ── ALERT (already submitted) ────────────────────────────────────────── */}
      {viewMode === 'mark' && isAlreadyMarked && (
        <div className="flex items-center gap-2.5 px-4 py-3 bg-amber-lt border border-amber-200 border-l-4 border-l-amber rounded-md text-amber-800 text-sm font-semibold">
          <AlertTriangle size={16} />
          Attendance register already submitted for this date. You are editing the saved record.
        </div>
      )}

      {/* ── KPI STRIP ───────────────────────────────────────────────────────── */}
      {viewMode !== 'reports' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Students" value={total} subtext={`In ${roomName}`}
            icon={<Users size={17} />} iconBg="bg-purple-lt" iconColor="text-purple" />
          <KpiCard label="Present" value={presentCount}
            subtext={attendanceMode === 'half-day' ? `AM: ${morningRate}% · PM: ${afternoonRate}%` : `${attendanceRate}% rate`}
            icon={<UserCheck size={17} />} iconBg="bg-green-lt" iconColor="text-green" valueColor="text-green" />
          <KpiCard label="Absent" value={absentCount} subtext="students today"
            icon={<UserX size={17} />} iconBg="bg-red-lt" iconColor="text-red" valueColor="text-red" />
          <KpiCard label="Attendance Rate" value={`${attendanceRate}%`}
            subtext=""
            icon={<BarChart3 size={17} />} iconBg="bg-blue-lt" iconColor="text-blue" valueColor="text-blue"
          />
        </div>
      )}

      {/* ── REPORTS VIEW ────────────────────────────────────────────────────── */}
      {viewMode === 'reports' ? (
        <div className="flex flex-col gap-6">
          {!assignedTeacher ? (
            <DataTable card>
              <tbody>
                <tr>
                  <td>
                    <EmptyState icon={<AlertTriangle size={40} />} title={`No teacher assigned to ${roomName}`}
                      subtitle="Reports are unavailable until a class teacher is assigned." />
                  </td>
                </tr>
              </tbody>
            </DataTable>
          ) : (
            <>
              {/* Monthly Report */}
              <div>
                <div className="hidden md:block">
                  <DataTable
                    card
                    header={
                      <div className="flex items-end justify-between gap-3 flex-wrap">
                        <div>
                          <div className="text-md font-bold text-slate-900 dark:text-white">Monthly Attendance Report</div>
                          <div className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{roomName} · {reportMonth}</div>
                        </div>
                        <div className="flex gap-2.5 items-end">
                          <FilterGroup label="Month">
                            <input type="month" className={cn(filterControlClass, 'w-40')}
                              value={reportMonth} onChange={e => setReportMonth(e.target.value)} />
                          </FilterGroup>
                          <Button variant="secondary" onClick={handleDownloadMonthlyCsv}
                            disabled={downloadingCsv || monthlyReport.length === 0} loading={downloadingCsv}>
                            <Download size={14} /> Download CSV
                          </Button>
                        </div>
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
                            <Td><span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{row.admissionNo}</span></Td>
                            <Td>{renderStudentCell({ id: row.studentId, name: row.name, admissionNo: row.admissionNo, class: selectedClass, section: selectedSection }, row.cluster)}</Td>
                            <Td className="text-center font-semibold">{row.workingDays}</Td>
                            <Td className="text-center"><Badge variant="green">{row.present}</Badge></Td>
                            <Td className="text-center"><Badge variant="red">{row.absent}</Badge></Td>
                            <Td className="text-center">{renderPctBar(row.percentage)}</Td>
                          </Tr>
                        ))
                      )}
                    </tbody>
                  </DataTable>
                </div>

                {/* Mobile card view */}
                <div className="md:hidden flex flex-col gap-3">
                  <div className="flex items-end justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-md font-bold text-slate-900 dark:text-white">Monthly Attendance Report</div>
                      <div className="text-sm text-slate-500 dark:text-slate-500">{roomName} · {reportMonth}</div>
                    </div>
                    <div className="flex gap-2.5 items-end w-full sm:w-auto">
                      <FilterGroup label="Month" className="flex-1 sm:flex-none">
                        <input type="month" className={cn(filterControlClass, 'sm:w-40')}
                          value={reportMonth} onChange={e => setReportMonth(e.target.value)} />
                      </FilterGroup>
                      <Button variant="secondary" onClick={handleDownloadMonthlyCsv}
                        disabled={downloadingCsv || monthlyReport.length === 0} loading={downloadingCsv}>
                        <Download size={14} />
                      </Button>
                    </div>
                  </div>
                  {loadingReport ? (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700"><LoadingSpinner fullPage /></div>
                  ) : monthlyReport.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700"><EmptyState title={`No registers found for ${reportMonth}`} /></div>
                  ) : (
                    <MobileCardList>
                      {monthlyReport.map(row => (
                        <MobileRowCard
                          key={row.studentId}
                          title={row.name}
                          subtitle={`Adm: ${row.admissionNo}${row.cluster ? ` · 📍 ${row.cluster}` : ''}`}
                          badge={<Badge variant={row.percentage >= 75 ? 'green' : 'red'}>{row.percentage}%</Badge>}
                          fields={[
                            { label: 'Working Days', value: row.workingDays },
                            { label: 'Present', value: row.present },
                            { label: 'Absent', value: row.absent },
                          ]}
                        />
                      ))}
                    </MobileCardList>
                  )}
                </div>
              </div>

              {/* Defaulters */}
              <div>
                <div className="hidden md:block">
                  <DataTable
                    card
                    header={
                      <div className="flex items-end justify-between gap-3 flex-wrap">
                        <div>
                          <div className="text-md font-bold text-slate-900 dark:text-white">Attendance Defaulters</div>
                          <div className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">All-time · below threshold</div>
                        </div>
                        <FilterGroup label="Threshold (%)">
                          <input type="number" min={0} max={100} className={cn(filterControlClass, 'w-24')}
                            value={defaulterThreshold} onChange={e => setDefaulterThreshold(Number(e.target.value) || 0)} />
                        </FilterGroup>
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
                            <Td><span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{row.admissionNo}</span></Td>
                            <Td>{renderStudentCell({ id: row.studentId, name: row.name, admissionNo: row.admissionNo, class: selectedClass, section: selectedSection }, row.cluster)}</Td>
                            <Td className="text-center font-semibold">{row.present} / {row.total}</Td>
                            <Td className="text-center"><Badge variant="red" className="font-bold">{row.percentage}%</Badge></Td>
                          </Tr>
                        ))
                      )}
                    </tbody>
                  </DataTable>
                </div>

                {/* Mobile card view */}
                <div className="md:hidden flex flex-col gap-3">
                  <div className="flex items-end justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-md font-bold text-slate-900 dark:text-white">Attendance Defaulters</div>
                      <div className="text-sm text-slate-500 dark:text-slate-500">All-time · below threshold</div>
                    </div>
                    <FilterGroup label="Threshold (%)">
                      <input type="number" min={0} max={100} className={cn(filterControlClass, 'w-24')}
                        value={defaulterThreshold} onChange={e => setDefaulterThreshold(Number(e.target.value) || 0)} />
                    </FilterGroup>
                  </div>
                  {loadingDefaulters ? (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700"><LoadingSpinner fullPage /></div>
                  ) : defaulters.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700"><EmptyState title={`No students below ${defaulterThreshold}%`} /></div>
                  ) : (
                    <MobileCardList>
                      {defaulters.map(row => (
                        <MobileRowCard
                          key={row.studentId}
                          title={row.name}
                          subtitle={`Adm: ${row.admissionNo}${row.cluster ? ` · 📍 ${row.cluster}` : ''}`}
                          badge={<Badge variant="red" className="font-bold">{row.percentage}%</Badge>}
                          fields={[{ label: 'Present / Total', value: `${row.present} / ${row.total}` }]}
                        />
                      ))}
                    </MobileCardList>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

      ) : viewMode === 'mark' ? (
        /* ── MARK ATTENDANCE ────────────────────────────────────────────────── */
        <form onSubmit={handleSubmitAttendance} className="flex flex-col gap-4">
          {/* Desktop/tablet table */}
          <div className="hidden md:block">
            <DataTable
              card
              header={
                <div>
                  <div className="text-md font-bold text-slate-900 dark:text-white">
                    {attendanceMode === 'half-day' ? 'Half-Day Attendance Register' : 'Daily Attendance Register'}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    {filteredStudents.length} of {total} students
                    {searchQuery && <> · filtered by "<strong>{searchQuery}</strong>"</>}
                  </div>
                </div>
              }
              footer={
                classStudents.length > 0 && assignedTeacher && !isPastDate ? (
                  <div className="flex items-center justify-between gap-4 px-2 py-1">
                    <div className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      <strong className="text-slate-900 dark:text-white">{presentCount}</strong> present ·{' '}
                      <strong className="text-slate-900 dark:text-white">{absentCount}</strong> absent ·{' '}
                      {total} total
                    </div>
                    <Button type="submit" loading={saving} className="min-w-[200px]">
                      <CheckCircle2 size={16} /> Save Attendance Register
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
                {loadingHistory ? (
                  <tr><Td colSpan={attendanceMode === 'half-day' ? 5 : 4}><LoadingSpinner fullPage /></Td></tr>
                ) : filteredStudents.length === 0 ? (
                  <tr><Td colSpan={attendanceMode === 'half-day' ? 5 : 4}>
                    <EmptyState icon={<Users size={36} />} title="No students found"
                      subtitle={searchQuery ? `No results for "${searchQuery}"` : `No students in Class ${selectedClass}-${selectedSection}.`} />
                  </Td></tr>
                ) : (
                  filteredStudents.map(s => {
                    const status = attendanceMap[s.id] || 'present';
                    const morningStatus = morningMap[s.id] || 'present';
                    const afternoonStatus = afternoonMap[s.id] || 'present';
                    return (
                      <Tr key={s.id}>
                        <Td><span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{s.admissionNo}</span></Td>
                        <Td>{renderStudentCell({ id: s.id, name: s.name, admissionNo: s.admissionNo, class: s.class, section: s.section }, s.cluster)}</Td>
                        <Td><Badge variant="blue" size="sm">Cls {s.class}-{s.section}</Badge></Td>
                        {attendanceMode === 'half-day' ? (
                          <>
                            <Td className="text-center">
                              {renderToggle(s.id, morningStatus, () =>
                                setMorningMap(prev => ({ ...prev, [s.id]: morningStatus === 'present' ? 'absent' : 'present' }))
                              )}
                            </Td>
                            <Td className="text-center">
                              {renderToggle(s.id, afternoonStatus, () =>
                                setAfternoonMap(prev => ({ ...prev, [s.id]: afternoonStatus === 'present' ? 'absent' : 'present' }))
                              )}
                            </Td>
                          </>
                        ) : (
                          <Td className="text-center">
                            {renderToggle(s.id, status, () =>
                              handleToggleAttendance(s.id, status === 'present' ? 'absent' : 'present')
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

          {/* Mobile card view */}
          <div className="md:hidden flex flex-col gap-3">
            <div>
              <div className="text-md font-bold text-slate-900 dark:text-white">
                {attendanceMode === 'half-day' ? 'Half-Day Attendance Register' : 'Daily Attendance Register'}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-500">
                {filteredStudents.length} of {total} students
                {searchQuery && <> · filtered by "<strong>{searchQuery}</strong>"</>}
              </div>
            </div>
            {loadingHistory ? (
              <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700"><LoadingSpinner fullPage /></div>
            ) : filteredStudents.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700">
                <EmptyState icon={<Users size={36} />} title="No students found"
                  subtitle={searchQuery ? `No results for "${searchQuery}"` : `No students in Class ${selectedClass}-${selectedSection}.`} />
              </div>
            ) : (
              <MobileCardList>
                {filteredStudents.map(s => {
                  const status = attendanceMap[s.id] || 'present';
                  const morningStatus = morningMap[s.id] || 'present';
                  const afternoonStatus = afternoonMap[s.id] || 'present';
                  return (
                    <MobileRowCard
                      key={s.id}
                      title={s.name}
                      subtitle={`Adm: ${s.admissionNo}${s.cluster ? ` · 📍 ${s.cluster}` : ''}`}
                      badge={<Badge variant="blue" size="sm">Cls {s.class}-{s.section}</Badge>}
                      actions={
                        attendanceMode === 'half-day' ? (
                          <div className="flex flex-col gap-2.5 w-full">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Morning</span>
                              {renderToggle(s.id, morningStatus, () =>
                                setMorningMap(prev => ({ ...prev, [s.id]: morningStatus === 'present' ? 'absent' : 'present' }))
                              )}
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Afternoon</span>
                              {renderToggle(s.id, afternoonStatus, () =>
                                setAfternoonMap(prev => ({ ...prev, [s.id]: afternoonStatus === 'present' ? 'absent' : 'present' }))
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="w-full flex justify-center">
                            {renderToggle(s.id, status, () =>
                              handleToggleAttendance(s.id, status === 'present' ? 'absent' : 'present')
                            )}
                          </div>
                        )
                      }
                    />
                  );
                })}
              </MobileCardList>
            )}

            {classStudents.length > 0 && assignedTeacher && !isPastDate && (
              <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700 p-4 flex flex-col gap-3">
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  <strong className="text-slate-900 dark:text-white">{presentCount}</strong> present ·{' '}
                  <strong className="text-slate-900 dark:text-white">{absentCount}</strong> absent ·{' '}
                  {total} total
                </div>
                <Button type="submit" loading={saving} className="w-full justify-center">
                  <CheckCircle2 size={16} /> Save Attendance Register
                </Button>
              </div>
            )}
            {isPastDate && (
              <div className="flex items-center gap-2 px-4 py-3 bg-blue-lt border border-blue-200 rounded-md text-blue-700 text-sm font-semibold">
                <AlertTriangle size={15} /> Viewing past record — editing disabled for past dates.
              </div>
            )}
          </div>
        </form>

      ) : (
        /* ── VIEW SUMMARY ───────────────────────────────────────────────────── */
        <div>
          <div className="hidden md:block">
            <DataTable
              card
              header={
                <div>
                  <div className="text-md font-bold text-slate-900 dark:text-white">Daily Summary — {roomName}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{filteredStudents.length} students · {attendanceDate}</div>
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
                {loadingHistory ? (
                  <tr><Td colSpan={attendanceMode === 'half-day' ? 5 : 4}><LoadingSpinner fullPage /></Td></tr>
                ) : filteredStudents.length === 0 ? (
                  <tr><Td colSpan={attendanceMode === 'half-day' ? 5 : 4}>
                    <EmptyState icon={<Users size={36} />} title="No students found"
                      subtitle={`No students in Class ${selectedClass}-${selectedSection}.`} />
                  </Td></tr>
                ) : (
                  filteredStudents.map(s => {
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
                        <Td><span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{s.admissionNo}</span></Td>
                        <Td>{renderStudentCell({ id: s.id, name: s.name, admissionNo: s.admissionNo, class: s.class, section: s.section }, s.cluster)}</Td>
                        <Td><Badge variant="blue" size="sm">Cls {s.class}-{s.section}</Badge></Td>
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

          {/* Mobile card view */}
          <div className="md:hidden flex flex-col gap-3">
            <div>
              <div className="text-md font-bold text-slate-900 dark:text-white">Daily Summary — {roomName}</div>
              <div className="text-sm text-slate-500 dark:text-slate-500">{filteredStudents.length} students · {attendanceDate}</div>
            </div>
            {loadingHistory ? (
              <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700"><LoadingSpinner fullPage /></div>
            ) : filteredStudents.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700">
                <EmptyState icon={<Users size={36} />} title="No students found"
                  subtitle={`No students in Class ${selectedClass}-${selectedSection}.`} />
              </div>
            ) : (
              <MobileCardList>
                {filteredStudents.map(s => {
                  const status = attendanceMap[s.id] || 'present';
                  const morningStatus = morningMap[s.id] || 'present';
                  const afternoonStatus = afternoonMap[s.id] || 'present';
                  return (
                    <MobileRowCard
                      key={s.id}
                      title={s.name}
                      subtitle={`Adm: ${s.admissionNo}`}
                      badge={<Badge variant="blue" size="sm">Cls {s.class}-{s.section}</Badge>}
                      fields={
                        attendanceMode === 'half-day'
                          ? [
                              { label: 'Morning', value: morningStatus === 'present' ? '🟢 Present' : '🔴 Absent' },
                              { label: 'Afternoon', value: afternoonStatus === 'present' ? '🟢 Present' : '🔴 Absent' },
                            ]
                          : [{ label: 'Status', value: status === 'present' ? '🟢 Present' : '🔴 Absent' }]
                      }
                    />
                  );
                })}
              </MobileCardList>
            )}
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

export default AdminAttendance;

