import React from 'react';
import {
  Image as ImageIcon, Film, Music, FileText, X, Megaphone, Calendar,
  Trash2, BellOff, Users, GraduationCap, Globe, Clock, Send, Plus
} from 'lucide-react';
import type { EventData, ClassData } from '../../../types';
import { sortClasses } from '../../../constants';
import { cn } from '../../../lib/utils';
import { Button, Badge, EmptyState } from '../../ui';

// ─── Types (unchanged) ────────────────────────────────────────────────────────
interface NewEventForm {
  title: string; description: string; date: string;
  media: string[];
  mediaAttachments?: { s3Key: string; filename: string; contentType?: string; size?: number; mediaType?: string }[];
  sendAlertsTo: 'none' | 'parents' | 'teachers' | 'both';
  classes: string[]; sections: string[]; scheduledAlertTime: string;
  type?: 'event' | 'notice';
}
interface AdminEventsProps {
  events: EventData[]; newEvent: NewEventForm;
  uploadingMedia: boolean; uploadedUrl: string;
  onNewEventChange: (fields: Partial<NewEventForm>) => void;
  onCreateEvent: (e: React.FormEvent) => void;
  onMediaUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveMedia?: (index: number) => void;
  onDeleteEvent?: (id: string) => void;
  classesList?: ClassData[];
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getMediaIcon = (url: string) => {
  const l = url.toLowerCase();
  if (/\.(png|jpg|jpeg|webp|gif)/.test(l)) return <ImageIcon size={14} className="text-blue-500" />;
  if (/\.(mp3|m4a|ogg|wav|aac)/.test(l))  return <Music size={14} className="text-emerald-500" />;
  if (/\.(mp4|mov|avi|3gp)/.test(l))      return <Film size={14} className="text-rose-500" />;
  return <FileText size={14} className="text-slate-500" />;
};

const getMediaType = (url: string): 'image' | 'video' | 'audio' | 'document' => {
  const l = url.toLowerCase();
  if (/\.(png|jpg|jpeg|webp|gif)/.test(l)) return 'image';
  if (/\.(mp3|m4a|ogg|wav|aac)/.test(l))  return 'audio';
  if (/\.(mp4|mov|avi|3gp)/.test(l))       return 'video';
  return 'document';
};

// ─── Shared field classes ─────────────────────────────────────────────────────
const labelCls = 'text-[11px] font-bold uppercase tracking-wider text-slate-400';
const inputCls = 'h-9 px-3 border border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all font-[inherit] w-full';

// ─── Section header inside a card ─────────────────────────────────────────────
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 my-3">
      <div className="flex-1 h-px bg-slate-100" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <div className="flex-1 h-px bg-slate-100" />
    </div>
  );
}

