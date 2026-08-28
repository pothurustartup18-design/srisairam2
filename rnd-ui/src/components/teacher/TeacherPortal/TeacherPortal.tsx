import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Search, Sun, Moon, Menu } from 'lucide-react';

import Toast from '../../shared/Toast/Toast';
import { TeacherSidebar } from '../../shared/Sidebars/Sidebars';
import { Button, KpiCard, Modal } from '../../ui';
import { GraduationCap, Users as UsersIcon } from 'lucide-react';

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
import type { DelegationRecord } from '../TeacherDelegations/TeacherDelegations';
import { API_BASE, formatClassName } from '../../../constants';
import { useAuth } from '../../../context/authContext';

type TeacherView = 'students' | 'attendance' | 'marks' | 'analytics' | 'homework' | 'signature' | 'leaves' | 'notices' | 'messages' | 'fees' | 'delegations' | 'profile';

interface TeacherPortalProps {
  user: UserProfile;
  students: StudentData[];
  teachers: TeacherData[];
  events: EventData[];
  onLogout: () => void;
}

const TeacherPortal: React.FC<TeacherPortalProps> = ({ user, students, teachers, events, onLogout }) => {
  const isClassTeacher = user?.role === 'teacher' && !!user.classTeacherOf;
  const [activeView, setActiveView] = useState<TeacherView>(isClassTeacher ? 'students' : 'attendance');
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });

  // ─── Theme Integration ─────────────────────────────────────────────────────
  const [theme, setTheme] = useState(document.documentElement.classList.contains('dark') ? 'dark' : 'light');

  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      setTheme((e as CustomEvent).detail);
    };
    window.addEventListener('theme-changed', handleThemeChange);
    return () => window.removeEventListener('theme-changed', handleThemeChange);
  }, []);

  const handleToggleTheme = () => {
    if ((window as any).toggleAppTheme) {
      (window as any).toggleAppTheme();
    }
  };
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  // Default to the collapsed icon rail on tablet widths (768-1023px) so content panes
  // (e.g. the Messages two-pane chat) aren't squeezed by a full-width nav + thread list.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth < 1024
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // Below 768px the hamburger opens the off-canvas drawer; at 768px+ it toggles icon-collapse.
  const handleToggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMobileSidebarOpen(o => !o);
    } else {
      setSidebarCollapsed(c => !c);
    }
  };
  const { hasPermission } = useAuth();
  
  // Redirect if user has no permission for current activeView or is not a class teacher looking at students list
  useEffect(() => {
    const viewPermissions: Record<TeacherView, string | null> = {
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
        'attendance', 'marks', 'analytics', 'homework',
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
        'students', 'attendance', 'marks', 'analytics', 'homework',
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
  const [delegations, setDelegations] = useState<{ sent: DelegationRecord[]; received: DelegationRecord[] }>({ sent: [], received: [] });
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

  const loadClassStudents = async (classSec: string) => {
    if (!classSec) return;
    const parts = classSec.split('-');
    const clsVal = parts[0];
    const secVal = parts[1] || '';
    try {
      const res = await fetch(`${API_BASE}/dashboard/students?class=${clsVal}&section=${secVal}`);
      const data = await res.json();
      if (data.success) {
        setMyStudents(data.data);
      }
    } catch {
      const filtered = students.filter(
        (s) => s.class === clsVal && s.section.toLowerCase() === secVal.toLowerCase()
      );
      setMyStudents(filtered);
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
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, 'present' | 'absent'>>({});
  const [attendanceStats, setAttendanceStats] = useState<Record<string, number>>({});
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
  const loadAttendanceHistory = async () => {
    if (!activeTeacherId) return;
    try {
      const res = await fetch(`${API_BASE}/attendance/history?teacherId=${activeTeacherId}&date=${attendanceDate}`);
      const data = await res.json();
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

  const handleAutoSave = async (): Promise<boolean> => {
    if (!selectedExam || !activeTeacherId) return false;

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
          return false;
        }
      }
    }

    try {
      if (isEditMode && editingExamId) {
        // Edit mode: PATCH each student
        for (const sm of studentMarksPayload) {
          const res = await fetch(`${API_BASE}/marks/${editingExamId}/student`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId: sm.studentId, marks: sm.marks, remarks: sm.remarks }),
          });
          const data = await res.json();
          if (!data.success) return false;
        }
      } else {
        // New entry / draft: POST full sheet
        const res = await fetch(`${API_BASE}/marks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            examName,
            classTeacherId: activeTeacherId,
            class: selectedClass || 'N/A',
            subjects,
            studentMarks: studentMarksPayload
          }),
        });
        const data = await res.json();
        if (!data.success) return false;
      }
      return true;
    } catch {
      return false;
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
  const loadLeaves = async () => {
    if (!user.teacherId) return;
    try {
      const res = await fetch(`${API_BASE}/leaves/teacher/${user.teacherId}`);
      const data = await res.json();
      if (data.success) setLeavesList(data.data);
    } catch (err) {
      console.error('Failed to load leaves:', err);
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
  return (
    <div className="dashboard-container">
      <Toast toast={toast} />

      <TeacherSidebar
        activeView={activeView}
        onNavigate={handleNavigate}
        onLogout={onLogout}
        unreadMessagesCount={unreadMessagesCount}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      <main className="main-layout">
        <header className="top-header">
          <div className="flex flex-wrap gap-3 sm:gap-4 lg:gap-6 items-center flex-1 min-w-0">
            <button
              type="button"
              className="action-icon-btn !rounded-lg"
              onClick={handleToggleSidebar}
              title={sidebarCollapsed ? 'Expand Sidebar' : 'Toggle Sidebar'}
            >
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
            <div className="search-bar-container">
              <Search className="search-icon" />
              <input
                type="text"
                placeholder="Search my class roster..."
                className="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {assignedClasses.length > 0 && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-semibold text-slate-600 whitespace-nowrap">Room:</span>
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="h-9 pl-3 pr-8 border-[1.5px] border-slate-200 rounded-md text-sm font-semibold text-slate-700 bg-white outline-none focus:border-blue transition-colors cursor-pointer"
                >
                  {assignedClasses.map((cls) => {
                    const isDelegated = !user.assignedClass?.split(',').map(c => c.trim()).includes(cls);
                    const delRecord = delegations.received.find(
                      d => d.feature === activeView && d.isActive && d.fromTeacher?.assignedClass.split(',').map(c => c.trim()).includes(cls)
                    );
                    const formattedLabel = formatRawClass(cls);
                    const label = isDelegated && delRecord
                      ? `${formattedLabel} (Delegated from ${delRecord.fromTeacher?.name})`
                      : formattedLabel;
                    return <option key={cls} value={cls} className="bg-white text-slate-900">{label}</option>;
                  })}
                </select>
              </div>
            )}
          </div>
          <div className="header-right">
            <div className="header-actions" style={{ display: 'flex', gap: '8px', marginRight: '16px' }}>
              <button className="action-icon-btn" onClick={handleToggleTheme} title={theme === 'dark' ? "Switch to Light Theme" : "Switch to Dark Theme"}>
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
            <div className="user-profile">
              <div
                className="user-avatar"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#4f46e5',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '13px',
                }}
              >
                {(user.name || '').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div className="user-info">
                <span className="user-name">{user.name}</span>
                <span className="user-role">Class Teacher (Room: {formatRawClass(selectedClass)})</span>
              </div>
            </div>
          </div>
        </header>

        <div className="content-area">
          <div className="dashboard-main-view">
            {/* Teacher KPIs — hidden on general pages (notices, profile, signature, leaves, delegations) and the Messages page which needs full height */}
            {!['messages', 'notices', 'profile', 'signature', 'leaves', 'delegations'].includes(activeView) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <KpiCard label="Assigned Room / Class" value={formatRawClass(selectedClass)}
                  icon={<GraduationCap size={17} />} iconBg="bg-purple-lt" iconColor="text-purple" />
                <KpiCard label="Assigned Students" value={myStudents.length}
                  icon={<UsersIcon size={17} />} iconBg="bg-amber-lt" iconColor="text-amber" />
              </div>
            )}

            <Suspense fallback={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', flexDirection: 'column', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTop: '3px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <span style={{ color: '#64748b', fontSize: '13px' }}>Loading Section...</span>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </div>
            }>
              {activeView === 'students' && hasPermission('students:read') && (
                <TeacherStudents
                  students={filteredTeacherStudents}
                  attendanceStats={attendanceStats}
                  teacherId={activeTeacherId}
                  onMessageParent={(student) => setMessageTarget(student)}
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
                  onAutoSave={handleAutoSave}
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
                <TeacherMessages
                  teacherId={activeTeacherId}
                  teacherName={activeTeacherName}
                  students={myStudents}
                />
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
                <TeacherProfile showToast={showToast} />
              )}
            </Suspense>
          </div>
        </div>
      </main>

      {/* Send Message to Parent Modal */}
      <Modal
        isOpen={!!messageTarget}
        onClose={() => { setMessageTarget(null); setPersonalMessageText(''); }}
        title="Message Parent"
        subtitle={messageTarget ? `Send a personal direct message to the parent of ${messageTarget.name}. This message will be delivered to the parent's portal dashboard.` : ''}
        maxWidth="450px"
        footer={
          <div className="flex gap-3">
            <Button className="flex-1 justify-center" onClick={handleSendPersonalMessage} disabled={sendingMessage || !personalMessageText.trim()} loading={sendingMessage}>
              {sendingMessage ? 'Sending...' : 'Send Message'}
            </Button>
            <Button variant="secondary" className="flex-1 justify-center" onClick={() => { setMessageTarget(null); setPersonalMessageText(''); }} disabled={sendingMessage}>
              Cancel
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Message Text</label>
          <textarea
            className="w-full h-[120px] px-3 py-2 border-[1.5px] border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue transition-colors font-[inherit] resize-none"
            placeholder="Type your message here..."
            value={personalMessageText}
            onChange={(e) => setPersonalMessageText(e.target.value)}
            autoFocus
          />
        </div>
      </Modal>
    </div>
  );
};

export default TeacherPortal;
