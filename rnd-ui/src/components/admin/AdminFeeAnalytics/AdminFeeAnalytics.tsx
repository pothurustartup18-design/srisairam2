import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, CreditCard, Send,
  IndianRupee, TrendingUp, AlertCircle,
  Users, CheckCircle, FileText, FileSpreadsheet,
  RefreshCw, ArrowUpRight,
  Smartphone, Banknote, Landmark, Wallet, QrCode,
} from 'lucide-react';
import jsPDF from 'jspdf';
import type { StudentData, ClassData } from '../../../types';
import { API_BASE } from '../../../constants';
import { cn } from '../../../lib/utils';
import { getInitials } from '../../../utils/avatar';
import {
  Button, KpiCard, PageHeader, Badge, DataTable, Th, Td, Tr,
  FilterToolbar, FilterGroup, filterControlClass,
  EmptyState, Modal, MobileCardList, MobileRowCard,
} from '../../ui';

interface AdminFeeAnalyticsProps {
  totalStudents: number;
  totalTeachers: number;
  paidFeesTotal: number;
  pendingFeesTotal: number;
  filteredStudents: StudentData[];
  students: StudentData[];
  classesList: ClassData[];
  onSendReminder: (student: StudentData) => void;
  onDeleteStudent: (student: StudentData) => void;
  onMessageParent: (student: StudentData) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onCollectFee?: (studentId?: string) => void;
}

