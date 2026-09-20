import React, { useState } from 'react';
import { Building, Phone, MapPin, Calendar, Save, ArrowLeft, Upload, Trash2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useSchool, type SchoolProfileData } from '../../../context/schoolContext';
import { useAuth } from '../../../context/authContext';
import ImageCropper from '../../shared/ImageCropper/ImageCropper';


interface SchoolProfileSettingsProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onBack?: () => void;
}

const initialDefaultProfile: SchoolProfileData = {
  schoolInfo: { schoolName: 'RND School', schoolCode: 'SCH-001', logo: '' },
  contactInfo: { email: 'admin@schoolhub.edu', phone: '+91 9392646349', website: 'https://schoolhub.edu' },
  address: { addressLine: '123 Education Campus Road', city: 'Hyderabad', state: 'Telangana', pincode: '500001' },
  academicConfig: { currentAcademicYear: '2026-27', startTime: '08:30', endTime: '15:30' },
  communicationSettings: { whatsappEnabled: true, emailEnabled: true },
};

// ─── Shared field tokens ───────────────────────────────────────────────────────
const labelCls = 'text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';
const inputCls = 'h-10 px-3 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 dark:focus:ring-blue-900 transition-all font-[inherit] w-full placeholder:text-slate-300 dark:placeholder:text-slate-500';

function AccordionCard({
  id: _id, title, subtitle, icon: Icon, open, onToggle, children,
}: {
  id: string; title: string; subtitle: string; icon: React.ElementType;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden shadow-sm">
      <button type="button" onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
            <Icon size={15} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{subtitle}</div>
          </div>
        </div>
        {open
          ? <ChevronDown size={16} className="text-slate-400 dark:text-slate-500 flex-shrink-0" />
          : <ChevronRight size={16} className="text-slate-400 dark:text-slate-500 flex-shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 dark:border-slate-700 px-5 py-5 bg-white dark:bg-slate-800">
          {children}
        </div>
      )}
    </div>
  );
}

