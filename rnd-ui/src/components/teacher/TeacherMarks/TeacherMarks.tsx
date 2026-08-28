import React, { useState, useRef, useEffect } from 'react';
import {
  FileDown, Download, ArrowLeft, ArrowRight, Save, Edit, Lock, AlertTriangle, Clock,
  ChevronDown, ChevronUp, Eye, Loader2, Plus, MessageCircle, Trash2,
  CheckCircle, ClipboardList, FileText, Users, BookOpen, GripVertical, Info,
} from 'lucide-react';
import type { StudentData, ExamData, ExamSubject } from '../../../types';
import { generateReportCardPDF, generateSingleStudentReportPDF, uploadSingleStudentReportPDF } from './report-card';
import { API_BASE, formatClassName } from '../../../constants';
import { getAccessToken } from '../../../services/api';
import { cn } from '../../../lib/utils';
import { Button, Badge, PageHeader, DataTable, Th, Td, Tr, EmptyState, Modal, Drawer, MobileRowCard, MobileCardList } from '../../ui';
import { useSchool } from '../../../context/schoolContext';

type MarksStep = 'list' | 'create' | 'entry';

interface TeacherMarksProps {
  teacherName: string;
  students: StudentData[];
  examsList: ExamData[];
  selectedExam: ExamData | null;
  activeStep: MarksStep;
  examName: string;
  examSubjects: ExamSubject[];
  studentGrades: Record<string, Record<string, number | ''>>;
  studentRemarks: Record<string, string>;
  onStepChange: (step: MarksStep) => void;
  onExamNameChange: (name: string) => void;
  onSubjectsChange: (subjects: ExamSubject[]) => void;
  onStudentGradeChange: (studentId: string, subject: string, value: number | '') => void;
  onStudentRemarkChange: (studentId: string, value: string) => void;
  onLoadExamDetails: (examId: string) => Promise<void> | void;
  onCloseExamDetails: () => void;
  onSubmitMarks: (e: React.FormEvent) => void;
  isSubmittingMarks?: boolean;
  onSaveRemarks?: (exam: ExamData) => void;
  onAutoSave?: () => Promise<boolean>;
  onEnterMarks?: (exam: ExamData) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  assignedClasses: string[];
  selectedClass: string;
  onSubmitTemplate: (examName: string, examType: 'final' | 'middle' | 'regular', subjects: ExamSubject[], rooms: string[]) => Promise<void>;
  isLocked?: boolean;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (!status || status === 'draft') {
    return <Badge variant="amber" size="sm"><AlertTriangle size={10} /> Pending Entry</Badge>;
  }
  if (status === 'submitted') {
    return <Badge variant="green" size="sm"><CheckCircle size={10} /> Grades Submitted</Badge>;
  }
  if (status === 'locked') {
    return <Badge variant="gray" size="sm"><Lock size={10} /> Locked</Badge>;
  }
  return null;
};

const labelCls = 'text-xs font-bold uppercase tracking-wide text-slate-500';
const inputCls = 'h-[38px] px-3 border-[1.5px] border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue transition-colors font-[inherit] w-full';

// ─── Common subject presets for the exam-template subject picker ──────────────
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
              className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-blue-lt hover:text-blue transition-colors"
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
              step === s.n ? 'bg-blue text-white' : 'border-2 border-slate-300 text-slate-400'
            )}>
              {s.n}
            </div>
            <span className={cn('text-sm font-semibold whitespace-nowrap', step === s.n ? 'text-blue' : 'text-slate-400')}>
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
      <div className="w-9 h-9 rounded-lg bg-blue-lt text-blue flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <div className="text-sm font-bold text-slate-900">{title}</div>
        {subtitle && <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>}
      </div>
    </div>
  );
}

