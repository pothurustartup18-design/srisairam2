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
  ChevronDown,
  Check,
} from 'lucide-react';
import type { StudentData } from '../../../types';
import { API_BASE, formatClassName } from '../../../constants';
import { cn } from '../../../lib/utils';
import { EmptyState, ErrorState } from '../../ui';
import { errorMessage, readJson } from '../../../lib/http';

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filterStatus, setFilterStatus] = useState<'all' | 'present' | 'absent'>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);

  useEffect(() => {
    if (!ward) return;
    const studentId = ward.id || ward._id;
    let isMounted = true;
    setLoading(true);
    setLoadError(null);

    Promise.all([
      fetch(`${API_BASE}/attendance/summary/student/${studentId}`).then(readJson),
      fetch(`${API_BASE}/attendance/history/student/${studentId}`).then(readJson),
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
      .catch((err) => {
        console.error('Failed to load attendance:', err);
        if (isMounted) setLoadError(errorMessage(err, 'Attendance couldn’t be loaded.'));
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [ward, reloadKey]);

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
      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE-ONLY: Attendance Mobile Screen (<768px)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="md:hidden parent-mobile-container">
        {/* ── 1. Attendance Rate Hero Card ── */}
        <div className="ph-hero-card">
          <div className="ph-hero-top">
            <div className="ph-hero-identity">
              <div className="ph-date-pill">
                <CalendarCheck size={12} className="shrink-0 text-blue-500" />
                <span>Academic Attendance</span>
              </div>
              <h2 className="ph-student-name">{summary ? `${summary.percentage}%` : '—'}</h2>
              <div className="ph-role-subtitle">
                <span
                  className={cn(
                    'ph-role-tag',
                    (summary?.percentage || 0) >= 75
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                  )}
                >
                  {(summary?.percentage || 0) >= 75 ? '✓ Compliant (≥75%)' : '⚠️ Below 75% Target'}
                </span>
              </div>
            </div>

            {/* Attendance Progress Ring */}
            <div className="ph-rate-ring">
              <svg width="54" height="54" viewBox="0 0 54 54">
                <circle cx="27" cy="27" r="21" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                <circle
                  cx="27"
                  cy="27"
                  r="21"
                  fill="none"
                  stroke={(summary?.percentage || 0) >= 75 ? '#10b981' : '#f59e0b'}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 21}`}
                  strokeDashoffset={`${2 * Math.PI * 21 * (1 - (summary?.percentage || 0) / 100)}`}
                  transform="rotate(-90 27 27)"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
              </svg>
              <div className="ph-rate-ring-inner">
                <span className="ph-rate-ring-val">{summary?.presentDays || 0}</span>
                <span className="ph-rate-ring-lbl">Days</span>
              </div>
            </div>
          </div>

          {/* ── Telemetry Stats Strip ── */}
          <div className="ph-telemetry-strip">
            <div className="ph-telemetry-col">
              <span className="ph-telemetry-num text-emerald-600 dark:text-emerald-400">
                {summary ? `${summary.presentDays}` : '—'}
              </span>
              <span className="ph-telemetry-lbl">Present</span>
            </div>

            <div className="ph-telemetry-divider" />

            <div className="ph-telemetry-col">
              <span className="ph-telemetry-num text-rose-600 dark:text-rose-400">
                {summary ? `${summary.workingDays - summary.presentDays}` : '—'}
              </span>
              <span className="ph-telemetry-lbl">Absent</span>
            </div>

            <div className="ph-telemetry-divider" />

            <div className="ph-telemetry-col">
              <span className="ph-telemetry-num">
                {summary ? `${summary.workingDays}` : '—'}
              </span>
              <span className="ph-telemetry-lbl">Working Days</span>
            </div>
          </div>
        </div>

        {/* Attendance Policy Warning if applicable */}
        {isLowAttendance && (
          <div className="ph-attention-card danger">
            <div className="ph-attention-icon-box bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
              <AlertCircle size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="ph-attention-title">Attendance Policy Alert</div>
              <div className="ph-attention-desc">
                Current attendance ({summary?.percentage}%) is below 75%. Please ensure regular attendance.
              </div>
            </div>
          </div>
        )}

        {/* ── 2. Filters Bar ── */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
          {/* Status chips */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            {(['all', 'present', 'absent'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setFilterStatus(st)}
                className={cn(
                  'px-3 py-1 text-xs font-bold rounded-lg capitalize transition-all border-0 cursor-pointer',
                  filterStatus === st
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
                )}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Month Selector Dropdown (Right-aligned, never overflows) */}
          {availableMonths.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMonthDropdownOpen((prev) => !prev)}
                className="h-8 pl-3 pr-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 flex items-center gap-1.5 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
              >
                <span>
                  {selectedMonth === 'all'
                    ? 'All Months'
                    : (() => {
                        const [yr, mo] = selectedMonth.split('-');
                        return new Date(Number(yr), Number(mo) - 1).toLocaleString('en-IN', {
                          month: 'short',
                          year: 'numeric',
                        });
                      })()}
                </span>
                <ChevronDown
                  size={13}
                  className={cn(
                    'text-slate-400 transition-transform duration-200',
                    monthDropdownOpen && 'rotate-180 text-blue-600'
                  )}
                />
              </button>

              {monthDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMonthDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1.5 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMonth('all');
                        setMonthDropdownOpen(false);
                      }}
                      className={cn(
                        'w-full px-3.5 py-2 text-left text-xs flex items-center justify-between transition-colors cursor-pointer',
                        selectedMonth === 'all'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-bold'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 font-medium'
                      )}
                    >
                      <span>All Months</span>
                      {selectedMonth === 'all' && (
                        <Check size={13} className="text-blue-600 dark:text-blue-400 shrink-0" />
                      )}
                    </button>
                    {availableMonths.map((m) => {
                      const [yr, mo] = m.split('-');
                      const label = new Date(Number(yr), Number(mo) - 1).toLocaleString('en-IN', {
                        month: 'short',
                        year: 'numeric',
                      });
                      const isSel = selectedMonth === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setSelectedMonth(m);
                            setMonthDropdownOpen(false);
                          }}
                          className={cn(
                            'w-full px-3.5 py-2 text-left text-xs flex items-center justify-between transition-colors cursor-pointer',
                            isSel
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-bold'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 font-medium'
                          )}
                        >
                          <span>{label}</span>
                          {isSel && (
                            <Check size={13} className="text-blue-600 dark:text-blue-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── 3. Daily Attendance Sessions List ── */}
        <div className="flex flex-col gap-2">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-400 text-xs">
              <Loader2 size={16} className="animate-spin text-blue-600" /> Loading logs…
            </div>
          ) : loadError ? (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl">
              <ErrorState message={loadError} onRetry={() => setReloadKey((k) => k + 1)} compact />
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-400 text-xs">
              No attendance records found for this filter.
            </div>
          ) : (
            filteredHistory.map((item, idx) => {
              const d = new Date(item.date);
              const isPresent = item.status === 'present';

              return (
                <div key={idx} className="ph-list-row">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center flex-shrink-0 leading-none">
                      <span className="text-[9px] font-extrabold text-slate-400 uppercase">
                        {d.toLocaleDateString('en-IN', { month: 'short' })}
                      </span>
                      <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
                        {d.getDate()}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>
                          Morning:{' '}
                          <strong className={item.morningStatus === 'absent' ? 'text-rose-600' : 'text-emerald-600'}>
                            {item.morningStatus ? (item.morningStatus === 'present' ? 'P' : 'A') : (isPresent ? 'P' : 'A')}
                          </strong>
                        </span>
                        <span>·</span>
                        <span>
                          Afternoon:{' '}
                          <strong className={item.afternoonStatus === 'absent' ? 'text-rose-600' : 'text-emerald-600'}>
                            {item.afternoonStatus ? (item.afternoonStatus === 'present' ? 'P' : 'A') : (isPresent ? 'P' : 'A')}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isPresent ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 rounded-full px-2.5 py-1">
                        <CheckCircle2 size={12} /> Present
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800 rounded-full px-2.5 py-1">
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

      {/* ═══════════════════════════════════════════════════════════════════
          DESKTOP-ONLY: Full Attendance Records (md+)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex flex-col gap-5">
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
          ) : loadError ? (
            <ErrorState message={loadError} onRetry={() => setReloadKey((k) => k + 1)} compact />
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
  </div>
  );
};

export default ParentAttendance;
