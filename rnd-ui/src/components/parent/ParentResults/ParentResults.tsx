import React, { useMemo } from 'react';
import { BookOpen, FileText, Trophy, TrendingUp, TrendingDown, Sparkles, Award, ArrowUpRight } from 'lucide-react';
import type { StudentExamResult } from '../../../types';
import { cn } from '../../../lib/utils';
import { Button, EmptyState } from '../../ui';

interface ParentResultsProps {
  examResults: StudentExamResult[];
}

const getScoreColor = (pct: number) => {
  if (pct >= 75)
    return {
      text: 'text-emerald-700',
      bg: 'bg-emerald-500',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      grade: 'Distinction / Excellent',
    };
  if (pct >= 60)
    return {
      text: 'text-blue-700',
      bg: 'bg-blue-500',
      badge: 'bg-blue-50 text-blue-700 border-blue-200',
      grade: 'First Class / Good',
    };
  if (pct >= 45)
    return {
      text: 'text-amber-700',
      bg: 'bg-amber-500',
      badge: 'bg-amber-50 text-amber-800 border-amber-200',
      grade: 'Pass / Satisfactory',
    };
  return {
    text: 'text-rose-700',
    bg: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    grade: 'Needs Improvement',
  };
};

const ParentResults: React.FC<ParentResultsProps> = ({ examResults }) => {
  // Aggregate stats across published exams
  const summaryStats = useMemo(() => {
    if (!examResults || examResults.length === 0) return null;
    const totalPcts = examResults.reduce((sum, e) => sum + e.percentage, 0);
    const avgPct = Math.round(totalPcts / examResults.length);
    const latest = examResults[examResults.length - 1];
    const prev = examResults.length > 1 ? examResults[examResults.length - 2] : null;
    const diff = prev ? latest.percentage - prev.percentage : null;

    return { avgPct, latest, prev, diff, count: examResults.length };
  }, [examResults]);

  return (
    <div className="flex flex-col gap-4 font-sans text-slate-900">
      {/* ─── Page Header ─── */}
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Academic Performance</h1>
        <p className="text-xs text-slate-500 mt-0.5">Published exam marks, report cards, and subject evaluation.</p>
      </div>

      {examResults.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs">
          <EmptyState
            icon={<BookOpen size={36} />}
            title="No exam results published yet."
            subtitle="Results will appear here once official marks are published by the school."
          />
        </div>
      ) : (
        <>
          {/* ─── Summary Overview Card ─── */}
          {summaryStats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* 1. Overall Average */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Overall Average</span>
                  <Award size={13} className="text-indigo-500" />
                </div>
                <div className="text-2xl font-extrabold text-slate-900 mt-1">{summaryStats.avgPct}%</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Across {summaryStats.count} published exam{summaryStats.count !== 1 ? 's' : ''}</div>
              </div>

              {/* 2. Latest Exam Score */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Latest Assessment</span>
                  <Sparkles size={13} className="text-blue-500" />
                </div>
                <div className="text-2xl font-extrabold text-slate-900 mt-1">{summaryStats.latest.percentage}%</div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">{summaryStats.latest.examName}</div>
              </div>

              {/* 3. Progress Trend */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs flex flex-col justify-between col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Progress Trend</span>
                  <TrendingUp size={13} className="text-emerald-500" />
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  {summaryStats.diff !== null ? (
                    <>
                      <span className={cn('text-2xl font-extrabold', summaryStats.diff >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                        {summaryStats.diff >= 0 ? `+${summaryStats.diff}%` : `${summaryStats.diff}%`}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                          summaryStats.diff >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                        )}
                      >
                        {summaryStats.diff >= 0 ? 'Improvement' : 'Lower'}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-semibold text-slate-500">First evaluation</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {summaryStats.prev ? `Compared to ${summaryStats.prev.examName}` : 'Subsequent exams will show trend'}
                </div>
              </div>
            </div>
          )}

          {/* ─── Individual Exam Cards ─── */}
          <div className="flex flex-col gap-4">
            {examResults.map((result) => {
              const pct = result.percentage;
              const colors = getScoreColor(pct);

              return (
                <div key={result._id} className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
                  {/* Exam Card Header */}
                  <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                        <Trophy size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">{result.examName}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Marks: <strong className="text-slate-800">{result.totalObtained}</strong> / {result.totalPossible}
                          <span className="mx-1.5 text-slate-300">·</span>
                          <span className="text-slate-500">{colors.grade}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {result.pdfUrl && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => window.open(result.pdfUrl, '_blank')}
                          className="text-xs font-bold gap-1"
                        >
                          <FileText size={12} /> Official Report Card <ArrowUpRight size={11} />
                        </Button>
                      )}
                      <span className={cn('inline-flex items-center gap-1 text-xs font-extrabold border rounded-lg px-2.5 py-1', colors.badge)}>
                        <TrendingUp size={12} /> {pct}%
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="px-4 pt-2.5 pb-1">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-700', colors.bg)}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Subject rows */}
                  <div className="divide-y divide-slate-50 mt-1">
                    <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-1.5 bg-slate-50/60 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                      <span>Subject</span>
                      <span className="text-right">Score & Percentage</span>
                    </div>

                    {result.subjects.map((sub) => {
                      const markEntry = result.marks.find((m) => m.subject === sub.name);
                      const subPct = markEntry && sub.totalMarks > 0 ? Math.round((markEntry.obtainedMarks / sub.totalMarks) * 100) : 0;
                      const subColors = getScoreColor(subPct);

                      return (
                        <div key={sub.name} className="grid grid-cols-[1fr_auto] gap-4 items-center px-4 py-2.5 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={cn('w-2 h-2 rounded-full flex-shrink-0', subColors.bg)} />
                            <span className="font-semibold text-slate-800 text-xs truncate">{sub.name}</span>
                          </div>

                          <div className="flex items-center gap-3 text-right flex-shrink-0">
                            <span className="text-xs text-slate-500 font-medium">
                              {markEntry ? `${markEntry.obtainedMarks} / ${sub.totalMarks}` : 'N/A'}
                            </span>
                            <span className={cn('text-xs font-bold w-10 text-right', subColors.text)}>
                              {markEntry ? `${subPct}%` : '—'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