export default function SchoolProfileSettings({ showToast, onBack }: SchoolProfileSettingsProps) {
  const { schoolProfile, updateSchoolProfile } = useSchool();
  const { user } = useAuth();
  const [showLogoMenu, setShowLogoMenu] = useState(false);
  const [pendingLogo,  setPendingLogo]  = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);

  const [open, setOpen] = useState({ info: true, contact: true, academic: false });
  const toggle = (k: keyof typeof open) => setOpen(p => ({ ...p, [k]: !p[k] }));

  const [formData, setFormData] = useState<SchoolProfileData>(() => {
    const profile = {
      ...initialDefaultProfile,
      ...schoolProfile,
      schoolInfo:            { ...initialDefaultProfile.schoolInfo,            ...schoolProfile?.schoolInfo },
      contactInfo:           { ...initialDefaultProfile.contactInfo,           ...schoolProfile?.contactInfo },
      address:               { ...initialDefaultProfile.address,               ...schoolProfile?.address },
      academicConfig:        { ...initialDefaultProfile.academicConfig,        ...schoolProfile?.academicConfig },
      communicationSettings: { ...initialDefaultProfile.communicationSettings, ...schoolProfile?.communicationSettings },
    };
    if (user) {
      if (!profile.contactInfo.email || profile.contactInfo.email === 'admin@schoolhub.edu') profile.contactInfo.email = user.email || '';
      if (!profile.contactInfo.phone || profile.contactInfo.phone === '+91 98765 43210')      profile.contactInfo.phone = user.phone || '';
    }
    return profile;
  });

  const set = (section: keyof SchoolProfileData, field: string, value: any) =>
    setFormData(prev => ({ ...prev, [section]: { ...(prev[section] as any), [field]: value } }));

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Please select an image file (PNG/JPG)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = ev => setPendingLogo(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.schoolInfo.schoolName.trim()) { showToast('School name is required.', 'error'); return; }
    setSaving(true);
    const success = await updateSchoolProfile(formData);
    setSaving(false);
    showToast(
      success ? 'School Profile saved successfully!' : 'Failed to save School Profile. Please try again.',
      success ? 'success' : 'error'
    );
  };

  return (
    <div className="max-w-3xl flex flex-col gap-5 font-sans text-slate-900 dark:text-white">
      {/* Page heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          {onBack && (
            <button type="button" onClick={onBack}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-semibold transition-colors shadow-sm mb-3">
              <ArrowLeft size={15} /> Back to Settings
            </button>
          )}
          <h1 className="text-[22px] font-extrabold text-slate-900 dark:text-white tracking-tight">School Profile</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">Manage your school's official information, contact details, and academic schedule.</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-3">
        {/* ── Section 1: Basic Info ──────────────────────────────────────── */}
        <AccordionCard id="info" title="Basic School Information" subtitle="Name, code, logo" icon={Building} open={open.info} onToggle={() => toggle('info')}>
          {/* Logo row */}
          <div className="flex items-center gap-5 mb-5 pb-5 border-b border-slate-100 dark:border-slate-700">
            <div className="relative flex-shrink-0">
              <div
                className="w-16 h-16 rounded-xl border-2 border-slate-200 dark:border-slate-600 overflow-hidden bg-slate-50 dark:bg-slate-900 flex items-center justify-center cursor-pointer"
                onClick={() => setShowLogoMenu(m => !m)}>
                {formData.schoolInfo.logo
                  ? <img src={formData.schoolInfo.logo} alt="Logo" className="w-full h-full object-contain" />
                  : <Building size={24} className="text-slate-300" />}
              </div>
              {showLogoMenu && (
                <div className="absolute top-full left-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg py-1 z-20 min-w-[140px]"
                  onClick={e => e.stopPropagation()}>
                  <label className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-900 cursor-pointer">
                    <Upload size={13} className="text-slate-400 dark:text-slate-500" /> Upload Logo
                    <input type="file" accept="image/*" className="hidden" onChange={e => { handleLogoUpload(e); setShowLogoMenu(false); }} />
                  </label>
                  {formData.schoolInfo.logo && (
                    <button type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      onClick={() => { set('schoolInfo', 'logo', ''); showToast('Logo removed.'); setShowLogoMenu(false); }}>
                      <Trash2 size={13} /> Remove Logo
                    </button>
                  )}
                </div>
              )}
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{formData.schoolInfo.schoolName || 'School Name'}</div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{formData.schoolInfo.schoolCode}</div>
              <button type="button" onClick={() => setShowLogoMenu(m => !m)}
                className="mt-1.5 text-[11px] font-bold text-violet-600 hover:text-violet-800 transition-colors">
                Change Logo
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>School Name *</label>
              <input type="text" className={inputCls} required placeholder="e.g. RND School"
                value={formData.schoolInfo.schoolName} onChange={e => set('schoolInfo', 'schoolName', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>School Code *</label>
              <input type="text" className={inputCls} required placeholder="e.g. SCH-001"
                value={formData.schoolInfo.schoolCode} onChange={e => set('schoolInfo', 'schoolCode', e.target.value)} />
            </div>
          </div>
        </AccordionCard>

        {/* ── Section 2: Contact & Address ───────────────────────────────── */}
        <AccordionCard id="contact" title="Contact & Campus Address" subtitle="Email, phone, website, address" icon={Phone} open={open.contact} onToggle={() => toggle('contact')}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Official Email *</label>
              <input type="email" className={inputCls} required
                value={formData.contactInfo.email} onChange={e => set('contactInfo', 'email', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Primary Phone / WhatsApp *</label>
              <input type="text" className={inputCls} required
                value={formData.contactInfo.phone} onChange={e => set('contactInfo', 'phone', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className={labelCls}>Website URL</label>
              <input type="text" className={inputCls}
                value={formData.contactInfo.website || ''} onChange={e => set('contactInfo', 'website', e.target.value)} />
            </div>
          </div>

          {/* Address sub-section */}
          <div className="flex items-center gap-2 my-3">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <MapPin size={10} /> Campus Address
            </span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className={labelCls}>Address Line</label>
              <input type="text" className={inputCls}
                value={formData.address.addressLine} onChange={e => set('address', 'addressLine', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>City</label>
              <input type="text" className={inputCls}
                value={formData.address.city} onChange={e => set('address', 'city', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>State</label>
              <input type="text" className={inputCls}
                value={formData.address.state} onChange={e => set('address', 'state', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Pincode</label>
              <input type="text" className={inputCls}
                value={formData.address.pincode} onChange={e => set('address', 'pincode', e.target.value)} />
            </div>
          </div>
        </AccordionCard>

        {/* ── Section 3: Academic Schedule ───────────────────────────────── */}
        <AccordionCard id="academic" title="Academic Schedule & Working Hours" subtitle="Academic year, start & end time" icon={Calendar} open={open.academic} onToggle={() => toggle('academic')}>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Academic Year</label>
              <input type="text" className={inputCls} placeholder="e.g. 2026-27"
                value={formData.academicConfig.currentAcademicYear} onChange={e => set('academicConfig', 'currentAcademicYear', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>School Start Time</label>
              <input type="time" className={inputCls}
                value={formData.academicConfig.startTime} onChange={e => set('academicConfig', 'startTime', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>School End Time</label>
              <input type="time" className={inputCls}
                value={formData.academicConfig.endTime} onChange={e => set('academicConfig', 'endTime', e.target.value)} />
            </div>
          </div>
        </AccordionCard>

        {/* Save */}
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save School Profile</>}
          </button>
        </div>
      </form>

      {pendingLogo && (
        <ImageCropper
          imageSrc={pendingLogo}
          onConfirm={base64 => { set('schoolInfo', 'logo', base64); showToast('Logo updated.'); setPendingLogo(null); setShowLogoMenu(false); }}
          onClose={() => setPendingLogo(null)}
          onSelectNewFile={handleLogoUpload}
        />
      )}
    </div>
  );
}

