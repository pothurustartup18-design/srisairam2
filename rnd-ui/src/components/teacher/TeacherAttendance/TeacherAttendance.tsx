import React, { useState, useEffect } from 'react';
import {
  Download, Users, UserCheck, UserX, BarChart3,
  ClipboardCheck, Eye, FileBarChart, CheckCircle2, XCircle, AlertTriangle,
  Calendar,
} from 'lucide-react';
import type { StudentData } from '../../../types';
import { API_BASE, formatClassName } from '../../../constants';
import { getAccessToken } from '../../../services/api';
import { cn } from '../../../lib/utils';
import { getAvatarColors, getInitials } from '../../../utils/avatar';
import {
  Button, KpiCard, PageHeader, Badge, DataTable, Th, Td, Tr,
  FilterToolbar, FilterGroup, filterControlClass,
  EmptyState, LoadingSpinner, MobileRowCard, MobileCardList,
  Drawer,
} from '../../ui';

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
  attendanceMode = 'full',
  morningMap = {},
  afternoonMap = {},
  onToggleMorning,
  onToggleAfternoon,
}) => {
  const [viewMode, setViewMode] = useState<'mark' | 'view' | 'reports'>('mark');

  // ─── Reports state ────────────────────────────────────────────────────────
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

  const todayStr = new Date().toISOString().split('T')[0];
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
    <div className="flex flex-col gap-5 font-sans text-slate-900">

      {/* ── PAGE HEADER ─────────────────────────────────────────────────────── */}
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

      {/* ── FILTER TOOLBAR ──────────────────────────────────────────────────── */}
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

      {/* ── KPI STRIP ───────────────────────────────────────────────────────── */}
      {viewMode !== 'reports' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

            {/* Mobile card view */}
            <div className="md:hidden flex flex-col gap-3">
              <div>
                <div className="text-md font-bold text-slate-900">Monthly Attendance Report</div>
                <div className="text-sm text-slate-500">{reportMonth}</div>
              </div>
              {loadingReport ? (
                <div className="bg-white border border-slate-200 rounded-lg shadow-card"><LoadingSpinner fullPage /></div>
              ) : monthlyReport.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-lg shadow-card"><EmptyState title={`No registers found for ${reportMonth}`} /></div>
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
                      actions={
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleOpenHistory(row);
                          }}
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 border border-slate-200 text-slate-600 rounded-md text-xs font-semibold hover:bg-slate-50 transition-colors"
                        >
                          <Eye size={12} /> History
                        </button>
                      }
                    />
                  ))}
                </MobileCardList>
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

            <div className="md:hidden flex flex-col gap-3">
              <div>
                <div className="text-md font-bold text-slate-900">Attendance Defaulters</div>
                <div className="text-sm text-slate-500">All-time · below threshold</div>
              </div>
              {loadingDefaulters ? (
                <div className="bg-white border border-slate-200 rounded-lg shadow-card"><LoadingSpinner fullPage /></div>
              ) : defaulters.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-lg shadow-card"><EmptyState title={`No students below ${defaulterThreshold}%`} /></div>
              ) : (
                <MobileCardList>
                  {defaulters.map(row => (
                    <MobileRowCard
                      key={row.studentId}
                      title={row.name}
                      subtitle={`Adm: ${row.admissionNo}${row.cluster ? ` · 📍 ${row.cluster}` : ''}`}
                      badge={<Badge variant="red" className="font-bold">{row.percentage}%</Badge>}
                      fields={[{ label: 'Present / Total', value: `${row.present} / ${row.total}` }]}
                      actions={
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleOpenHistory(row);
                          }}
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 border border-slate-200 text-slate-600 rounded-md text-xs font-semibold hover:bg-slate-50 transition-colors"
                        >
                          <Eye size={12} /> History
                        </button>
                      }
                    />
                  ))}
                </MobileCardList>
              )}
            </div>
          </div>
        </div>

      ) : viewMode === 'mark' ? (
        /* ── MARK ATTENDANCE ────────────────────────────────────────────────── */
        <form onSubmit={onSubmitAttendance} className="flex flex-col gap-4">
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
                    <Button type="submit" className="min-w-[200px]">
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
                {students.length === 0 ? (
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

          {/* Mobile card view */}
          <div className="md:hidden flex flex-col gap-3">
            <div>
              <div className="text-md font-bold text-slate-900">
                {attendanceMode === 'half-day' ? 'Half-Day Attendance Register' : 'Daily Attendance Register'}
              </div>
              <div className="text-sm text-slate-500">{total} of {total} students</div>
            </div>
            {students.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg shadow-card">
                <EmptyState icon={<Users size={36} />} title="No students found" subtitle="No students in your assigned class." />
              </div>
            ) : (
              <MobileCardList>
                {students.map((s) => {
                  const status = attendanceMap[s.id] || 'present';
                  const morningStatus = morningMap[s.id] || 'present';
                  const afternoonStatus = afternoonMap[s.id] || 'present';
                  return (
                    <MobileRowCard
                      key={s.id}
                      title={s.name}
                      subtitle={`Adm: ${s.admissionNo}${s.cluster ? ` · 📍 ${s.cluster}` : ''}`}
                      badge={<Badge variant="blue" size="sm">{formatClassName(s.class, s.section)}</Badge>}
                      actions={
                        <div className="flex flex-col gap-3 w-full">
                          {attendanceMode === 'half-day' ? (
                            <div className="flex flex-col gap-2.5 w-full">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Morning</span>
                                {renderToggle(morningStatus, () => onToggleMorning && onToggleMorning(s.id, morningStatus === 'present' ? 'absent' : 'present'))}
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Afternoon</span>
                                {renderToggle(afternoonStatus, () => onToggleAfternoon && onToggleAfternoon(s.id, afternoonStatus === 'present' ? 'absent' : 'present'))}
                              </div>
                            </div>
                          ) : (
                            <div className="w-full flex justify-center">
                              {renderToggle(status, () => onToggleAttendance(s.id, status === 'present' ? 'absent' : 'present'))}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleOpenHistory(s);
                            }}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 border border-slate-200 text-slate-600 rounded-md text-xs font-semibold hover:bg-slate-50 transition-colors"
                          >
                            <Eye size={12} /> History
                          </button>
                        </div>
                      }
                    />
                  );
                })}
              </MobileCardList>
            )}

            {students.length > 0 && !isPastDate && (
              <div className="bg-white border border-slate-200 rounded-lg shadow-card p-4 flex flex-col gap-3">
                <div className="text-sm text-slate-500">
                  <strong className="text-slate-900">{presentCount}</strong> present ·{' '}
                  <strong className="text-slate-900">{absentCount}</strong> absent ·{' '}
                  {total} total
                </div>
                <Button type="submit" className="w-full justify-center">
                  <CheckCircle2 size={16} /> Submit Attendance Register
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
                {students.length === 0 ? (
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

          {/* Mobile card view */}
          <div className="md:hidden flex flex-col gap-3">
            <div>
              <div className="text-md font-bold text-slate-900">Register Summary</div>
              <div className="text-sm text-slate-500">{total} students · {attendanceDate}</div>
            </div>
            {students.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg shadow-card">
                <EmptyState icon={<Users size={36} />} title="No students found" subtitle="No students in your assigned class." />
              </div>
            ) : (
              <MobileCardList>
                {students.map((s) => {
                  const status = attendanceMap[s.id] || 'present';
                  const morningStatus = morningMap[s.id] || 'present';
                  const afternoonStatus = afternoonMap[s.id] || 'present';
                  return (
                    <MobileRowCard
                      key={s.id}
                      title={s.name}
                      subtitle={`Adm: ${s.admissionNo}`}
                      badge={<Badge variant="blue" size="sm">{formatClassName(s.class, s.section)}</Badge>}
                      fields={
                        attendanceMode === 'half-day'
                          ? [
                              { label: 'Morning', value: morningStatus === 'present' ? '🟢 Present' : '🔴 Absent' },
                              { label: 'Afternoon', value: afternoonStatus === 'present' ? '🟢 Present' : '🔴 Absent' },
                            ]
                          : [{ label: 'Status', value: status === 'present' ? '🟢 Present' : '🔴 Absent' }]
                      }
                      actions={
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleOpenHistory(s);
                          }}
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 border border-slate-200 text-slate-600 rounded-md text-xs font-semibold hover:bg-slate-50 transition-colors"
                        >
                          <Eye size={12} /> History
                        </button>
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

export default TeacherAttendance;
