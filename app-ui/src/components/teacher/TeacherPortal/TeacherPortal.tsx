import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import {
  Search, Award, MessageSquare, CalendarCheck, LayoutDashboard,
  BookOpenCheck, CalendarDays, BarChart3, FileSignature, Wallet, Share2, Bell,
  GraduationCap, Users as UsersIcon,
} from 'lucide-react';

import Toast from '../../shared/Toast/Toast';
import ErrorBoundary from '../../shared/ErrorBoundary/ErrorBoundary';
import { Button, Modal, StatTile, SkeletonPage, AppShell, textareaClass, type ShellNavItem } from '../../ui';
import { getLocalToday, cn } from '../../../lib/utils';
import { useSchool } from '../../../context/schoolContext';
import TeacherHome from '../TeacherHome/TeacherHome';

// ── View display labels for mobile app bar title ──────────────────────────
const VIEW_LABELS: Record<string, string> = {
  home: 'Dashboard',
  students: 'Students',
  attendance: 'Attendance',
  marks: 'Marks & Exams',
  analytics: 'Exam Analytics',
  homework: 'Homework Board',
  signature: 'My Signature',
  leaves: 'Leave Applications',
  notices: 'Notices',
  messages: 'Messages',
  fees: 'Fee Management',
  delegations: 'Delegations',
  profile: 'My Profile',
};

const TeacherStudents = lazy(() => import('../TeacherStudents/TeacherStudents'));
const TeacherAttendance = lazy(() => import('../TeacherAttendance/TeacherAttendance'));
const TeacherMarks = lazy(() => import('../TeacherMarks/TeacherMarks'));
const TeacherLeaves = lazy(() => import('../TeacherLeaves/TeacherLeaves'));
const TeacherNotices = lazy(() => import('../TeacherNotices/TeacherNotices'));
const ExamAnalytics = lazy(() => import('../ExamAnalytics/ExamAnalytics'));
const TeacherMessages = lazy(() => import('../TeacherMessages/TeacherMessages'));
const HomeworkBoard = lazy(() => import('../../shared/HomeworkBoard/HomeworkBoard'));
const TeacherFees = lazy(() => import('../TeacherFees/TeacherFees'));
const TeacherDelegations = lazy(() => import('../TeacherDelegations/TeacherDelegations').then(m => ({ default: m.TeacherDelegations })));
const TeacherSignature = lazy(() => import('../TeacherSignature/TeacherSignature'));
const TeacherProfile = lazy(() => import('../TeacherProfile/TeacherProfile'));
const AppUpdates = lazy(() => import('../../shared/AppUpdates/AppUpdates'));

import type {
  UserProfile,
  StudentData,
  TeacherData,
  EventData,
  LeaveData,
  ExamData,
  ExamSubject,
  ToastState,
} from '../../../types';
import { API_BASE, formatClassName } from '../../../constants';
import { useAuth } from '../../../context/authContext';
import { readJson } from '../../../lib/http';
import type { DataStatus } from '../../../hooks/useApiData';

type TeacherView = 'home' | 'students' | 'attendance' | 'marks' | 'analytics' | 'homework' | 'signature' | 'leaves' | 'notices' | 'messages' | 'fees' | 'delegations' | 'profile';

interface TeacherPortalProps {
  user: UserProfile;
  students: StudentData[];
  teachers: TeacherData[];
  events: EventData[];
  onLogout: () => void;
}

