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
import { EmptyState } from '../../ui';

interface ParentResultsProps {
  examResults: StudentExamResult[];
}

const getScoreGrade = (pct: number) => {
  if (pct >= 75)
    return {
      text: 'text-emerald-700',
      bg: 'bg-emerald-500',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      grade: 'Distinction / Excellent',
      shortGrade: 'A+',
    };
  if (pct >= 60)
    return {
      text: 'text-blue-700',
      bg: 'bg-blue-600',
      badge: 'bg-blue-50 text-blue-700 border-blue-200',
      grade: 'First Class / Good',
      shortGrade: 'A',
    };
  if (pct >= 45)
    return {
      text: 'text-amber-700',
      bg: 'bg-amber-500',
      badge: 'bg-amber-50 text-amber-800 border-amber-200',
      grade: 'Pass / Satisfactory',
      shortGrade: 'B',
    };
  return {
    text: 'text-rose-700',
    bg: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
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

const ParentResults: React.FC<ParentResultsProps> = ({ examResults = [] }) => {
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

  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900">
      {/* ─── PAGE HEADER (Matches Admin Style) ─── */}
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

      {examResults.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-card">
          <EmptyState
            icon={<BookOpen size={36} />}
            title="No exam results published yet."
            subtitle="Results and report cards will appear here once official marks are verified and published by the school."
          />
        </div>
      ) : (
        <>
          {/* ─── Top 4 KPI Summary Cards ─── */}
          {summaryStats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Overall Cumulative Average */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                    <Award size={18} />
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    Cumulative
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-xs font-semibold text-slate-500">Overall Average</div>
                  <div className="text-2xl font-extrabold text-slate-900 mt-0.5">{summaryStats.avgPct}%</div>
                  <div className="text-xs text-slate-400 mt-1">Across {summaryStats.count} term exams</div>
                </div>
              </div>

              {/* 2. Latest Exam Score */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <Sparkles size={18} />
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                    Latest Assessment
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-xs font-semibold text-slate-500 truncate">{summaryStats.latest.examName}</div>
                  <div className="text-2xl font-extrabold text-slate-900 mt-0.5">
                    {safeNumber(summaryStats.latest.percentage)}%
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {summaryStats.latestObtained} of {summaryStats.latestPossible} marks
                  </div>
                </div>
              </div>

              {/* 3. Progress Trend */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    <TrendingUp size={18} />
                  </div>
                  {summaryStats.diff !== null && (
                    <span
                      className={cn(
                        'text-xs font-bold px-2 py-0.5 rounded-full',
                        summaryStats.diff >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      )}
                    >
                      {summaryStats.diff >= 0 ? `+${summaryStats.diff}%` : `${summaryStats.diff}%`}
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  <div className="text-xs font-semibold text-slate-500">Performance Trend</div>
                  <div className="text-2xl font-extrabold text-slate-900 mt-0.5">
                    {summaryStats.diff !== null
                      ? summaryStats.diff >= 0
                        ? 'Improving ↑'
                        : 'Needs Focus ↓'
                      : 'First Term'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Compared to previous assessment</div>
                </div>
              </div>

              {/* 4. Top Subject */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                    <Star size={18} />
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">
                    Strongest Subject
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-xs font-semibold text-slate-500 truncate">{summaryStats.bestSubject.name}</div>
                  <div className="text-2xl font-extrabold text-emerald-700 mt-0.5">
                    {summaryStats.bestSubject.pct}%
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Highest scored subject</div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Exam Selector Pills ─── */}
          {examResults.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedExamId('all')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border',
                  selectedExamId === 'all'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                )}
              >
                All Exams ({examResults.length})
              </button>
              {examResults.map((exam) => {
                const id = exam._id || exam.examName;
                const isSelected = selectedExamId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedExamId(id)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer border',
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    {exam.examName} ({safeNumber(exam.percentage)}%)
                  </button>
                );
              })}
            </div>
          )}

          {/* ─── Detailed Exam Cards ─── */}
          <div className="flex flex-col gap-5">
            {filteredExams.map((result) => {
              const rawPct = safeNumber(result.percentage);
              const { text, badge, grade, bg } = getScoreGrade(rawPct);

              const marksList = Array.isArray(result.marks) ? result.marks : [];
              const subjectsList = Array.isArray(result.subjects) ? result.subjects : [];

              const computedObtained = marksList.reduce(
                (sum: number, m: any) => sum + safeNumber(m.obtainedMarks ?? m.marks ?? m.score),
                0
              );

              const computedPossible =
                subjectsList.length > 0
                  ? subjectsList.reduce((sum: number, s: any) => sum + safeNumber(s.totalMarks, 100), 0)
                  : marksList.length > 0
                  ? marksList.reduce((sum: number, m: any) => sum + safeNumber(m.maxMarks ?? m.totalMarks, 100), 0)
                  : 100;

              const totalObt = safeNumber(result.totalObtained ?? (result as any).totalMarks, computedObtained);
              const totalPoss = safeNumber(result.totalPossible ?? (result as any).maxMarks, computedPossible);
              const finalPct = totalPoss > 0 ? Math.round((totalObt / totalPoss) * 100) : rawPct;

              return (
                <div
                  key={result._id || result.examName}
                  className="bg-white border border-slate-200 rounded-xl shadow-card overflow-hidden"
                >
                  {/* Exam Card Header */}
                  <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 shadow-xs">
                        <GraduationCap size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-slate-900 m-0">{result.examName}</h3>
                          <span className={cn('text-[11px] font-bold px-2.5 py-0.5 rounded-full border', badge)}>
                            {grade}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Total Score:{' '}
                          <strong className="text-slate-900 font-bold">{totalObt}</strong> / {totalPoss} Marks ({finalPct}%)
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {result.pdfUrl && (
                        <a
                          href={result.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 hover:text-blue-600 transition-colors shadow-2xs"
                        >
                          <FileText size={13} className="text-slate-500" /> Official Report Card <ArrowUpRight size={11} />
                        </a>
                      )}
                      <div className="text-right">
                        <div className={cn('text-lg font-extrabold leading-none', text)}>{finalPct}%</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Overall</div>
                      </div>
                    </div>
                  </div>

                  {/* Subject Scores Breakdown Table */}
                  {marksList.length > 0 ? (
                    <div className="p-4 sm:p-5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                        <Layers size={13} /> Subject Scores &amp; Breakdown
                      </div>

                      {/* Desktop Table View */}
                      <div className="hidden sm:block overflow-x-auto border border-slate-100 rounded-xl">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                            <tr>
                              <th className="px-4 py-2.5">Subject</th>
                              <th className="px-4 py-2.5 text-center">Marks Obtained</th>
                              <th className="px-4 py-2.5 text-center">Max Marks</th>
                              <th className="px-4 py-2.5 text-center">Percentage</th>
                              <th className="px-4 py-2.5 text-center">Grade</th>
                              <th className="px-4 py-2.5 w-44">Performance Bar</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {marksList.map((m: any, idx: number) => {
                              const obt = safeNumber(m.obtainedMarks ?? m.marks ?? m.score);
                              const subDef = subjectsList.find(
                                (s: any) => s.name?.trim().toLowerCase() === m.subject?.trim().toLowerCase()
                              );
                              const max = safeNumber(subDef?.totalMarks ?? m.maxMarks ?? m.totalMarks, 100);
                              const pct = max > 0 ? Math.round((obt / max) * 100) : 0;
                              const { badge: subBadge, shortGrade, bg: barColor } = getScoreGrade(pct);

                              return (
                                <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                  <td className="px-4 py-3 font-bold text-slate-900 flex items-center gap-2">
                                    <span className={cn('w-2 h-2 rounded-full', barColor)} />
                                    {m.subject || `Subject ${idx + 1}`}
                                  </td>
                                  <td className="px-4 py-3 text-center font-extrabold text-slate-900 text-sm">
                                    {obt}
                                  </td>
                                  <td className="px-4 py-3 text-center text-slate-500 font-medium">{max}</td>
                                  <td className="px-4 py-3 text-center font-bold text-slate-800">{pct}%</td>
                                  <td className="px-4 py-3 text-center">
                                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-md border', subBadge)}>
                                      {shortGrade}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                      <div
                                        className={cn('h-full rounded-full transition-all duration-500', barColor)}
                                        style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile Cards View */}
                      <div className="grid grid-cols-1 gap-3 sm:hidden">
                        {marksList.map((m: any, idx: number) => {
                          const obt = safeNumber(m.obtainedMarks ?? m.marks ?? m.score);
                          const subDef = subjectsList.find(
                            (s: any) => s.name?.trim().toLowerCase() === m.subject?.trim().toLowerCase()
                          );
                          const max = safeNumber(subDef?.totalMarks ?? m.maxMarks ?? m.totalMarks, 100);
                          const pct = max > 0 ? Math.round((obt / max) * 100) : 0;
                          const { badge: subBadge, shortGrade, bg: barColor } = getScoreGrade(pct);

                          return (
                            <div
                              key={idx}
                              className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-col gap-2"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                                  <span className={cn('w-2 h-2 rounded-full', barColor)} />
                                  {m.subject || `Subject ${idx + 1}`}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="font-extrabold text-slate-900">
                                    {obt}/{max}
                                  </span>
                                  <span className={cn('text-[10px] font-bold px-1.5 py-0.2 rounded border', subBadge)}>
                                    {pct}% · {shortGrade}
                                  </span>
                                </div>
                              </div>
                              <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className={cn('h-full rounded-full transition-all duration-500', barColor)}
                                  style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 text-center text-slate-400 text-xs">
                      No individual subject marks itemized for this assessment.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default ParentResults;

