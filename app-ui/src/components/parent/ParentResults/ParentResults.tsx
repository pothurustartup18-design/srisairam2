import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  FileText,
  Trophy,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Award,
  ArrowUpRight,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Star,
} from 'lucide-react';
import type { StudentExamResult } from '../../../types';
import { cn } from '../../../lib/utils';
import { EmptyState, ErrorState, SkeletonCard, SkeletonStats } from '../../ui';
import type { DataStatus } from '../../../hooks/useApiData';

interface ParentResultsProps {
  examResults: StudentExamResult[];
  status?: DataStatus;
  error?: string | null;
  onRetry?: () => unknown;
}

const getScoreGrade = (pct: number) => {
  if (pct >= 75)
    return {
      text: 'text-emerald-700',
      bg: 'bg-emerald-500',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
      grade: 'Distinction / Excellent',
      shortGrade: 'A+',
    };
  if (pct >= 60)
    return {
      text: 'text-blue-700',
      bg: 'bg-blue-600',
      badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
      grade: 'First Class / Good',
      shortGrade: 'A',
    };
  if (pct >= 45)
    return {
      text: 'text-amber-700',
      bg: 'bg-amber-500',
      badge: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
      grade: 'Pass / Satisfactory',
      shortGrade: 'B',
    };
  return {
    text: 'text-rose-700',
    bg: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
    grade: 'Needs Improvement',
    shortGrade: 'C / Retest',
  };
};

// Safe number parser
const safeNumber = (val: any, fallback = 0): number => {
  if (val === null || val === undefined) return fallback;
  const num = Number(val);
  return isNaN(num) ? fallback : num;
};

