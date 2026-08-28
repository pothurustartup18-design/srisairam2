import React, { useState, useMemo } from 'react';
import {
  Search, CreditCard, Send,
  IndianRupee, TrendingUp, AlertCircle,
  Users, CheckCircle, FileText, FileSpreadsheet,
  RefreshCw, } from 'lucide-react';
import jsPDF from 'jspdf';
import type { StudentData, ClassData } from '../../../types';
import { cn } from '../../../lib/utils';
import { getInitials } from '../../../utils/avatar';
import {
  Button, KpiCard, PageHeader, Badge, DataTable, Th, Td, Tr,
  FilterToolbar, FilterGroup, filterControlClass,
  EmptyState, MobileCardList, MobileRowCard,
} from '../../ui';

interface AdminFeeAnalyticsProps {
  totalStudents: number;
  totalTeachers: number;
  paidFeesTotal: number;
  pendingFeesTotal: number;
  filteredStudents: StudentData[];
  students: StudentData[];
  classesList: ClassData[];
  onSendReminder: (student: StudentData, feeCategory?: 'school' | 'books') => void;
  onDeleteStudent: (student: StudentData) => void;
  onMessageParent: (student: StudentData) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onCollectFee?: (studentId?: string) => void;
}

// ─── SVG Monthly Trend Line — unchanged ──────────────────────────────────────
const MonthlyTrendLine: React.FC<{ data: { label: string; value: number }[] }> = ({ data }) => {
  if (!data.length) return (
    <EmptyState title="No payment data available yet." className="py-8" />
  );

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const W = 480, H = 130, PX = 32, PY = 16;
  const cw = W - PX * 2, ch = H - PY * 2;

  const pts = data.map((d, i) => {
    const x = PX + (data.length > 1 ? (i / (data.length - 1)) : 0.5) * cw;
    const y = H - PY - (d.value / maxVal) * ch;
    return { x, y, ...d };
  });

  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
  const area = pts.length > 0
    ? `${pts.map(p => `${p.x},${p.y}`).join(' ')} ${pts[pts.length - 1].x},${H - PY} ${pts[0].x},${H - PY}`
    : '';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#2563eb" stopOpacity=".15" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0"   />
        </linearGradient>
      </defs>
      {[0, .33, .66, 1].map((p, i) => (
        <line key={i} x1={PX} y1={PY + p * ch} x2={W - PX} y2={PY + p * ch}
          stroke="#e2e8f0" strokeDasharray="3,3" strokeWidth="1" />
      ))}
      {area && <polygon points={area} fill="url(#trendGrad)" />}
      {pts.length > 1 && (
        <polyline fill="none" stroke="#2563eb" strokeWidth="2.5"
          points={polyline} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="#fff" stroke="#2563eb" strokeWidth="2" />
          <title>{`${p.label}: ₹${p.value.toLocaleString()}`}</title>
          <text x={p.x} y={H - 2} textAnchor="middle" fontSize="9.5" fill="#64748b" fontWeight="600">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
};

// ─── Shared card component ─────────────────────────────────────────────────
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white border border-slate-200 rounded-lg shadow-card overflow-hidden', className)}>
      {children}
    </div>
  );
}
function CardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
      {children}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AdminFeeAnalytics({
  students,
  onSendReminder,
  showToast,
  onCollectFee,
}: AdminFeeAnalyticsProps) {
  const [selectedClass, setSelectedClass]     = useState('All Classes');
  const [selectedSection, setSelectedSection] = useState('All Sections');
  const [paymentStatus, setPaymentStatus]     = useState('All Statuses');
  const [searchQuery, setSearchQuery]         = useState('');
  const [selectedStudentForReminder, setSelectedStudentForReminder] = useState<StudentData | null>(null);

  const selectedStudent = selectedStudentForReminder;
  const hasSchoolDues = selectedStudent ? selectedStudent.feePending > 0 : false;
  const hasBooksDues = selectedStudent ? (selectedStudent.booksFee !== undefined && selectedStudent.booksFee > 0) : false;

  const filteredList = useMemo(() => {
    return students.filter(s => {
      if (selectedClass !== 'All Classes' && s.class !== selectedClass) return false;
      if (selectedSection !== 'All Sections' && s.section !== selectedSection) return false;
      if (paymentStatus === 'Paid' && s.feePending > 0) return false;
      if (paymentStatus === 'Unpaid' && s.feePaid > 0) return false;
      if (paymentStatus === 'Partially Paid' && (s.feePaid === 0 || s.feePending === 0)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return s.name.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q) ||
          `${s.class}-${s.section}`.toLowerCase().includes(q);
      }
      return true;
    });
  }, [students, selectedClass, selectedSection, paymentStatus, searchQuery]);

  const totalPaid    = useMemo(() => filteredList.reduce((a, s) => a + (s.feePaid || 0), 0), [filteredList]);
  const totalPending = useMemo(() => filteredList.reduce((a, s) => a + (s.feePending || 0), 0), [filteredList]);
  const totalTarget  = totalPaid + totalPending || 1;
  const realizationPct = Math.round((totalPaid / totalTarget) * 1000) / 10;
  const paidCount      = useMemo(() => filteredList.filter(s => s.feePending === 0).length, [filteredList]);

  const monthlyTrendData = useMemo(() => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const map: Record<string, number> = {};
    students.forEach(s => { s.payments?.forEach(p => { const k = months[new Date(p.date).getMonth()]; map[k] = (map[k] || 0) + p.amount; }); });
    const active = months.filter(m => map[m]);
    if (!active.length) return months.slice(0, 6).map(m => ({ label: m, value: 0 }));
    return active.map(m => ({ label: m, value: map[m] }));
  }, [students]);

  const collections = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    let todayAmt = 0, monthAmt = 0;
    students.forEach(s => { s.payments?.forEach(p => { const t = new Date(p.date).getTime(); if (t >= today) todayAmt += p.amount; if (t >= monthStart) monthAmt += p.amount; }); });
    return { today: todayAmt, month: monthAmt };
  }, [students]);

  const classBreakdown = useMemo(() => {
    const map: Record<string, { count: number; paid: number; pending: number }> = {};
    filteredList.forEach(s => {
      const key = `Class ${s.class}`;
      if (!map[key]) map[key] = { count: 0, paid: 0, pending: 0 };
      map[key].count++; map[key].paid += s.feePaid || 0; map[key].pending += s.feePending || 0;
    });
    return Object.entries(map).map(([cls, d]) => {
      const tot = d.paid + d.pending || 1;
      const pct = Math.round((d.paid / tot) * 100);
      return { cls, students: d.count, collected: d.paid, pending: d.pending, pct, status: pct >= 70 ? 'Good' : 'Review' };
    }).sort((a, b) => b.pct - a.pct);
  }, [filteredList]);

  const defaultersList = useMemo(() =>
    filteredList.filter(s => s.feePending > 0).sort((a, b) => b.feePending - a.feePending),
  [filteredList]);

  const modeShares = useMemo(() => {
    const map: Record<string, number> = {};
    students.forEach(s => { s.payments?.forEach(p => { const mode = p.paymentMode || 'UPI'; map[mode] = (map[mode] || 0) + p.amount; }); });
    const grandTotal = Object.values(map).reduce((a, v) => a + v, 0) || 1;
    return Object.entries(map).map(([mode, amt]) => ({ mode, amt, pct: Math.round((amt / grandTotal) * 100) })).sort((a, b) => b.amt - a.amt);
  }, [students]);

  const resetFilters = () => { setSelectedClass('All Classes'); setSelectedSection('All Sections'); setPaymentStatus('All Statuses'); setSearchQuery(''); showToast('Filters cleared', 'success'); };



  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text('Fee Analytics Report', 14, 20);
    doc.setFontSize(10); doc.text(`Collection: ₹${totalPaid.toLocaleString()} | Pending: ₹${totalPending.toLocaleString()} | Realization: ${realizationPct}%`, 14, 28);
    let y = 40;
    classBreakdown.forEach(r => { doc.text(`${r.cls}: ${r.students} students | ₹${r.collected.toLocaleString()} collected | ${r.pct}%`, 14, y); y += 7; });
    doc.save('FeeAnalytics_Report.pdf'); showToast('PDF report downloaded', 'success');
  };
  const exportCSV = () => {
    let csv = 'Admission No,Name,Class,Section,Pending Dues\n';
    defaultersList.forEach(s => { csv += `"${s.admissionNo}","${s.name}","${s.class}","${s.section}",${s.feePending}\n`; });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'Defaulters_Report.csv'; a.click(); showToast('Defaulters CSV downloaded', 'success');
  };

  const uniqueClasses  = [...new Set(students.map(s => s.class))].sort();
  const uniqueSections = [...new Set(students.map(s => s.section))].sort();
  const modeColors = ['#2563eb', '#16a34a', '#d97706', '#7c3aed'];

  const pctBarColor = (pct: number) => pct >= 70 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';

  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900 dark:text-white">

      {/* ── PAGE HEADER ─────────────────────────────────────────────────────── */}
      <PageHeader
        title="Fee Analytics"
        subtitle={`${filteredList.length} students · ${realizationPct}% realized · ₹${(totalPaid / 100000).toFixed(1)}L collected`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={resetFilters}><RefreshCw size={13} /> Reset</Button>
            <Button variant="secondary" size="sm" onClick={exportCSV}><FileSpreadsheet size={13} /> Export CSV</Button>
            <Button variant="secondary" size="sm" onClick={exportPDF}><FileText size={13} /> PDF Report</Button>
            <Button size="sm" onClick={() => onCollectFee?.()}>
              <CreditCard size={13} /> Collect Fee
            </Button>
          </>
        }
      />

      {/* ── FILTER BAR ──────────────────────────────────────────────────────── */}
      <FilterToolbar>
        <FilterGroup label="Class">
          <select className={cn(filterControlClass, 'min-w-[120px]')} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
            <option>All Classes</option>
            {uniqueClasses.map(c => <option key={c} value={c}>Class {c}</option>)}
          </select>
        </FilterGroup>
        <FilterGroup label="Section">
          <select className={cn(filterControlClass, 'min-w-[120px]')} value={selectedSection} onChange={e => setSelectedSection(e.target.value)}>
            <option>All Sections</option>
            {uniqueSections.map(s => <option key={s} value={s}>Section {s}</option>)}
          </select>
        </FilterGroup>
        <FilterGroup label="Status">
          <select className={cn(filterControlClass, 'min-w-[150px]')} value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
            <option>All Statuses</option>
            <option value="Paid">Fully Paid</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Unpaid">Unpaid</option>
          </select>
        </FilterGroup>
        <FilterGroup label="Search" className="flex-1 min-w-[220px]">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-slate-400 dark:text-slate-500 pointer-events-none" />
            <input type="text" className={cn(filterControlClass, 'pl-8')} placeholder="Name or admission number…"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
        </FilterGroup>
        <div className="flex items-end pb-0.5">
          <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 font-semibold whitespace-nowrap">{filteredList.length} of {students.length} students</span>
        </div>
      </FilterToolbar>

      {/* ── KPI STRIP ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard label="Fees Collected" value={`₹${(totalPaid / 100000).toFixed(1)}L`}
          subtext={`Today: ₹${collections.today.toLocaleString()}`}
          icon={<IndianRupee size={17} />} iconBg="bg-blue-lt" iconColor="text-blue" />
        <KpiCard label="Outstanding Dues" value={`₹${(totalPending / 100000).toFixed(2)}L`}
          subtext={`Across ${defaultersList.length} accounts`}
          icon={<AlertCircle size={17} />} iconBg="bg-red-lt" iconColor="text-red" valueColor="text-red" />
        <KpiCard label="Realization Rate" value={`${realizationPct}%`}
          subtext={`Total: ₹${(totalTarget / 100000).toFixed(1)}L`}
          icon={<TrendingUp size={17} />} iconBg="bg-green-lt" iconColor="text-green" />
        <KpiCard label="Students — Fully Paid" value={paidCount}
          subtext={`${filteredList.length > 0 ? Math.round((paidCount / filteredList.length) * 100) : 0}% of filtered`}
          icon={<CheckCircle size={17} />} iconBg="bg-green-lt" iconColor="text-green" valueColor="text-green" />
        <KpiCard label="Avg Fee / Student"
          value={`₹${filteredList.length > 0 ? Math.round(totalTarget / filteredList.length).toLocaleString() : '0'}`}
          subtext="Per capita · all included"
          icon={<Users size={17} />} iconBg="bg-purple-lt" iconColor="text-purple" />
      </div>

      {/* ── MAIN TWO-COL ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

        {/* LEFT col */}
        <div className="flex flex-col gap-4">

          {/* Monthly trend */}
          <Card>
            <CardHeader>
              <div>
                <div className="text-md font-bold text-slate-900 dark:text-white">Monthly Fee Collection Trend</div>
                <div className="text-xs text-slate-400 dark:text-slate-500">Payment receipts per month</div>
              </div>
              <Badge variant="blue" size="sm">{monthlyTrendData.length} months</Badge>
            </CardHeader>
            <div className="px-5 py-4 h-[130px]">
              <MonthlyTrendLine data={monthlyTrendData} />
            </div>
          </Card>

          {/* Progress + Aging */}
          <Card>
            <CardHeader>
              <div>
                <div className="text-md font-bold text-slate-900 dark:text-white">Collection Progress & Aging</div>
                <div className="text-xs text-slate-400 dark:text-slate-500">Overall realization · overdue buckets</div>
              </div>
              <Button variant="secondary" size="sm"
                onClick={() => { defaultersList.slice(0, 10).forEach(s => onSendReminder(s)); showToast('Reminders sent to top 10 defaulters', 'success'); }}>
                <Send size={12} /> Bulk Remind
              </Button>
            </CardHeader>
            <div className="px-5 py-4 flex flex-col gap-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-600 dark:text-slate-400 dark:text-slate-500 font-medium">Collection Progress</span>
                  <span className="text-blue font-bold">{realizationPct}% realized</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue rounded-full transition-all" style={{ width: `${realizationPct}%` }} />
                </div>
              </div>
              {/* Aging */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: '1–7 Days', count: 0, variant: 'blue' as const },
                  { label: '8–30 Days', count: 0, variant: 'amber' as const },
                  { label: '30+ Days', count: defaultersList.length, variant: 'red' as const },
                ].map(b => (
                  <div key={b.label} className={cn(
                    'rounded-md p-3 border text-center',
                    b.variant === 'blue'  ? 'bg-blue-lt border-blue-200' :
                    b.variant === 'amber' ? 'bg-amber-lt border-amber-200' : 'bg-red-lt border-red-200'
                  )}>
                    <div className="text-2xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1">{b.label} Overdue</div>
                    <div className={cn(
                      'text-lg font-extrabold',
                      b.variant === 'blue' ? 'text-blue' : b.variant === 'amber' ? 'text-amber' : 'text-red'
                    )}>{b.count} <span className="text-xs font-semibold">Students</span></div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Class breakdown — desktop/tablet */}
          <div className="hidden md:block">
            <DataTable
              card
              header={
                <div>
                  <div className="text-md font-bold text-slate-900 dark:text-white">Class-wise Realization Breakdown</div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">{classBreakdown.length} classes</div>
                </div>
              }
            >
              <thead>
                <tr>
                  <Th>Class</Th>
                  <Th className="text-center">Students</Th>
                  <Th>Collected</Th>
                  <Th>Pending</Th>
                  <Th>Collection %</Th>
                  <Th className="text-center">Status</Th>
                </tr>
              </thead>
              <tbody>
                {classBreakdown.length === 0 ? (
                  <tr><Td colSpan={6}><EmptyState title="No class data available." /></Td></tr>
                ) : classBreakdown.map(row => (
                  <Tr key={row.cls}>
                    <Td><span className="font-bold text-slate-900 dark:text-white">{row.cls}</span></Td>
                    <Td className="text-center">{row.students}</Td>
                    <Td><span className="font-bold text-green">₹{row.collected.toLocaleString()}</span></Td>
                    <Td><span className="font-bold text-red">₹{row.pending.toLocaleString()}</span></Td>
                    <Td>
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${row.pct}%`, background: pctBarColor(row.pct) }} />
                        </div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 w-8 text-right">{row.pct}%</span>
                      </div>
                    </Td>
                    <Td className="text-center">
                      <Badge variant={row.status === 'Good' ? 'green' : 'amber'} size="sm">{row.status}</Badge>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          </div>

          {/* Class breakdown — mobile */}
          <div className="md:hidden flex flex-col gap-3">
            <div>
              <div className="text-md font-bold text-slate-900 dark:text-white">Class-wise Realization Breakdown</div>
              <div className="text-xs text-slate-400 dark:text-slate-500">{classBreakdown.length} classes</div>
            </div>
            {classBreakdown.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700"><EmptyState title="No class data available." /></div>
            ) : (
              <MobileCardList>
                {classBreakdown.map(row => (
                  <MobileRowCard
                    key={row.cls}
                    title={`Class ${row.cls}`}
                    subtitle={`${row.students} students`}
                    badge={<Badge variant={row.status === 'Good' ? 'green' : 'amber'} size="sm">{row.status}</Badge>}
                    fields={[
                      { label: 'Collected', value: <span className="font-bold text-green">₹{row.collected.toLocaleString()}</span> },
                      { label: 'Pending', value: <span className="font-bold text-red">₹{row.pending.toLocaleString()}</span> },
                      { label: 'Collection %', value: `${row.pct}%`, fullWidth: true },
                    ]}
                  />
                ))}
              </MobileCardList>
            )}
          </div>
        </div>

        {/* RIGHT col */}
        <div className="flex flex-col gap-4">

          {/* Action alert */}
          {defaultersList.length > 0 && (
            <Card>
              <CardHeader>
                <div className="text-sm font-bold text-slate-900 dark:text-white">Action Required</div>
              </CardHeader>
              <div className="px-5 py-3">
                <div className="flex items-start gap-2.5 p-3 bg-red-lt border border-red-200 rounded-md text-red-700 text-sm mb-4">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <div><strong>{defaultersList.length} students</strong> have outstanding dues. Oldest accounts are 30+ days overdue.</div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-2">
                  {[
                    { label: 'Est. Month-End', value: `₹${(collections.month + totalPending * 0.15).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}` },
                    { label: 'Expected Recovery', value: '15%' },
                  ].map(m => (
                    <div key={m.label} className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-md p-3">
                      <div className="text-2xs font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">{m.label}</div>
                      <div className="text-lg font-bold text-slate-900 dark:text-white">{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Payment mode breakdown */}
          <Card>
            <CardHeader>
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">Collection by Payment Mode</div>
                <div className="text-xs text-slate-400 dark:text-slate-500">Share of total receipts</div>
              </div>
            </CardHeader>
            <div className="px-5 py-4 flex flex-col gap-3">
              {(modeShares.length === 0
                ? [{ mode: 'UPI', pct: 0, amt: 0 }, { mode: 'Cash', pct: 0, amt: 0 }, { mode: 'Card', pct: 0, amt: 0 }]
                : modeShares
              ).map((item, i) => (
                <div key={item.mode} className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{item.mode}</span>
                    <span className="font-bold" style={{ color: modeColors[i % modeColors.length] }}>
                      {item.amt > 0 ? `₹${item.amt.toLocaleString()} — ` : ''}{item.pct}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${item.pct}%`, background: modeColors[i % modeColors.length] }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick actions */}
          <Card>
            <CardHeader>
              <div className="text-sm font-bold text-slate-900 dark:text-white">Quick Actions</div>
            </CardHeader>
            <div className="px-5 py-4 flex flex-col gap-2">
              <Button className="w-full justify-center" onClick={() => onCollectFee?.()}>
                <CreditCard size={14} /> Collect Fee Payment
              </Button>
              <Button variant="secondary" className="w-full justify-center"
                onClick={() => { defaultersList.slice(0, 5).forEach(s => onSendReminder(s)); showToast('Reminders sent to top 5 defaulters', 'success'); }}>
                <Send size={14} /> Send Reminders (Top 5)
              </Button>
              <Button variant="secondary" className="w-full justify-center" onClick={exportCSV}>
                <FileSpreadsheet size={14} /> Export Defaulters CSV
              </Button>
              <Button variant="secondary" className="w-full justify-center" onClick={exportPDF}>
                <FileText size={14} /> Download PDF Report
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* ── OUTSTANDING DUES TABLE — desktop/tablet ─────────────────────────── */}
      <div className="hidden md:block">
        <DataTable
          card
          header={
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-md font-bold text-slate-900 dark:text-white">Top Outstanding Dues Accounts</div>
                <div className="text-xs text-slate-400 dark:text-slate-500">{defaultersList.length} accounts with pending balance</div>
              </div>
              <Badge variant="red">{defaultersList.length} overdue</Badge>
            </div>
          }
        >
          <thead>
            <tr>
              <Th>Student</Th>
              <Th>Class & Section</Th>
              <Th>Admission No</Th>
              <Th>Pending Dues</Th>
              <Th>Aging</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {defaultersList.length === 0 ? (
              <tr><Td colSpan={6}><EmptyState title="🎉 All fee accounts are fully cleared!" /></Td></tr>
            ) : defaultersList.slice(0, 20).map(student => (
              <Tr key={student.id}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-lt text-blue flex items-center justify-center text-xs font-extrabold flex-shrink-0">
                      {getInitials(student.name)}
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white text-sm">{student.name}</span>
                  </div>
                </Td>
                <Td>Class {student.class}-{student.section}</Td>
                <Td><span className="text-xs text-slate-500 dark:text-slate-400">{student.admissionNo}</span></Td>
                <Td><span className="font-bold text-red">₹{student.feePending.toLocaleString()}</span></Td>
                <Td><Badge variant="red" size="sm">30+ days</Badge></Td>
                <Td>
                  <div className="flex items-center gap-2 justify-end">
                    <Button size="sm" onClick={() => onCollectFee?.(student.id || student._id)}><CreditCard size={12} /> Collect</Button>
                    <Button variant="secondary" size="icon-sm" title="Send reminder" onClick={() => setSelectedStudentForReminder(student)}><Send size={12} /></Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      </div>

      {/* ── OUTSTANDING DUES — mobile cards ─────────────────────────────────── */}
      <div className="md:hidden flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-md font-bold text-slate-900 dark:text-white">Top Outstanding Dues Accounts</div>
            <div className="text-xs text-slate-400 dark:text-slate-500">{defaultersList.length} accounts with pending balance</div>
          </div>
          <Badge variant="red">{defaultersList.length} overdue</Badge>
        </div>
        {defaultersList.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg shadow-card dark:bg-slate-800 dark:border-slate-700"><EmptyState title="🎉 All fee accounts are fully cleared!" /></div>
        ) : (
          <MobileCardList>
            {defaultersList.slice(0, 20).map(student => (
              <MobileRowCard
                key={student.id}
                title={student.name}
                subtitle={`Adm: ${student.admissionNo}`}
                badge={<Badge variant="red" size="sm">30+ days</Badge>}
                fields={[
                  { label: 'Class & Section', value: `Class ${student.class}-${student.section}` },
                  { label: 'Pending Dues', value: <span className="font-bold text-red">₹{student.feePending.toLocaleString()}</span> },
                ]}
                actions={
                  <>
                    <Button size="sm" onClick={() => onCollectFee?.(student.id || student._id)}><CreditCard size={13} /> Collect</Button>
                    <Button size="sm" variant="secondary" onClick={() => setSelectedStudentForReminder(student)}><Send size={13} /> Reminder</Button>
                  </>
                }
              />
            ))}
          </MobileCardList>
        )}
      </div>

      {/* Fee Reminder Choice Modal */}
      {selectedStudentForReminder && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedStudentForReminder(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <h4 className="text-base font-extrabold text-slate-900 dark:text-white mb-1">WhatsApp Fee Reminder</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Choose reminder type for <strong>{selectedStudent.name}</strong>'s parent.</p>
            <div className="flex flex-col gap-2">
              <button
                disabled={!hasSchoolDues}
                onClick={() => { onSendReminder(selectedStudent, 'school'); setSelectedStudentForReminder(null); }}
                className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                  hasSchoolDues ? 'border-violet-300 bg-violet-50 hover:bg-violet-100 cursor-pointer' : 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="text-[13px] font-bold text-slate-800 dark:text-slate-100">School Fee Reminder</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{hasSchoolDues ? `Pending: ₹${selectedStudent.feePending.toLocaleString()}` : 'No school fees pending'}</div>
              </button>
              <button
                disabled={!hasBooksDues}
                onClick={() => { onSendReminder(selectedStudent, 'books'); setSelectedStudentForReminder(null); }}
                className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                  hasBooksDues ? 'border-sky-300 bg-sky-50 hover:bg-sky-100 cursor-pointer' : 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="text-[13px] font-bold text-slate-800 dark:text-slate-100">Books Fee Reminder</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{hasBooksDues ? `Pending: ₹${(selectedStudent.booksFee || 0).toLocaleString()}` : 'No books fees pending'}</div>
              </button>
            </div>
            <button type="button" onClick={() => setSelectedStudentForReminder(null)} className="mt-3 w-full py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 transition-colors font-semibold">Cancel</button>
          </div>
        </div>
      )}

    </div>
  );
}

