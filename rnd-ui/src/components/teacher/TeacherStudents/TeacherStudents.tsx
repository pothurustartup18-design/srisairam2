import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Eye, FileText, FolderOpen, MessageSquare, BarChart3, Phone, Users,
  ChevronDown, Search, ArrowUpDown, Check, X, AlertTriangle, Sparkles,
  SlidersHorizontal, RotateCcw
} from 'lucide-react';
import type { StudentData } from '../../../types';
import { API_BASE, formatClassName } from '../../../constants';
import { cn } from '../../../lib/utils';
import { getAvatarColors, getInitials } from '../../../utils/avatar';
import {
  Button, PageHeader, Badge, DataTable, Th, Td, Tr,
  FilterToolbar, FilterGroup, filterControlClass,
  EmptyState, LoadingSpinner, Modal,
} from '../../ui';
import { SkeletonList, SkeletonTableRows } from '../../ui/Skeleton';

interface TeacherStudentsProps {
  students: StudentData[];
  /** True while the class roster is loading for the first time. */
  loading?: boolean;
  attendanceStats: Record<string, number>;
  teacherId?: string;
  onMessageParent: (student: StudentData) => void;
}

const TeacherStudents: React.FC<TeacherStudentsProps> = ({ students, loading = false, attendanceStats, teacherId, onMessageParent }) => {
  // Results State
  const [examResults, setExamResults] = useState<any[]>([]);
  const [selectedStudentForResults, setSelectedStudentForResults] = useState<any | null>(null);
  const [activeExamId, setActiveExamId] = useState<string>('');
  const [resultsLoading, setResultsLoading] = useState(false);

  // Report Gallery State
  const [selectedStudentForReportGallery, setSelectedStudentForReportGallery] = useState<any | null>(null);
  const [studentReportExams, setStudentReportExams] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // Enterprise Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'good' | 'defaulters'>('all');
  const [rankSort, setRankSort] = useState<'none' | 'overall' | string>('none');
  const [sortOrder, setSortOrder] = useState<'default' | 'az' | 'za' | 'admAsc' | 'admDesc'>('default');
  const [performanceFilter, setPerformanceFilter] = useState<'all' | 'toppers'>('all');

  // Mobile Bottom Sheet States
  const [showMobileRankSheet, setShowMobileRankSheet] = useState(false);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  // Load teacher exams list dynamically
  const [examsList, setExamsList] = useState<any[]>([]);

  useEffect(() => {
    if (!teacherId) return;
    const fetchTeacherExams = async () => {
      try {
        const res = await fetch(`${API_BASE}/marks/history?teacherId=${teacherId}`);
        const data = await res.json();
        if (data.success) {
          setExamsList(data.data || []);
        }
      } catch (err) {
        console.error('Failed to load teacher exams:', err);
      }
    };
    fetchTeacherExams();
  }, [teacherId]);

  // Collect all unique exam names from teacher's exams list
  const availableExams = useMemo(() => {
    return Array.from(new Set(examsList.map(ex => ex.examName).filter(Boolean)));
  }, [examsList]);

  // Fetch results when active student changes
  useEffect(() => {
    if (!selectedStudentForResults) {
      setExamResults([]);
      setActiveExamId('');
      return;
    }

    const fetchResults = async () => {
      setResultsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/marks/student/${selectedStudentForResults.id || selectedStudentForResults._id}`);
        const data = await res.json();
        if (data.success) {
          setExamResults(data.data || []);
          if (data.data && data.data.length > 0) {
            setActiveExamId(data.data[0]._id);
          }
        }
      } catch (err) {
        console.error('Failed to load exam results:', err);
      } finally {
        setResultsLoading(false);
      }
    };

    fetchResults();
  }, [selectedStudentForResults]);

  const handleViewReportCard = async (student: any) => {
    setSelectedStudentForReportGallery(student);
    setLoadingReports(true);
    setStudentReportExams([]);
    try {
      const res = await fetch(`${API_BASE}/marks/student/${student.id || student._id}`);
      const data = await res.json();
      if (data.success && data.data && data.data.length > 0) {
        const reports = data.data.filter((ex: any) => ex.pdfUrl);
        setStudentReportExams(reports);
      }
    } catch (err) {
      console.error('Failed to load report card exams:', err);
    } finally {
      setLoadingReports(false);
    }
  };

  // Counts for quick filter indicators
  const defaultersCount = useMemo(() => {
    return students.filter(s => {
      const sid = s.id || (s as any)._id;
      const pct = sid && attendanceStats[sid] !== undefined ? attendanceStats[sid] : 100;
      return pct < 75;
    }).length;
  }, [students, attendanceStats]);

  // Precompute student exam percentages dynamically from examsList
  const studentExamStats = useMemo(() => {
    const stats: Record<string, { byExam: Record<string, number>; overall: number }> = {};

    students.forEach(s => {
      const sid = String(s.id || (s as any)._id || '');
      const adm = String(s.admissionNo || '').trim().toLowerCase();
      stats[sid] = { byExam: {}, overall: s.academicPercentage ?? 0 };
      if (adm) stats[adm] = stats[sid];
    });

    if (!examsList || examsList.length === 0) return stats;

    const studentExamScores: Record<string, number[]> = {};

    examsList.forEach(exam => {
      if (!exam.subjects || !exam.studentMarks) return;
      const totalPossible = exam.subjects.reduce((sum: number, sub: any) => sum + (Number(sub.totalMarks) || 0), 0);
      if (totalPossible <= 0) return;

      exam.studentMarks.forEach((sm: any) => {
        const rawSid = sm.student?._id || sm.student;
        const sid = String(rawSid || '');
        const adm = String(sm.student?.admissionNo || sm.admissionNo || '').trim().toLowerCase();

        let totalObtained = 0;
        let hasMarks = false;
        if (Array.isArray(sm.marks)) {
          sm.marks.forEach((m: any) => {
            if (m.marks !== undefined && m.marks !== null && m.marks !== '') {
              totalObtained += Number(m.marks) || 0;
              hasMarks = true;
            }
          });
        }

        if (hasMarks) {
          const pct = Math.round((totalObtained / totalPossible) * 100);
          const targetObj = stats[sid] || (adm && stats[adm]) || { byExam: {}, overall: 0 };
          targetObj.byExam[exam.examName] = pct;

          if (sid) {
            stats[sid] = targetObj;
            if (!studentExamScores[sid]) studentExamScores[sid] = [];
            studentExamScores[sid].push(pct);
          }
          if (adm) {
            stats[adm] = targetObj;
          }
        }
      });
    });

    // Compute overall average across exams
    Object.keys(studentExamScores).forEach(sid => {
      const scores = studentExamScores[sid];
      if (scores.length > 0 && stats[sid]) {
        const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        stats[sid].overall = avg;
      }
    });

    return stats;
  }, [students, examsList]);

  const getStudentPercentage = useCallback((s: StudentData) => {
    const sid = String(s.id || (s as any)._id || '');
    const adm = String(s.admissionNo || '').trim().toLowerCase();
    const entry = studentExamStats[sid] || (adm && studentExamStats[adm]);

    if (rankSort !== 'none' && rankSort !== 'overall') {
      if (entry?.byExam?.[rankSort] !== undefined) {
        return entry.byExam[rankSort];
      }
      if (s.examPercentages && s.examPercentages[rankSort] !== undefined) {
        return s.examPercentages[rankSort];
      }
    }
    if (rankSort === 'overall' && entry?.overall !== undefined) {
      return entry.overall;
    }
    return entry?.overall ?? s.academicPercentage ?? 0;
  }, [studentExamStats, rankSort]);

  const toppersCount = useMemo(() => {
    return students.filter(s => getStudentPercentage(s) >= 75).length;
  }, [students, getStudentPercentage]);

  // Unified Filtered and Sorted Students
  const filteredStudents = useMemo(() => {
    let list = [...students];

    // 1. Text Search
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(s =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.admissionNo && s.admissionNo.toLowerCase().includes(q)) ||
        (s.cluster && s.cluster.toLowerCase().includes(q))
      );
    }

    // 2. Attendance Filter
    if (attendanceFilter === 'defaulters') {
      list = list.filter(s => {
        const sid = s.id || (s as any)._id;
        const pct = sid && attendanceStats[sid] !== undefined ? attendanceStats[sid] : 100;
        return pct < 75;
      });
    } else if (attendanceFilter === 'good') {
      list = list.filter(s => {
        const sid = s.id || (s as any)._id;
        const pct = sid && attendanceStats[sid] !== undefined ? attendanceStats[sid] : 100;
        return pct >= 75;
      });
    }

    // 3. Performance Filter
    if (performanceFilter === 'toppers') {
      list = list.filter(s => getStudentPercentage(s) >= 75);
    }

    // 4. Rank & Ordering Logic
    if (rankSort !== 'none') {
      list.sort((a, b) => {
        const aPct = getStudentPercentage(a);
        const bPct = getStudentPercentage(b);
        return bPct - aPct;
      });
    } else if (sortOrder === 'az') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortOrder === 'za') {
      list.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    } else if (sortOrder === 'admAsc') {
      list.sort((a, b) => (a.admissionNo || '').localeCompare(b.admissionNo || '', undefined, { numeric: true }));
    } else if (sortOrder === 'admDesc') {
      list.sort((a, b) => (b.admissionNo || '').localeCompare(a.admissionNo || '', undefined, { numeric: true }));
    }

    return list;
  }, [students, searchQuery, attendanceFilter, performanceFilter, rankSort, sortOrder, attendanceStats, getStudentPercentage]);

  const hasActiveFilters = searchQuery !== '' || attendanceFilter !== 'all' || rankSort !== 'none' || sortOrder !== 'default' || performanceFilter !== 'all';

  const resetAllFilters = () => {
    setSearchQuery('');
    setAttendanceFilter('all');
    setRankSort('none');
    setSortOrder('default');
    setPerformanceFilter('all');
  };

  const activeExam = examResults.find(ex => ex._id === activeExamId);

  return (
    <div className="flex flex-col gap-4 font-sans text-slate-900">

      <PageHeader
        title="My Class Student Roster"
        subtitle="Attendance, results, and report cards for your assigned class."
      />

      {/* ── Desktop Filter Toolbar (≥768px only) ── */}
      <div className="hidden md:block">
        <FilterToolbar>
          {/* Search Box */}
          <FilterGroup label="Search Student">
            <div className="relative flex items-center">
              <Search size={14} className="absolute left-2.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                className={cn(filterControlClass, 'pl-8 pr-7 w-56')}
                placeholder="Name or Adm No..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </FilterGroup>

          {/* Sort by Rank */}
          <FilterGroup label="Sort by Rank">
            <select
              className={cn(filterControlClass, 'min-w-[170px]')}
              value={rankSort}
              onChange={(e) => setRankSort(e.target.value)}
            >
              <option value="none">Standard Order</option>
              <option value="overall">Overall Exams Avg</option>
              {availableExams.length > 0 && (
                <optgroup label="By Examination">
                  {availableExams.map(ex => (
                    <option key={ex} value={ex}>{ex}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </FilterGroup>

          {/* Attendance Filter */}
          <FilterGroup label="Attendance">
            <select
              className={cn(filterControlClass, 'min-w-[140px]')}
              value={attendanceFilter}
              onChange={(e) => setAttendanceFilter(e.target.value as any)}
            >
              <option value="all">All ({students.length})</option>
              <option value="defaulters">⚠️ &lt;75% Low ({defaultersCount})</option>
              <option value="good">✓ ≥75% Good ({students.length - defaultersCount})</option>
            </select>
          </FilterGroup>

          {/* Alphabetical / Order */}
          <FilterGroup label="Order">
            <select
              className={cn(filterControlClass, 'min-w-[130px]')}
              value={sortOrder}
              disabled={rankSort !== 'none'}
              onChange={(e) => setSortOrder(e.target.value as any)}
            >
              <option value="default">Default</option>
              <option value="az">Name: A → Z</option>
              <option value="za">Name: Z → A</option>
              <option value="admAsc">Adm No: Asc</option>
              <option value="admDesc">Adm No: Desc</option>
            </select>
          </FilterGroup>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <div className="flex items-end pb-0.5">
              <button
                type="button"
                onClick={resetAllFilters}
                className="h-[38px] px-3 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw size={12} /> Reset
              </button>
            </div>
          )}
        </FilterToolbar>
      </div>

      {/* ── Desktop / Tablet Data Table (≥768px) ── */}
      <div className="hidden md:block">
        <DataTable
          card
          header={
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-md font-bold text-slate-900">Student Directory</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                  {filteredStudents.length} of {students.length}
                </span>
              </div>
              {rankSort !== 'none' && (
                <Badge variant="blue" size="sm">
                  Sorted by Rank: {rankSort === 'overall' ? 'Overall Avg' : rankSort}
                </Badge>
              )}
            </div>
          }
        >
          <thead>
            <tr>
              <Th>Admission ID</Th>
              <Th>Student</Th>
              <Th>Class &amp; Section</Th>
              <Th className="text-center">Attendance %</Th>
              <Th>Parent WhatsApp</Th>
              <Th className="text-center">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading && students.length === 0 ? (
              <SkeletonTableRows rows={6} cols={6} />
            ) : filteredStudents.length === 0 ? (
              <tr>
                <Td colSpan={6}>
                  <EmptyState
                    icon={<Users size={36} />}
                    title="No students match filters"
                    subtitle="Try adjusting your search query or filters."
                  />
                </Td>
              </tr>
            ) : (
              filteredStudents.map((s) => {
                const sid = s.id || (s as any)._id;
                const pct = (sid && attendanceStats[sid] !== undefined) ? attendanceStats[sid] : 100;
                const [bg, fg] = getAvatarColors(s.name);
                return (
                  <Tr key={s.id || s.admissionNo}>
                    <Td><span className="text-sm font-semibold text-slate-700">{s.admissionNo}</span></Td>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0" style={{ background: bg, color: fg }}>
                          {getInitials(s.name)}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900">{s.name}</div>
                          {s.academicPercentage !== undefined && (
                            <div className="text-[11px] font-semibold text-blue-600">
                              Avg: {s.academicPercentage}%
                            </div>
                          )}
                        </div>
                      </div>
                    </Td>
                    <Td><Badge variant="blue" size="sm">{formatClassName(s.class, s.section)}</Badge></Td>
                    <Td className="text-center">
                      <Badge variant={pct >= 75 ? 'green' : 'red'} size="sm">{pct}%</Badge>
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <Phone size={11} className="text-blue flex-shrink-0" />
                          {s.whatsappNo || 'N/A'}
                        </div>
                        {s.cluster && <div className="text-xs text-slate-400">📍 {s.cluster}</div>}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5 justify-center">
                        <button
                          className="flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-blue-200 bg-blue-lt text-blue text-xs font-bold hover:bg-blue-100 transition-colors"
                          onClick={() => setSelectedStudentForResults(s)}
                        >
                          <BarChart3 size={13} /> Results
                        </button>
                        <button
                          className="w-8 h-8 flex items-center justify-center rounded-md border border-blue-200 bg-blue-lt text-blue hover:bg-blue-100 transition-colors"
                          title="View Academic Report Cards Gallery"
                          onClick={() => handleViewReportCard(s)}
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          className="w-8 h-8 flex items-center justify-center rounded-md border border-green-200 text-green hover:bg-green-lt transition-colors"
                          title="Message Parent"
                          onClick={() => onMessageParent(s)}
                        >
                          <MessageSquare size={15} />
                        </button>
                      </div>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </DataTable>
      </div>

      {/* ── Enterprise Mobile Student Roster (< 768px) ── */}
      <div className="md:hidden flex flex-col gap-2.5">
        {/* Mobile Search & Resized Rank Dropdown Row */}
        <div className="flex items-center gap-2">
          {/* Search Bar */}
          <div className="mobile-roster-search flex-1 min-w-0">
            <Search size={15} className="text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Search students..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-600 text-xs px-1"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Resized Compact Rank Dropdown */}
          <div className="relative flex-shrink-0 w-36 sm:w-44">
            <select
              className="w-full h-11 pl-2.5 pr-7 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue transition-colors appearance-none shadow-xs truncate"
              value={rankSort}
              onChange={(e) => setRankSort(e.target.value)}
            >
              <option value="none">Rank: None</option>
              <option value="overall">Rank: Overall</option>
              {availableExams.length > 0 && (
                <optgroup label="By Exam">
                  {availableExams.map(ex => (
                    <option key={ex} value={ex}>Rank: {ex}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Enterprise Horizontal Filter Chips */}
        <div className="mobile-filter-pill-row">
          {/* Filter: All */}
          <button
            type="button"
            onClick={() => {
              setAttendanceFilter('all');
              setPerformanceFilter('all');
            }}
            className={cn('mobile-filter-pill', attendanceFilter === 'all' && performanceFilter === 'all' && 'active')}
          >
            All ({students.length})
          </button>

          {/* Filter: Defaulters */}
          <button
            type="button"
            onClick={() => {
              setAttendanceFilter(attendanceFilter === 'defaulters' ? 'all' : 'defaulters');
              setPerformanceFilter('all');
            }}
            className={cn(
              'mobile-filter-pill',
              attendanceFilter === 'defaulters' && '!bg-rose-600 !border-rose-600 !text-white'
            )}
          >
            ⚠️ &lt;75% Attendance ({defaultersCount})
          </button>

          {/* Filter: Top Performers */}
          <button
            type="button"
            onClick={() => {
              setPerformanceFilter(performanceFilter === 'toppers' ? 'all' : 'toppers');
              setAttendanceFilter('all');
            }}
            className={cn(
              'mobile-filter-pill',
              performanceFilter === 'toppers' && '!bg-amber-600 !border-amber-600 !text-white'
            )}
          >
            🏆 Top Performers ({toppersCount})
          </button>

          {/* Filter: Alphabetical */}
          <button
            type="button"
            onClick={() => {
              if (sortOrder === 'az') setSortOrder('za');
              else if (sortOrder === 'za') setSortOrder('default');
              else setSortOrder('az');
            }}
            className={cn('mobile-filter-pill', (sortOrder === 'az' || sortOrder === 'za') && 'active')}
          >
            <ArrowUpDown size={11} className="inline mr-1" />
            {sortOrder === 'az' ? 'A → Z' : sortOrder === 'za' ? 'Z → A' : 'A-Z Sort'}
          </button>
        </div>

        {/* Active Filter Summary Strip */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between px-1 py-1 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-slate-400 font-medium text-[11px]">Active filters:</span>
              {rankSort !== 'none' && (
                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue font-bold text-[10px] flex items-center gap-1">
                  Rank: {rankSort === 'overall' ? 'Overall Avg' : rankSort}
                  <button type="button" onClick={() => setRankSort('none')}><X size={10} /></button>
                </span>
              )}
              {attendanceFilter === 'defaulters' && (
                <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-bold text-[10px] flex items-center gap-1">
                  &lt;75% Attendance
                  <button type="button" onClick={() => setAttendanceFilter('all')}><X size={10} /></button>
                </span>
              )}
              {performanceFilter === 'toppers' && (
                <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold text-[10px] flex items-center gap-1">
                  Top Performers
                  <button type="button" onClick={() => setPerformanceFilter('all')}><X size={10} /></button>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-blue font-bold text-xs underline flex-shrink-0 ml-2"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Compact List Card */}
        {loading && students.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden"><SkeletonList rows={5} label="Loading students…" /></div>
        ) : filteredStudents.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <Users size={32} className="mx-auto text-slate-300 mb-2" />
            <div className="text-sm font-semibold text-slate-700">No students match filter</div>
            <div className="text-xs text-slate-400 mt-1">Try resetting your search or filter pills</div>
            <button
              type="button"
              onClick={resetAllFilters}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-blue bg-blue-50 px-3 py-1.5 rounded-lg"
            >
              <RotateCcw size={12} /> Reset all filters
            </button>
          </div>
        ) : (
          <div className="mobile-roster-card">
            {filteredStudents.map((s) => {
              const studentId = s.id || (s as any)._id;
              const pct = (studentId && attendanceStats[studentId] !== undefined) ? attendanceStats[studentId] : 100;
              const [bg, fg] = getAvatarColors(s.name);
              const isExpanded = expandedStudentId === studentId;

              return (
                <div key={studentId || s.admissionNo}>
                  {/* Row */}
                  <div
                    className="student-compact-row px-3"
                    onClick={() => setExpandedStudentId(isExpanded ? null : studentId)}
                  >
                    <div
                      className="student-compact-avatar"
                      style={{ background: bg, color: fg }}
                    >
                      {getInitials(s.name)}
                    </div>
                    <div className="student-compact-info">
                      <div className="student-compact-name flex items-center gap-1.5">
                        <span className="truncate">{s.name}</span>
                        {rankSort !== 'none' && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-50 text-blue font-bold flex-shrink-0">
                            {getStudentPercentage(s)}%
                          </span>
                        )}
                      </div>
                      <div className="student-compact-adm">
                        Adm: {s.admissionNo}
                        {s.cluster ? ` · 📍 ${s.cluster}` : ''}
                      </div>
                    </div>
                    <div className="student-compact-right">
                      <span
                        className={cn(
                          'text-[11px] font-extrabold px-2 py-0.5 rounded-full border',
                          pct >= 75
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : pct >= 50
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        )}
                      >
                        {pct}%
                      </span>
                      <ChevronDown
                        size={14}
                        className={cn(
                          'text-slate-400 transition-transform duration-200',
                          isExpanded && 'rotate-180 text-blue-600'
                        )}
                      />
                    </div>
                  </div>

                  {/* Expanded Accordion Panel */}
                  {isExpanded && (
                    <div className="student-expanded-panel mx-2 mb-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="student-expanded-field">
                          <span className="student-expanded-label">Class &amp; Section</span>
                          <span className="student-expanded-value">{formatClassName(s.class, s.section)}</span>
                        </div>
                        <div className="student-expanded-field">
                          <span className="student-expanded-label">Parent WhatsApp</span>
                          <span className="student-expanded-value flex items-center gap-1">
                            <Phone size={11} className="text-emerald-600" />
                            {s.whatsappNo || 'N/A'}
                          </span>
                        </div>
                        {s.cluster && (
                          <div className="student-expanded-field col-span-2">
                            <span className="student-expanded-label">Area / Location</span>
                            <span className="student-expanded-value">📍 {s.cluster}</span>
                          </div>
                        )}
                      </div>

                      <div className="student-expanded-actions">
                        <button
                          type="button"
                          className="student-action-btn results"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStudentForResults(s);
                          }}
                        >
                          <BarChart3 size={13} /> Results
                        </button>
                        <button
                          type="button"
                          className="student-action-btn results"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewReportCard(s);
                          }}
                        >
                          <Eye size={13} /> Reports
                        </button>
                        <button
                          type="button"
                          className="student-action-btn message"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMessageParent(s);
                          }}
                        >
                          <MessageSquare size={13} /> Message
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Mobile Rank Sort Picker Sheet (Strictly Screen-Bounded) ── */}
      {showMobileRankSheet && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-xs animate-fadeIn"
          onClick={() => setShowMobileRankSheet(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden border-t border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle */}
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mt-3 mb-2 flex-shrink-0" />

            {/* Sheet Header */}
            <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue flex items-center justify-center font-bold">
                  <BarChart3 size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 m-0">Sort Roster by Rank</h4>
                  <p className="text-xs text-slate-400 m-0">Select academic score to rank students</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileRankSheet(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            {/* Sheet Options List */}
            <div className="p-3 overflow-y-auto flex flex-col gap-2 -webkit-overflow-scrolling-touch">
              {/* Option: Standard Order */}
              <button
                type="button"
                onClick={() => {
                  setRankSort('none');
                  setShowMobileRankSheet(false);
                }}
                className={cn(
                  'w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all',
                  rankSort === 'none'
                    ? 'border-blue bg-blue/5 text-blue font-bold shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    'w-4 h-4 rounded-full border flex items-center justify-center',
                    rankSort === 'none' ? 'border-blue bg-blue text-white' : 'border-slate-300'
                  )}>
                    {rankSort === 'none' && <Check size={10} strokeWidth={3} />}
                  </div>
                  <div>
                    <div className="text-sm font-bold">None (Standard Order)</div>
                    <div className="text-xs text-slate-400">Regular admission list order</div>
                  </div>
                </div>
              </button>

              {/* Option: Overall Average */}
              <button
                type="button"
                onClick={() => {
                  setRankSort('overall');
                  setShowMobileRankSheet(false);
                }}
                className={cn(
                  'w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all',
                  rankSort === 'overall'
                    ? 'border-blue bg-blue/5 text-blue font-bold shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    'w-4 h-4 rounded-full border flex items-center justify-center',
                    rankSort === 'overall' ? 'border-blue bg-blue text-white' : 'border-slate-300'
                  )}>
                    {rankSort === 'overall' && <Check size={10} strokeWidth={3} />}
                  </div>
                  <div>
                    <div className="text-sm font-bold">Overall Exams Average</div>
                    <div className="text-xs text-slate-400">Ranks students by cumulative average</div>
                  </div>
                </div>
                <Badge variant="blue" size="sm">Overall Avg</Badge>
              </button>

              {/* Exam Specific Option Section */}
              {availableExams.length > 0 && (
                <div className="mt-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-2">
                    Individual Examinations
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {availableExams.map((ex) => {
                      const isSelected = rankSort === ex;
                      return (
                        <button
                          key={ex}
                          type="button"
                          onClick={() => {
                            setRankSort(ex);
                            setShowMobileRankSheet(false);
                          }}
                          className={cn(
                            'w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all',
                            isSelected
                              ? 'border-blue bg-blue/5 text-blue font-bold shadow-xs'
                              : 'border-slate-200 bg-white text-slate-700'
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={cn(
                              'w-4 h-4 rounded-full border flex items-center justify-center',
                              isSelected ? 'border-blue bg-blue text-white' : 'border-slate-300'
                            )}>
                              {isSelected && <Check size={10} strokeWidth={3} />}
                            </div>
                            <span className="text-sm font-semibold">{ex}</span>
                          </div>
                          <span className="text-xs font-semibold text-slate-400">Rank Highest</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── EXAM RESULTS MODAL ────────────────────────────────────────────────── */}
      <Modal
        isOpen={!!selectedStudentForResults}
        onClose={() => setSelectedStudentForResults(null)}
        title={selectedStudentForResults ? `Exam Results: ${selectedStudentForResults.name}` : ''}
        subtitle={selectedStudentForResults ? `Admission ID: ${selectedStudentForResults.admissionNo} · Class ${selectedStudentForResults.class}-${selectedStudentForResults.section}` : ''}
        maxWidth="500px"
      >
        {resultsLoading ? (
          <LoadingSpinner fullPage />
        ) : examResults.length === 0 ? (
          <EmptyState title="No exam results found for this student." />
        ) : (
          <div className="flex flex-col gap-4">
            <FilterGroup label="Select Exam">
              <select className={filterControlClass} value={activeExamId} onChange={(e) => setActiveExamId(e.target.value)}>
                {examResults.map((ex) => (
                  <option key={ex._id} value={ex._id}>{ex.examName}</option>
                ))}
              </select>
            </FilterGroup>

            {activeExam && (
              <>
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                  <div>
                    <div className="text-2xs font-bold uppercase tracking-wide text-slate-400">Aggregate Score</div>
                    <div className="text-lg font-extrabold text-slate-900">{activeExam.totalObtained} / {activeExam.totalPossible}</div>
                  </div>
                  <Badge variant={activeExam.percentage >= 75 ? 'green' : activeExam.percentage >= 40 ? 'amber' : 'red'}>
                    {activeExam.percentage}%
                  </Badge>
                </div>

                <DataTable card={false}>
                  <thead>
                    <tr><Th>Subject</Th><Th className="text-right">Score</Th></tr>
                  </thead>
                  <tbody>
                    {activeExam.subjects.map((sub: any) => {
                      const sMark = activeExam.marks.find((m: any) => m.subject.toLowerCase() === sub.name.toLowerCase());
                      const obtained = sMark ? sMark.obtainedMarks : 0;
                      const subPct = sub.totalMarks ? Math.round((obtained / sub.totalMarks) * 100) : 0;
                      const barColor = subPct >= 75 ? 'bg-green' : subPct >= 40 ? 'bg-amber' : 'bg-red';
                      return (
                        <Tr key={sub.name}>
                          <Td>
                            <div className="font-bold text-slate-800">{sub.name}</div>
                            <div className="h-1.5 w-32 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                              <div className={cn('h-full rounded-full', barColor)} style={{ width: `${subPct}%` }} />
                            </div>
                          </Td>
                          <Td className="text-right"><strong className="text-slate-900">{obtained}</strong> / {sub.totalMarks}</Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </DataTable>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* ── REPORT CARDS GALLERY MODAL ────────────────────────────────────────── */}
      <Modal
        isOpen={!!selectedStudentForReportGallery}
        onClose={() => setSelectedStudentForReportGallery(null)}
        title="Report Cards Gallery"
        subtitle={selectedStudentForReportGallery ? `${selectedStudentForReportGallery.name} (Adm: ${selectedStudentForReportGallery.admissionNo})` : ''}
        maxWidth="650px"
      >
        {loadingReports ? (
          <LoadingSpinner fullPage />
        ) : studentReportExams.length === 0 ? (
          <EmptyState icon={<FolderOpen size={40} />} title="No report cards generated yet." subtitle="Generated report cards will appear here." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {studentReportExams.map((exam) => {
              const pct = exam.percentage || 0;
              const pctVariant = pct >= 75 ? 'green' : pct >= 40 ? 'amber' : 'red';
              return (
                <div
                  key={exam._id}
                  className="border border-slate-200 rounded-lg p-4 flex flex-col gap-2 cursor-pointer hover:border-blue transition-colors bg-white"
                  onClick={() => window.open(exam.pdfUrl, '_blank')}
                >
                  <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                    <FileText size={24} />
                  </div>
                  <div className="text-sm font-bold text-slate-900 text-center truncate">{exam.examName}</div>
                  <Badge variant={pctVariant} size="sm" className="mx-auto">Score: {pct}%</Badge>
                  <Button
                    size="sm"
                    className="w-full justify-center mt-1"
                    onClick={(e) => { e.stopPropagation(); window.open(exam.pdfUrl, '_blank'); }}
                  >
                    <Eye size={13} /> View Report
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TeacherStudents;
