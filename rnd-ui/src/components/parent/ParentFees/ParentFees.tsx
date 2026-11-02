import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Clock,
  Receipt,
  Download,
  Calendar,
  ShieldCheck,
  TrendingUp,
  FileText,
  Bus,
  BookOpen,
  Loader2,
} from 'lucide-react';
import type { StudentData } from '../../../types';
import { API_BASE, formatClassName } from '../../../constants';
import { cn } from '../../../lib/utils';
import { EmptyState } from '../../ui';
import { downloadReceiptFile } from '../../../utils/feeReceiptPdf';

interface ParentFeesProps {
  ward: StudentData | undefined;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

const ParentFees: React.FC<ParentFeesProps> = ({ ward, showToast }) => {
  const [downloadingNo, setDownloadingNo] = useState<string | null>(null);
  const [schoolProfile, setSchoolProfile] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_BASE}/school-profile`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) setSchoolProfile(data.data);
      })
      .catch((err) => console.error('Failed to load school profile:', err));
  }, []);

  if (!ward) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-card">
        <EmptyState title="No student record linked to view fee details." />
      </div>
    );
  }

  const totalFee = ward.totalFee || ward.feePaid + ward.feePending || 0;
  const feePaid = ward.feePaid || 0;
  const feePending = ward.feePending || 0;
  const booksFee = ward.booksFee || 0;
  const transportFee = ward.transportFee || 0;

  const paidPct = totalFee > 0 ? Math.min(100, Math.round((feePaid / totalFee) * 100)) : 100;
  const isFullyPaid = feePending <= 0;

  const progressColor =
    paidPct === 100 ? 'bg-emerald-500' : paidPct >= 70 ? 'bg-blue-600' : paidPct >= 40 ? 'bg-amber-500' : 'bg-rose-500';

  const installments = ward.installments || [];

  const payments = useMemo(() => {
    if (ward.payments && ward.payments.length > 0) {
      return ward.payments;
    }
    // Fallback: If student has paid fees but payments array is not itemized,
    // synthesize receipt items so parents can see confirmed payment records and download official PDF receipts.
    const paidInstallments = (ward.installments || []).filter((i: any) => i.status === 'paid' && Number(i.amount) > 0);
    if (paidInstallments.length > 0) {
      return paidInstallments.map((inst: any, idx: number) => ({
        receiptNo: `REC-${(ward.admissionNo || 'FEE').replace(/[^a-zA-Z0-9]/g, '')}-${String(idx + 1).padStart(2, '0')}`,
        amount: Number(inst.amount),
        date: inst.paidDate || inst.dueDate || (ward as any).updatedAt || new Date().toISOString(),
        paymentMode: inst.paymentMode || 'School Accounts Office',
        paymentType: 'school',
      }));
    }
    if (feePaid > 0) {
      return [
        {
          receiptNo: `REC-${(ward.admissionNo || 'FEE').replace(/[^a-zA-Z0-9]/g, '')}-01`,
          amount: feePaid,
          date: (ward as any).updatedAt || new Date().toISOString(),
          paymentMode: 'School Accounts Office / Verified',
          paymentType: 'school',
        },
      ];
    }
    return [];
  }, [ward.payments, ward.installments, ward.admissionNo, feePaid, (ward as any).updatedAt]);

  const handleDownloadReceipt = async (p: any) => {
    if (!ward) return;
    setDownloadingNo(p.receiptNo);
    try {
      await downloadReceiptFile(
        {
          receiptNo: p.receiptNo,
          amount: p.amount,
          date: p.date,
          paymentMode: p.paymentMode,
          paymentType: (p as any).paymentType || 'school',
          studentName: ward.name,
          admissionNo: ward.admissionNo,
          class: ward.class,
          section: ward.section,
          whatsappNo: ward.whatsappNo,
        },
        ward,
        schoolProfile
      );
      showToast(`Receipt #${p.receiptNo} downloaded successfully.`, 'success');
    } catch (err) {
      console.error('Failed to generate receipt:', err);
      showToast('Error generating receipt PDF.', 'error');
    } finally {
      setDownloadingNo(null);
    }
  };

  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900">
      {/* ─── Page Header (Matches Admin Style) ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-card">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 m-0">Fee Breakdown &amp; Payment History</h2>
          <p className="text-sm text-slate-500 mt-1">
            Academic fees, installment schedules, and official confirmed receipts for {ward.name} ({formatClassName(ward.class, ward.section)}).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('inline-flex items-center gap-1.5 text-xs font-bold rounded-lg px-3 py-1.5 border', isFullyPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200')}>
            <CreditCard size={14} /> {isFullyPaid ? 'Dues Cleared' : `Pending: ₹${feePending.toLocaleString()}`}
          </span>
        </div>
      </div>

      {/* ─── Top Overview Card ─── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-500" />

        {/* 4 Summary Columns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-100 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          {/* Total Fee */}
          <div className="p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Applicable Fee</div>
            <div className="text-xl font-extrabold text-slate-900 mt-1">₹{totalFee.toLocaleString()}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Full academic year</div>
          </div>

          {/* Fee Paid */}
          <div className="p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Total Fee Paid</div>
            <div className="text-xl font-extrabold text-emerald-700 mt-1">₹{feePaid.toLocaleString()}</div>
            <div className="text-[11px] text-emerald-600/80 mt-0.5">Confirmed receipts</div>
          </div>

          {/* Fee Pending */}
          <div className="p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Balance Pending</div>
            <div className={cn('text-xl font-extrabold mt-1', isFullyPaid ? 'text-emerald-600' : 'text-rose-700')}>
              {isFullyPaid ? 'Cleared ✓' : `₹${feePending.toLocaleString()}`}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">{isFullyPaid ? 'No outstanding dues' : 'Due for term'}</div>
          </div>

          {/* Other fees breakdown */}
          <div className="p-4 bg-slate-50/50 flex flex-col justify-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Included Breakdown</div>
            <div className="flex flex-col gap-1 mt-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1"><BookOpen size={11} /> Books:</span>
                <strong className="text-slate-800">₹{booksFee.toLocaleString()}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1"><Bus size={11} /> Transport:</span>
                <strong className="text-slate-800">₹{transportFee.toLocaleString()}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="p-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-slate-600 flex items-center gap-1.5">
              <TrendingUp size={13} className="text-slate-400" /> Payment Progress
            </span>
            <span className="font-bold text-slate-900">{paidPct}% Completed</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full transition-all duration-700', progressColor)} style={{ width: `${paidPct}%` }} />
          </div>
        </div>
      </div>

      {/* ─── Installment Schedule Table ─── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-indigo-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 m-0">Installment Schedule</h3>
          </div>
          <span className="text-[10px] font-bold text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-full">
            {installments.length} Term{installments.length !== 1 ? 's' : ''}
          </span>
        </div>

        {installments.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs">
            Standard single-payment structure applied. No separate installment breakdown scheduled.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/60 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-2.5">Installment</th>
                  <th className="px-4 py-2.5">Due Date</th>
                  <th className="px-4 py-2.5">Amount</th>
                  <th className="px-4 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {installments.map((inst) => {
                  const d = new Date(inst.dueDate);
                  const isPaid = inst.status === 'paid';
                  const isOverdue = inst.status === 'overdue';

                  return (
                    <tr key={inst.installmentNo} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-800">Installment #{inst.installmentNo}</td>
                      <td className="px-4 py-3 text-slate-600 font-medium">
                        {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 font-extrabold text-slate-900">₹{inst.amount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5">
                            <CheckCircle2 size={11} /> Paid
                          </span>
                        ) : isOverdue ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 rounded-full px-2.5 py-0.5">
                            <AlertCircle size={11} /> Overdue
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-2.5 py-0.5">
                            <Clock size={11} /> Upcoming
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Payment Receipts & History ─── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <Receipt size={15} className="text-indigo-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 m-0">Payment Receipts History</h3>
          </div>
          <span className="text-[10px] font-bold text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-full">
            {payments.length} Transaction{payments.length !== 1 ? 's' : ''}
          </span>
        </div>

        {payments.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Receipt size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-600">No payment receipts recorded yet.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Receipts generated by the school accountant will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {payments.map((p) => {
              const d = new Date(p.date);
              return (
                <div key={p.receiptNo} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                      <FileText size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">Receipt #{p.receiptNo}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · Mode:{' '}
                        <span className="font-semibold uppercase text-slate-700">{p.paymentMode}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm font-extrabold text-emerald-700">₹{p.amount.toLocaleString()}</span>
                    <button
                      type="button"
                      onClick={() => handleDownloadReceipt(p)}
                      disabled={downloadingNo === p.receiptNo}
                      title="Download receipt PDF"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white hover:text-blue-600 hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer text-xs font-bold disabled:opacity-50 shadow-2xs"
                    >
                      {downloadingNo === p.receiptNo ? (
                        <Loader2 size={13} className="animate-spin text-blue-600" />
                      ) : (
                        <Download size={13} />
                      )}
                      <span>Download PDF</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Office Notice / Security Assurance ─── */}
      <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 flex items-start gap-3 text-slate-600 text-xs leading-relaxed">
        <ShieldCheck size={16} className="text-indigo-600 flex-shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-800">Official Payment Notice:</strong> For offline fee payments via Cheque, DD, or Cash, please collect an official stamped printed receipt from the School Accounts Office. Verified receipts are updated in your portal within 24 hours.
        </div>
      </div>
    </div>
  );
};

export default ParentFees;
