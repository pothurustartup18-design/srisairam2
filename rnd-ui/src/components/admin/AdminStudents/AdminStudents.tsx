import React, { useState, useEffect } from 'react';
import {
  Search, Plus, MessageSquare, Trash2, Eye, UserPlus, Edit, FolderOpen,
  Paperclip, Loader2, FileText, Download, Image, File, Receipt, Phone,
  MapPin, X, Users, GraduationCap, BookOpen, Bus
} from 'lucide-react';
import type { TeacherData, StudentData, ClassData } from '../../../types';
import { API_BASE, formatClassName, sortClasses, getSelectableClasses } from '../../../constants';
import { getAccessToken } from '../../../services/api';
import { cn } from '../../../lib/utils';
import { getAvatarColors } from '../../../utils/avatar';
import {
  Button, KpiCard, PageHeader, Badge, DataTable, Th, Td, Tr,
  FilterToolbar, FilterGroup, filterControlClass, ToolbarDivider,
  EmptyState, LoadingSpinner, Drawer, Modal, MobileCardList, MobileRowCard, RequiredMark,
} from '../../ui';

export interface NewStudentForm {
  admissionNo: string;
  firstName: string;
  lastName: string;
  class: string;
  section: string;
  classTeacherId: string;
  feePaid: number;
  feePending: number;
  whatsappNo: string;
  motherWhatsappNo?: string;
  transportMode: string;
  booksFee: number;
  preferredLanguage?: string;
  cluster?: string;
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  house?: string;
  fatherName?: string;
  motherName?: string;
  address?: string;
}

interface StudentDocument {
  _id: string;
  docType: string;
  filename: string;
  downloadUrl: string;
}

interface AdminStudentsProps {
  students: StudentData[];
  teachers: TeacherData[];
  classesList?: ClassData[];
  newStudent: any;
  onNewStudentChange: (fields: any) => void;
  onCreateStudent: (e: React.FormEvent) => void;
  onDeleteStudent: (student: StudentData) => void;
  onDeleteStudents?: (studentIds: string[]) => void;
  onPromoteStudents?: (studentIds: string[]) => void;
  onMessageParent: (student: StudentData) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  editingStudentId: string | null;
  onEditStudent: (student: StudentData) => void;
  onCancelEditStudent: () => void;
  onFetchNextAdmissionNo?: (academicYear: string) => void;
}