// ─── Modern 12-Month Bar Chart with Y-Axis & Grid ───────────────────────────
const MonthlyCollectionBarChart: React.FC<{
  data: { label: string; value: number; count: number }[];
  totalCollected: number;
}> = ({ data, totalCollected }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const rawMax = Math.max(...data.map((d) => d.value), 0);
  // Round up max for clean Y-axis ticks
  const maxVal = rawMax > 0 ? Math.ceil(rawMax * 1.15) : 100000;
  const currentMonthIdx = new Date().getMonth();

  const formatAxisAmt = (val: number) => {
    if (val === 0) return '₹0';
    if (val >= 100000) return `₹${(val / 100000).toFixed(1).replace('.0', '')}L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
    return `₹${val}`;
  };

  const formatBarTopAmt = (val: number) => {
    if (val >= 100000) return `₹${(val / 100000).toFixed(2)}L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(1)}k`;
    return `₹${val}`;
  };

  const yTicks = [maxVal, maxVal * 0.66, maxVal * 0.33, 0];

  return (
    <div className="flex flex-col h-full justify-between select-none pt-1">
      <div className="relative flex-1 flex">
        {/* Left Y-Axis Labels */}
        <div className="flex flex-col justify-between items-end pr-3 pb-7 text-[10px] font-bold text-slate-400 dark:text-slate-500 w-12 flex-shrink-0 select-none">
          {yTicks.map((tick, i) => (
            <span key={i} className="leading-none">
              {formatAxisAmt(tick)}
            </span>
          ))}
        </div>

        {/* Chart Area with Gridlines & Bars */}
        <div className="relative flex-1 flex flex-col justify-between">
          {/* Background Gridlines */}
          <div className="absolute inset-x-0 top-0 bottom-7 flex flex-col justify-between pointer-events-none">
            <div className="border-b border-slate-100 dark:border-slate-700/60 w-full" />
            <div className="border-b border-slate-100 dark:border-slate-700/60 w-full border-dashed" />
            <div className="border-b border-slate-100 dark:border-slate-700/60 w-full border-dashed" />
            <div className="border-b border-slate-200 dark:border-slate-600 w-full" />
          </div>

          {/* Bars Row */}
          <div className="relative z-10 flex items-end justify-between gap-1 sm:gap-2 h-full pb-7 pt-5 px-1">
            {data.map((item, idx) => {
              const isCurrent = idx === currentMonthIdx;
              const isHovered = hoveredIdx === idx;
              const heightPct = item.value > 0 ? Math.min(100, Math.max(8, Math.round((item.value / maxVal) * 100))) : 0;
              const pctOfTotal = totalCollected > 0 ? ((item.value / totalCollected) * 100).toFixed(1) : '0';

              return (
                <div
                  key={item.label}
                  className="flex-1 flex flex-col items-center justify-end h-full relative group cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  {/* Floating Rich Tooltip */}
                  {isHovered && (
                    <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-sm text-white text-[10.5px] font-bold px-3 py-1.5 rounded-lg shadow-xl z-30 whitespace-nowrap flex flex-col items-center pointer-events-none border border-slate-700 animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center gap-1.5 text-blue-300 font-extrabold text-[11px]">
                        <span>{item.label} Collections</span>
                        {isCurrent && <span className="text-[9px] bg-blue-500/30 text-blue-200 px-1.5 py-0.2 rounded">This Month</span>}
                      </div>
                      <div className="text-sm font-extrabold text-white mt-0.5">
                        ₹{item.value.toLocaleString('en-IN')}
                      </div>
                      <div className="flex items-center gap-2 text-[9px] font-normal text-slate-300 mt-0.5">
                        <span>{item.count} payment{item.count !== 1 ? 's' : ''}</span>
                        <span>·</span>
                        <span>{pctOfTotal}% of total</span>
                      </div>
                      <div className="w-2 h-2 bg-slate-900/95 rotate-45 -mb-1 mt-1 border-r border-b border-slate-700" />
                    </div>
                  )}

                  {/* Value on Top of Active Bars */}
                  {item.value > 0 && (
                    <span className="text-[9px] font-bold text-blue-700 dark:text-blue-400 mb-1 opacity-90 truncate max-w-full">
                      {formatBarTopAmt(item.value)}
                    </span>
                  )}

                  {/* Bar Visual Slot */}
                  <div className="w-full max-w-[32px] h-full flex items-end justify-center rounded-t-md bg-slate-50/50 dark:bg-slate-800/30">
                    {item.value > 0 ? (
                      <div
                        className={cn(
                          'w-full rounded-t-md transition-all duration-300 shadow-sm',
                          isHovered
                            ? 'bg-gradient-to-t from-blue-700 to-indigo-500 shadow-md scale-y-[1.02]'
                            : isCurrent
                            ? 'bg-gradient-to-t from-blue-600 to-blue-500'
                            : 'bg-gradient-to-t from-blue-500 to-indigo-400 hover:from-blue-600 hover:to-indigo-500'
                        )}
                        style={{ height: `${heightPct}%` }}
                      />
                    ) : (
                      <div className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-full mb-0" />
                    )}
                  </div>

                  {/* Month Label on X-Axis */}
                  <div className="absolute -bottom-6 flex flex-col items-center">
                    <span
                      className={cn(
                        'text-[10.5px] sm:text-[11px] font-bold transition-colors',
                        isCurrent
                          ? 'text-blue-600 font-extrabold'
                          : isHovered
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-500 dark:text-slate-400'
                      )}
                    >
                      {item.label}
                    </span>
                    {isCurrent && <span className="w-1 h-1 rounded-full bg-blue-600 mt-0.5" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
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

  const normClass = (c: any) => String(c || '').replace(/^class\s+/i, '').trim().toLowerCase();
  const normSec = (s: any) => String(s || '').trim().toLowerCase();

  const filteredList = useMemo(() => {
    return students.filter(s => {
      // 1. Class filter matching (handles '10' vs 'Class 10')
      if (selectedClass !== 'All Classes' && normClass(s.class) !== normClass(selectedClass)) return false;

      // 2. Section filter matching
      if (selectedSection !== 'All Sections' && normSec(s.section) !== normSec(selectedSection)) return false;

      // 3. Status filter matching
      const paid = s.feePaid || 0;
      const pending = s.feePending || 0;

      if (paymentStatus === 'Paid' && (pending > 0 || paid <= 0)) return false;
      if (paymentStatus === 'Unpaid' && paid > 0) return false;
      if (paymentStatus === 'Partially Paid' && (paid <= 0 || pending <= 0)) return false;

      return true;
    });
  }, [students, selectedClass, selectedSection, paymentStatus]);

  const totalPaid    = useMemo(() => filteredList.reduce((a, s) => a + (s.feePaid || 0), 0), [filteredList]);
  const totalPending = useMemo(() => filteredList.reduce((a, s) => a + (s.feePending || 0), 0), [filteredList]);
  const totalTarget  = totalPaid + totalPending || 1;
  const realizationPct = Math.round((totalPaid / totalTarget) * 1000) / 10;
  const paidCount      = useMemo(() => filteredList.filter(s => (s.feePending || 0) <= 0 && (s.feePaid || 0) > 0).length, [filteredList]);
  const defaultersCount = filteredList.length - paidCount;

  const monthlyTrendData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const map: Record<string, { amount: number; count: number }> = {};
    months.forEach((m) => {
      map[m] = { amount: 0, count: 0 };
    });

    filteredList.forEach((s) => {
      if (s.payments && Array.isArray(s.payments)) {
        s.payments.forEach((p: any) => {
          const rawDate = p.date || p.createdAt;
          if (!rawDate) return;
          const d = new Date(rawDate);
          if (isNaN(d.getTime())) return;
          const monthKey = months[d.getMonth()];
          const parsedAmt = Number(p.amount) || 0;
          map[monthKey].amount += parsedAmt;
          map[monthKey].count += 1;
        });
      }
    });

    return months.map((m) => ({
      label: m,
      value: map[m].amount,
      count: map[m].count,
    }));
  }, [filteredList]);

  const collections = useMemo(() => {
    const now = new Date();
    const localTodayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const localMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let todayAmt = 0, monthAmt = 0;
    filteredList.forEach(s => {
      s.payments?.forEach(p => {
        if (!p.date) return;
        const d = new Date(p.date);
        if (isNaN(d.getTime())) return;
        const pDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const pMonthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

        if (pDateStr === localTodayStr) todayAmt += (p.amount || 0);
        if (pMonthStr === localMonthStr) monthAmt += (p.amount || 0);
      });
    });
    return { today: todayAmt, month: monthAmt };
  }, [filteredList]);

  const classBreakdown = useMemo(() => {
    const map: Record<string, { count: number; paid: number; pending: number; rawClass: string }> = {};
    filteredList.forEach(s => {
      const cleanCls = String(s.class || '').replace(/^class\s+/i, '').trim();
      const key = `Class ${cleanCls}`;
      if (!map[key]) map[key] = { count: 0, paid: 0, pending: 0, rawClass: cleanCls };
      map[key].count++;
      map[key].paid += s.feePaid || 0;
      map[key].pending += s.feePending || 0;
    });
    return Object.entries(map).map(([cls, d]) => {
      const tot = d.paid + d.pending || 1;
      const pct = Math.round((d.paid / tot) * 100);
      const status =
        d.pending <= 0 || pct === 100
          ? { label: 'Fully Paid', variant: 'green' as const }
          : pct >= 75
          ? { label: 'On Track', variant: 'green' as const }
          : pct >= 50
          ? { label: 'In Progress', variant: 'blue' as const }
          : pct > 0
          ? { label: 'Needs Follow-up', variant: 'amber' as const }
          : { label: 'Pending', variant: 'red' as const };

      return {
        cls,
        rawClass: d.rawClass,
        students: d.count,
        collected: d.paid,
        pending: d.pending,
        pct,
        status,
      };
    }).sort((a, b) => b.pct - a.pct);
  }, [filteredList]);

  const defaultersList = useMemo(() =>
    filteredList.filter(s => (s.feePending || 0) > 0).sort((a, b) => (b.feePending || 0) - (a.feePending || 0)),
  [filteredList]);

  const modeShares = useMemo(() => {
    const map: Record<string, { amount: number; count: number }> = {};
    filteredList.forEach((s) => {
      s.payments?.forEach((p: any) => {
        const rawMode = (p.paymentMode || 'UPI').trim();
        const mode = rawMode.toUpperCase();
        if (!map[mode]) map[mode] = { amount: 0, count: 0 };
        map[mode].amount += Number(p.amount) || 0;
        map[mode].count += 1;
      });
    });
    const grandTotal = Object.values(map).reduce((a, v) => a + v.amount, 0) || 1;
    return Object.entries(map)
      .map(([mode, d]) => ({
        mode,
        amt: d.amount,
        count: d.count,
        pct: Math.round((d.amount / grandTotal) * 100),
      }))
      .sort((a, b) => b.amt - a.amt);
  }, [filteredList]);

  const resetFilters = () => {
    setSelectedClass('All Classes');
    setSelectedSection('All Sections');
    setPaymentStatus('All Statuses');
    showToast('Filters cleared', 'success');
  };



  const [schoolProfile, setSchoolProfile] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_BASE}/school-profile`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setSchoolProfile(data.data);
        }
      })
      .catch(err => console.error('Failed to load school profile for PDF:', err));
  }, []);

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 297mm

    const sName = schoolProfile?.schoolInfo?.schoolName || 'SchoolHub Academy';
    const sAddr = [
      schoolProfile?.address?.addressLine,
      schoolProfile?.address?.city,
      schoolProfile?.address?.state,
      schoolProfile?.address?.pincode
    ].filter(Boolean).join(', ') || '123 Education Campus Road, Hyderabad, Telangana';
    const sPhone = schoolProfile?.contactInfo?.phone || '+91 9392646349';
    const sEmail = schoolProfile?.contactInfo?.email || 'admin@schoolhub.edu';
    const sYear  = schoolProfile?.academicConfig?.currentAcademicYear || '2026-27';
    const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    let y = 0;

    // Helper to render Page Header Banner
    const drawPageHeader = (pageNo: number) => {
      // Top Navy Header Bar
      doc.setFillColor(15, 23, 42); // slate-900 #0f172a
      doc.rect(0, 0, pageWidth, 32, 'F');

      // Gold Accent line under header
      doc.setFillColor(217, 119, 6); // amber-600 #d97706
      doc.rect(0, 32, pageWidth, 1.5, 'F');

      // School Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(255, 255, 255);
      doc.text(sName.toUpperCase(), 14, 13);

      // Contact / Address
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225); // slate-300
      doc.text(sAddr.length > 70 ? sAddr.substring(0, 68) + '…' : sAddr, 14, 19);
      doc.text(`Phone: ${sPhone}   |   Email: ${sEmail}`, 14, 24);

      // Right Side Box: Academic Year & Date
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text(`ACADEMIC YEAR: ${sYear}`, pageWidth - 14, 13, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      doc.text(`REPORT DATE: ${dateStr}`, pageWidth - 14, 19, { align: 'right' });
      doc.text(`CONFIDENTIAL REPORT`, pageWidth - 14, 24, { align: 'right' });
    };

    // Helper to draw Footer
    const drawPageFooter = (pageNo: number, totalPages: number) => {
      doc.setPage(pageNo);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.4);
      doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`${sName} — Official Financial & Fee Collection Analytics Report`, 14, pageHeight - 7);
      doc.text(`Page ${pageNo} of ${totalPages}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
    };

    // Draw Page 1 Header
    drawPageHeader(1);

    // Document Title Strip
    y = 38;
    doc.setFillColor(239, 246, 255); // blue-50
    doc.setDrawColor(191, 219, 254);
    doc.roundedRect(14, y, pageWidth - 28, 10, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 58, 138);
    doc.text('FINANCIAL FEE ANALYTICS & COLLECTION STATEMENT', 18, y + 6.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Filters: Class (${selectedClass}) · Section (${selectedSection}) · Status (${paymentStatus})`, pageWidth - 18, y + 6.5, { align: 'right' });

    y += 14;

    // ── 4 KPI CARDS ─────────────────────────────────────────────────────────
    const cardGap = 4;
    const cardW = (pageWidth - 28 - (cardGap * 3)) / 4;
    const cardH = 22;

    // Card 1: Total Target
    doc.setFillColor(245, 243, 255); doc.setDrawColor(221, 214, 254);
    doc.roundedRect(14, y, cardW, cardH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(109, 40, 217);
    doc.text('TOTAL FEE TARGET', 17, y + 5.5);
    doc.setFontSize(11); doc.text(`Rs. ${(totalTarget / 100000).toFixed(2)}L`, 17, y + 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
    doc.text(`${filteredList.length} Students Total`, 17, y + 18);

    // Card 2: Collected
    const x2 = 14 + cardW + cardGap;
    doc.setFillColor(239, 246, 255); doc.setDrawColor(191, 219, 254);
    doc.roundedRect(x2, y, cardW, cardH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(30, 64, 175);
    doc.text('TOTAL COLLECTED', x2 + 3, y + 5.5);
    doc.setFontSize(11); doc.text(`Rs. ${(totalPaid / 100000).toFixed(2)}L`, x2 + 3, y + 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
    doc.text(`Today: Rs. ${collections.today.toLocaleString()}`, x2 + 3, y + 18);

    // Card 3: Outstanding
    const x3 = x2 + cardW + cardGap;
    doc.setFillColor(254, 242, 242); doc.setDrawColor(254, 202, 202);
    doc.roundedRect(x3, y, cardW, cardH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(185, 28, 28);
    doc.text('OUTSTANDING DUES', x3 + 3, y + 5.5);
    doc.setFontSize(11); doc.text(`Rs. ${(totalPending / 100000).toFixed(2)}L`, x3 + 3, y + 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
    doc.text(`${defaultersList.length} Pending Accounts`, x3 + 3, y + 18);

    // Card 4: Realization %
    const x4 = x3 + cardW + cardGap;
    doc.setFillColor(240, 253, 244); doc.setDrawColor(187, 247, 208);
    doc.roundedRect(x4, y, cardW, cardH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(21, 128, 61);
    doc.text('REALIZATION RATE', x4 + 3, y + 5.5);
    doc.setFontSize(11); doc.text(`${realizationPct}%`, x4 + 3, y + 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
    doc.text(`${paidCount} Fully Paid`, x4 + 3, y + 18);

    y += cardH + 10;

    // ── SECTION 1: CLASS-WISE SUMMARY TABLE ──────────────────────────────────
    doc.setFillColor(15, 23, 42); doc.rect(14, y, 2.5, 5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
    doc.text('1. Class-wise Collection Summary', 19, y + 4);
    y += 7;

    // Table Header
    doc.setFillColor(30, 41, 59); doc.rect(14, y, 182, 7.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
    doc.text('CLASS NAME', 18, y + 5);
    doc.text('STUDENTS', 50, y + 5);
    doc.text('COLLECTED (RS.)', 90, y + 5);
    doc.text('PENDING (RS.)', 135, y + 5);
    doc.text('REALIZATION', 192, y + 5, { align: 'right' });

    y += 7.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);

    classBreakdown.forEach((r, idx) => {
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, y, 182, 6.5, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(14, y + 6.5, 196, y + 6.5);

      doc.text(r.cls, 18, y + 4.5);
      doc.text(`${r.students}`, 50, y + 4.5);
      doc.text(`Rs. ${r.collected.toLocaleString()}`, 90, y + 4.5);
      doc.text(`Rs. ${r.pending.toLocaleString()}`, 135, y + 4.5);

      if (r.pct >= 70) doc.setTextColor(22, 163, 74);
      else if (r.pct >= 50) doc.setTextColor(217, 119, 6);
      else doc.setTextColor(220, 38, 38);
      doc.text(`${r.pct}%`, 192, y + 4.5, { align: 'right' });
      doc.setTextColor(30, 41, 59);

      y += 6.5;
    });

    // Total Row for Class Summary
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y, 182, 7, 'F');
    doc.setDrawColor(148, 163, 184);
    doc.line(14, y, 196, y);
    doc.line(14, y + 7, 196, y + 7);

    doc.setFont('helvetica', 'bold');
    doc.text('OVERALL TOTAL', 18, y + 5);
    doc.text(`${filteredList.length}`, 50, y + 5);
    doc.text(`Rs. ${totalPaid.toLocaleString()}`, 90, y + 5);
    doc.text(`Rs. ${totalPending.toLocaleString()}`, 135, y + 5);
    doc.text(`${realizationPct}%`, 192, y + 5, { align: 'right' });

    y += 12;

    // ── SECTION 2: PAYMENT MODE BREAKDOWN TABLE ─────────────────────────────
    doc.setFillColor(15, 23, 42); doc.rect(14, y, 2.5, 5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
    doc.text('2. Collection by Payment Channel / Mode', 19, y + 4);
    y += 7;

    doc.setFillColor(30, 41, 59); doc.rect(14, y, 182, 7.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
    doc.text('PAYMENT METHOD', 18, y + 5);
    doc.text('TOTAL AMOUNT COLLECTED', 100, y + 5);
    doc.text('SHARE PERCENTAGE', 192, y + 5, { align: 'right' });

    y += 7.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);

    modeShares.forEach((m, idx) => {
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, y, 182, 6.5, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(14, y + 6.5, 196, y + 6.5);

      doc.text(m.mode.toUpperCase(), 18, y + 4.5);
      doc.text(`Rs. ${m.amt.toLocaleString()}`, 100, y + 4.5);
      doc.text(`${m.pct}%`, 192, y + 4.5, { align: 'right' });

      y += 6.5;
    });

    y += 10;

    // ── SECTION 3: STUDENT FEE STATEMENT REGISTER ───────────────────────────
    if (y > pageHeight - 60) {
      doc.addPage();
      drawPageHeader(doc.internal.getNumberOfPages());
      y = 38;
    }

    doc.setFillColor(15, 23, 42); doc.rect(14, y, 2.5, 5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
    doc.text(`3. Detailed Student Fee Ledger (${filteredList.length} Students)`, 19, y + 4);
    y += 7;

    // Table Header
    doc.setFillColor(30, 41, 59); doc.rect(14, y, 182, 7.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
    doc.text('ADM NO', 18, y + 5);
    doc.text('STUDENT NAME', 45, y + 5);
    doc.text('CLASS', 105, y + 5);
    doc.text('TOTAL FEE', 125, y + 5);
    doc.text('PAID (RS.)', 150, y + 5);
    doc.text('PENDING (RS.)', 192, y + 5, { align: 'right' });

    y += 7.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);

    filteredList.forEach((s, idx) => {
      if (y > pageHeight - 28) {
        doc.addPage();
        drawPageHeader(doc.internal.getNumberOfPages());
        y = 38;

        // Re-draw table header on new page
        doc.setFillColor(30, 41, 59); doc.rect(14, y, 182, 7.5, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
        doc.text('ADM NO', 18, y + 5);
        doc.text('STUDENT NAME', 45, y + 5);
        doc.text('CLASS', 105, y + 5);
        doc.text('TOTAL FEE', 125, y + 5);
        doc.text('PAID (RS.)', 150, y + 5);
        doc.text('PENDING (RS.)', 192, y + 5, { align: 'right' });
        y += 7.5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, y, 182, 6.5, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(14, y + 6.5, 196, y + 6.5);

      const totFee = (s.feePaid || 0) + (s.feePending || 0);

      doc.text(s.admissionNo, 18, y + 4.5);
      doc.text(s.name.length > 28 ? s.name.substring(0, 26) + '…' : s.name, 45, y + 4.5);
      doc.text(`${s.class}-${s.section}`, 105, y + 4.5);
      doc.text(`Rs. ${totFee.toLocaleString()}`, 125, y + 4.5);
      doc.text(`Rs. ${(s.feePaid || 0).toLocaleString()}`, 150, y + 4.5);

      if (s.feePending > 0) {
        doc.setFont('helvetica', 'bold'); doc.setTextColor(220, 38, 38);
        doc.text(`Rs. ${s.feePending.toLocaleString()}`, 192, y + 4.5, { align: 'right' });
        doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
      } else {
        doc.setTextColor(22, 163, 74);
        doc.text('PAID', 192, y + 4.5, { align: 'right' });
        doc.setTextColor(30, 41, 59);
      }

      y += 6.5;
    });

    // ── SIGNATURES BLOCK ────────────────────────────────────────────────────
    if (y > pageHeight - 35) {
      doc.addPage();
      drawPageHeader(doc.internal.getNumberOfPages());
      y = 38;
    }

    y += 12;
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.4);

    // Signature 1
    doc.line(14, y + 15, 60, y + 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text('Prepared By (Accounts)', 14, y + 19);

    // Signature 2
    doc.line(85, y + 15, 130, y + 15);
    doc.text('Verified By (Admin)', 85, y + 19);

    // Signature 3
    doc.line(150, y + 15, 196, y + 15);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
    doc.text('Principal Signature & Stamp', 150, y + 19);

    // Apply Footers across all generated pages
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      drawPageFooter(p, totalPages);
    }

    doc.save(`${sName.replace(/\s+/g, '_')}_Fee_Analytics_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
    showToast('Executive PDF Report generated & downloaded successfully.', 'success');
  };
  const exportCSV = () => {
    let csv = 'Admission No,Student Name,Class,Section,Fee Paid (INR),Fee Pending (INR),Status\n';
    filteredList.forEach(s => {
      const status = (s.feePending || 0) <= 0 ? 'Paid' : (s.feePaid || 0) > 0 ? 'Partially Paid' : 'Unpaid';
      csv += `"${s.admissionNo}","${s.name}","Class ${s.class}","${s.section}",${s.feePaid || 0},${s.feePending || 0},"${status}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Fee_Analytics_Filtered_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    showToast('Filtered Fee Analytics CSV downloaded successfully', 'success');
  };

  const uniqueClasses = useMemo(() => {
    const list = [...new Set(students.map(s => String(s.class || '').replace(/^class\s+/i, '').trim()))].filter(Boolean);
    return list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [students]);

  const uniqueSections = useMemo(() => {
    const list = [...new Set(students.map(s => String(s.section || '').trim().toUpperCase()))].filter(Boolean);
    return list.sort();
  }, [students]);

  const formatCurrency = (amt: number) => {
    if (amt >= 100000) {
      return `₹${(amt / 100000).toFixed(2)}L`;
    }
    return `₹${amt.toLocaleString('en-IN')}`;
  };

  const modeColors = ['#2563eb', '#16a34a', '#d97706', '#7c3aed'];
  const inputCls = 'w-full h-[38px] px-3 border-[1.5px] border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none focus:border-blue transition-colors font-[inherit]';

  const pctBarColor = (pct: number) => pct >= 75 ? '#16a34a' : pct >= 50 ? '#2563eb' : pct >= 25 ? '#d97706' : '#dc2626';

  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900 dark:text-white">

      {/* ── PAGE HEADER ─────────────────────────────────────────────────────── */}
      <PageHeader
        title="Fee Analytics"
        subtitle={`${filteredList.length} students · ${realizationPct}% collected · ${formatCurrency(totalPaid)} total`}
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
        <div className="flex items-end pb-0.5 ml-auto">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap">{filteredList.length} of {students.length} students</span>
        </div>
      </FilterToolbar>

      {/* ── KPI STRIP ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Fees Collected"
          value={formatCurrency(totalPaid)}
          subtext={`Today: ₹${collections.today.toLocaleString()}`}
          icon={<IndianRupee size={17} />}
          iconBg="bg-blue-lt"
          iconColor="text-blue"
        />
        <KpiCard
          label="Pending Fees"
          value={formatCurrency(totalPending)}
          subtext={`Pending from ${defaultersList.length} students`}
          icon={<AlertCircle size={17} />}
          iconBg="bg-red-lt"
          iconColor="text-red"
          valueColor="text-red"
        />
        <KpiCard
          label="Collection Rate"
          value={`${realizationPct}%`}
          subtext={`Total target: ${formatCurrency(totalTarget)}`}
          icon={<TrendingUp size={17} />}
          iconBg="bg-green-lt"
          iconColor="text-green"
        />
        <KpiCard
          label="Fully Paid Students"
          value={paidCount}
          subtext={`${paidCount} of ${filteredList.length} students`}
          icon={<CheckCircle size={17} />}
          iconBg="bg-green-lt"
          iconColor="text-green"
          valueColor="text-green"
        />
      </div>

      {/* ── MAIN TWO-COL ────────────────────────────────────────────────────── */}
      {/* ── CHARTS & BREAKDOWN SECTION ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
        {/* Monthly Fee Collection Trend */}
        <Card>
          <CardHeader>
            <div>
              <div className="text-md font-bold text-slate-900 dark:text-white">Monthly Fee Collections</div>
              <div className="text-xs text-slate-400 dark:text-slate-500">Real-time payment collections across calendar months</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="blue" size="sm">12 Months (Jan–Dec)</Badge>
            </div>
          </CardHeader>
          <div className="px-5 pt-3 pb-4 h-[240px]">
            <MonthlyCollectionBarChart data={monthlyTrendData} totalCollected={totalPaid} />
          </div>
        </Card>

        {/* Refined Payment Mode Breakdown */}
        <Card className="flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                <Wallet size={15} />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">Payment Methods</div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                  {modeShares.reduce((a, b) => a + (b.count || 0), 0)} total payments recorded
                </div>
              </div>
            </div>
            <Badge variant="blue" size="sm">
              {modeShares.length} Method{modeShares.length !== 1 ? 's' : ''}
            </Badge>
          </CardHeader>

          <div className="p-4 flex-1 flex flex-col justify-between gap-3">
            {modeShares.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500 flex flex-col items-center justify-center gap-2">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-300 dark:text-slate-600">
                  <Wallet size={20} />
                </div>
                <span className="font-medium">No payment records yet.</span>
              </div>
            ) : (
              <>
                {/* Payment method rows */}
                <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[175px] pr-1">
                  {modeShares.map((item) => {
                    const m = item.mode.toUpperCase();
                    const isUpi = m.includes('UPI');
                    const isCash = m.includes('CASH');
                    const isCard = m.includes('CARD') || m.includes('POS');
                    const isBank = m.includes('BANK') || m.includes('TRANSFER') || m.includes('NEFT') || m.includes('IMPS') || m.includes('RTGS');

                    const icon = isUpi ? (
                      <Smartphone size={14} />
                    ) : isCash ? (
                      <Banknote size={14} />
                    ) : isCard ? (
                      <CreditCard size={14} />
                    ) : isBank ? (
                      <Landmark size={14} />
                    ) : (
                      <Wallet size={14} />
                    );

                    const iconCls = isUpi
                      ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
                      : isCash
                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                      : isCard
                      ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                      : isBank
                      ? 'bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';

                    const barColor = isUpi
                      ? 'bg-blue-600 dark:bg-blue-500'
                      : isCash
                      ? 'bg-emerald-500 dark:bg-emerald-400'
                      : isCard
                      ? 'bg-amber-500 dark:bg-amber-400'
                      : isBank
                      ? 'bg-purple-600 dark:bg-purple-400'
                      : 'bg-slate-500 dark:bg-slate-400';

                    const label = isUpi
                      ? 'UPI / Online'
                      : isCash
                      ? 'Cash'
                      : isCard
                      ? 'Card (POS)'
                      : isBank
                      ? 'Bank Transfer'
                      : item.mode;

                    return (
                      <div
                        key={item.mode}
                        className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={cn('w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0', iconCls)}>
                              {icon}
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate leading-tight">
                                {label}
                              </span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 block leading-tight">
                                {item.count} payment{item.count !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                              ₹{item.amt.toLocaleString('en-IN')}
                            </span>
                            <span className="text-[10.5px] font-bold text-slate-600 dark:text-slate-300 bg-slate-200/70 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                              {item.pct}%
                            </span>
                          </div>
                        </div>

                        {/* Single clean progress bar */}
                        <div className="h-1.5 w-full bg-slate-200/70 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all duration-500', barColor)}
                            style={{ width: `${Math.max(item.pct, 2)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom Primary Channel Footer */}
                {modeShares.length > 0 && (
                  <div className="text-[11px] bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-lg px-3 py-2 flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">
                      Primary Channel: <strong className="text-blue-600 dark:text-blue-400">{modeShares[0]?.mode} ({modeShares[0]?.pct}%)</strong>
                    </span>
                    <span className="font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                      ₹{modeShares[0]?.amt.toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
      </div>

      {/* ── CLASS-WISE BREAKDOWN — desktop/tablet ──────────────────────────── */}
      <div className="hidden md:block">
        <DataTable
          card
          header={
            <div>
              <div className="text-md font-bold text-slate-900 dark:text-white">Class-wise Collection Breakdown</div>
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
                  <Badge variant={row.status.variant} size="sm">{row.status.label}</Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      </div>

      {/* ── CLASS-WISE BREAKDOWN — mobile ──────────────────────────────────── */}
      <div className="md:hidden flex flex-col gap-3">
        <div>
          <div className="text-md font-bold text-slate-900 dark:text-white">Class-wise Collection Breakdown</div>
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
                badge={<Badge variant={row.status.variant} size="sm">{row.status.label}</Badge>}
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
  );
}

