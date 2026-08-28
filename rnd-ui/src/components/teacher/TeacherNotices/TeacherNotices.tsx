import React, { useState } from 'react';
import { Calendar, Search, X, Megaphone, CalendarDays, ArrowUpDown } from 'lucide-react';
import type { EventData } from '../../../types';
import { PageHeader, EmptyState } from '../../ui';
import { cn } from '../../../lib/utils';

interface TeacherNoticesProps {
  events: EventData[];
}

const TeacherNotices: React.FC<TeacherNoticesProps> = ({ events }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'notice' | 'event'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);

  // Filter events
  const filteredEvents = events.filter(e => {
    const matchesSearch = 
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = 
      selectedType === 'all' || 
      (e.type || 'event') === selectedType;

    return matchesSearch && matchesType;
  });

  // Sort events
  const sortedEvents = [...filteredEvents].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return sortBy === 'newest' ? dateB - dateA : dateA - dateB;
  });

  return (
    <div className="flex flex-col gap-6 font-sans text-slate-900">
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-fade-in {
          animation: fadeIn 0.2s ease-out forwards;
        }
        .animate-scale-up {
          animation: scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      <PageHeader 
        title="School Notice Board" 
        subtitle="Stay updated with the latest official announcements, circulars, and events." 
      />

      {/* Controls: Search, Filter, Sort */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 border border-slate-200 rounded-xl shadow-sm">
        {/* Search */}
        <div className="relative w-full md:max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            className="h-10 w-full pl-10 pr-4 border border-slate-200 rounded-lg text-sm bg-slate-50/50 focus:bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all"
            placeholder="Search announcements..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter & Sort */}
        <div className="flex w-full md:w-auto gap-3 items-center flex-wrap sm:flex-nowrap">
          {/* Filter tabs */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            {(['all', 'notice', 'event'] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                className={cn(
                  "h-8 px-4 rounded-md text-xs font-bold capitalize transition-all",
                  selectedType === type 
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                {type === 'all' ? 'All' : type === 'notice' ? 'Notices' : 'Events'}
              </button>
            ))}
          </div>

          {/* Sort Dropdown */}
          <div className="relative flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 h-10 text-xs font-bold text-slate-600 hover:bg-slate-100/50 transition-colors">
            <ArrowUpDown size={13} className="text-slate-400" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'newest' | 'oldest')}
              className="bg-transparent outline-none cursor-pointer pr-1"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notices Grid */}
      {sortedEvents.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-12">
          <EmptyState 
            icon={<CalendarDays size={48} className="text-slate-300" />} 
            title="No announcements found" 
            subtitle={events.length === 0 ? "There are no active school notices published currently." : "Try adjusting your search query or filters to find what you are looking for."}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedEvents.map(e => {
            const isNotice = (e.type || 'event') === 'notice';
            return (
              <div 
                key={e._id} 
                onClick={() => setSelectedEvent(e)}
                className="group bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col hover:-translate-y-1.5 hover:shadow-md transition-all duration-300 cursor-pointer"
              >
                {/* Media Image Banner */}
                <div className="relative h-44 bg-slate-100 overflow-hidden">
                  {e.media && e.media[0] ? (
                    <div 
                      className="w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-500" 
                      style={{ backgroundImage: `url(${e.media[0]})` }} 
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100/80">
                      <Megaphone size={36} className="text-slate-300 group-hover:scale-110 transition-transform duration-300" />
                    </div>
                  )}

                  {/* Category Badge overlay */}
                  <span className={cn(
                    "absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm",
                    isNotice 
                      ? "bg-blue-50 text-blue border border-blue-100" 
                      : "bg-violet-50 text-violet-700 border border-violet-100"
                  )}>
                    {e.type || 'event'}
                  </span>
                </div>

                {/* Content */}
                <div className="p-5 flex flex-col flex-1 gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Calendar size={12} />
                    <span>
                      {new Date(e.date).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </span>
                  </div>

                  <h4 className="text-md font-bold text-slate-800 line-clamp-1 group-hover:text-blue transition-colors">
                    {e.title}
                  </h4>

                  <p className="text-sm text-slate-500 line-clamp-3 leading-relaxed flex-1">
                    {e.description}
                  </p>

                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue group-hover:underline">
                    <span>Read Details</span>
                    <span>→</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Notice Detail Modal */}
      {selectedEvent && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all animate-fade-in"
          onClick={() => setSelectedEvent(null)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden relative animate-scale-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Close Button */}
            <button 
              onClick={() => setSelectedEvent(null)}
              className="absolute right-4 top-4 bg-white/80 hover:bg-white text-slate-500 hover:text-slate-800 p-1.5 rounded-full shadow-sm z-10 transition-colors"
            >
              <X size={16} />
            </button>

            {/* Modal Banner */}
            <div className="h-56 bg-slate-100 relative">
              {selectedEvent.media && selectedEvent.media[0] ? (
                <div 
                  className="w-full h-full bg-cover bg-center" 
                  style={{ backgroundImage: `url(${selectedEvent.media[0]})` }} 
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                  <Megaphone size={48} className="text-slate-400" />
                </div>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                  (selectedEvent.type || 'event') === 'notice'
                    ? "bg-blue-50 text-blue border border-blue-100" 
                    : "bg-violet-50 text-violet-700 border border-violet-100"
                )}>
                  {selectedEvent.type || 'event'}
                </span>

                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Calendar size={13} />
                  <span>
                    {new Date(selectedEvent.date).toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight leading-tight">
                  {selectedEvent.title}
                </h3>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <p className="text-sm text-slate-600 leading-relaxed max-h-60 overflow-y-auto pr-1 whitespace-pre-wrap">
                  {selectedEvent.description}
                </p>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="px-5 h-10 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold transition-colors shadow-sm"
                >
                  Close Notice
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherNotices;
