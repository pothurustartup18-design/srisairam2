import React, { useState, useEffect, lazy, Suspense } from 'react';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import {
  Search, Bell, MessageCircle, Check, LayoutDashboard, BarChart2, BellRing, Wallet, GraduationCap, Users,
  CalendarX2, CalendarCheck, BookOpen, ClipboardList, MessageSquare, Megaphone, MessagesSquare,
} from 'lucide-react';

import Toast from '../../shared/Toast/Toast';
import ErrorBoundary from '../../shared/ErrorBoundary/ErrorBoundary';
const AdminDashboard = lazy(() => import('../AdminDashboard/AdminDashboard'));
const AdminFeeAnalytics = lazy(() => import('../AdminFeeAnalytics/AdminFeeAnalytics'));
const AdminTeachers = lazy(() => import('../AdminTeachers/AdminTeachers'));
const AdminStudents = lazy(() => import('../AdminStudents/AdminStudents'));
const AdminLeaves = lazy(() => import('../AdminLeaves/AdminLeaves'));
const AdminFeedbacks = lazy(() => import('../AdminFeedbacks/AdminFeedbacks'));
const AdminEvents = lazy(() => import('../AdminEvents/AdminEvents'));
const AdminAttendance = lazy(() => import('../AdminAttendance/AdminAttendance'));
const AdminMarks = lazy(() => import('../AdminMarks/AdminMarks'));
const AdminSettings = lazy(() => import('../AdminSettings/AdminSettings'));
const AdminProfile = lazy(() => import('../AdminProfile/AdminProfile'));
const AppUpdates = lazy(() => import('../../shared/AppUpdates/AppUpdates'));
const AdminMessages = lazy(() => import('../AdminMessages/AdminMessages'));
const HomeworkBoard = lazy(() => import('../../shared/HomeworkBoard/HomeworkBoard'));
const AdminReminders = lazy(() => import('../AdminReminders/AdminReminders'));
const AdminCollectFee = lazy(() => import('../AdminCollectFee/AdminCollectFee'));
const AdminExpenditures = lazy(() => import('../AdminExpenditures/AdminExpenditures'));
import { getAccessToken } from '../../../services/api';
import { useAuth } from '../../../context/authContext';
import { Button, SkeletonPage, AppShell, type ShellNavItem } from '../../ui';


import type {
  UserProfile,
  StudentData,
  TeacherData,
  EventData,
  LeaveData,
  FeedbackData,
  ToastState,
  ClassData,
} from '../../../types';
import { API_BASE, getSelectableClasses, sortClasses, classOrder } from '../../../constants';
import { Form } from '../../ui/Form';
import { ActionButton } from '../../ui/ActionButton';
import { readJson } from '../../../lib/http';
import type { DataStatus } from '../../../hooks/useApiData';


type AdminView = 'dashboard' | 'fee-analytics' | 'collect-fee' | 'expenditures' | 'teachers' | 'students' | 'leaves' | 'feedbacks' | 'events' | 'attendance' | 'marks' | 'homework' | 'settings' | 'messages' | 'reminders' | 'profile';

interface AdminPortalProps {
  user: UserProfile;
  students: StudentData[];
  teachers: TeacherData[];
  events: EventData[];
  onLogout: () => void;
  onDataReload: () => void;
}

