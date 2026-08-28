import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { StudentData, TeacherData, ExamData, ExamSubject, ClassData } from '../../../types';
import { API_BASE, sortClasses, formatClassName } from '../../../constants';
import {
  Plus, FileDown, Download, Share2, ArrowLeft, ArrowRight, Save, Loader2, Lock, Unlock,
  ChevronDown, ChevronUp, Clock, Eye, MessageCircle, Trash2, BarChart2,
  History, BookOpen, CheckCircle, AlertTriangle, ClipboardList,
  GraduationCap, TrendingUp, Users, FileText, GripVertical, Info
} from 'lucide-react';
import { generateReportCardPDF, generateSingleStudentReportPDF, uploadSingleStudentReportPDF } from '../../teacher/TeacherMarks/report-card';
import { getAccessToken } from '../../../services/api';
import { cn } from '../../../lib/utils';
import { Button, Badge, DataTable, Th, Td, Tr, EmptyState, LoadingSpinner, Modal, Drawer, MobileCardList, MobileRowCard } from '../../ui';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ExamAnalyticsData {
  examName: string; class: string; studentsCount: number; classAverage: number;
  gradeBands: { min: number; grade: string }[];
  subjectStats: { subject: string; totalMarks: number; average: number; highest: number; lowest: number }[];
  students: { studentId: string; name: string; total: number; totalPossible: number; percentage: number; grade: string; rank: number }[];
}
interface ExamHistoryEntry {
  editedByName: string; editedAt: string;
  studentId: string | { _id: string; firstName?: string; lastName?: string; admissionNo?: string };
  changes: { subject: string; from: number; to: number }[];
}
interface AdminMarksProps {
  students: StudentData[]; teachers: TeacherData[];
  classesList?: ClassData[];
  showToast: (message: string, type?: 'success' | 'error') => void;
}

// ─── Shared field classes (same token system as Teachers/Students) ────────────
const labelCls  = 'text-[11px] font-bold uppercase tracking-wider text-slate-400';
const inputCls  = 'h-9 px-3 border border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all font-[inherit] w-full';
const selectCls = inputCls;
const iconActionBtn = (color: string, border: string, hover: string) =>
  `w-8 h-8 flex items-center justify-center rounded-md border transition-colors ${color} ${border} ${hover}`;

// ─── Common subject presets for the exam-template subject picker ──────────────
// (Mirrors the Teacher portal's "Define New Exam Template" wizard exactly.)
const COMMON_SUBJECTS = [
  'English', 'Telugu', 'Hindi', 'Sanskrit', 'Mathematics', 'Science',
  'Physics', 'Chemistry', 'Biology', 'Social Studies', 'History', 'Geography',
  'Civics', 'Computer Science', 'Physical Education', 'Art & Craft', 'Music',
  'Environmental Science', 'General Knowledge',
];

/**
 * Text input + suggestion dropdown for picking a subject name.
 * Still accepts free-typed values — the list is just a shortcut, not a restriction.
 */
