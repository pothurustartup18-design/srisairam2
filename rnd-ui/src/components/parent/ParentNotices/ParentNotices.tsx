import React, { useState } from 'react';
import { Megaphone, Calendar, Bell } from 'lucide-react';
import type { EventData } from '../../../types';
import { cn } from '../../../lib/utils';
import { EmptyState } from '../../ui';

interface ParentNoticesProps {
  events: EventData[];
}

const getMediaType = (url: string): 'image' | 'video' | 'audio' | 'document' => {
  const l = url.toLowerCase();
  if (/\.(png|jpg|jpeg|webp|gif)/.test(l)) return 'image';
  if (/\.(mp3|m4a|ogg|wav|aac)/.test(l))  return 'audio';
  if (/\.(mp4|mov|avi|3gp)/.test(l))       return 'video';
  return 'document';
};

const ParentNotices: React.FC<ParentNoticesProps> = ({ events }) => {
  const [boardTab, setBoardTab] = useState<'notices' | 'events'>('notices');

  const parentVisibleEvents = events.filter(e => e.sendAlertsTo !== 'teachers');
  const noticesList = parentVisibleEvents.filter(e => e.type ? e.type === 'notice' : (!e.media || e.media.length === 0));
  const eventsList  = parentVisibleEvents.filter(e => e.type ? e.type === 'event' : (e.media && e.media.length > 0));

  const tabs = [
    { key: 'notices' as const, label: 'General Notices', count: noticesList.length, Icon: Megaphone },
    { key: 'events'  as const, label: 'Scheduled Events', count: eventsList.length, Icon: Calendar },
  ];

  return (
    <div className="flex flex-col gap-4 font-sans text-slate-900">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">School Notice Board</h1>
        <p className="text-xs text-slate-500 mt-0.5">Announcements and events published by the school.</p>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-slate-100 rounded-lg p-1 gap-1 max-w-xs self-start w-full">
        {tabs.map(({ key, label, count, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setBoardTab(key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 h-8 rounded-md text-xs font-semibold transition-all',
              boardTab === key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <Icon size={13} />
            {label}
            <span className={cn(
              'text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center',
              boardTab === key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-500'
            )}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Notices board */}
      {boardTab === 'notices' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {noticesList.length === 0 ? (
            <div className="col-span-full">
              <EmptyState
                icon={<Megaphone size={32} />}
                title="No notices published yet."
                subtitle="Notices published by the school will appear here."
                className="bg-white border border-slate-200 rounded-2xl py-14"
              />
            </div>
          ) : (
            noticesList.map(n => (
              <div
                key={n._id}
                className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden group"
              >
                {/* Left accent bar + header row */}
                <div className="flex items-start gap-2.5 p-3 pb-2">
                  <div className="w-7 h-7 rounded-md bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bell size={14} className="text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Notice</span>
                      <span className="text-[10px] text-slate-400">·</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(n.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 leading-snug group-hover:text-indigo-700 transition-colors">{n.title}</h4>
                  </div>
                </div>
                {n.description && (
                  <p className="text-xs text-slate-500 leading-relaxed px-3 pb-3 line-clamp-2">{n.description}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Events board */}
      {boardTab === 'events' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {eventsList.length === 0 ? (
            <div className="col-span-full">
              <EmptyState
                icon={<Calendar size={32} />}
                title="No events scheduled yet."
                subtitle="Events published by the school will appear here."
                className="bg-white border border-slate-200 rounded-2xl py-14"
              />
            </div>
          ) : (
            eventsList.map(ev => (
              <div key={ev._id} className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden">
                {ev.media && ev.media.map((url, mi) => {
                  const type = getMediaType(url);
                  if (type === 'image')
                    return <div key={mi} className="h-44 bg-cover bg-center bg-slate-100 flex-shrink-0 rounded-t-2xl" style={{ backgroundImage: `url(${url})` }} />;
                  if (type === 'video')
                    return <video key={mi} src={url} controls className="w-full h-44 object-cover bg-black flex-shrink-0 rounded-t-2xl" />;
                  if (type === 'audio')
                    return (
                      <div key={mi} className="p-3 bg-slate-50 border-b border-slate-100 flex-shrink-0 rounded-t-2xl">
                        <audio src={url} controls className="w-full h-8" />
                      </div>
                    );
                  return null;
                })}
                <div className="p-4 flex-1 flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 block mb-1.5">
                    {new Date(ev.date).toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                  <h4 className="text-sm font-bold text-slate-900 mb-1.5">{ev.title}</h4>
                  {ev.description && (
                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">{ev.description}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ParentNotices;