const TeacherMarks: React.FC<TeacherMarksProps> = ({
  teacherName,
  students,
  examsList,
  selectedExam,
  activeStep,
  examName,
  examSubjects,
  studentGrades,
  studentRemarks,
  onStepChange,
  onExamNameChange,
  onSubjectsChange,
  onStudentGradeChange,
  onStudentRemarkChange,
  onLoadExamDetails,
  onCloseExamDetails,
  onSubmitMarks,
  isSubmittingMarks = false,
  onSaveRemarks,
  onAutoSave,
  onEnterMarks,
  showToast,
  assignedClasses,
  selectedClass,
  onSubmitTemplate,
  isLocked = false,
}) => {
  const { schoolProfile } = useSchool();
  const [validationErrors, setValidationErrors] = useState<Record<string, Record<string, boolean>>>({});
  // Edit confirmation dialog state
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [pendingEditExam, setPendingEditExam] = useState<ExamData | null>(null);
  // Edit history panel toggle
  const [showHistory, setShowHistory] = useState(false);
  const [examType, setExamType] = useState<'final' | 'middle' | 'regular'>('regular');

  // ── New Exam Template drawer: two-step wizard state ───────────────────────
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [examDescription, setExamDescription] = useState('');
  const [dragSubjectIndex, setDragSubjectIndex] = useState<number | null>(null);

  const [generatingStudentId, setGeneratingStudentId] = useState<string | null>(null);
  const [sendingWhatsappId, setSendingWhatsappId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewStudentName, setPreviewStudentName] = useState<string>('');
  const [downloadingClassPdf, setDownloadingClassPdf] = useState(false);

  const detailsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedExam && detailsRef.current) {
      setTimeout(() => detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }, [selectedExam?._id]);

  const handleSendWhatsAppAlert = async (student: StudentData, existingPdfUrl?: string) => {
    setSendingWhatsappId(student.id);
    const studentName = student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim();
    const schoolName = schoolProfile?.schoolInfo?.schoolName || 'SchoolHub';
    const examNameVal = selectedExam?.examName || 'the examination';

    try {
      // Auto-generate + upload PDF if not yet available
      let pdfUrl = existingPdfUrl;
      if (!pdfUrl) {
        if (!selectedExam) throw new Error('No exam selected');
        showToast('Generating report card before sending...', 'success');
        pdfUrl = await uploadSingleStudentReportPDF(selectedExam, student, studentRemarks, teacherName);
        // Refresh exam details so the eye/download buttons light up
        if (onLoadExamDetails) onLoadExamDetails(selectedExam._id);
      }

      const englishMessage = `📊 *Report Card Ready*\n\nDear Parent,\n\nThe report card for your ward *${studentName}* for *${examNameVal}* has been successfully generated. 🎓\n\n👤 *Student:* ${studentName}\n📝 *Examination:* ${examNameVal}\n\n📄 The report card is attached to this message.\n\nThank you. 🙏\n\n*— ${schoolName}*`;
      const teluguMessage = `📊 *రిపోర్ట్ కార్డ్ సిద్ధంగా ఉంది*\n\nప్రియమైన తల్లిదండ్రులారా,\n\nమీ బిడ్డ *${studentName}* కి సంబంధించిన *${examNameVal === 'the examination' ? 'పరీక్ష' : examNameVal}* ప్రగతి పత్రం (Report Card) విజయవంతంగా రూపొందించబడింది. 🎓\n\n👤 *విద్యార్థి:* ${studentName}\n📝 *పరీక్ష:* ${examNameVal === 'the examination' ? 'పరీక్ష' : examNameVal}\n\n📄 ఈ సందేశానికి ప్రగతి పత్రం జతచేయబడింది.\n\nధన్యవాదాలు. 🙏\n\n*— ${schoolName}*`;

      const messageText = `${englishMessage}\n\n${teluguMessage}\n\n${pdfUrl}`;

      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/messages/student/${student.id}/whatsapp`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: messageText }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`WhatsApp alert sent to ${studentName}'s parent!`, 'success');
      } else {
        throw new Error(data.message || 'Failed');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed.', 'error');
    } finally {
      setSendingWhatsappId(null);
    }
  };

  const [targetClasses, setTargetClasses] = useState<string[]>([selectedClass]);

  useState(() => {
    setTargetClasses([selectedClass]);
  });

  React.useEffect(() => {
    setTargetClasses([selectedClass]);
  }, [selectedClass]);

  const handleCreateTemplateLocal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!examName.trim()) {
      showToast('Exam term name is required.', 'error');
      return;
    }
    if (examSubjects.some(s => !s.name.trim() || Number(s.totalMarks) <= 0)) {
      showToast('Each subject must have a name and maximum marks greater than 0.', 'error');
      return;
    }
    if (targetClasses.length === 0) {
      showToast('Please select at least one class room.', 'error');
      return;
    }
    onSubmitTemplate(examName, examType, examSubjects, targetClasses);
    setExamType('regular');
    setExamDescription('');
    setWizardStep(1);
  };

  // ── Advance from "Exam & Classes" to "Subjects & Marks" ───────────────────
  const handleNextWizardStep = () => {
    if (!examName.trim()) {
      showToast('Exam term name is required.', 'error');
      return;
    }
    if (targetClasses.length === 0) {
      showToast('Please select at least one class room.', 'error');
      return;
    }
    setWizardStep(2);
  };

  // ── Drag-to-reorder subjects ───────────────────────────────────────────────
  const handleSubjectDrop = (targetIndex: number) => {
    if (dragSubjectIndex === null || dragSubjectIndex === targetIndex) { setDragSubjectIndex(null); return; }
    const list = [...examSubjects];
    const [moved] = list.splice(dragSubjectIndex, 1);
    list.splice(targetIndex, 0, moved);
    onSubjectsChange(list);
    setDragSubjectIndex(null);
  };

  const handleGenerateStudentPDF = async (student: StudentData) => {
    if (!selectedExam) return;
    setGeneratingStudentId(student.id);
    try {
      if (onAutoSave) {
        const saved = await onAutoSave();
        if (!saved) {
          showToast('Failed to auto-save grades/remarks.', 'error');
          return;
        }
        if (onLoadExamDetails) {
          await onLoadExamDetails(selectedExam._id);
        }
      }
      await uploadSingleStudentReportPDF(selectedExam, student, studentRemarks, teacherName);
      showToast(`Report card generated successfully for ${student.name}!`, 'success');
      if (onLoadExamDetails) {
        onLoadExamDetails(selectedExam._id);
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Generation failed', 'error');
    } finally {
      setGeneratingStudentId(null);
    }
  };

  const handlePreviewPDF = (url: string, name: string) => {
    setPreviewUrl(url);
    setPreviewStudentName(name);
  };

  const handleDownloadPDF = async () => {
    if (!selectedExam) return;
    if (students.length === 0) { showToast('No students found to generate report.', 'error'); return; }
    setDownloadingClassPdf(true);
    try {
      if (onAutoSave) {
        const saved = await onAutoSave();
        if (!saved) {
          showToast('Failed to auto-save grades/remarks before bulk download.', 'error');
          return;
        }
        if (onLoadExamDetails) {
          await onLoadExamDetails(selectedExam._id);
        }
      }
      await generateReportCardPDF(selectedExam, students, studentRemarks, teacherName);
      showToast('Report Card PDF downloaded successfully!');
    } catch (err) {
      console.error('PDF generation error:', err);
      showToast('Failed to generate PDF. Please try again.', 'error');
    } finally {
      setDownloadingClassPdf(false);
    }
  };

  const handleDownloadStudentPDF = async (student: StudentData) => {
    if (!selectedExam) return;
    try {
      if (onAutoSave) {
        const saved = await onAutoSave();
        if (!saved) {
          showToast('Failed to auto-save grades/remarks.', 'error');
          return;
        }
        if (onLoadExamDetails) {
          await onLoadExamDetails(selectedExam._id);
        }
      }
      await generateSingleStudentReportPDF(selectedExam, student, studentRemarks, teacherName);
      showToast(`Report card downloaded for ${student.name}.`);
    } catch (err) {
      console.error('PDF generation error:', err);
      showToast('Failed to generate PDF. Please try again.', 'error');
    }
  };

  const handleSaveRemarks = () => {
    if (onSaveRemarks && selectedExam) onSaveRemarks(selectedExam);
  };

  // ── Handle "Edit Grades" click — show confirmation for submitted exams ───────
  const handleEditClick = (exam: ExamData) => {
    if (exam.status === 'locked') {
      showToast('This exam is locked by admin. Contact admin to unlock it.', 'error');
      return;
    }
    if (exam.status === 'submitted' && exam.studentMarks?.length > 0) {
      setPendingEditExam(exam);
      setShowEditConfirm(true);
    } else {
      onEnterMarks?.(exam);
    }
  };

  const confirmEdit = () => {
    if (pendingEditExam) onEnterMarks?.(pendingEditExam);
    setShowEditConfirm(false);
    setPendingEditExam(null);
  };

  // ── Grade input change with instant boundary validation ───────────────────
  const handleGradeChangeLocal = (studentId: string, subject: string, val: string, maxMarks: number) => {
    const numVal = val === '' ? '' : Number(val);
    const isInvalid = numVal !== '' && (numVal < 0 || numVal > maxMarks);
    onStudentGradeChange(studentId, subject, numVal);
    setValidationErrors(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), [subject]: isInvalid } }));
  };

  // ── Aggregate stats for KPI strip ─────────────────────────────────────────
  const calculateAnalytics = (exam: ExamData) => {
    if (students.length === 0) return { avg: 0, top: 'N/A', passRate: 0 };
    let grandTotalObtained = 0, grandTotalPossible = 0, passedCount = 0, highestPct = -1, topScorerName = 'N/A';
    students.forEach(s => {
      const sm = exam.studentMarks.find(r => (typeof r.student === 'string' ? r.student : (r.student as any)?._id) === s.id);
      let obtained = 0, possible = 0;
      exam.subjects.forEach(sub => {
        const match = sm?.marks.find(m => m.subject === sub.name);
        obtained += match?.obtainedMarks ?? 0;
        possible += sub.totalMarks;
      });
      grandTotalObtained += obtained; grandTotalPossible += possible;
      const pct = possible > 0 ? (obtained / possible) * 100 : 0;
      if (pct >= 40) passedCount++;
      if (pct > highestPct) { highestPct = pct; topScorerName = s.name; }
    });
    return {
      avg: grandTotalPossible > 0 ? Math.round((grandTotalObtained / grandTotalPossible) * 100) : 0,
      top: highestPct !== -1 ? `${topScorerName} (${Math.round(highestPct)}%)` : 'N/A',
      passRate: students.length > 0 ? Math.round((passedCount / students.length) * 100) : 0,
    };
  };

  const getSubjectStats = (exam: ExamData, subjectName: string, maxMarks: number) => {
    let totalObtained = 0, maxObtained = 0, minObtained = maxMarks, count = 0;
    students.forEach(s => {
      const sm = exam.studentMarks.find(r => (typeof r.student === 'string' ? r.student : (r.student as any)?._id) === s.id);
      const match = sm?.marks.find(m => m.subject === subjectName);
      if (match !== undefined) {
        totalObtained += match.obtainedMarks;
        if (match.obtainedMarks > maxObtained) maxObtained = match.obtainedMarks;
        if (match.obtainedMarks < minObtained) minObtained = match.obtainedMarks;
        count++;
      }
    });
    return { avg: count > 0 ? Math.round(totalObtained / count) : 0, max: count > 0 ? maxObtained : 0, min: count > 0 ? minObtained : 0 };
  };

  // ── Submit — validate then delegate to portal ─────────────────────────────
  const handleLocalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let hasErrors = false;
    Object.values(validationErrors).forEach(sErrors => { if (Object.values(sErrors).some(err => err)) hasErrors = true; });
    if (hasErrors) { showToast('Please correct input errors before saving.', 'error'); return; }
    onSubmitMarks(e);
  };

  const analytics = selectedExam ? calculateAnalytics(selectedExam) : null;

  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900">

      {/* ── Step: List (stays visible behind the New Exam Template drawer) ──────── */}
      {(activeStep === 'list' || activeStep === 'create') && (
        <>
          <PageHeader
            title="Exams & Marks"
            subtitle="Assigned exam registers for your class."
            actions={
              <Button
                disabled={isLocked}
                title={isLocked ? 'Mark entry is locked for this class' : ''}
                onClick={() => {
                  onExamNameChange('');
                  onSubjectsChange([{ name: '', totalMarks: 100 }]);
                  setTargetClasses([selectedClass]);
                  setExamDescription('');
                  setWizardStep(1);
                  onStepChange('create');
                }}
              >
                <Plus size={15} /> Define New Exam Template
              </Button>
            }
          />

          {/* Desktop/tablet table */}
          <div className="hidden md:block">
            <DataTable
              card
              header={
                <div className="flex items-center justify-between">
                  <div className="text-md font-bold text-slate-900">Exam Registers</div>
                  <span className="text-xs text-slate-400">{examsList.length} record{examsList.length !== 1 ? 's' : ''}</span>
                </div>
              }
            >
              <thead>
                <tr>
                  <Th>Exam Term Name</Th>
                  <Th>Class Room</Th>
                  <Th>Assigned Subjects</Th>
                  <Th>Status</Th>
                  <Th className="text-center">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {examsList.length === 0 ? (
                  <tr><Td colSpan={5}><EmptyState icon={<ClipboardList size={32} />} title="No exam templates assigned by Admin yet." /></Td></tr>
                ) : (
                  examsList.map((ex) => {
                    const examLocked = ex.status === 'locked';
                    return (
                      <Tr key={ex._id}>
                        <Td><span className="text-sm font-bold text-slate-900">{ex.examName}</span></Td>
                        <Td><Badge variant="blue" size="sm">Class {ex.class}</Badge></Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            {ex.subjects.map(s => (
                              <span key={s.name} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">{s.name} ({s.totalMarks})</span>
                            ))}
                          </div>
                        </Td>
                        <Td><StatusBadge status={ex.status} /></Td>
                        <Td>
                          <div className="flex items-center justify-center gap-2">
                            <Button variant="secondary" size="sm" onClick={() => onLoadExamDetails(ex._id)}>View Details</Button>
                            {onEnterMarks && (
                              <Button
                                size="sm"
                                variant={examLocked ? 'secondary' : 'primary'}
                                disabled={examLocked}
                                title={examLocked ? 'Locked by admin — contact admin to unlock' : undefined}
                                onClick={() => handleEditClick(ex)}
                              >
                                {examLocked ? <><Lock size={12} /> Locked</> : ex.status === 'submitted' ? 'Edit Grades' : 'Enter Grades'}
                              </Button>
                            )}
                          </div>
                        </Td>
                      </Tr>
                    );
                  })
                )}
              </tbody>
            </DataTable>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-md font-bold text-slate-900">Exam Registers</div>
              <span className="text-xs text-slate-400">{examsList.length} record{examsList.length !== 1 ? 's' : ''}</span>
            </div>
            {examsList.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg shadow-card">
                <EmptyState icon={<ClipboardList size={32} />} title="No exam templates assigned by Admin yet." />
              </div>
            ) : (
              <MobileCardList>
                {examsList.map((ex) => {
                  const examLocked = ex.status === 'locked';
                  return (
                    <MobileRowCard
                      key={ex._id}
                      title={ex.examName}
                      subtitle={`Class ${ex.class} · ${ex.subjects.map(s => s.name).join(', ')}`}
                      badge={<StatusBadge status={ex.status} />}
                      actions={
                        <>
                          <Button variant="secondary" size="sm" onClick={() => onLoadExamDetails(ex._id)}>View Details</Button>
                          {onEnterMarks && (
                            <Button
                              size="sm"
                              variant={examLocked ? 'secondary' : 'primary'}
                              disabled={examLocked}
                              onClick={() => handleEditClick(ex)}
                            >
                              {examLocked ? <><Lock size={12} /> Locked</> : ex.status === 'submitted' ? 'Edit Grades' : 'Enter Grades'}
                            </Button>
                          )}
                        </>
                      }
                    />
                  );
                })}
              </MobileCardList>
            )}
          </div>

          {/* Grades detail card */}
          {selectedExam && (
            <div ref={detailsRef} className="bg-white border border-slate-200 rounded-lg shadow-card p-5 flex flex-col gap-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h4 className="text-md font-bold text-slate-900 m-0">
                    Grades Sheet: {selectedExam.examName} (Class: {selectedExam.class})
                  </h4>
                  {selectedExam.lastEditedAt && (
                    <p className="mt-1 text-xs text-slate-500 flex items-center gap-1">
                      <Clock size={12} />
                      Last edited {selectedExam.lastEditedByName ? `by ${selectedExam.lastEditedByName}` : ''} on{' '}
                      {new Date(selectedExam.lastEditedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {onEnterMarks && (
                    <Button
                      disabled={isLocked || selectedExam.status === 'locked'}
                      title={isLocked ? 'Mark entry is locked for this class' : selectedExam.status === 'locked' ? 'This exam is locked' : ''}
                      onClick={() => handleEditClick(selectedExam)}
                    >
                      <Edit size={14} /> Edit Marks
                    </Button>
                  )}
                  {selectedExam.status === 'locked' && (
                    <span className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 rounded-md text-slate-500 text-sm font-semibold">
                      <Lock size={14} /> Locked by Admin
                    </span>
                  )}
                  <Button variant="secondary" onClick={handleDownloadPDF} loading={downloadingClassPdf}>
                    <FileDown size={14} /> Download Class Reports PDF
                  </Button>
                  {selectedExam.status !== 'locked' && (
                    <Button variant="success" disabled={isLocked} title={isLocked ? 'Mark entry is locked for this class' : ''} onClick={handleSaveRemarks}>
                      Save Remarks
                    </Button>
                  )}
                  <Button variant="secondary" onClick={onCloseExamDetails}>Close Details</Button>
                </div>
              </div>

              {/* KPI Analytics Strip */}
              {selectedExam.studentMarks?.length > 0 && analytics && (
                <div className="grid grid-cols-3 gap-4 max-sm:grid-cols-1">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <div className="text-xl font-extrabold text-slate-900">{analytics.avg}%</div>
                    <div className="text-xs font-medium text-slate-500 mt-0.5">Class Average</div>
                  </div>
                  <div className="bg-blue-lt border border-blue-200 rounded-lg p-4">
                    <div className="text-xl font-extrabold text-blue">{analytics.top}</div>
                    <div className="text-xs font-medium text-blue mt-0.5">Top Scorer</div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="text-xl font-extrabold text-green-800">{analytics.passRate}%</div>
                    <div className="text-xs font-medium text-green-800 mt-0.5">Pass Rate (&ge;40%)</div>
                  </div>
                </div>
              )}

              {/* Grades table — desktop/tablet */}
              <div className="hidden md:block">
                <DataTable card={false}>
                  <thead>
                    <tr>
                      <Th>Admission ID</Th>
                      <Th>Student Name</Th>
                      {selectedExam.subjects.map(sub => (
                        <Th key={sub.name} className="text-center">{sub.name} (Max: {sub.totalMarks})</Th>
                      ))}
                      <Th className="min-w-[200px]">Remarks</Th>
                      <Th className="text-center min-w-[80px]">Download</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.length === 0 ? (
                      <tr><Td colSpan={4 + selectedExam.subjects.length}><EmptyState title="No students found." /></Td></tr>
                    ) : (
                      students.map((student) => {
                        const smRecord = selectedExam.studentMarks.find(
                          sm => (typeof sm.student === 'string' ? sm.student : (sm.student as any)?._id) === student.id
                        );
                        return (
                          <Tr key={student.id}>
                            <Td><span className="text-sm font-semibold text-slate-700">{student.admissionNo}</span></Td>
                            <Td><span className="text-sm font-bold text-slate-900">{student.name}</span></Td>
                            {selectedExam.subjects.map(sub => {
                              const match = smRecord?.marks.find(m => m.subject === sub.name);
                              const obtained = match !== undefined ? match.obtainedMarks : 'N/A';
                              return (
                                <Td key={sub.name} className="text-center font-semibold">
                                  {obtained !== 'N/A' ? `${obtained} / ${sub.totalMarks}` : 'N/A'}
                                </Td>
                              );
                            })}
                            <Td>
                              <textarea
                                className="w-full min-h-[50px] px-2.5 py-1.5 border border-slate-200 rounded-md text-xs outline-none focus:border-blue transition-colors font-[inherit] resize-none"
                                placeholder={selectedExam.status === 'locked' ? 'Locked (Read-Only)' : 'Enter remarks...'}
                                value={studentRemarks[student.id] || ''}
                                onChange={(e) => onStudentRemarkChange(student.id, e.target.value)}
                                disabled={selectedExam.status === 'locked'}
                                rows={2}
                              />
                            </Td>
                            <Td>
                              <div className="flex gap-1.5 justify-center items-center">
                                <Button
                                  size="sm"
                                  disabled={generatingStudentId === student.id || isLocked}
                                  title={isLocked ? 'Mark entry is locked for this class' : ''}
                                  onClick={() => handleGenerateStudentPDF(student)}
                                >
                                  {generatingStudentId === student.id ? <Loader2 size={13} className="animate-spin" /> : 'Generate'}
                                </Button>
                                <button type="button" className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors" title={`Download report for ${student.name}`} onClick={() => handleDownloadStudentPDF(student)}>
                                  <Download size={14} />
                                </button>
                                {smRecord?.pdfUrl && (
                                  <button type="button" className="w-8 h-8 flex items-center justify-center rounded-md border border-green-200 text-green hover:bg-green-lt transition-colors" title={`View report for ${student.name}`} onClick={() => handlePreviewPDF(smRecord.pdfUrl!, student.name)}>
                                    <Eye size={14} />
                                  </button>
                                )}
                                <button type="button" className="w-8 h-8 flex items-center justify-center rounded-md border border-green-200 text-[#25d366] hover:bg-green-lt transition-colors" title={smRecord?.pdfUrl ? 'Send WhatsApp report alert to parent' : 'Generate & send WhatsApp report to parent'} disabled={sendingWhatsappId === student.id} onClick={() => handleSendWhatsAppAlert(student, smRecord?.pdfUrl)}>
                                  {sendingWhatsappId === student.id ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
                                </button>
                              </div>
                            </Td>
                          </Tr>
                        );
                      })
                    )}
                  </tbody>
                </DataTable>
              </div>

              {/* Grades — mobile card view */}
              <div className="md:hidden flex flex-col gap-3">
                {students.length === 0 ? (
                  <EmptyState title="No students found." />
                ) : (
                  <MobileCardList>
                    {students.map((student) => {
                      const smRecord = selectedExam.studentMarks.find(
                        sm => (typeof sm.student === 'string' ? sm.student : (sm.student as any)?._id) === student.id
                      );
                      return (
                        <MobileRowCard
                          key={student.id}
                          title={student.name}
                          subtitle={`Adm: ${student.admissionNo}`}
                          fields={selectedExam.subjects.map(sub => {
                            const match = smRecord?.marks.find(m => m.subject === sub.name);
                            const obtained = match !== undefined ? match.obtainedMarks : 'N/A';
                            return { label: sub.name, value: obtained !== 'N/A' ? `${obtained} / ${sub.totalMarks}` : 'N/A' };
                          })}
                          actions={
                            <div className="flex flex-col gap-2.5 w-full">
                              <textarea
                                className="w-full min-h-[44px] px-2.5 py-2 border border-slate-200 rounded-md text-xs outline-none focus:border-blue transition-colors font-[inherit] resize-none"
                                placeholder={selectedExam.status === 'locked' ? 'Locked (Read-Only)' : 'Enter remarks...'}
                                value={studentRemarks[student.id] || ''}
                                onChange={(e) => onStudentRemarkChange(student.id, e.target.value)}
                                disabled={selectedExam.status === 'locked'}
                                rows={2}
                              />
                              <div className="flex gap-2 flex-wrap">
                                <Button
                                  size="sm"
                                  disabled={generatingStudentId === student.id || isLocked}
                                  onClick={() => handleGenerateStudentPDF(student)}
                                >
                                  {generatingStudentId === student.id ? <Loader2 size={13} className="animate-spin" /> : 'Generate'}
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => handleDownloadStudentPDF(student)}>
                                  <Download size={13} /> Download
                                </Button>
                                {smRecord?.pdfUrl && (
                                  <Button size="sm" variant="secondary" onClick={() => handlePreviewPDF(smRecord.pdfUrl!, student.name)}>
                                    <Eye size={13} /> View
                                  </Button>
                                )}
                                <Button size="sm" variant="success" disabled={sendingWhatsappId === student.id} onClick={() => handleSendWhatsAppAlert(student, smRecord?.pdfUrl)}>
                                  {sendingWhatsappId === student.id ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />} WhatsApp
                                </Button>
                              </div>
                            </div>
                          }
                        />
                      );
                    })}
                  </MobileCardList>
                )}
              </div>

              {/* Subject Performance Summary */}
              {selectedExam.studentMarks?.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-slate-900 mb-2.5">Subject Performance Summary</h4>
                  <DataTable card={false}>
                    <thead>
                      <tr>
                        <Th>Subject</Th>
                        <Th className="text-center">Max Marks</Th>
                        <Th className="text-center">Average</Th>
                        <Th className="text-center">Highest</Th>
                        <Th className="text-center">Lowest</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedExam.subjects.map(sub => {
                        const stats = getSubjectStats(selectedExam, sub.name, sub.totalMarks);
                        return (
                          <Tr key={sub.name}>
                            <Td><strong className="text-slate-800">{sub.name}</strong></Td>
                            <Td className="text-center">{sub.totalMarks}</Td>
                            <Td className="text-center font-semibold">{stats.avg} / {sub.totalMarks}</Td>
                            <Td className="text-center font-bold text-green-800">{stats.max}</Td>
                            <Td className="text-center font-bold text-red-700">{stats.min}</Td>
                          </Tr>
                        );
                      })}
                    </tbody>
                  </DataTable>
                </div>
              )}

              {/* Edit History Panel */}
              {selectedExam.editHistory && selectedExam.editHistory.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowHistory(h => !h)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 border-none cursor-pointer font-semibold text-sm text-slate-700 transition-colors"
                  >
                    <span>📋 Edit History ({selectedExam.editHistory.length} change{selectedExam.editHistory.length !== 1 ? 's' : ''})</span>
                    {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {showHistory && (
                    <div className="p-4 flex flex-col gap-2.5 bg-white">
                      {[...selectedExam.editHistory].reverse().map((entry, i) => {
                        const student = students.find(s => s.id === entry.studentId);
                        const studentLabel = student ? `${student.name} (${student.admissionNo})` : `Student #${entry.studentId?.slice(-6)}`;
                        return (
                          <div key={i} className="p-3 bg-slate-50 rounded-md border-l-[3px] border-violet-400">
                            <div className="flex justify-between mb-1">
                              <span className="font-bold text-xs text-violet-700">{entry.editedByName}</span>
                              <span className="text-2xs text-slate-400">{new Date(entry.editedAt).toLocaleString()}</span>
                            </div>
                            <div className="text-xs text-slate-600 mb-1 pb-1 border-b border-dashed border-slate-200">
                              Student: <strong>{studentLabel}</strong>
                            </div>
                            {entry.changes.map((c, j) => (
                              <div key={j} className="text-xs text-slate-500 pl-2">
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
            </div>
          )}
        </>
      )}

      {/* ── Define New Exam Template Drawer — two-step wizard (slides in from the right) ─── */}
      <Drawer
        isOpen={activeStep === 'create'}
        onClose={() => onStepChange('list')}
        title="Define New Exam Template"
        subtitle="Create a new exam register for your class."
        footer={
          wizardStep === 1 ? (
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1 justify-center" onClick={() => onStepChange('list')}>Cancel</Button>
              <Button type="button" className="flex-1 justify-center" onClick={handleNextWizardStep}>
                Next: Add Subjects &amp; Marks <ArrowRight size={14} />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1 justify-center" onClick={() => setWizardStep(1)}>
                <ArrowLeft size={14} /> Back
              </Button>
              <Button type="submit" form="exam-template-form" className="flex-1 justify-center">
                Create Exam Template <CheckCircle size={14} />
              </Button>
            </div>
          )
        }
      >
        <div className="flex flex-col gap-4">
          <WizardStepIndicator step={wizardStep} />

          <form id="exam-template-form" onSubmit={handleCreateTemplateLocal} className="flex flex-col gap-4">
            {wizardStep === 1 ? (
              <>
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <SectionHeading icon={<FileText size={17} />} title="Exam Details" />
                  <div className="p-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className={labelCls}>Exam Type</label>
                      <select className={inputCls} value={examType} onChange={(e) => setExamType(e.target.value as any)}>
                        <option value="regular">Regular Exam</option>
                        <option value="middle">Middle Exam</option>
                        <option value="final">Final Exam</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className={labelCls}>Exam Term Name</label>
                      <input type="text" placeholder="e.g. Unit Test 1, Half Yearly, Annual Exam" className={inputCls} required
                        value={examName} onChange={(e) => onExamNameChange(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className={labelCls}>Exam Description (Optional)</label>
                      <textarea
                        className="w-full min-h-[80px] px-3 py-2 border-[1.5px] border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue transition-colors font-[inherit] resize-none"
                        placeholder="Add a short description about this exam..."
                        maxLength={200}
                        value={examDescription}
                        onChange={(e) => setExamDescription(e.target.value)}
                      />
                      <span className="self-end text-2xs text-slate-400">{examDescription.length} / 200</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <SectionHeading icon={<Users size={17} />} title="Select Class Rooms" subtitle="Choose one or more class rooms" />
                  <div className="p-4 grid grid-cols-2 gap-2.5">
                    {assignedClasses.map((cls) => {
                      const checked = targetClasses.includes(cls);
                      return (
                        <label key={cls} className={cn(
                          'flex flex-col gap-1.5 px-3 py-2.5 rounded-lg border-2 cursor-pointer transition-colors select-none',
                          checked ? 'border-blue bg-blue-lt' : 'border-slate-200 bg-white hover:border-slate-300'
                        )}>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-blue flex-shrink-0"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) setTargetClasses([...targetClasses, cls]);
                                else setTargetClasses(targetClasses.filter(c => c !== cls));
                              }}
                            />
                            <span className="text-sm font-semibold text-slate-800">Class {cls}</span>
                          </div>
                          {checked && <Badge variant="blue" size="sm" className="w-fit">Selected</Badge>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
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
                          <GripVertical size={15} className="text-slate-300 cursor-grab flex-shrink-0" />
                        )}
                        <SubjectNameInput
                          className="flex-[2]"
                          value={subject.name}
                          excludeNames={examSubjects.filter((_, i) => i !== index).map(s => s.name)}
                          onChange={(val) => {
                            const list = [...examSubjects];
                            list[index] = { ...list[index], name: val };
                            onSubjectsChange(list);
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
                            onSubjectsChange(list);
                          }}
                        />
                        {examSubjects.length > 1 && (
                          <button type="button" className="w-8 h-8 flex items-center justify-center rounded-md text-red hover:bg-red-lt transition-colors flex-shrink-0"
                            title="Remove subject"
                            onClick={() => onSubjectsChange(examSubjects.filter((_, i) => i !== index))}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  <button type="button" className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-md border border-dashed border-blue-200 text-sm font-bold text-blue hover:bg-blue-lt transition-colors"
                    onClick={() => onSubjectsChange([...examSubjects, { name: '', totalMarks: 100 }])}>
                    <Plus size={14} /> Add Subject
                  </button>

                  {examSubjects.length > 1 && (
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-lt border border-blue-200 rounded-md text-xs text-blue">
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

      {/* ── Step: Entry ──────────────────────────────────────────────────────────── */}
      {activeStep === 'entry' && (
        <form onSubmit={handleLocalSubmit} className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => { onStepChange('list'); onCloseExamDetails(); }}
              className="w-9 h-9 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors flex-shrink-0">
              <ArrowLeft size={16} />
            </button>
            <div>
              <h3 className="text-lg font-bold text-slate-900 m-0">Enter / Edit Student Marks — {examName}</h3>
              <p className="mt-1 text-xs text-slate-500">
                Enter marks for each student. Limits: {examSubjects.map(s => `${s.name} (max ${s.totalMarks})`).join(', ')}.
              </p>
            </div>
          </div>

          {/* Desktop/tablet table */}
          <div className="hidden md:block">
            <DataTable card>
              <thead>
                <tr>
                  <Th>Admission ID</Th>
                  <Th>Student Name</Th>
                  <Th>Class &amp; Section</Th>
                  {examSubjects.map(sub => (
                    <Th key={sub.name} className="text-center min-w-[120px]">{sub.name} (Max: {sub.totalMarks})</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr><Td colSpan={3 + examSubjects.length}><EmptyState title="No students found." /></Td></tr>
                ) : (
                  students.map((student) => (
                    <Tr key={student.id}>
                      <Td><span className="text-sm font-semibold text-slate-700">{student.admissionNo}</span></Td>
                      <Td><span className="text-sm font-bold text-slate-900">{student.name}</span></Td>
                      <Td>{formatClassName(student.class, student.section)}</Td>
                      {examSubjects.map((sub) => {
                        const val = (studentGrades[student.id] || {})[sub.name];
                        const isErr = (validationErrors[student.id] || {})[sub.name] || false;
                        return (
                          <Td key={sub.name} className="text-center">
                            <input
                              type="number"
                              className={cn(
                                'w-24 h-9 text-center border rounded-md text-sm font-semibold outline-none transition-colors font-[inherit] mx-auto block',
                                isErr ? 'border-red bg-red-lt text-red-700' : 'border-slate-200 bg-white focus:border-blue'
                              )}
                              placeholder={`0 – ${sub.totalMarks}`}
                              value={val !== undefined ? val : ''}
                              min={0}
                              max={sub.totalMarks}
                              onChange={(e) => handleGradeChangeLocal(student.id, sub.name, e.target.value, sub.totalMarks)}
                            />
                            {isErr && <div className="text-2xs text-red text-center mt-0.5">0–{sub.totalMarks}</div>}
                          </Td>
                        );
                      })}
                    </Tr>
                  ))
                )}
              </tbody>
            </DataTable>
          </div>

          {/* Mobile card view — each student's subject inputs stacked */}
          <div className="md:hidden">
            {students.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg shadow-card"><EmptyState title="No students found." /></div>
            ) : (
              <MobileCardList>
                {students.map((student) => (
                  <MobileRowCard
                    key={student.id}
                    title={student.name}
                    subtitle={`Adm: ${student.admissionNo} · ${formatClassName(student.class, student.section)}`}
                    actions={
                      <div className="grid grid-cols-2 gap-3 w-full">
                        {examSubjects.map((sub) => {
                          const val = (studentGrades[student.id] || {})[sub.name];
                          const isErr = (validationErrors[student.id] || {})[sub.name] || false;
                          return (
                            <div key={sub.name} className="flex flex-col gap-1">
                              <label className="text-2xs font-bold uppercase tracking-wide text-slate-400">{sub.name} (/{sub.totalMarks})</label>
                              <input
                                type="number"
                                className={cn(
                                  'h-11 px-2.5 text-center border rounded-md text-sm font-semibold outline-none transition-colors font-[inherit] w-full',
                                  isErr ? 'border-red bg-red-lt text-red-700' : 'border-slate-200 bg-white focus:border-blue'
                                )}
                                placeholder={`0 – ${sub.totalMarks}`}
                                value={val !== undefined ? val : ''}
                                min={0}
                                max={sub.totalMarks}
                                onChange={(e) => handleGradeChangeLocal(student.id, sub.name, e.target.value, sub.totalMarks)}
                              />
                              {isErr && <div className="text-2xs text-red">0–{sub.totalMarks}</div>}
                            </div>
                          );
                        })}
                      </div>
                    }
                  />
                ))}
              </MobileCardList>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={isLocked || isSubmittingMarks}
              loading={isSubmittingMarks}
              title={isLocked ? 'Mark entry is locked for this class' : ''}
            >
              <Save size={14} /> {isSubmittingMarks ? 'Submitting...' : 'Submit Marks Sheet'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => { onStepChange('list'); onCloseExamDetails(); }}>Cancel</Button>
          </div>
        </form>
      )}

      {/* ── Edit Confirmation Modal ────────────────────────────────────────────── */}
      <Modal
        isOpen={showEditConfirm}
        onClose={() => { setShowEditConfirm(false); setPendingEditExam(null); }}
        title="Edit Submitted Marks?"
        maxWidth="440px"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { setShowEditConfirm(false); setPendingEditExam(null); }}>Cancel</Button>
            <Button className="bg-amber border-amber hover:bg-amber/90" onClick={confirmEdit}>Yes, Edit Marks</Button>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <AlertTriangle size={22} className="text-amber flex-shrink-0" />
          <p className="text-sm text-slate-600 leading-relaxed m-0">
            Marks for <strong>{pendingEditExam?.examName}</strong> have already been submitted.
            Editing will overwrite the current grades. This action will be recorded in the audit log.
          </p>
        </div>
      </Modal>

      {/* ── PDF Preview Modal ─────────────────────────────────────────────────── */}
      {previewUrl && (() => {
        const token = getAccessToken();
        const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
        const isS3Url = previewUrl.includes('.amazonaws.com/');
        const s3Key = isS3Url ? (previewUrl.split('.amazonaws.com/')[1]?.split('?')[0] || '') : '';
        const filename = `${previewStudentName.replace(/\s+/g, '_')}_Report.pdf`;
        const proxyDownloadUrl = isS3Url && s3Key
          ? `${API_BASE}/marks/download-pdf?key=${encodeURIComponent(s3Key)}&filename=${encodeURIComponent(filename)}${tokenParam}`
          : previewUrl;
        return (
          <Modal
            isOpen
            onClose={() => setPreviewUrl(null)}
            title={`Report Card Preview: ${previewStudentName}`}
            maxWidth="560px"
            footer={
              <a href={proxyDownloadUrl} className="flex items-center gap-1.5 h-9 px-4 rounded-md bg-green text-white text-sm font-semibold hover:bg-green/90 transition-colors no-underline w-fit">
                <Download size={14} /> Download
              </a>
            }
          >
            <div style={{ height: '65vh' }}>
              <iframe src={previewUrl} title={`Report Card - ${previewStudentName}`} width="100%" height="100%" className="border-none" />
            </div>
          </Modal>
        );
      })()}
    </div>
  );
};

export default TeacherMarks;
