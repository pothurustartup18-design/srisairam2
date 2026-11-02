import React, { useState, useMemo, useEffect } from 'react';
import type { ExamData, StudentData } from '../../../types';
import {
  TrendingUp, TrendingDown, AlertTriangle, ChevronUp, ChevronDown,
  ArrowRight, BookOpen, Users, Activity,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { EmptyState, filterControlClass } from '../../ui';
import { BarChart2 } from 'lucide-react';

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function avg(vals: number[]): number {
  if (!vals.length) return 0;
  return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
}

function fmt(n: number | null | undefined, suffix = '%'): string {
  if (n == null || !isFinite(n) || isNaN(n)) return '—';
  return n.toFixed(1) + suffix;
}

function diff(a: number, b: number): number {
  return parseFloat((a - b).toFixed(1));
}

function grade(pct: number): string {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 40) return 'D';
  return 'F';
}

// ─── Tiny components ──────────────────────────────────────────────────────────

function Delta({ d }: { d: number | null | undefined }) {
  if (d == null || !isFinite(d) || isNaN(d)) return <span className="text-gray-400 text-xs">—</span>;
  if (d === 0) return <span className="text-gray-400 text-xs">No change</span>;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', d > 0 ? 'text-emerald-600' : 'text-red-500')}>
      {d > 0 ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      {d > 0 ? '+' : ''}{d.toFixed(1)} pts
    </span>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
    </div>
  );
}

// ─── Tiny SVG line chart ──────────────────────────────────────────────────────

