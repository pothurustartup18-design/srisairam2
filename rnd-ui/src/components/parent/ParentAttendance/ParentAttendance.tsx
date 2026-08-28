import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Filter,
  Loader2,
  Calendar,
  Sparkles,
} from 'lucide-react';
import type { StudentData } from '../../../types';
import { API_BASE, formatClassName } from '../../../constants';
import { cn } from '../../../lib/utils';
import { EmptyState, Badge } from '../../ui';

interface AttendanceSummary {
  workingDays: number;
  presentDays: number;
  percentage: number;
}

interface AttendanceHistoryItem {
  date: string;
  status: 'present' | 'absent';
  morningStatus?: 'present' | 'absent';
  afternoonStatus?: 'present' | 'absent';
}

interface ParentAttendanceProps {
  ward: StudentData | undefined;
}

const ParentAttendance: React.FC<ParentAttendanceProps> = ({ ward }) => {
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [history, setHistory] = useState<AttendanceHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'present' | 'absent'>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  useEffect(() => {
    if (!ward) return;
    const studentId = ward.id || ward._id;
    let isMounted = true;
    setLoading(true);

    Promise.all([
      fetch(`${API_BASE}/attendance/summary/student/${studentId}`).then((r) => r.json()),
      fetch(`${API_BASE}/attendance/history/student/${studentId}`).then((r) => r.json()),
    ])
      .then(([resSummary, resHistory]) => {
        if (!isMounted) return;
        if (resSummary.success && resSummary.data) {
          setSummary(resSummary.data);
        }
        if (resHistory.success && Array.isArray(resHistory.data)) {
          setHistory(resHistory.data);
        }
      })
      .catch((err) => console.error('Failed to load attendance:', err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [ward]);

  // Extract available months for filtering
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    history.forEach((h) => {
      const d = new Date(h.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.add(key);
    });
    return Array.from(months).sort().reverse();
  }, [history]);

  // Filtered history list
  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      if (filterStatus !== 'all' && item.status !== filterStatus) return false;
      if (selectedMonth !== 'all') {
        const d = new Date(item.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (key !== selectedMonth) return false;
      }
      return true;
    });
  }, [history, filterStatus, selectedMonth]);

  if (!ward) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <EmptyState title="No student record linked to view attendance." />
      </div>
    );
  }

  const absentDays = summary ? Math.max(0, summary.workingDays - Math.floor(summary.presentDays)) : 0;
  const pct = summary ? summary.percentage : 0;

  const healthConfig =
    pct >= 90
      ? {
          label: 'Good Attendance',
          badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          desc: 'Your child meets and exceeds the recommended school attendance threshold.',
        }
      : pct >= 75
      ? {
          label: 'Needs Attention',
          badge: 'bg-amber-50 text-amber-800 border-amber-200',
          desc: 'Attendance is satisfactory but close to the minimum 75% requirement.',
        }
      : {
          label: 'Critical Threshold',
          badge: 'bg-rose-50 text-rose-700 border-rose-200',
          desc: 'Attendance has fallen below the mandatory 75% guideline. Please contact the class teacher.',
        };

  return (
    <div className="flex flex-col gap-4 font-sans text-slate-900">
      {/* ─── Page Header ─── */}
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Attendance Record</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Daily attendance tracking and session logs for {ward.name} ({formatClassName(ward.class, ward.section)}).
        </p>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center gap-3">
          <Loader2 size={24} className="animate-spin text-blue-600" />
          <span className="text-xs text-slate-500 font-medium">Loading attendance records…</span>
        </div>
      ) : (
        <>
          {/* ─── Top KPI Stat Grid ─── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 1. Overall Percentage */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
              <div className="flex items-center justify-between gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span>Attendance Rate</span>
                <Sparkles size={12} className="text-blue-500" />
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1 tracking-tight">
                {summary ? `${summary.percentage}%` : '0%'}
              </div>
              <div className="mt-1">
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border inline-block', healthConfig.badge)}>
                  {healthConfig.label}
                </span>
              </div>
            </div>

            {/* 2. Total Working Days */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
              <div className="flex items-center justify-between gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span>Working Days</span>
                <Calendar size={12} className="text-slate-400" />
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1 tracking-tight">
                {summary ? summary.workingDays : 0}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Recorded sessions</div>
            </div>

            {/* 3. Present Days */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
              <div className="flex items-center justify-between gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                <span>Days Present</span>
                <CheckCircle2 size={12} className="text-emerald-500" />
              </div>
              <div className="text-2xl font-extrabold text-emerald-700 mt-1 tracking-tight">
                {summary ? summary.presentDays : 0}
              </div>
              <div className="text-[11px] text-emerald-600/80 mt-1">Full & half sessions</div>
            </div>

            {/* 4. Absent Days */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
              <div className="flex items-center justify-between gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-600">
                <span>Days Absent</span>
                <XCircle size={12} className="text-rose-500" />
              </div>
              <div className="text-2xl font-extrabold text-rose-700 mt-1 tracking-tight">
                {absentDays}
              </div>
              <div className="text-[11px] text-rose-600/80 mt-1">Absences recorded</div>
            </div>
          </div>

          {/* ─── Health / Policy Banner ─── */}
          <div className={cn('p-3.5 rounded-xl border flex items-start gap-3', healthConfig.badge)}>
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold">{healthConfig.label}:</span> {healthConfig.desc}
            </div>
          </div>

          {/* ─── Daily History & Log ─── */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            {/* Header & Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <CalendarCheck size={15} className="text-indigo-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 m-0">Daily Attendance Log</h3>
                <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                  {filteredHistory.length}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Month Picker */}
                {availableMonths.length > 0 && (
                  <select
                    className="h-8 px-2.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white outline-none focus:border-blue-500 transition-colors cursor-pointer"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                  >
                    <option value="all">All Months</option>
                    {availableMonths.map((m) => {
                      const [year, month] = m.split('-');
                      const d = new Date(Number(year), Number(month) - 1, 1);
                      return (
                        <option key={m} value={m}>
                          {d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                        </option>
                      );
                    })}
                  </select>
                )}

                {/* Status Toggle Buttons */}
                <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
                  {(['all', 'present', 'absent'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFilterStatus(st)}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-xs font-bold capitalize transition-all cursor-pointer',
                        filterStatus === st ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                      )}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* List of records */}
            <div className="divide-y divide-slate-50">
              {filteredHistory.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <CalendarCheck size={32} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-xs font-semibold text-slate-600">No attendance entries matching this filter.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Daily registers marked by the teacher will appear here.</p>
                </div>
              ) : (
                filteredHistory.map((item, idx) => {
                  const d = new Date(item.date);
                  const isPresent = item.status === 'present';
                  const hasHalfDay = item.morningStatus || item.afternoonStatus;

                  return (
                    <div key={idx} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Date badge */}
                        <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex flex-col items-center justify-center flex-shrink-0 text-slate-700">
                          <span className="text-[9px] font-bold uppercase">{d.toLocaleDateString('en-IN', { month: 'short' })}</span>
                          <span className="text-xs font-extrabold leading-none">{d.getDate()}</span>
                        </div>

                        <div>
                          <div className="text-xs font-bold text-slate-800">
                            {d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
                          </div>
                          {hasHalfDay ? (
                            <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                              <span className={cn('font-semibold', item.morningStatus === 'present' ? 'text-emerald-600' : 'text-rose-600')}>
                                Morning: {item.morningStatus === 'present' ? 'Present' : 'Absent'}
                              </span>
                              <span>·</span>
                              <span className={cn('font-semibold', item.afternoonStatus === 'present' ? 'text-emerald-600' : 'text-rose-600')}>
                                Afternoon: {item.afternoonStatus === 'present' ? 'Present' : 'Absent'}
                              </span>
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400 mt-0.5">Full day session</div>
                          )}
                        </div>
                      </div>

                      {/* Status Tag */}
                      <div>
                        {isPresent ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5">
                            <CheckCircle2 size={12} /> Present
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 rounded-full px-2.5 py-0.5">
                            <XCircle size={12} /> Absent
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ParentAttendance;
