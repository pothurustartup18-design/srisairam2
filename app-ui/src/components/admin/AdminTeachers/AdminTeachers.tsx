import React, { useState, useEffect } from 'react';
import {
  UserCheck, Plus, Search, Trash2, Eye, Edit, MessageCircle,
  Lock, Unlock, Check, Users, AlertTriangle, FolderOpen,
  Paperclip, Loader2, FileText, Phone, Mail, MapPin, X,
  GraduationCap, BookOpen, UserX
} from 'lucide-react';
import type { TeacherData, StudentData, ClassData } from '../../../types';
import { API_BASE, formatClassName, getSelectableClasses } from '../../../constants';
import { getAccessToken } from '../../../services/api';
import { usePhoneOtp } from '../../../hooks/usePhoneOtp';
import { cn } from '../../../lib/utils';
import { getAvatarColors } from '../../../utils/avatar';
import {
  Button, KpiCard, PageHeader, Badge, DataTable, Th, Td, Tr,
  FilterToolbar, FilterGroup, filterControlClass, ToolbarDivider,
  EmptyState, LoadingSpinner, Drawer, Modal, MobileCardList, MobileRowCard,
  RequiredMark,
} from '../../ui';
import { Form } from '../../ui/Form';
import { ActionButton } from '../../ui/ActionButton';

const subjectsList = [
  'Mathematics', 'Science', 'English', 'Social Studies',
  'Hindi', 'Telugu', 'Art', 'Physical Education', 'Computer Science'
];