const TeacherPortal: React.FC<TeacherPortalProps> = ({ user, students, teachers, events, onLogout }) => {
  const isClassTeacher = user?.role === 'teacher' && !!user.classTeacherOf;
  const [activeView, setActiveView] = useState<TeacherView>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });

  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const { hasPermission } = useAuth();
  const { schoolProfile } = useSchool();


  // Redirect if user has no permission for current activeView or is not a class teacher looking at students list
  useEffect(() => {
    const viewPermissions: Record<TeacherView, string | null> = {
      'home': null,
      'students': 'students:read',
      'attendance': 'attendance:mark',
      'marks': 'marks:entry',
      'analytics': 'results:view',
      'homework': 'homework:read',
      'signature': null,
      'leaves': 'leaves:read',
      'notices': 'dashboard:view',
      'messages': 'dashboard:view',
      'fees': 'fees:view',
      'delegations': 'marks:entry',
      'profile': null
    };

    if (activeView === 'students' && !isClassTeacher) {
      const keys: TeacherView[] = [
        'home', 'attendance', 'marks', 'analytics', 'homework',
        'leaves', 'notices', 'messages', 'fees', 'delegations', 'profile'
      ];
      const fallback = keys.find(k => {
        const p = viewPermissions[k];
        return !p || hasPermission(p);
      });
      if (fallback) {
        setActiveView(fallback);
      }
      return;
    }

    const requiredPerm = viewPermissions[activeView];
    if (requiredPerm && !hasPermission(requiredPerm)) {
      const keys: TeacherView[] = [
        'home', 'students', 'attendance', 'marks', 'analytics', 'homework',
        'leaves', 'notices', 'messages', 'fees', 'delegations', 'profile'
      ].filter(k => k !== 'students' || isClassTeacher) as TeacherView[];
      
      const fallback = keys.find(k => {
        const p = viewPermissions[k];
        return !p || hasPermission(p);
      });
      if (fallback) {
        setActiveView(fallback);
      }
    }
  }, [activeView, hasPermission, isClassTeacher]);

  // ─── Direct Personal Message States ─────────────────────────────────────────
  const [messageTarget, setMessageTarget] = useState<StudentData | null>(null);
  const [personalMessageText, setPersonalMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // ─── Permission Delegation States ───────────────────────────────────────────
  const [delegations, setDelegations] = useState<{ sent: any[]; received: any[] }>({ sent: [], received: [] });
  const [delegationsLoading, setDelegationsLoading] = useState(false);

  const loadDelegations = async () => {
    setDelegationsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/delegations`);
      const data = await res.json();
      if (data.success) {
        setDelegations(data.data);
      }
    } catch (err) {
      console.error('Failed to load delegations:', err);
    } finally {
      setDelegationsLoading(false);
    }
  };

  const handleAddDelegation = async (toTeacherId: string, feature: string, durationHours: number) => {
    try {
      const res = await fetch(`${API_BASE}/delegations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toTeacherId, feature, durationHours })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Permission transferred successfully.');
        loadDelegations();
      } else {
        showToast(data.message || 'Failed to transfer permission.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to transfer permission.', 'error');
    }
  };

  const handleRevokeDelegation = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/delegations/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showToast('Permission transfer revoked successfully.');
        loadDelegations();
      } else {
        showToast(data.message || 'Failed to revoke permission.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to revoke permission.', 'error');
    }
  };

  // Dynamically resolve assigned classes for dropdown
  const getAssignedClassesForView = (): string[] => {
    const baseList = user.assignedClass
      ? user.assignedClass.split(',').map((c) => c.trim()).filter(Boolean)
      : [];
    
    // Add received delegations for current view
    const activeReceived = delegations.received.filter(
      (d) => d.feature === activeView && d.isActive && d.fromTeacher
    );

    activeReceived.forEach(d => {
      const fromTeacher = d.fromTeacher!;
      const classes = fromTeacher.assignedClass
        ? fromTeacher.assignedClass.split(',').map((c) => c.trim()).filter(Boolean)
        : [];
      classes.forEach(c => {
        if (!baseList.includes(c)) {
          baseList.push(c);
        }
      });
    });

    return baseList;
  };

  const assignedClasses = getAssignedClassesForView();
  const [selectedClass, setSelectedClass] = useState<string>(assignedClasses[0] || '');
  const [myStudents, setMyStudents] = useState<StudentData[]>([]);

  const formatRawClass = (raw: string): string => {
    if (!raw) return 'N/A';
    const parts = raw.split('-');
    const className = parts[0] || '';
    const section = parts[1] || '';
    return formatClassName(className, section);
  };

  // Resolve context teacher ID (delegated or direct)
  const getActiveTeacherId = (): string => {
    const isDelegated = !user.assignedClass?.split(',').map(c => c.trim()).includes(selectedClass);
    if (isDelegated) {
      const delRecord = delegations.received.find(
        d => d.feature === activeView && d.isActive && d.fromTeacher?.assignedClass.split(',').map(c => c.trim()).includes(selectedClass)
      );
      if (delRecord && delRecord.fromTeacher) {
        return delRecord.fromTeacher._id;
      }
    }
    return user.teacherId || '';
  };

  const activeTeacherId = getActiveTeacherId();

  // Resolve context teacher name (delegated or direct)
  const getActiveTeacherName = (): string => {
    const isDelegated = !user.assignedClass?.split(',').map(c => c.trim()).includes(selectedClass);
    if (isDelegated) {
      const delRecord = delegations.received.find(
        d => d.feature === activeView && d.isActive && d.fromTeacher?.assignedClass.split(',').map(c => c.trim()).includes(selectedClass)
      );
      if (delRecord && delRecord.fromTeacher) {
        return delRecord.fromTeacher.name;
      }
    }
    return user.name;
  };

  const activeTeacherName = getActiveTeacherName();

  useEffect(() => {
    loadDelegations();
  }, [activeView]);

  // Handle auto-reset of class selection when switching views
  useEffect(() => {
    const validClasses = getAssignedClassesForView();
    if (!validClasses.includes(selectedClass)) {
      setSelectedClass(validClasses[0] || '');
    }
  }, [activeView, delegations]);

  // The roster for the selected class; responses for a previously selected class are dropped.
  const rosterReq = useRef(0);
  const rosterClass = useRef<string | null>(null);
  const [rosterLoading, setRosterLoading] = useState(true);

  const loadClassStudents = async (classSec: string) => {
    if (!classSec) { setRosterLoading(false); return; }
    const parts = classSec.split('-');
    const clsVal = parts[0];
    const secVal = parts[1] || '';
    const reqId = ++rosterReq.current;
    // Only show a loader on first load or a class switch, not on background reloads.
    if (rosterClass.current !== classSec) setRosterLoading(true);
    try {
      const res = await fetch(`${API_BASE}/dashboard/students?class=${clsVal}&section=${secVal}`);
      const data = await res.json();
      if (reqId !== rosterReq.current) return;
      if (data.success) {
        setMyStudents(data.data);
      }
      rosterClass.current = classSec;
    } catch {
      if (reqId !== rosterReq.current) return;
      rosterClass.current = classSec;
      const filtered = students.filter(
        (s) => s.class === clsVal && s.section.toLowerCase() === secVal.toLowerCase()
      );
      setMyStudents(filtered);
    } finally {
      if (reqId === rosterReq.current) setRosterLoading(false);
    }
  };

  useEffect(() => {
    loadClassStudents(selectedClass);
  }, [selectedClass, students]);

  const filteredTeacherStudents = myStudents.filter((s) => {
    const q = searchQuery.toLowerCase();
    const classSec = `${s.class}-${s.section}`.toLowerCase();
    const classSecSpaced = `${s.class} ${s.section}`.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.admissionNo.toLowerCase().includes(q) ||
      s.class.toLowerCase().includes(q) ||
      s.section.toLowerCase().includes(q) ||
      classSec.includes(q) ||
      classSecSpaced.includes(q)
    );
  });

  // ─── Attendance State ────────────────────────────────────────────────────────
  const [attendanceDate, setAttendanceDate] = useState(getLocalToday());
  const [attendanceMap, setAttendanceMap] = useState<Record<string, 'present' | 'absent'>>({});
  const [attendanceStats, setAttendanceStats] = useState<Record<string, number>>({});
  const [showAbsentAlertConfirm, setShowAbsentAlertConfirm] = useState(false);
  const [isAttendanceMarkedForDate, setIsAttendanceMarkedForDate] = useState(false);
  const [attendanceMode, setAttendanceMode] = useState<'full' | 'half-day'>('full');
  const [morningMap, setMorningMap] = useState<Record<string, 'present' | 'absent'>>({});
  const [afternoonMap, setAfternoonMap] = useState<Record<string, 'present' | 'absent'>>({});

  // ─── Marks State ─────────────────────────────────────────────────────────────
  const [examsList, setExamsList] = useState<ExamData[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamData | null>(null);
  const [activeMarksStep, setActiveMarksStep] = useState<'list' | 'create' | 'entry'>('list');
  const [examName, setExamName] = useState('');
  const [examSubjects, setExamSubjects] = useState<ExamSubject[]>([{ name: '', totalMarks: 100 }]);
  const [studentGrades, setStudentGrades] = useState<Record<string, Record<string, number | ''>>>({});
  const [studentRemarks, setStudentRemarks] = useState<Record<string, string>>({});
  // Track whether we are editing an existing submitted exam vs fresh entry
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [isSubmittingMarks, setIsSubmittingMarks] = useState(false);

  // ─── Leave State ─────────────────────────────────────────────────────────────
  const [leavesList, setLeavesList] = useState<LeaveData[]>([]);
  const [newLeaveDesc, setNewLeaveDesc] = useState('');
  const [newLeaveFromDate, setNewLeaveFromDate] = useState('');
  const [newLeaveToDate, setNewLeaveToDate] = useState('');
  const [activeLeaveChat, setActiveLeaveChat] = useState<LeaveData | null>(null);
  const [leaveChatText, setLeaveChatText] = useState('');

  const handleLeaveFromDateChange = (val: string) => {
    setNewLeaveFromDate(val);
    if (newLeaveToDate && val > newLeaveToDate) {
      setNewLeaveToDate(val);
    }
  };

  const handleLeaveToDateChange = (val: string) => {
    if (newLeaveFromDate && val < newLeaveFromDate) {
      showToast('To Date cannot be before From Date.', 'error');
      setNewLeaveToDate(newLeaveFromDate);
    } else {
      setNewLeaveToDate(val);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  };

  const handleSendPersonalMessage = async () => {
    if (!messageTarget || !personalMessageText.trim()) return;
    setSendingMessage(true);
    const studentId = messageTarget.id || messageTarget._id;
    try {
      const res = await fetch(`${API_BASE}/messages/student/${studentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: personalMessageText.trim() })
      });
      const resData = await res.json();
      if (resData.success) {
        showToast(`Message sent successfully to parent of ${messageTarget.name}.`);
        setMessageTarget(null);
        setPersonalMessageText('');
      } else {
        showToast(resData.message || 'Failed to send message.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to send message.', 'error');
    } finally {
      setSendingMessage(false);
    }
  };

  // ─── Load Attendance Stats ────────────────────────────────────────────────────
  const loadAttendanceStats = async () => {
    if (!activeTeacherId) return;
    try {
      const res = await fetch(`${API_BASE}/attendance/student-stats?teacherId=${activeTeacherId}`);
      const data = await res.json();
      if (data.success) setAttendanceStats(data.stats);
    } catch (err) {
      console.error('Failed to load attendance stats:', err);
    }
  };

  // ─── Load Attendance History ──────────────────────────────────────────────────
  // Only the latest request for the register may update it: switching dates
  // quickly must never let an older answer overwrite the newer date.
  const attendanceHistoryReq = useRef(0);
  const [registerStatus, setRegisterStatus] = useState<'loading' | 'success' | 'error'>('loading');

  const loadAttendanceHistory = async () => {
    if (!activeTeacherId) { setRegisterStatus('success'); return; }
    const reqId = ++attendanceHistoryReq.current;
    setRegisterStatus('loading');
    try {
      const res = await fetch(`${API_BASE}/attendance/history?teacherId=${activeTeacherId}&date=${attendanceDate}`);
      if (res.status >= 500) throw new Error(`Register request failed (${res.status})`);
      const data = await res.json();
      if (reqId !== attendanceHistoryReq.current) return;
      setRegisterStatus('success');
      if (data.success && data.data) {
        const map: Record<string, 'present' | 'absent'> = {};
        const amMap: Record<string, 'present' | 'absent'> = {};
        const pmMap: Record<string, 'present' | 'absent'> = {};
        data.data.records.forEach((r: any) => {
          map[r.studentId] = r.status;
          amMap[r.studentId] = r.morningStatus || 'present';
          pmMap[r.studentId] = r.afternoonStatus || 'present';
        });
        setAttendanceMap(map);
        setMorningMap(amMap);
        setAfternoonMap(pmMap);
        setIsAttendanceMarkedForDate(true);
      } else {
        const map: Record<string, 'present' | 'absent'> = {};
        const amMap: Record<string, 'present' | 'absent'> = {};
        const pmMap: Record<string, 'present' | 'absent'> = {};
        myStudents.forEach((s) => {
          map[s.id] = 'present';
          amMap[s.id] = 'present';
          pmMap[s.id] = 'present';
        });
        setAttendanceMap(map);
        setMorningMap(amMap);
        setAfternoonMap(pmMap);
        setIsAttendanceMarkedForDate(false);
      }
    } catch (err) {
      console.error('Failed to load attendance history:', err);
      if (reqId === attendanceHistoryReq.current) setRegisterStatus('error');
    }
  };

  useEffect(() => { loadAttendanceStats(); }, [activeTeacherId, myStudents, activeView]);
  useEffect(() => { loadAttendanceHistory(); }, [activeTeacherId, attendanceDate, myStudents, activeView]);

  // ─── Load Exams ──────────────────────────────────────────────────────────────
  const loadExamsHistory = async () => {
    if (!activeTeacherId) return;
    try {
      const res = await fetch(`${API_BASE}/marks/history?teacherId=${activeTeacherId}`);
      const data = await res.json();
      if (data.success) setExamsList(data.data);
    } catch (err) {
      console.error('Failed to load exam history:', err);
    }
  };

  useEffect(() => { loadExamsHistory(); }, [activeTeacherId, activeView]);

  const loadExamDetails = async (examId: string, navigateToEntry = false) => {
    setStudentRemarks({});
    try {
      const res = await fetch(`${API_BASE}/marks/details/${examId}`);
      const data = await res.json();
      if (data.success && data.data) {
        setSelectedExam(data.data);
        const loadedRemarks: Record<string, string> = {};
        data.data.studentMarks.forEach((sm: any) => {
          const sId = typeof sm.student === 'string' ? sm.student : sm.student?._id;
          if (sId) {
            loadedRemarks[sId] = sm.remarks || '';
          }
        });
        setStudentRemarks(loadedRemarks);

        if (navigateToEntry) {
          loadExamForEntry(data.data);
        }
      }
    } catch (err) {
      console.error('Failed to load exam details:', err);
    }
  };

  const loadExamForEntry = (exam: ExamData) => {
    setExamName(exam.examName);
    setExamSubjects(exam.subjects);

    const grades: Record<string, Record<string, number | ''>> = {};
    const remarks: Record<string, string> = {};

    myStudents.forEach((student) => {
      const sm = exam.studentMarks.find(
        (record) => (typeof record.student === 'string' ? record.student : (record.student as any)?._id) === student.id
      );
      remarks[student.id] = sm?.remarks || '';
      grades[student.id] = {};
      exam.subjects.forEach((sub) => {
        const match = sm?.marks.find((m) => m.subject === sub.name);
        grades[student.id][sub.name] = match !== undefined ? match.obtainedMarks : '';
      });
    });

    setStudentGrades(grades);
    setStudentRemarks(remarks);
    // Mark as edit mode if grades already submitted
    const isEdit = exam.status === 'submitted' && exam.studentMarks.length > 0;
    setIsEditMode(isEdit);
    setEditingExamId(exam._id);
    setActiveMarksStep('entry');
  };

  const [enabledClasses, setEnabledClasses] = useState<string[]>([]);

  const fetchSystemConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings/system-config`);
      const data = await res.json();
      if (data.success && data.data) {
        setEnabledClasses(data.data.marksUpdateEnabledClasses || []);
        setAttendanceMode(data.data.attendanceMode || 'full');
      }
    } catch (err) {
      console.error('Failed to load system config for locks:', err);
    }
  };

  useEffect(() => { 
    loadExamsHistory(); 
    fetchSystemConfig();
  }, [user, activeView]);

  const fetchUnreadCount = async () => {
    if (!user.teacherId) return;
    try {
      let count = 0;
      const res = await fetch(`${API_BASE}/messages/teacher/${user.teacherId}`);
      const data = await res.json();
      if (data.success) {
        count += data.data.filter((m: any) => m.sender === 'admin' && !m.read).length;
      }

      // Check student threads for parent unread messages
      const threadsRes = await fetch(`${API_BASE}/messages/threads`);
      const threadsData = await threadsRes.json();
      if (threadsData.success && threadsData.data.studentThreads) {
        const classStudentIds = new Set(students.map(s => s.id || s._id || ''));
        threadsData.data.studentThreads
          .filter((t: any) => classStudentIds.has(t.studentId))
          .forEach((t: any) => count += (t.unreadCount || 0));
      }
      setUnreadMessagesCount(count);
    } catch (err) {
      console.error('Failed to load unread message count:', err);
    }
  };

  useEffect(() => {
    fetchUnreadCount();

    const interval = setInterval(fetchUnreadCount, 10000);
    return () => clearInterval(interval);
  }, [activeView, user]);

  // ─── Submit Marks (POST for new, PATCH per-student for edits) ────────────────
  const handleMarksSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeacherId) return;
    if (!examName || examSubjects.some((s) => !s.name || s.totalMarks <= 0)) {
      showToast('Please fill out the Exam Name and all subject names/total marks.', 'error'); return;
    }

    const subjects = examSubjects.map((s) => ({ name: s.name.trim(), totalMarks: Number(s.totalMarks) }));
    const studentMarksPayload = myStudents.map((student) => {
      const grades = studentGrades[student.id] || {};
      return {
        studentId: student.id,
        marks: subjects.map((sub) => ({ subject: sub.name, obtainedMarks: grades[sub.name] !== undefined ? Number(grades[sub.name]) : 0 })),
        remarks: studentRemarks[student.id] || ''
      };
    });

    // Client-side bounds validation
    for (const sm of studentMarksPayload) {
      for (const m of sm.marks) {
        const total = subjects.find((sub) => sub.name === m.subject)?.totalMarks || 100;
        if (m.obtainedMarks < 0 || m.obtainedMarks > total) {
          const sName = students.find((s) => s.id === sm.studentId)?.name || 'Student';
          showToast(`Error: ${sName}'s marks in ${m.subject} (${m.obtainedMarks}) must be 0–${total}.`, 'error');
          return;
        }
      }
    }

    setIsSubmittingMarks(true);
    try {
      if (isEditMode && editingExamId) {
        // ── EDIT MODE: PATCH each student individually (partial update + audit) ──
        let allSuccess = true;
        for (const sm of studentMarksPayload) {
          const res = await fetch(`${API_BASE}/marks/${editingExamId}/student`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId: sm.studentId, marks: sm.marks, remarks: sm.remarks }),
          });
          const data = await res.json();
          if (!data.success) { showToast(data.message || 'Failed to update marks.', 'error'); allSuccess = false; break; }
        }
        if (allSuccess) {
          showToast('Marks updated successfully.');
          setExamName(''); setExamSubjects([{ name: '', totalMarks: 100 }]); setStudentGrades({});
          setIsEditMode(false); setEditingExamId(null);
          setActiveMarksStep('list'); loadExamsHistory();
        }
      } else {
        // ── NEW ENTRY: POST full sheet (upsert) ──
        const res = await fetch(`${API_BASE}/marks`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ examName, classTeacherId: activeTeacherId, class: selectedClass || 'N/A', subjects, studentMarks: studentMarksPayload }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('Exam marks sheet submitted successfully.');
          setExamName(''); setExamSubjects([{ name: '', totalMarks: 100 }]); setStudentGrades({});
          setActiveMarksStep('list'); loadExamsHistory();
        } else {
          showToast(data.message || 'Failed to save marks.', 'error');
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to save exam marks sheet.', 'error');
    } finally {
      setIsSubmittingMarks(false);
    }
  };

  const handleSaveRemarks = async (exam: ExamData) => {
    if (!activeTeacherId) return;

    const studentMarksPayload = myStudents.map((student) => {
      const smRecord = exam.studentMarks.find(
        (sm) => (typeof sm.student === 'string' ? sm.student : (sm.student as any)._id) === student.id
      );

      const marks = exam.subjects.map((sub) => {
        const match = smRecord?.marks.find((m) => m.subject === sub.name);
        return {
          subject: sub.name,
          obtainedMarks: match !== undefined ? match.obtainedMarks : 0
        };
      });

      return {
        studentId: student.id,
        marks,
        remarks: studentRemarks[student.id] || ''
      };
    });

    try {
      const res = await fetch(`${API_BASE}/marks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examName: exam.examName,
          classTeacherId: activeTeacherId,
          class: exam.class,
          subjects: exam.subjects,
          studentMarks: studentMarksPayload
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Remarks saved successfully to the database.');
        loadExamDetails(exam._id);
      } else {
        showToast(data.message || 'Failed to save remarks.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to save remarks.', 'error');
    }
  };

  const handleCreateTemplate = async (examName: string, examType: 'final' | 'middle' | 'regular', subjects: ExamSubject[], targetRooms: string[]) => {
    if (!activeTeacherId) return;
    let successCount = 0;
    let failMessages: string[] = [];

    const promises = targetRooms.map(async (room) => {
      const payload = {
        examName: examName.trim(),
        examType: examType,
        classTeacherId: activeTeacherId,
        class: room,
        subjects: subjects.map(s => ({ name: s.name.trim(), totalMarks: Number(s.totalMarks) })),
        studentMarks: []
      };

      try {
        const res = await fetch(`${API_BASE}/marks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          successCount++;
        } else {
          failMessages.push(`${room}: ${data.message || 'Unknown error'}`);
        }
      } catch (err: any) {
        failMessages.push(`${room}: ${err.message || 'Connection failed'}`);
      }
    });

    try {
      await Promise.all(promises);
      if (successCount > 0) {
        showToast(`Exam template created for ${successCount} class room(s).`);
        setExamName('');
        setExamSubjects([{ name: '', totalMarks: 100 }]);
        setActiveMarksStep('list');
        loadExamsHistory();
      }
      if (failMessages.length > 0) {
        showToast(`Errors: ${failMessages.join(', ')}`, 'error');
      }
    } catch {
      showToast('Server connection failed.', 'error');
    }
  };

  // ─── Load Leaves ─────────────────────────────────────────────────────────────
  const [leavesStatus, setLeavesStatus] = useState<DataStatus>('loading');
  const loadLeaves = async () => {
    if (!user.teacherId) { setLeavesStatus('success'); return; }
    try {
      const data = await readJson(await fetch(`${API_BASE}/leaves/teacher/${user.teacherId}`));
      setLeavesList(data.data);
      setLeavesStatus('success');
    } catch (err) {
      console.error('Failed to load leaves:', err);
      setLeavesStatus((s) => (s === 'success' ? s : 'error'));
    }
  };

  useEffect(() => { loadLeaves(); }, [user, activeView]);

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.teacherId || !newLeaveDesc.trim() || !newLeaveFromDate || !newLeaveToDate) {
      showToast('Please fill in the from date, to date, and description for your leave.', 'error'); return;
    }
    if (newLeaveToDate < newLeaveFromDate) {
      showToast('To Date cannot be before From Date.', 'error'); return;
    }
    const resetForm = () => { setNewLeaveDesc(''); setNewLeaveFromDate(''); setNewLeaveToDate(''); };
    try {
      const res = await fetch(`${API_BASE}/leaves`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: user.teacherId, teacherName: user.name, description: newLeaveDesc.trim(),
          fromDate: newLeaveFromDate, toDate: newLeaveToDate,
        }),
      });
      const data = await res.json();
      if (data.success) { showToast('Leave application submitted successfully.'); resetForm(); loadLeaves(); }
      else showToast(data.message || 'Failed to submit leave application.', 'error');
    } catch (err: any) {
      showToast(err.message || 'Failed to submit leave application.', 'error');
    }
  };

  const sendLeaveChatMessage = async (leaveId: string) => {
    if (!leaveChatText.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/leaves/${leaveId}/message`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: 'teacher', senderName: user.name, text: leaveChatText.trim() }),
      });
      const data = await res.json();
      if (data.success) { setLeaveChatText(''); setActiveLeaveChat(data.data); loadLeaves(); }
    } catch (err) {
      console.error('Failed to send leave chat message:', err);
    }
  };

  // ─── Attendance submission ────────────────────────────────────────────────────
  const handleAttendanceSubmit = (e: React.FormEvent) => { e.preventDefault(); confirmAttendanceSubmit(true); };

  const confirmAttendanceSubmit = async (sendAlerts: boolean) => {
    setShowAbsentAlertConfirm(false);
    if (!activeTeacherId) return;
    const records = Object.keys(attendanceMap).map((sId) => {
      const morningStatus = morningMap[sId] || 'present';
      const afternoonStatus = afternoonMap[sId] || 'present';
      const status = attendanceMode === 'half-day'
        ? (morningStatus === 'present' && afternoonStatus === 'present' ? 'present' : 'absent')
        : (attendanceMap[sId] || 'present');
      return {
        studentId: sId,
        status,
        morningStatus,
        afternoonStatus
      };
    });
    try {
      const res = await fetch(`${API_BASE}/attendance`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: attendanceDate, classTeacherId: activeTeacherId, class: selectedClass || 'N/A', records, sendAlerts }),
      });
      const data = await res.json();
      if (data.success) showToast('Attendance register successfully submitted.');
      else showToast(data.message || 'Failed to submit attendance.', 'error');
    } catch (err: any) {
      showToast(err.message || 'Failed to submit attendance.', 'error');
      return;
    }
    if (sendAlerts) {
      if (attendanceMode === 'half-day') {
        const morningAbs = records.filter(r => r.morningStatus === 'absent').length;
        const afternoonAbs = records.filter(r => r.afternoonStatus === 'absent').length;
        if (morningAbs > 0 || afternoonAbs > 0) {
          showToast(`WhatsApp alerts sent: ${morningAbs} for morning, ${afternoonAbs} for afternoon.`);
        } else {
          showToast('No absent students today. No alerts sent.');
        }
      } else {
        const absentees = Object.keys(attendanceMap).filter((sId) => attendanceMap[sId] === 'absent');
        if (absentees.length > 0) showToast(`Sent parent alerts for ${absentees.length} absent students (Simulated).`);
        else showToast('No absent students today. No alert logs triggered.');
      }
    }
    loadAttendanceStats(); loadAttendanceHistory();
  };

  // ─── Navigate ────────────────────────────────────────────────────────────────
  const handleNavigate = (view: string) => {
    if (view === 'marks') { setActiveMarksStep('list'); setSelectedExam(null); }
    setActiveView(view as TeacherView);
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  // ─── Home Dashboard Calculations ──────────────────────────────────────────

  const totalStudentsCount = (myStudents || []).length;
  const todayPresentCountRaw = attendanceMode === 'half-day'
    ? (myStudents || []).reduce((acc, s) => {
        let count = 0;
        const sId = s?.id || (s as any)?._id;
        if (sId && (morningMap[sId] || 'present') === 'present') count += 0.5;
        if (sId && (afternoonMap[sId] || 'present') === 'present') count += 0.5;
        return acc + count;
      }, 0)
    : (myStudents || []).filter(s => {
        const sId = s?.id || (s as any)?._id;
        return !sId || attendanceMap[sId] === 'present' || !attendanceMap[sId];
      }).length;
  const todayPresentCount = Math.round(todayPresentCountRaw);
  const todayAbsentCount = Math.max(0, totalStudentsCount - todayPresentCount);
  const todayAttendanceRate = totalStudentsCount > 0 ? Math.round((todayPresentCount / totalStudentsCount) * 100) : 0;

  const lowAttendanceStudents = (myStudents || [])
    .filter((s): s is StudentData => !!s && !!s.name)
    .map(s => {
      const sId = s.id || (s as any)._id;
      const pct = (sId && attendanceStats[sId] !== undefined) ? attendanceStats[sId] : 100;
      return { student: s, pct };
    })
    .filter(item => item.pct < 75)
    .sort((a, b) => a.pct - b.pct);

  // ─── Navigation (permission-filtered, same rules as the redirect effect above) ──
  const navItems: (ShellNavItem & { permission?: string; classTeacherOnly?: boolean })[] = [
    { key: 'home', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard, group: 'Classroom' },
    { key: 'attendance', label: 'Attendance', icon: CalendarCheck, group: 'Classroom', permission: 'attendance:mark' },
    { key: 'marks', label: 'Marks Entry', shortLabel: 'Marks', icon: Award, group: 'Classroom', permission: 'marks:entry' },
    { key: 'students', label: 'My Students', shortLabel: 'Students', icon: UsersIcon, group: 'Classroom', permission: 'students:read', classTeacherOnly: true },
    { key: 'analytics', label: 'Exam Analytics', shortLabel: 'Analytics', icon: BarChart3, group: 'Classroom', permission: 'results:view' },
    { key: 'homework', label: 'Homework', icon: BookOpenCheck, group: 'Classroom', permission: 'homework:read' },
    { key: 'messages', label: 'Direct Messages', shortLabel: 'Messages', icon: MessageSquare, group: 'Communication', permission: 'dashboard:view', badge: unreadMessagesCount },
    { key: 'notices', label: 'School Notices', shortLabel: 'Notices', icon: Bell, group: 'Communication', permission: 'dashboard:view' },
    { key: 'fees', label: 'Fees Management', shortLabel: 'Fees', icon: Wallet, group: 'Administration', permission: 'fees:view' },
    { key: 'leaves', label: 'Leave Application', shortLabel: 'Leaves', icon: CalendarDays, group: 'Administration', permission: 'leaves:read' },
    { key: 'delegations', label: 'Permission Transfer', shortLabel: 'Delegate', icon: Share2, group: 'Administration', permission: 'marks:entry' },
    { key: 'signature', label: 'My Signature', shortLabel: 'Signature', icon: FileSignature, group: 'Administration', permission: 'dashboard:view' },
  ].filter((item) => (!item.classTeacherOnly || isClassTeacher) && (!item.permission || hasPermission(item.permission)));

  const available = new Set(navItems.map((i) => i.key));
  const tabs = ['home', 'attendance', 'marks', 'messages'].filter((k) => available.has(k));
  const openAttendance = () => { setAttendanceDate(getLocalToday()); handleNavigate('attendance'); };

  const classOptions = assignedClasses.map((cls) => {
    const isDelegated = !user.assignedClass?.split(',').map((c: string) => c.trim()).includes(cls);
    const delRecord = delegations.received.find(
      (d: any) => d.feature === activeView && d.isActive && d.fromTeacher?.assignedClass.split(',').map((c: string) => c.trim()).includes(cls)
    );
    const formattedLabel = formatRawClass(cls);
    return { value: cls, label: isDelegated && delRecord ? `${formattedLabel} (Delegated from ${delRecord.fromTeacher?.name})` : formattedLabel, short: formattedLabel };
  });

  const classPicker = (compact: boolean) => assignedClasses.length > 1 ? (
    <select
      value={selectedClass}
      onChange={(e) => setSelectedClass(e.target.value)}
      aria-label="Select class"
      className={cn(
        'border border-line-strong rounded-md font-semibold text-ink bg-surface outline-none focus:border-blue-500 cursor-pointer truncate',
        compact ? 'h-9 max-w-[118px] pl-2.5 pr-6 text-xs' : 'h-control-sm max-w-[260px] pl-3 pr-8 text-sm'
      )}
    >
      {classOptions.map((o) => <option key={o.value} value={o.value}>{compact ? o.short : o.label}</option>)}
    </select>
  ) : assignedClasses.length === 1 ? (
    <span className={cn('inline-flex items-center rounded-full bg-surface-2 border border-line font-semibold text-ink-2 whitespace-nowrap', compact ? 'h-8 px-2.5 text-xs' : 'h-8 px-3 text-sm')}>
      {formatRawClass(selectedClass)}
    </span>
  ) : null;

  const rosterSearch = (
    <div className="relative w-full max-w-[320px]">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" aria-hidden="true" />
      <input
        type="search"
        placeholder="Search my class roster…"
        aria-label="Search my class roster"
        className="w-full h-control-sm pl-9 pr-3 rounded-full border border-line bg-surface-2 text-sm text-ink placeholder:text-faint outline-none focus:bg-surface focus:border-blue-400"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
    </div>
  );

  const showClassStrip = !['home', 'messages', 'notices', 'profile', 'signature', 'leaves', 'delegations'].includes(activeView);

  return (
    <>
      <Toast toast={toast} />
      <AppShell
        role="teacher"
        schoolName={schoolProfile?.schoolInfo?.schoolName || 'SchoolHub'}
        schoolLogo={schoolProfile?.schoolInfo?.logo}
        userName={user.name || 'Teacher'}
        userRoleLabel={isClassTeacher ? 'Class Teacher' : 'Teacher'}
        userAvatar={user.avatar || undefined}
        items={navItems}
        tabs={tabs}
        activeKey={activeView}
        homeKey="home"
        onNavigate={handleNavigate}
        title={VIEW_LABELS[activeView] || 'Teacher Portal'}
        subtitle={selectedClass ? `Room ${formatRawClass(selectedClass)}` : undefined}
        onProfile={() => handleNavigate('profile')}
        onLogout={onLogout}
        topBarCenter={<>{rosterSearch}{classPicker(false)}</>}
        mobileActions={classPicker(true)}
        fullHeight={activeView === 'messages'}
      >
        {showClassStrip && (
          <div className="hidden md:grid grid-cols-2 gap-3 max-w-xl">
            <StatTile label="Assigned room / class" value={formatRawClass(selectedClass)} icon={<GraduationCap size={15} />} tone="brand" />
            <StatTile label="Assigned students" value={myStudents.length} icon={<UsersIcon size={15} />} />
          </div>
        )}

        <ErrorBoundary key={activeView}>
        <Suspense fallback={<SkeletonPage />}>
          {activeView === 'home' && (
            <TeacherHome
              teacherName={user?.name || 'Teacher'}
              classLabel={formatRawClass(selectedClass)}
              isClassTeacher={isClassTeacher}
              totalStudents={totalStudentsCount}
              presentCount={todayPresentCount}
              absentCount={todayAbsentCount}
              attendanceRate={todayAttendanceRate}
              isAttendanceMarked={isAttendanceMarkedForDate}
              lowAttendance={lowAttendanceStudents}
              unreadMessages={unreadMessagesCount}
              available={available}
              onMarkAttendance={openAttendance}
              onNavigate={handleNavigate}
              onStudentTap={(s) => { if (isClassTeacher) handleNavigate('students'); else setMessageTarget(s); }}
            />
          )}
          {activeView === 'students' && hasPermission('students:read') && (
            <TeacherStudents
              students={filteredTeacherStudents}
              loading={rosterLoading}
              attendanceStats={attendanceStats}
              teacherId={activeTeacherId}
              onMessageParent={(student) => setMessageTarget(student)}
              canAddStudent={hasPermission('students:create')}
              defaultClassSection={selectedClass}
              onStudentAdded={() => loadClassStudents(selectedClass)}
              showToast={showToast}
            />
          )}

          {activeView === 'attendance' && hasPermission('attendance:mark') && (
            <TeacherAttendance
              students={filteredTeacherStudents}
              teacherId={activeTeacherId}
              attendanceDate={attendanceDate}
              attendanceMap={attendanceMap}
              isAlreadyMarked={isAttendanceMarkedForDate}
              onDateChange={setAttendanceDate}
              onToggleAttendance={(id, status) => setAttendanceMap((prev) => ({ ...prev, [id]: status }))}
              onSubmitAttendance={handleAttendanceSubmit}
              registerStatus={rosterLoading ? 'loading' : registerStatus}
              onRetryRegister={loadAttendanceHistory}
              attendanceMode={attendanceMode}
              morningMap={morningMap}
              afternoonMap={afternoonMap}
              onToggleMorning={(id, status) => setMorningMap((prev) => ({ ...prev, [id]: status }))}
              onToggleAfternoon={(id, status) => setAfternoonMap((prev) => ({ ...prev, [id]: status }))}
            />
          )}

          {activeView === 'marks' && hasPermission('marks:entry') && (
            <TeacherMarks
              teacherName={activeTeacherName}
              students={filteredTeacherStudents}
              examsList={examsList.filter(e => e.class.toUpperCase() === selectedClass.toUpperCase())}
              selectedExam={selectedExam}
              activeStep={activeMarksStep}
              examName={examName}
              examSubjects={examSubjects}
              studentGrades={studentGrades}
              studentRemarks={studentRemarks}
              onStepChange={setActiveMarksStep}
              onExamNameChange={setExamName}
              onSubjectsChange={setExamSubjects}
              onStudentGradeChange={(studentId, subject, value) =>
                setStudentGrades((prev) => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), [subject]: value } }))
              }
              onStudentRemarkChange={(studentId, value) =>
                setStudentRemarks((prev) => ({ ...prev, [studentId]: value }))
              }
              onLoadExamDetails={loadExamDetails}
              onCloseExamDetails={() => { setSelectedExam(null); setStudentRemarks({}); }}
              onSubmitMarks={handleMarksSubmit}
              isSubmittingMarks={isSubmittingMarks}
              onSaveRemarks={handleSaveRemarks}
              onEnterMarks={loadExamForEntry}
              showToast={showToast}
              assignedClasses={assignedClasses}
              selectedClass={selectedClass}
              onSubmitTemplate={handleCreateTemplate}
              isLocked={selectedClass ? !enabledClasses.map(c => c.split('-')[0].trim()).includes(selectedClass.split('-')[0].trim()) : false}
            />
          )}

          {activeView === 'analytics' && hasPermission('results:view') && (
            <ExamAnalytics
              examsList={examsList.filter(e => e.class.toUpperCase() === selectedClass.toUpperCase())}
              students={filteredTeacherStudents}
              selectedClass={selectedClass}
            />
          )}

          {activeView === 'homework' && hasPermission('homework:read') && (
            <HomeworkBoard
              mode="teacher"
              assignedClasses={assignedClasses}
              showToast={showToast}
            />
          )}

          {activeView === 'signature' && (
            <TeacherSignature onShowToast={(msg, t) => showToast(msg, t === 'error' ? 'error' : 'success')} />
          )}

          {activeView === 'leaves' && hasPermission('leaves:read') && (
            <TeacherLeaves
              leavesList={leavesList}
              status={leavesStatus}
              onRetry={loadLeaves}
              newLeaveDesc={newLeaveDesc}
              newLeaveFromDate={newLeaveFromDate}
              newLeaveToDate={newLeaveToDate}
              activeLeaveChat={activeLeaveChat}
              leaveChatText={leaveChatText}
              onDescChange={setNewLeaveDesc}
              onFromDateChange={handleLeaveFromDateChange}
              onToDateChange={handleLeaveToDateChange}
              onSubmitLeave={handleLeaveSubmit}
              onOpenChat={(leave) => setActiveLeaveChat(leave)}
              onCloseChat={() => setActiveLeaveChat(null)}
              onChatTextChange={setLeaveChatText}
              onSendChatMessage={sendLeaveChatMessage}
            />
          )}

          {activeView === 'notices' && hasPermission('dashboard:view') && <TeacherNotices events={events} />}

          {activeView === 'messages' && hasPermission('dashboard:view') && (
            <div className="flex-1 flex flex-col min-h-0">
              <TeacherMessages
                teacherId={activeTeacherId}
                teacherName={activeTeacherName}
                students={myStudents}
              />
            </div>
          )}

          {activeView === 'fees' && hasPermission('fees:view') && (
            <TeacherFees
              students={myStudents}
              onReload={() => loadClassStudents(selectedClass)}
              showToast={showToast}
            />
          )}

          {activeView === 'delegations' && hasPermission('marks:entry') && (
            <TeacherDelegations
              teachers={teachers}
              delegations={delegations}
              onAddDelegation={handleAddDelegation}
              onRevokeDelegation={handleRevokeDelegation}
              loading={delegationsLoading}
              currentUserTeacherId={user.teacherId}
            />
          )}

          {activeView === 'profile' && (
            <>
              <TeacherProfile showToast={showToast} />
              <AppUpdates className="max-w-2xl" />
            </>
          )}
        </Suspense>
        </ErrorBoundary>
      </AppShell>

      {/* Send Message to Parent Modal */}
      <Modal
        isOpen={!!messageTarget}
        onClose={() => { setMessageTarget(null); setPersonalMessageText(''); }}
        title="Message Parent"
        subtitle={messageTarget ? `Send a personal direct message to the parent of ${messageTarget.name}. This message will be delivered to the parent's portal dashboard.` : ''}
        maxWidth="450px"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => { setMessageTarget(null); setPersonalMessageText(''); }} disabled={sendingMessage}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSendPersonalMessage} disabled={sendingMessage || !personalMessageText.trim()} loading={sendingMessage}>
              {sendingMessage ? 'Sending...' : 'Send Message'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="parent-message-text" className="text-sm font-semibold text-ink-2">Message</label>
          <textarea
            id="parent-message-text"
            className={cn(textareaClass, 'h-[120px] resize-none')}
            placeholder="Type your message here..."
            value={personalMessageText}
            onChange={(e) => setPersonalMessageText(e.target.value)}
            autoFocus
          />
        </div>
      </Modal>
    </>
  );
};

export default TeacherPortal;