const ParentResults: React.FC<ParentResultsProps> = ({ examResults = [], status = 'success', error, onRetry }) => {
  const [selectedExamId, setSelectedExamId] = useState<string>('all');

  // Aggregate stats across published exams
  const summaryStats = useMemo(() => {
    if (!examResults || examResults.length === 0) return null;

    // Chronologically sort assessments so latest and previous are accurate
    const sorted = [...examResults].sort((a, b) => {
      const timeA = new Date((a as any).examDate || (a as any).date || (a as any).createdAt || 0).getTime();
      const timeB = new Date((b as any).examDate || (b as any).date || (b as any).createdAt || 0).getTime();
      return timeA - timeB;
    });

    const totalPcts = sorted.reduce((sum, e) => sum + safeNumber(e.percentage), 0);
    const avgPct = Math.round(totalPcts / sorted.length);
    const latest = sorted[sorted.length - 1];
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;

    // Resolve latest exam marks
    const latestObtained =
      latest.totalObtained ??
      (latest as any).totalMarks ??
      (latest.marks
        ? latest.marks.reduce((sum: number, m: any) => sum + safeNumber(m.obtainedMarks ?? m.marks ?? m.score), 0)
        : 0);

    const latestPossible =
      latest.totalPossible ??
      (latest as any).maxMarks ??
      (latest.subjects
        ? latest.subjects.reduce((sum: number, s: any) => sum + safeNumber(s.totalMarks, 100), 0)
        : latest.marks
        ? latest.marks.length * 100
        : 100);

    const latestPct = safeNumber(
      latest.percentage,
      latestPossible > 0 ? Math.round((latestObtained / latestPossible) * 100) : 0
    );
    const prevPct = prev ? safeNumber(prev.percentage) : null;
    const rawDiff = prevPct !== null ? latestPct - prevPct : null;
    const diff = rawDiff !== null ? Math.round(rawDiff * 10) / 10 : null;

    // Find best subject across all exams
    let bestSubject = { name: 'Mathematics', pct: 0 };
    sorted.forEach((e) => {
      e.marks?.forEach((m: any) => {
        const obt = safeNumber(m.obtainedMarks ?? m.marks ?? m.score);
        const subDef = e.subjects?.find((s: any) => s.name?.trim().toLowerCase() === m.subject?.trim().toLowerCase());
        const max = safeNumber(subDef?.totalMarks ?? m.maxMarks ?? m.totalMarks, 100);
        const pct = max > 0 ? Math.round((obt / max) * 100) : 0;
        if (pct > bestSubject.pct) {
          bestSubject = { name: m.subject || 'Subject', pct };
        }
      });
    });

    return {
      avgPct,
      latest,
      latestPct,
      latestObtained: safeNumber(latestObtained),
      latestPossible: safeNumber(latestPossible, 100),
      prev,
      diff,
      diffLabel: prev ? `vs ${prev.examName || 'Prev'}` : '1st Exam',
      bestSubject,
      count: sorted.length,
    };
  }, [examResults]);

  // Filtered exams list
  const filteredExams = useMemo(() => {
    if (selectedExamId === 'all') return examResults;
    return examResults.filter((e) => (e._id || e.examName) === selectedExamId);
  }, [examResults, selectedExamId]);

  if (status === 'loading' && examResults.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonStats count={4} label="Loading exam results…" />
        <SkeletonCard lines={5} />
      </div>
    );
  }
  if (status === 'error' && examResults.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-card dark:bg-slate-800 dark:border-slate-700">
        <ErrorState message={error} onRetry={onRetry} />
      </div>
    );
  }

  // If there are no published exam results, render official Empty State
  if (!examResults || examResults.length === 0) {
    return (
      <div className="flex flex-col gap-4 font-sans text-slate-900">
        {/* Mobile View */}
        <div className="md:hidden parent-mobile-container pb-28">
          <div className="ph-hero-card">
            <div className="ph-hero-top">
              <div className="ph-hero-identity">
                <div className="ph-date-pill">
                  <GraduationCap size={12} className="shrink-0 text-blue-200" />
                  <span>Academic Performance</span>
                </div>
                <h2 className="ph-student-name">Exam Results</h2>
                <div className="ph-role-subtitle">
                  <span className="ph-role-tag">Academic Year 2025-26</span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-inner shrink-0">
                <Trophy size={22} />
              </div>
            </div>
          </div>

          <div className="ph-card p-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2 mt-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-1">
              <BookOpen size={24} />
            </div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white m-0">No Published Assessments Yet</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs m-0 leading-relaxed">
              Official examination marksheets, subject scores, and digital report cards will appear here once published by the academic committee.
            </p>
          </div>
        </div>

        {/* Desktop View */}
        <div className="hidden md:flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4 flex-wrap bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-card">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 m-0">Academic Performance &amp; Reports</h2>
              <p className="text-sm text-slate-500 mt-1">
                Official published term exam marksheets, subject scores, and verified digital report cards.
              </p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-card">
            <EmptyState
              icon={<BookOpen size={36} />}
              title="No marksheets published yet."
              subtitle="Term exam results published by teachers will appear here."
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900">
      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE-ONLY: Academic Results Screen (<768px)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="md:hidden parent-mobile-container">
        {/* ── 1. Academic Performance Hero Card ── */}
        {summaryStats && (
          <div className="ph-hero-card">
            <div className="ph-hero-top">
              <div className="ph-hero-identity">
                <div className="ph-date-pill">
                  <GraduationCap size={12} className="shrink-0 text-blue-200" />
                  <span>Academic Performance</span>
                </div>
                <h2 className="ph-student-name">
                  {summaryStats.latestPct !== null ? `${summaryStats.latestPct}%` : 'N/A'}
                </h2>
                <div className="ph-role-subtitle">
                  {(() => {
                    const { badge, shortGrade } = getScoreGrade(summaryStats.latestPct || 0);
                    return (
                      <span className={cn('ph-role-tag', badge)}>
                        Grade {shortGrade} · {summaryStats.latest.examName}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Score Rate Ring */}
              <div className="ph-rate-ring">
                <svg width="54" height="54" viewBox="0 0 54 54">
                  <circle cx="27" cy="27" r="21" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                  <circle
                    cx="27"
                    cy="27"
                    r="21"
                    fill="none"
                    stroke={
                      (summaryStats.latestPct || 0) >= 75
                        ? '#10b981'
                        : (summaryStats.latestPct || 0) >= 60
                        ? '#3b82f6'
                        : '#f59e0b'
                    }
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 21}`}
                    strokeDashoffset={`${2 * Math.PI * 21 * (1 - (summaryStats.latestPct || 0) / 100)}`}
                    transform="rotate(-90 27 27)"
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                  />
                </svg>
                <div className="ph-rate-ring-inner">
                  <span className="ph-rate-ring-val">{summaryStats.avgPct}%</span>
                  <span className="ph-rate-ring-lbl">Avg</span>
                </div>
              </div>
            </div>

            {/* ── Telemetry Strip (3 Key Metrics) ── */}
            <div className="ph-telemetry-strip">
              <div className="ph-telemetry-col">
                <span className="ph-telemetry-num text-purple-600 dark:text-purple-400">
                  {summaryStats.avgPct}%
                </span>
                <span className="ph-telemetry-lbl">Overall Avg</span>
              </div>

              <div className="ph-telemetry-divider" />

              <div className="ph-telemetry-col">
                <span
                  className={cn(
                    'ph-telemetry-num flex items-center justify-center gap-0.5',
                    summaryStats.diff !== null && summaryStats.diff >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  )}
                >
                  {summaryStats.diff !== null ? (
                    summaryStats.diff >= 0 ? (
                      <>
                        <TrendingUp size={13} /> +{summaryStats.diff.toFixed(1).replace(/\.0$/, '')}%
                      </>
                    ) : (
                      <>
                        <TrendingDown size={13} /> {summaryStats.diff.toFixed(1).replace(/\.0$/, '')}%
                      </>
                    )
                  ) : (
                    '—'
                  )}
                </span>
                <span className="ph-telemetry-lbl truncate max-w-[110px]" title={summaryStats.diffLabel}>
                  {summaryStats.diffLabel}
                </span>
              </div>

              <div className="ph-telemetry-divider" />

              <div className="ph-telemetry-col">
                <span
                  className="ph-telemetry-num text-amber-600 dark:text-amber-400 truncate max-w-[95px]"
                  title={summaryStats.bestSubject.name}
                >
                  {summaryStats.bestSubject.name}
                </span>
                <span className="ph-telemetry-lbl">Top ({summaryStats.bestSubject.pct}%)</span>
              </div>
            </div>
          </div>
        )}

        {/* ── 2. Exam Filter Pills ── */}
        {examResults.length > 1 && (
          <div className="ph-filter-scroll-container -mx-1 px-1">
            <button
              type="button"
              onClick={(e) => {
                setSelectedExamId('all');
                e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
              }}
              className={cn('ph-filter-chip', selectedExamId === 'all' && 'active')}
            >
              <Trophy size={13} className="shrink-0" />
              <span>All Assessments</span>
              <span
                className={cn(
                  'text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ml-0.5',
                  selectedExamId === 'all' ? 'bg-white text-blue-600' : 'bg-slate-200 text-slate-600'
                )}
              >
                {examResults.length}
              </span>
            </button>
            {examResults.map((e) => (
              <button
                key={e._id || e.examName}
                type="button"
                onClick={(evt) => {
                  setSelectedExamId(e._id || e.examName);
                  evt.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }}
                className={cn(
                  'ph-filter-chip',
                  selectedExamId === (e._id || e.examName) && 'active'
                )}
              >
                <span>{e.examName}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── 3. Published Assessment Result Cards ── */}
        <div className="flex flex-col gap-4 pb-28">
          {filteredExams.map((exam) => {
            const marksList = exam.marks || [];
            const subjectsList = exam.subjects || [];
            const totalObtained =
              exam.totalObtained ??
              (exam as any).totalMarks ??
              marksList.reduce(
                (sum: number, m: any) => sum + safeNumber(m.obtainedMarks ?? m.marks ?? m.score),
                0
              );
            const totalPossible =
              exam.totalPossible ??
              (exam as any).maxMarks ??
              (subjectsList.length > 0
                ? subjectsList.reduce((sum: number, s: any) => sum + safeNumber(s.totalMarks, 100), 0)
                : marksList.length * 100 || 100);
            const pct = safeNumber(
              exam.percentage,
              totalPossible > 0 ? Math.round((totalObtained / totalPossible) * 100) : 0
            );
            const { badge: gradeBadge, shortGrade } = getScoreGrade(pct);

            return (
              <div
                key={exam._id || exam.examName}
                className="ph-card p-4 flex flex-col gap-3.5 shadow-md"
              >
                {/* Exam Card Header */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white m-0">
                      {exam.examName}
                    </h3>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 inline-block">
                      Total: <strong className="text-slate-800 dark:text-slate-200">{totalObtained}</strong> / {totalPossible} Marks
                    </span>
                  </div>
                  <span className={cn('text-xs font-bold px-2.5 py-1 rounded-xl border shadow-2xs', gradeBadge)}>
                    {pct}% · Grade {shortGrade}
                  </span>
                </div>

                {/* Subject Breakdown List */}
                {marksList.length > 0 ? (
                  <div className="flex flex-col gap-2.5">
                    {marksList.map((m: any, idx: number) => {
                      const obt = safeNumber(m.obtainedMarks ?? m.marks ?? m.score);
                      const subDef = subjectsList.find(
                        (s: any) => s.name?.trim().toLowerCase() === m.subject?.trim().toLowerCase()
                      );
                      const max = safeNumber(subDef?.totalMarks ?? m.maxMarks ?? m.totalMarks, 100);
                      const subPct = max > 0 ? Math.round((obt / max) * 100) : 0;
                      const { badge: subBadge, shortGrade: subGrade, bg: barColor } = getScoreGrade(subPct);

                      return (
                        <div
                          key={idx}
                          className="p-3 bg-slate-50/80 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-800/80 flex flex-col gap-2"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                              <span className={cn('w-2.5 h-2.5 rounded-full shrink-0 shadow-xs', barColor)} />
                              <span className="truncate max-w-[150px]">{m.subject || `Subject ${idx + 1}`}</span>
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-900 dark:text-slate-100">
                                {obt} <span className="text-slate-400 text-[10px]">/{max}</span>
                              </span>
                              <span className={cn('text-[10.5px] font-extrabold px-2 py-0.5 rounded-md border shadow-2xs', subBadge)}>
                                {subPct}% · {subGrade}
                              </span>
                            </div>
                          </div>
                          <div className="h-2 w-full bg-slate-200/80 dark:bg-slate-700/80 rounded-full overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all duration-500', barColor)}
                              style={{ width: `${Math.min(100, Math.max(3, subPct))}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-center text-slate-400 text-xs">
                    No subject marks itemized for this assessment.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DESKTOP-ONLY: Full Results Table (md+)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4 flex-wrap bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-card">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 m-0">Academic Performance &amp; Reports</h2>
            <p className="text-sm text-slate-500 mt-1">
              Official published term exam marksheets, subject scores, and verified digital report cards.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200 rounded-lg px-3 py-1.5">
              <Trophy size={14} /> {examResults.length} Published Assessment{examResults.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {examResults.map((exam) => (
            <div key={exam._id || exam.examName} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between border-b pb-3 mb-3">
                <h3 className="font-extrabold text-slate-900 text-base">{exam.examName}</h3>
                <span className="text-sm font-bold text-blue-600">{exam.percentage}%</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {exam.marks?.map((m: any, idx: number) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-lg border flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-800">{m.subject}</span>
                    <span className="font-extrabold text-slate-900">{m.obtainedMarks ?? m.marks ?? m.score} / {m.maxMarks ?? 100}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ParentResults;