function TrendLine({ series, labels }: {
  series: { name: string; color: string; values: number[] }[];
  labels: string[];
}) {
  const n = labels.length;
  if (n < 2) return (
    <div className="h-32 flex items-center justify-center text-sm text-gray-400">
      Need at least 2 exams for a trend chart.
    </div>
  );
  const W = 100, H = 60, px = 2, py = 4;
  const allVals = series.flatMap(s => s.values);
  const minV = Math.min(...allVals, 0);
  const maxV = Math.max(...allVals, 100);
  const range = maxV - minV || 1;
  const toX = (i: number) => px + (i / (n - 1)) * (W - px * 2);
  const toY = (v: number) => H - py - ((v - minV) / range) * (H - py * 2);

  return (
    <div>
      <div className="relative" style={{ paddingLeft: 28 }}>
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-4 flex flex-col justify-between text-2xs text-gray-300">
          {[100, 75, 50, 25, 0].map(v => <span key={v}>{v}</span>)}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 120 }} preserveAspectRatio="none">
          {/* gridlines */}
          {[0, 25, 50, 75, 100].map(v => (
            <line key={v} x1={px} y1={toY(v)} x2={W - px} y2={toY(v)}
              stroke="#f1f5f9" strokeWidth="0.5" />
          ))}
          {series.map(s => {
            const pts = s.values.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
            return (
              <g key={s.name}>
                <polyline points={pts} fill="none" stroke={s.color} strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round" />
                {s.values.map((v, i) => (
                  <g key={i}>
                    <circle cx={toX(i)} cy={toY(v)} r="2" fill="white" stroke={s.color} strokeWidth="1" />
                    <title>{s.name}: {v}%</title>
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
        {/* X labels */}
        <div className="flex justify-between mt-1">
          {labels.map((l, i) => (
            <span key={i} className="text-2xs text-gray-400 truncate" style={{ maxWidth: `${100 / n}%`, textAlign: 'center' }}>{l}</span>
          ))}
        </div>
      </div>
      <div className="flex gap-4 mt-3 justify-center">
        {series.map(s => (
          <span key={s.name} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="inline-block w-5 h-0.5 rounded" style={{ backgroundColor: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentRow {
  id: string; name: string; admissionNo: string;
  totalObtained: number; totalPossible: number; percentage: number;
  grade: string; subjectMarks: Record<string, number>;
  rank: number; prevPct?: number; delta?: number; weakIn?: string;
}

interface SubjectRow {
  name: string; totalMarks: number; mean: number;
  passCount: number; passRate: number; prevMean?: number; delta?: number;
}

interface ExamAnalyticsProps {
  examsList: ExamData[];
  students: StudentData[];
  selectedClass: string;
}

type SortKey = 'rank' | 'name' | 'percentage' | 'delta';

// ─── Component ────────────────────────────────────────────────────────────────

const ExamAnalytics: React.FC<ExamAnalyticsProps> = ({ examsList, students, selectedClass }) => {
  const [examId, setExamId] = useState('');
  const [compareId, setCompareId] = useState('');
  const [tab, setTab] = useState<'overview' | 'students' | 'trends'>('overview');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortAsc, setSortAsc] = useState(true);
  const [showAllAtRisk, setShowAllAtRisk] = useState(false);

  // Default to latest exam
  useEffect(() => {
    if (examsList.length > 0 && !examId) setExamId(examsList[examsList.length - 1]._id);
  }, [examsList]);

  const exam = examsList.find(e => e._id === examId) || null;
  const selectedIdx = examsList.findIndex(e => e._id === examId);
  // Only allow comparing with exams before the selected one
  const compareOptions = examsList.slice(0, selectedIdx);
  const compareExam = examsList.find(e => e._id === compareId) || null;

  // Reset compare when exam changes
  useEffect(() => {
    if (compareId && !compareOptions.find(e => e._id === compareId)) setCompareId('');
  }, [examId]);

  // ── Build student rows ─────────────────────────────────────────────────────
  const buildRows = (ex: ExamData | null): StudentRow[] => {
    if (!ex) return [];
    const totalPossible = ex.subjects.reduce((s, sub) => s + sub.totalMarks, 0);
    const rows: StudentRow[] = [];
    for (const st of students) {
      const sm = ex.studentMarks.find(s =>
        (typeof s.student === 'string' ? s.student : (s.student as any)?._id) === st.id
      );
      const subjectMarks: Record<string, number> = {};
      let totalObtained = 0;
      if (sm) { for (const m of sm.marks) { subjectMarks[m.subject] = m.obtainedMarks; totalObtained += m.obtainedMarks; } }
      else { ex.subjects.forEach(s => { subjectMarks[s.name] = 0; }); }
      const pct = totalPossible > 0 ? Math.round((totalObtained / totalPossible) * 100) : 0;
      rows.push({ id: st.id, name: st.name, admissionNo: st.admissionNo, totalObtained, totalPossible, percentage: pct, grade: grade(pct), subjectMarks, rank: 0 });
    }
    rows.sort((a, b) => b.percentage - a.percentage);
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  };

  // ── Build subject rows ─────────────────────────────────────────────────────
  const buildSubjects = (ex: ExamData | null): SubjectRow[] => {
    if (!ex) return [];
    return ex.subjects.map(sub => {
      const pcts: number[] = [];
      for (const sm of ex.studentMarks) {
        const m = sm.marks.find(x => x.subject === sub.name);
        if (m != null) pcts.push(sub.totalMarks > 0 ? (m.obtainedMarks / sub.totalMarks) * 100 : 0);
      }
      const mean = avg(pcts);
      const passCount = pcts.filter(p => p >= 40).length;
      return { name: sub.name, totalMarks: sub.totalMarks, mean, passCount, passRate: pcts.length > 0 ? (passCount / pcts.length) * 100 : 0 };
    });
  };

  // ── Analytics ──────────────────────────────────────────────────────────────
  const data = useMemo(() => {
    if (!exam) return null;

    const rows = buildRows(exam);
    const prevRows = compareExam ? buildRows(compareExam) : [];
    const subjects = buildSubjects(exam);
    const prevSubjects = compareExam ? buildSubjects(compareExam) : [];

    // Attach deltas to students
    if (prevRows.length > 0) {
      rows.forEach(r => {
        const prev = prevRows.find(p => p.id === r.id);
        if (prev) { r.prevPct = prev.percentage; r.delta = diff(r.percentage, prev.percentage); }
      });
    }

    // Attach deltas to subjects
    subjects.forEach(sub => {
      const prev = prevSubjects.find(p => p.name === sub.name);
      if (prev) { sub.prevMean = prev.mean; sub.delta = diff(sub.mean, prev.mean); }
    });

    // Weak subject per student
    rows.forEach(r => {
      const worst = subjects.reduce<SubjectRow | null>((w, sub) => {
        const m = r.subjectMarks[sub.name] ?? 0;
        const pct = sub.totalMarks > 0 ? (m / sub.totalMarks) * 100 : 0;
        if (!w) return sub;
        const wPct = sub.totalMarks > 0 ? ((r.subjectMarks[w.name] ?? 0) / w.totalMarks) * 100 : 0;
        return pct < wPct ? sub : w;
      }, null);
      if (worst) r.weakIn = worst.name;
    });

    const allPcts = rows.map(r => r.percentage);
    const classAvg = avg(allPcts);
    const passingCount = allPcts.filter(p => p >= 40).length;
    const passRate = allPcts.length > 0 ? (passingCount / allPcts.length) * 100 : 0;
    const highest = allPcts.length > 0 ? Math.max(...allPcts) : 0;
    const atRisk = rows.filter(r => r.percentage < 40);

    const prevPcts = prevRows.map(r => r.percentage);
    const prevAvg = prevPcts.length > 0 ? avg(prevPcts) : null;
    const prevPassRate = prevPcts.length > 0 ? (prevPcts.filter(p => p >= 40).length / prevPcts.length) * 100 : null;

    const avgDelta = prevAvg !== null ? diff(classAvg, prevAvg) : null;
    const passRateDelta = prevPassRate !== null ? diff(passRate, prevPassRate) : null;

    // Insights — max 3
    const insights: string[] = [];
    const weakestSub = [...subjects].sort((a, b) => a.mean - b.mean)[0];
    if (weakestSub && subjects.length > 1) insights.push(`${weakestSub.name} is the weakest subject (${weakestSub.mean.toFixed(1)}% class avg).`);
    if (avgDelta !== null) {
      if (avgDelta > 0) insights.push(`Class average improved by ${avgDelta.toFixed(1)} pts vs ${compareExam?.examName}.`);
      else if (avgDelta < 0) insights.push(`Class average dropped by ${Math.abs(avgDelta).toFixed(1)} pts vs ${compareExam?.examName}.`);
    }
    if (atRisk.length > 0) insights.push(`${atRisk.length} student${atRisk.length > 1 ? 's require' : ' requires'} immediate attention.`);

    return { rows, subjects, classAvg, passRate, highest, passingCount, atRisk, prevAvg, prevPassRate, avgDelta, passRateDelta, weakestSub, insights, hasCompare: !!compareExam };
  }, [exam, compareExam, students]);

  // Trend data across all exams
  const trendData = useMemo(() => examsList.map(ex => {
    const rs = buildRows(ex);
    const pcts = rs.map(r => r.percentage);
    return {
      name: ex.examName,
      avg: avg(pcts),
      passRate: pcts.length > 0 ? parseFloat(((pcts.filter(p => p >= 40).length / pcts.length) * 100).toFixed(1)) : 0,
      highest: pcts.length > 0 ? Math.max(...pcts) : 0,
      lowest: pcts.length > 0 ? Math.min(...pcts) : 0,
    };
  }), [examsList, students]);

  // Sorted student rows
  const sortedRows = useMemo(() => {
    if (!data) return [];
    return [...data.rows].sort((a, b) => {
      let va: number | string = a.rank, vb: number | string = b.rank;
      if (sortKey === 'name') { va = a.name; vb = b.name; }
      else if (sortKey === 'percentage') { va = a.percentage; vb = b.percentage; }
      else if (sortKey === 'delta') { va = a.delta ?? -999; vb = b.delta ?? -999; }
      if (typeof va === 'string') return sortAsc ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [data, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(key === 'rank' || key === 'name'); }
  }

  function SortTh({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <th className={cn('px-3 py-2.5 text-left text-xs font-semibold text-gray-500 select-none cursor-pointer whitespace-nowrap border-b border-gray-100 hover:text-gray-700', active && 'text-gray-800')}
        onClick={() => toggleSort(k)}>
        <span className="flex items-center gap-1">
          {label}
          {active ? (sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : <span className="w-3" />}
        </span>
      </th>
    );
  }

  // ── No exams ───────────────────────────────────────────────────────────────
  if (examsList.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-bold text-gray-900">Exam Analytics</h2>
          <span className="text-sm text-gray-400">{selectedClass}</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg">
          <EmptyState icon={<BarChart2 size={36} />} title="No Exams Found"
            subtitle="Create an exam from the Marks Entry tab first." />
        </div>
      </div>
    );
  }

  const TABS = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'students' as const, label: 'Students' },
    { id: 'trends'   as const, label: 'Trends' },
  ];

  // Card wrapper
  const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={cn('bg-white border border-gray-200 rounded-lg', className)}>{children}</div>
  );
  const CardHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div className="px-4 py-3 border-b border-gray-100">
      <div className="text-sm font-semibold text-gray-800">{title}</div>
      {subtitle && <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>}
    </div>
  );

  return (
    <div className="flex flex-col gap-5 text-gray-900">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Exam Analytics</h2>
          <p className="text-sm text-gray-400">{selectedClass} · {students.length} students</p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-2xs font-semibold text-gray-400 uppercase tracking-wide">Analyse Exam</label>
            <select className={cn(filterControlClass, 'min-w-[180px]')} value={examId} onChange={e => setExamId(e.target.value)}>
              {examsList.map(ex => <option key={ex._id} value={ex._id}>{ex.examName}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-2xs font-semibold text-gray-400 uppercase tracking-wide">Compare With</label>
            <select className={cn(filterControlClass, 'min-w-[180px]')} value={compareId} onChange={e => setCompareId(e.target.value)}>
              <option value="">No comparison</option>
              {compareOptions.map(ex => <option key={ex._id} value={ex._id}>{ex.examName}</option>)}
            </select>
          </div>
          {compareOptions.length === 0 && (
            <span className="text-xs text-gray-400 pb-1.5">No earlier exams available for comparison.</span>
          )}
        </div>
      </div>

      {/* ── KEY METRICS ────────────────────────────────────────────────────── */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: 'Class Average', value: fmt(data.classAvg),
              delta: data.avgDelta,
              prev: data.prevAvg !== null ? fmt(data.prevAvg) : null,
              color: '#6366f1',
            },
            {
              label: 'Pass Rate', value: fmt(data.passRate),
              delta: data.passRateDelta,
              prev: data.prevPassRate !== null ? fmt(data.prevPassRate) : null,
              sub: `${data.passingCount} of ${data.rows.length} passed`,
              color: '#16a34a',
            },
            {
              label: 'Highest Score', value: fmt(data.highest),
              sub: data.rows[0]?.name ?? '—',
              color: '#0284c7',
            },
            {
              label: 'Need Attention', value: String(data.atRisk.length),
              sub: data.atRisk.length === 0 ? 'All students passing' : 'below 40%',
              color: data.atRisk.length > 0 ? '#dc2626' : '#16a34a',
            },
          ].map(card => (
            <div key={card.label} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="text-xs font-medium text-gray-500 mb-1">{card.label}</div>
              <div className="text-xl font-bold" style={{ color: card.color }}>{card.value}</div>
              {card.delta != null && (
                <div className="flex items-center gap-2 mt-0.5">
                  <Delta d={card.delta} />
                  {card.prev && <span className="text-2xs text-gray-400">prev: {card.prev}</span>}
                </div>
              )}
              {!card.delta && card.prev && (
                <div className="text-xs text-gray-400 mt-0.5">prev: {card.prev}</div>
              )}
              {(card as any).sub && !card.delta && !(card as any).prev && (
                <div className="text-xs text-gray-400 mt-0.5 truncate">{(card as any).sub}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── TABS ───────────────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════ OVERVIEW ══════════════════════════════════════════════════ */}
      {tab === 'overview' && data && (
        <div className="flex flex-col gap-4">

          {/* TEACHER INSIGHTS — max 3 */}
          {data.insights.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex flex-col gap-1.5">
              {data.insights.map((ins, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-indigo-500 mt-0.5 flex-shrink-0">•</span>
                  {ins}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* SUBJECT PERFORMANCE */}
            <Card>
              <CardHeader title="Subject Performance" subtitle={data.hasCompare ? `vs ${compareExam?.examName}` : undefined} />
              <div className="px-4 py-3 flex flex-col gap-3">
                {data.subjects.length === 0 && <p className="text-sm text-gray-400">No subjects.</p>}
                {data.subjects.map(sub => {
                  const isWeakest = sub.name === data.weakestSub?.name && data.subjects.length > 1;
                  const color = sub.mean >= 60 ? '#16a34a' : sub.mean >= 40 ? '#ca8a04' : '#dc2626';
                  return (
                    <div key={sub.name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-sm font-medium', isWeakest ? 'text-red-600' : 'text-gray-800')}>
                            {sub.name}
                          </span>
                          {isWeakest && (
                            <span className="text-2xs bg-red-50 text-red-500 border border-red-100 px-1.5 py-0.5 rounded">Weakest</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {sub.prevMean !== undefined && (
                            <span className="text-xs text-gray-400">{fmt(sub.prevMean)}</span>
                          )}
                          <span className="text-sm font-bold" style={{ color }}>{fmt(sub.mean)}</span>
                          {sub.delta !== undefined && <Delta d={sub.delta} />}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Bar pct={sub.mean} color={color} />
                        {sub.prevMean !== undefined && (
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                            <div className="h-full rounded-full bg-gray-300" style={{ width: `${Math.min(sub.prevMean, 100)}%` }} />
                          </div>
                        )}
                      </div>
                      <div className="flex justify-between mt-0.5 text-2xs text-gray-400">
                        <span>Pass rate: {fmt(sub.passRate)}</span>
                        <span>{sub.passCount}/{sub.passCount + (data.rows.length - sub.passCount > 0 ? data.rows.length - sub.passCount : 0)} students</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* STUDENTS NEEDING ATTENTION */}
            <Card>
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-800">
                    {data.atRisk.length > 0
                      ? <span className="flex items-center gap-1.5"><AlertTriangle size={13} className="text-red-500" /> Students Needing Attention — {data.atRisk.length}</span>
                      : 'Students Needing Attention'}
                  </div>
                  {data.atRisk.length === 0 && <div className="text-xs text-emerald-600 mt-0.5">All students are above 40% 🎉</div>}
                </div>
              </div>
              {data.atRisk.length > 0 && (
                <div>
                  <div className="divide-y divide-gray-50" style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {/* Table header */}
                    <div className="px-4 py-2 grid grid-cols-12 text-2xs font-semibold text-gray-400 bg-gray-50">
                      <span className="col-span-4">Student</span>
                      <span className="col-span-2 text-center">Score</span>
                      <span className="col-span-3 text-center">Change</span>
                      <span className="col-span-3">Reason</span>
                    </div>
                    {(showAllAtRisk ? data.atRisk : data.atRisk.slice(0, 5)).map(r => {
                      let reason = 'Below pass mark';
                      if (r.delta !== undefined && r.delta < -15) reason = `Dropped ${Math.abs(r.delta).toFixed(0)} pts`;
                      else if (r.delta !== undefined && r.delta < -5) reason = `Declined ${Math.abs(r.delta).toFixed(0)} pts`;
                      else if (r.weakIn) reason = `Weak in ${r.weakIn}`;
                      return (
                        <div key={r.id} className="px-4 py-2 grid grid-cols-12 items-center hover:bg-gray-50">
                          <div className="col-span-4 text-xs font-medium text-gray-800 truncate">{r.name}</div>
                          <div className="col-span-2 text-center text-xs font-bold text-red-500">{r.percentage}%</div>
                          <div className="col-span-3 text-center"><Delta d={r.delta} /></div>
                          <div className="col-span-3 text-2xs text-gray-500 truncate">{reason}</div>
                        </div>
                      );
                    })}
                  </div>
                  {data.atRisk.length > 5 && (
                    <div className="px-4 py-2 border-t border-gray-100">
                      <button onClick={() => setShowAllAtRisk(v => !v)}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                        {showAllAtRisk ? 'Show less' : `View all ${data.atRisk.length}`}
                        <ArrowRight size={11} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* COMPARISON SUMMARY — only when comparing */}
          {data.hasCompare && (
            <Card>
              <CardHeader title={`Comparison — ${exam?.examName} vs ${compareExam?.examName}`} />
              <div className="px-4 py-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
                  {[
                    { label: 'Class Average', curr: fmt(data.classAvg), prev: fmt(data.prevAvg ?? null), d: data.avgDelta },
                    { label: 'Pass Rate', curr: fmt(data.passRate), prev: fmt(data.prevPassRate ?? null), d: data.passRateDelta },
                    { label: 'Students Improved', curr: String(data.rows.filter(r => (r.delta ?? 0) > 0).length), prev: String(data.rows.filter(r => (r.delta ?? 0) < 0).length) + ' declined', d: null },
                  ].map(row => (
                    <div key={row.label} className="px-4 py-3 sm:first:pl-0 sm:last:pr-0">
                      <div className="text-xs text-gray-400 mb-1">{row.label}</div>
                      <div className="flex items-center gap-1.5 text-sm flex-wrap">
                        <span className="font-bold text-gray-900">{row.curr}</span>
                        <ArrowRight size={11} className="text-gray-300" />
                        <span className="text-gray-400">prev: {row.prev}</span>
                        {row.d !== null && row.d !== undefined && <Delta d={row.d} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ══════════ STUDENTS ══════════════════════════════════════════════════ */}
      {tab === 'students' && data && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <SortTh label="Rank" k="rank" />
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 border-b border-gray-100">Adm. No</th>
                  <SortTh label="Student" k="name" />
                  {exam?.subjects.map(s => (
                    <th key={s.name} className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 border-b border-gray-100 whitespace-nowrap">
                      {s.name}<br /><span className="font-normal text-gray-400">/{s.totalMarks}</span>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 border-b border-gray-100">Total</th>
                  <SortTh label="Score" k="percentage" />
                  {data.hasCompare && <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 border-b border-gray-100">Prev</th>}
                  {data.hasCompare && <SortTh label="Change" k="delta" />}
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 border-b border-gray-100">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedRows.map(r => {
                  const isAtRisk = r.percentage < 40;
                  return (
                    <tr key={r.id} className={cn('hover:bg-gray-50 transition-colors', isAtRisk && 'bg-red-50/40')}>
                      <td className="px-3 py-2.5">
                        <span className={cn('inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold',
                          r.rank === 1 ? 'bg-amber-100 text-amber-700' : r.rank === 2 ? 'bg-gray-100 text-gray-600' : r.rank === 3 ? 'bg-orange-100 text-orange-600' : 'text-gray-400')}>
                          {r.rank}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-400">{r.admissionNo}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-900">{r.name}</td>
                      {exam?.subjects.map(sub => {
                        const marks = r.subjectMarks[sub.name] ?? 0;
                        const subPct = sub.totalMarks > 0 ? (marks / sub.totalMarks) * 100 : 0;
                        return (
                          <td key={sub.name} className={cn('px-3 py-2.5 text-center font-medium', subPct < 40 ? 'text-red-500' : 'text-gray-700')}>
                            {marks}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-center text-gray-500">{r.totalObtained}/{r.totalPossible}</td>
                      <td className="px-3 py-2.5 text-center font-bold" style={{ color: r.percentage < 40 ? '#dc2626' : r.percentage >= 75 ? '#16a34a' : '#374151' }}>
                        {r.percentage}%
                      </td>
                      {data.hasCompare && <td className="px-3 py-2.5 text-center text-xs text-gray-400">{r.prevPct !== undefined ? `${r.prevPct}%` : '—'}</td>}
                      {data.hasCompare && <td className="px-3 py-2.5 text-center"><Delta d={r.delta} /></td>}
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                          style={{
                            color: r.percentage >= 90 ? '#15803d' : r.percentage >= 70 ? '#0284c7' : r.percentage >= 40 ? '#ca8a04' : '#dc2626',
                            backgroundColor: r.percentage >= 90 ? '#f0fdf4' : r.percentage >= 70 ? '#eff6ff' : r.percentage >= 40 ? '#fefce8' : '#fef2f2',
                          }}>
                          {r.grade}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ══════════ TRENDS ════════════════════════════════════════════════════ */}
      {tab === 'trends' && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Class Performance Trend" subtitle="Average score and pass rate across all exams" />
            <div className="px-4 py-4">
              <TrendLine
                labels={trendData.map(d => d.name)}
                series={[
                  { name: 'Class Average', color: '#6366f1', values: trendData.map(d => d.avg) },
                  { name: 'Pass Rate', color: '#16a34a', values: trendData.map(d => d.passRate) },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Exam Summary" subtitle="Performance comparison across terms" />
            <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
              <table className="w-full text-sm min-w-[520px] border-collapse">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="sticky left-0 bg-slate-50 z-10 px-4 py-2.5 text-left text-xs font-bold text-slate-700 border-b border-slate-200 shadow-[1px_0_0_0_#e2e8f0]">Exam</th>
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-700 border-b border-slate-200">Class Avg</th>
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-700 border-b border-slate-200">Pass Rate</th>
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-700 border-b border-slate-200">Highest</th>
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-700 border-b border-slate-200">Lowest</th>
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-700 border-b border-slate-200">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trendData.map((d, i) => {
                    const prev = i > 0 ? trendData[i - 1] : null;
                    const td = prev ? diff(d.avg, prev.avg) : null;
                    return (
                      <tr key={d.name} className="hover:bg-slate-50/80 transition-colors">
                        <td className="sticky left-0 bg-white z-10 px-4 py-3 font-bold text-slate-900 border-b border-slate-100 shadow-[1px_0_0_0_#f1f5f9] whitespace-nowrap">
                          {d.name}
                        </td>
                        <td className="px-4 py-3 font-black whitespace-nowrap" style={{ color: d.avg >= 60 ? '#16a34a' : d.avg >= 40 ? '#ca8a04' : '#dc2626' }}>
                          {fmt(d.avg)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={cn('text-xs font-bold px-2 py-0.5 rounded-md border', d.passRate >= 75 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200')}>
                            {fmt(d.passRate)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-emerald-600 font-extrabold whitespace-nowrap">{fmt(trendData[i]?.highest ?? null)}</td>
                        <td className="px-4 py-3 text-rose-500 font-bold whitespace-nowrap">{fmt(trendData[i]?.lowest ?? null)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{td !== null ? <Delta d={td} /> : <span className="text-xs text-slate-400 font-medium">First exam</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ExamAnalytics;
