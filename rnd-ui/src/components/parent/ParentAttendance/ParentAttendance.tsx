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
  Phone,
  UserCheck,
} from 'lucide-react';
import type { StudentData } from '../../../types';
import { API_BASE, formatClassName } from '../../../constants';
import { cn } from '../../../lib/utils';
import { EmptyState } from '../../ui';

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
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-card">
        <EmptyState title="No student record linked to view attendance." />
      </div>
    );
  }

  const isLowAttendance = summary && summary.workingDays >= 5 && summary.percentage < 75;

  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900">
      {/* ─── PAGE HEADER (Matches Admin Design) ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-card">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 m-0">Attendance Record &amp; Logs</h2>
          <p className="text-sm text-slate-500 mt-1">
            Official daily session tracking and attendance compliance records for {ward.name} ({formatClassName(ward.class, ward.section)}).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-xs font-bold rounded-lg px-3 py-1.5 border',
              (summary?.percentage || 0) >= 75
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            )}
          >
            <CalendarCheck size={14} /> {(summary?.percentage || 0) >= 75 ? 'Attendance Compliant' : 'Below 75% Threshold'}
          </span>
        </div>
      </div>

      {/* ─── 4 KPI STAT CARDS (Matches Admin Style) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Attendance Rate */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <CalendarCheck size={18} />
            </div>
            <span
              className={cn(
                'text-xs font-bold px-2 py-0.5 rounded-full',
                (summary?.percentage || 0) >= 75 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              )}
            >
              {(summary?.percentage || 0) >= 75 ? 'Good' : 'Critical'}
            </span>
          </div>
          <div className="mt-3">
            <div className="text-xs font-semibold text-slate-500">Attendance Rate</div>
            <div className="text-2xl font-extrabold text-slate-900 mt-0.5">
              {summary ? `${summary.percentage}%` : '—'}
            </div>
            <div className="text-xs text-slate-400 mt-1">Current term aggregate</div>
          </div>
        </div>

        {/* 2. Working Days */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
              <Clock size={18} />
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              Total Sessions
            </span>
          </div>
          <div className="mt-3">
            <div className="text-xs font-semibold text-slate-500">Working Days</div>
            <div className="text-2xl font-extrabold text-slate-900 mt-0.5">
              {summary ? `${summary.workingDays} Days` : '—'}
            </div>
            <div className="text-xs text-slate-400 mt-1">Recorded academic days</div>
          </div>
        </div>

        {/* 3. Present Days */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 size={18} />
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
              Present
            </span>
          </div>
          <div className="mt-3">
            <div className="text-xs font-semibold text-slate-500">Days Present</div>
            <div className="text-2xl font-extrabold text-emerald-700 mt-0.5">
              {summary ? `${summary.presentDays} Days` : '—'}
            </div>
            <div className="text-xs text-slate-400 mt-1">Full &amp; half day sessions</div>
          </div>
        </div>

        {/* 4. Absent Days */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <XCircle size={18} />
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">
              Absent
            </span>
          </div>
          <div className="mt-3">
            <div className="text-xs font-semibold text-slate-500">Days Absent</div>
            <div className="text-2xl font-extrabold text-rose-700 mt-0.5">
              {summary ? `${summary.workingDays - summary.presentDays} Days` : '—'}
            </div>
            <div className="text-xs text-slate-400 mt-1">Total missed classes</div>
          </div>
        </div>
      </div>

      {/* Warning Notice if below 75% */}
      {isLowAttendance && (
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/80 flex items-start gap-3 text-rose-900 text-xs">
          <AlertCircle size={16} className="text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold">Attendance Warning:</strong> Student attendance has fallen below the mandatory 75% school policy threshold ({summary?.percentage}%). Please ensure regular attendance or submit medical / leave documentation to the class teacher.
          </div>
        </div>
      )}

      {/* ─── 2-COLUMN BALANCED LAYOUT ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
        {/* ─── LEFT COLUMN: Daily Attendance Log ─── */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-card overflow-hidden">
          {/* Header with Filter Controls */}
          <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar size={15} className="text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900 m-0">Daily Attendance Log</h3>
              <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                {filteredHistory.length}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Month Selector */}
              {availableMonths.length > 0 && (
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-8 pl-2.5 pr-6 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white outline-none focus:border-blue-600 transition-colors"
                >
                  <option value="all">All Months</option>
                  {availableMonths.map((m) => {
                    const [yr, mo] = m.split('-');
                    const label = new Date(Number(yr), Number(mo) - 1).toLocaleString('en-IN', {
                      month: 'long',
                      year: 'numeric',
                    });
                    return (
                      <option key={m} value={m}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              )}

              {/* Status Tab Filters */}
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                {(['all', 'present', 'absent'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setFilterStatus(st)}
                    className={cn(
                      'px-2.5 py-1 text-xs font-bold rounded-md transition-all capitalize cursor-pointer border-0',
                      filterStatus === st
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800 bg-transparent'
                    )}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* History List */}
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-400 text-xs">
              <Loader2 size={16} className="animate-spin text-blue-600" /> Loading log…
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No attendance records found for this selection.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {filteredHistory.map((item, idx) => {
                const d = new Date(item.date);
                const isPresent = item.status === 'present';

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3.5 sm:px-5 hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center flex-shrink-0 leading-none">
                        <span className="text-[9px] font-extrabold text-slate-400 uppercase">
                          {d.toLocaleDateString('en-IN', { month: 'short' })}
                        </span>
                        <span className="text-sm font-extrabold text-slate-900 mt-0.5">
                          {d.getDate()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Morning:{' '}
                          <span className={item.morningStatus === 'present' ? 'font-bold text-emerald-600' : 'font-bold text-rose-600'}>
                            {item.morningStatus ? (item.morningStatus === 'present' ? 'Present' : 'Absent') : (isPresent ? 'Present' : 'Absent')}
                          </span>{' '}
                          · Afternoon:{' '}
                          <span className={item.afternoonStatus === 'present' ? 'font-bold text-emerald-600' : 'font-bold text-rose-600'}>
                            {item.afternoonStatus ? (item.afternoonStatus === 'present' ? 'Present' : 'Absent') : (isPresent ? 'Present' : 'Absent')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      {isPresent ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-1">
                          <CheckCircle2 size={12} /> Present
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 rounded-full px-2.5 py-1">
                          <XCircle size={12} /> Absent
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── RIGHT COLUMN: Donut Summary & Guidelines ─── */}
        <div className="flex flex-col gap-5">
          {/* Donut Visual Summary Card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-card p-5 text-center">
            <div className="text-xs font-bold text-slate-900 mb-3">Attendance Distribution</div>

            <div className="relative w-32 h-32 mx-auto my-2 flex items-center justify-center">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#f1f5f9"
                  strokeWidth="3.8"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="3.8"
                  strokeDasharray={`${summary?.percentage || 0}, 100`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-extrabold text-slate-900 leading-none">
                  {summary?.percentage || 0}%
                </span>
                <span className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Present</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 text-xs">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <div className="text-[10px] font-bold uppercase text-emerald-700">Present</div>
                <div className="text-sm font-extrabold text-emerald-800 mt-0.5">
                  {summary?.presentDays || 0} Days
                </div>
              </div>
              <div className="p-2 bg-rose-50 rounded-lg">
                <div className="text-[10px] font-bold uppercase text-rose-700">Absent</div>
                <div className="text-sm font-extrabold text-rose-800 mt-0.5">
                  {(summary?.workingDays || 0) - (summary?.presentDays || 0)} Days
                </div>
              </div>
            </div>
          </div>

          {/* School Attendance Policy Note */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-card p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 mb-2">
              <UserCheck size={14} className="text-blue-600" />
              <span>School Attendance Policy</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed m-0">
              Students must maintain a minimum of <strong>75% attendance</strong> to be eligible for final term board exams and certifications. Daily logs are updated by the class teacher at the end of each session.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParentAttendance;