const AdminEvents: React.FC<AdminEventsProps> = ({
  events, newEvent, uploadingMedia, onNewEventChange, onCreateEvent,
  onMediaUpload, onRemoveMedia, onDeleteEvent, classesList = [],
}) => {
  const availableClasses = sortClasses(Array.from(new Set(classesList.map(c => c.className))));
  const [formTab,  setFormTab]  = React.useState<'notice' | 'event'>('notice');
  const [boardTab, setBoardTab] = React.useState<'notices' | 'events'>('notices');

  const noticesList = events.filter(e => e.type ? e.type === 'notice' : (!e.media || e.media.length === 0));
  const eventsList  = events.filter(e => e.type ? e.type === 'event' : (e.media && e.media.length > 0));

  const getTodayDateString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  const handleFormTabSwitch = (tab: 'notice' | 'event') => {
    setFormTab(tab);
    onNewEventChange({ type: tab, date: tab === 'notice' ? getTodayDateString() : '', media: [], mediaAttachments: [] });
  };

  React.useEffect(() => {
    if (formTab === 'notice' && !newEvent.date) onNewEventChange({ date: getTodayDateString() });
  }, [formTab]);

  const audienceOptions = [
    { key: 'none',     label: 'No Alerts',  Icon: BellOff,       color: '#64748b' },
    { key: 'parents',  label: 'Parents',    Icon: Users,         color: '#3b82f6' },
    { key: 'teachers', label: 'Teachers',   Icon: GraduationCap, color: '#10b981' },
    { key: 'both',     label: 'Both (All)', Icon: Globe,         color: '#6366f1' },
  ];

  return (
    <div className="flex gap-5 flex-wrap font-sans text-slate-900">

      {/* ═══════════════ LEFT — Create / Publish Form ════════════════════════ */}
      <div className="flex-[1_1_360px] flex flex-col gap-4">

        {/* Form type tabs */}
        <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
          {[
            { key: 'notice' as const, label: 'Post Notice', emoji: '📢', Icon: Megaphone },
            { key: 'event'  as const, label: 'Post Event',  emoji: '🎉', Icon: Calendar  },
          ].map(({ key, label, emoji, Icon }) => (
            <button key={key} type="button" onClick={() => handleFormTabSwitch(key)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 h-9 rounded-md text-sm font-semibold transition-all',
                formTab === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}>
              <Icon size={14} /> <span>{emoji} {label}</span>
            </button>
          ))}
        </div>

        {/* Form card */}
        <form onSubmit={onCreateEvent} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <h2 className="text-[13px] font-bold text-slate-700">
              {formTab === 'notice' ? '📢 Publish School Notice' : '🎉 Publish School Event'}
            </h2>
          </div>
          <div className="p-5 flex flex-col gap-4">

            {/* Title */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>{formTab === 'notice' ? 'Notice' : 'Event'} Title *</label>
              <input type="text" className={inputCls} required
                placeholder={formTab === 'notice' ? 'e.g. Weather Holiday Notice' : 'e.g. Annual Concert 2026'}
                value={newEvent.title} onChange={e => onNewEventChange({ title: e.target.value })} />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>{formTab === 'notice' ? 'Notice Details' : 'Event Description'} *</label>
              <textarea className="px-3 py-2.5 border border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all font-[inherit] resize-none w-full"
                rows={3} required
                placeholder={formTab === 'notice' ? 'Write the announcement details…' : 'Add event details for parents and teachers…'}
                value={newEvent.description} onChange={e => onNewEventChange({ description: e.target.value })} />
            </div>

            {/* Event-only: date + media */}
            {formTab === 'event' && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Event Date *</label>
                  <input type="date" className={inputCls} required
                    value={newEvent.date} onChange={e => onNewEventChange({ date: e.target.value })} />
                </div>

                {/* Media upload */}
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Cover Media <span className="text-slate-300 normal-case font-normal">images / videos / audio</span></label>
                  <div className={cn(
                    'flex items-center justify-between p-3 border border-dashed rounded-lg transition-colors',
                    uploadingMedia ? 'border-blue-300 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-slate-400'
                  )}>
                    <span className="text-xs text-slate-400">
                      {uploadingMedia ? 'Uploading…' : newEvent.media?.length > 0 ? `${newEvent.media.length} file(s) attached` : 'No files selected'}
                    </span>
                    <label className="flex items-center gap-1 text-xs font-bold text-blue-600 cursor-pointer hover:text-blue-800 transition-colors">
                      <Plus size={12} /> Add Files
                      <input type="file" accept="image/*,video/*,audio/*" multiple className="hidden" onChange={onMediaUpload} />
                    </label>
                  </div>

                  {newEvent.media?.length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      {newEvent.media.map((url, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md">
                          <div className="flex items-center gap-2 overflow-hidden">
                            {getMediaIcon(url)}
                            <span className="text-xs text-slate-600 truncate">
                              {decodeURIComponent(url.split('/').pop() || 'File').split('?')[0]}
                            </span>
                          </div>
                          <button type="button" onClick={() => onRemoveMedia?.(i)}
                            className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 ml-2">
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* WhatsApp scoping */}
            <SectionDivider label="WhatsApp Broadcast" />
            <div className="flex flex-col gap-2">
              <label className={labelCls}>Send Alert Notifications To</label>
              <div className="grid grid-cols-4 gap-2">
                {audienceOptions.map(aud => {
                  const isSelected = newEvent.sendAlertsTo === aud.key;
                  return (
                    <button
                      key={aud.key}
                      type="button"
                      onClick={() => onNewEventChange({ sendAlertsTo: aud.key as any, classes: [], sections: [] })}
                      className={cn(
                        'flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg border text-center transition-all',
                        isSelected
                          ? 'border-current text-[var(--c)] bg-[var(--cb)]'
                          : 'border-slate-200 text-slate-500 bg-white hover:border-slate-300'
                      )}
                      style={isSelected ? { '--c': aud.color, '--cb': `${aud.color}12` } as React.CSSProperties : {}}>
                      <aud.Icon size={16} style={{ color: isSelected ? aud.color : undefined }} />
                      <span className="text-[11px] font-bold">{aud.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Class targeting & schedule (shown when alerts enabled) */}
            {newEvent.sendAlertsTo !== 'none' && (
              <div className="flex flex-col gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                {availableClasses.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Target Classes <span className="text-slate-300 normal-case font-normal">leave empty for all</span></label>
                    <div className="flex flex-wrap gap-1.5">
                      {availableClasses.map(cls => {
                        const checked = newEvent.classes.includes(cls);
                        return (
                          <button key={cls} type="button"
                            onClick={() => {
                              const next = checked ? newEvent.classes.filter(v => v !== cls) : [...newEvent.classes, cls];
                              onNewEventChange({ classes: next });
                            }}
                            className={cn(
                              'text-[11px] font-bold px-2.5 py-1 rounded-full border transition-all',
                              checked ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-500 border-slate-300 hover:border-slate-500'
                            )}>
                            Class {cls}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label className={cn(labelCls, 'flex items-center gap-1')}>
                    <Clock size={11} /> Schedule for Later <span className="text-slate-300 normal-case font-normal">optional</span>
                  </label>
                  <input type="datetime-local" className={cn(inputCls, 'w-auto max-w-[220px]')}
                    value={newEvent.scheduledAlertTime} onChange={e => onNewEventChange({ scheduledAlertTime: e.target.value })} />
                </div>
              </div>
            )}

            {/* Submit */}
            <Button type="submit" className="w-full justify-center mt-1">
              {formTab === 'notice' ? '📢 Publish Notice & Broadcast' : '🎉 Publish Event & Broadcast'}
            </Button>
          </div>
        </form>
      </div>

      {/* ═══════════════ RIGHT — Board ═══════════════════════════════════════ */}
      <div className="flex-[1_1_460px] flex flex-col gap-3">
        {/* Board tabs */}
        <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
          {[
            { key: 'notices' as const, label: `📢 General Notices (${noticesList.length})`, Icon: Megaphone },
            { key: 'events'  as const, label: `🎉 Scheduled Events (${eventsList.length})`,  Icon: Calendar },
          ].map(({ key, label, Icon }) => (
            <button key={key} type="button" onClick={() => setBoardTab(key)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 h-9 rounded-md text-sm font-semibold transition-all',
                boardTab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Notices board */}
        {boardTab === 'notices' && (
          <div className="flex flex-col gap-2.5">
            {noticesList.length === 0 ? (
              <EmptyState icon={<Megaphone size={32} />} title="No notices published yet."
                subtitle="Notices you publish will appear here."
                className="bg-white border border-slate-200 rounded-lg py-14" />
            ) : noticesList.map(n => (
              <div key={n._id} className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="indigo" size="sm">Notice</Badge>
                    <span className="text-[11px] text-slate-400">
                      {new Date(n.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  {onDeleteEvent && (
                    <button type="button" onClick={() => onDeleteEvent(n._id)}
                      className="text-slate-300 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <h4 className="text-sm font-bold text-slate-900 mb-1">{n.title}</h4>
                <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">{n.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* Events board */}
        {boardTab === 'events' && (
          <div className="flex flex-col gap-2.5">
            {eventsList.length === 0 ? (
              <EmptyState icon={<Calendar size={32} />} title="No events scheduled yet."
                subtitle="Events you publish will appear here."
                className="bg-white border border-slate-200 rounded-lg py-14" />
            ) : eventsList.map(ev => (
              <div key={ev._id} className="bg-white border border-slate-200 rounded-lg overflow-hidden hover:shadow-sm transition-shadow">
                {ev.media?.map((url, mi) => {
                  const type = getMediaType(url);
                  if (type === 'image')
                    return <div key={mi} className="h-44 bg-cover bg-center bg-slate-100" style={{ backgroundImage: `url(${url})` }} />;
                  if (type === 'video')
                    return <video key={mi} src={url} controls className="w-full h-40 object-cover bg-black" />;
                  if (type === 'audio')
                    return <div key={mi} className="p-3 bg-slate-50 border-b border-slate-100"><audio src={url} controls className="w-full h-8" /></div>;
                  return null;
                })}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-slate-400">
                      {new Date(ev.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                    {onDeleteEvent && (
                      <button type="button" onClick={() => onDeleteEvent(ev._id)}
                        className="text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1">{ev.title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{ev.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminEvents;