const GRADE_ORDER = ['NURSERY', 'NUS', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const ALL_GRADES  = ['NURSERY', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

interface AdminTeachersProps {
  teachers: TeacherData[];
  students: StudentData[];
  classesList?: ClassData[];
  onClassesUpdate?: () => void;
  newTeacher: any;
  onNewTeacherChange: (field: string, value: any) => void;
  onCreateTeacher: (e: React.FormEvent) => void;
  onTeacherCreated?: () => void;
  onViewStudents: (teacherName: string) => void;
  onDeleteTeacher: (teacher: TeacherData) => void;
  onDeleteTeachers?: (teacherIds: string[]) => void;
  editingTeacherId: string | null;
  onEditTeacher: (teacher: TeacherData) => void;
  onCancelEditTeacher: () => void;
  onMessageTeacher?: (teacher: TeacherData) => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

const AdminTeachers: React.FC<AdminTeachersProps> = ({
  teachers, students, classesList = [], onClassesUpdate,
  newTeacher, onNewTeacherChange, onCreateTeacher, onTeacherCreated,
  onViewStudents, onDeleteTeacher, onDeleteTeachers,
  editingTeacherId, onEditTeacher, onCancelEditTeacher,
  onMessageTeacher, showToast,
}) => {

  // ── Local UI state ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery]   = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterSubject, setFilterSubject] = useState('All');
  const [filterGrade, setFilterGrade]     = useState('All');
  const [filterSection, setFilterSection] = useState('All');
  const [filterClassTeacher, setFilterClassTeacher] = useState('All');

  const resetFilters = () => { setSearchQuery(''); setFilterStatus('All'); setFilterSubject('All'); setFilterGrade('All'); setFilterSection('All'); setFilterClassTeacher('All'); };

  const [selectedIds, setSelectedIds]   = useState<string[]>([]);
  // Drop any selected ids that no longer exist once the roster refreshes (e.g. after a bulk delete).
  useEffect(() => {
    setSelectedIds(prev => prev.filter(id => teachers.some(t => t._id === id)));
  }, [teachers]);
  const [statusToggles, setStatusToggles] = useState<Record<string, 'active' | 'inactive'>>({});

  const [showAddDrawer, setShowAddDrawer] = useState(false);

  const [lockTarget, setLockTarget]             = useState<TeacherData | null>(null);
  const [pwdResetTarget, setPwdResetTarget]     = useState<{ id: string; name: string } | null>(null);
  const [classDelTarget, setClassDelTarget]     = useState<{ id: string; label: string } | null>(null);
  const [showClassesModal, setShowClassesModal] = useState(false);
  const [addingSectionGrade, setAddingSectionGrade] = useState<string | null>(null);
  const [newSectionCode, setNewSectionCode]     = useState('');
  const [vaultTeacher, setVaultTeacher]         = useState<TeacherData | null>(null);
  const [credentialsModal, setCredentialsModal] = useState<{ username: string; name: string; whatsappSent?: boolean } | null>(null);

  // ─── Phone Verification State (Teacher Registration) ────────────────────────
  const {
    phoneOtpSent,
    phoneOtpCode,
    setPhoneOtpCode,
    phoneVerified,
    verifiedPhoneNum,
    sendingOtp,
    verifyingOtp,
    devOtpCode, // shown in UI when WhatsApp is sandbox-blocked
    handleSendPhoneOtp: handleSendOtp,
    handleVerifyPhoneOtp: handleVerifyOtp,
    resetOtpState,
  } = usePhoneOtp({ phone: newTeacher.phone, showToast, verifiedNumberSnapshotAt: 'verify' });

  const [documents, setDocuments]           = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs]       = useState(false);
  const [docType, setDocType]               = useState('Photo');
  const [customDocType, setCustomDocType]   = useState('');
  const [uploadingDoc, setUploadingDoc]     = useState(false);
  const [deletingDocId, setDeletingDocId]   = useState<string | null>(null);

  const [expandedRosterId, setExpandedRosterId] = useState<string | null>(null);

  // ── Derived metrics ─────────────────────────────────────────────────────────
  const getStatus = (t: TeacherData) => statusToggles[t._id || ''] || t.status || 'active';
  const totalTeachers    = teachers.length;
  const activeCount      = teachers.filter(t => getStatus(t) === 'active').length;
  const classTeachersCount = teachers.filter(t => t.classTeacherOf).length;
  const avgWorkload      = totalTeachers > 0
    ? (teachers.reduce((s, t) => s + (t.assignedClass ? t.assignedClass.split(',').length : 0), 0) / totalTeachers).toFixed(1)
    : '0';

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filteredList = teachers.filter(t => {
    const q = searchQuery.toLowerCase();
    const matchQ = !q || t.name.toLowerCase().includes(q) || (t.employeeId || '').toLowerCase().includes(q) ||
      (t.phone || '').toLowerCase().includes(q) || (t.email || '').toLowerCase().includes(q);
    const matchStatus = filterStatus === 'All' || getStatus(t) === filterStatus.toLowerCase();
    const matchSubject = filterSubject === 'All' || (t.subjects || []).includes(filterSubject);
    const teacherClasses = t.assignedClass ? t.assignedClass.split(',').map(c => c.trim().toUpperCase()) : [];
    let matchGrade = true;
    if (filterGrade !== 'All') matchGrade = teacherClasses.some(c => c.split('-')[0] === filterGrade);
    let matchSection = true;
    if (filterSection !== 'All') matchSection = teacherClasses.some(c => c.split('-')[1] === filterSection);
    let matchClassTeacher = true;
    if (filterClassTeacher !== 'All') { const is = !!t.classTeacherOf; matchClassTeacher = filterClassTeacher === 'Yes' ? is : !is; }
    return matchQ && matchStatus && matchSubject && matchGrade && matchSection && matchClassTeacher;
  });

  const allChecked = filteredList.length > 0 && selectedIds.length === filteredList.length;
  const toggleAll  = () => setSelectedIds(allChecked ? [] : filteredList.map(t => t._id || '').filter(Boolean));
  const toggleOne  = (id: string) => setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const executeToggleLock = async (t: TeacherData) => {
    const cur = statusToggles[t._id] || t.status || 'active';
    const next = cur === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch(`${API_BASE}/teachers/${t._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) });
      const data = await res.json();
      if (data.success) { setStatusToggles(p => ({ ...p, [t._id]: next })); showToast?.(`${t.name} marked as ${next}.`, 'success'); }
      else showToast?.(data.message || 'Failed to update status.', 'error');
    } catch { setStatusToggles(p => ({ ...p, [t._id]: next })); showToast?.('Status toggled (offline mode).', 'success'); }
  };

  const executeResetPassword = async (id: string, name: string) => {
    try {
      const res = await fetch(`${API_BASE}/teachers/${id}/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (data.success) showToast?.(`Password reset successfully and new credentials were sent to ${name}'s WhatsApp.`, 'success');
      else showToast?.(data.message || 'WhatsApp message failed. Password was not changed.', 'error');
    } catch { showToast?.('Network error. Password was not changed.', 'error'); }
  };

  const handleAddSection = async (grade: string, code: string) => {
    const clean = code.trim().toUpperCase() || '-';
    try {
      const res = await fetch(`${API_BASE}/classes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ className: grade, section: clean }) });
      const data = await res.json();
      if (data.success) { showToast?.(`Section '${clean}' added to Grade ${grade}.`, 'success'); onClassesUpdate?.(); setAddingSectionGrade(null); setNewSectionCode(''); }
      else showToast?.(data.message || 'Failed to add section.', 'error');
    } catch { showToast?.('Error adding section.', 'error'); }
  };

  const executeDeleteClass = async (classId: string, label: string) => {
    try {
      const res = await fetch(`${API_BASE}/classes/${classId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { showToast?.(`${label} deleted.`, 'success'); onClassesUpdate?.(); }
      else showToast?.(data.message || 'Failed to delete class.', 'error');
    } catch { showToast?.('Network error deleting class.', 'error'); }
  };



  const handleTeacherFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacher.name || !newTeacher.gender || !newTeacher.dob || !newTeacher.phone || !newTeacher.email) { showToast?.('Please fill all required fields.', 'error'); return; }
    if (!phoneVerified) { showToast?.('Please verify the phone number first.', 'error'); return; }
    try {
      const res = await fetch(`${API_BASE}/teachers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newTeacher) });
      const data = await res.json();
      if (data.success) {
        showToast?.(`Teacher ${newTeacher.name} registered successfully.`, 'success');
        if (data.credentials) setCredentialsModal({ name: newTeacher.name, username: data.credentials.employeeId || data.credentials.username, whatsappSent: !!data.credentials.whatsappSent });
        onTeacherCreated?.(); setShowAddDrawer(false);
      } else showToast?.(data.message || data.error || 'Error creating teacher.', 'error');
    } catch { showToast?.('Network error. Check connection.', 'error'); }
  };

  const loadDocuments = async (id: string) => {
    if (!id) return;
    setLoadingDocs(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/teachers/${id}/documents`, { headers });
      const data = await res.json();
      if (data.success) setDocuments(data.data);
    } catch { setDocuments([]); }
    finally { setLoadingDocs(false); }
  };

  const handleOpenVault = (t: TeacherData) => { setVaultTeacher(t); setDocType('Photo'); setCustomDocType(''); loadDocuments(t._id); };

  const handleUploadDoc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const tId  = vaultTeacher?._id;
    if (!file || !tId) return;
    setUploadingDoc(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const finalType = docType === 'Other' ? customDocType.trim() || 'Other' : docType;
        const token = getAccessToken();
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res  = await fetch(`${API_BASE}/teachers/${tId}/documents`, { method: 'POST', headers, body: JSON.stringify({ docType: finalType, filename: file.name, base64: reader.result as string }) });
        const data = await res.json();
        if (data.success) { setCustomDocType(''); if (docType === 'Other') setDocType('Photo'); loadDocuments(tId); }
        else showToast?.(data.message || 'Upload failed.', 'error');
      } catch { showToast?.('Upload failed.', 'error'); }
      finally { setUploadingDoc(false); }
    };
  };

  const handleDeleteDoc = async (docId: string) => {
    const tId = vaultTeacher?._id;
    if (!tId) return;
    setDeletingDocId(docId);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res  = await fetch(`${API_BASE}/teachers/${tId}/documents/${docId}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (data.success) loadDocuments(tId);
      else showToast?.(data.message || 'Delete failed.', 'error');
    } catch { showToast?.('Delete failed.', 'error'); }
    finally { setDeletingDocId(null); }
  };

  const closeAddDrawer = () => {
    setShowAddDrawer(false);
    resetOtpState();
  };

  // ── Shared styles ────────────────────────────────────────────────────────────
  const fieldCls  = 'flex flex-col gap-1.5';
  const labelCls  = 'text-xs font-bold uppercase tracking-wide text-slate-500';
  const inputCls  = 'h-[38px] px-3 border-[1.5px] border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue transition-colors font-[inherit]';
  const selectCls = inputCls;
  const textareaCls = 'px-3 py-2 border-[1.5px] border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue transition-colors font-[inherit] resize-none';
  const tagItemCls = (selected: boolean, variant: 'blue' | 'green') => cn(
    'flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-md border cursor-pointer select-none transition-colors',
    selected
      ? variant === 'blue'
        ? 'bg-blue text-white border-blue'
        : 'bg-green text-white border-green'
      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
  );

  // ── Teacher form fields (shared by add/edit) ──────────────────────────────
  // NOTE: called as a plain function (not rendered as `<TeacherFormFields />`)
  // so it doesn't create a new component type on every render — a fresh type
  // per render makes React remount the subtree (and drop input focus) on
  // every keystroke.
  const renderTeacherFormFields = (isEdit = false) => (
    <div className="flex flex-col gap-4">
      {isEdit && (
        <div className={fieldCls}>
          <label className={labelCls}>Employee ID</label>
          <input className={inputCls} disabled value={newTeacher.employeeId || ''} />
        </div>
      )}
      <div className={fieldCls}>
        <label className={labelCls}>Teacher Name<RequiredMark /></label>
        <input className={inputCls} type="text" placeholder="e.g. Alice Smith" required value={newTeacher.name || ''} onChange={e => onNewTeacherChange('name', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className={fieldCls}>
          <label className={labelCls}>Gender<RequiredMark /></label>
          <select className={selectCls} required value={newTeacher.gender || 'male'} onChange={e => onNewTeacherChange('gender', e.target.value)}>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Date of Birth<RequiredMark /></label>
          <input className={inputCls} type="date" required value={newTeacher.dob || ''} onChange={e => onNewTeacherChange('dob', e.target.value)} />
        </div>

      </div>

      {/* Teaching classes */}
      <div className={fieldCls}>
        <label className={labelCls}>Teaching Class(es)</label>
        <div className="flex flex-wrap gap-2">
          {getSelectableClasses(classesList).map(c => {
            const cId  = `${c.className}-${c.section}`;
            const lbl  = formatClassName(c.className, c.section);
            const cur  = newTeacher.teachingClasses || [];
            const isSel = cur.includes(cId);
            return (
              <label key={c._id} className={tagItemCls(isSel, 'blue')}>
                <input type="checkbox" className="hidden" checked={isSel} onChange={e => {
                  const upd = e.target.checked ? [...cur, cId].filter(Boolean) : cur.filter((x: string) => x !== cId);
                  onNewTeacherChange('teachingClasses', upd);
                  onNewTeacherChange('assignedClass', upd.join(', '));
                }} />
                {isSel && <Check size={10} />} {lbl}
              </label>
            );
          })}
        </div>
      </div>

      {/* Subjects */}
      <div className={fieldCls}>
        <label className={labelCls}>Subject(s)</label>
        <div className="flex flex-wrap gap-2">
          {subjectsList.map(sub => {
            const cur   = newTeacher.subjects || [];
            const isSel = cur.includes(sub);
            return (
              <label key={sub} className={tagItemCls(isSel, 'green')}>
                <input type="checkbox" className="hidden" checked={isSel} onChange={e => {
                  const upd = e.target.checked ? [...cur, sub] : cur.filter((s: string) => s !== sub);
                  onNewTeacherChange('subjects', upd);
                }} />
                {isSel && <Check size={10} />} {sub}
              </label>
            );
          })}
        </div>
      </div>

      {/* Class teacher of */}
      <div className={fieldCls}>
        <label className={labelCls}>Class Teacher Of</label>
        <select className={selectCls} value={newTeacher.classTeacherOf || ''} onChange={e => onNewTeacherChange('classTeacherOf', e.target.value)}>
          <option value="">None / Not a Class Teacher</option>
          {getSelectableClasses(classesList).map(c => (
            <option key={c._id} value={`${c.className}-${c.section}`}>{formatClassName(c.className, c.section)}</option>
          ))}
        </select>
      </div>

      {/* Phone with OTP (add mode) or plain (edit mode) */}
      {!isEdit ? (
        <div className={fieldCls}>
          <label className={labelCls}>Phone Number<RequiredMark /></label>
          <div className="flex gap-2">
            <input className={cn(inputCls, 'flex-1')} type="tel" placeholder="e.g. 9876543210" required
              disabled={phoneVerified} value={newTeacher.phone || ''}
              onChange={e => { onNewTeacherChange('phone', e.target.value); if (phoneVerified || phoneOtpSent) { resetOtpState(); } }} />
            {!phoneVerified ? (
              <Button type="button" variant="secondary" size="sm" disabled={sendingOtp || !(newTeacher.phone || '').trim()} onClick={handleSendOtp}>
                {sendingOtp ? 'Sending…' : phoneOtpSent ? 'Resend' : 'Verify'}
              </Button>
            ) : (
              <Button type="button" variant="danger" size="sm" onClick={resetOtpState}>
                Change
              </Button>
            )}
          </div>
          {phoneOtpSent && !phoneVerified && (
            <>
              {devOtpCode && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-lt border border-amber-200 rounded-md text-amber-800 text-xs font-semibold mt-1">
                  <AlertTriangle size={12} /> Dev OTP (Sandbox): <span className="font-mono tracking-widest font-bold">{devOtpCode}</span>
                </div>
              )}
              <div className="flex gap-2 mt-1">
                <input className={cn(inputCls, 'flex-1')} type="text" placeholder="Enter 6-digit OTP"
                  value={phoneOtpCode} onChange={e => setPhoneOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                <Button type="button" size="sm" disabled={verifyingOtp || phoneOtpCode.length < 6} onClick={handleVerifyOtp}>
                  {verifyingOtp ? 'Verifying…' : 'Confirm OTP'}
                </Button>
              </div>
            </>
          )}
          {!phoneOtpSent && !phoneVerified && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">⚠️ Phone must be verified via WhatsApp before registering.</p>}
          {phoneVerified && (
            <div className="flex items-center gap-1.5 text-green text-xs font-bold mt-1">
              <Check size={13} /> Phone verified
            </div>
          )}
        </div>
      ) : (
        <div className={fieldCls}>
          <label className={labelCls}>Phone Number<RequiredMark /></label>
          <input className={inputCls} type="tel" placeholder="e.g. 9876543210" required value={newTeacher.phone || ''} onChange={e => onNewTeacherChange('phone', e.target.value)} />
        </div>
      )}

      <div className={fieldCls}>
        <label className={labelCls}>Email<RequiredMark /></label>
        <input className={inputCls} type="email" placeholder="e.g. alice@school.edu" required value={newTeacher.email || ''} onChange={e => onNewTeacherChange('email', e.target.value)} />
      </div>

      {isEdit && (
        <div className={fieldCls}>
          <label className={labelCls}>Status</label>
          <select className={selectCls} value={newTeacher.status || 'active'} onChange={e => onNewTeacherChange('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      )}
      <div className={fieldCls}>
        <label className={labelCls}>Area / Village Cluster</label>
        <input className={inputCls} type="text" placeholder="e.g. Madhapur, East Zone" value={newTeacher.cluster || ''} onChange={e => onNewTeacherChange('cluster', e.target.value)} />
      </div>
      <div className={fieldCls}>
        <label className={labelCls}>Monthly Salary (₹)</label>
        <input className={inputCls} type="number" min={0} placeholder="e.g. 25000" value={newTeacher.salary || ''} onChange={e => onNewTeacherChange('salary', Number(e.target.value))} />
      </div>
      <div className={fieldCls}>
        <label className={labelCls}>Address <span className="font-normal text-slate-400 dark:text-slate-500">(optional)</span></label>
        <textarea className={textareaCls} rows={2} placeholder="e.g. Plot 42, Jubilee Hills, Hyderabad" value={newTeacher.address || ''} onChange={e => onNewTeacherChange('address', e.target.value)} />
      </div>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900 dark:text-white">

      {/* PAGE HEADER */}
      <PageHeader
        title="Teachers Management"
        subtitle="Manage faculty profiles, assigned classes, and rosters."
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowClassesModal(true)}><FolderOpen size={15} /> Manage Classes</Button>
            <Button onClick={() => setShowAddDrawer(true)}><Plus size={15} /> Add Teacher</Button>
          </>
        }
      />

      {/* KPI STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="Total Teachers"  value={totalTeachers}      subtext="On roster"          icon={<Users size={17} />}         iconBg="bg-purple-lt" iconColor="text-purple" />
        <KpiCard label="Active Teachers" value={activeCount}        subtext={`${totalTeachers - activeCount} inactive`} icon={<UserCheck size={17} />} iconBg="bg-green-lt"  iconColor="text-green" valueColor="text-green" />
        <KpiCard label="Class Teachers"  value={classTeachersCount} subtext="Assigned to a class" icon={<GraduationCap size={17} />} iconBg="bg-blue-lt"   iconColor="text-blue" />
        <KpiCard label="Avg Workload"    value={avgWorkload}        subtext="Classes per teacher" icon={<BookOpen size={17} />}      iconBg="bg-amber-lt"  iconColor="text-amber" />
      </div>

      {/* FILTER TOOLBAR */}
      <FilterToolbar>
        <FilterGroup label="Search" className="flex-1 min-w-[220px]">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-slate-400 dark:text-slate-500 pointer-events-none" />
            <input type="text" className={cn(filterControlClass, 'pl-8')} placeholder="Name, ID, phone or email…"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
        </FilterGroup>
        <FilterGroup label="Status">
          <select className={cn(filterControlClass, 'min-w-[110px]')} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option>All</option><option>Active</option><option>Inactive</option>
          </select>
        </FilterGroup>
        <FilterGroup label="Subject">
          <select className={cn(filterControlClass, 'min-w-[130px]')} value={filterSubject} onChange={e => setFilterSubject(e.target.value)}>
            <option>All</option>{subjectsList.map(s => <option key={s}>{s}</option>)}
          </select>
        </FilterGroup>
        <FilterGroup label="Grade">
          <select className={cn(filterControlClass, 'min-w-[100px]')} value={filterGrade} onChange={e => setFilterGrade(e.target.value)}>
            <option>All</option>{ALL_GRADES.map(g => <option key={g}>{g}</option>)}
          </select>
        </FilterGroup>
        <FilterGroup label="Section">
          <select className={cn(filterControlClass, 'min-w-[100px]')} value={filterSection} onChange={e => setFilterSection(e.target.value)}>
            <option>All</option><option>A</option><option>B</option><option>C</option><option>D</option>
          </select>
        </FilterGroup>
        <FilterGroup label="Class Teacher">
          <select className={cn(filterControlClass, 'min-w-[100px]')} value={filterClassTeacher} onChange={e => setFilterClassTeacher(e.target.value)}>
            <option>All</option><option value="Yes">Yes</option><option value="No">No</option>
          </select>
        </FilterGroup>
        <ToolbarDivider />
        <div className="flex items-end">
          <Button variant="secondary" size="sm" onClick={resetFilters}>Reset</Button>
        </div>
      </FilterToolbar>

      {/* BULK ACTION BAR */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-lt border border-blue-200 rounded-lg">
          <span className="text-sm font-bold text-blue">{selectedIds.length} selected</span>
          {onDeleteTeachers && (
            <Button variant="danger" size="sm" onClick={() => onDeleteTeachers(selectedIds)}><Trash2 size={13} /> Delete</Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setSelectedIds([])}><X size={13} /> Clear</Button>
        </div>
      )}

      {/* TEACHER TABLE — desktop/tablet */}
      <div className="hidden md:block">
        <DataTable
          card
          header={
            <div className="flex items-center justify-between">
              <div className="text-md font-bold text-slate-900 dark:text-white">Teacher Directory</div>
              <span className="text-xs text-slate-400 dark:text-slate-500">{filteredList.length} of {teachers.length} teachers</span>
            </div>
          }
        >
          <thead>
            <tr>
              <Th style={{ width: 40 }}>
                <input type="checkbox" checked={allChecked} onChange={toggleAll} className="w-4 h-4 cursor-pointer accent-blue" />
              </Th>
              <Th>Teacher</Th>
              <Th>Contact</Th>
              <Th>Assigned Classes</Th>
              <Th className="text-center">Roster</Th>
              <Th className="text-center">Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filteredList.length === 0 ? (
              <tr><Td colSpan={7}>
                <EmptyState icon={<UserX size={32} />} title="No teachers match the current filters." />
              </Td></tr>
            ) : filteredList.map(t => {
              const tId    = t._id || '';
              const status = getStatus(t);
              const rosterStudents = students.filter(s => s.classTeacher?.toLowerCase() === t.name?.toLowerCase());
              const rosterCount    = rosterStudents.length;
              const [bg, fg] = getAvatarColors(t.name || 'T');

              return (
                <React.Fragment key={tId}>
                  <Tr className={selectedIds.includes(tId) ? 'bg-blue-lt/40' : ''}>
                    <Td>
                      <input type="checkbox" checked={selectedIds.includes(tId)} onChange={() => toggleOne(tId)} className="w-4 h-4 cursor-pointer accent-blue" />
                    </Td>

                    {/* Name + subjects */}
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold flex-shrink-0" style={{ background: bg, color: fg }}>
                          {(t.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white">{t.name}</div>
                          <div className="text-xs text-slate-400 dark:text-slate-500">{t.employeeId || 'ID Pending'}</div>
                          {(t.subjects || []).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(t.subjects as string[]).slice(0, 3).map(s => (
                                <span key={s} className="text-2xs font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 dark:text-slate-400 dark:text-slate-500 rounded">{s}</span>
                              ))}
                              {(t.subjects as string[]).length > 3 && (
                                <span className="text-2xs font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 dark:text-slate-400 dark:text-slate-500 rounded">+{(t.subjects as string[]).length - 3}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Td>

                    {/* Contact */}
                    <Td>
                      <div className="flex flex-col gap-1">
                        {t.phone && <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 dark:text-slate-500"><Phone size={11} className="text-blue flex-shrink-0" />{t.phone}</div>}
                        {t.email && <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 dark:text-slate-500 max-w-[160px]"><Mail size={11} className="text-green flex-shrink-0" /><span className="truncate">{t.email}</span></div>}
                        {t.cluster && <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 dark:text-slate-500"><MapPin size={11} className="text-amber flex-shrink-0" />{t.cluster}</div>}
                      </div>
                    </Td>

                    {/* Classes */}
                    <Td>
                      {t.assignedClass ? (
                        <div className="flex flex-wrap gap-1">
                          {t.assignedClass.split(',').filter(Boolean).map(c => (
                            <Badge key={c} variant="blue" size="sm">{c.trim()}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">Unassigned</span>
                      )}
                    </Td>

                    {/* Roster */}
                    <Td className="text-center">
                      {(t.classTeacherOf || rosterCount > 0) ? (
                        <Button variant="secondary" size="sm" onClick={() => onViewStudents(t.name)}>
                          <Users size={13} /> View Students ({rosterCount})
                        </Button>
                      ) : (
                        <span className="text-slate-300 text-sm">—</span>
                      )}
                    </Td>

                    {/* Status */}
                    <Td className="text-center">
                      <Badge variant={status === 'active' ? 'green' : 'gray'} size="sm">
                        {status === 'active' ? <><Check size={11} /> Active</> : <><Lock size={11} /> Locked</>}
                      </Badge>
                    </Td>

                    {/* Actions */}
                    <Td>
                      <div className="flex items-center gap-1.5 justify-end">
                        <button className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-600 text-blue hover:bg-blue-lt transition-colors" title="Documents Vault" onClick={() => handleOpenVault(t)}>
                          <FolderOpen size={16} />
                        </button>
                        {onMessageTeacher && (
                          <button className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-600 text-green hover:bg-green-lt transition-colors" title="Send WhatsApp" onClick={() => onMessageTeacher(t)}>
                            <MessageCircle size={16} />
                          </button>
                        )}
                        <button className={cn('w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 transition-colors',
                          status === 'active' ? 'text-amber hover:bg-amber-lt' : 'text-green hover:bg-green-lt'
                        )} title={status === 'active' ? 'Lock Account' : 'Unlock Account'} onClick={() => setLockTarget(t)}>
                          {status === 'active' ? <Lock size={16} /> : <Unlock size={16} />}
                        </button>
                        <button className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:bg-slate-900 transition-colors" title="Edit Profile" onClick={() => onEditTeacher(t)}>
                          <Edit size={16} />
                        </button>
                        <ActionButton iconOnly className="w-8 h-8 flex items-center justify-center rounded-md border border-red-200 text-red hover:bg-red-lt transition-colors" title="Delete Teacher" onClick={() => onDeleteTeacher(t)}>
                          <Trash2 size={16} />
                        </ActionButton>
                      </div>
                    </Td>
                  </Tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </DataTable>
      </div>

      {/* TEACHER CARDS — mobile */}
      <div className="md:hidden flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-md font-bold text-slate-900 dark:text-white">Teacher Directory</div>
          <span className="text-xs text-slate-400 dark:text-slate-500">{filteredList.length} of {teachers.length} teachers</span>
        </div>
        {filteredList.length > 0 && (
          <label className="flex items-center gap-2 px-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <input type="checkbox" checked={allChecked} onChange={toggleAll} className="w-4 h-4 cursor-pointer accent-blue" />
            Select all
          </label>
        )}
        {filteredList.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700">
            <EmptyState icon={<UserX size={32} />} title="No teachers match the current filters." />
          </div>
        ) : (
          <MobileCardList>
            {filteredList.map(t => {
              const tId = t._id || '';
              const status = getStatus(t);
              const rosterStudents = students.filter(s => s.classTeacher?.toLowerCase() === t.name?.toLowerCase());
              const rosterCount = rosterStudents.length;
              const isSelected = selectedIds.includes(tId);
              return (
                <MobileRowCard
                  key={tId}
                  title={
                    <span className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4 cursor-pointer accent-blue flex-shrink-0"
                        checked={isSelected} onChange={() => toggleOne(tId)}
                        onClick={(e) => e.stopPropagation()} />
                      {t.name}
                    </span>
                  }
                  subtitle={t.employeeId || 'ID Pending'}
                  badge={<Badge variant={status === 'active' ? 'green' : 'gray'} size="sm">
                    {status === 'active' ? <><Check size={11} /> Active</> : <><Lock size={11} /> Locked</>}
                  </Badge>}
                  className={isSelected ? 'bg-blue-lt/40' : undefined}
                  fields={[
                    ...(t.phone ? [{ label: 'Phone', value: t.phone }] : []),
                    ...(t.email ? [{ label: 'Email', value: t.email, fullWidth: true }] : []),
                    { label: 'Classes', value: t.assignedClass ? t.assignedClass.split(',').filter(Boolean).map(c => c.trim()).join(', ') : 'Unassigned', fullWidth: true },
                    ...((t.classTeacherOf || rosterCount > 0) ? [{ label: 'Roster', value: `${rosterCount} students` }] : []),
                  ]}
                  actions={
                    <>
                      {(t.classTeacherOf || rosterCount > 0) && (
                        <Button size="sm" variant="secondary" onClick={() => onViewStudents(t.name)}>
                          <Users size={13} /> Students
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => handleOpenVault(t)}>
                        <FolderOpen size={13} /> Vault
                      </Button>
                      {onMessageTeacher && (
                        <Button size="sm" variant="success" onClick={() => onMessageTeacher(t)}>
                          <MessageCircle size={13} /> Message
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => setLockTarget(t)}>
                        {status === 'active' ? <><Lock size={13} /> Lock</> : <><Unlock size={13} /> Unlock</>}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => onEditTeacher(t)}>
                        <Edit size={13} /> Edit
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => onDeleteTeacher(t)}>
                        <Trash2 size={13} /> Delete
                      </Button>
                    </>
                  }
                />
              );
            })}
          </MobileCardList>
        )}
      </div>

      {/* ── ADD TEACHER DRAWER ──────────────────────────────────────────────── */}
      <Drawer isOpen={showAddDrawer} onClose={closeAddDrawer} title="Add New Teacher"
        footer={
          <div className="flex gap-2">
            <Button type="submit" form="add-teacher-form" disabled={!phoneVerified} style={{ opacity: phoneVerified ? 1 : .5 }}>
              <Plus size={14} /> Register Teacher
            </Button>
            <Button variant="secondary" onClick={closeAddDrawer}>Cancel</Button>
          </div>
        }
      >
        <Form id="add-teacher-form" onSubmit={handleTeacherFormSubmit}>
          {renderTeacherFormFields(false)}
        </Form>
      </Drawer>

      {/* ── EDIT TEACHER MODAL ──────────────────────────────────────────────── */}
      <Modal isOpen={!!editingTeacherId} onClose={onCancelEditTeacher} title="Edit Teacher Profile" maxWidth="680px"
        footer={
          <div className="flex gap-2 items-center">
            <button type="button"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-md border bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
              onClick={() => editingTeacherId && setPwdResetTarget({ id: editingTeacherId, name: newTeacher.name })}>
              <Lock size={14} /> Reset Password
            </button>
            <div className="flex-1" />
            <Button variant="secondary" onClick={onCancelEditTeacher}>Cancel</Button>
            <Button type="submit" form="edit-teacher-form"><Check size={14} /> Save Changes</Button>
          </div>
        }
      >
        <Form id="edit-teacher-form" onSubmit={onCreateTeacher}>
          {renderTeacherFormFields(true)}
        </Form>
      </Modal>

      {/* ── CREDENTIALS MODAL ───────────────────────────────────────────────── */}
      <Modal isOpen={!!credentialsModal} onClose={() => setCredentialsModal(null)} title="🎉 Teacher Registered" maxWidth="480px"
        footer={<Button className="w-full justify-center" onClick={() => setCredentialsModal(null)}><Check size={14} /> Done</Button>}>
        {credentialsModal && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500"><strong>{credentialsModal.name}</strong> can log in using the Employee Portal.</p>
            <div className={cn('flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-semibold border', credentialsModal.whatsappSent ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800')}>
              {credentialsModal.whatsappSent ? '✅ Credentials sent to the registered WhatsApp number.' : '⚠️ Account created, but WhatsApp delivery could not be queued.'}
            </div>
            <div className="bg-blue-lt rounded-md p-3 border border-blue-200">
              <div className="text-2xs font-bold uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">Login ID (Employee ID)</div>
              <div className="text-sm font-bold font-mono text-blue">{credentialsModal.username}</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-md p-3 text-xs text-green-800 leading-relaxed">
              <strong>📋 Instructions:</strong><br />
              1. Open login → Employee Portal<br />
              2. Enter Employee ID + the temporary password sent via WhatsApp<br />
              3. You will be prompted to set a new password on first login
            </div>
          </div>
        )}
      </Modal>

      {/* ── LOCK CONFIRM ────────────────────────────────────────────────────── */}
      <Modal isOpen={!!lockTarget} onClose={() => setLockTarget(null)}
        title={lockTarget && (statusToggles[lockTarget._id] || lockTarget.status || 'active') === 'active' ? '🔒 Lock Account' : '🔓 Unlock Account'}
        maxWidth="420px"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setLockTarget(null)}>Cancel</Button>
            {lockTarget && (
              <Button variant={(statusToggles[lockTarget._id] || lockTarget.status || 'active') === 'active' ? 'danger' : 'success'}
                onClick={() => { executeToggleLock(lockTarget!); setLockTarget(null); }}>
                Confirm
              </Button>
            )}
          </div>
        }
      >
        {lockTarget && (
          <p className="text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500 leading-relaxed">
            {(statusToggles[lockTarget._id] || lockTarget.status || 'active') === 'active'
              ? <span>Lock <strong>{lockTarget.name}</strong>? They will be blocked from logging in.</span>
              : <span>Unlock <strong>{lockTarget.name}</strong>? They will regain portal access.</span>}
          </p>
        )}
      </Modal>

      {/* ── PASSWORD RESET CONFIRM ───────────────────────────────────────────── */}
      <Modal isOpen={!!pwdResetTarget} onClose={() => setPwdResetTarget(null)} title="Reset Teacher Password" maxWidth="420px"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setPwdResetTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { executeResetPassword(pwdResetTarget!.id, pwdResetTarget!.name); setPwdResetTarget(null); }}>Confirm Reset</Button>
          </div>
        }
      >
        {pwdResetTarget && (
          <p className="text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500 leading-relaxed">
            Reset the password for <strong>{pwdResetTarget.name}</strong>?<br />A new temporary password will be sent to their WhatsApp.
          </p>
        )}
      </Modal>

      {/* ── CLASS DELETE CONFIRM ─────────────────────────────────────────────── */}
      <Modal isOpen={!!classDelTarget} onClose={() => setClassDelTarget(null)} title="Delete Class / Section" maxWidth="420px"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setClassDelTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { executeDeleteClass(classDelTarget!.id, classDelTarget!.label); setClassDelTarget(null); }}>Delete</Button>
          </div>
        }
      >
        {classDelTarget && (
          <p className="text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500 leading-relaxed">
            Delete <strong>{classDelTarget.label}</strong>?<br />This removes the class/section configuration. Student enrollments may need updating.
          </p>
        )}
      </Modal>

      {/* ── CLASS & SECTION MANAGER DRAWER ──────────────────────────────────── */}
      <Drawer isOpen={showClassesModal} onClose={() => { setShowClassesModal(false); setAddingSectionGrade(null); setNewSectionCode(''); }}
        title="Class & Section Manager"
        footer={
          <Button variant="secondary" className="w-full justify-center"
            onClick={() => { setShowClassesModal(false); setAddingSectionGrade(null); setNewSectionCode(''); }}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="bg-green-50 border border-green-200 rounded-md px-3 py-2.5 text-xs text-green-800">
            💡 Select any predefined grade to manage or add sections. Misspellings are automatically prevented.
          </div>
          {ALL_GRADES.map(grade => {
            const active  = classesList.filter(c => c.className === grade);
            const display = active.length > 0 ? active : [{ _id: `VIRTUAL-${grade}`, className: grade, section: '-' } as any];
            const sorted  = [...display].sort((a, b) => (a.section || '').localeCompare(b.section || ''));
            const isAdding = addingSectionGrade === grade;

            return (
              <div key={grade} className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-0 flex-wrap">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 min-w-[80px]">Grade {grade}</span>
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {sorted.map(cls => {
                    const hasSection = cls.section && cls.section !== '-';
                    return (
                      <span key={cls._id} className={cn(
                        'inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border',
                        hasSection ? 'bg-blue-lt text-blue border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200 italic'
                      )}>
                        {hasSection ? cls.section : 'No Section'}
                        <button className="text-current opacity-60 hover:opacity-100 ml-0.5" onClick={() => {
                          if (cls._id.startsWith('VIRTUAL-')) { showToast?.('Cannot delete placeholder. Add a real section first.', 'error'); return; }
                          setClassDelTarget({ id: cls._id, label: formatClassName(cls.className, cls.section) });
                        }}>✕</button>
                      </span>
                    );
                  })}
                </div>
                <div className="flex-shrink-0">
                  {isAdding ? (
                    <Form onSubmit={async e => { e.preventDefault(); if (!newSectionCode) return; await handleAddSection(grade, newSectionCode); }} className="flex gap-1.5">
                      <input type="text" placeholder="e.g. A" maxLength={3} required autoFocus
                        value={newSectionCode} onChange={e => setNewSectionCode(e.target.value.toUpperCase().trim())}
                        className="w-16 h-[32px] px-2 text-xs border border-slate-200 dark:border-slate-600 rounded-md uppercase focus:border-blue outline-none" />
                      <Button type="submit" size="sm">Save</Button>
                      <Button type="button" variant="secondary" size="sm" onClick={() => { setAddingSectionGrade(null); setNewSectionCode(''); }}>✕</Button>
                    </Form>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => { setAddingSectionGrade(grade); setNewSectionCode(''); }}>+ Add Section</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Drawer>

      {/* ── TEACHER VAULT MODAL ─────────────────────────────────────────────── */}
      <Modal isOpen={!!vaultTeacher} onClose={() => { setVaultTeacher(null); setDocuments([]); }}
        title="🏫 Teacher Vault Gallery"
        subtitle={vaultTeacher ? `${vaultTeacher.name} · ${vaultTeacher.employeeId || 'N/A'}` : ''}
        maxWidth="720px"
        footer={<Button variant="secondary" onClick={() => { setVaultTeacher(null); setDocuments([]); }}>Close Gallery</Button>}
      >
        <div className="flex flex-col gap-4">
          {/* Upload */}
          <div className="flex flex-wrap gap-3 items-end p-4 bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 rounded-md">
            <div className={cn(fieldCls, 'flex-1 min-w-[160px]')}>
              <label className={labelCls}>Document Type</label>
              <select className={selectCls} value={docType} onChange={e => setDocType(e.target.value)}>
                <option value="Photo">Photo</option>
                <option value="Signature">Signature</option>
                <option value="Aadhaar / ID Proof">Aadhaar / ID Proof</option>
                <option value="Degree Certificate">Degree Certificate</option>
                <option value="Experience Letter">Experience Letter</option>
                <option value="Other">Other (Custom…)</option>
              </select>
            </div>
            {docType === 'Other' && (
              <div className={cn(fieldCls, 'flex-1 min-w-[140px]')}>
                <label className={labelCls}>Custom Name</label>
                <input className={inputCls} type="text" placeholder="e.g. PAN Card" value={customDocType} onChange={e => setCustomDocType(e.target.value)} />
              </div>
            )}
            <label className="flex items-center gap-1.5 h-[38px] px-4 rounded-md bg-blue text-white text-sm font-semibold cursor-pointer hover:bg-blue/90 transition-colors">
              <Paperclip size={13} />
              {uploadingDoc ? 'Uploading…' : 'Upload File'}
              <input type="file" className="hidden" disabled={uploadingDoc} onChange={handleUploadDoc} />
            </label>
          </div>

          {/* Documents */}
          {loadingDocs ? (
            <LoadingSpinner fullPage />
          ) : documents.length === 0 ? (
            <EmptyState icon={<FolderOpen size={32} />} title="No documents uploaded yet." />
          ) : (
            <div className="grid grid-cols-3 gap-4 max-[600px]:grid-cols-2">
              {documents.map(doc => {
                const isImg = /\.(jpg|jpeg|png|gif)$/i.test(doc.filename);
                const isPdf = /\.pdf$/i.test(doc.filename);
                return (
                  <div key={doc._id} className="relative flex flex-col border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
                    <ActionButton className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-red text-white hover:bg-red/90 transition-colors" onClick={() => handleDeleteDoc(doc._id)} disabled={deletingDocId === doc._id}>
                      {deletingDocId === doc._id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                    </ActionButton>
                    <div className="h-28 flex items-center justify-center bg-slate-50 dark:bg-slate-900 cursor-pointer" onClick={() => window.open(doc.downloadUrl, '_blank')}>
                      {isImg ? <img src={doc.downloadUrl} alt={doc.docType} className="h-full w-full object-cover" /> :
                        isPdf ? <FileText size={28} className="text-blue" /> : <FolderOpen size={28} className="text-blue" />}
                    </div>
                    <div className="p-2 flex flex-col gap-1">
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{doc.docType}</div>
                      <div className="text-2xs text-slate-400 dark:text-slate-500 truncate">{doc.filename}</div>
                      <Button variant="secondary" size="sm" className="w-full justify-center mt-1" onClick={() => window.open(doc.downloadUrl, '_blank')}>
                        <Eye size={11} /> View
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

    </div>
  );
};

export default AdminTeachers;