const AdminPortal: React.FC<AdminPortalProps> = ({
  user,
  students,
  teachers,
  events,
  onLogout,
  onDataReload,
}) => {
  const [activeView, setActiveView] = useState<AdminView>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });
  const { hasPermission } = useAuth();

  // Redirect if user has no permission for current activeView
  useEffect(() => {
    const viewPermissions: Record<AdminView, string | null> = {
      'dashboard': 'dashboard:view',
      'fee-analytics': 'fees:view',
      'teachers': 'teachers:read',
      'students': 'students:read',
      'attendance': 'attendance:mark',
      'marks': 'reports:view',
      'homework': 'homework:read',
      'leaves': 'reports:view',
      'feedbacks': 'feedback:read',
      'messages': 'messages:read',
      'events': 'events:manage',
      'reminders': 'fees:view',
      'settings': 'settings:manage',
      'collect-fee': 'fees:view',
      'expenditures': 'expenditure:view',
      'profile': null
    };

    const requiredPerm = viewPermissions[activeView];
    if (requiredPerm && !hasPermission(requiredPerm)) {
      const keys: AdminView[] = [
        'dashboard', 'fee-analytics', 'teachers', 'students', 'attendance',
        'marks', 'homework', 'leaves', 'feedbacks', 'messages', 'events',
        'reminders', 'settings', 'profile', 'expenditures'
      ];
      const fallback = keys.find(k => {
        const p = viewPermissions[k];
        return !p || hasPermission(p);
      });
      if (fallback) {
        setActiveView(fallback);
      }
    }
  }, [activeView, hasPermission]);

  // ─── Class State ────────────────────────────────────────────────────────────
  const [classesList, setClassesList] = useState<ClassData[]>([]);
  const [schoolProfile, setSchoolProfile] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_BASE}/school-profile`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) setSchoolProfile(data.data);
      })
      .catch(err => console.error('Failed to load school profile:', err));
  }, []);

  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  // ─── WhatsApp Quota State ──────────────────────────────────────────────────
  const [whatsappSentCount, setWhatsappSentCount] = useState<number>(0);
  const [whatsappLimit, setWhatsappLimit] = useState<number>(100);

  const fetchWhatsappQuota = async () => {
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/settings/whatsapp-quota`, { headers });
      const data = await res.json();
      if (data.success) {
        setWhatsappSentCount(Number(data.count) || 0);
        setWhatsappLimit(Number(data.limit) || 100);
      }
    } catch (err) {
      console.error('Failed to fetch whatsapp quota:', err);
    }
  };

  useEffect(() => {
    if (!hasPermission('whatsapp:view')) return;
    fetchWhatsappQuota();
    const interval = setInterval(fetchWhatsappQuota, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleResetQuotaFromHeader = async () => {
    const input = window.prompt(
      'Enter the new WhatsApp message limit (the sent counter will be reset to 0):',
      String(whatsappLimit)
    );
    if (input === null) return; // user cancelled
    const newLimit = parseInt(input, 10);
    if (Number.isNaN(newLimit) || newLimit <= 0) {
      showToast('Please enter a valid positive number.', 'error');
      return;
    }

    try {
      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // Update limit
      const resLimit = await fetch(`${API_BASE}/settings/system-config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ key: 'whatsappLimit', value: newLimit })
      });

      // Reset count to 0
      const resCount = await fetch(`${API_BASE}/settings/system-config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ key: 'whatsappSentCount', value: 0 })
      });

      const dataLimit = await resLimit.json();
      const dataCount = await resCount.json();

      if (resLimit.ok && resCount.ok && dataLimit.success && dataCount.success) {
        showToast(`WhatsApp limit set to ${newLimit} and counter reset to 0.`, 'success');
        setWhatsappSentCount(0);
        setWhatsappLimit(newLimit);
      } else {
        showToast('Failed to update quota settings.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error updating quota settings.', 'error');
    }
  };

  // ─── Leave State ────────────────────────────────────────────────────────────
  const [leavesList, setLeavesList] = useState<LeaveData[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<any>(null);
  const [academicSnapshot, setAcademicSnapshot] = useState<any>(null);
  // First-load status of the lists/widgets fetched below. Later refreshes keep
  // whatever is already on screen.
  const [loadStatus, setLoadStatus] = useState<Record<'leaves' | 'feedbacks' | 'attendance' | 'snapshot', DataStatus>>({
    leaves: 'loading', feedbacks: 'loading', attendance: 'loading', snapshot: 'loading',
  });
  const markLoaded = (key: keyof typeof loadStatus, ok: boolean) =>
    setLoadStatus((s) => ({ ...s, [key]: ok ? 'success' : s[key] === 'success' ? 'success' : 'error' }));
  const [activeLeaveChat, setActiveLeaveChat] = useState<LeaveData | null>(null);
  const [leaveChatText, setLeaveChatText] = useState('');

  // ─── Feedback State ─────────────────────────────────────────────────────────
  const [feedbacksList, setFeedbacksList] = useState<FeedbackData[]>([]);
  const [activeFeedbackChat, setActiveFeedbackChat] = useState<FeedbackData | null>(null);
  const [feedbackChatText, setFeedbackChatText] = useState('');

  // ─── Teacher Form ────────────────────────────────────────────────────────────
  const [newTeacher, setNewTeacher] = useState({
    employeeId: '',
    name: '',
    gender: 'male' as 'male' | 'female' | 'other',
    dob: '',
    phone: '',
    email: '',
    address: '',
    assignedClass: '',
    subjects: [] as string[],
    teachingClasses: [] as string[],
    classTeacherOf: '' as string | null,
    cluster: '',
    salary: 0
  });
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);

  // ─── Student Form ────────────────────────────────────────────────────────────
  const [newStudent, setNewStudent] = useState({
    admissionNo: '',
    admissionAcademicYear: '2026-27',
    firstName: '', lastName: '',
    class: '10', section: 'A',
    classTeacherId: '',
    feePaid: 0, feePending: 0, whatsappNo: '',
    motherWhatsappNo: '',
    transportMode: 'school',
    booksFee: 0,
    preferredLanguage: 'en',
    cluster: '',
    dateOfBirth: '',
    gender: '',
    bloodGroup: '',
    house: '',
    fatherName: '',
    motherName: '',
    address: '',
  });
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);

  // ─── Auto-fetch next admission number ─────────────────────────────────────
  const fetchNextAdmissionNo = async (academicYear?: string) => {
    try {
      const year = academicYear || newStudent.admissionAcademicYear || '2026-27';
      const res = await fetch(`${API_BASE}/students/next-admission-no?academicYear=${year}`);
      const data = await res.json();
      if (data.success && data.nextAdmissionNo) {
        setNewStudent(prev => ({ ...prev, admissionNo: data.nextAdmissionNo }));
      }
    } catch {
      // fallback: keep current value, admin can type manually
    }
  };

  // ─── Auto-fetch next employee ID ─────────────────────────────────────────────
  const fetchNextEmployeeId = async () => {
    try {
      const res = await fetch(`${API_BASE}/teachers/next-employee-id`);
      const data = await res.json();
      if (data.success && data.nextEmployeeId) {
        setNewTeacher(prev => ({ ...prev, employeeId: data.nextEmployeeId }));
      }
    } catch {
      // fallback
    }
  };

  // Fetch on mount — only if the user can actually create the thing this ID is for,
  // otherwise this is just a guaranteed-403 request on every AdminPortal load for
  // any limited-permission custom employee.
  useEffect(() => {
    if (hasPermission('students:create')) fetchNextAdmissionNo('2026-27');
    if (hasPermission('teachers:create') || hasPermission('settings:manage')) fetchNextEmployeeId();
  }, []);

  // ─── Event Form ──────────────────────────────────────────────────────────────
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    date: '',
    media: [] as string[],
    // Durable per-file metadata (s3Key, not a presigned URL) — sent alongside
    // `media` so the backend can save it to Event.mediaAttachments and build
    // the permanent, non-expiring gallery link for the WhatsApp alert. Same
    // order/length as `media`, appended together in handleMediaUpload.
    mediaAttachments: [] as { s3Key: string; filename: string; contentType?: string; size?: number; mediaType?: string }[],
    sendAlertsTo: 'none' as 'none' | 'parents' | 'teachers' | 'both',
    classes: [] as string[],
    sections: [] as string[],
    scheduledAlertTime: '',
    type: 'notice' as 'notice' | 'event'
  });
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaUploadPercent, setMediaUploadPercent] = useState<number | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState('');

  // ─── Delete confirmation modal states ────────────────────────────────────────
  // Either a single record (`data`) or a bulk selection (`bulkIds`) — never both.
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'student' | 'teacher'; data?: any; bulkIds?: string[] } | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  // ─── Promote Students (bulk, next-class rollover) states ─────────────────────
  const [promoteTarget, setPromoteTarget] = useState<string[]>([]);
  const [promoteToClass, setPromoteToClass] = useState('');
  const [promoteToSection, setPromoteToSection] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [promoteResult, setPromoteResult] = useState<{ promoted: any[] } | null>(null);

  // Students currently selected for promotion, and their current class(es)/section(s) —
  // used both to pre-fill sensible defaults and to warn if the selection spans more
  // than one class (promoting a mixed selection sends them all to the same destination).
  const promoteSelection = students.filter(s => promoteTarget.includes(s.id || s._id || ''));
  const promoteFromClasses = Array.from(new Set(promoteSelection.map(s => s.class))).sort();
  const promoteFromSections = Array.from(new Set(promoteSelection.map(s => s.section))).sort();

  useEffect(() => {
    if (promoteTarget.length === 0) return;
    const selected = students.filter(s => promoteTarget.includes(s.id || s._id || ''));
    const currentClasses = Array.from(new Set(selected.map(s => s.class)));
    const currentSections = Array.from(new Set(selected.map(s => s.section)));

    let defaultClass = '';
    if (currentClasses.length === 1) {
      const idx = classOrder.indexOf(currentClasses[0].toUpperCase());
      defaultClass = idx >= 0 && idx < classOrder.length - 1 ? classOrder[idx + 1] : currentClasses[0];
    }
    setPromoteToClass(defaultClass);
    setPromoteToSection(currentSections.length === 1 ? currentSections[0] : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promoteTarget]);

  // ─── Fee Collection Search & Modal States ────────────────────────────────────
  const [collectFeeStudentId, setCollectFeeStudentId] = useState<string | undefined>(undefined);
  const [collectFeeBackView, setCollectFeeBackView] = useState<AdminView>('dashboard');
  // Single unified modal step: null = closed, 'search' = step 1, 'payment' = step 2, 'success' = step 3
  const [feeModalStep, setFeeModalStep] = useState<null | 'search' | 'payment' | 'success'>(null);
  const [searchName, setSearchName] = useState('');
  const [searchClass, setSearchClass] = useState('all');

  const [selectedStudentForPayment, setSelectedStudentForPayment] = useState<StudentData | null>(null);

  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentType, setPaymentType] = useState<'school' | 'books' | 'transport'>('school');
  const [showPaymentSuccessModal, setShowPaymentSuccessModal] = useState<any | null>(null);

  // ─── Toast helper ────────────────────────────────────────────────────────────
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  };

  // ─── Computed values ─────────────────────────────────────────────────────────
  const filteredStudents = students.filter((s) => {
    const q = searchQuery.toLowerCase();
    const classSec = `${s.class}-${s.section}`.toLowerCase();
    const classSecSpaced = `${s.class} ${s.section}`.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.admissionNo.toLowerCase().includes(q) ||
      s.class.toLowerCase().includes(q) ||
      s.section.toLowerCase().includes(q) ||
      classSec.includes(q) ||
      classSecSpaced.includes(q) ||
      s.classTeacher.toLowerCase().includes(q)
    );
  });

  const filteredTeachers = teachers.filter((t) => {
    const q = searchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.assignedClass.toLowerCase().includes(q)
    );
  });

  const totalStudents = students.length;
  const totalTeachers = teachers.length;
  const paidFeesTotal = students.reduce((a, s) => a + s.feePaid, 0);
  const pendingFeesTotal = students.reduce((a, s) => a + s.feePending, 0);

  // ─── Load Leaves ─────────────────────────────────────────────────────────────
  const loadLeaves = async () => {
    try {
      const data = await readJson(await fetch(`${API_BASE}/leaves`));
      setLeavesList(data.data);
      markLoaded('leaves', true);
    } catch (err) {
      console.error('Failed to load leaves:', err);
      markLoaded('leaves', false);
    }
  };

  // ─── Load Feedbacks ──────────────────────────────────────────────────────────
  const loadFeedbacks = async () => {
    try {
      const data = await readJson(await fetch(`${API_BASE}/feedbacks`));
      setFeedbacksList(data.data);
      markLoaded('feedbacks', true);
    } catch (err) {
      console.error('Failed to load feedbacks:', err);
      markLoaded('feedbacks', false);
    }
  };

  // ─── Load Classes ───────────────────────────────────────────────────────────
  const loadClasses = async () => {
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/classes`, { headers });
      const data = await res.json();
      if (res.ok && data.success) {
        setClassesList(data.data);
      } else {
        console.error('Failed to load classes:', data.message);
      }
    } catch (err) {
      console.error('Failed to load classes:', err);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const res = await fetch(`${API_BASE}/messages/threads`);
      const data = await res.json();
      if (data.success) {
        let count = 0;
        data.data.studentThreads.forEach((t: any) => count += (t.unreadCount || 0));
        data.data.teacherThreads.forEach((t: any) => count += (t.unreadCount || 0));
        setUnreadMessagesCount(count);
      }
    } catch (err) {
      console.error('Failed to load unread message count:', err);
    }
  };

  const loadTodayAttendance = async () => {
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const data = await readJson(await fetch(`${API_BASE}/dashboard/attendance-today?t=${Date.now()}`, { headers }));
      setTodayAttendance(data.data);
      markLoaded('attendance', true);
    } catch (err) {
      console.error('Failed to load today attendance:', err);
      markLoaded('attendance', false);
    }
  };

  const loadAcademicSnapshot = async () => {
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const data = await readJson(await fetch(`${API_BASE}/dashboard/academic-snapshot?t=${Date.now()}`, { headers }));
      setAcademicSnapshot(data.data);
      markLoaded('snapshot', true);
    } catch (err) {
      console.error('Failed to load academic snapshot:', err);
      markLoaded('snapshot', false);
    }
  };

  useEffect(() => {
    // Each gated behind the permission its data actually requires server-side —
    // otherwise this whole block re-fires on every view change for every
    // AdminPortal user (now including limited-permission custom employees),
    // guaranteeing a wave of 403s for data they were never granted.
    if (hasPermission('reports:view')) loadLeaves();
    if (hasPermission('feedback:read')) loadFeedbacks();
    if (hasPermission('students:read')) loadClasses(); // GET /api/classes requires students:read server-side
    if (hasPermission('messages:read')) fetchUnreadCount();
    if (hasPermission('dashboard:widget:attendanceToday')) loadTodayAttendance();
    if (hasPermission('dashboard:widget:academicSnapshot')) loadAcademicSnapshot();
    if (activeView === 'dashboard') {
      onDataReload();
    }

    const interval = setInterval(() => { if (hasPermission('messages:read')) fetchUnreadCount(); }, 30000);
    return () => clearInterval(interval);
  }, [activeView]);

  // ─── Create/Update Teacher ───────────────────────────────────────────────────
  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacher.name || !newTeacher.gender || !newTeacher.dob || !newTeacher.phone || !newTeacher.email) {
      showToast('Please fill out all required teacher fields (Name, Gender, DOB, Phone, Email).', 'error'); return;
    }
    const isEditing = !!editingTeacherId;
    const url = isEditing ? `${API_BASE}/teachers/${editingTeacherId}` : `${API_BASE}/teachers`;
    const method = isEditing ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTeacher),
      });
      const data = await res.json();
      if (data.success) {
        showToast(isEditing ? `Teacher ${newTeacher.name} successfully updated.` : `Teacher ${newTeacher.name} successfully registered. Credentials sent to their WhatsApp.`);
        setNewTeacher({
          employeeId: '',
          name: '',
          gender: 'male',
          dob: '',
          phone: '',
          email: '',
          address: '',
          assignedClass: '',
          subjects: [],
          teachingClasses: [],
          classTeacherOf: '',
          cluster: '',
          salary: 0
        });
        setEditingTeacherId(null);
        onDataReload();
        fetchNextEmployeeId();
      } else showToast(data.message || 'Error saving teacher.', 'error');
    } catch (err: any) {
      showToast(err.message || 'Error saving teacher.', 'error');
    }
  };

  // ─── Create/Update Student ───────────────────────────────────────────────────
  const handleCreateStudent = async (e: React.FormEvent): Promise<boolean> => {
    e.preventDefault();
    const { firstName, whatsappNo } = newStudent;

    const missing: string[] = [];
    if (!firstName || !firstName.trim()) missing.push('First Name');
    if (!whatsappNo || !whatsappNo.trim()) missing.push('Father/Primary WhatsApp');
    if (!newStudent.class) missing.push('Class');

    if (missing.length > 0) {
      showToast(`Required fields missing: ${missing.join(', ')}.`, 'error');
      return false;
    }

    const cleanPhone = (whatsappNo || '').replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      showToast('Primary WhatsApp number must be exactly 10 digits.', 'error');
      return false;
    }

    if (newStudent.motherWhatsappNo && newStudent.motherWhatsappNo.trim() !== '') {
      const cleanMother = newStudent.motherWhatsappNo.replace(/\D/g, '');
      if (cleanMother.length !== 10) {
        showToast('Mother WhatsApp number must be exactly 10 digits.', 'error');
        return false;
      }
    }

    const isEditing = !!editingStudentId;
    const url = isEditing ? `${API_BASE}/students/${editingStudentId}` : `${API_BASE}/students`;
    const method = isEditing ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newStudent,
          firstName: firstName.trim(),
          lastName: (newStudent.lastName || '').trim(),
          whatsappNo: cleanPhone,
          motherWhatsappNo: (newStudent.motherWhatsappNo || '').replace(/\D/g, ''),
          feePaid: Number(newStudent.feePaid) || 0,
          feePending: Number(newStudent.feePending) || 0
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(isEditing ? `Student ${firstName} updated successfully.` : `Student ${firstName} admitted successfully!`);
        setNewStudent({
          admissionNo: '',
          admissionAcademicYear: '2026-27',
          firstName: '', lastName: '',
          class: '10', section: 'A',
          classTeacherId: '',
          feePaid: 0, feePending: 0, whatsappNo: '',
          motherWhatsappNo: '',
          transportMode: 'school',
          booksFee: 0,
          preferredLanguage: 'en',
          cluster: '',
          dateOfBirth: '',
          gender: '',
          bloodGroup: '',
          house: '',
          fatherName: '',
          motherName: '',
          address: '',
        });
        setEditingStudentId(null);
        fetchNextAdmissionNo('2026-27');
        onDataReload();
        return true;
      } else {
        showToast(data.message || 'Error saving student.', 'error');
        return false;
      }
    } catch (err: any) {
      showToast(err.message || 'Error saving student.', 'error');
      return false;
    }
  };

  // ─── Edit Handlers ────────────────────────────────────────────────────────────
  const handleEditTeacher = (teacher: TeacherData) => {
    setEditingTeacherId(teacher._id || null);
    setNewTeacher({
      employeeId: teacher.employeeId || '',
      name: teacher.name || '',
      gender: teacher.gender || 'male',
      dob: teacher.dob ? teacher.dob.split('T')[0] : '',
      phone: teacher.phone || '',
      email: teacher.email || '',
      address: teacher.address || '',
      assignedClass: teacher.assignedClass || '',
      subjects: teacher.subjects || [],
      teachingClasses: teacher.teachingClasses || [],
      classTeacherOf: teacher.classTeacherOf || '',
      cluster: teacher.cluster || '',
      salary: teacher.salary || 0
    });
    setActiveView('teachers');
  };

  const handleCancelEditTeacher = () => {
    setEditingTeacherId(null);
    setNewTeacher({
      employeeId: '',
      name: '',
      gender: 'male',
      dob: '',
      phone: '',
      email: '',
      address: '',
      assignedClass: '',
      subjects: [],
      teachingClasses: [],
      classTeacherOf: '',
      cluster: '',
      salary: 0
    });
    fetchNextEmployeeId();
  };

  const handleEditStudent = (student: StudentData) => {
    setEditingStudentId(student.id || student._id || null);

    const nameParts = (student.name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const teacher = teachers.find(t => t.name.toLowerCase() === (student.classTeacher || '').toLowerCase());

    setNewStudent({
      admissionNo: student.admissionNo || '',
      admissionAcademicYear: student.admissionAcademicYear || '2026-27',
      firstName,
      lastName,
      class: student.class || '10',
      section: student.section || 'A',
      classTeacherId: teacher?._id || student.classTeacher || '',
      feePaid: student.feePaid || 0,
      feePending: student.feePending || 0,
      whatsappNo: student.whatsappNo || '',
      motherWhatsappNo: student.motherWhatsappNo || '',
      transportMode: student.transportMode || 'school',
      booksFee: student.booksFee || 0,
      preferredLanguage: student.preferredLanguage || 'en',
      cluster: student.cluster || '',
      dateOfBirth: student.dateOfBirth ? student.dateOfBirth.split('T')[0] : '',
      gender: student.gender || '',
      bloodGroup: student.bloodGroup || '',
      house: student.house || '',
      fatherName: student.fatherName || '',
      motherName: student.motherName || '',
      address: student.address || '',
    });
    setActiveView('students');
  };

  const handleCancelEditStudent = () => {
    setEditingStudentId(null);
    setNewStudent({
      admissionNo: '',
      admissionAcademicYear: '2026-27',
      firstName: '', lastName: '',
      class: '10', section: 'A',
      classTeacherId: teachers[0]?._id || '',
      feePaid: 0, feePending: 0, whatsappNo: '',
      motherWhatsappNo: '',
      transportMode: 'school',
      booksFee: 0,
      preferredLanguage: 'en',
      cluster: '',
      dateOfBirth: '',
      gender: '',
      bloodGroup: '',
      house: '',
      fatherName: '',
      motherName: '',
      address: '',
    });
    fetchNextAdmissionNo();
  };

  // â”€â”€â”€ Send Reminder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleSendReminder = async (
    studentId: string,
    feeCategory: 'school' | 'books' | 'transport' | 'all' = 'all'
  ) => {
    try {
      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // The backend runs the shared fee calculation (fee type + amount) and sends
      // the approved installment_reminder template — no free-form message.
      const res = await fetch(`${API_BASE}/dashboard/send-reminder`, {
        method: 'POST', headers,
        body: JSON.stringify({ studentId, feeCategory }),
      });
      const data = await res.json();
      showToast(data.message || (data.success ? 'Fee reminder sent on WhatsApp.' : 'Failed to send reminder.'), data.success ? 'success' : 'error');
    } catch (err: any) {
      showToast(err.message || 'Failed to send reminder.', 'error');
    }
  };

  // ─── Record Payment ────────────────────────────────────────────────────────
  const handleRecordPayment = async (studentId: string, amount: number, feeType: 'school' | 'books' | 'transport') => {
    try {
      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/dashboard/record-payment`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ studentId, amount, feeType }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        onDataReload();
        return data.receipt;
      } else {
        showToast(data.message || 'Error recording payment.', 'error');
        return null;
      }
    } catch (err: any) {
      showToast(err.message || 'Error recording payment.', 'error');
      return null;
    }
  };

  // Render receipt PDF
  const generateReceiptPDF = (receiptData: any, student: StudentData): Promise<string> => {
    return new Promise(async (resolve) => {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a5' // 148mm x 210mm
      });

      const pageWidth = 148;
      const pageHeight = 210;

      // Extract school info dynamically from settings
      const schoolName = schoolProfile?.schoolInfo?.schoolName || 'SCHOOLHUB ACADEMY';
      const addressLine = [
        schoolProfile?.address?.addressLine,
        schoolProfile?.address?.city,
        schoolProfile?.address?.state,
        schoolProfile?.address?.pincode
      ].filter(Boolean).join(', ') || '123 Education Campus Road, Hyderabad, Telangana';
      const phone = schoolProfile?.contactInfo?.phone || '+91 9392646349';
      const email = schoolProfile?.contactInfo?.email || 'admin@schoolhub.edu';
      const academicYear = schoolProfile?.academicConfig?.currentAcademicYear || '2026-27';

      // Outer Border
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.4);
      doc.rect(5, 5, pageWidth - 10, pageHeight - 10);
      doc.rect(6, 6, pageWidth - 12, pageHeight - 12);

      // Top Navy Header Bar
      doc.setFillColor(15, 23, 42); // slate-900 #0f172a
      doc.rect(6, 6, pageWidth - 12, 28, 'F');

      // Amber Gold Accent strip
      doc.setFillColor(217, 119, 6); // amber-600 #d97706
      doc.rect(6, 34, pageWidth - 12, 1.2, 'F');

      // School Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text(schoolName.toUpperCase(), 12, 16);

      // Address & Contact
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(203, 213, 225); // slate-300
      doc.text(addressLine.length > 55 ? addressLine.substring(0, 52) + '…' : addressLine, 12, 22);
      doc.text(`Phone: ${phone}  |  Email: ${email}`, 12, 27);

      // Right Top Badge: Fee Receipt Title
      doc.setFillColor(30, 58, 138); // blue-900
      doc.roundedRect(pageWidth - 48, 11, 40, 16, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text('FEE RECEIPT', pageWidth - 28, 17, { align: 'center' });
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(`AY: ${academicYear}`, pageWidth - 28, 23, { align: 'center' });

      let y = 41;

      // Receipt Metadata Box & Student Details Box (Side-by-Side Cards)
      const cardW = (pageWidth - 28) / 2; // 60mm each

      // Left Box: Receipt Details
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(10, y, cardW, 36, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(30, 58, 138);
      doc.text('RECEIPT INFORMATION', 14, y + 6);
      doc.setDrawColor(203, 213, 225);
      doc.line(14, y + 8, 10 + cardW - 4, y + 8);

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Receipt No:', 14, y + 14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(receiptData.receiptNo || 'N/A', 36, y + 14);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Date:', 14, y + 20);
      doc.setTextColor(15, 23, 42);
      doc.text(receiptData.paymentDate || new Date().toISOString().split('T')[0], 36, y + 20);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Time:', 14, y + 26);
      doc.setTextColor(15, 23, 42);
      doc.text(receiptData.paymentTime || new Date().toLocaleTimeString(), 36, y + 26);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Mode:', 14, y + 32);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 58, 138);
      doc.text((receiptData.paymentMode || 'Cash').toUpperCase(), 36, y + 32);

      // Right Box: Student Info
      const xRight = 10 + cardW + 8;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(xRight, y, cardW, 36, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(30, 58, 138);
      doc.text('STUDENT INFORMATION', xRight + 4, y + 6);
      doc.setDrawColor(203, 213, 225);
      doc.line(xRight + 4, y + 8, xRight + cardW - 4, y + 8);

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Student Name:', xRight + 4, y + 14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      const stName = receiptData.studentName || `${student.firstName || ''} ${student.lastName || ''}`.trim();
      doc.text(stName.length > 20 ? stName.substring(0, 18) + '…' : stName, xRight + 26, y + 14);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Admission ID:', xRight + 4, y + 20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(student.admissionNo || 'N/A', xRight + 26, y + 20);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Class & Sec:', xRight + 4, y + 26);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`Class ${student.class} - ${student.section}`, xRight + 26, y + 26);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Phone:', xRight + 4, y + 32);
      doc.setTextColor(15, 23, 42);
      doc.text(student.whatsappNo || 'N/A', xRight + 26, y + 32);

      y += 42;

      // Itemized Fee Breakdown Table
      doc.setFillColor(30, 41, 59); // slate-800
      doc.rect(10, y, pageWidth - 20, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text('SL', 14, y + 4.5);
      doc.text('FEE DESCRIPTION', 30, y + 4.5);
      doc.text('PAYMENT TYPE', 85, y + 4.5);
      doc.text('AMOUNT PAID (INR)', pageWidth - 14, y + 4.5, { align: 'right' });

      y += 7;

      // Row 1
      doc.setFillColor(255, 255, 255);
      doc.rect(10, y, pageWidth - 20, 8, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.line(10, y + 8, pageWidth - 10, y + 8);

      const feeName = receiptData.feeType === 'school' ? 'Tuition Fee Payment' : receiptData.feeType === 'books' ? 'Books & Material Fee' : 'Transport Fee';

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text('1', 14, y + 5);
      doc.text(feeName, 30, y + 5);
      doc.text('Partial / Installment', 85, y + 5);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 163, 74); // Green
      doc.text(`Rs. ${Number(receiptData.amount).toLocaleString('en-IN')}`, pageWidth - 14, y + 5, { align: 'right' });

      y += 12;

      // Total Net Amount Banner Card
      doc.setFillColor(240, 253, 244); // green-50
      doc.setDrawColor(187, 247, 208);
      doc.roundedRect(10, y, pageWidth - 20, 14, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(21, 128, 61);
      doc.text('TOTAL RECEIVED AMOUNT:', 15, y + 8.5);

      doc.setFontSize(13);
      doc.text(`INR ${Number(receiptData.amount).toLocaleString('en-IN')}`, pageWidth - 15, y + 9, { align: 'right' });

      y += 20;

      // Verification & QR Scanner Box (Preserved QR Code Scanner)
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(10, y, pageWidth - 20, 32, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text('OFFICIAL VERIFICATION & AUTHENTICITY', 14, y + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('This receipt is cryptographically generated & verified.', 14, y + 11);
      doc.text('Scan the QR code to verify this transaction on the portal.', 14, y + 15);
      doc.text('Verified by: SchoolHub Security Engine', 14, y + 19);

      // Signature line in verification box
      doc.setDrawColor(148, 163, 184);
      doc.line(14, y + 27, 55, y + 27);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(51, 65, 85);
      doc.text('Authorized Cashier / Accounts Stamp', 14, y + 30);

      // Generate the QR code locally (same approach as the report-card PDF —
      // see report-card/index.tsx's generateVerificationQrDataUri) instead of
      // calling a third-party image API: no network dependency, so it can
      // never hang or fail due to CORS/connectivity/rate limits.
      const originHost = window.location.origin;
      const verifyUrl = `${originHost}/?verify_token=${receiptData.receiptNo || receiptData.token}`;
      try {
        const qrDataUri = await QRCode.toDataURL(verifyUrl, {
          margin: 0,
          errorCorrectionLevel: 'M',
          color: { dark: '#0F172A', light: '#FFFFFF' },
        });
        doc.addImage(qrDataUri, 'PNG', pageWidth - 37, y + 3, 24, 24);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 58, 138);
        doc.text('SCAN TO VERIFY', pageWidth - 25, y + 29, { align: 'center' });
      } catch (err) {
        console.error('Failed to generate/embed QR code into receipt PDF:', err);
      }
      resolve(doc.output('datauristring'));
    });
  };

  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForPayment || !paymentAmount || Number(paymentAmount) <= 0) return;

    const amountNum = Number(paymentAmount);
    const student = selectedStudentForPayment;

    // Call the existing handleRecordPayment function
    const receipt = await handleRecordPayment(student.id || student._id || '', amountNum, paymentType);

    if (receipt) {
      // Generate PDF receipt as base64 string
      const pdfBase64 = await generateReceiptPDF(receipt, student);

      // Upload PDF and send WhatsApp message
      try {
        const token = getAccessToken();
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        await fetch(`${API_BASE}/dashboard/upload-receipt-pdf`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            receiptNo: receipt.receiptNo,
            pdfBase64,
            recipient: receipt.recipient || student.whatsappNo,
            whatsappMessage: receipt.whatsappMessage
          })
        });
      } catch (uploadErr) {
        console.error('Error uploading receipt PDF:', uploadErr);
      }

      setShowPaymentSuccessModal({ receipt, student });
      setFeeModalStep('success');
    }
  };

  // ——— Leave Actions —————————————————————————————————————————————
  const handleLeaveAction = async (leaveId: string, status: 'approved' | 'rejected') => {
    try {
      const res = await fetch(`${API_BASE}/leaves/${leaveId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) { showToast(`Leave application successfully ${status}.`); loadLeaves(); }
      else showToast(data.message || 'Failed to update leave.', 'error');
    } catch (err: any) {
      showToast(err.message || 'Failed to update leave.', 'error');
    }
  };

  const sendLeaveChatMessage = async (leaveId: string) => {
    if (!leaveChatText.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/leaves/${leaveId}/message`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: 'admin', senderName: user.name, text: leaveChatText.trim() }),
      });
      const data = await res.json();
      if (data.success) { setLeaveChatText(''); setActiveLeaveChat(data.data); loadLeaves(); }
    } catch (err) {
      console.error('Failed to send leave chat message:', err);
    }
  };

  // ─── Feedback Actions ─────────────────────────────────────────────────────────
  const sendFeedbackChatMessage = async (feedbackId: string) => {
    if (!feedbackChatText.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/feedbacks/${feedbackId}/reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: 'admin', text: feedbackChatText.trim() }),
      });
      const data = await res.json();
      if (data.success) { setFeedbackChatText(''); setActiveFeedbackChat(data.data); loadFeedbacks(); }
    } catch (err) {
      console.error('Failed to send feedback reply:', err);
    }
  };

  // ─── Event Actions ────────────────────────────────────────────────────────────
  // Uploads go straight from this browser to S3 via a presigned URL — the file
  // bytes never pass through our server at all. This replaces sending the
  // whole file as base64 JSON to Node, which: capped uploads at nginx's
  // client_max_body_size (60m — ~45MB of real file once base64's ~33%
  // inflation is accounted for); forced the entire file through Node's single
  // request-handling thread twice (parsed into the JSON body, then decoded
  // into a Buffer), freezing every other user's request meanwhile; and spent
  // memory the server (1.9GB, no swap) can't spare. The only request that
  // still hits our server is a small "give me a URL for this filename" call.
  interface EventMediaUploadResult { previewUrl: string; s3Key: string; filename: string; contentType: string; size: number; mediaType: string; }

  const presignEventMedia = async (fileName: string): Promise<{ uploadUrl: string; previewUrl: string; s3Key: string; mediaType: string }> => {
    const token = getAccessToken();
    const headers: HeadersInit = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    const res = await fetch(`${API_BASE}/events/media/presign`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ fileName })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || `Failed to prepare upload for ${fileName}`);
    return data;
  };

  // fetch exposes no upload progress events, so the actual S3 PUT uses XHR.
  const putFileToS3WithProgress = (file: File, uploadUrl: string, onProgress: (loaded: number, total: number) => void): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      // Not part of the presigned signature (see s3.service.ts's
      // getPresignedUploadUrl) — safe to set freely; S3 stores whatever
      // Content-Type actually arrives on the PUT.
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (evt) => { if (evt.lengthComputable) onProgress(evt.loaded, evt.total); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) { onProgress(file.size, file.size); resolve(); }
        else reject(new Error(`Failed to upload ${file.name} to storage.`));
      };
      xhr.onerror = () => reject(new Error(`Failed to upload ${file.name} to storage.`));
      xhr.send(file);
    });
  };

  const uploadEventMediaWithProgress = async (
    file: File,
    onProgress: (loadedBytes: number, totalBytes: number) => void
  ): Promise<EventMediaUploadResult> => {
    try {
      const { uploadUrl, previewUrl, s3Key, mediaType } = await presignEventMedia(file.name);
      await putFileToS3WithProgress(file, uploadUrl, onProgress);
      return { previewUrl, s3Key, filename: file.name, contentType: file.type || 'application/octet-stream', size: file.size, mediaType };
    } catch {
      // Fallback: direct upload to server if S3 PUT fails
      return new Promise<EventMediaUploadResult>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const token = getAccessToken();
            const headers: HeadersInit = {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            };
            const res = await fetch(`${API_BASE}/events/media/upload-direct`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ fileName: file.name, fileData: reader.result as string })
            });
            const data = await res.json();
            if (data.success) {
              onProgress(file.size, file.size);
              resolve({
                previewUrl: data.previewUrl,
                s3Key: data.s3Key,
                filename: file.name,
                contentType: data.contentType || file.type || 'application/octet-stream',
                size: file.size,
                mediaType: data.mediaType || 'image'
              });
            } else {
              reject(new Error(data.message || `Failed to upload ${file.name}`));
            }
          } catch (e: any) {
            reject(e);
          }
        };
        reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
        reader.readAsDataURL(file);
      });
    }
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    setUploadingMedia(true);
    setMediaUploadPercent(0);

    // Per-file loaded/total bytes, summed into one overall percentage across
    // the whole batch — simpler and more useful here than N separate bars.
    // File sizes are known upfront now (no base64 round trip needed to learn
    // them), so totals start accurate instead of filling in on first tick.
    const loadedByFile = new Array(files.length).fill(0);
    const totalByFile = files.map((f) => f.size || 1);
    const recomputeOverall = () => {
      const loaded = loadedByFile.reduce((a, b) => a + b, 0);
      const total = totalByFile.reduce((a, b) => a + b, 0);
      setMediaUploadPercent(total > 0 ? Math.round((loaded / total) * 100) : 0);
    };

    const uploadPromises = files.map((file, index) =>
      uploadEventMediaWithProgress(file, (loaded, total) => {
        loadedByFile[index] = loaded;
        totalByFile[index] = total || file.size || 1;
        recomputeOverall();
      })
    );

    try {
      const uploaded = await Promise.all(uploadPromises);
      setNewEvent(prev => ({
        ...prev,
        media: [...prev.media, ...uploaded.map(u => u.previewUrl)],
        mediaAttachments: [...prev.mediaAttachments, ...uploaded.map(u => ({ s3Key: u.s3Key, filename: u.filename, contentType: u.contentType, size: u.size, mediaType: u.mediaType }))]
      }));
      showToast(`${uploaded.length} file(s) successfully uploaded.`);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Some uploads failed.', 'error');
    } finally {
      setUploadingMedia(false);
      setMediaUploadPercent(null);
      e.target.value = '';
    }
  };

  const handleRemoveMedia = (indexToRemove: number) => {
    setNewEvent(prev => ({
      ...prev,
      media: prev.media.filter((_, idx) => idx !== indexToRemove),
      mediaAttachments: prev.mediaAttachments.filter((_, idx) => idx !== indexToRemove)
    }));
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.title || !newEvent.date) { showToast('Title and date are required.', 'error'); return; }

    setUploadingMedia(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const res = await fetch(`${API_BASE}/events`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: newEvent.title,
          description: newEvent.description,
          date: newEvent.date,
          media: newEvent.media,
          mediaAttachments: newEvent.mediaAttachments,
          type: newEvent.type || 'notice',
          sendAlertsTo: newEvent.sendAlertsTo,
          classes: newEvent.classes,
          sections: newEvent.sections,
          scheduledAlertTime: newEvent.scheduledAlertTime || undefined
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(newEvent.scheduledAlertTime ? 'Event posted and alert scheduled successfully.' : 'Event announcement published successfully.');
        setNewEvent({
          title: '',
          description: '',
          date: '',
          media: [],
          mediaAttachments: [],
          sendAlertsTo: 'none',
          classes: [],
          sections: [],
          scheduledAlertTime: '',
          type: 'notice'
        });
        setUploadedUrl('');
        onDataReload();
      } else {
        showToast(data.message || 'Failed to create event.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to create event.', 'error');
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      const token = getAccessToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/events/${id}`, {
        method: 'DELETE',
        headers
      });
      const data = await res.json();
      if (data.success) {
        showToast('Event/Notice deleted successfully.');
        onDataReload();
      } else {
        showToast(data.message || 'Failed to delete event.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to delete event.', 'error');
    }
  };

  // ─── Delete Actions ──────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget || !adminPassword) return;
    setDeleting(true);
    const { type, data, bulkIds } = deleteTarget;
    const targetIds = bulkIds && bulkIds.length > 0 ? bulkIds : [data._id || data.id];
    const noun = type === 'student' ? 'Student' : 'Teacher';

    let successCount = 0;
    let lastErrorMessage = '';
    for (const targetId of targetIds) {
      try {
        const res = await fetch(`${API_BASE}/${type === 'student' ? 'students' : 'teachers'}/${targetId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: adminPassword })
        });
        const resData = await res.json();
        if (resData.success) successCount++;
        else lastErrorMessage = resData.message || 'Verification failed.';
      } catch {
        lastErrorMessage = 'Network error.';
      }
    }

    const failCount = targetIds.length - successCount;
    if (successCount > 0) {
      const summary = targetIds.length > 1
        ? `${successCount} of ${targetIds.length} ${noun.toLowerCase()}s deleted.${failCount > 0 ? ` ${failCount} failed — ${lastErrorMessage}` : ''}`
        : `${noun} deleted successfully.`;
      showToast(summary, failCount > 0 ? 'error' : 'success');
      setDeleteTarget(null);
      setAdminPassword('');
      onDataReload();
    } else {
      showToast(lastErrorMessage || 'Incorrect password.', 'error');
    }
    setDeleting(false);
  };

  // ─── Promote Students (bulk, next-class rollover) ─────────────────────────────
  const confirmPromote = async () => {
    if (promoteTarget.length === 0 || !promoteToClass || !promoteToSection) return;
    setPromoting(true);
    try {
      const res = await fetch(`${API_BASE}/students/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: promoteTarget, toClass: promoteToClass, toSection: promoteToSection }),
      });
      const data = await res.json();
      if (data.success) {
        setPromoteResult(data.data);
        onDataReload();
      } else {
        showToast(data.message || 'Failed to promote students.', 'error');
      }
    } catch {
      showToast('Failed to promote students.', 'error');
    } finally {
      setPromoting(false);
    }
  };

  // ─── Message Parent (opens the admin's own WhatsApp) ─────────────────────────
  // The in-app "Message Parent via WhatsApp" popup sent free-form text through
  // POST /messages/student/:id/whatsapp (sendWhatsAppWithAttachments) — no
  // approved Meta template backs that route, so Meta silently drops the
  // message outside a 24h reply window (see event.routes.ts/whatsappTemplates.ts
  // for the same failure mode elsewhere). Rather than build a template for a
  // free-typed one-off note, this opens a wa.me chat with the parent's number
  // instead: the admin sends it from their own WhatsApp app (desktop, if
  // installed and registered as the link handler — wa.me itself prompts to
  // install otherwise, or falls back to WhatsApp Web), which isn't subject to
  // the Business API's template restriction at all.
  const openWhatsAppChat = (whatsappNo?: string, label = 'this contact') => {
    if (!whatsappNo) { showToast(`No WhatsApp number on file for ${label}.`, 'error'); return; }
    const digits = whatsappNo.replace(/\D/g, '');
    window.open(`https://wa.me/${digits}`, '_blank', 'noopener,noreferrer');
  };

  // ─── Navigate helpers ─────────────────────────────────────────────────────────
  const handleNavigate = (view: string) => {
    setActiveView(view as AdminView);
    setSearchQuery('');
  };

  const handleViewTeacherStudents = (teacherName: string) => {
    setSearchQuery(teacherName);
    setActiveView('students');
    showToast(`Filter Student list by Teacher: ${teacherName}`);
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  // ─── Navigation (each entry gated by the same permission as the redirect effect) ──
  const navItems = ([
    { key: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard, group: 'Overview', permission: 'dashboard:view' },
    { key: 'fee-analytics', label: 'Fee Analytics', shortLabel: 'Fees', icon: BarChart2, group: 'Finance', permission: 'fees:view' },
    { key: 'reminders', label: 'Reminders', icon: BellRing, group: 'Finance', permission: 'fees:view' },
    { key: 'expenditures', label: 'Expenditures', icon: Wallet, group: 'Finance', permission: 'expenditure:view' },
    { key: 'students', label: 'Students', icon: GraduationCap, group: 'People', permission: 'students:read' },
    { key: 'teachers', label: 'Teachers', icon: Users, group: 'People', permission: 'teachers:read' },
    { key: 'leaves', label: 'Leaves', icon: CalendarX2, group: 'People', permission: 'reports:view' },
    { key: 'attendance', label: 'Class Attendance', shortLabel: 'Attendance', icon: CalendarCheck, group: 'Academics', permission: 'attendance:mark' },
    { key: 'marks', label: 'Exams & Marks', shortLabel: 'Exams', icon: BookOpen, group: 'Academics', permission: 'reports:view' },
    { key: 'homework', label: 'Homework', icon: ClipboardList, group: 'Academics', permission: 'homework:read' },
    { key: 'messages', label: 'Direct Messages', shortLabel: 'Messages', icon: MessageSquare, group: 'Communication', permission: 'messages:read', badge: unreadMessagesCount },
    { key: 'events', label: 'Notice & Events', shortLabel: 'Notices', icon: Megaphone, group: 'Communication', permission: 'events:manage' },
    { key: 'feedbacks', label: 'Parent Feedbacks', shortLabel: 'Feedback', icon: MessagesSquare, group: 'Communication', permission: 'feedback:read' },
  ] as (ShellNavItem & { permission: string })[]).filter((item) => hasPermission(item.permission));

  const tabOrder = ['dashboard', 'students', 'fee-analytics', 'attendance', 'messages', 'teachers', 'marks'];
  const tabs = tabOrder.filter((k) => navItems.some((i) => i.key === k)).slice(0, 4);
  const homeKey = navItems[0]?.key || 'profile';
  const searchViews = ['dashboard', 'fee-analytics', 'teachers', 'students'];

  const viewTitles: Record<AdminView, string> = {
    'dashboard': 'Dashboard', 'fee-analytics': 'Fee Analytics', 'collect-fee': 'Collect Fee',
    'expenditures': 'Expenditures', 'teachers': 'Teachers', 'students': 'Students', 'leaves': 'Leave Requests',
    'feedbacks': 'Parent Feedbacks', 'events': 'Notice & Events', 'attendance': 'Class Attendance',
    'marks': 'Exams & Marks', 'homework': 'Homework', 'settings': 'Settings', 'messages': 'Direct Messages',
    'reminders': 'Fee Reminders', 'profile': 'My Profile',
  };

  const searchField = (
    <div className="relative w-full max-w-[340px]">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" aria-hidden="true" />
      <input
        type="search"
        placeholder="Search students, classes, sections…"
        aria-label="Search students, classes and sections"
        className="w-full h-control-sm max-md:h-control pl-9 pr-3 rounded-full border border-line bg-surface-2 text-sm text-ink placeholder:text-faint outline-none focus:bg-surface focus:border-blue-400"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
    </div>
  );

  const roleLabel = user?.role === 'superadmin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : (user?.role === 'other' ? 'Staff' : 'Admin');

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <Toast toast={toast} />

      <AppShell
        role={user?.role === 'other' ? 'other' : 'admin'}
        schoolName={schoolProfile?.schoolInfo?.schoolName || 'SchoolHub'}
        schoolLogo={schoolProfile?.schoolInfo?.logo}
        userName={user?.name || 'Admin'}
        userRoleLabel={roleLabel}
        userAvatar={user?.avatar || undefined}
        items={navItems}
        tabs={tabs}
        activeKey={activeView}
        homeKey={homeKey}
        onNavigate={handleNavigate}
        title={viewTitles[activeView]}
        onProfile={() => setActiveView('profile')}
        onSettings={hasPermission('settings:manage') ? () => setActiveView('settings') : undefined}
        onLogout={onLogout}
        topBarCenter={searchViews.includes(activeView) ? searchField : undefined}
        fullHeight={activeView === 'messages'}
        topBarActions={
          <>
            <ActionButton
              type="button"
              onClick={handleResetQuotaFromHeader}
              className="hidden lg:inline-flex items-center gap-2 h-9 px-3 rounded-full border border-line bg-surface-2 text-xs font-semibold text-ink-2 hover:bg-surface-3 tabular"
              title="Update the WhatsApp message limit"
              aria-label={`WhatsApp messages sent: ${whatsappSentCount} of ${whatsappLimit}. Update limit`}
            >
              <MessageCircle size={15} className="text-[#25D366]" aria-hidden="true" />
              <span className={whatsappSentCount >= whatsappLimit ? 'text-danger' : 'text-success'}>{whatsappSentCount}</span>
              <span className="text-faint">/ {whatsappLimit}</span>
            </ActionButton>
            <button
              type="button"
              className="shell-icon-btn"
              onClick={() => showToast('Notice: Standard Schedule active')}
              aria-label="Notifications"
              title="Notifications"
            >
              <Bell size={18} />
            </button>
          </>
        }
      >
        {searchViews.includes(activeView) && <div className="md:hidden">{searchField}</div>}
        <ErrorBoundary key={activeView}>
          <Suspense fallback={<SkeletonPage />}>
              {activeView === 'reminders' && hasPermission('fees:view') && (
                <AdminReminders
                  students={students}
                  teachers={teachers}
                  classesList={classesList}
                  showToast={showToast}
                  onCollectFee={(studentId) => {
                    setCollectFeeStudentId(studentId);
                    setCollectFeeBackView('reminders');
                    setActiveView('collect-fee');
                  }}
                />
              )}
              {activeView === 'dashboard' && hasPermission('dashboard:view') && (
                <AdminDashboard
                  user={user}
                  todayAttendance={todayAttendance}
                  academicSnapshot={academicSnapshot}
                  todayAttendanceStatus={loadStatus.attendance}
                  academicSnapshotStatus={loadStatus.snapshot}
                  onRetryTodayAttendance={loadTodayAttendance}
                  onRetryAcademicSnapshot={loadAcademicSnapshot}
                  totalStudents={totalStudents}
                  totalTeachers={totalTeachers}
                  teachers={teachers}
                  paidFeesTotal={paidFeesTotal}
                  pendingFeesTotal={pendingFeesTotal}
                  filteredStudents={filteredStudents}
                  classesList={classesList}
                  leavesList={leavesList}
                  feedbacksList={feedbacksList}
                  events={events}
                  onNavigate={(v) => setActiveView(v as AdminView)}
                  onAdmitStudent={() => setActiveView('students')}
                  onSendReminder={(student) => handleSendReminder(student.id || student._id, 'all')}
                  onDeleteStudent={(student) => setDeleteTarget({ type: 'student', data: student })}
                  onMessageParent={(student) => openWhatsAppChat(student.whatsappNo, student.name)}
                  showToast={showToast}
                  onCollectFee={(studentId) => {
                    setCollectFeeStudentId(studentId);
                    setCollectFeeBackView('dashboard');
                    setActiveView('collect-fee');
                  }}
                />
              )}

              {activeView === 'fee-analytics' && hasPermission('fees:view') && (
                <AdminFeeAnalytics
                  totalStudents={totalStudents}
                  totalTeachers={totalTeachers}
                  paidFeesTotal={paidFeesTotal}
                  pendingFeesTotal={pendingFeesTotal}
                  filteredStudents={filteredStudents}
                  students={students}
                  classesList={classesList}
                  onSendReminder={(student) => handleSendReminder(student.id || student._id, 'all')}
                  onDeleteStudent={(student) => setDeleteTarget({ type: 'student', data: student })}
                  onMessageParent={(student) => openWhatsAppChat(student.whatsappNo, student.name)}
                  showToast={showToast}
                  onCollectFee={(studentId) => {
                    setCollectFeeStudentId(studentId);
                    setCollectFeeBackView('fee-analytics');
                    setActiveView('collect-fee');
                  }}
                />
              )}

              {activeView === 'collect-fee' && hasPermission('fees:view') && (
                <AdminCollectFee
                  students={students}
                  initialStudentId={collectFeeStudentId}
                  onBack={() => {
                    setCollectFeeStudentId(undefined);
                    setActiveView(collectFeeBackView);
                  }}
                  onRecordPayment={async (studentId, amount, feeType) => {
                    return await handleRecordPayment(studentId, amount, feeType);
                  }}
                  showToast={showToast}
                  onGoToFeeAnalytics={() => {
                    setCollectFeeStudentId(undefined);
                    setActiveView('fee-analytics');
                  }}
                  generateReceiptPDF={generateReceiptPDF}
                />
              )}

              {activeView === 'expenditures' && hasPermission('expenditure:view') && (
                <AdminExpenditures
                  showToast={showToast}
                  user={user}
                />
              )}

              {activeView === 'teachers' && hasPermission('teachers:read') && (
                <AdminTeachers
                  teachers={filteredTeachers}
                  students={students}
                  classesList={classesList}
                  onClassesUpdate={loadClasses}
                  newTeacher={newTeacher}
                  onNewTeacherChange={(field, val) => setNewTeacher(prev => ({ ...prev, [field]: val }))}
                  onCreateTeacher={handleCreateTeacher}
                  onTeacherCreated={() => {
                    setNewTeacher({
                      employeeId: '',
                      name: '',
                      gender: 'male',
                      dob: '',
                      phone: '',
                      email: '',
                      address: '',
                      assignedClass: '',
                      subjects: [],
                      teachingClasses: [],
                      classTeacherOf: '',
                      cluster: '',
                      salary: 0
                    });
                    setEditingTeacherId(null);
                    onDataReload();
                    fetchNextEmployeeId();
                  }}
                  onViewStudents={handleViewTeacherStudents}
                  onDeleteTeacher={(teacher) => setDeleteTarget({ type: 'teacher', data: teacher })}
                  onDeleteTeachers={(teacherIds) => setDeleteTarget({ type: 'teacher', bulkIds: teacherIds })}
                  editingTeacherId={editingTeacherId}
                  onEditTeacher={handleEditTeacher}
                  onCancelEditTeacher={handleCancelEditTeacher}
                  onMessageTeacher={(teacher) => openWhatsAppChat(teacher.phone, teacher.name)}
                  showToast={showToast}
                />
              )}

              {activeView === 'students' && hasPermission('students:read') && (
                <AdminStudents
                  students={filteredStudents}
                  teachers={teachers}
                  classesList={classesList}
                  newStudent={newStudent}
                  onNewStudentChange={(updates) => setNewStudent(prev => ({ ...prev, ...updates }))}
                  onCreateStudent={handleCreateStudent}
                  onDeleteStudent={(student) => setDeleteTarget({ type: 'student', data: student })}
                  onDeleteStudents={(studentIds) => setDeleteTarget({ type: 'student', bulkIds: studentIds })}
                  onPromoteStudents={(studentIds) => setPromoteTarget(studentIds)}
                  onMessageParent={(student) => openWhatsAppChat(student.whatsappNo, student.name)}
                  showToast={showToast}
                  editingStudentId={editingStudentId}
                  onEditStudent={handleEditStudent}
                  onCancelEditStudent={handleCancelEditStudent}
                  onFetchNextAdmissionNo={fetchNextAdmissionNo}
                />
              )}

              {activeView === 'attendance' && hasPermission('attendance:mark') && (
                <AdminAttendance
                  students={students}
                  teachers={teachers}
                  classesList={classesList}
                  showToast={showToast}
                />
              )}

              {activeView === 'marks' && hasPermission('reports:view') && (
                <AdminMarks
                  students={students}
                  teachers={teachers}
                  classesList={classesList}
                  showToast={showToast}
                />
              )}

              {activeView === 'homework' && hasPermission('homework:read') && (
                <HomeworkBoard
                  mode="admin"
                  classesList={classesList}
                  showToast={showToast}
                />
              )}

              {activeView === 'leaves' && hasPermission('reports:view') && (
                <AdminLeaves
                  leavesList={leavesList}
                  status={loadStatus.leaves}
                  onRetry={loadLeaves}
                  activeLeaveChat={activeLeaveChat}
                  leaveChatText={leaveChatText}
                  onLeaveAction={handleLeaveAction}
                  onOpenChat={(leave) => { setActiveLeaveChat(leave); setLeaveChatText(''); }}
                  onCloseChat={() => setActiveLeaveChat(null)}
                  onChatTextChange={setLeaveChatText}
                  onSendChatMessage={sendLeaveChatMessage}
                />
              )}

              {activeView === 'feedbacks' && hasPermission('feedback:read') && (
                <AdminFeedbacks
                  feedbacksList={feedbacksList}
                  status={loadStatus.feedbacks}
                  onRetry={loadFeedbacks}
                  activeFeedbackChat={activeFeedbackChat}
                  feedbackChatText={feedbackChatText}
                  onOpenChat={(f) => { setActiveFeedbackChat(f); setFeedbackChatText(''); }}
                  onCloseChat={() => setActiveFeedbackChat(null)}
                  onChatTextChange={setFeedbackChatText}
                  onSendChatMessage={sendFeedbackChatMessage}
                />
              )}

              {activeView === 'messages' && hasPermission('messages:read') && (
                <div className="flex-1 flex flex-col min-h-0">
                  <AdminMessages
                    students={students}
                    teachers={teachers}
                  />
                </div>
              )}

              {activeView === 'settings' && hasPermission('settings:manage') && (
                <AdminSettings
                  showToast={showToast}
                  students={students}
                />
              )}

              {activeView === 'profile' && (
                <>
                  <AdminProfile
                    showToast={showToast}
                  />
                  <AppUpdates className="max-w-2xl mt-5" />
                </>
              )}

              {activeView === 'events' && hasPermission('events:manage') && (
                <AdminEvents
                  events={events}
                  newEvent={newEvent}
                  uploadingMedia={uploadingMedia}
                  mediaUploadPercent={mediaUploadPercent}
                  uploadedUrl={uploadedUrl}
                  onNewEventChange={(fields) => setNewEvent(prev => ({ ...prev, ...fields }))}
                  onCreateEvent={handleCreateEvent}
                  onMediaUpload={handleMediaUpload}
                  onRemoveMedia={handleRemoveMedia}
                  onDeleteEvent={handleDeleteEvent}
                  classesList={classesList}
                  showToast={showToast}
                />
              )}
          </Suspense>
        </ErrorBoundary>
      </AppShell>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => { setDeleteTarget(null); setAdminPassword(''); }}>
          <div className="modal-content" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <h4 className="modal-title" style={{ color: '#dc2626' }}>⚠️ Confirm Deletion</h4>
            <p className="modal-desc" style={{ marginBottom: '16px' }}>
              {deleteTarget.bulkIds && deleteTarget.bulkIds.length > 0 ? (
                <>You are about to delete <strong>{deleteTarget.bulkIds.length}</strong> {deleteTarget.type}{deleteTarget.bulkIds.length > 1 ? 's' : ''}.</>
              ) : (
                <>You are about to delete the {deleteTarget.type} <strong>{deleteTarget.data?.name}</strong>.</>
              )}
              {' '}This action is permanent and cannot be undone.
            </p>
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label className="form-label">Enter Admin Password to confirm</label>
              <input
                type="password"
                aria-label="Admin password"
                className="form-input"
                placeholder="Enter password..."
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmDelete(); }}
                autoFocus
                autoComplete="new-password"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  WebkitTextSecurity: 'disc',
                } as React.CSSProperties}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                className="action-btn"
                style={{ backgroundColor: '#dc2626', flex: 1 }}
                onClick={confirmDelete}
                disabled={deleting || !adminPassword}
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
              <button
                className="action-btn secondary"
                style={{ flex: 1 }}
                onClick={() => { setDeleteTarget(null); setAdminPassword(''); }}
                disabled={deleting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Promote Students Confirmation / Result Modal */}
      {promoteTarget.length > 0 && (
        <div className="modal-overlay" onClick={() => { if (!promoting) { setPromoteTarget([]); setPromoteResult(null); } }}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            {!promoteResult ? (
              <>
                <h4 className="modal-title">🎓 Promote to Next Class</h4>
                <p className="modal-desc" style={{ marginBottom: '12px' }}>
                  Promoting <strong>{promoteTarget.length}</strong> student{promoteTarget.length > 1 ? 's' : ''} currently in{' '}
                  <strong>{promoteFromClasses.map((c, i) => (i === 0 ? c : `, ${c}`)).join('')}{promoteFromSections.length > 0 ? ` - ${promoteFromSections.join('/')}` : ''}</strong>.
                  Admission number, fee history, documents, and contact details all stay unchanged — only class, section, roll number
                  (cleared for reassignment), and academic year are updated.
                </p>
                {promoteFromClasses.length > 1 && (
                  <p style={{ fontSize: '12px', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 10px', marginBottom: '12px' }}>
                    ⚠️ Selected students span {promoteFromClasses.length} different classes — all of them will be moved to the single
                    destination you choose below. Double-check that's intended, or cancel and promote one class at a time.
                  </p>
                )}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '4px' }}>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="form-label">Promote to Class</label>
                    <select
                      className="form-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      value={promoteToClass}
                      onChange={(e) => { setPromoteToClass(e.target.value); setPromoteToSection(''); }}
                    >
                      <option value="">Select class…</option>
                      {sortClasses(Array.from(new Set(getSelectableClasses(classesList).map((c: ClassData) => c.className)))).map((cls) => (
                        <option key={cls} value={cls}>{isNaN(Number(cls)) ? cls : `Class ${cls}`}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="form-label">Section</label>
                    <select
                      className="form-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      value={promoteToSection}
                      onChange={(e) => setPromoteToSection(e.target.value)}
                      disabled={!promoteToClass}
                    >
                      <option value="">Select section…</option>
                      {Array.from(new Set(
                        getSelectableClasses(classesList).filter((c: ClassData) => c.className === promoteToClass).map((c: ClassData) => c.section)
                      )).map((sec) => (
                        <option key={sec} value={sec}>{sec === '-' ? 'No Section' : `Section ${sec}`}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                  <Button onClick={confirmPromote} disabled={promoting || !promoteToClass || !promoteToSection} style={{ flex: 1 }}>
                    {promoting ? 'Promoting...' : 'Confirm Promotion'}
                  </Button>
                  <Button variant="secondary" onClick={() => setPromoteTarget([])} disabled={promoting} style={{ flex: 1 }}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h4 className="modal-title" style={{ color: '#16a34a' }}>✅ Promotion Complete</h4>
                <p className="modal-desc" style={{ marginBottom: '12px' }}>
                  {promoteResult.promoted.length} student{promoteResult.promoted.length !== 1 ? 's' : ''} promoted to{' '}
                  {promoteToClass} - {promoteToSection}.
                </p>
                {promoteResult.promoted.some((p: any) => !p.teacherReassigned) && (
                  <p className="modal-desc" style={{ fontSize: '12px', color: '#92400e', marginBottom: '16px' }}>
                    Note: some promoted students' class-teacher assignment couldn't be auto-updated because no teacher is set as
                    class-teacher for {promoteToClass} - {promoteToSection} — reassign those manually if needed.
                  </p>
                )}
                <Button onClick={() => { setPromoteTarget([]); setPromoteResult(null); }} style={{ width: '100%' }}>
                  Done
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* â”€â”€â”€ UNIFIED FEE COLLECTION MODAL (multi-step) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {(feeModalStep === 'search' || feeModalStep === 'payment' || feeModalStep === 'success') && (() => {
        const closeAll = () => {
          setFeeModalStep(null);
          setSelectedStudentForPayment(null);
          setSearchName('');
          setSearchClass('all');
          setPaymentAmount('');
          setShowPaymentSuccessModal(null);
        };

        const stepNum = feeModalStep === 'search' ? 1 : feeModalStep === 'payment' ? 2 : 3;

        const StepIndicator = () => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: '24px' }}>
            {(['Find Student', 'Payment Details', 'Receipt'].map((label, i) => {
              const n = i + 1;
              const done = stepNum > n;
              const active = stepNum === n;
              return (
                <React.Fragment key={label}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      backgroundColor: done ? '#10b981' : active ? '#6366f1' : '#e2e8f0',
                      color: done || active ? '#fff' : '#94a3b8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '13px', fontWeight: 800,
                      boxShadow: active ? '0 0 0 4px rgba(99,102,241,0.18)' : 'none',
                      transition: 'all 0.25s'
                    }}>
                      {done ? '✓' : n}
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: active ? '#6366f1' : done ? '#10b981' : '#94a3b8', marginTop: '4px', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                  </div>
                  {i < 2 && (
                    <div style={{ flex: 2, height: '2px', backgroundColor: done ? '#10b981' : '#e2e8f0', transition: 'background 0.3s', marginTop: '-12px', minWidth: '24px' }} />
                  )}
                </React.Fragment>
              );
            }))}
          </div>
        );

        return (
          <div
            className="modal-overlay"
            onClick={feeModalStep !== 'success' ? closeAll : undefined}
            style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', backgroundColor: 'rgba(15,23,42,0.6)' }}
          >
            <div
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: feeModalStep === 'search' ? '640px' : '440px',
                width: '100%',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderRadius: '16px',
                padding: '28px',
                boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
                transition: 'max-width 0.3s ease'
              }}
            >
              {/* ── Header ── */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '10px',
                      background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px'
                    }}>💳</div>
                    <h4 style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                      {feeModalStep === 'search' ? 'Collect Fee' : feeModalStep === 'payment' ? 'Confirm Payment' : 'Payment Successful'}
                    </h4>
                  </div>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0 46px' }}>
                    {feeModalStep === 'search' ? 'Search for a student by name or class to collect fees.' : feeModalStep === 'payment' ? `Collecting for ${selectedStudentForPayment?.name}` : 'Transaction complete — receipt ready.'}
                  </p>
                </div>
                {feeModalStep !== 'success' && (
                  <button
                    onClick={closeAll}
                    style={{
                      width: '30px', height: '30px', borderRadius: '8px', border: 'none',
                      backgroundColor: '#f1f5f9', color: '#64748b', cursor: 'pointer',
                      fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, marginLeft: '12px', fontWeight: 700, lineHeight: 1
                    }}
                    title="Close"
                  >×</button>
                )}
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', margin: '16px 0' }} />

              {/* --- Step Indicator --- */}
              <StepIndicator />

              {/* --------------------------------------------------------------------------------------------------
                  STEP 1: SEARCH
              -------------------------------------------------------------------------------------------------- */}
              {feeModalStep === 'search' && (() => {
                const query = searchName.trim().toLowerCase();
                const filtered = students.filter(s => {
                  if (query && !s.name.toLowerCase().includes(query)) return false;
                  if (searchClass !== 'all' && s.class !== searchClass) return false;
                  return true;
                });

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', gap: '14px' }}>
                    {/* Search Inputs */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'end' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '6px', letterSpacing: '0.05em' }}>
                          Student Name
                        </label>
                        <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Type student name to search..."
                            value={searchName}
                            onChange={(e) => setSearchName(e.target.value)}
                            style={{ width: '100%', boxSizing: 'border-box', height: '40px', paddingLeft: '36px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13px' }}
                            autoFocus
                          />
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '6px', letterSpacing: '0.05em' }}>
                          Class
                        </label>
                        <select
                          className="form-input"
                          value={searchClass}
                          onChange={(e) => setSearchClass(e.target.value)}
                          style={{ height: '40px', minWidth: '130px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13px', cursor: 'pointer' }}
                        >
                          <option value="all">All Classes</option>
                          {Array.from(new Set(students.map(s => s.class)))
                            .sort((a, b) => {
                              const na = parseInt(a, 10), nb = parseInt(b, 10);
                              return !isNaN(na) && !isNaN(nb) ? na - nb : String(a).localeCompare(String(b));
                            })
                            .map(cls => <option key={cls} value={cls}>Class {cls}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Results */}
                    <div style={{
                      flex: 1, overflowY: 'auto', minHeight: '220px', maxHeight: '420px',
                      borderRadius: '12px', border: '1.5px solid #e2e8f0', backgroundColor: '#f8fafc'
                    }}>
                      {/* Column Headers */}
                      <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 80px',
                        padding: '8px 14px', backgroundColor: '#f1f5f9',
                        borderBottom: '1px solid #e2e8f0', borderRadius: '10px 10px 0 0',
                        position: 'sticky', top: 0
                      }}>
                        {['Student', 'Tuition', 'Books', 'Transport', ''].map(h => (
                          <span key={h} style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                        ))}
                      </div>

                      {filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 16px', color: '#94a3b8', fontSize: '13px' }}>
                          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
                          No students found. Try a different name or class.
                        </div>
                      ) : filtered.map((student, idx) => {
                        const sId = student.id || student._id || '';
                        const initials = student.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
                        const tuition = student.feePending || 0;
                        const books = student.booksFee || 0;
                        const transport = student.transportFee || 0;
                        const totalPending = tuition + books + transport;
                        const colorRing = ['#dbeafe', '#fce7f3', '#d1fae5', '#fef3c7', '#ede9fe', '#fee2e2'];
                        const textRing = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#dc2626'];
                        const ci = idx % 6;

                        return (
                          <div
                            key={sId}
                            style={{
                              display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 80px',
                              padding: '10px 14px', alignItems: 'center',
                              borderBottom: '1px solid #f1f5f9', backgroundColor: '#fff',
                              transition: 'background 0.15s',
                              cursor: totalPending > 0 ? 'default' : 'default'
                            }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}
                          >
                            {/* Student Info */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                              <div style={{
                                width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                                backgroundColor: colorRing[ci], color: textRing[ci],
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '12px', fontWeight: 800
                              }}>{initials}</div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{student.name}</div>
                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>Class {student.class}-{student.section}</div>
                              </div>
                            </div>
                            {/* Due Amounts */}
                            {[
                              { val: tuition, color: '#ef4444' },
                              { val: books, color: '#0284c7' },
                              { val: transport, color: '#d97706' }
                            ].map(({ val, color }, di) => (
                              <div key={di} style={{ fontWeight: 700, fontSize: '12px', color: val > 0 ? color : '#10b981' }}>
                                {val > 0 ? `₹${val.toLocaleString()}` : '✓ Paid'}
                              </div>
                            ))}
                            {/* Collect Button */}
                            <div>
                              <button
                                type="button"
                                disabled={totalPending <= 0}
                                onClick={() => {
                                  setSelectedStudentForPayment(student);
                                  setPaymentAmount('');
                                  setPaymentType(tuition > 0 ? 'school' : books > 0 ? 'books' : 'transport');
                                  setFeeModalStep('payment');
                                }}
                                style={{
                                  padding: '5px 12px', borderRadius: '8px', border: 'none',
                                  backgroundColor: totalPending > 0 ? '#6366f1' : '#e2e8f0',
                                  color: totalPending > 0 ? '#fff' : '#94a3b8',
                                  fontSize: '12px', fontWeight: 700,
                                  cursor: totalPending > 0 ? 'pointer' : 'not-allowed',
                                  transition: 'background 0.15s, transform 0.1s',
                                  whiteSpace: 'nowrap'
                                }}
                                onMouseEnter={e => { if (totalPending > 0) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#4f46e5'; }}
                                onMouseLeave={e => { if (totalPending > 0) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#6366f1'; }}
                              >
                                Collect
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {filtered.length} student{filtered.length !== 1 ? 's' : ''} found
                      </span>
                      <button onClick={closeAll} style={{ padding: '8px 18px', borderRadius: '8px', border: '1.5px solid #e2e8f0', backgroundColor: '#fff', color: '#64748b', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* --------------------------------------------------------------------------------------------------
                  STEP 2: PAYMENT DETAILS
              -------------------------------------------------------------------------------------------------- */}
              {feeModalStep === 'payment' && selectedStudentForPayment && (() => {
                const s = selectedStudentForPayment;
                const tuition = s.feePending || 0;
                const books = s.booksFee || 0;
                const transport = s.transportFee || 0;
                const maxAmount = paymentType === 'school' ? tuition : paymentType === 'books' ? books : transport;

                const feeCategories = [
                  { key: 'school' as const, label: 'Tuition Fee', pending: tuition, icon: '🎓', color: '#ef4444', bg: '#fef2f2' },
                  { key: 'books' as const, label: 'Books Fee', pending: books, icon: '📚', color: '#0284c7', bg: '#f0f9ff' },
                  { key: 'transport' as const, label: 'Transport Fee', pending: transport, icon: '🚌', color: '#d97706', bg: '#fffbeb' },
                ];

                return (
                  <Form onSubmit={handleRecordPaymentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* Student Card */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px 14px', borderRadius: '12px',
                      backgroundColor: '#f8fafc', border: '1.5px solid #e2e8f0'
                    }}>
                      <div style={{
                        width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)',
                        color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '15px', fontWeight: 800
                      }}>
                        {s.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>{s.name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          Adm: {s.admissionNo} · Class {s.class}-{s.section}
                        </div>
                      </div>
                      <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Total Pending</div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#ef4444' }}>
                          ₹{(tuition + books + transport).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Category Select — Cards */}
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '8px', letterSpacing: '0.05em' }}>
                        Fee Category
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {feeCategories.map(({ key, label, pending, icon, color, bg }) => (
                          <label
                            key={key}
                            htmlFor={`fee-cat-${key}`}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '12px',
                              padding: '10px 14px', borderRadius: '10px',
                              border: `1.5px solid ${paymentType === key ? color : '#e2e8f0'}`,
                              backgroundColor: paymentType === key ? bg : '#fff',
                              cursor: pending > 0 ? 'pointer' : 'not-allowed',
                              opacity: pending > 0 ? 1 : 0.45,
                              transition: 'all 0.15s'
                            }}
                          >
                            <input
                              id={`fee-cat-${key}`}
                              type="radio"
                              name="feeCategory"
                              value={key}
                              checked={paymentType === key}
                              disabled={pending <= 0}
                              onChange={() => { setPaymentType(key); setPaymentAmount(''); }}
                              style={{ display: 'none' }}
                            />
                            <span style={{ fontSize: '20px' }}>{icon}</span>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', flex: 1 }}>{label}</span>
                            {pending > 0 ? (
                              <span style={{ fontSize: '13px', fontWeight: 800, color }}>₹{pending.toLocaleString()} due</span>
                            ) : (
                              <span style={{ fontSize: '12px', fontWeight: 700, color: '#10b981' }}>✓ Cleared</span>
                            )}
                            {paymentType === key && <span style={{ fontSize: '16px', color, marginLeft: '4px' }}>●</span>}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Amount Input */}
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        Amount to Collect (₹)
                      </label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', fontSize: '15px', fontWeight: 700, color: '#94a3b8' }}>₹</span>
                        <input
                          type="number"
                          required
                          min={1}
                          max={maxAmount}
                          placeholder={`Max ₹${maxAmount.toLocaleString()}`}
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          autoFocus
                          style={{
                            width: '100%', boxSizing: 'border-box', height: '44px',
                            paddingLeft: '30px', paddingRight: '12px',
                            border: '1.5px solid #e2e8f0', borderRadius: '10px',
                            fontSize: '15px', fontWeight: 700, color: '#1e293b',
                            outline: 'none', transition: 'border 0.15s',
                            backgroundColor: '#fff'
                          }}
                          onFocus={e => (e.target.style.borderColor = '#6366f1')}
                          onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                        />
                        {paymentAmount && Number(paymentAmount) === maxAmount && (
                          <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', backgroundColor: '#d1fae5', color: '#059669', padding: '2px 7px', borderRadius: '6px', fontWeight: 700 }}>
                            Full amount
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>Enter amount up to ₹{maxAmount.toLocaleString()}</span>
                        <button
                          type="button"
                          onClick={() => setPaymentAmount(String(maxAmount))}
                          style={{ fontSize: '11px', color: '#6366f1', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          Pay full amount →
                        </button>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                      <button
                        type="button"
                        onClick={() => setFeeModalStep('search')}
                        style={{
                          padding: '10px 18px', borderRadius: '10px',
                          border: '1.5px solid #e2e8f0', backgroundColor: '#fff',
                          color: '#64748b', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                      >
                        ← Back
                      </button>
                      <button
                        type="submit"
                        disabled={!paymentAmount || Number(paymentAmount) <= 0 || Number(paymentAmount) > maxAmount}
                        style={{
                          flex: 1, padding: '11px', borderRadius: '10px', border: 'none',
                          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                          color: '#fff', fontSize: '14px', fontWeight: 800,
                          cursor: (!paymentAmount || Number(paymentAmount) <= 0 || Number(paymentAmount) > maxAmount) ? 'not-allowed' : 'pointer',
                          opacity: (!paymentAmount || Number(paymentAmount) <= 0 || Number(paymentAmount) > maxAmount) ? 0.5 : 1,
                          boxShadow: '0 4px 12px rgba(99,102,241,0.35)', transition: 'opacity 0.15s'
                        }}
                      >
                        Confirm &amp; Send Receipt ✓
                      </button>
                    </div>
                  </Form>
                );
              })()}

              {/* ══════════════════════════════════════════════
                  STEP 3: SUCCESS
              ══════════════════════════════════════════════ */}
              {feeModalStep === 'success' && showPaymentSuccessModal && (() => {
                const { receipt, student } = showPaymentSuccessModal;
                const feeLabel = receipt.feeType === 'school' ? 'Tuition Fee' : receipt.feeType === 'books' ? 'Books Fee' : 'Transport Fee';
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0' }}>
                    {/* Success Animation */}
                    <div style={{
                      width: '72px', height: '72px', borderRadius: '50%', marginBottom: '16px',
                      background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 0 0 8px rgba(16,185,129,0.1)',
                      animation: 'pop 0.4s cubic-bezier(0.175,0.885,0.32,1.275)'
                    }}>
                      <Check style={{ color: '#059669', width: '36px', height: '36px' }} />
                    </div>
                    <style>{`@keyframes pop { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>

                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b', marginBottom: '4px' }}>Payment Recorded!</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
                      WhatsApp receipt sent to parent
                    </div>

                    {/* Receipt Details Card */}
                    <div style={{
                      width: '100%', borderRadius: '12px',
                      border: '1.5px solid #e2e8f0', overflow: 'hidden', marginBottom: '20px', textAlign: 'left'
                    }}>
                      <div style={{ padding: '10px 14px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.07em' }}>Receipt #{receipt.receiptNo}</div>
                      </div>
                      {[
                        { label: 'Student', value: receipt.studentName },
                        { label: 'Class', value: `${student.class}-${student.section}` },
                        { label: 'Fee Category', value: feeLabel },
                        { label: 'Amount Paid', value: `₹${Number(receipt.amount).toLocaleString()}`, bold: true, green: true },
                        { label: 'Date', value: `${receipt.paymentDate} ${receipt.paymentTime}` },
                      ].map(({ label, value, bold, green }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>{label}</span>
                          <span style={{ fontSize: '12px', fontWeight: bold ? 800 : 600, color: green ? '#059669' : '#1e293b' }}>{value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                      <button
                        type="button"
                        onClick={async () => {
                          const pdfBase64 = await generateReceiptPDF(receipt, student);
                          const link = document.createElement('a');
                          link.href = pdfBase64;
                          link.download = `Receipt-${receipt.receiptNo}.pdf`;
                          link.click();
                        }}
                        style={{
                          width: '100%', padding: '11px', borderRadius: '10px', border: 'none',
                          background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                          color: '#fff', fontWeight: 800, fontSize: '13px', cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(124,58,237,0.3)'
                        }}
                      >
                        📄 Download PDF Receipt
                      </button>
                      <a
                        href={`/?verify_token=${receipt.receiptNo || receipt.token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          width: '100%', padding: '10px', borderRadius: '10px',
                          border: '1.5px solid #bae6fd', backgroundColor: '#f0f9ff',
                          color: '#0369a1', fontWeight: 700, fontSize: '13px',
                          textDecoration: 'none', display: 'block',
                          boxSizing: 'border-box', textAlign: 'center'
                        }}
                      >
                        🔗 Verify Receipt Online
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          setFeeModalStep('search');
                          setSelectedStudentForPayment(null);
                          setPaymentAmount('');
                          setShowPaymentSuccessModal(null);
                        }}
                        style={{
                          width: '100%', padding: '10px', borderRadius: '10px',
                          border: '1.5px solid #e2e8f0', backgroundColor: '#fff',
                          color: '#64748b', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                        }}
                      >
                        Collect Another Fee
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFeeModalStep(null);
                          setShowPaymentSuccessModal(null);
                          setActiveView('fee-analytics');
                        }}
                        style={{
                          width: '100%', padding: '10px', borderRadius: '10px',
                          border: 'none', backgroundColor: '#f1f5f9',
                          color: '#64748b', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                        }}
                      >
                        View Fee Analytics →
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}
    </>
  );
};

export default AdminPortal;