const AdminStudents: React.FC<AdminStudentsProps> = ({
  students, teachers, classesList = [],
  newStudent, onNewStudentChange, onCreateStudent,
  onDeleteStudent, onDeleteStudents, onPromoteStudents, onMessageParent, showToast,
  editingStudentId, onEditStudent, onCancelEditStudent, onFetchNextAdmissionNo,
}) => {
  void [showToast];

  const [classFilter, setClassFilter]     = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [searchQuery, setSearchQuery]     = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  // Drop any selected ids that no longer match the roster once it refreshes
  // (e.g. after a bulk delete, or a bulk promote moving students to a different class).
  useEffect(() => {
    setSelectedStudentIds(prev => prev.filter(id => students.some(s => (s.id || s._id) === id)));
  }, [students]);
  const [showAdmitDrawer, setShowAdmitDrawer]       = useState(false);
  const [currentPage, setCurrentPage]   = useState(1);
  const itemsPerPage = 50;

  useEffect(() => { setCurrentPage(1); }, [classFilter, searchQuery, sectionFilter]);

  const findTeacherForClass = (className: string, section: string, teacherList: TeacherData[]) => {
    if (!teacherList || teacherList.length === 0) return null;
    const targetWithSec = `${className}-${section || '-'}`;
    let found = teacherList.find(t =>
      t.classTeacherOf && (t.classTeacherOf === targetWithSec || t.classTeacherOf === `${className}--` || t.classTeacherOf === className)
    );
    if (found) return found;

    found = teacherList.find(t =>
      t.assignedClass && (t.assignedClass === targetWithSec || t.assignedClass === `${className}--` || t.assignedClass === className)
    );
    if (found) return found;

    found = teacherList.find(t =>
      Array.isArray(t.teachingClasses) && (t.teachingClasses.includes(targetWithSec) || t.teachingClasses.includes(className))
    );
    return found || null;
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const ok = await onCreateStudent(e);
      if (ok === true) {
        setShowAdmitDrawer(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleSelectStudent = (id: string) => setSelectedStudentIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const handleSelectAllStudents = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedStudentIds(filteredRoster.map(s => s.id || s._id).filter(Boolean));
    else setSelectedStudentIds([]);
  };

  // ── Documents vault ──────────────────────────────────────────────────────────
  const [documents, setDocuments]         = useState<StudentDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [docType, setDocType]             = useState('Birth Certificate');
  const [uploadingDoc, setUploadingDoc]   = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const [feeReceipts, setFeeReceipts]     = useState<any[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  const loadReceipts = async (studentId: string) => {
    if (!studentId) return;
    setLoadingReceipts(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/students/${studentId}/receipts`, { headers });
      const data = await res.json();
      if (data.success) setFeeReceipts(data.data); else setFeeReceipts([]);
    } catch { setFeeReceipts([]); } finally { setLoadingReceipts(false); }
  };

  const [selectedStudentForReportGallery, setSelectedStudentForReportGallery] = useState<any | null>(null);
  const [studentReportExams, setStudentReportExams] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [activeGalleryTab, setActiveGalleryTab] = useState<'exams' | 'documents' | 'fees'>('exams');

  const activeStudentId = editingStudentId || (selectedStudentForReportGallery?.id || selectedStudentForReportGallery?._id);

  const loadDocuments = async (studentId: string) => {
    if (!studentId) return;
    setLoadingDocuments(true);
    try {
      const res = await fetch(`${API_BASE}/students/${studentId}/documents`);
      const data = await res.json();
      if (data.success) setDocuments(data.data);
    } catch { setDocuments([]); } finally { setLoadingDocuments(false); }
  };

  useEffect(() => {
    if (editingStudentId) loadDocuments(editingStudentId);
    else if (!selectedStudentForReportGallery) { setDocuments([]); setFeeReceipts([]); }
  }, [editingStudentId, selectedStudentForReportGallery]);

  const handleUploadDocument = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetStudentId = activeStudentId;
    if (!file || !targetStudentId) return;
    setUploadingDoc(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const res = await fetch(`${API_BASE}/students/${targetStudentId}/documents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ docType, filename: file.name, base64: reader.result as string }) });
        const data = await res.json();
        if (data.success) { showToast('Document uploaded successfully.'); loadDocuments(targetStudentId); }
        else showToast(data.message || 'Failed to upload document.', 'error');
      } catch { showToast('Server connection failed.', 'error'); }
      finally { setUploadingDoc(false); e.target.value = ''; }
    };
    reader.onerror = () => { showToast('Failed to read file.', 'error'); setUploadingDoc(false); };
  };

  const handleDeleteDocument = async (docId: string) => {
    const targetStudentId = activeStudentId;
    if (!targetStudentId) return;
    setDeletingDocId(docId);
    try {
      const res = await fetch(`${API_BASE}/students/${targetStudentId}/documents/${docId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { showToast('Document deleted.'); setDocuments(prev => prev.filter(d => d._id !== docId)); }
      else showToast(data.message || 'Failed to delete document.', 'error');
    } catch { showToast('Server connection failed.', 'error'); }
    finally { setDeletingDocId(null); }
  };

  useEffect(() => {
    if (newStudent.class && newStudent.section) {
      const targetClass = `${newStudent.class}-${newStudent.section}`;
      const teacher = teachers.find(t => t.assignedClass && t.assignedClass.includes(targetClass));
      if (teacher && teacher._id !== newStudent.classTeacherId) onNewStudentChange({ classTeacherId: teacher._id });
      else if (!teacher && newStudent.classTeacherId) onNewStudentChange({ classTeacherId: '' });
    }
  }, [newStudent.class, newStudent.section, teachers]);

  const totalStudents = students.length;
  const countClass10 = students.filter(s => s.class === '10').length;
  const countClass9  = students.filter(s => s.class === '9').length;
  const countClass8  = students.filter(s => s.class === '8').length;

  const filteredRoster = students.filter(s => {
    const q = searchQuery.toLowerCase();
    return (s.name.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q)) &&
      (classFilter === 'all' || s.class === classFilter) &&
      (sectionFilter === 'all' || s.section.toLowerCase() === sectionFilter.toLowerCase());
  });

  const totalPages = Math.ceil(filteredRoster.length / itemsPerPage);
  const paginatedRoster = filteredRoster.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleViewReportCard = async (student: any) => {
    const studentId = student.id || student._id;
    setSelectedStudentForReportGallery(student);
    setLoadingReports(true);
    setStudentReportExams([]);
    loadDocuments(studentId);
    loadReceipts(studentId);
    try {
      const res = await fetch(`${API_BASE}/marks/student/${studentId}`);
      const data = await res.json();
      if (data.success && data.data.length > 0) setStudentReportExams(data.data.filter((ex: any) => ex.pdfUrl));
    } catch (err) {
      console.error('Failed to load report card exams:', err);
    } finally { setLoadingReports(false); }
  };

  const [downloadingReceiptNo, setDownloadingReceiptNo] = useState<string | null>(null);
  const handleDownloadReceipt = async (receiptNo: string) => {
    const studentId = selectedStudentForReportGallery?.id || selectedStudentForReportGallery?._id;
    if (!studentId || !receiptNo) return;
    setDownloadingReceiptNo(receiptNo);
    try {
      const res = await fetch(`${API_BASE}/students/${studentId}/receipts/${receiptNo}/download`);
      const data = await res.json();
      if (data.success && data.downloadUrl) window.open(data.downloadUrl, '_blank');
      else showToast(data.message || 'Failed to get receipt download link.', 'error');
    } catch { showToast('Server connection failed.', 'error'); }
    finally { setDownloadingReceiptNo(null); }
  };

  const resetFilters = () => { setSearchQuery(''); setClassFilter('all'); setSectionFilter('all'); };

  // ── Shared styles ────────────────────────────────────────────────────────────
  const fieldCls    = 'flex flex-col gap-1.5';
  const labelCls    = 'text-xs font-bold uppercase tracking-wide text-slate-500';
  const inputCls    = 'h-[38px] px-3 border-[1.5px] border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue transition-colors font-[inherit]';
  const selectCls   = inputCls;
  const textareaCls = 'px-3 py-2 border-[1.5px] border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue transition-colors font-[inherit] resize-none';

  const sectionDivider = (
    <div className="flex items-center gap-2 mt-2">
      <hr className="flex-1 border-slate-200 dark:border-slate-600" />
    </div>
  );

  const sectionTitle = (icon: React.ReactNode, label: string) => (
    <div className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-500 mt-2 mb-1">
      {icon} {label}
    </div>
  );

  // ── Form fields (add + edit) ─────────────────────────────────────────────────
  const renderFormFields = (isEdit: boolean) => (
    <div className="flex flex-col gap-4">
      {/* Academic Year + Admission ID */}
      <div className="grid grid-cols-2 gap-4">
        {!isEdit && (
          <div className={fieldCls}>
            <label className={labelCls}>Academic Year</label>
            <select className={selectCls} value={newStudent.admissionAcademicYear || '2026-27'}
              onChange={e => { const y = e.target.value; onNewStudentChange({ admissionAcademicYear: y }); onFetchNextAdmissionNo?.(y); }}>
              <option value="2024-25">2024-25</option>
              <option value="2025-26">2025-26</option>
              <option value="2026-27">2026-27</option>
              <option value="2027-28">2027-28</option>
              <option value="2028-29">2028-29</option>
            </select>
          </div>
        )}
        <div className={fieldCls}>
          <label className={labelCls}>Admission ID {isEdit ? '(Read Only)' : '(Auto)'}</label>
          <input type="text" placeholder="Fetching next ID..." className={cn(inputCls, 'font-bold')} required disabled value={newStudent.admissionNo || ''} />
        </div>
      </div>

      {/* WhatsApp Numbers */}
      <div className="grid grid-cols-2 gap-4">
        <div className={fieldCls}>
          <label className={labelCls}>Father/Primary WhatsApp<RequiredMark /></label>
          <input type="text" placeholder="e.g. 9876543210" className={inputCls} pattern="[0-9]{10}" maxLength={10} required value={newStudent.whatsappNo || ''} onChange={e => onNewStudentChange({ whatsappNo: e.target.value.replace(/\D/g, '') })} />
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Mother WhatsApp (Optional)</label>
          <input type="text" placeholder="e.g. 9876543211" className={inputCls} pattern="[0-9]{10}" maxLength={10} value={newStudent.motherWhatsappNo || ''} onChange={e => onNewStudentChange({ motherWhatsappNo: e.target.value.replace(/\D/g, '') })} />
        </div>
      </div>

      {/* Names */}
      <div className="grid grid-cols-2 gap-4">
        <div className={fieldCls}>
          <label className={labelCls}>First Name<RequiredMark /></label>
          <input type="text" placeholder="First Name" className={inputCls} required value={newStudent.firstName} onChange={e => onNewStudentChange({ firstName: e.target.value })} />
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Last Name</label>
          <input type="text" placeholder="Last Name" className={inputCls} value={newStudent.lastName} onChange={e => onNewStudentChange({ lastName: e.target.value })} />
        </div>
      </div>

      {/* Class + Section */}
      <div className="grid grid-cols-2 gap-4">
        <div className={fieldCls}>
          <label className={labelCls}>Class<RequiredMark /></label>
          <select className={selectCls} value={newStudent.class} onChange={e => {
            const sel = e.target.value;
            const availSecs = getSelectableClasses(classesList).filter(c => c.className === sel).map(c => c.section);
            let nextSec = newStudent.section;
            if (availSecs.length > 0 && !availSecs.includes(nextSec)) nextSec = availSecs[0];
            const autoTeacher = findTeacherForClass(sel, nextSec, teachers);
            onNewStudentChange({
              class: sel,
              section: nextSec,
              classTeacherId: autoTeacher ? autoTeacher._id : ''
            });
          }}>
            {sortClasses(Array.from(new Set(getSelectableClasses(classesList).map(c => c.className)))).map(cls => (
              <option key={cls} value={cls}>{isNaN(Number(cls)) ? cls : `Class ${cls}`}</option>
            ))}
          </select>
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Section<RequiredMark /></label>
          <select className={selectCls} value={newStudent.section} onChange={e => {
            const nextSec = e.target.value;
            const autoTeacher = findTeacherForClass(newStudent.class, nextSec, teachers);
            onNewStudentChange({
              section: nextSec,
              classTeacherId: autoTeacher ? autoTeacher._id : ''
            });
          }}>
            {(() => {
              const filtered = getSelectableClasses(classesList).filter(c => c.className === newStudent.class);
              if (filtered.length === 0) return <option value="-">No Section</option>;
              return filtered.map(c => <option key={c._id} value={c.section}>{c.section === '-' ? 'No Section' : `Section ${c.section}`}</option>);
            })()}
          </select>
        </div>
      </div>

      {/* Class Teacher */}
      {(() => {
        const autoTeacher = findTeacherForClass(newStudent.class, newStudent.section, teachers);
        return (
          <div className={fieldCls}>
            <div className="flex items-center justify-between mb-1">
              <label className={labelCls}>Class Teacher</label>
              {autoTeacher ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                  ✓ Auto-assigned to {autoTeacher.name}
                </span>
              ) : (
                <span className="text-xs text-slate-400">
                  (Not assigned yet · Optional)
                </span>
              )}
            </div>
            <select
              className={selectCls}
              value={newStudent.classTeacherId || ''}
              onChange={e => onNewStudentChange({ classTeacherId: e.target.value })}
            >
              <option value="">-- No Class Teacher Assigned Yet --</option>
              {teachers.map(t => {
                const isAuto = autoTeacher && t._id === autoTeacher._id;
                return (
                  <option key={t._id} value={t._id}>
                    {t.name} {t.assignedClass ? `(Assigned: ${t.assignedClass})` : ''} {isAuto ? '★ Class Teacher' : ''}
                  </option>
                );
              })}
            </select>
          </div>
        );
      })()}

      {/* Transport + Language */}
      <div className="grid grid-cols-2 gap-4">
        <div className={fieldCls}>
          <label className={labelCls}>Transportation Mode</label>
          <select className={selectCls} value={newStudent.transportMode} onChange={e => onNewStudentChange({ transportMode: e.target.value })}>
            <option value="school">School Transport 🚌</option>
            <option value="private">Private Transport 🚗</option>
          </select>
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Preferred Language</label>
          <select className={selectCls} value={newStudent.preferredLanguage || 'en'} onChange={e => onNewStudentChange({ preferredLanguage: e.target.value })}>
            <option value="en">English</option>
            <option value="te">Telugu</option>
            <option value="hi">Hindi</option>
          </select>
        </div>
      </div>

      {/* Cluster */}
      <div className={fieldCls}>
        <label className={labelCls}>Area / Village Cluster</label>
        <input type="text" placeholder="e.g. Madhapur, Kondapur, East Zone" className={inputCls} value={newStudent.cluster || ''} onChange={e => onNewStudentChange({ cluster: e.target.value })} />
      </div>

      {/* Personal Details */}
      {sectionDivider}
      {sectionTitle(<UserPlus size={14} />, 'Personal Details')}

      <div className="grid grid-cols-2 gap-4">
        <div className={fieldCls}>
          <label className={labelCls}>Date of Birth</label>
          <input type="date" className={inputCls} value={newStudent.dateOfBirth || ''} onChange={e => onNewStudentChange({ dateOfBirth: e.target.value })} />
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Gender</label>
          <select className={selectCls} value={newStudent.gender || ''} onChange={e => onNewStudentChange({ gender: e.target.value })}>
            <option value="">Select Gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={fieldCls}>
          <label className={labelCls}>Blood Group</label>
          <select className={selectCls} value={newStudent.bloodGroup || ''} onChange={e => onNewStudentChange({ bloodGroup: e.target.value })}>
            <option value="">Select</option>
            {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>House</label>
          <input type="text" placeholder="e.g. Red House" className={inputCls} value={newStudent.house || ''} onChange={e => onNewStudentChange({ house: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={fieldCls}>
          <label className={labelCls}>Father's Name</label>
          <input type="text" className={inputCls} value={newStudent.fatherName || ''} onChange={e => onNewStudentChange({ fatherName: e.target.value })} />
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Mother's Name</label>
          <input type="text" className={inputCls} value={newStudent.motherName || ''} onChange={e => onNewStudentChange({ motherName: e.target.value })} />
        </div>
      </div>

      <div className={fieldCls}>
        <label className={labelCls}>Address</label>
        <textarea className={textareaCls} rows={2} placeholder="Full residential address" value={newStudent.address || ''} onChange={e => onNewStudentChange({ address: e.target.value })} />
      </div>

      {/* Fees */}
      {sectionDivider}
      {sectionTitle(<Receipt size={14} />, 'Fee Details')}

      <div className="grid grid-cols-2 gap-4">
        <div className={fieldCls}>
          <label className={labelCls}>School Fee Paid (₹)</label>
          <input type="text" inputMode="numeric" placeholder="0" className={inputCls}
            value={newStudent.feePaid === 0 ? '0' : String(newStudent.feePaid)}
            onChange={e => { const raw = e.target.value.replace(/^0+(?=\d)/, '').replace(/\D/g, ''); onNewStudentChange({ feePaid: raw === '' ? 0 : Number(raw) }); }} />
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>School Fee Pending (₹)</label>
          <input type="text" inputMode="numeric" placeholder="0" className={inputCls}
            value={newStudent.feePending === 0 ? '0' : String(newStudent.feePending)}
            onChange={e => { const raw = e.target.value.replace(/^0+(?=\d)/, '').replace(/\D/g, ''); onNewStudentChange({ feePending: raw === '' ? 0 : Number(raw) }); }} />
        </div>
      </div>

      <div className={fieldCls}>
        <label className={labelCls}>Outstanding Book Fee Dues (₹)</label>
        <input type="text" inputMode="numeric" placeholder="0" className={inputCls}
          value={newStudent.booksFee === 0 ? '0' : String(newStudent.booksFee)}
          onChange={e => { const raw = e.target.value.replace(/^0+(?=\d)/, '').replace(/\D/g, ''); onNewStudentChange({ booksFee: raw === '' ? 0 : Number(raw) }); }} />
      </div>
    </div>
  );

  const closeGallery = () => { setSelectedStudentForReportGallery(null); setDocuments([]); setFeeReceipts([]); setActiveGalleryTab('exams'); };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900 dark:text-white">

      {/* PAGE HEADER */}
      <PageHeader
        title="Students Management"
        subtitle="Manage student admissions, profiles, and academic records."
        actions={
          !editingStudentId && (
            <Button onClick={() => setShowAdmitDrawer(true)}><Plus size={15} /> Admit Student</Button>
          )
        }
      />

      {/* KPI STRIP */}
      <div className="grid grid-cols-4 gap-4 max-[900px]:grid-cols-2 max-[540px]:grid-cols-1">
        <KpiCard label="Total Enrolled" value={totalStudents} subtext="Active students"  icon={<Users size={17} />}        iconBg="bg-purple-lt" iconColor="text-purple" />
        <KpiCard label="Class 10"       value={countClass10}  subtext="Enrolments"       icon={<GraduationCap size={17} />} iconBg="bg-blue-lt"   iconColor="text-blue" />
        <KpiCard label="Class 9"        value={countClass9}   subtext="Enrolments"       icon={<BookOpen size={17} />}      iconBg="bg-green-lt"  iconColor="text-green" />
        <KpiCard label="Class 8"        value={countClass8}   subtext="Enrolments"       icon={<FileText size={17} />}      iconBg="bg-amber-lt"  iconColor="text-amber" />
      </div>

      {/* FILTER TOOLBAR */}
      <FilterToolbar>
        <FilterGroup label="Search" className="flex-1 min-w-[220px]">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-slate-400 dark:text-slate-500 pointer-events-none" />
            <input type="text" className={cn(filterControlClass, 'pl-8')} placeholder="Search by name or admission ID…"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
        </FilterGroup>
        <FilterGroup label="Class">
          <select className={cn(filterControlClass, 'min-w-[120px]')} value={classFilter}
            onChange={e => { setClassFilter(e.target.value); setSectionFilter('all'); }}>
            <option value="all">All Classes</option>
            {sortClasses(Array.from(new Set(getSelectableClasses(classesList).map(c => c.className)))).map(cls => (
              <option key={cls} value={cls}>{isNaN(Number(cls)) ? cls : `Class ${cls}`}</option>
            ))}
          </select>
        </FilterGroup>
        <FilterGroup label="Section">
          <select className={cn(filterControlClass, 'min-w-[120px]')} value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}>
            <option value="all">All Sections</option>
            {(() => {
              const fCls = classFilter === 'all' ? getSelectableClasses(classesList) : getSelectableClasses(classesList).filter(c => c.className === classFilter);
              return Array.from(new Set(fCls.map(c => c.section))).map(sec => (
                <option key={sec} value={sec}>{sec === '-' ? 'No Section' : `Section ${sec}`}</option>
              ));
            })()}
          </select>
        </FilterGroup>
        <ToolbarDivider />
        <div className="flex items-end">
          <Button variant="secondary" size="sm" onClick={resetFilters}>Reset</Button>
        </div>
      </FilterToolbar>

      {/* BULK ACTION BAR */}
      {selectedStudentIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-lt border border-blue-200 rounded-lg">
          <span className="text-sm font-bold text-blue">{selectedStudentIds.length} selected</span>
          {onPromoteStudents && (
            <Button variant="secondary" size="sm" onClick={() => onPromoteStudents(selectedStudentIds)}>
              <GraduationCap size={13} /> Promote to Next Class
            </Button>
          )}
          {onDeleteStudents && (
            <Button variant="danger" size="sm" onClick={() => onDeleteStudents(selectedStudentIds)}><Trash2 size={13} /> Delete</Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setSelectedStudentIds([])}><X size={12} /> Clear</Button>
        </div>
      )}

      {/* STUDENT TABLE — desktop/tablet */}
      <div className="hidden md:block">
        <DataTable
          card
          header={
            <div className="flex items-center justify-between">
              <div className="text-md font-bold text-slate-900 dark:text-white">Student Directory</div>
              <span className="text-xs text-slate-400 dark:text-slate-500">{filteredRoster.length} of {totalStudents} students</span>
            </div>
          }
          footer={
            totalPages > 1 ? (
              <div className="flex items-center justify-between gap-4 px-5 py-3">
                <span className="text-xs text-slate-500 dark:text-slate-500">
                  Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredRoster.length)}–{Math.min(currentPage * itemsPerPage, filteredRoster.length)} of {filteredRoster.length} students
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" disabled={currentPage === 1} style={{ opacity: currentPage === 1 ? 0.5 : 1 }}
                    onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}>Previous</Button>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-500">Page {currentPage} of {totalPages}</span>
                  <Button variant="secondary" size="sm" disabled={currentPage === totalPages} style={{ opacity: currentPage === totalPages ? 0.5 : 1 }}
                    onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}>Next</Button>
                </div>
              </div>
            ) : null
          }
        >
          <thead>
            <tr>
              <Th style={{ width: 40 }}>
                <input type="checkbox" className="w-4 h-4 cursor-pointer accent-blue"
                  checked={filteredRoster.length > 0 && selectedStudentIds.length === filteredRoster.length} onChange={handleSelectAllStudents} />
              </Th>
              <Th>Student</Th>
              <Th>Contact</Th>
              <Th>Class</Th>
              <Th>Class Teacher</Th>
              <Th>Transport</Th>
              <Th className="text-center">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {paginatedRoster.length === 0 ? (
              <tr><Td colSpan={7}><EmptyState icon={<Users size={32} />} title="No students found." subtitle="Try adjusting your filters." /></Td></tr>
            ) : paginatedRoster.map(s => {
              const [bg, fg] = getAvatarColors(s.name);
              const initials = s.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
              const isSelected = selectedStudentIds.includes(s.id || s._id);

              return (
                <Tr key={s.id || s._id} className={isSelected ? 'bg-blue-lt/40' : ''}>
                  <Td className="text-center">
                    <input type="checkbox" className="w-4 h-4 cursor-pointer accent-blue" checked={isSelected} onChange={() => handleSelectStudent(s.id || s._id)} />
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0" style={{ background: bg, color: fg }}>{initials}</div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">{s.name}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">{s.admissionNo}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-500"><Phone size={11} className="text-blue flex-shrink-0" />{s.whatsappNo}</div>
                      {s.cluster && <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-500"><MapPin size={11} className="text-amber flex-shrink-0" />{s.cluster}</div>}
                    </div>
                  </Td>
                  <Td><Badge variant="blue" size="sm">{formatClassName(s.class, s.section)}</Badge></Td>
                  <Td><span className="text-sm text-slate-700 dark:text-slate-300">{s.classTeacher}</span></Td>
                  <Td>
                    {s.transportMode === 'school'
                      ? <Badge variant="green" size="sm"><Bus size={11} /> School Bus</Badge>
                      : <Badge variant="gray" size="sm">🚗 Private</Badge>}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5 justify-center">
                      <button className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-600 text-purple hover:bg-purple-lt transition-colors" title="View Vault / Report Card" onClick={() => handleViewReportCard(s)}><Eye size={16} /></button>
                      <button className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-600 text-green hover:bg-green-lt transition-colors" title="Message Parent" onClick={() => onMessageParent(s)}><MessageSquare size={16} /></button>
                      <button className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-600 text-blue hover:bg-blue-lt transition-colors" title="Edit Student" onClick={() => onEditStudent(s)}><Edit size={16} /></button>
                      <button className="w-8 h-8 flex items-center justify-center rounded-md border border-red-200 text-red hover:bg-red-lt transition-colors" title="Delete Student" onClick={() => onDeleteStudent(s)}><Trash2 size={16} /></button>
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>

      {/* STUDENT CARDS — mobile */}
      <div className="md:hidden flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-md font-bold text-slate-900 dark:text-white">Student Directory</div>
          <span className="text-xs text-slate-400 dark:text-slate-500">{filteredRoster.length} of {totalStudents} students</span>
        </div>
        {filteredRoster.length > 0 && (
          <label className="flex items-center gap-2 px-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <input type="checkbox" className="w-4 h-4 cursor-pointer accent-blue"
              checked={filteredRoster.length > 0 && selectedStudentIds.length === filteredRoster.length} onChange={handleSelectAllStudents} />
            Select all
          </label>
        )}
        {paginatedRoster.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700">
            <EmptyState icon={<Users size={32} />} title="No students found." subtitle="Try adjusting your filters." />
          </div>
        ) : (
          <MobileCardList>
            {paginatedRoster.map(s => {
              const isSelected = selectedStudentIds.includes(s.id || s._id);
              return (
                <MobileRowCard
                  key={s.id || s._id}
                  title={
                    <span className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4 cursor-pointer accent-blue flex-shrink-0"
                        checked={isSelected} onChange={() => handleSelectStudent(s.id || s._id)}
                        onClick={(e) => e.stopPropagation()} />
                      {s.name}
                    </span>
                  }
                  subtitle={`Adm: ${s.admissionNo}`}
                  badge={<Badge variant="blue" size="sm">{formatClassName(s.class, s.section)}</Badge>}
                  className={isSelected ? 'bg-blue-lt/40' : undefined}
                  fields={[
                    { label: 'Contact', value: s.whatsappNo },
                    { label: 'Class Teacher', value: s.classTeacher },
                    { label: 'Transport', value: s.transportMode === 'school' ? 'School Bus' : 'Private' },
                    ...(s.cluster ? [{ label: 'Area', value: `📍 ${s.cluster}` }] : []),
                  ]}
                  actions={
                    <>
                      <Button size="sm" variant="secondary" onClick={() => handleViewReportCard(s)}><Eye size={13} /> View</Button>
                      <Button size="sm" variant="success" onClick={() => onMessageParent(s)}><MessageSquare size={13} /> Message</Button>
                      <Button size="sm" variant="secondary" onClick={() => onEditStudent(s)}><Edit size={13} /> Edit</Button>
                      <Button size="sm" variant="danger" onClick={() => onDeleteStudent(s)}><Trash2 size={13} /> Delete</Button>
                    </>
                  }
                />
              );
            })}
          </MobileCardList>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700 px-4 py-3">
            <Button variant="secondary" size="sm" disabled={currentPage === 1} style={{ opacity: currentPage === 1 ? 0.5 : 1 }}
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}>Previous</Button>
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Page {currentPage} of {totalPages}</span>
            <Button variant="secondary" size="sm" disabled={currentPage === totalPages} style={{ opacity: currentPage === totalPages ? 0.5 : 1 }}
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}>Next</Button>
          </div>
        )}
      </div>

      {/* ── ADMIT STUDENT DRAWER ──────────────────────────────────────────────── */}
      <Drawer isOpen={showAdmitDrawer} onClose={() => setShowAdmitDrawer(false)} title="Admit New Student"
        footer={
          <div className="flex gap-2">
            <Button type="submit" form="admit-student-form" disabled={isSubmitting} className="flex-1 justify-center">
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {isSubmitting ? 'Admitting...' : 'Admit Student'}
            </Button>
            <Button variant="secondary" className="flex-1 justify-center" onClick={() => setShowAdmitDrawer(false)}>Cancel</Button>
          </div>
        }
      >
        <form id="admit-student-form" onSubmit={handleSubmit}>
          {renderFormFields(false)}
        </form>
      </Drawer>

      {/* ── EDIT STUDENT MODAL ────────────────────────────────────────────────── */}
      {editingStudentId && (() => {
        const editStudent = students.find(s => (s.id || s._id) === editingStudentId);
        const editName = editStudent?.name || '';
        const [eBg, eFg] = getAvatarColors(editName);
        const eInitials = editName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

        return (
          <Modal isOpen onClose={onCancelEditStudent} title="Edit Student Profile" maxWidth="640px"
            footer={
              <div className="flex gap-2">
                <Button type="submit" form="edit-student-form" className="flex-1 justify-center"><Edit size={15} /> Update Student</Button>
                <Button variant="secondary" className="flex-1 justify-center" onClick={onCancelEditStudent}>Cancel</Button>
              </div>
            }
          >
            {/* Profile summary */}
            <div className="flex items-center gap-3 mb-4 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-extrabold flex-shrink-0" style={{ background: eBg, color: eFg }}>{eInitials}</div>
              <div>
                <div className="text-md font-bold text-slate-900 dark:text-white">{editName}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">{editStudent?.admissionNo}</div>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="blue" size="sm">{formatClassName(editStudent?.class || '', editStudent?.section || '')}</Badge>
                  {editStudent?.transportMode === 'school'
                    ? <Badge variant="green" size="sm">🚌 School Bus</Badge>
                    : <Badge variant="gray" size="sm">🚗 Private</Badge>}
                </div>
              </div>
            </div>
            <form id="edit-student-form" onSubmit={onCreateStudent}>
              {renderFormFields(true)}
            </form>
          </Modal>
        );
      })()}

      {/* ── STUDENT VAULT / REPORT GALLERY ────────────────────────────────────── */}
      <Modal isOpen={!!selectedStudentForReportGallery} onClose={closeGallery}
        title="Student Vault"
        subtitle={selectedStudentForReportGallery ? `${selectedStudentForReportGallery.name} (Adm: ${selectedStudentForReportGallery.admissionNo})` : ''}
        maxWidth="900px"
        footer={<Button variant="secondary" className="w-full justify-center" onClick={closeGallery}>Close Gallery</Button>}
      >
        {/* Tab bar */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 rounded-md p-1 mb-4">
          {([
            { key: 'exams'    as const, icon: <FileText size={14} />,    label: 'Academic Reports' },
            { key: 'documents'as const, icon: <FolderOpen size={14} />,  label: 'Personal Documents' },
            { key: 'fees'     as const, icon: <Receipt size={14} />,     label: 'Fee Receipts' },
          ]).map(({ key, icon, label }) => (
            <button key={key} onClick={() => setActiveGalleryTab(key)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-2 sm:px-3.5 py-2 rounded text-xs sm:text-sm font-semibold transition-all min-w-0',
                activeGalleryTab === key ? 'bg-white dark:bg-slate-700 text-blue dark:text-blue shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-white/60 dark:hover:bg-white/10'
              )}>
              {icon} <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        {/* EXAMS TAB */}
        {activeGalleryTab === 'exams' && (
          loadingReports ? <LoadingSpinner fullPage /> :
          studentReportExams.length === 0 ? (
            <EmptyState icon={<FolderOpen size={40} />} title="No report cards generated yet." subtitle="Generated report cards will appear here." />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {studentReportExams.map(exam => {
                const pct = exam.percentage || 0;
                const pctVariant = pct >= 75 ? 'green' : pct >= 40 ? 'amber' : 'red';
                return (
                  <div key={exam._id} className="border border-slate-200 dark:border-slate-600 rounded-lg p-4 flex flex-col gap-2 cursor-pointer hover:border-blue transition-colors bg-white dark:bg-slate-800" onClick={() => window.open(exam.pdfUrl, '_blank')}>
                    <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto"><FileText size={24} /></div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white text-center truncate">{exam.examName}</div>
                    <Badge variant={pctVariant} size="sm" className="mx-auto">Score: {pct}%</Badge>
                    <Button size="sm" className="w-full justify-center mt-1" onClick={e => { e.stopPropagation(); window.open(exam.pdfUrl, '_blank'); }}>
                      <Eye size={13} /> View Report
                    </Button>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* DOCUMENTS TAB */}
        {activeGalleryTab === 'documents' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3 items-end p-4 bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 rounded-md">
              <div className={cn(fieldCls, 'flex-1 min-w-[160px]')}>
                <label className={labelCls}>Document Type</label>
                <select className={selectCls} value={docType} onChange={e => setDocType(e.target.value)}>
                  <option value="Birth Certificate">Birth Certificate</option>
                  <option value="Transfer Certificate">Transfer Certificate</option>
                  <option value="Photo">Photo</option>
                  <option value="Aadhaar / ID Proof">Aadhaar / ID Proof</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <label className="flex items-center gap-1.5 h-[38px] px-4 rounded-md bg-blue text-white text-sm font-semibold cursor-pointer hover:bg-blue/90 transition-colors">
                <Paperclip size={13} /> {uploadingDoc ? 'Uploading…' : 'Upload Document'}
                <input type="file" className="hidden" disabled={uploadingDoc} onChange={handleUploadDocument} />
              </label>
            </div>

            {loadingDocuments ? <LoadingSpinner fullPage /> :
             documents.length === 0 ? (
               <EmptyState icon={<FolderOpen size={36} />} title="No documents uploaded yet." subtitle="Upload Transfer Certificates, Aadhaar, Photo, etc. above." className="border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900" />
             ) : (
               <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                 {documents.map(doc => {
                   const isImage = doc.filename.match(/\.(jpg|jpeg|png|gif)$/i);
                   const isPdf   = doc.filename.match(/\.pdf$/i);
                   return (
                     <div key={doc._id} className="relative border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden bg-white dark:bg-slate-800 flex flex-col">
                       <button className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-red text-white hover:bg-red/90 transition-colors" onClick={() => handleDeleteDocument(doc._id)} disabled={deletingDocId === doc._id}>
                         {deletingDocId === doc._id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                       </button>
                       <div className={cn('h-20 flex items-center justify-center', isImage ? 'bg-emerald-50 text-emerald-600' : isPdf ? 'bg-red-50 text-red' : 'bg-slate-50 text-slate-500')}>
                         {isImage ? <Image size={24} /> : isPdf ? <FileText size={24} /> : <File size={24} />}
                       </div>
                       <div className="p-3 flex flex-col gap-1 flex-1">
                         <div className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{doc.docType}</div>
                         <div className="text-2xs text-slate-400 dark:text-slate-500 truncate">{doc.filename}</div>
                         <a href={doc.downloadUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 justify-center w-full mt-2 h-[30px] text-xs font-semibold border border-slate-200 dark:border-slate-600 rounded-md text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-900 transition-colors no-underline">
                           <Download size={11} /> Download
                         </a>
                       </div>
                     </div>
                   );
                 })}
               </div>
             )}
          </div>
        )}

        {/* FEES TAB */}
        {activeGalleryTab === 'fees' && (
          loadingReceipts ? <LoadingSpinner fullPage /> :
          feeReceipts.length === 0 ? (
            <EmptyState icon={<Receipt size={36} />} title="No fee payments recorded yet." subtitle="Payment receipts will appear here once recorded." className="border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {feeReceipts.map((payment: any, index: number) => {
                const isDownloading = downloadingReceiptNo === payment.receiptNo;
                return (
                  <div key={payment.receiptNo || index} className="border border-slate-200 dark:border-slate-600 rounded-lg p-4 bg-white dark:bg-slate-800 flex flex-col gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-lg bg-green-50 text-green flex items-center justify-center flex-shrink-0"><Receipt size={20} /></div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">₹{payment.amount.toLocaleString()}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">{payment.paymentMode.toUpperCase()} · {new Date(payment.date).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="text-2xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded break-all">Rcpt: {payment.receiptNo}</div>
                    {payment.downloadUrl ? (
                      <a href={payment.downloadUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 justify-center w-full h-[30px] text-xs font-semibold border border-slate-200 dark:border-slate-600 rounded-md text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-900 transition-colors no-underline">
                        <Download size={11} /> Download Receipt
                      </a>
                    ) : (
                      <Button variant="secondary" size="sm" className="w-full justify-center" disabled={isDownloading} onClick={() => handleDownloadReceipt(payment.receiptNo)}>
                        {isDownloading ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                        {isDownloading ? 'Fetching…' : 'Download Receipt'}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </Modal>

    </div>
  );
};

export default AdminStudents;

