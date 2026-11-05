import React, { useEffect, useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import type { ClassData } from '../../../types';
import { API_BASE, sortClasses, getSelectableClasses } from '../../../constants';
import { cn } from '../../../lib/utils';
import { Button, Drawer, RequiredMark } from '../../ui';

interface TeacherAddStudentProps {
  isOpen: boolean;
  onClose: () => void;
  /** Teacher's currently selected class, e.g. "2-" or "5-A". Used as the default class/section. */
  defaultClassSection?: string;
  onCreated: () => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

const emptyForm = (cls = '', sec = '-') => ({
  admissionAcademicYear: '2026-27',
  admissionNo: '',
  firstName: '', lastName: '',
  class: cls, section: sec,
  whatsappNo: '', motherWhatsappNo: '',
  transportMode: 'school', preferredLanguage: 'en',
  cluster: '', dateOfBirth: '', gender: '', bloodGroup: '', house: '',
  fatherName: '', motherName: '', address: '',
});

const fieldCls = 'flex flex-col gap-1.5';
const labelCls = 'text-xs font-bold uppercase tracking-wide text-slate-500';
const inputCls = 'h-[38px] px-3 border-[1.5px] border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue transition-colors font-[inherit]';
const textareaCls = 'px-3 py-2 border-[1.5px] border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue transition-colors font-[inherit] resize-none';

/**
 * Lets a teacher admit a new student from the Teacher portal. Uses the same
 * POST /api/students endpoint as the admin "Admit Student" form, so server-side
 * validation, the admission-number sequence and class-teacher auto-assignment
 * are all unchanged.
 */
const TeacherAddStudent: React.FC<TeacherAddStudentProps> = ({ isOpen, onClose, defaultClassSection, onCreated, showToast }) => {
  const [classesList, setClassesList] = useState<ClassData[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const set = (patch: Partial<ReturnType<typeof emptyForm>>) => setForm(prev => ({ ...prev, ...patch }));

  const fetchAdmissionNo = async (year: string) => {
    try {
      const res = await fetch(`${API_BASE}/students/next-admission-no?academicYear=${encodeURIComponent(year)}`);
      const data = await res.json();
      if (data.success) set({ admissionNo: data.nextAdmissionNo });
    } catch { /* preview only; the server assigns the real number on save */ }
  };

  useEffect(() => {
    if (!isOpen) return;
    const [dc, ds] = (defaultClassSection || '').split('-');
    setForm(emptyForm(dc || '', ds || '-'));
    fetchAdmissionNo('2026-27');
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/classes`);
        const data = await res.json();
        if (data.success) setClassesList(data.data || []);
      } catch { /* class dropdown stays empty; the server still validates */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const selectable = getSelectableClasses(classesList);
  const classNames = sortClasses(Array.from(new Set(selectable.map((c: any) => c.className))) as string[]);
  const sections = selectable.filter((c: any) => c.className === form.class);

  // Once classes load, make sure the chosen class/section actually exist.
  useEffect(() => {
    if (!classNames.length) return;
    if (!form.class || !classNames.includes(form.class)) {
      const first = classNames[0];
      set({ class: first, section: selectable.find((c: any) => c.className === first)?.section || '-' });
    } else if (sections.length && !sections.some((c: any) => c.section === form.section)) {
      set({ section: sections[0].section });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classesList]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const missing: string[] = [];
    if (!form.firstName.trim()) missing.push('First Name');
    if (!form.whatsappNo.trim()) missing.push('Father/Primary WhatsApp');
    if (!form.class) missing.push('Class');
    if (!form.section) missing.push('Section');
    if (missing.length) { showToast(`Required fields missing: ${missing.join(', ')}.`, 'error'); return; }
    if (form.whatsappNo.length !== 10) { showToast('Primary WhatsApp number must be exactly 10 digits.', 'error'); return; }
    if (form.motherWhatsappNo && form.motherWhatsappNo.length !== 10) { showToast('Mother WhatsApp number must be exactly 10 digits.', 'error'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, firstName: form.firstName.trim(), lastName: form.lastName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Student ${form.firstName.trim()} admitted successfully!`);
        onCreated();
        onClose();
      } else {
        showToast(data.message || data.error || 'Failed to add student.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to add student.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Add New Student"
      footer={
        <div className="flex gap-2">
          <Button type="submit" form="teacher-add-student-form" disabled={submitting} className="flex-1 justify-center">
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {submitting ? 'Adding...' : 'Add Student'}
          </Button>
          <Button variant="secondary" className="flex-1 justify-center" onClick={onClose}>Cancel</Button>
        </div>
      }
    >
      <form id="teacher-add-student-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-xs text-slate-500"><RequiredMark /> marks a mandatory field.</p>

        <div className="grid grid-cols-2 gap-4">
          <div className={fieldCls}>
            <label className={labelCls}>Academic Year</label>
            <select className={inputCls} value={form.admissionAcademicYear}
              onChange={e => { set({ admissionAcademicYear: e.target.value }); fetchAdmissionNo(e.target.value); }}>
              {['2024-25', '2025-26', '2026-27', '2027-28', '2028-29'].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Admission ID (Auto)</label>
            <input type="text" className={cn(inputCls, 'font-bold')} disabled placeholder="Fetching next ID..." value={form.admissionNo} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className={fieldCls}>
            <label className={labelCls}>Father/Primary WhatsApp<RequiredMark /></label>
            <input type="text" inputMode="numeric" placeholder="e.g. 9876543210" className={inputCls} pattern="[0-9]{10}" maxLength={10} required
              value={form.whatsappNo} onChange={e => set({ whatsappNo: e.target.value.replace(/\D/g, '') })} />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Mother WhatsApp (Optional)</label>
            <input type="text" inputMode="numeric" placeholder="e.g. 9876543211" className={inputCls} pattern="[0-9]{10}" maxLength={10}
              value={form.motherWhatsappNo} onChange={e => set({ motherWhatsappNo: e.target.value.replace(/\D/g, '') })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className={fieldCls}>
            <label className={labelCls}>First Name<RequiredMark /></label>
            <input type="text" placeholder="First Name" className={inputCls} required value={form.firstName} onChange={e => set({ firstName: e.target.value })} />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Last Name</label>
            <input type="text" placeholder="Last Name" className={inputCls} value={form.lastName} onChange={e => set({ lastName: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className={fieldCls}>
            <label className={labelCls}>Class<RequiredMark /></label>
            <select className={inputCls} required value={form.class} onChange={e => {
              const sel = e.target.value;
              const secs = selectable.filter((c: any) => c.className === sel);
              set({ class: sel, section: secs[0]?.section || '-' });
            }}>
              {classNames.map(cls => <option key={cls} value={cls}>{isNaN(Number(cls)) ? cls : `Class ${cls}`}</option>)}
            </select>
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Section<RequiredMark /></label>
            <select className={inputCls} required value={form.section} onChange={e => set({ section: e.target.value })}>
              {sections.length === 0
                ? <option value="-">No Section</option>
                : sections.map((c: any) => <option key={c._id} value={c.section}>{c.section === '-' ? 'No Section' : `Section ${c.section}`}</option>)}
            </select>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 -mt-2">The class teacher is assigned automatically from the class.</p>

        <div className="grid grid-cols-2 gap-4">
          <div className={fieldCls}>
            <label className={labelCls}>Transportation Mode</label>
            <select className={inputCls} value={form.transportMode} onChange={e => set({ transportMode: e.target.value })}>
              <option value="school">School Transport</option>
              <option value="private">Private Transport</option>
            </select>
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Preferred Language</label>
            <select className={inputCls} value={form.preferredLanguage} onChange={e => set({ preferredLanguage: e.target.value })}>
              <option value="en">English</option>
              <option value="te">Telugu</option>
              <option value="hi">Hindi</option>
            </select>
          </div>
        </div>

        <div className={fieldCls}>
          <label className={labelCls}>Area / Village Cluster</label>
          <input type="text" className={inputCls} placeholder="e.g. Madhapur, East Zone" value={form.cluster} onChange={e => set({ cluster: e.target.value })} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className={fieldCls}>
            <label className={labelCls}>Date of Birth</label>
            <input type="date" className={inputCls} value={form.dateOfBirth} onChange={e => set({ dateOfBirth: e.target.value })} />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Gender</label>
            <select className={inputCls} value={form.gender} onChange={e => set({ gender: e.target.value })}>
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
            <select className={inputCls} value={form.bloodGroup} onChange={e => set({ bloodGroup: e.target.value })}>
              <option value="">Select</option>
              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>House</label>
            <input type="text" className={inputCls} placeholder="e.g. Red House" value={form.house} onChange={e => set({ house: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className={fieldCls}>
            <label className={labelCls}>Father&apos;s Name</label>
            <input type="text" className={inputCls} value={form.fatherName} onChange={e => set({ fatherName: e.target.value })} />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Mother&apos;s Name</label>
            <input type="text" className={inputCls} value={form.motherName} onChange={e => set({ motherName: e.target.value })} />
          </div>
        </div>

        <div className={fieldCls}>
          <label className={labelCls}>Address</label>
          <textarea className={textareaCls} rows={2} placeholder="Full residential address" value={form.address} onChange={e => set({ address: e.target.value })} />
        </div>
      </form>
    </Drawer>
  );
};

export default TeacherAddStudent;