function SubjectNameInput({
  value,
  onChange,
  excludeNames,
  className,
}: {
  value: string;
  onChange: (val: string) => void;
  excludeNames: string[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const excludeLower = excludeNames.map(n => n.trim().toLowerCase());
  const suggestions = COMMON_SUBJECTS.filter(s => {
    if (excludeLower.includes(s.toLowerCase())) return false;
    if (!value.trim()) return true;
    return s.toLowerCase().includes(value.trim().toLowerCase());
  });

  return (
    <div className={cn('relative', className)}>
      <input
        type="text"
        placeholder="Subject Name (e.g. Math, Science)"
        className={inputCls}
        required
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => onChange(e.target.value)}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-20 bg-white border border-slate-200 rounded-md shadow-modal max-h-52 overflow-y-auto py-1">
          {suggestions.map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(s); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Two-step progress indicator used in the New Exam Template drawer. */
function WizardStepIndicator({ step }: { step: 1 | 2 }) {
  const steps: { n: 1 | 2; label: string }[] = [
    { n: 1, label: 'Exam & Classes' },
    { n: 2, label: 'Subjects & Marks' },
  ];
  return (
    <div className="flex items-center justify-center gap-3 py-1">
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          {i > 0 && <div className="w-10 h-px bg-slate-200 flex-shrink-0" />}
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
              step === s.n ? 'bg-blue-600 text-white' : 'border-2 border-slate-300 text-slate-400'
            )}>
              {s.n}
            </div>
            <span className={cn('text-sm font-semibold whitespace-nowrap', step === s.n ? 'text-blue-600' : 'text-slate-400')}>
              {s.label}
            </span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

/** Icon + title header used atop each card section in the drawer. */
function SectionHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
      <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <div className="text-sm font-bold text-slate-900">{title}</div>
        {subtitle && <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>}
      </div>
    </div>
  );
}

const AdminMarks: React.FC<AdminMarksProps> = ({ students, teachers, classesList = [], showToast }) => {
  // ─── Core navigation & class state ────────────────────────────────────────
  const [selectedClass,   setSelectedClass]   = useState('10');
  const [selectedSection, setSelectedSection] = useState('A');
  const [activeStep,      setActiveStep]      = useState<'list' | 'entry'>('list');
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);

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

  // ─── Exam list state ───────────────────────────────────────────────────────
  const [examsList,    setExamsList]    = useState<ExamData[]>([]);
  const [loadingList,  setLoadingList]  = useState(false);
  const [deletingExamId, setDeletingExamId] = useState<string | null>(null);
  const [lockingExamId,  setLockingExamId]  = useState<string | null>(null);

  // ─── Create template state ─────────────────────────────────────────────────
  const [examName,       setExamName]       = useState('');
  const [examType,       setExamType]       = useState<'final' | 'middle' | 'regular'>('regular');
  const [examDescription,setExamDescription]= useState('');
  const [examSubjects,   setExamSubjects]   = useState<ExamSubject[]>([{ name: '', totalMarks: 100 }]);
  const [selectedRooms,  setSelectedRooms]  = useState<string[]>([]);
  const [applyGlobally,  setApplyGlobally]  = useState(false);
  const [saving,         setSaving]         = useState(false);

  // ─── New Exam Template drawer: two-step wizard state (mirrors Teacher portal) ──
  const [wizardStep,       setWizardStep]       = useState<1 | 2>(1);
  const [dragSubjectIndex, setDragSubjectIndex] = useState<number | null>(null);

  // ─── Grade entry state ─────────────────────────────────────────────────────
  const [selectedExam,       setSelectedExam]       = useState<ExamData | null>(null);
  const [studentGrades,      setStudentGrades]      = useState<Record<string, Record<string, number | ''>>>({});
  const [studentRemarks,     setStudentRemarks]     = useState<Record<string, string>>({});
  const [validationErrors,   setValidationErrors]   = useState<Record<string, Record<string, boolean>>>({});
  const [generatingStudentId,setGeneratingStudentId]= useState<string | null>(null);
  const [sharingStudentId,   setSharingStudentId]   = useState<string | null>(null);
  const [sendingWhatsappId,  setSendingWhatsappId]  = useState<string | null>(null);
  const [previewUrl,         setPreviewUrl]         = useState<string | null>(null);
  const [previewStudentName, setPreviewStudentName] = useState<string>('');
  const [showHistory,        setShowHistory]        = useState(false);

  // ─── Analytics / History modal state ──────────────────────────────────────
  const [analyticsExamId,  setAnalyticsExamId]   = useState<string | null>(null);
  const [analyticsData,    setAnalyticsData]     = useState<ExamAnalyticsData | null>(null);
  const [loadingAnalytics, setLoadingAnalytics]  = useState(false);
  const [historyExamId,    setHistoryExamId]     = useState<string | null>(null);
  const [historyData,      setHistoryData]       = useState<{ examName: string; class: string; editHistory: ExamHistoryEntry[] } | null>(null);
  const [loadingHistoryData,setLoadingHistoryData]=useState(false);

  // ─── Derived values ────────────────────────────────────────────────────────
  const roomName        = `${selectedClass}-${selectedSection}`;
  const assignedTeacher = teachers.find(t => t.assignedClass?.split(',').map(s => s.trim().toUpperCase()).includes(roomName.toUpperCase()));
  const classStudents   = students.filter(s => s.class === selectedClass && s.section.toUpperCase() === selectedSection.toUpperCase());

  const classOptions = classesList.length === 0
    ? [{ value: '10', label: 'Class 10' }, { value: '9', label: 'Class 9' }, { value: '8', label: 'Class 8' }]
    : sortClasses(Array.from(new Set(classesList.map(c => c.className)))).map(cls => ({ value: cls, label: isNaN(Number(cls)) ? cls : `Class ${cls}` }));
  const sectionOptions = classesList.length === 0
    ? [{ value: 'A', label: 'Section A' }, { value: 'B', label: 'Section B' }]
    : classesList.filter(c => c.className === selectedClass).map(c => ({ value: c.section, label: c.section === '-' ? 'No Section' : `Section ${c.section}` }));

  // Flat list of every class-room combo, for the wizard's "Select Class Rooms" grid.
  // `value` is the raw "Class-Section" string used for room matching/payloads;
  // `label` is the clean display form (handles no-section classes like Nursery/LKG).
  const roomOptions = classesList.length === 0
    ? [{ value: '10-A', label: 'Class 10 - A' }, { value: '10-B', label: 'Class 10 - B' }, { value: '9-A', label: 'Class 9 - A' }, { value: '9-B', label: 'Class 9 - B' }]
    : sortClasses(Array.from(new Set(classesList.map(c => c.className))))
        .flatMap(cls => classesList.filter(c => c.className === cls).map(c => ({ value: `${cls}-${c.section}`, label: formatClassName(cls, c.section) })));

  // ─── API handlers ──────────────────────────────────────────────────────────
  const loadExams = async () => {
    setLoadingList(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const res  = await fetch(`${API_BASE}/marks/all`, { headers });
      const data = await res.json();
      if (data.success) setExamsList(data.data.filter((e: ExamData) => e.class.toUpperCase() === roomName.toUpperCase()));
    } catch { showToast('Failed to load exams list.', 'error'); }
    finally  { setLoadingList(false); }
  };

  useEffect(() => { loadExams(); }, [selectedClass, selectedSection]);

  const handleLoadExamDetails = async (examId: string) => {
    try {
      const token = getAccessToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const res  = await fetch(`${API_BASE}/marks/details/${examId}`, { headers });
      const data = await res.json();
      if (data.success && data.data) {
        const exam: ExamData = data.data;
        setSelectedExam(exam);
        const grades: Record<string, Record<string, number | ''>> = {};
        const remarks: Record<string, string> = {};
        classStudents.forEach(s => {
          const sm = exam.studentMarks.find(r => (typeof r.student === 'string' ? r.student : (r.student as any)?._id) === s.id);
          remarks[s.id] = sm?.remarks || '';
          grades[s.id]  = {};
          exam.subjects.forEach(sub => {
            const g = sm?.marks.find(m => m.subject === sub.name);
            grades[s.id][sub.name] = g !== undefined ? g.obtainedMarks : '';
          });
        });
        setStudentGrades(grades);
        setStudentRemarks(remarks);
        setValidationErrors({});
        setActiveStep('entry');
      }
    } catch { showToast('Failed to load exam details.', 'error'); }
  };

  const handleStudentGradeChange = (sid: string, subject: string, value: string, max: number) => {
    const numVal    = value === '' ? '' : Number(value);
    const isInvalid = numVal !== '' && (numVal < 0 || numVal > max);
    setStudentGrades(prev => ({ ...prev, [sid]: { ...(prev[sid] || {}), [subject]: numVal } }));
    setValidationErrors(prev => ({ ...prev, [sid]: { ...(prev[sid] || {}), [subject]: isInvalid } }));
  };

  const handleToggleLock = async (exam: ExamData) => {
    const newStatus = exam.status === 'locked' ? 'submitted' : 'locked';
    setLockingExamId(exam._id);
    try {
      const res  = await fetch(`${API_BASE}/marks/${exam._id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
      const data = await res.json();
      if (data.success) {
        showToast(`Exam ${newStatus === 'locked' ? 'locked' : 'unlocked'} successfully.`);
        loadExams();
        if (selectedExam?._id === exam._id) setSelectedExam({ ...selectedExam, status: newStatus });
      } else showToast(data.message || 'Failed.', 'error');
    } catch { showToast('Server connection failed.', 'error'); }
    finally  { setLockingExamId(null); }
  };

  const handleDeleteExam = useCallback(async (examId: string, examName: string) => {
    if (!window.confirm(`Delete exam "${examName}"? This cannot be undone.`)) return;
    setDeletingExamId(examId);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const res  = await fetch(`${API_BASE}/marks/${examId}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (res.ok && data.success) { showToast(`Exam deleted.`, 'success'); setExamsList(prev => prev.filter(e => e._id !== examId)); }
      else showToast(data.message || 'Failed.', 'error');
    } catch { showToast('Server connection failed.', 'error'); }
    finally  { setDeletingExamId(null); }
  }, [showToast]);

  // ── Advance from "Exam & Classes" to "Subjects & Marks" ───────────────────
  const handleNextWizardStep = () => {
    if (!examName.trim()) { showToast('Exam name is required.', 'error'); return; }
    if (!applyGlobally && selectedRooms.length === 0) { showToast('Select at least one class room.', 'error'); return; }
    setWizardStep(2);
  };

  // ── Drag-to-reorder subjects ───────────────────────────────────────────────
  const handleSubjectDrop = (targetIndex: number) => {
    if (dragSubjectIndex === null || dragSubjectIndex === targetIndex) { setDragSubjectIndex(null); return; }
    const list = [...examSubjects];
    const [moved] = list.splice(dragSubjectIndex, 1);
    list.splice(targetIndex, 0, moved);
    setExamSubjects(list);
    setDragSubjectIndex(null);
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examName.trim()) { showToast('Exam name is required.', 'error'); return; }
    if (examSubjects.some(s => !s.name.trim() || Number(s.totalMarks) <= 0)) { showToast('Each subject needs a name and max marks > 0.', 'error'); return; }
    let targetRooms: string[] = [];
    if (applyGlobally) {
      const rooms = Array.from(new Set(students.map(s => `${s.class}-${s.section.toUpperCase()}`)));
      targetRooms = rooms.length > 0 ? rooms : ['10-A', '10-B', '9-A', '9-B'];
    } else {
      if (selectedRooms.length === 0) { showToast('Select at least one class room.', 'error'); return; }
      targetRooms = selectedRooms;
    }
    setSaving(true);
    let successCount = 0;
    const failMessages: string[] = [];
    await Promise.all(targetRooms.map(async room => {
      const sectionTeacher = teachers.find(t => t.assignedClass?.split(',').map(s => s.trim().toUpperCase()).includes(room.toUpperCase()));
      if (!sectionTeacher) { failMessages.push(`${room}: No teacher assigned.`); return; }
      const payload = { examName: examName.trim(), examType, classTeacherId: sectionTeacher._id, class: room, subjects: examSubjects.map(s => ({ name: s.name.trim(), totalMarks: Number(s.totalMarks) })), studentMarks: [] };
      try {
        const token = getAccessToken();
        const headers: HeadersInit = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
        const res  = await fetch(`${API_BASE}/marks`, { method: 'POST', headers, body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) successCount++; else failMessages.push(`${room}: ${data.message || 'Unknown error'}`);
      } catch { failMessages.push(`${room}: Connection failed.`); }
    }));
    if (successCount > 0) {
      showToast(`Exam created for ${successCount} class room(s).`);
      setExamName(''); setExamType('regular'); setExamDescription('');
      setExamSubjects([{ name: '', totalMarks: 100 }]); setWizardStep(1);
      setShowCreateDrawer(false); loadExams();
    }
    if (failMessages.length > 0) showToast(`Errors: ${failMessages.join(', ')}`, 'error');
    setSaving(false);
  };

  const handleSubmitGrades = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExam || !assignedTeacher) return;
    const hasErrors = Object.values(validationErrors).some(se => Object.values(se).some(Boolean));
    if (hasErrors) { showToast('Correct input errors before saving.', 'error'); return; }
    setSaving(true);
    const payload = {
      examName: selectedExam.examName, classTeacherId: assignedTeacher._id, class: roomName, subjects: selectedExam.subjects,
      studentMarks: classStudents.map(s => {
        const grades = studentGrades[s.id] || {};
        return { studentId: s.id, marks: selectedExam.subjects.map(sub => ({ subject: sub.name, obtainedMarks: grades[sub.name] !== undefined && grades[sub.name] !== '' ? Number(grades[sub.name]) : 0 })), remarks: studentRemarks[s.id] || '' };
      }),
    };
    try {
      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const res  = await fetch(`${API_BASE}/marks`, { method: 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) { showToast('Grades saved successfully.'); setActiveStep('list'); setSelectedExam(null); loadExams(); }
      else showToast(data.message || 'Failed.', 'error');
    } catch { showToast('Server connection failed.', 'error'); }
    finally { setSaving(false); }
  };

  const autoSaveGrades = async (): Promise<boolean> => {
    if (!selectedExam || !assignedTeacher) return false;
    const hasErrors = Object.values(validationErrors).some(se => Object.values(se).some(Boolean));
    if (hasErrors) { showToast('Correct input errors before generating report cards.', 'error'); return false; }
    const payload = {
      examName: selectedExam.examName, classTeacherId: assignedTeacher._id, class: roomName, subjects: selectedExam.subjects,
      studentMarks: classStudents.map(s => {
        const grades = studentGrades[s.id] || {};
        return { studentId: s.id, marks: selectedExam.subjects.map(sub => ({ subject: sub.name, obtainedMarks: grades[sub.name] !== undefined && grades[sub.name] !== '' ? Number(grades[sub.name]) : 0 })), remarks: studentRemarks[s.id] || '' };
      }),
    };
    try {
      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const res  = await fetch(`${API_BASE}/marks`, { method: 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json();
      return data.success;
    } catch {
      return false;
    }
  };

  const handleGenerateStudentPDF = async (student: StudentData) => {
    if (!selectedExam) return;
    setGeneratingStudentId(student.id);
    try {
      const saved = await autoSaveGrades();
      if (!saved) {
        showToast('Failed to auto-save grades/remarks.', 'error');
        return;
      }
      await handleLoadExamDetails(selectedExam._id);
      await uploadSingleStudentReportPDF(selectedExam, student, studentRemarks, assignedTeacher?.name || 'Class Teacher');
      showToast(`Report card generated for ${student.name}!`);
      await handleLoadExamDetails(selectedExam._id);
    }
    catch (err: any) { showToast(err.message || 'Generation failed', 'error'); }
    finally { setGeneratingStudentId(null); }
  };

  const handleDownloadBulkPDF = async () => {
    if (!selectedExam || classStudents.length === 0) { showToast('No students found.', 'error'); return; }
    try {
      const saved = await autoSaveGrades();
      if (!saved) {
        showToast('Failed to auto-save grades/remarks before bulk download.', 'error');
        return;
      }
      await handleLoadExamDetails(selectedExam._id);
      await generateReportCardPDF(selectedExam, classStudents, studentRemarks, assignedTeacher?.name || 'Class Teacher');
      showToast('Bulk PDF downloaded!');
    }
    catch (err) { console.error(err); showToast('Failed to generate PDF.', 'error'); }
  };

  const handleDownloadSinglePDF = async (student: StudentData) => {
    if (!selectedExam) return;
    try {
      const saved = await autoSaveGrades();
      if (!saved) {
        showToast('Failed to auto-save grades/remarks.', 'error');
        return;
      }
      await handleLoadExamDetails(selectedExam._id);
      await generateSingleStudentReportPDF(selectedExam, student, studentRemarks, assignedTeacher?.name || 'Class Teacher');
      showToast(`Downloaded for ${student.name}.`);
    }
    catch (err) { console.error(err); showToast('Failed.', 'error'); }
  };

  const handleUploadAndSharePDF = async (student: StudentData) => {
    if (!selectedExam) return;
    setSharingStudentId(student.id);
    try {
      const saved = await autoSaveGrades();
      if (!saved) {
        showToast('Failed to auto-save grades/remarks.', 'error');
        return;
      }
      await handleLoadExamDetails(selectedExam._id);
      const url = await uploadSingleStudentReportPDF(selectedExam, student, studentRemarks, assignedTeacher?.name || 'Class Teacher');
      showToast(`PDF uploaded! Link: ${url}`);
      await handleLoadExamDetails(selectedExam._id);
    }
    catch (err: any) { showToast(err.message || 'Upload failed', 'error'); }
    finally { setSharingStudentId(null); }
  };

  const handleSendWhatsAppAlert = async (student: StudentData, _pdfUrl: string) => {
    setSendingWhatsappId(student.id);
    const studentName = student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim();
    const permanentUrl = `${API_BASE}/report-card/view/${selectedExam?._id}/${student.id}`;
    const messageText = `Dear Parent, the report card for ${studentName} for "${selectedExam?.examName}" is ready: ${permanentUrl}`;
    try {
      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const res = await fetch(`${API_BASE}/messages/student/${student.id}/whatsapp`, { method: 'POST', headers, body: JSON.stringify({ text: messageText }) });
      const d   = await res.json();
      if (res.ok && d.success) showToast(`WhatsApp alert sent to ${studentName}'s parent!`);
      else throw new Error(d.message || 'Failed');
    } catch (err: any) { showToast(err.message || 'Failed.', 'error'); }
    finally { setSendingWhatsappId(null); }
  };

  const handleShowAnalytics = async (examId: string) => {
    setAnalyticsExamId(examId); setAnalyticsData(null); setLoadingAnalytics(true);
    try {
      const token = getAccessToken();
      const res  = await fetch(`${API_BASE}/marks/${examId}/analytics`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json();
      if (data.success) setAnalyticsData(data.data); else showToast(data.message || 'Failed.', 'error');
    } catch { showToast('Server connection failed.', 'error'); }
    finally { setLoadingAnalytics(false); }
  };

  const handleShowHistory = async (examId: string) => {
    setHistoryExamId(examId); setHistoryData(null); setLoadingHistoryData(true);
    try {
      const token = getAccessToken();
      const res  = await fetch(`${API_BASE}/marks/${examId}/history`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json();
      if (data.success) setHistoryData(data.data); else showToast(data.message || 'Failed.', 'error');
    } catch { showToast('Server connection failed.', 'error'); }
    finally { setLoadingHistoryData(false); }
  };

  // ─── Computed analytics ────────────────────────────────────────────────────
  const entryAnalytics = useMemo(() => {
    if (!selectedExam || classStudents.length === 0) return { avg: 0, top: 'N/A', passRate: 0 };
    let grandObt = 0, grandPoss = 0, passed = 0, highPct = -1, topName = 'N/A';
    classStudents.forEach(s => {
      const g = studentGrades[s.id] || {};
      let obt = 0, poss = 0;
      selectedExam.subjects.forEach(sub => { const v = g[sub.name]; if (v !== undefined && v !== '') obt += Number(v); poss += sub.totalMarks; });
      grandObt += obt; grandPoss += poss;
      const pct = poss > 0 ? (obt / poss) * 100 : 0;
      if (pct >= 40) passed++;
      if (pct > highPct) { highPct = pct; topName = s.name; }
    });
    return { avg: grandPoss > 0 ? Math.round((grandObt / grandPoss) * 100) : 0, top: highPct !== -1 ? `${topName} (${Math.round(highPct)}%)` : 'N/A', passRate: classStudents.length > 0 ? Math.round((passed / classStudents.length) * 100) : 0 };
  }, [selectedExam, classStudents, studentGrades]);

  const subjectStatsMap = useMemo(() => {
    const map: Record<string, { avg: number; max: number; min: number }> = {};
    if (!selectedExam) return map;
    selectedExam.subjects.forEach(sub => {
      let total = 0, max = 0, min = sub.totalMarks, count = 0;
      classStudents.forEach(s => { const v = (studentGrades[s.id] || {})[sub.name]; if (v !== undefined && v !== '') { const m = Number(v); total += m; if (m > max) max = m; if (m < min) min = m; count++; } });
      map[sub.name] = { avg: count > 0 ? Math.round(total / count) : 0, max: count > 0 ? max : 0, min: count > 0 ? min : 0 };
    });
    return map;
  }, [selectedExam, classStudents, studentGrades]);

  // KPI counts
  const kpiLocked    = examsList.filter(e => e.status === 'locked').length;
  const kpiCompleted = examsList.filter(e => e.studentMarks?.length > 0).length;
  const kpiPending   = examsList.filter(e => !e.studentMarks?.length).length;

  const goBackToList = () => { setActiveStep('list'); setSelectedExam(null); setShowHistory(false); };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 font-sans text-slate-900 dark:text-white">

      {/* ═══════════════════════ LIST VIEW (stays visible behind the New Exam drawer) ══ */}
      {activeStep === 'list' && (
        <>
          {/* Page title bar with class/section selector inline — eliminates a separate filter block */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[22px] font-extrabold text-slate-900 dark:text-white tracking-tight">Exams &amp; Marks</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">Define exam templates, enter marks, and issue report cards.</p>
            </div>
            {/* Class / section switchers live next to the heading — context filters adjacent to content */}
            <div className="flex items-center gap-2 flex-wrap">
              <select className="h-8 pl-2 pr-7 border border-slate-200 dark:border-slate-600 rounded-md text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
                value={selectedClass}
                onChange={e => { const v = e.target.value; setSelectedClass(v); const secs = classesList.filter(c => c.className === v).map(c => c.section); if (secs.length > 0) setSelectedSection(secs[0]); }}>
                {classOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select className="h-8 pl-2 pr-7 border border-slate-200 dark:border-slate-600 rounded-md text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
                value={selectedSection} onChange={e => setSelectedSection(e.target.value)}>
                {sectionOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span className="h-8 flex items-center px-2.5 text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-md">{roomName}</span>
              <Button onClick={() => {
                setExamName(''); setExamType('regular'); setExamDescription('');
                setExamSubjects([{ name: '', totalMarks: 100 }]);
                setSelectedRooms([roomName]); setApplyGlobally(false);
                setWizardStep(1); setShowCreateDrawer(true);
              }}>
                <Plus size={14} /> New Exam
              </Button>
            </div>
          </div>

          {/* Compact stat strip — 4 numbers, not 4 large cards */}
          <div className="grid grid-cols-4 gap-3 max-[700px]:grid-cols-2">
            {[
              { label: 'Total Exams', value: examsList.length, icon: <ClipboardList size={15} />, color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200' },
              { label: 'Grades Registered', value: kpiCompleted, icon: <CheckCircle size={15} />, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
              { label: 'Locked', value: kpiLocked, icon: <Lock size={15} />, color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' },
              { label: 'Pending Entry', value: kpiPending, icon: <AlertTriangle size={15} />, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
            ].map(stat => (
              <div key={stat.label} className={`flex items-center gap-3 p-3.5 rounded-lg border bg-white ${stat.border}`}>
                <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${stat.bg} ${stat.color}`}>{stat.icon}</div>
                <div>
                  <div className={`text-xl font-extrabold leading-none ${stat.color}`}>{stat.value}</div>
                  <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Exams table — desktop/tablet */}
          <div className="hidden md:block">
            <DataTable card
              header={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Exam Registers — {roomName}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">{examsList.length} record{examsList.length !== 1 ? 's' : ''}</span>
                </div>
              }
            >
              <thead>
                <tr>
                  <Th>Exam Name</Th>
                  <Th>Teacher</Th>
                  <Th>Subjects</Th>
                  <Th>Status</Th>
                  <Th className="text-right pr-5">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {loadingList ? (
                  <tr><Td colSpan={5}><div className="py-10 flex justify-center"><LoadingSpinner /></div></Td></tr>
                ) : examsList.length === 0 ? (
                  <tr><Td colSpan={5}>
                    <EmptyState icon={<BookOpen size={32} />} title={`No exam registers for ${roomName}.`} subtitle="Create a template with the 'New Exam' button above." className="py-12" />
                  </Td></tr>
                ) : examsList.map(ex => {
                  const isCompleted = ex.studentMarks?.length > 0;
                  const isLocked    = ex.status === 'locked';
                  const teacherName = typeof ex.classTeacher === 'object' ? ex.classTeacher?.name : (teachers.find(t => t._id === ex.classTeacher)?.name || '—');
                  return (
                    <Tr key={ex._id}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: isLocked ? '#94a3b8' : isCompleted ? '#10b981' : '#f59e0b' }} />
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white text-sm">{ex.examName}</div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 capitalize">{ex.examType || 'regular'}</div>
                          </div>
                        </div>
                      </Td>
                      <Td><span className="text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">{teacherName}</span></Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {ex.subjects.slice(0, 3).map(s => <span key={s.name} className="text-[11px] bg-slate-100 text-slate-600 dark:text-slate-400 dark:text-slate-500 px-1.5 py-0.5 rounded font-medium">{s.name}</span>)}
                          {ex.subjects.length > 3 && <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">+{ex.subjects.length - 3} more</span>}
                        </div>
                      </Td>
                      <Td>
                        {isLocked
                          ? <Badge variant="gray" size="sm"><Lock size={10} className="mr-0.5" />Locked</Badge>
                          : isCompleted
                            ? <Badge variant="green" size="sm"><CheckCircle size={10} className="mr-0.5" />Grades Registered</Badge>
                            : <Badge variant="amber" size="sm"><AlertTriangle size={10} className="mr-0.5" />Pending Entry</Badge>}
                      </Td>
                      <Td>
                        {/* Primary CTA left, secondary icon group right */}
                        <div className="flex items-center justify-end gap-1.5">
                          <Button size="sm" variant={isCompleted ? 'secondary' : 'primary'} onClick={() => handleLoadExamDetails(ex._id)}>
                            {isCompleted ? 'View / Edit Grades' : 'Enter Marks'}
                          </Button>
                          {/* Compact secondary icon cluster */}
                          {isCompleted && (
                            <button className={iconActionBtn(isLocked ? 'text-emerald-600' : 'text-red-500', isLocked ? 'border-emerald-200' : 'border-red-200', isLocked ? 'hover:bg-emerald-50' : 'hover:bg-red-50')}
                              disabled={lockingExamId === ex._id} onClick={() => handleToggleLock(ex)} title={isLocked ? 'Unlock' : 'Lock'}>
                              {lockingExamId === ex._id ? <Loader2 size={13} className="animate-spin" /> : isLocked ? <Unlock size={13} /> : <Lock size={13} />}
                            </button>
                          )}
                          {isCompleted && (
                            <button className={iconActionBtn('text-blue-600', 'border-blue-200', 'hover:bg-blue-50')} onClick={() => handleShowAnalytics(ex._id)} title="Class analytics">
                              <BarChart2 size={13} />
                            </button>
                          )}
                          <button className={iconActionBtn('text-violet-600', 'border-violet-200', 'hover:bg-violet-50')} onClick={() => handleShowHistory(ex._id)} title="Edit history">
                            <History size={13} />
                          </button>
                          <button className={iconActionBtn('text-red-500', 'border-red-200', 'hover:bg-red-50')} disabled={deletingExamId === ex._id} onClick={() => handleDeleteExam(ex._id, ex.examName)} title="Delete">
                            {deletingExamId === ex._id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </button>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </DataTable>
          </div>

          {/* Exams — mobile cards */}
          <div className="md:hidden flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Exam Registers — {roomName}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">{examsList.length} record{examsList.length !== 1 ? 's' : ''}</span>
            </div>
            {loadingList ? (
              <div className="bg-white border border-slate-200 rounded-lg shadow-card py-10 flex justify-center"><LoadingSpinner /></div>
            ) : examsList.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg shadow-card">
                <EmptyState icon={<BookOpen size={32} />} title={`No exam registers for ${roomName}.`} subtitle="Create a template with the 'New Exam' button above." className="py-12" />
              </div>
            ) : (
              <MobileCardList>
                {examsList.map(ex => {
                  const isCompleted = ex.studentMarks?.length > 0;
                  const isLocked    = ex.status === 'locked';
                  const teacherName = typeof ex.classTeacher === 'object' ? ex.classTeacher?.name : (teachers.find(t => t._id === ex.classTeacher)?.name || '—');
                  return (
                    <MobileRowCard
                      key={ex._id}
                      title={ex.examName}
                      subtitle={`${teacherName} · ${ex.examType || 'regular'}`}
                      badge={
                        isLocked
                          ? <Badge variant="gray" size="sm"><Lock size={10} className="mr-0.5" />Locked</Badge>
                          : isCompleted
                            ? <Badge variant="green" size="sm"><CheckCircle size={10} className="mr-0.5" />Grades Registered</Badge>
                            : <Badge variant="amber" size="sm"><AlertTriangle size={10} className="mr-0.5" />Pending Entry</Badge>
                      }
                      fields={[
                        { label: 'Subjects', value: ex.subjects.map(s => s.name).join(', '), fullWidth: true },
                      ]}
                      actions={
                        <>
                          <Button size="sm" variant={isCompleted ? 'secondary' : 'primary'} onClick={() => handleLoadExamDetails(ex._id)}>
                            {isCompleted ? 'View / Edit Grades' : 'Enter Marks'}
                          </Button>
                          {isCompleted && (
                            <button className={iconActionBtn(isLocked ? 'text-emerald-600' : 'text-red-500', isLocked ? 'border-emerald-200' : 'border-red-200', isLocked ? 'hover:bg-emerald-50' : 'hover:bg-red-50') + ' !h-11 !w-11'}
                              disabled={lockingExamId === ex._id} onClick={() => handleToggleLock(ex)} title={isLocked ? 'Unlock' : 'Lock'}>
                              {lockingExamId === ex._id ? <Loader2 size={14} className="animate-spin" /> : isLocked ? <Unlock size={14} /> : <Lock size={14} />}
                            </button>
                          )}
                          {isCompleted && (
                            <button className={iconActionBtn('text-blue-600', 'border-blue-200', 'hover:bg-blue-50') + ' !h-11 !w-11'} onClick={() => handleShowAnalytics(ex._id)} title="Class analytics">
                              <BarChart2 size={14} />
                            </button>
                          )}
                          <button className={iconActionBtn('text-violet-600', 'border-violet-200', 'hover:bg-violet-50') + ' !h-11 !w-11'} onClick={() => handleShowHistory(ex._id)} title="Edit history">
                            <History size={14} />
                          </button>
                          <button className={iconActionBtn('text-red-500', 'border-red-200', 'hover:bg-red-50') + ' !h-11 !w-11'} disabled={deletingExamId === ex._id} onClick={() => handleDeleteExam(ex._id, ex.examName)} title="Delete">
                            {deletingExamId === ex._id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </>
                      }
                    />
                  );
                })}
              </MobileCardList>
            )}
          </div>
        </>
      )}

      {/* ── Define New Exam Template Drawer — two-step wizard (matches Teacher portal) ─── */}
      <Drawer
        isOpen={showCreateDrawer}
        onClose={() => setShowCreateDrawer(false)}
        title="Define New Exam Template"
        subtitle="Create a new exam register for one or more classes."
        footer={
          wizardStep === 1 ? (
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1 justify-center" onClick={() => setShowCreateDrawer(false)}>Cancel</Button>
              <Button type="button" className="flex-1 justify-center" onClick={handleNextWizardStep}>
                Next: Add Subjects &amp; Marks <ArrowRight size={14} />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1 justify-center" onClick={() => setWizardStep(1)}>
                <ArrowLeft size={14} /> Back
              </Button>
              <Button type="submit" form="admin-exam-template-form" className="flex-1 justify-center" disabled={saving}>
                {saving ? 'Creating…' : <>Create Exam Template <CheckCircle size={14} /></>}
              </Button>
            </div>
          )
        }
      >
        <div className="flex flex-col gap-4">
          <WizardStepIndicator step={wizardStep} />

          <form id="admin-exam-template-form" onSubmit={handleCreateTemplate} className="flex flex-col gap-4">
            {wizardStep === 1 ? (
              <>
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <SectionHeading icon={<FileText size={17} />} title="Exam Details" />
                  <div className="p-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className={labelCls}>Exam Type</label>
                      <select className={selectCls} value={examType} onChange={e => setExamType(e.target.value as any)}>
                        <option value="regular">Regular Exam</option>
                        <option value="middle">Middle Exam</option>
                        <option value="final">Final Exam</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className={labelCls}>Exam Term Name</label>
                      <input type="text" placeholder="e.g. Unit Test 1, Half Yearly, Annual Exam" className={inputCls} required
                        value={examName} onChange={e => setExamName(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className={labelCls}>Exam Description (Optional)</label>
                      <textarea
                        className="w-full min-h-[80px] px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all font-[inherit] resize-none"
                        placeholder="Add a short description about this exam..."
                        maxLength={200}
                        value={examDescription}
                        onChange={e => setExamDescription(e.target.value)}
                      />
                      <span className="self-end text-2xs text-slate-400">{examDescription.length} / 200</span>
                    </div>

                    {/* Apply Globally — prominent toggle row with description */}
                    <label className={cn(
                      'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors select-none',
                      applyGlobally ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    )}>
                      <input type="checkbox" className="w-4 h-4 accent-blue-600 mt-0.5 flex-shrink-0" checked={applyGlobally} onChange={e => setApplyGlobally(e.target.checked)} />
                      <div>
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-100 font-bold">Apply to all classes &amp; sections</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {applyGlobally ? 'This exam will be created for every enrolled class room automatically.' : 'Uncheck to hand-pick individual class rooms below.'}
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {!applyGlobally && (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <SectionHeading icon={<Users size={17} />} title="Select Class Rooms" subtitle="Choose one or more class rooms" />
                    <div className="p-4 grid grid-cols-2 gap-2.5">
                      {roomOptions.map((room) => {
                        const checked = selectedRooms.includes(room.value);
                        return (
                          <label key={room.value} className={cn(
                            'flex flex-col gap-1.5 px-3 py-2.5 rounded-lg border-2 cursor-pointer transition-colors select-none',
                            checked ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600'
                          )}>
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="w-4 h-4 accent-blue-600 flex-shrink-0"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedRooms([...selectedRooms, room.value]);
                                  else setSelectedRooms(selectedRooms.filter(r => r !== room.value));
                                }}
                              />
                              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{room.label}</span>
                            </div>
                            {checked && <Badge variant="blue" size="sm" className="w-fit">Selected</Badge>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <SectionHeading icon={<BookOpen size={17} />} title="Add Subjects & Maximum Marks" subtitle="Add subjects and set maximum marks for each subject." />
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex gap-2 px-1">
                    <span className={cn(labelCls, 'flex-[2]')}>Subject Name</span>
                    <span className={cn(labelCls, 'w-24 flex-shrink-0')}>Max Marks</span>
                  </div>
                  {examSubjects.map((subject, index) => (
                    <div
                      key={index}
                      className={cn('flex flex-col gap-2 rounded-md transition-opacity', dragSubjectIndex === index && 'opacity-40')}
                      draggable={examSubjects.length > 1}
                      onDragStart={() => setDragSubjectIndex(index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleSubjectDrop(index)}
                      onDragEnd={() => setDragSubjectIndex(null)}
                    >
                      <div className="flex gap-2 items-center">
                        {examSubjects.length > 1 && (
                          <GripVertical size={15} className="text-slate-300 dark:text-slate-600 cursor-grab flex-shrink-0" />
                        )}
                        <SubjectNameInput
                          className="flex-[2]"
                          value={subject.name}
                          excludeNames={examSubjects.filter((_, i) => i !== index).map(s => s.name)}
                          onChange={(val) => {
                            const list = [...examSubjects];
                            list[index] = { ...list[index], name: val };
                            setExamSubjects(list);
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max Marks"
                          className={cn(inputCls, 'w-24 flex-shrink-0')}
                          required
                          min={1}
                          value={subject.totalMarks || ''}
                          onChange={(e) => {
                            const list = [...examSubjects];
                            list[index] = { ...list[index], totalMarks: Number(e.target.value) };
                            setExamSubjects(list);
                          }}
                        />
                        {examSubjects.length > 1 && (
                          <button type="button" className="w-8 h-8 flex items-center justify-center rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors flex-shrink-0"
                            title="Remove subject"
                            onClick={() => setExamSubjects(examSubjects.filter((_, i) => i !== index))}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  <button type="button" className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-md border border-dashed border-blue-200 dark:border-blue-800 text-sm font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                    onClick={() => setExamSubjects([...examSubjects, { name: '', totalMarks: 100 }])}>
                    <Plus size={14} /> Add Subject
                  </button>

                  {examSubjects.length > 1 && (
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-md text-xs text-blue-700 dark:text-blue-400">
                      <Info size={14} className="flex-shrink-0 mt-0.5" />
                      You can reorder subjects by dragging them.
                    </div>
                  )}
                </div>
              </div>
            )}
          </form>
        </div>
      </Drawer>

      {/* ═══════════════════════ GRADE ENTRY ═════════════════════════════════ */}
      {activeStep === 'entry' && selectedExam && (
        <div className="flex flex-col gap-4">
          {/* Sticky command bar — slim, always visible while scrolling */}
          <div className="sticky top-0 z-20 -mx-1 px-1">
            <div className="bg-white dark:bg-slate-800/95 backdrop-blur border border-slate-200 dark:border-slate-600 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-3">
                <button onClick={goBackToList} className="flex items-center gap-1 text-sm font-medium text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300 transition-colors">
                  <ArrowLeft size={14} /> Back
                </button>
                <div className="w-px h-5 bg-slate-200" />
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{selectedExam.examName}</div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                    <span>{roomName}</span>
                    {assignedTeacher && <><span>·</span><span>{assignedTeacher.name}</span></>}
                    {selectedExam.lastEditedAt && <><span>·</span><span className="flex items-center gap-0.5"><Clock size={10} />{new Date(selectedExam.lastEditedAt).toLocaleDateString()}</span></>}
                  </div>
                </div>
              </div>
              {/* Inline stats — compact, always visible */}
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1.5">
                  <TrendingUp size={13} className="text-violet-500" />
                  <span className="font-bold text-violet-700">{entryAnalytics.avg}%</span>
                  <span className="text-slate-400 dark:text-slate-500 text-xs">avg</span>
                </div>
                <div className="w-px h-4 bg-slate-200" />
                <div className="flex items-center gap-1.5">
                  <CheckCircle size={13} className="text-emerald-500" />
                  <span className="font-bold text-emerald-700">{entryAnalytics.passRate}%</span>
                  <span className="text-slate-400 dark:text-slate-500 text-xs">pass</span>
                </div>
                <div className="w-px h-4 bg-slate-200" />
                <div className="flex items-center gap-1.5">
                  <GraduationCap size={13} className="text-blue-500" />
                  <span className="font-bold text-slate-700 dark:text-slate-300 truncate max-w-[120px] text-xs">{entryAnalytics.top}</span>
                </div>
              </div>
              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  className={cn('flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-bold transition-colors',
                    selectedExam.status === 'locked' ? 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' : 'text-red-500 border-red-200 hover:bg-red-50')}
                  disabled={lockingExamId === selectedExam._id} onClick={() => handleToggleLock(selectedExam)}>
                  {lockingExamId === selectedExam._id ? <Loader2 size={12} className="animate-spin" /> : selectedExam.status === 'locked' ? <Unlock size={12} /> : <Lock size={12} />}
                  {selectedExam.status === 'locked' ? 'Unlock' : 'Lock Exam'}
                </button>
                <Button size="sm" variant="secondary" onClick={handleDownloadBulkPDF}>
                  <FileDown size={13} /> Bulk PDF
                </Button>
              </div>
            </div>
          </div>

          {/* Grade entry form + subject stats */}
          <form onSubmit={handleSubmitGrades} className="flex flex-col gap-4">
            {/* Desktop/tablet grade sheet */}
            <div className="hidden md:block">
            <DataTable card
              header={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Student Grade Sheet</span>
                  <div className="flex items-center gap-2">
                    {selectedExam.status === 'locked' && (
                      <span className="flex items-center gap-1 text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                        <Lock size={10} /> Locked
                      </span>
                    )}
                    <span className="text-xs text-slate-400 dark:text-slate-500">{classStudents.length} students</span>
                  </div>
                </div>
              }
            >
              <thead>
                <tr>
                  <Th className="w-24">Adm. ID</Th>
                  <Th>Student</Th>
                  {selectedExam.subjects.map(sub => (
                    <Th key={sub.name} className="text-center whitespace-nowrap">
                      <div>{sub.name}</div>
                      <div className="text-[10px] font-normal normal-case text-slate-400 dark:text-slate-500">/{sub.totalMarks}</div>
                    </Th>
                  ))}
                  <Th className="min-w-[180px]">Remarks</Th>
                  <Th className="text-center whitespace-nowrap">Report Card</Th>
                </tr>
              </thead>
              <tbody>
                {classStudents.length === 0 ? (
                  <tr><Td colSpan={4 + selectedExam.subjects.length}>
                    <EmptyState icon={<Users size={32} />} title={`No students in Class ${roomName}.`} className="py-10" />
                  </Td></tr>
                ) : classStudents.map((s, rowIdx) => {
                  const sRecord = selectedExam.studentMarks.find(sm => (typeof sm.student === 'string' ? sm.student : (sm.student as any)?._id) === s.id);
                  const hasPdf  = !!sRecord?.pdfUrl;
                  return (
                    <Tr key={s.id} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <Td className="font-mono text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{s.admissionNo}</Td>
                      <Td>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{s.name}</span>
                      </Td>
                      {selectedExam.subjects.map((sub, subIdx) => {
                        const val   = (studentGrades[s.id] || {})[sub.name];
                        const isErr = (validationErrors[s.id] || {})[sub.name] || false;
                        return (
                          <Td key={sub.name} className="text-center p-1.5">
                            <input
                              type="number"
                              // Tab moves right across subjects, then wraps to next student
                              tabIndex={rowIdx * selectedExam.subjects.length + subIdx + 1}
                              className={cn(
                                'w-16 h-8 text-center border rounded-md text-sm font-bold outline-none transition-all font-[inherit] mx-auto block',
                                isErr
                                  ? 'border-red-400 bg-red-50 text-red-700 focus:ring-1 focus:ring-red-200'
                                  : val !== '' && val !== undefined
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 focus:ring-1 focus:ring-emerald-200 focus:border-emerald-500'
                                    : 'border-slate-200 bg-white text-slate-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'
                              )}
                              placeholder="—"
                              value={val !== undefined ? val : ''}
                              onChange={e => handleStudentGradeChange(s.id, sub.name, e.target.value, sub.totalMarks)}
                              disabled={selectedExam.status === 'locked'}
                            />
                          </Td>
                        );
                      })}
                      <Td className="p-1.5">
                        <input type="text" className="h-8 px-2.5 w-full border border-slate-200 dark:border-slate-600 rounded-md text-xs outline-none focus:border-blue-400 transition-colors font-[inherit]"
                          placeholder={selectedExam.status === 'locked' ? 'Locked' : 'Add remarks…'}
                          value={studentRemarks[s.id] || ''} onChange={e => setStudentRemarks(prev => ({ ...prev, [s.id]: e.target.value }))}
                          disabled={selectedExam.status === 'locked'} />
                      </Td>
                      {/* Context-aware report card column: fewer buttons = less cognitive load */}
                      <Td className="p-1.5">
                        <div className="flex items-center gap-1 justify-center">
                          {!hasPdf ? (
                            /* No PDF yet — show Generate as the only action */
                            <Button size="sm" type="button" disabled={generatingStudentId === s.id} onClick={() => handleGenerateStudentPDF(s)}>
                              {generatingStudentId === s.id ? <Loader2 size={11} className="animate-spin" /> : null}
                              Generate
                            </Button>
                          ) : (
                            /* PDF exists — show status chip + action icons */
                            <>
                              <span className="flex items-center gap-0.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full mr-1">
                                <CheckCircle size={10} /> PDF
                              </span>
                              <button className={iconActionBtn('text-slate-500', 'border-slate-200', 'hover:bg-slate-50')} title="Download" onClick={() => handleDownloadSinglePDF(s)}>
                                <Download size={12} />
                              </button>
                              <button className={iconActionBtn('text-blue-600', 'border-blue-200', 'hover:bg-blue-50')} title="Preview" onClick={() => { setPreviewUrl(sRecord!.pdfUrl!); setPreviewStudentName(s.name); }}>
                                <Eye size={12} />
                              </button>
                              <button className={iconActionBtn('text-[#25d366]', 'border-green-200', 'hover:bg-green-50')}
                                title="Send WhatsApp" disabled={sendingWhatsappId === s.id}
                                onClick={() => handleSendWhatsAppAlert(s, sRecord!.pdfUrl!)}>
                                {sendingWhatsappId === s.id ? <Loader2 size={12} className="animate-spin" /> : <MessageCircle size={12} />}
                              </button>
                              <button className={iconActionBtn('text-emerald-600', 'border-emerald-200', 'hover:bg-emerald-50')}
                                title="Upload & share" disabled={sharingStudentId === s.id}
                                onClick={() => handleUploadAndSharePDF(s)}>
                                {sharingStudentId === s.id ? <Loader2 size={12} className="animate-spin" /> : <Share2 size={12} />}
                              </button>
                            </>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </DataTable>
            </div>

            {/* Mobile grade-entry cards */}
            <div className="md:hidden flex flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Student Grade Sheet</span>
                <div className="flex items-center gap-2">
                  {selectedExam.status === 'locked' && (
                    <span className="flex items-center gap-1 text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                      <Lock size={10} /> Locked
                    </span>
                  )}
                  <span className="text-xs text-slate-400 dark:text-slate-500">{classStudents.length} students</span>
                </div>
              </div>
              {classStudents.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-lg shadow-card">
                  <EmptyState icon={<Users size={32} />} title={`No students in Class ${roomName}.`} className="py-10" />
                </div>
              ) : (
                <MobileCardList>
                  {classStudents.map((s) => {
                    const sRecord = selectedExam.studentMarks.find(sm => (typeof sm.student === 'string' ? sm.student : (sm.student as any)?._id) === s.id);
                    const hasPdf  = !!sRecord?.pdfUrl;
                    return (
                      <MobileRowCard
                        key={s.id}
                        title={s.name}
                        subtitle={`Adm: ${s.admissionNo}`}
                        fields={[
                          ...selectedExam.subjects.map(sub => {
                            const val   = (studentGrades[s.id] || {})[sub.name];
                            const isErr = (validationErrors[s.id] || {})[sub.name] || false;
                            return {
                              label: `${sub.name} (/${sub.totalMarks})`,
                              value: (
                                <input
                                  type="number"
                                  className={cn(
                                    'w-full h-10 text-center border rounded-md text-sm font-bold outline-none transition-all font-[inherit]',
                                    isErr
                                      ? 'border-red-400 bg-red-50 text-red-700 focus:ring-1 focus:ring-red-200'
                                      : val !== '' && val !== undefined
                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 focus:ring-1 focus:ring-emerald-200 focus:border-emerald-500'
                                        : 'border-slate-200 bg-white text-slate-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'
                                  )}
                                  placeholder="—"
                                  value={val !== undefined ? val : ''}
                                  onChange={e => handleStudentGradeChange(s.id, sub.name, e.target.value, sub.totalMarks)}
                                  disabled={selectedExam.status === 'locked'}
                                />
                              ),
                            };
                          }),
                          {
                            label: 'Remarks',
                            fullWidth: true,
                            value: (
                              <input type="text" className="h-10 px-2.5 w-full border border-slate-200 dark:border-slate-600 rounded-md text-sm outline-none focus:border-blue-400 transition-colors font-[inherit]"
                                placeholder={selectedExam.status === 'locked' ? 'Locked' : 'Add remarks…'}
                                value={studentRemarks[s.id] || ''} onChange={e => setStudentRemarks(prev => ({ ...prev, [s.id]: e.target.value }))}
                                disabled={selectedExam.status === 'locked'} />
                            ),
                          },
                        ]}
                        actions={
                          !hasPdf ? (
                            <Button size="sm" type="button" disabled={generatingStudentId === s.id} onClick={() => handleGenerateStudentPDF(s)} className="w-full justify-center">
                              {generatingStudentId === s.id ? <Loader2 size={13} className="animate-spin" /> : null}
                              Generate Report Card
                            </Button>
                          ) : (
                            <>
                              <span className="flex items-center gap-0.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1.5 rounded-full">
                                <CheckCircle size={11} /> PDF Ready
                              </span>
                              <button className={iconActionBtn('text-slate-500', 'border-slate-200', 'hover:bg-slate-50') + ' !h-11 !w-11'} title="Download" onClick={() => handleDownloadSinglePDF(s)}>
                                <Download size={14} />
                              </button>
                              <button className={iconActionBtn('text-blue-600', 'border-blue-200', 'hover:bg-blue-50') + ' !h-11 !w-11'} title="Preview" onClick={() => { setPreviewUrl(sRecord!.pdfUrl!); setPreviewStudentName(s.name); }}>
                                <Eye size={14} />
                              </button>
                              <button className={iconActionBtn('text-[#25d366]', 'border-green-200', 'hover:bg-green-50') + ' !h-11 !w-11'}
                                title="Send WhatsApp" disabled={sendingWhatsappId === s.id}
                                onClick={() => handleSendWhatsAppAlert(s, sRecord!.pdfUrl!)}>
                                {sendingWhatsappId === s.id ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
                              </button>
                              <button className={iconActionBtn('text-emerald-600', 'border-emerald-200', 'hover:bg-emerald-50') + ' !h-11 !w-11'}
                                title="Upload & share" disabled={sharingStudentId === s.id}
                                onClick={() => handleUploadAndSharePDF(s)}>
                                {sharingStudentId === s.id ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
                              </button>
                            </>
                          )
                        }
                      />
                    );
                  })}
                </MobileCardList>
              )}
            </div>

            {/* Subject Performance — compact summary table */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500">Subject Performance Summary</h3>
              </div>
              {/* Desktop/tablet */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700">
                      <th className="px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Subject</th>
                      <th className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 text-center">Max</th>
                      <th className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 text-center">Avg</th>
                      <th className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 text-center">High</th>
                      <th className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 text-center">Low</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedExam.subjects.map(sub => {
                      const st = subjectStatsMap[sub.name] || { avg: 0, max: 0, min: 0 };
                      const avgPct = sub.totalMarks > 0 ? Math.round((st.avg / sub.totalMarks) * 100) : 0;
                      return (
                        <tr key={sub.name} className="border-b border-slate-50 hover:bg-slate-50 dark:bg-slate-900">
                          <td className="px-5 py-2.5 font-semibold text-slate-700 dark:text-slate-300">{sub.name}</td>
                          <td className="px-4 py-2.5 text-center text-slate-500 dark:text-slate-400 dark:text-slate-500">{sub.totalMarks}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={cn('font-bold', avgPct >= 60 ? 'text-emerald-700' : avgPct >= 40 ? 'text-amber-600' : 'text-red-600')}>{st.avg}</span>
                            <span className="text-slate-400 dark:text-slate-500 text-xs"> ({avgPct}%)</span>
                          </td>
                          <td className="px-4 py-2.5 text-center font-bold text-emerald-700">{st.max}</td>
                          <td className="px-4 py-2.5 text-center font-bold text-red-500">{st.min}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden p-3">
                <MobileCardList>
                  {selectedExam.subjects.map(sub => {
                    const st = subjectStatsMap[sub.name] || { avg: 0, max: 0, min: 0 };
                    const avgPct = sub.totalMarks > 0 ? Math.round((st.avg / sub.totalMarks) * 100) : 0;
                    return (
                      <MobileRowCard
                        key={sub.name}
                        title={sub.name}
                        subtitle={`Max marks: ${sub.totalMarks}`}
                        fields={[
                          { label: 'Average', value: <span className={cn('font-bold', avgPct >= 60 ? 'text-emerald-700' : avgPct >= 40 ? 'text-amber-600' : 'text-red-600')}>{st.avg} ({avgPct}%)</span> },
                          { label: 'Highest', value: <span className="font-bold text-emerald-700">{st.max}</span> },
                          { label: 'Lowest', value: <span className="font-bold text-red-500">{st.min}</span> },
                        ]}
                      />
                    );
                  })}
                </MobileCardList>
              </div>
            </div>

            {/* Save bar */}
            <div className="flex items-center gap-2 pb-4">
              <Button type="submit" disabled={saving || selectedExam.status === 'locked'}>
                <Save size={13} /> {saving ? 'Saving…' : 'Save & Overwrite Register'}
              </Button>
              {selectedExam.status === 'locked' && (
                <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 font-semibold"><Lock size={11} /> Unlock to enable edits</span>
              )}
              <Button type="button" variant="secondary" onClick={goBackToList}>Cancel</Button>
            </div>

            {/* Edit History Accordion */}
            {selectedExam.editHistory && selectedExam.editHistory.length > 0 && (
              <div className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
                <button type="button" onClick={() => setShowHistory(h => !h)}
                  className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 transition-colors text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-none cursor-pointer">
                  <span className="flex items-center gap-1.5">
                    <History size={13} /> Edit History ({(selectedExam.editHistory || []).length} change{(selectedExam.editHistory || []).length !== 1 ? 's' : ''})
                  </span>
                  {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showHistory && (
                  <div className="p-4 flex flex-col gap-2.5 bg-white dark:bg-slate-800">
                    {[...(selectedExam.editHistory || [])].reverse().map((entry, i) => {
                      const student = students.find(s => s.id === entry.studentId);
                      const sLabel  = student ? `${student.name} (${student.admissionNo})` : `Student #${String(entry.studentId)?.slice(-6)}`;
                      return (
                        <div key={i} className="p-3 bg-slate-50 dark:bg-slate-900 rounded-md border-l-3 border-violet-400">
                          <div className="flex justify-between mb-1">
                            <span className="font-bold text-xs text-violet-700">{entry.editedByName}</span>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">{new Date(entry.editedAt).toLocaleString()}</span>
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Student: <strong>{sLabel}</strong></div>
                          {entry.changes.map((c: any, j: number) => (
                            <div key={j} className="text-[11px] text-slate-500 dark:text-slate-400 pl-2">
                              • <strong>{c.subject}</strong>: {c.from} → {c.to}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </form>
        </div>
      )}

      {/* ════ ANALYTICS MODAL ════════════════════════════════════════════════ */}
      <Modal isOpen={!!analyticsExamId} onClose={() => setAnalyticsExamId(null)}
        title={`Analytics — ${analyticsData?.examName || '…'}`} maxWidth="800px">
        {loadingAnalytics ? <div className="py-10 flex justify-center"><LoadingSpinner /></div> :
         !analyticsData   ? <EmptyState icon={<BarChart2 size={32} />} title="Failed to load analytics." className="py-10" /> : (
          <div className="flex flex-col gap-5">
            {/* Compact stat pills */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Class Average', value: `${analyticsData.classAverage}%`, color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
                { label: 'Students',      value: analyticsData.studentsCount,      color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
                { label: 'Class Room',    value: analyticsData.class,              color: 'text-emerald-700',bg: 'bg-emerald-50 border-emerald-200' },
              ].map(s => (
                <div key={s.label} className={`flex flex-col p-3 rounded-lg border ${s.bg}`}>
                  <div className={`text-2xl font-extrabold ${s.color}`}>{s.value}</div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Subject Performance</h4>
              <DataTable card={false}>
                <thead><tr><Th>Subject</Th><Th className="text-center">Average</Th><Th className="text-center">Highest</Th><Th className="text-center">Lowest</Th></tr></thead>
                <tbody>{analyticsData.subjectStats.map(s => (
                  <Tr key={s.subject}><Td><strong>{s.subject}</strong></Td><Td className="text-center">{s.average}/{s.totalMarks}</Td><Td className="text-center font-bold text-emerald-700">{s.highest}</Td><Td className="text-center font-bold text-red-500">{s.lowest}</Td></Tr>
                ))}</tbody>
              </DataTable>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Student Ranking</h4>
              <DataTable card={false}>
                <thead><tr><Th className="text-center w-12">Rank</Th><Th>Student</Th><Th className="text-center">Total</Th><Th className="text-center">%</Th><Th className="text-center">Grade</Th></tr></thead>
                <tbody>{analyticsData.students.map(s => (
                  <Tr key={s.studentId}>
                    <Td className="text-center font-bold text-slate-400 dark:text-slate-500">#{s.rank}</Td>
                    <Td>{s.name}</Td>
                    <Td className="text-center">{s.total}/{s.totalPossible}</Td>
                    <Td className="text-center font-bold">{s.percentage}%</Td>
                    <Td className="text-center"><Badge variant="purple" size="sm">{s.grade}</Badge></Td>
                  </Tr>
                ))}</tbody>
              </DataTable>
            </div>
          </div>
        )}
      </Modal>

      {/* ════ HISTORY MODAL ══════════════════════════════════════════════════ */}
      <Modal isOpen={!!historyExamId} onClose={() => setHistoryExamId(null)}
        title={`Edit History — ${historyData?.examName || '…'}`} maxWidth="580px">
        {loadingHistoryData ? <div className="py-10 flex justify-center"><LoadingSpinner /></div> :
         !historyData || historyData.editHistory.length === 0 ? <EmptyState icon={<History size={32} />} title="No edits recorded yet." className="py-10" /> : (
          <div className="flex flex-col gap-2.5">
            {historyData.editHistory.map((entry, i) => {
              const sInfo  = typeof entry.studentId === 'object' ? entry.studentId : undefined;
              const sLabel = sInfo ? `${sInfo.firstName || ''} ${sInfo.lastName || ''}`.trim() + (sInfo.admissionNo ? ` (${sInfo.admissionNo})` : '') : `Student #${String(entry.studentId).slice(-6)}`;
              return (
                <div key={i} className="p-3 bg-slate-50 dark:bg-slate-900 rounded-md border-l-[3px] border-violet-400">
                  <div className="flex justify-between mb-1"><span className="font-bold text-xs text-violet-700">{entry.editedByName}</span><span className="text-[11px] text-slate-400 dark:text-slate-500">{new Date(entry.editedAt).toLocaleString()}</span></div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 dark:text-slate-500 mb-1">Student: <strong>{sLabel}</strong></div>
                  {entry.changes.map((c, j) => <div key={j} className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 pl-2">• <strong>{c.subject}</strong>: {c.from} → {c.to}</div>)}
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* ════ PDF PREVIEW MODAL ═══════════════════════════════════════════════ */}
      {previewUrl && (() => {
        const token = getAccessToken();
        const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
        const isS3     = previewUrl.includes('.amazonaws.com/');
        const s3Key    = isS3 ? (previewUrl.split('.amazonaws.com/')[1]?.split('?')[0] || '') : '';
        const filename = `${previewStudentName.replace(/\s+/g, '_')}_Report.pdf`;
        const dlUrl    = isS3 && s3Key ? `${API_BASE}/marks/download-pdf?key=${encodeURIComponent(s3Key)}&filename=${encodeURIComponent(filename)}${tokenParam}` : previewUrl;
        return (
          <Modal isOpen onClose={() => setPreviewUrl(null)} title={`Report Card — ${previewStudentName}`} maxWidth="560px"
            footer={
              <a href={dlUrl} className="flex items-center gap-1.5 h-8 px-4 rounded-md bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors no-underline">
                <Download size={13} /> Download PDF
              </a>
            }>
            <div style={{ height: '70vh' }}>
              <iframe src={previewUrl} title={`Report Card - ${previewStudentName}`} width="100%" height="100%" className="border-none" />
            </div>
          </Modal>
        );
      })()}
    </div>
  );
};

export default AdminMarks;

