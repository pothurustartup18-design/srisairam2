import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Paperclip, CheckCircle2, Trash2, Loader2,
  BookOpen, Clock, AlertCircle, Users, X, Calendar
} from 'lucide-react';
import type { HomeworkData, ClassData } from '../../../types';
import { getAccessToken } from '../../../services/api';
import { API_BASE, formatClassName, formatRoomDisplay, sortClasses } from '../../../constants';
import { cn } from '../../../lib/utils';
import { Button, Badge, EmptyState, LoadingSpinner, Drawer } from '../../ui';
import { Form } from '../../ui/Form';
import { ActionButton } from '../../ui/ActionButton';

interface HomeworkBoardProps {
  mode: 'admin' | 'teacher' | 'parent';
  classesList?: ClassData[];
  assignedClasses?: string[];
  wardClassRoom?: string;
  wardId?: string;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

const emptyForm = { subject: '', title: '', description: '', dueDate: '' };

// ─── Shared field classes (same token system as all other modules) ─────────
const labelCls = 'text-[11px] font-bold uppercase tracking-wider text-slate-400';
const inputCls = 'h-9 px-3 border border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all font-[inherit] w-full';

const HomeworkBoard: React.FC<HomeworkBoardProps> = ({
  mode, classesList = [], assignedClasses = [], wardClassRoom, wardId, showToast,
}) => {
  const availableRooms = useMemo(() => {
    if (mode === 'admin') {
      if (!classesList || classesList.length === 0) return [];
      const distinctGrades = sortClasses(Array.from(new Set(classesList.map(c => c.className))));
      const list: { key: string; label: string }[] = [];
      distinctGrades.forEach(grade => {
        const matching = classesList.filter(c => c.className === grade);
        matching.forEach(c => {
          const roomKey = (!c.section || c.section === '-' || c.section === '--') ? c.className : `${c.className}-${c.section}`;
          const label = formatClassName(c.className, c.section);
          if (!list.some(r => r.key === roomKey)) {
            list.push({ key: roomKey, label });
          }
        });
      });
      return list;
    }
    if (mode === 'teacher') {
      return (assignedClasses || []).map(r => ({
        key: r,
        label: formatRoomDisplay(r)
      }));
    }
    if (wardClassRoom) {
      return [{ key: wardClassRoom, label: formatRoomDisplay(wardClassRoom) }];
    }
    return [];
  }, [mode, classesList, assignedClasses, wardClassRoom]);

  const [selectedRoom, setSelectedRoom] = useState(availableRooms[0]?.key || '');

  useEffect(() => {
    if ((!selectedRoom || !availableRooms.some(r => r.key === selectedRoom)) && availableRooms.length > 0) {
      setSelectedRoom(availableRooms[0].key);
    }
  }, [availableRooms, selectedRoom]);

  const selectedRoomObj = availableRooms.find(r => r.key === selectedRoom);
  const selectedRoomLabel = selectedRoomObj?.label || (selectedRoom ? formatRoomDisplay(selectedRoom) : 'your class');
  const [items,        setItems]        = useState<HomeworkData[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [showDrawer,   setShowDrawer]   = useState(false);
  const [form,         setForm]         = useState(emptyForm);
  const [attachments,  setAttachments]  = useState<string[]>([]);
  const [uploadingFile,setUploadingFile]= useState(false);
  const [saving,       setSaving]       = useState(false);
  const [ackingId,     setAckingId]     = useState<string | null>(null);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);

  // Date Filtering State
  const [filterType, setFilterType] = useState<'all' | 'today' | 'tomorrow' | 'custom'>('all');
  const [filterDate, setFilterDate] = useState<string>('');

  // Expandable Acknowledgements list for teachers/admins
  const [expandedAcks, setExpandedAcks] = useState<Record<string, boolean>>({});

  const toLocalYMD = (dateVal: string | Date) => {
    const d = new Date(dateVal);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const itemLocalYMD = toLocalYMD(item.dueDate);
      if (filterType === 'today') {
        return itemLocalYMD === toLocalYMD(new Date());
      }
      if (filterType === 'tomorrow') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return itemLocalYMD === toLocalYMD(tomorrow);
      }
      if (filterType === 'custom' && filterDate) {
        return itemLocalYMD === filterDate;
      }
      return true;
    });
  }, [items, filterType, filterDate]);

  useEffect(() => {
    if (!selectedRoom && availableRooms.length > 0) setSelectedRoom(availableRooms[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableRooms.join(',')]);

  const loadHomework = async () => {
    if (!selectedRoom) { setItems([]); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/homework/class/${encodeURIComponent(selectedRoom)}`);
      const data = await res.json();
      if (data.success) setItems(data.data);
    } catch { showToast('Failed to load homework.', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadHomework(); }, [selectedRoom]);

  // Presigned direct-to-S3 upload (see event.routes.ts POST /events/media/presign,
  // shared here — the S3 key layout isn't event-specific) — the file bytes go
  // straight from this browser to S3, never through Node as base64 JSON.
  const uploadHomeworkAttachment = async (file: File): Promise<string> => {
    const token = getAccessToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    try {
      const presignRes = await fetch(`${API_BASE}/events/media/presign`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ fileName: file.name })
      });
      const presignData = await presignRes.json();
      if (!presignData.success) throw new Error(presignData.message || 'Presign failed');

      const putRes = await fetch(presignData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file
      });
      if (!putRes.ok) throw new Error('Direct upload failed');

      return presignData.previewUrl as string;
    } catch {
      // Direct server-side upload fallback (bypasses browser CORS / S3 PUT issues)
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64Data = reader.result as string;
            const res = await fetch(`${API_BASE}/events/media/upload-direct`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ fileName: file.name, fileData: base64Data })
            });
            const data = await res.json();
            if (data.success && data.previewUrl) {
              resolve(data.previewUrl);
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

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;
    setUploadingFile(true);
    Promise.all(files.map(uploadHomeworkAttachment))
      .then(urls => setAttachments(prev => [...prev, ...urls]))
      .catch(() => showToast('Some attachments failed to upload.', 'error'))
      .finally(() => { setUploadingFile(false); e.target.value = ''; });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom) { showToast('Select a class room first.', 'error'); return; }
    if (!form.subject.trim() || !form.title.trim() || !form.dueDate) { showToast('Subject, title, and due date are required.', 'error'); return; }
    setSaving(true);
    try {
      const res  = await fetch(`${API_BASE}/homework`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classRoom: selectedRoom, subject: form.subject.trim(), title: form.title.trim(), description: form.description.trim(), dueDate: form.dueDate, attachments }) });
      const data = await res.json();
      if (data.success) { showToast('Homework posted.'); setForm(emptyForm); setAttachments([]); setShowDrawer(false); loadHomework(); }
      else showToast(data.message || 'Failed.', 'error');
    } catch { showToast('Server connection failed.', 'error'); }
    finally { setSaving(false); }
  };

  const handleAcknowledge = async (homeworkId: string) => {
    if (!wardId) return;
    setAckingId(homeworkId);
    try {
      const res  = await fetch(`${API_BASE}/homework/${homeworkId}/ack`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: wardId }) });
      const data = await res.json();
      if (data.success) { showToast('Marked as acknowledged.'); loadHomework(); }
      else showToast(data.message || 'Failed.', 'error');
    } catch { showToast('Server connection failed.', 'error'); }
    finally { setAckingId(null); }
  };

  const handleDelete = async (homeworkId: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeletingId(homeworkId);
    try {
      const res  = await fetch(`${API_BASE}/homework/${homeworkId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { showToast('Homework deleted.'); setItems(prev => prev.filter(i => i._id !== homeworkId)); }
      else showToast(data.message || 'Failed.', 'error');
    } catch { showToast('Server connection failed.', 'error'); }
    finally { setDeletingId(null); }
  };

  const canManage = mode === 'admin' || mode === 'teacher';

  // ─── KPI computations ─────────────────────────────────────────────────────
  const today = new Date().toDateString();
  const kpi = useMemo(() => ({
    total:    items.length,
    dueToday: items.filter(i => new Date(i.dueDate).toDateString() === today).length,
    overdue:  items.filter(i => new Date(i.dueDate) < new Date(today)).length,
    acked:    items.reduce((acc, i) => acc + i.acknowledgements.length, 0),
  }), [items, today]);

  // ─── Subject Badge Color Helper ───────────────────────────────────────────
  const getSubjectBadgeVariant = (subject: string): 'purple' | 'blue' | 'emerald' | 'amber' | 'indigo' | 'rose' => {
    const s = subject.toLowerCase();
    if (s.includes('math')) return 'indigo';
    if (s.includes('sci') || s.includes('phy') || s.includes('chem') || s.includes('bio')) return 'emerald';
    if (s.includes('eng') || s.includes('lit')) return 'purple';
    if (s.includes('hist') || s.includes('geo') || s.includes('soc')) return 'amber';
    if (s.includes('comp') || s.includes('tech') || s.includes('coding')) return 'blue';
    return 'rose';
  };

  // ─── Due-date helper ───────────────────────────────────────────────────────
  const getDueMeta = (dueDate: string) => {
    const d = new Date(dueDate);
    const todayDate = new Date(today);
    const isOverdue  = d < todayDate;
    const isDueToday = d.toDateString() === today;
    const formattedDate = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const label = isOverdue ? `Overdue (${formattedDate})` : isDueToday ? 'Due Today' : `Due: ${formattedDate}`;
    const cls   = isOverdue 
      ? 'text-rose-700 bg-rose-50 border-rose-200/90 shadow-2xs' 
      : isDueToday 
      ? 'text-amber-800 bg-amber-50 border-amber-200/90 shadow-2xs' 
      : 'text-indigo-700 bg-indigo-50 border-indigo-200/90 shadow-2xs';
    return { isOverdue, isDueToday, label, cls };
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900">

      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE-ONLY: Homework Board Mobile Screen (<768px)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="md:hidden parent-mobile-container">

        {/* ── 1. Hero Card ── */}
        <div className="ph-hero-card">
          <div className="ph-hero-top">
            <div className="ph-hero-identity">
              <div className="ph-date-pill">
                <BookOpen size={12} className="shrink-0" />
                <span>Homework Board</span>
              </div>
              <h2 className="ph-student-name">
                {items.length > 0 ? `${items.length} Assignment${items.length !== 1 ? 's' : ''}` : 'No Tasks'}
              </h2>
              <div className="ph-role-subtitle">
                <span className="ph-role-tag">{selectedRoomLabel}</span>
                {kpi.overdue > 0 && (
                  <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#fef2f2', background: 'rgba(239,68,68,0.3)', borderRadius: 6, padding: '2px 7px' }}>
                    {kpi.overdue} Overdue
                  </span>
                )}
              </div>
            </div>

            {/* Class selector ring / assignment count ring */}
            <div className="ph-rate-ring" style={{ cursor: 'default' }}>
              <svg width="58" height="58" viewBox="0 0 58 58">
                <circle cx="29" cy="29" r="22" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                <circle
                  cx="29" cy="29" r="22" fill="none"
                  stroke={kpi.overdue > 0 ? '#ef4444' : kpi.dueToday > 0 ? '#f59e0b' : '#10b981'}
                  strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 22}`}
                  strokeDashoffset={`${2 * Math.PI * 22 * (kpi.total === 0 ? 1 : Math.max(0, 1 - kpi.overdue / Math.max(kpi.total, 1)))}`}
                  transform="rotate(-90 29 29)"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
              </svg>
              <div className="ph-rate-ring-inner">
                <span className="ph-rate-ring-val">{kpi.dueToday}</span>
                <span className="ph-rate-ring-lbl">Today</span>
              </div>
            </div>
          </div>

          {/* Telemetry Strip */}
          <div className="ph-telemetry-strip">
            <div className="ph-telemetry-col">
              <span className="ph-telemetry-num">{kpi.total}</span>
              <span className="ph-telemetry-lbl">Total</span>
            </div>
            <div className="ph-telemetry-divider" />
            <div className="ph-telemetry-col">
              <span className={`ph-telemetry-num ${kpi.dueToday > 0 ? 'text-amber-600' : 'text-slate-700'}`}>{kpi.dueToday}</span>
              <span className="ph-telemetry-lbl">Due Today</span>
            </div>
            <div className="ph-telemetry-divider" />
            <div className="ph-telemetry-col">
              <span className={`ph-telemetry-num ${kpi.overdue > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{kpi.overdue}</span>
              <span className="ph-telemetry-lbl">Overdue</span>
            </div>
            <div className="ph-telemetry-divider" />
            <div className="ph-telemetry-col">
              <span className="ph-telemetry-num text-emerald-600">{kpi.acked}</span>
              <span className="ph-telemetry-lbl">Acknowledged</span>
            </div>
          </div>
        </div>

        {/* ── 2. Class selector (if multiple rooms) ── */}
        {availableRooms.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {availableRooms.map(room => (
              <button
                key={room.key}
                type="button"
                onClick={() => setSelectedRoom(room.key)}
                className={cn(
                  'ph-filter-chip shrink-0',
                  selectedRoom === room.key ? 'active' : ''
                )}
              >
                {room.label}
              </button>
            ))}
          </div>
        )}

        {/* ── 3. Date filter chips ── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[
            { type: 'all' as const, label: 'All Dates' },
            { type: 'today' as const, label: 'Due Today' },
            { type: 'tomorrow' as const, label: 'Tomorrow' },
          ].map(opt => (
            <button
              key={opt.type}
              type="button"
              onClick={() => { setFilterType(opt.type); setFilterDate(''); }}
              className={cn('ph-filter-chip shrink-0', filterType === opt.type ? 'active' : '')}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* ── 4. Add Homework FAB (teacher/admin) ── */}
        {canManage && (
          <button
            type="button"
            onClick={() => { setForm(emptyForm); setAttachments([]); setShowDrawer(true); }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm text-white"
            style={{ background: 'linear-gradient(135deg, #2563eb, #3b82f6)', boxShadow: '0 4px 16px rgba(37,99,235,0.3)' }}
          >
            <Plus size={16} />
            Post New Homework
          </button>
        )}

        {/* ── 5. Homework Cards List ── */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-400 text-xs">
            <Loader2 size={18} className="animate-spin text-blue-600" />
            <span>Loading assignments…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
              <BookOpen size={28} className="text-blue-400" />
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-slate-700">No homework posted yet</div>
              <div className="text-xs text-slate-400 mt-1">
                {canManage ? "Tap 'Post New Homework' to add an assignment." : "No homework has been posted for this class."}
              </div>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 bg-white rounded-2xl border border-slate-200">
            <Calendar size={28} className="text-slate-300" />
            <div className="text-sm font-bold text-slate-500">No homework for this date</div>
            <button type="button" onClick={() => setFilterType('all')} className="text-xs font-bold text-blue-600">
              Show All Dates
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredItems.map(item => {
              const { isOverdue, isDueToday, label: dueLabel, cls: dueCls } = getDueMeta(item.dueDate);
              const alreadyAcked = wardId ? item.acknowledgements.some(a => a.student === wardId) : false;
              const subjectColor = getSubjectBadgeVariant(item.subject);
              const colorMap: Record<string, { border: string; bg: string; text: string }> = {
                indigo:  { border: '#6366f1', bg: '#eef2ff', text: '#4338ca' },
                emerald: { border: '#10b981', bg: '#ecfdf5', text: '#065f46' },
                purple:  { border: '#a855f7', bg: '#faf5ff', text: '#7e22ce' },
                amber:   { border: '#f59e0b', bg: '#fffbeb', text: '#92400e' },
                blue:    { border: '#3b82f6', bg: '#eff6ff', text: '#1d4ed8' },
                rose:    { border: '#f43f5e', bg: '#fff1f2', text: '#be123c' },
              };
              const c = colorMap[subjectColor] || colorMap['blue'];
              const accentColor = isOverdue ? '#ef4444' : isDueToday ? '#f59e0b' : '#6366f1';

              return (
                <div
                  key={item._id}
                  className="bg-white rounded-2xl overflow-hidden"
                  style={{ border: `1px solid rgba(226,232,240,0.8)`, boxShadow: '0 2px 10px rgba(15,23,42,0.05)', borderLeft: `4px solid ${accentColor}` }}
                >
                  {/* Card Header */}
                  <div className="px-4 pt-4 pb-3">
                    {/* Subject pill + Due badge row */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span
                        className="text-[10.5px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg"
                        style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}30` }}
                      >
                        {item.subject}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold px-2.5 py-1 rounded-full border ${dueCls}`}>
                        {isOverdue ? <AlertCircle size={11} /> : isDueToday ? <Clock size={11} /> : <Calendar size={11} />}
                        {dueLabel}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-[14px] font-bold text-slate-900 leading-tight mb-1">{item.title}</h3>

                    {/* Description */}
                    {item.description && (
                      <p className="text-[12px] text-slate-500 leading-relaxed mt-1 line-clamp-2">{item.description}</p>
                    )}

                    {/* Attachments */}
                    {item.attachments?.length > 0 && (
                      <div className="flex gap-2 flex-wrap mt-2">
                        {item.attachments.map((url, i) => (
                          <a
                            key={i} href={url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold no-underline"
                            style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}
                          >
                            <Paperclip size={10} /> Attachment {i + 1}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between gap-2" style={{ background: '#fafbfd' }}>
                    {/* Posted by */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center justify-center shrink-0 uppercase">
                        {item.createdByName ? item.createdByName.charAt(0) : 'T'}
                      </div>
                      <span className="text-[11px] text-slate-500 truncate">
                        <strong className="text-slate-700">{item.createdByName || 'Teacher'}</strong>
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Parent: acknowledge */}
                      {mode === 'parent' && wardId && (
                        alreadyAcked ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={11} /> Done
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={ackingId === item._id}
                            onClick={() => handleAcknowledge(item._id)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg text-white border-0 cursor-pointer"
                            style={{ background: 'linear-gradient(135deg, #2563eb, #3b82f6)', boxShadow: '0 2px 6px rgba(37,99,235,0.25)' }}
                          >
                            {ackingId === item._id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                            Acknowledge
                          </button>
                        )
                      )}

                      {/* Teacher/Admin: ack count + delete */}
                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => setExpandedAcks(prev => ({ ...prev, [item._id]: !prev[item._id] }))}
                            className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-pointer"
                          >
                            <CheckCircle2 size={11} /> {item.acknowledgements.length}
                          </button>
                          <ActionButton
                            type="button"
                            disabled={deletingId === item._id}
                            onClick={() => handleDelete(item._id, item.title)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 cursor-pointer"
                          >
                            {deletingId === item._id ? <Loader2 size={12} className="animate-spin text-rose-500" /> : <Trash2 size={13} />}
                          </ActionButton>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded Acknowledgements */}
                  {canManage && expandedAcks[item._id] && (
                    <div className="px-4 py-3 border-t border-slate-100 bg-emerald-50/40">
                      <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <Users size={11} className="text-emerald-600" />
                        Acknowledged by {item.acknowledgements.length} student{item.acknowledgements.length !== 1 ? 's' : ''}
                      </div>
                      {item.acknowledgements.length === 0 ? (
                        <div className="text-xs text-slate-400 italic">No acknowledgements yet.</div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {item.acknowledgements.map((ack, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1 bg-white border border-emerald-200 rounded-lg px-2 py-0.5 text-[11px] text-emerald-800 font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                              {ack.studentName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DESKTOP-ONLY: Full Homework Board (md+)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex md:flex-col gap-5">

      {/* ─── PAGE HEADER (Matches Admin Style) ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-card">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 m-0">Homework &amp; Class Tasks</h2>
          <p className="text-sm text-slate-500 mt-1">
            Official daily homework assignments, project work, and submission tracking for {selectedRoomLabel}.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {availableRooms.length > 1 && (
            <select
              className="h-9 pl-3 pr-8 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 bg-white outline-none focus:border-blue-600 transition-colors appearance-none cursor-pointer shadow-2xs"
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
            >
              {availableRooms.map((room) => (
                <option key={room.key} value={room.key}>
                  {room.label}
                </option>
              ))}
            </select>
          )}

          {availableRooms.length === 1 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5">
              <BookOpen size={14} /> {selectedRoomLabel}
            </span>
          )}

          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
            {items.length} Assignment{items.length !== 1 ? 's' : ''}
          </span>

          {canManage && (
            <Button onClick={() => { setForm(emptyForm); setAttachments([]); setShowDrawer(true); }}>
              <Plus size={14} /> Post Homework
            </Button>
          )}
        </div>
      </div>

      {/* Modern KPI Stat Cards — admin/teacher only */}
      {canManage && (
        <div className="grid grid-cols-4 gap-3.5 max-[700px]:grid-cols-2">
          {[
            { label: 'Total Assignments', value: kpi.total,    icon: <BookOpen size={16} />,    color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-100' },
            { label: 'Due Today',         value: kpi.dueToday, icon: <Clock size={16} />,       color: 'text-amber-800',  bg: 'bg-amber-50 border-amber-100' },
            { label: 'Overdue',           value: kpi.overdue,  icon: <AlertCircle size={16} />, color: 'text-rose-700',   bg: 'bg-rose-50 border-rose-100' },
            { label: 'Acknowledged',      value: kpi.acked,    icon: <Users size={16} />,       color: 'text-emerald-800',bg: 'bg-emerald-50 border-emerald-100' },
          ].map(stat => (
            <div key={stat.label} className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200/80 bg-white shadow-2xs hover:shadow-xs transition-all">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border ${stat.bg} ${stat.color}`}>
                {stat.icon}
              </div>
              <div>
                <div className={`text-xl font-extrabold leading-none ${stat.color}`}>{stat.value}</div>
                <div className="text-xs font-medium text-slate-400 mt-1">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Date Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-xl shadow-2xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-600 mr-1 flex items-center gap-1.5">
            <Calendar size={13} className="text-slate-400" /> Filter by Due Date:
          </span>
          {[
            { type: 'all' as const, label: 'All Dates' },
            { type: 'today' as const, label: 'Today' },
            { type: 'tomorrow' as const, label: 'Tomorrow' },
          ].map(opt => (
            <button
              key={opt.type}
              type="button"
              onClick={() => { setFilterType(opt.type); setFilterDate(''); }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer',
                filterType === opt.type
                  ? 'bg-blue text-white border-blue shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100/70 hover:text-slate-900'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        
        {/* Custom date picker */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Or pick date:</span>
          <input
            type="date"
            value={filterDate}
            onChange={e => {
              setFilterDate(e.target.value);
              if (e.target.value) {
                setFilterType('custom');
              } else {
                setFilterType('all');
              }
            }}
            className="h-8 px-2.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all cursor-pointer"
          />
        </div>
      </div>

      {/* Homework list */}
      {loading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner /></div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={36} />}
          title="No homework posted yet."
          subtitle={canManage ? "Click 'Post Homework' to create the first assignment." : "No homework has been posted for this class."}
          className="bg-white border border-slate-200 rounded-xl py-14 shadow-2xs"
        />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={36} />}
          title="No homework found for this filter."
          subtitle="Try selecting a different date or choose 'All Dates' above."
          className="bg-white border border-slate-200 rounded-xl py-14 shadow-2xs"
        />
      ) : (
        <div className="flex flex-col gap-3.5">
          {filteredItems.map(item => {
            const { isOverdue, isDueToday, label: dueLabel, cls: dueCls } = getDueMeta(item.dueDate);
            const alreadyAcked = wardId ? item.acknowledgements.some(a => a.student === wardId) : false;

            return (
              <div
                key={item._id}
                className="bg-white border border-slate-200/90 rounded-xl shadow-2xs hover:shadow-md hover:border-slate-300 transition-all duration-200 overflow-hidden relative flex flex-col justify-between group"
              >
                {/* Left accent bar */}
                <div
                  className={cn(
                    'absolute left-0 top-0 bottom-0 w-1.5 transition-colors',
                    isOverdue  ? 'bg-gradient-to-b from-rose-500 to-red-600'   :
                    isDueToday ? 'bg-gradient-to-b from-amber-400 to-orange-500' :
                                 'bg-gradient-to-b from-indigo-500 to-blue-600'
                  )}
                />

                {/* Card body */}
                <div className="pl-6 pr-5 pt-4 pb-3 flex flex-col gap-2.5">
                  {/* Row 1: Subject badge + title + due date chip */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 flex-wrap">
                      <Badge variant={getSubjectBadgeVariant(item.subject)} size="sm" className="font-bold uppercase tracking-wider px-2.5 py-0.5">
                        {item.subject}
                      </Badge>
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors tracking-tight m-0 min-w-0 truncate">
                        {item.title}
                      </h3>
                    </div>
                    <div className={cn('flex-shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border', dueCls)}>
                      {isOverdue ? <AlertCircle size={13} className="text-rose-600" /> : isDueToday ? <Clock size={13} className="text-amber-600" /> : <Calendar size={13} className="text-indigo-600" />}
                      <span>{dueLabel}</span>
                    </div>
                  </div>

                  {/* Row 2: Description callout box */}
                  {item.description && (
                    <div className="mt-1 p-3 rounded-lg bg-slate-50/90 border border-slate-100 text-xs text-slate-700 leading-relaxed font-normal">
                      {item.description}
                    </div>
                  )}

                  {/* Row 3: Attachments */}
                  {item.attachments?.length > 0 && (
                    <div className="flex gap-2 flex-wrap mt-1">
                      {item.attachments.map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-100 text-indigo-700 text-xs font-semibold transition-all no-underline shadow-2xs"
                        >
                          <Paperclip size={12} className="text-indigo-500" />
                          <span>Attachment {i + 1}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card footer */}
                <div className="pl-6 pr-5 py-2.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center justify-center uppercase">
                        {item.createdByName ? item.createdByName.charAt(0) : 'U'}
                      </div>
                      <span className="text-slate-600 font-medium">
                        By <strong className="text-slate-800 font-bold">{item.createdByName}</strong>
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase rounded-full bg-slate-200/70 text-slate-600">
                        {item.createdBy ? 'Teacher' : 'Admin'}
                      </span>
                    </div>

                    {canManage && (
                      <>
                        <span className="text-slate-300">·</span>
                        <button
                          type="button"
                          onClick={() => setExpandedAcks(prev => ({ ...prev, [item._id]: !prev[item._id] }))}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/70 text-emerald-800 text-xs font-bold transition-all cursor-pointer"
                        >
                          <CheckCircle2 size={13} className="text-emerald-600" />
                          <span>{item.acknowledgements.length} Acknowledged</span>
                          <span className="text-[10px] font-normal text-emerald-700/80">
                            ({expandedAcks[item._id] ? 'Hide' : 'View'})
                          </span>
                        </button>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Parent: acknowledge action */}
                    {mode === 'parent' && wardId && (
                      alreadyAcked ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-200">
                          <CheckCircle2 size={13} /> Acknowledged
                        </span>
                      ) : (
                        <Button size="sm" variant="secondary" disabled={ackingId === item._id} onClick={() => handleAcknowledge(item._id)}>
                          {ackingId === item._id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                          Acknowledge
                        </Button>
                      )
                    )}

                    {/* Admin / teacher: delete */}
                    {canManage && (
                      <button
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200/60 hover:border-rose-200 transition-all cursor-pointer"
                        title="Delete homework"
                        disabled={deletingId === item._id}
                        onClick={() => handleDelete(item._id, item.title)}
                      >
                        {deletingId === item._id ? <Loader2 size={13} className="animate-spin text-rose-500" /> : <Trash2 size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Acknowledged Student List */}
                {canManage && expandedAcks[item._id] && (
                  <div className="pl-6 pr-5 py-3.5 bg-emerald-50/40 border-t border-slate-100/90 transition-all">
                    <div className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Users size={12} className="text-emerald-600" />
                      Acknowledged By ({item.acknowledgements.length} Student{item.acknowledgements.length !== 1 ? 's' : ''}):
                    </div>
                    {item.acknowledgements.length === 0 ? (
                      <div className="text-xs text-slate-500 italic">No students have acknowledged this assignment yet.</div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {item.acknowledgements.map((ack, idx) => (
                          <div
                            key={idx}
                            className="inline-flex items-center gap-1.5 bg-white border border-emerald-200/80 rounded-lg px-2.5 py-1 text-xs text-emerald-900 font-semibold shadow-2xs"
                          >
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span>{ack.studentName}</span>
                            <span className="text-[10px] text-slate-400 font-normal ml-0.5">
                              ({new Date(ack.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* ─── Post Homework Drawer ─────────────────────────────────────────────── */}
      <Drawer
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        title="Post Homework"
        subtitle={selectedRoom ? `Posting to ${selectedRoomLabel}` : undefined}
        footer={
          <div className="flex gap-2">
            <Button type="submit" form="hw-form" disabled={saving} className="flex-1 justify-center">
              {saving ? <><Loader2 size={12} className="animate-spin mr-1" />Posting…</> : 'Post Homework'}
            </Button>
            <button type="button" onClick={() => setShowDrawer(false)}
              className="flex items-center gap-1 px-4 h-9 rounded-md border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              <X size={13} /> Cancel
            </button>
          </div>
        }
      >
        <Form id="hw-form" onSubmit={handleCreate} className="flex flex-col gap-5">

          {/* Subject + Due Date — 2 columns */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Subject <span className="text-red-400 normal-case font-normal">*</span></label>
              <input type="text" className={inputCls} placeholder="e.g. Mathematics" required
                value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Due Date <span className="text-red-400 normal-case font-normal">*</span></label>
              <input type="date" className={inputCls} required
                value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
          </div>

          {/* Title — full width */}
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Title <span className="text-red-400 normal-case font-normal">*</span></label>
            <input type="text" className={inputCls} placeholder="e.g. Chapter 5 Practice Problems" required
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Description <span className="text-slate-300 normal-case font-normal">optional</span></label>
            <textarea
              className="px-3 py-2.5 border border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all font-[inherit] resize-none w-full"
              rows={3} placeholder="Explain the assignment, pages to refer, etc…"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>

          {/* Attachments */}
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Attachments <span className="text-slate-300 normal-case font-normal">optional</span></label>
            <div className={cn(
              'flex items-center justify-between p-3 border border-dashed rounded-lg transition-colors',
              uploadingFile ? 'border-blue-300 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-slate-400'
            )}>
              <div className="flex items-center gap-2">
                <Paperclip size={13} className="text-slate-400" />
                {uploadingFile ? (
                  <span className="text-xs font-semibold text-blue-600 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Uploading…</span>
                ) : attachments.length > 0 ? (
                  <span className="text-xs font-bold text-emerald-700">{attachments.length} file(s) ready</span>
                ) : (
                  <span className="text-xs text-slate-400">No files attached</span>
                )}
              </div>
              <label className="flex items-center gap-1 text-xs font-bold text-blue-600 cursor-pointer hover:text-blue-800 transition-colors">
                <span>Choose Files</span>
                <input type="file" multiple className="hidden" onChange={handleFileAttach} />
              </label>
            </div>
          </div>

        </Form>
      </Drawer>

    </div>
  );
};

export default HomeworkBoard;
