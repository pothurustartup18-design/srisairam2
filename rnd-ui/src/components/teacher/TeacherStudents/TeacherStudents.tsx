import React, { useState, useEffect } from 'react';
import { Eye, FileText, FolderOpen, MessageSquare, BarChart3, Phone, Users } from 'lucide-react';
import type { StudentData } from '../../../types';
import { API_BASE, formatClassName } from '../../../constants';
import { cn } from '../../../lib/utils';
import { getAvatarColors, getInitials } from '../../../utils/avatar';
import {
  Button, PageHeader, Badge, DataTable, Th, Td, Tr,
  FilterToolbar, FilterGroup, filterControlClass,
  EmptyState, LoadingSpinner, Modal, MobileRowCard, MobileCardList,
} from '../../ui';

interface TeacherStudentsProps {
  students: StudentData[];
  attendanceStats: Record<string, number>;
  teacherId?: string;
  onMessageParent: (student: StudentData) => void;
}

const TeacherStudents: React.FC<TeacherStudentsProps> = ({ students, attendanceStats, teacherId, onMessageParent }) => {
  // Results State
  const [examResults, setExamResults] = useState<any[]>([]);
  const [selectedStudentForResults, setSelectedStudentForResults] = useState<any | null>(null);
  const [activeExamId, setActiveExamId] = useState<string>('');
  const [resultsLoading, setResultsLoading] = useState(false);

  // Report Gallery State
  const [selectedStudentForReportGallery, setSelectedStudentForReportGallery] = useState<any | null>(null);
  const [studentReportExams, setStudentReportExams] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // Sorting State
  const [sortBy, setSortBy] = useState<'none' | 'rank'>('none');
  const [rankSort, setRankSort] = useState<'none' | 'overall' | string>('none');

  // Load teacher exams list dynamically
  const [examsList, setExamsList] = useState<any[]>([]);

  useEffect(() => {
    if (!teacherId) return;
    const fetchTeacherExams = async () => {
      try {
        const res = await fetch(`${API_BASE}/marks/history?teacherId=${teacherId}`);
        const data = await res.json();
        if (data.success) {
          setExamsList(data.data);
        }
      } catch (err) {
        console.error('Failed to load teacher exams:', err);
      }
    };
    fetchTeacherExams();
  }, [teacherId]);

  // Collect all unique exam names from teacher's exams list
  const availableExams = Array.from(new Set(examsList.map(ex => ex.examName)));

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
          setExamResults(data.data);
          if (data.data.length > 0) {
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
      if (data.success && data.data.length > 0) {
        const reports = data.data.filter((ex: any) => ex.pdfUrl);
        setStudentReportExams(reports);
      }
    } catch (err) {
      console.error('Failed to load report card exams:', err);
    } finally {
      setLoadingReports(false);
    }
  };

  // Apply sorting logic
  let displayedStudents = [...students];

  if (sortBy === 'rank' && rankSort !== 'none') {
    displayedStudents.sort((a, b) => {
      if (rankSort === 'overall') {
        const aPct = a.academicPercentage || 0;
        const bPct = b.academicPercentage || 0;
        return bPct - aPct;
      } else {
        const aPct = (a.examPercentages && a.examPercentages[rankSort]) || 0;
        const bPct = (b.examPercentages && b.examPercentages[rankSort]) || 0;
        return bPct - aPct;
      }
    });
  }

  const activeExam = examResults.find(ex => ex._id === activeExamId);

  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900">

      <PageHeader
        title="My Class Student Roster"
        subtitle="Attendance, results, and report cards for your assigned class."
      />

      <FilterToolbar>
        <FilterGroup label="Sort by Rank">
          <select
            className={cn(filterControlClass, 'min-w-[180px]')}
            value={rankSort}
            onChange={(e) => {
              const val = e.target.value;
              setRankSort(val);
              setSortBy(val === 'none' ? 'none' : 'rank');
            }}
          >
            <option value="none">None</option>
            <option value="overall">Overall Exams Avg</option>
            {availableExams.map(ex => (
              <option key={ex} value={ex}>{ex}</option>
            ))}
          </select>
        </FilterGroup>
      </FilterToolbar>

      {/* Desktop/tablet table */}
      <div className="hidden md:block">
        <DataTable
          card
          header={
            <div className="flex items-center justify-between">
              <div className="text-md font-bold text-slate-900">Student Directory</div>
              <span className="text-xs text-slate-400">{displayedStudents.length} students</span>
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
            {displayedStudents.length === 0 ? (
              <tr><Td colSpan={6}>
                <EmptyState icon={<Users size={36} />} title="No students found"
                  subtitle="No students in your assigned class." />
              </Td></tr>
            ) : (
              displayedStudents.map((s) => {
                const pct = attendanceStats[s.id] !== undefined ? attendanceStats[s.id] : 100;
                const [bg, fg] = getAvatarColors(s.name);
                return (
                  <Tr key={s.id}>
                    <Td><span className="text-sm font-semibold text-slate-700">{s.admissionNo}</span></Td>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0" style={{ background: bg, color: fg }}>
                          {getInitials(s.name)}
                        </div>
                        <div className="text-sm font-bold text-slate-900">{s.name}</div>
                      </div>
                    </Td>
                    <Td><Badge variant="blue" size="sm">{formatClassName(s.class, s.section)}</Badge></Td>
                    <Td className="text-center">
                      <Badge variant={pct >= 75 ? 'green' : 'red'} size="sm">{pct}%</Badge>
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600"><Phone size={11} className="text-blue flex-shrink-0" />{s.whatsappNo}</div>
                        {s.cluster && <div className="text-xs text-slate-400">📍 {s.cluster}</div>}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5 justify-center">
                        <button className="flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-blue-200 bg-blue-lt text-blue text-xs font-bold hover:bg-blue-100 transition-colors" onClick={() => setSelectedStudentForResults(s)}>
                          <BarChart3 size={13} /> Results
                        </button>
                        <button className="w-8 h-8 flex items-center justify-center rounded-md border border-blue-200 bg-blue-lt text-blue hover:bg-blue-100 transition-colors" title="View Academic Report Cards Gallery" onClick={() => handleViewReportCard(s)}>
                          <Eye size={15} />
                        </button>
                        <button className="w-8 h-8 flex items-center justify-center rounded-md border border-green-200 text-green hover:bg-green-lt transition-colors" title="Message Parent" onClick={() => onMessageParent(s)}>
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

      {/* Mobile card view */}
      <div className="md:hidden flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-md font-bold text-slate-900">Student Directory</div>
          <span className="text-xs text-slate-400">{displayedStudents.length} students</span>
        </div>
        {displayedStudents.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg shadow-card">
            <EmptyState icon={<Users size={36} />} title="No students found" subtitle="No students in your assigned class." />
          </div>
        ) : (
          <MobileCardList>
            {displayedStudents.map((s) => {
              const pct = attendanceStats[s.id] !== undefined ? attendanceStats[s.id] : 100;
              return (
                <MobileRowCard
                  key={s.id}
                  title={s.name}
                  subtitle={`Adm: ${s.admissionNo}`}
                  badge={<Badge variant="blue" size="sm">{formatClassName(s.class, s.section)}</Badge>}
                  fields={[
                    { label: 'Attendance', value: <Badge variant={pct >= 75 ? 'green' : 'red'} size="sm">{pct}%</Badge> },
                    { label: 'Parent WhatsApp', value: s.whatsappNo, fullWidth: !!s.cluster },
                    ...(s.cluster ? [{ label: 'Area', value: `📍 ${s.cluster}` }] : []),
                  ]}
                  actions={
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setSelectedStudentForResults(s)}>
                        <BarChart3 size={13} /> Results
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => handleViewReportCard(s)}>
                        <Eye size={13} /> Reports
                      </Button>
                      <Button size="sm" variant="success" onClick={() => onMessageParent(s)}>
                        <MessageSquare size={13} /> Message
                      </Button>
                    </>
                  }
                />
              );
            })}
          </MobileCardList>
        )}
      </div>

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
                <div key={exam._id} className="border border-slate-200 rounded-lg p-4 flex flex-col gap-2 cursor-pointer hover:border-blue transition-colors bg-white" onClick={() => window.open(exam.pdfUrl, '_blank')}>
                  <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto"><FileText size={24} /></div>
                  <div className="text-sm font-bold text-slate-900 text-center truncate">{exam.examName}</div>
                  <Badge variant={pctVariant} size="sm" className="mx-auto">Score: {pct}%</Badge>
                  <Button size="sm" className="w-full justify-center mt-1" onClick={(e) => { e.stopPropagation(); window.open(exam.pdfUrl, '_blank'); }}>
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
