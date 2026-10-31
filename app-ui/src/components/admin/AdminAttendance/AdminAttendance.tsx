import React, { useState, useEffect } from 'react';
import {
  Download, Users, UserCheck, UserX, BarChart3,
  ClipboardCheck, Eye, FileBarChart, GraduationCap, Calendar,
  User, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Search,
  CalendarDays, CalendarPlus, Trash2, Plus, Sparkles, ChevronLeft, ChevronRight,
  ShieldAlert, Sun, SlidersHorizontal, Check, X, Bell
} from 'lucide-react';
import type { StudentData, TeacherData, ClassData, HolidayData } from '../../../types';
import { API_BASE, sortClasses, formatRoomDisplay } from '../../../constants';
import { getAccessToken } from '../../../services/api';
import { cn, getLocalToday, getLocalMonth } from '../../../lib/utils';
import { getAvatarColors, getInitials } from '../../../utils/avatar';
import {
  Button, KpiCard, PageHeader, Badge, DataTable, Th, Td, Tr,
  FilterToolbar, FilterGroup, filterControlClass, ToolbarDivider,
  EmptyState, LoadingSpinner, Drawer, Modal, MobileCardList, MobileRowCard,
  SegmentedTabs,
} from '../../ui';
import { Form } from '../../ui/Form';
import { ActionButton } from '../../ui/ActionButton';

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
  const [attendanceDate, setAttendanceDate] = useState(getLocalToday());
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

  // ─── Attendance state ──────────────────────────────────────────────────────
  const [attendanceMap, setAttendanceMap] = useState<Record<string, 'present' | 'absent'>>({});
  const [isAlreadyMarked, setIsAlreadyMarked] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'mark' | 'view' | 'reports' | 'calendar'>('mark');
  const [attendanceMode, setAttendanceMode] = useState<'full' | 'half-day'>('full');
  const [morningMap, setMorningMap] = useState<Record<string, 'present' | 'absent'>>({});
  const [afternoonMap, setAfternoonMap] = useState<Record<string, 'present' | 'absent'>>({});
  const [holidayUnlockedDate, setHolidayUnlockedDate] = useState<string | null>(null);

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

  // ─── Academic Calendar & Holiday State ─────────────────────────────────────
  const [calendarMonth, setCalendarMonth] = useState<string>(getLocalMonth());
  const [holidays, setHolidays] = useState<HolidayData[]>([]);
  const [loadingHolidays, setLoadingHolidays] = useState(false);
  const [isDeclareDrawerOpen, setIsDeclareDrawerOpen] = useState(false);
  const [declareForm, setDeclareForm] = useState<{
    title: string;
    date: string;
    isRange: boolean;
    endDate: string;
    category: 'festival' | 'national_holiday' | 'emergency' | 'other';
    isSchoolWide: boolean;
    applicableClasses: string[];
    description: string;
  }>({
    title: '',
    date: getLocalToday(),
    isRange: false,
    endDate: getLocalToday(),
    category: 'festival',
    isSchoolWide: true,
    applicableClasses: [],
    description: '',
  });
  const [savingHoliday, setSavingHoliday] = useState(false);

  const [sundayOverrideModal, setSundayOverrideModal] = useState<{
    isOpen: boolean;
    date: string;
    selectedClasses: string[];
  }>({
    isOpen: false,
    date: '',
    selectedClasses: [],
  });
  const [savingOverride, setSavingOverride] = useState(false);

  // Collect all unique room combinations (e.g. '10-A', '9-B', '3')
  const allRooms = Array.from(
    new Set(
      classesList.map(c => c.section && c.section !== '-' ? `${c.className}-${c.section}` : c.className)
    )
  ).sort((a, b) => {
    const [aClass, aSec] = a.split('-');
    const [bClass, bSec] = b.split('-');
    const numA = parseInt(aClass.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(bClass.replace(/\D/g, ''), 10) || 0;
    if (numA !== numB) return numA - numB;
    return (aSec || '').localeCompare(bSec || '');
  });

  const loadHolidays = async (monthStr: string) => {
    setLoadingHolidays(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/calendar/holidays?month=${monthStr}`, { headers });
      const data = await res.json();
      if (data.success) {
        setHolidays(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load holidays:', err);
    } finally {
      setLoadingHolidays(false);
    }
  };

  useEffect(() => {
    loadHolidays(calendarMonth);
  }, [calendarMonth]);

  // Load holidays for the attendance date month if different
  useEffect(() => {
    const attMonth = attendanceDate.slice(0, 7);
    if (attMonth !== calendarMonth) {
      loadHolidays(attMonth);
    }
  }, [attendanceDate]);

  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!declareForm.title.trim()) {
      showToast('Please enter a holiday title.', 'error');
      return;
    }
    if (declareForm.isRange && declareForm.endDate < declareForm.date) {
      showToast('End date cannot be earlier than start date.', 'error');
      return;
    }
    if (!declareForm.isSchoolWide && declareForm.applicableClasses.length === 0) {
      showToast('Please select at least one class for this holiday.', 'error');
      return;
    }
    setSavingHoliday(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/calendar/holidays`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: declareForm.title.trim(),
          date: declareForm.date,
          endDate: declareForm.isRange ? declareForm.endDate : undefined,
          type: declareForm.isRange ? 'vacation' : 'holiday',
          category: declareForm.category,
          isSchoolWide: declareForm.isSchoolWide,
          applicableClasses: declareForm.isSchoolWide ? [] : declareForm.applicableClasses,
          description: declareForm.description.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(declareForm.isRange ? 'Vacation range declared successfully!' : 'Holiday declared successfully!');
        setIsDeclareDrawerOpen(false);
        setDeclareForm({
          title: '',
          date: getLocalToday(),
          isRange: false,
          endDate: getLocalToday(),
          category: 'festival',
          isSchoolWide: true,
          applicableClasses: [],
          description: '',
        });
        loadHolidays(calendarMonth);
      } else {
        showToast(data.message || 'Failed to declare holiday.', 'error');
      }
    } catch {
      showToast('Failed to connect to server.', 'error');
    } finally {
      setSavingHoliday(false);
    }
  };

  const handleDeleteHoliday = async (id: string, title: string) => {
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/calendar/holidays/${id}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Removed "${title}" from calendar.`);
        loadHolidays(calendarMonth);
      } else {
        showToast(data.message || 'Failed to delete.', 'error');
      }
    } catch {
      showToast('Failed to connect to server.', 'error');
    }
  };

  const handleOpenSundayOverride = (dateStr: string) => {
    const cleanDate = String(dateStr).slice(0, 10);
    const existingOverride = holidays.find(
      h => h.type === 'working_day_override' && String(h.date).slice(0, 10) === cleanDate
    );
    setSundayOverrideModal({
      isOpen: true,
      date: cleanDate,
      selectedClasses: existingOverride ? [...existingOverride.applicableClasses] : [],
    });
  };

  const handleSaveSundayOverride = async () => {
    setSavingOverride(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/calendar/override-sunday`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          date: sundayOverrideModal.date,
          applicableClasses: sundayOverrideModal.selectedClasses,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Sunday class override updated successfully!');
        setSundayOverrideModal({ isOpen: false, date: '', selectedClasses: [] });
        loadHolidays(calendarMonth);
      } else {
        showToast(data.message || 'Failed to update Sunday override.', 'error');
      }
    } catch {
      showToast('Failed to connect to server.', 'error');
    } finally {
      setSavingOverride(false);
    }
  };

  // Calendar calculations
  const [calYear, calMonthNum] = calendarMonth.split('-').map(Number);
  const firstDayOfMonthIndex = new Date(calYear, calMonthNum - 1, 1).getDay(); // 0 = Sunday
  const daysInCurrentMonth = new Date(calYear, calMonthNum, 0).getDate();
  const monthDays = Array.from({ length: daysInCurrentMonth }, (_, i) => i + 1);

  const monthName = new Date(calYear, calMonthNum - 1, 1).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  const handlePrevMonth = () => {
    const prevDate = new Date(calYear, calMonthNum - 2, 1);
    const y = prevDate.getFullYear();
    const m = String(prevDate.getMonth() + 1).padStart(2, '0');
    setCalendarMonth(`${y}-${m}`);
  };

  const handleNextMonth = () => {
    const nextDate = new Date(calYear, calMonthNum, 1);
    const y = nextDate.getFullYear();
    const m = String(nextDate.getMonth() + 1).padStart(2, '0');
    setCalendarMonth(`${y}-${m}`);
  };

  const handleCurrentMonth = () => {
    setCalendarMonth(getLocalMonth());
  };

  const totalSundaysInMonth = monthDays.filter(
    d => new Date(calYear, calMonthNum - 1, d).getDay() === 0
  ).length;

  const monthOverrides = holidays.filter(h => h.type === 'working_day_override');
  const monthDeclaredHolidays = holidays.filter(
    h => h.type === 'holiday' || h.type === 'vacation'
  );

  const formatEventDateDisplay = (dateStr?: string, endDateStr?: string) => {
    if (!dateStr) return '-';
    const sDate = String(dateStr).slice(0, 10);
    const eDate = endDateStr ? String(endDateStr).slice(0, 10) : '';

    const startObj = new Date(sDate + 'T00:00:00');
    const startFormatted = startObj.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    if (!eDate || eDate === sDate) {
      const weekday = startObj.toLocaleDateString('en-IN', { weekday: 'short' });
      return `${startFormatted} (${weekday})`;
    }

    const endObj = new Date(eDate + 'T00:00:00');
    const endFormatted = endObj.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    const diffTime = Math.abs(endObj.getTime() - startObj.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    return `${startFormatted} → ${endFormatted} (${diffDays} days)`;
  };

  const getItemsForDay = (day: number) => {
    const dateStr = `${calYear}-${String(calMonthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isSunday = new Date(calYear, calMonthNum - 1, day).getDay() === 0;

    const dayHolidays = holidays.filter(h => {
      if (h.type === 'working_day_override') return false;
      const hStart = String(h.date).slice(0, 10);
      const hEnd = h.endDate ? String(h.endDate).slice(0, 10) : hStart;
      return hStart <= dateStr && hEnd >= dateStr;
    });

    const dayOverrides = holidays.filter(
      h => h.type === 'working_day_override' && String(h.date).slice(0, 10) === dateStr
    );

    return { dateStr, isSunday, dayHolidays, dayOverrides };
  };

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

  // ─── API handlers ──────────────────────────────────────────────────────────
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

  // ─── Toggle handlers ────────────────────────────────────────────────────────
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

  const todayStr = getLocalToday();
  const isPastDate = attendanceDate < todayStr;

  const attendanceDateFormatted = attendanceDate.slice(0, 10);
  const isSunday = new Date(attendanceDateFormatted + 'T00:00:00').getDay() === 0;
  const currentRoomWorkingSunday = holidays.find(
    h => h.type === 'working_day_override' &&
         String(h.date).slice(0, 10) === attendanceDateFormatted &&
         (h.isSchoolWide || h.applicableClasses?.includes(roomName))
  );
  const currentRoomDeclaredHoliday = holidays.find(
    h => (h.type === 'holiday' || h.type === 'vacation') &&
         (() => {
           const hDate = String(h.date).slice(0, 10);
           const hEndDate = h.endDate ? String(h.endDate).slice(0, 10) : hDate;
           return hDate <= attendanceDateFormatted && hEndDate >= attendanceDateFormatted;
         })() &&
         (h.isSchoolWide || h.applicableClasses?.includes(roomName))
  );

  const isHolidayDate = Boolean(currentRoomDeclaredHoliday || (isSunday && !currentRoomWorkingSunday));
  const isHolidayOverrideUnlocked = holidayUnlockedDate === attendanceDateFormatted;
  const isMarkingLocked = isPastDate || (isHolidayDate && !isHolidayOverrideUnlocked);

  // ─── Reusable toggle widget ─────────────────────────────────────────────────
  const renderToggle = (
    _studentId: string,
    currentStatus: 'present' | 'absent',
    onChange: () => void,
  ) => (
    <div className="flex items-center justify-center gap-2.5">
      <label className={cn('inline-flex items-center gap-2.5', isMarkingLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer select-none')}>
        <input
          type="checkbox"
          checked={currentStatus === 'present'}
          disabled={isMarkingLocked}
          onChange={onChange}
          className="hidden"
        />
        <div className={cn(
          'w-[50px] h-[26px] rounded-full p-[2px] relative transition-colors duration-200',
          'shadow-[inset_0_1px_3px_rgba(0,0,0,0.15)]',
          currentStatus === 'present' ? 'bg-[#10b981]' : 'bg-[#ef4444]',
          isMarkingLocked && 'cursor-not-allowed'
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
        subtitle="Mark, view, report daily student attendance and manage holiday schedules."
        actions={
          <SegmentedTabs
            ariaLabel="Attendance view"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'mark', icon: <ClipboardCheck size={15} />, label: 'Mark Attendance' },
              { value: 'view', icon: <Eye size={15} />, label: 'View Summary' },
              { value: 'reports', icon: <FileBarChart size={15} />, label: 'Reports' },
              { value: 'calendar', icon: <CalendarDays size={15} />, label: 'Holiday Calendar' },
            ] as const}
          />
        }
      />

      {/* ── TOOLBAR & INFO STRIPS (Mark / View / Reports Modes) ────────────────── */}
      {viewMode !== 'calendar' && (
        <>
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
                <div className="flex flex-wrap gap-2 items-end">
                  <Button variant="success" size="sm" onClick={handleMarkAllPresent} disabled={isMarkingLocked}>
                    <CheckCircle2 size={13} /> All Present
                  </Button>
                  <Button variant="danger" size="sm" onClick={handleMarkAllAbsent} disabled={isMarkingLocked}>
                    <XCircle size={13} /> All Absent
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => loadAttendanceHistory()} disabled={isMarkingLocked}>
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
              <span className="text-slate-500 dark:text-slate-400 font-medium">Class:</span>
              <Badge variant="blue" size="sm">{roomName}</Badge>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User size={16} className="text-purple" />
              <span className="text-slate-500 dark:text-slate-400 font-medium">Teacher:</span>
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
              <span className="text-slate-500 dark:text-slate-400 font-medium">Date:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {new Date(attendanceDate + 'T00:00:00').toLocaleDateString('en-IN', {
                  weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
                })}
              </span>
              {isPastDate && <Badge variant="gray" size="sm">Past Record</Badge>}
            </div>
          </div>

          {/* ── NOTICE BANNER (Sunday Off vs Working Override vs Holiday) ─────────── */}
          {(() => {
            if (isSunday && !currentRoomWorkingSunday) {
              return (
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg text-rose-800 dark:text-rose-200 text-sm font-semibold flex-wrap">
                  <div className="flex items-center gap-2">
                    <Sun size={17} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
                    <div>
                      <strong>Sunday Weekly Off:</strong> Sundays are automatic non-working school holidays.
                      <span className="block text-xs font-normal opacity-90 mt-0.5">Attendance marking is locked. This day will not be counted as a working day.</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCalendarMonth(attendanceDate.slice(0, 7));
                      setViewMode('calendar');
                      handleOpenSundayOverride(attendanceDate);
                    }}
                    className="text-xs font-bold px-3 py-1.5 bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-300 rounded border border-rose-300 dark:border-rose-700 hover:bg-rose-100 shadow-xs flex-shrink-0"
                  >
                    Enable Sunday Class →
                  </button>
                </div>
              );
            }

            if (currentRoomWorkingSunday) {
              return (
                <div className="flex items-center gap-2.5 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-800 dark:text-emerald-200 text-sm font-semibold">
                  <Sparkles size={17} className="text-emerald-600 flex-shrink-0" />
                  <span>
                    <strong>Sunday Working Class Active:</strong> Attendance for <strong>{formatRoomDisplay(roomName)}</strong> is active and will count towards student working days.
                  </span>
                </div>
              );
            }

            if (currentRoomDeclaredHoliday) {
              return (
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-lg text-purple-800 dark:text-purple-200 text-sm font-semibold flex-wrap">
                  <div className="flex items-center gap-2">
                    <CalendarDays size={17} className="text-purple flex-shrink-0" />
                    <div>
                      <strong>School Holiday ({currentRoomDeclaredHoliday.category.replace('_', ' ').toUpperCase()}):</strong> {currentRoomDeclaredHoliday.title}. School is closed today.
                      <span className="block text-xs font-normal opacity-90 mt-0.5">
                        {isHolidayOverrideUnlocked
                          ? '⚠️ Override active: Attendance marking is unlocked for special session.'
                          : 'Attendance marking is locked. This day will not count towards student working days or report cards.'}
                      </span>
                    </div>
                  </div>
                  {!isHolidayOverrideUnlocked ? (
                    <button
                      type="button"
                      onClick={() => {
                        setHolidayUnlockedDate(attendanceDateFormatted);
                        showToast('Attendance marking unlocked for this holiday session.', 'success');
                      }}
                      className="text-xs font-bold px-3 py-1.5 bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300 rounded border border-purple-300 dark:border-purple-700 hover:bg-purple-100 shadow-xs flex-shrink-0"
                    >
                      Unlock & Mark Attendance for this Day
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setHolidayUnlockedDate(null);
                        showToast('Attendance marking locked for holiday.', 'success');
                      }}
                      className="text-xs font-bold px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded border border-slate-300 hover:bg-slate-100 shadow-xs flex-shrink-0"
                    >
                      Re-lock Holiday
                    </button>
                  )}
                </div>
              );
            }

            return null;
          })()}

          {/* ── ALERT (already submitted) ────────────────────────────────────────── */}
          {viewMode === 'mark' && isAlreadyMarked && (
            <div className={cn(
              'flex items-center gap-2.5 px-4 py-3 border rounded-md text-sm font-semibold',
              isHolidayDate
                ? 'bg-blue-50 border-blue-200 text-blue-900 border-l-4 border-l-blue'
                : 'bg-amber-lt border-amber-200 border-l-4 border-l-amber text-amber-800'
            )}>
              <AlertTriangle size={16} className="flex-shrink-0" />
              {isHolidayDate ? (
                <span>
                  <strong>Holiday Notice:</strong> Saved records exist for this date ({presentCount} Present, {absentCount} Absent). Because this date is declared as a <strong>Holiday</strong>, it is automatically <strong>excluded from total working days</strong> and will not penalize absent students in report cards.
                </span>
              ) : (
                <span>Attendance register already submitted for this date. You are editing the saved record.</span>
              )}
            </div>
          )}

          {/* ── KPI STRIP ───────────────────────────────────────────────────────── */}
          {viewMode !== 'reports' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
        </>
      )}

      {/* ── TAB CONTENT ──────────────────────────────────────────────────────── */}
      {viewMode === 'calendar' ? (
        /* ── HOLIDAY CALENDAR VIEW ─────────────────────────────────────────── */
        <div className="flex flex-col gap-5">
          {/* Month Navigation & Action Bar */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={handlePrevMonth} className="p-2">
                <ChevronLeft size={16} />
              </Button>
              <div className="text-lg font-bold text-slate-900 dark:text-white px-2 min-w-[180px] text-center">
                {monthName}
              </div>
              <Button variant="secondary" size="sm" onClick={handleNextMonth} className="p-2">
                <ChevronRight size={16} />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCurrentMonth} className="text-xs font-bold text-blue ml-2">
                Current Month
              </Button>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <Button
                variant="primary"
                onClick={() => {
                  setDeclareForm({
                    title: '',
                    date: `${calendarMonth}-01`,
                    isRange: false,
                    endDate: `${calendarMonth}-01`,
                    category: 'festival',
                    isSchoolWide: true,
                    applicableClasses: [],
                    description: '',
                  });
                  setIsDeclareDrawerOpen(true);
                }}
                className="gap-2 shadow-sm font-bold"
              >
                <CalendarPlus size={16} /> Declare Holiday / Vacation
              </Button>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <KpiCard
              label="Sundays (Default Off)"
              value={totalSundaysInMonth}
              subtext="Automated non-working days"
              icon={<Sun size={17} />}
              iconBg="bg-rose-50 dark:bg-rose-950/40"
              iconColor="text-rose-500"
              valueColor="text-rose-600 dark:text-rose-400"
            />
            <KpiCard
              label="Declared Holidays"
              value={monthDeclaredHolidays.length}
              subtext="Festivals & Vacations"
              icon={<CalendarDays size={17} />}
              iconBg="bg-purple-lt"
              iconColor="text-purple"
              valueColor="text-purple"
            />
            <KpiCard
              label="Sunday Overrides"
              value={monthOverrides.length}
              subtext="Special working sessions"
              icon={<Sparkles size={17} />}
              iconBg="bg-amber-lt"
              iconColor="text-amber"
              valueColor="text-amber"
            />
            <KpiCard
              label="Days In Month"
              value={daysInCurrentMonth}
              subtext={monthName}
              icon={<Calendar size={17} />}
              iconBg="bg-blue-lt"
              iconColor="text-blue"
              valueColor="text-blue"
            />
          </div>

          {/* 7-Column Interactive Calendar Grid */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-card overflow-hidden">
            {/* Days of week header */}
            <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-center font-bold text-xs">
              {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d, idx) => (
                <div
                  key={d}
                  className={cn(
                    'py-3 uppercase tracking-wider',
                    idx === 0 ? 'text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/20' : 'text-slate-600 dark:text-slate-300'
                  )}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Grid cells */}
            {loadingHolidays ? (
              <div className="py-24 flex justify-center"><LoadingSpinner fullPage /></div>
            ) : (
              <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-200 dark:divide-slate-700">
                {/* Padding empty cells for month start */}
                {Array.from({ length: firstDayOfMonthIndex }).map((_, idx) => (
                  <div key={`pad-${idx}`} className="min-h-[110px] bg-slate-50/40 dark:bg-slate-900/30 p-2 opacity-30" />
                ))}

                {/* Month day cells */}
                {monthDays.map((day) => {
                  const { dateStr, isSunday, dayHolidays, dayOverrides } = getItemsForDay(day);
                  const isToday = dateStr === getLocalToday();

                  return (
                    <div
                      key={day}
                      className={cn(
                        'min-h-[110px] p-2 transition-colors flex flex-col justify-between group relative',
                        isSunday
                          ? 'bg-rose-50/25 dark:bg-rose-950/10 hover:bg-rose-50/40'
                          : 'bg-white dark:bg-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-750',
                        isToday && 'ring-2 ring-blue ring-inset'
                      )}
                    >
                      {/* Day Header */}
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={cn(
                            'text-xs font-extrabold w-6 h-6 flex items-center justify-center rounded-full',
                            isToday
                              ? 'bg-blue text-white shadow-sm'
                              : isSunday
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-700 dark:text-slate-200'
                          )}
                        >
                          {day}
                        </span>

                        {/* Quick Actions on Hover */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          {isSunday ? (
                            <button
                              type="button"
                              onClick={() => handleOpenSundayOverride(dateStr)}
                              className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-500 hover:text-blue shadow-xs text-[10px] font-bold"
                              title="Manage Sunday Working Override"
                            >
                              <SlidersHorizontal size={12} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setDeclareForm({
                                  title: '',
                                  date: dateStr,
                                  isRange: false,
                                  endDate: dateStr,
                                  category: 'festival',
                                  isSchoolWide: true,
                                  applicableClasses: [],
                                  description: '',
                                });
                                setIsDeclareDrawerOpen(true);
                              }}
                              className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-500 hover:text-purple shadow-xs text-[10px] font-bold"
                              title="Declare Holiday on this day"
                            >
                              <Plus size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Day Content */}
                      <div className="flex flex-col gap-1.5 flex-1 justify-start">
                        {/* Sunday Default Tag */}
                        {isSunday && (
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100/70 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200/50 dark:border-rose-900/50">
                              <Sun size={10} /> Sunday Off
                            </span>

                            {/* Sunday Working Override Pill if any */}
                            {dayOverrides.map(ov => (
                              <div
                                key={ov._id}
                                onClick={() => handleOpenSundayOverride(dateStr)}
                                className="cursor-pointer group/pill inline-flex items-center justify-between text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors"
                                title={`Sunday Working for: ${ov.applicableClasses?.map(formatRoomDisplay).join(', ')}`}
                              >
                                <span className="truncate flex items-center gap-1">
                                  <Sparkles size={9} /> Working: {ov.applicableClasses?.length === allRooms.length ? 'All Classes' : ov.applicableClasses?.map(formatRoomDisplay).join(', ')}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Declared Holidays / Vacations */}
                        {dayHolidays.map(hol => {
                          const catColors =
                            hol.category === 'festival'
                              ? 'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800'
                              : hol.category === 'national_holiday'
                              ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
                              : hol.category === 'emergency'
                              ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800'
                              : 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800';

                          return (
                            <div
                              key={hol._id}
                              className={cn(
                                'group/hol p-1.5 rounded border text-[11px] flex flex-col gap-0.5 shadow-xs transition-all relative',
                                catColors
                              )}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold truncate text-[11px]" title={hol.title}>
                                  {hol.title}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteHoliday(hol._id, hol.title);
                                  }}
                                  className="opacity-0 group-hover/hol:opacity-100 p-0.5 rounded hover:bg-white/60 text-slate-500 hover:text-red transition-opacity"
                                  title="Delete Holiday"
                                >
                                  <Trash2 size={10} />
                                </button>
                              </div>
                              <div className="flex items-center gap-1 text-[9px] font-semibold opacity-80">
                                {hol.isSchoolWide ? (
                                  <span>🏫 Whole School</span>
                                ) : (
                                  <span className="truncate">🎯 {hol.applicableClasses.map(formatRoomDisplay).join(', ')}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Declared Holidays & Overrides Table */}
          <div className="mt-2">
            <DataTable
              card
              header={
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-md font-bold text-slate-900 dark:text-white">Active Holidays & Class Overrides</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Scheduled non-working events and Sunday working overrides for {monthName}</div>
                  </div>
                </div>
              }
            >
              <thead>
                <tr>
                  <Th>Title / Event</Th>
                  <Th>Type & Category</Th>
                  <Th>Dates / Duration</Th>
                  <Th>Applicable Classes</Th>
                  <Th className="text-center" style={{ width: '100px' }}>Action</Th>
                </tr>
              </thead>
              <tbody>
                {holidays.length === 0 ? (
                  <tr>
                    <Td colSpan={5}>
                      <EmptyState
                        icon={<CalendarDays size={36} />}
                        title={`No custom holidays declared for ${monthName}`}
                        subtitle="All standard Sundays are automated holidays. Use '+ Declare Holiday' to add festival breaks or exam overrides."
                      />
                    </Td>
                  </tr>
                ) : (
                  holidays.map((item) => {
                    const isOverride = item.type === 'working_day_override';
                    return (
                      <Tr key={item._id}>
                        <Td>
                          <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                            {isOverride ? <Sparkles size={14} className="text-amber" /> : <CalendarDays size={14} className="text-purple" />}
                            {item.title}
                          </div>
                          {item.description && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.description}</div>
                          )}
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            <Badge
                              variant={isOverride ? 'amber' : item.type === 'vacation' ? 'purple' : 'blue'}
                              size="sm"
                            >
                              {isOverride ? 'Sunday Working Override' : item.type === 'vacation' ? 'Vacation Range' : 'Single Day Holiday'}
                            </Badge>
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                              {item.category.replace('_', ' ')}
                            </span>
                          </div>
                        </Td>
                        <Td>
                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {formatEventDateDisplay(item.date, item.endDate)}
                          </div>
                        </Td>
                        <Td>
                          {item.isSchoolWide ? (
                            <Badge variant="green" size="sm">🏫 Whole School</Badge>
                          ) : (
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {item.applicableClasses.map(cls => (
                                <span key={cls} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                                  {formatRoomDisplay(cls)}
                                </span>
                              ))}
                            </div>
                          )}
                        </Td>
                        <Td className="text-center">
                          <ActionButton iconOnly
                            type="button"
                            onClick={() => handleDeleteHoliday(item._id, item.title)}
                            className="p-1.5 rounded text-slate-400 hover:text-red hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="Delete / Remove"
                          >
                            <Trash2 size={15} />
                          </ActionButton>
                        </Td>
                      </Tr>
                    );
                  })
                )}
              </tbody>
            </DataTable>
          </div>
        </div>

      ) : viewMode === 'reports' ? (
        /* ── REPORTS VIEW ────────────────────────────────────────────────────── */
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
                        <Th style={{ width: '130px' }}>Admission ID</Th>
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
                        <tr><Td colSpan={6}><EmptyState title="No records found for this month" /></Td></tr>
                      ) : (
                        monthlyReport.map(row => (
                          <Tr key={row.studentId}>
                            <Td><span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{row.admissionNo}</span></Td>
                            <Td>{renderStudentCell({ id: row.studentId, name: row.name, admissionNo: row.admissionNo, class: selectedClass, section: selectedSection }, row.cluster)}</Td>
                            <Td className="text-center font-bold text-slate-900 dark:text-white">{row.workingDays}</Td>
                            <Td className="text-center font-bold text-green">{row.present}</Td>
                            <Td className="text-center font-bold text-red">{row.absent}</Td>
                            <Td className="text-center">{renderPctBar(row.percentage)}</Td>
                          </Tr>
                        ))
                      )}
                    </tbody>
                  </DataTable>
                </div>

                {/* Mobile view */}
                <div className="md:hidden flex flex-col gap-3">
                  <div>
                    <div className="text-md font-bold text-slate-900 dark:text-white">Monthly Attendance Report</div>
                    <div className="text-sm text-slate-500 dark:text-slate-500">{roomName} · {reportMonth}</div>
                  </div>
                  {loadingReport ? (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700"><LoadingSpinner fullPage /></div>
                  ) : monthlyReport.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700"><EmptyState title="No records found for this month" /></div>
                  ) : (
                    <MobileCardList>
                      {monthlyReport.map(row => (
                        <MobileRowCard
                          key={row.studentId}
                          title={row.name}
                          subtitle={`Adm: ${row.admissionNo}${row.cluster ? ` · 📍 ${row.cluster}` : ''}`}
                          badge={<Badge variant={row.percentage >= 75 ? 'green' : row.percentage >= 50 ? 'amber' : 'red'}>{row.percentage}%</Badge>}
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
                        <Th style={{ width: '130px' }}>Admission ID</Th>
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
                            <Td className="text-center font-bold text-slate-900 dark:text-white">{row.present} / {row.total}</Td>
                            <Td className="text-center">{renderPctBar(row.percentage)}</Td>
                          </Tr>
                        ))
                      )}
                    </tbody>
                  </DataTable>
                </div>

                {/* Mobile view */}
                <div className="md:hidden flex flex-col gap-3">
                  <div>
                    <div className="text-md font-bold text-slate-900 dark:text-white">Attendance Defaulters</div>
                    <div className="text-sm text-slate-500 dark:text-slate-500">All-time · below threshold</div>
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
        <Form onSubmit={handleSubmitAttendance} className="flex flex-col gap-4">
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
                classStudents.length > 0 && assignedTeacher && !isMarkingLocked ? (
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
                ) : isHolidayDate && !isHolidayOverrideUnlocked ? (
                  <div className="flex items-center justify-between gap-4 px-2 py-1 text-purple-800 text-sm font-semibold">
                    <div className="flex items-center gap-2">
                      <CalendarDays size={15} /> School Holiday — attendance register is locked.
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setHolidayUnlockedDate(attendanceDateFormatted);
                        showToast('Attendance marking unlocked for this holiday session.', 'success');
                      }}
                      className="text-xs font-bold px-3 py-1.5 bg-purple-100 text-purple-900 rounded hover:bg-purple-200"
                    >
                      Unlock Attendance
                    </button>
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

            {classStudents.length > 0 && assignedTeacher && !isMarkingLocked && (
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
            {isHolidayDate && !isHolidayOverrideUnlocked && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-purple-50 border border-purple-200 rounded-md text-purple-800 text-sm font-semibold">
                <div className="flex items-center gap-2">
                  <CalendarDays size={15} /> School Holiday — register is locked.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setHolidayUnlockedDate(attendanceDateFormatted);
                    showToast('Attendance marking unlocked for this holiday session.', 'success');
                  }}
                  className="text-xs font-bold px-3 py-1.5 bg-purple-100 text-purple-900 rounded hover:bg-purple-200"
                >
                  Unlock Attendance
                </button>
              </div>
            )}
          </div>
        </Form>

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

      {/* ── Declare Holiday / Vacation Drawer ───────────────────────────────── */}
      <Drawer
        isOpen={isDeclareDrawerOpen}
        onClose={() => setIsDeclareDrawerOpen(false)}
        title="Declare Holiday / Vacation"
        subtitle="Schedule school-wide or class-specific holidays, festival vacations, or emergency days off."
      >
        <Form onSubmit={handleCreateHoliday} className="flex flex-col gap-5 pt-2">
          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              Event / Holiday Title <span className="text-red">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Dasara Holidays, Gandhi Jayanti, Heavy Rain Off"
              value={declareForm.title}
              onChange={e => setDeclareForm(p => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue"
            />
          </div>

          {/* Single Day vs Vacation Range */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              Duration Mode
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setDeclareForm(p => ({ ...p, isRange: false }))}
                className={cn(
                  'py-2 px-3 text-xs font-bold rounded transition-all',
                  !declareForm.isRange
                    ? 'bg-white dark:bg-slate-700 text-blue shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                )}
              >
                Single Day Holiday
              </button>
              <button
                type="button"
                onClick={() => setDeclareForm(p => ({ ...p, isRange: true }))}
                className={cn(
                  'py-2 px-3 text-xs font-bold rounded transition-all',
                  declareForm.isRange
                    ? 'bg-white dark:bg-slate-700 text-blue shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                )}
              >
                Multi-Day Vacation Range
              </button>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                {declareForm.isRange ? 'Start Date *' : 'Holiday Date *'}
              </label>
              <input
                type="date"
                required
                value={declareForm.date}
                onChange={e => {
                  const val = e.target.value;
                  setDeclareForm(p => ({
                    ...p,
                    date: val,
                    endDate: p.isRange && p.endDate < val ? val : p.endDate
                  }));
                }}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>

            {declareForm.isRange && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                  End Date *
                </label>
                <input
                  type="date"
                  required
                  min={declareForm.date}
                  value={declareForm.endDate}
                  onChange={e => setDeclareForm(p => ({ ...p, endDate: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue"
                />
              </div>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              Category
            </label>
            <select
              value={declareForm.category}
              onChange={e => setDeclareForm(p => ({ ...p, category: e.target.value as any }))}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue"
            >
              <option value="festival">Festival / Cultural Break (e.g. Dasara, Diwali, Pongal)</option>
              <option value="national_holiday">National Holiday (e.g. Independence Day, Gandhi Jayanti)</option>
              <option value="emergency">Emergency / Weather (e.g. Heavy Rain, Cyclone Alert)</option>
              <option value="other">Other School Break</option>
            </select>
          </div>

          {/* Scope: Whole School vs Specific Classes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              Applies To
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg mb-3">
              <button
                type="button"
                onClick={() => setDeclareForm(p => ({ ...p, isSchoolWide: true }))}
                className={cn(
                  'py-2 px-3 text-xs font-bold rounded transition-all',
                  declareForm.isSchoolWide
                    ? 'bg-white dark:bg-slate-700 text-blue shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                )}
              >
                🏫 Whole School
              </button>
              <button
                type="button"
                onClick={() => setDeclareForm(p => ({ ...p, isSchoolWide: false }))}
                className={cn(
                  'py-2 px-3 text-xs font-bold rounded transition-all',
                  !declareForm.isSchoolWide
                    ? 'bg-white dark:bg-slate-700 text-blue shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                )}
              >
                🎯 Specific Classes
              </button>
            </div>

            {!declareForm.isSchoolWide && (
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Select Classes:</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDeclareForm(p => ({ ...p, applicableClasses: [...allRooms] }))}
                      className="text-[11px] font-bold text-blue hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setDeclareForm(p => ({ ...p, applicableClasses: [] }))}
                      className="text-[11px] font-bold text-slate-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
                  {allRooms.map((room) => {
                    const isChecked = declareForm.applicableClasses.includes(room);
                    return (
                      <label
                        key={room}
                        className={cn(
                          'flex items-center gap-2 p-2 rounded border text-xs font-semibold cursor-pointer transition-colors',
                          isChecked
                            ? 'bg-blue-50 border-blue-300 text-blue-900 dark:bg-blue-950/40 dark:border-blue-700 dark:text-blue-200'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setDeclareForm(p => ({ ...p, applicableClasses: [...p.applicableClasses, room] }));
                            } else {
                              setDeclareForm(p => ({ ...p, applicableClasses: p.applicableClasses.filter(r => r !== room) }));
                            }
                          }}
                          className="rounded text-blue"
                        />
                        <span>{formatRoomDisplay(room)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Description / Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              Additional Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. As per Govt Education Board notification..."
              value={declareForm.description}
              onChange={e => setDeclareForm(p => ({ ...p, description: e.target.value }))}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue"
            />
          </div>

          {/* Working Days Safety Note */}
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2">
            <CalendarDays size={16} className="text-blue flex-shrink-0 mt-0.5" />
            <span>
              <strong>Working Days Safety:</strong> Declaring this holiday automatically excludes this date from total working days and student attendance percentages in report cards, even if attendance was already recorded previously.
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <Button type="button" variant="secondary" onClick={() => setIsDeclareDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={savingHoliday}>
              <Check size={16} /> Save Holiday
            </Button>
          </div>
        </Form>
      </Drawer>

      {/* ── Sunday Working Override Modal ────────────────────────────────────── */}
      <Modal
        isOpen={sundayOverrideModal.isOpen}
        onClose={() => setSundayOverrideModal({ isOpen: false, date: '', selectedClasses: [] })}
        title="Manage Sunday Working Sessions"
        subtitle={`Configure special revision or exam working classes for Sunday, ${sundayOverrideModal.date ? new Date(sundayOverrideModal.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}`}
        maxWidth="600px"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSundayOverrideModal({ isOpen: false, date: '', selectedClasses: [] })}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={savingOverride}
              onClick={handleSaveSundayOverride}
            >
              <Check size={16} /> Save Working Classes
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 py-1">
          <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-900 dark:text-blue-200">
            <p className="font-bold flex items-center gap-1.5 mb-1">
              <Sparkles size={14} className="text-blue" />
              Dynamic Sunday Class Activation
            </p>
            <p className="opacity-90 leading-relaxed">
              By default, all Sundays are automated holidays. If any specific grades (e.g. <strong>Class 10</strong>) have special revision or exam sessions on this Sunday, check them below. Only selected classes will have active attendance and contribute to student working days.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Select Working Classes ({sundayOverrideModal.selectedClasses.length} selected)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSundayOverrideModal(p => ({ ...p, selectedClasses: [...allRooms] }))}
                className="text-xs font-bold text-blue hover:underline"
              >
                Select All
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => setSundayOverrideModal(p => ({ ...p, selectedClasses: [] }))}
                className="text-xs font-bold text-slate-500 hover:underline"
              >
                Clear All (All Off)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-1">
            {allRooms.map((room) => {
              const isChecked = sundayOverrideModal.selectedClasses.includes(room);
              return (
                <label
                  key={room}
                  className={cn(
                    'flex items-center gap-2.5 p-2.5 rounded-lg border text-sm font-bold cursor-pointer transition-all',
                    isChecked
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-200 shadow-xs'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSundayOverrideModal(p => ({ ...p, selectedClasses: [...p.selectedClasses, room] }));
                      } else {
                        setSundayOverrideModal(p => ({ ...p, selectedClasses: p.selectedClasses.filter(r => r !== room) }));
                      }
                    }}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>{formatRoomDisplay(room)}</span>
                </label>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminAttendance;
