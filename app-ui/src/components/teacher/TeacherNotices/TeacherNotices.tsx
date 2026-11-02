import React, { useState, useEffect } from 'react';
import { Calendar, Search, X, Megaphone, CalendarDays, ArrowUpDown, RefreshCw, ChevronDown } from 'lucide-react';
import type { EventData } from '../../../types';
import { PageHeader, EmptyState } from '../../ui';
import { cn } from '../../../lib/utils';
import { API_BASE } from '../../../constants';
import { getAccessToken } from '../../../services/api';

interface TeacherNoticesProps {
  events: EventData[];
}

const PAGE_SIZE = 6;

const TeacherNotices: React.FC<TeacherNoticesProps> = ({ events: initialEvents }) => {
  const [events, setEvents] = useState<EventData[]>(initialEvents || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'notice' | 'event'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [refreshing, setRefreshing] = useState(false);

  // Sync with prop updates
  useEffect(() => {
    if (initialEvents && initialEvents.length > 0) {
      setEvents(initialEvents);
    }
  }, [initialEvents]);

  // Fetch freshest notices on mount to stay in sync with admin deletions/additions
  const fetchNotices = async () => {
    setRefreshing(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/events?t=${Date.now()}`, { headers });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setEvents(data.data);
      }
    } catch (err) {
      console.error('Failed to refresh notices:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNotices();
  }, []);

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

  const displayedEvents = sortedEvents.slice(0, visibleCount);
  const hasMore = sortedEvents.length > visibleCount;

  const noticesCount = events.filter(e => (e.type || 'event') === 'notice').length;
  const eventsCount = events.filter(e => (e.type || 'event') === 'event').length;

  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900">
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

      {/* Controls: Search, Filter, Sort, Refresh */}
      <div className="flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center bg-white p-3.5 border border-slate-200 rounded-xl shadow-sm">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            className="h-9 w-full pl-9 pr-8 border border-slate-200 rounded-lg text-xs bg-slate-50/50 focus:bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all"
            placeholder="Search announcements..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filter & Sort & Refresh */}
        <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap justify-between sm:justify-end">
          {/* Filter tabs */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            {(['all', 'notice', 'event'] as const).map(type => {
              const count = type === 'all' ? events.length : type === 'notice' ? noticesCount : eventsCount;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setSelectedType(type);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  className={cn(
                    "h-8 px-3 rounded-md text-xs font-bold capitalize transition-all flex items-center gap-1.5",
                    selectedType === type 
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  <span>{type === 'all' ? 'All' : type === 'notice' ? 'Notices' : 'Events'}</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full font-bold",
                    selectedType === type ? "bg-blue-50 text-blue font-extrabold" : "bg-slate-200 text-slate-600"
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sort Dropdown */}
          <div className="relative flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 h-8 text-xs font-bold text-slate-600 hover:bg-slate-100/50 transition-colors">
            <ArrowUpDown size={12} className="text-slate-400" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'newest' | 'oldest')}
              className="bg-transparent outline-none cursor-pointer pr-1 text-xs"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </div>

          {/* Refresh button */}
          <button
            type="button"
            title="Refresh announcements"
            onClick={fetchNotices}
            disabled={refreshing}
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <RefreshCw size={13} className={cn(refreshing && "animate-spin text-blue")} />
          </button>
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
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedEvents.map(e => {
              const isNotice = (e.type || 'event') === 'notice';
              const hasMedia = e.media && e.media[0];

              return (
                <div 
                  key={e._id} 
                  onClick={() => setSelectedEvent(e)}
                  className="group bg-white border border-slate-200 hover:border-blue-300 rounded-xl shadow-sm overflow-hidden flex flex-col hover:-translate-y-1 hover:shadow-md transition-all duration-200 cursor-pointer"
                >
                  {/* Media Image Banner only when an image is actually attached */}
                  {hasMedia && (
                    <div className="relative h-36 bg-slate-100 overflow-hidden">
                      <div 
                        className="w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-500" 
                        style={{ backgroundImage: `url(${e.media[0]})` }} 
                      />
                      <span className={cn(
                        "absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shadow-sm",
                        isNotice 
                          ? "bg-blue-50 text-blue border border-blue-200" 
                          : "bg-violet-50 text-violet-700 border border-violet-200"
                      )}>
                        {e.type || 'event'}
                      </span>
                    </div>
                  )}

                  {/* Card Content */}
                  <div className="p-4 flex flex-col flex-1 gap-1.5">
                    {/* Header Row: Category Badge (when no image) & Date */}
                    <div className="flex items-center justify-between gap-2">
                      {!hasMedia && (
                        <span className={cn(
                          "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider",
                          isNotice 
                            ? "bg-blue-50 text-blue border border-blue-200" 
                            : "bg-violet-50 text-violet-700 border border-violet-200"
                        )}>
                          {e.type || 'event'}
                        </span>
                      )}

                      <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium ml-auto">
                        <Calendar size={11} />
                        <span>
                          {new Date(e.date).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Title */}
                    <h4 className="text-sm font-bold text-slate-900 line-clamp-1 group-hover:text-blue transition-colors mt-0.5">
                      {e.title}
                    </h4>

                    {/* Description preview */}
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed flex-1">
                      {e.description || 'No additional details.'}
                    </p>

                    {/* Footer link */}
                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue group-hover:underline">
                      <span>Read Details</span>
                      <span>→</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination / Load More Controls */}
          {hasMore && (
            <div className="flex justify-center pt-2 pb-4">
              <button
                type="button"
                onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                className="h-10 px-6 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-sm flex items-center gap-2 transition-all hover:border-slate-300"
              >
                <span>Show More Announcements</span>
                <span className="text-[11px] px-2 py-0.5 bg-slate-100 rounded-full text-slate-500 font-semibold">
                  {sortedEvents.length - visibleCount} remaining
                </span>
                <ChevronDown size={14} className="text-slate-400" />
              </button>
            </div>
          )}

          {!hasMore && sortedEvents.length > PAGE_SIZE && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleCount(PAGE_SIZE)}
                className="text-xs font-semibold text-slate-400 hover:text-slate-600 hover:underline"
              >
                Show Fewer Announcements
              </button>
            </div>
          )}
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

            {/* Modal Banner only if image exists */}
            {selectedEvent.media && selectedEvent.media[0] ? (
              <div className="h-56 bg-slate-100 relative">
                <div 
                  className="w-full h-full bg-cover bg-center" 
                  style={{ backgroundImage: `url(${selectedEvent.media[0]})` }} 
                />
              </div>
            ) : (
              <div className="p-6 pb-0 flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-blue-50 text-blue flex items-center justify-center">
                  <Megaphone size={18} />
                </div>
              </div>
            )}

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className={cn(
                  "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
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
                <h3 className="text-lg font-bold text-slate-900 tracking-tight leading-snug">
                  {selectedEvent.title}
                </h3>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-600 leading-relaxed max-h-60 overflow-y-auto pr-1 whitespace-pre-wrap">
                  {selectedEvent.description || 'No additional details provided.'}
                </p>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="px-4 h-9 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold transition-colors shadow-sm"
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
