import React, { useState, useEffect } from 'react';
import './AdminCollectFee.css';
import type { StudentData } from '../../../types';
import {
  ArrowLeft, Search, CheckCircle2, CreditCard, Download,
  ExternalLink, X, Filter, ChevronRight
} from 'lucide-react';
import { Form } from '../../ui/Form';
import { ActionButton } from '../../ui/ActionButton';
import { API_BASE } from '../../../constants';
import { getAccessToken } from '../../../services/api';

interface AdminCollectFeeProps {
  students: StudentData[];
  onBack: () => void;
  onRecordPayment: (
    studentId: string,
    amount: number,
    feeType: 'school' | 'books' | 'transport'
  ) => Promise<any>;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onGoToFeeAnalytics: () => void;
  generateReceiptPDF?: (receipt: any, student: any) => Promise<string>;
  initialStudentId?: string;
}

type Step = 'search' | 'payment' | 'success';

const COLORS = ['#dbeafe', '#fce7f3', '#d1fae5', '#fef3c7', '#ede9fe', '#fee2e2'];
const TEXT_COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#dc2626'];

export const AdminCollectFee: React.FC<AdminCollectFeeProps> = ({
  students,
  onBack,
  onRecordPayment,
  showToast,
  onGoToFeeAnalytics,
  generateReceiptPDF,
  initialStudentId,
}) => {
  // ── Search / Filter State
  const [searchName, setSearchName] = useState('');
  const [searchClass, setSearchClass] = useState('all');
  const [onlyPending, setOnlyPending] = useState(false);

  // ── Step State
  const [step, setStep] = useState<Step>('search');
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);
  const [paymentType, setPaymentType] = useState<'school' | 'books' | 'transport'>('school');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<any | null>(null);
  const [whatsappStatus, setWhatsappStatus] = useState<'sent' | 'failed' | null>(null);

  useEffect(() => {
    if (initialStudentId) {
      const found = students.find(s => s.id === initialStudentId || (s as any)._id === initialStudentId);
      if (found) {
        setSelectedStudent(found);
        const tuition = found.feePending || 0;
        const books = found.booksFee || 0;
        setPaymentType(tuition > 0 ? 'school' : books > 0 ? 'books' : 'transport');
        setPaymentAmount('');
        setStep('payment');
      }
    }
  }, [initialStudentId, students]);

  // ── Derived filtered list
  const query = searchName.trim().toLowerCase();
  const filteredStudents = students.filter(s => {
    if (query) {
      const matchName = (s.name || '').toLowerCase().includes(query);
      const matchAdm = (s.admissionNo || '').toLowerCase().includes(query);
      if (!matchName && !matchAdm) return false;
    }
    if (searchClass !== 'all' && String(s.class) !== searchClass) return false;
    if (onlyPending) {
      const total = (s.feePending || 0) + (s.booksFee || 0) + (s.transportFee || 0);
      if (total <= 0) return false;
    }
    return true;
  });

  const uniqueClasses = Array.from(new Set(students.map(s => String(s.class)))).sort((a, b) => {
    const na = parseInt(a, 10), nb = parseInt(b, 10);
    return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b);
  });

  // ── Helpers
  const selectStudent = (student: StudentData) => {
    setSelectedStudent(student);
    const tuition = student.feePending || 0;
    const books = student.booksFee || 0;
    const transport = student.transportFee || 0;
    setPaymentType(tuition > 0 ? 'school' : books > 0 ? 'books' : 'transport');
    setPaymentAmount('');
    setStep('payment');
  };

  const handleBack = () => {
    if (step === 'payment') {
      setStep('search');
      setSelectedStudent(null);
      setPaymentAmount('');
    } else if (step === 'success') {
      setStep('search');
      setSelectedStudent(null);
      setPaymentAmount('');
      setReceipt(null);
    } else {
      onBack();
    }
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !paymentAmount || Number(paymentAmount) <= 0) return;
    setSubmitting(true);
    try {
      const result = await onRecordPayment(
        selectedStudent.id || (selectedStudent as any)._id || '',
        Number(paymentAmount),
        paymentType
      );
      if (result) {
        setReceipt(result);
        setStep('success');
        setWhatsappStatus(null);

        // Payment is already recorded server-side at this point — generating
        // the PDF and dispatching the WhatsApp receipt is best-effort on top
        // of that, so its failure must not block the success screen. It uses
        // the approved fee_receipt template (see rnd-service dashboard.routes
        // POST /upload-receipt-pdf), never a free-form message.
        if (generateReceiptPDF) {
          try {
            const pdfBase64 = await generateReceiptPDF(result, selectedStudent);
            const token = getAccessToken();
            const headers: HeadersInit = {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            };
            const res = await fetch(`${API_BASE}/dashboard/upload-receipt-pdf`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                receiptNo: result.receiptNo,
                pdfBase64,
                recipient: result.recipient || selectedStudent.whatsappNo,
                amount: result.amount,
                feeType: result.feeType,
              }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
              setWhatsappStatus('sent');
            } else {
              setWhatsappStatus('failed');
              showToast(data.message || 'Payment recorded, but the WhatsApp receipt could not be sent.', 'error');
            }
          } catch {
            setWhatsappStatus('failed');
            showToast('Payment recorded, but the WhatsApp receipt could not be sent.', 'error');
          }
        }
      }
    } catch {
      showToast('Failed to record payment. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const maxAmount =
    paymentType === 'school'
      ? selectedStudent?.feePending || 0
      : paymentType === 'books'
      ? selectedStudent?.booksFee || 0
      : selectedStudent?.transportFee || 0;

  const feeLabel = (type: 'school' | 'books' | 'transport') =>
    type === 'school' ? 'Tuition Fee' : type === 'books' ? 'Books Fee' : 'Transport Fee';

  const handleDownloadPDF = async () => {
    if (!generateReceiptPDF || !receipt || !selectedStudent) return;
    try {
      const pdf = await generateReceiptPDF(receipt, selectedStudent);
      const link = document.createElement('a');
      link.href = pdf;
      link.download = `Receipt-${receipt.receiptNo || 'fee'}.pdf`;
      link.click();
    } catch {
      showToast('Could not generate PDF.', 'error');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="cf-page">

      {/* ── Page Header ────────────────────────────────────────────────── */}
      <div className="cf-header">
        <button
          type="button"
          className="cf-back-btn"
          onClick={handleBack}
          aria-label="Go back"
        >
          <ArrowLeft size={16} />
          <span>{step === 'search' ? 'Back' : 'Change Student'}</span>
        </button>

        <div className="cf-header-title">
          <div className="cf-header-icon" aria-hidden="true">💳</div>
          <div className="cf-header-text">
            <h1 className="cf-h1">Collect Fee</h1>
            <p className="cf-subtext">
              {step === 'search' && 'Search student & record payment.'}
              {step === 'payment' && `Record fee for ${selectedStudent?.name || 'student'}.`}
              {step === 'success' && 'Transaction completed successfully.'}
            </p>
          </div>
        </div>

        {/* Desktop Stepper */}
        <div className="cf-step-indicator cf-desktop-stepper" aria-label="Fee collection progress">
          {(['search', 'payment', 'success'] as Step[]).map((s, i) => {
            const labels = ['Find Student', 'Enter Payment', 'Receipt'];
            const stepIdx = step === 'search' ? 0 : step === 'payment' ? 1 : 2;
            const done = stepIdx > i;
            const active = stepIdx === i;
            return (
              <React.Fragment key={s}>
                <div className="cf-step-item">
                  <div className={`cf-step-circle ${done ? 'done' : active ? 'active' : ''}`}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span className={`cf-step-label ${done ? 'done' : active ? 'active' : ''}`}>
                    {labels[i]}
                  </span>
                </div>
                {i < 2 && (
                  <div className={`cf-step-line ${done ? 'done' : ''}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Mobile Stepper Bar */}
      <div className="cf-mobile-stepper" aria-label="Steps">
        {[
          { key: 'search', num: 1, label: '1. Student' },
          { key: 'payment', num: 2, label: '2. Payment' },
          { key: 'success', num: 3, label: '3. Receipt' },
        ].map((item, idx) => {
          const stepIdx = step === 'search' ? 0 : step === 'payment' ? 1 : 2;
          const done = stepIdx > idx;
          const active = stepIdx === idx;
          return (
            <div
              key={item.key}
              className={`cf-mstep-item ${active ? 'active' : done ? 'done' : ''}`}
            >
              <div className="cf-mstep-circle">
                {done ? '✓' : item.num}
              </div>
              <span className="cf-mstep-text">{item.label}</span>
            </div>
          );
        })}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="cf-body">

        {/* ════════════════════════════════════════════════
            STEP 1 — SEARCH / STUDENT LIST
        ════════════════════════════════════════════════ */}
        {step === 'search' && (
          <div className="cf-search-page">
            {/* Filter Bar */}
            <div className="cf-filter-bar">
              <div className="cf-search-wrap">
                <Search className="cf-search-icon" size={16} />
                <input
                  className="cf-search-input"
                  type="text"
                  placeholder="Search by student name or admission no…"
                  value={searchName}
                  onChange={e => setSearchName(e.target.value)}
                  autoFocus
                />
                {searchName && (
                  <button
                    type="button"
                    className="cf-search-clear"
                    onClick={() => setSearchName('')}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="cf-filter-row">
                <select
                  className="cf-class-select"
                  value={searchClass}
                  onChange={e => setSearchClass(e.target.value)}
                  aria-label="Filter by class"
                >
                  <option value="all">All Classes</option>
                  {uniqueClasses.map(cls => (
                    <option key={cls} value={cls}>Class {cls}</option>
                  ))}
                </select>

                <button
                  type="button"
                  className={`cf-filter-pill ${onlyPending ? 'active' : ''}`}
                  onClick={() => setOnlyPending(p => !p)}
                  title="Filter students with pending fee dues"
                >
                  <Filter size={12} />
                  <span>{onlyPending ? 'Pending Dues' : 'All Dues'}</span>
                </button>

                <div className="cf-count-badge">
                  {filteredStudents.length} {filteredStudents.length === 1 ? 'student' : 'students'}
                </div>
              </div>
            </div>

            {/* Desktop Table View (hidden on mobile) */}
            <div className="cf-table-wrap cf-desktop-table">
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Class</th>
                    <th>Admission No.</th>
                    <th>Tuition Due</th>
                    <th>Books Due</th>
                    <th>Transport Due</th>
                    <th>Total Pending</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="cf-empty">
                        <div className="cf-empty-icon">🔍</div>
                        <div>No students found. Try a different name, admission no, or class.</div>
                      </td>
                    </tr>
                  ) : filteredStudents.map((student, idx) => {
                    const tuition = student.feePending || 0;
                    const books = student.booksFee || 0;
                    const transport = student.transportFee || 0;
                    const total = tuition + books + transport;
                    const initials = student.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
                    const ci = idx % 6;
                    return (
                      <tr key={student.id || (student as any)._id || idx} className="cf-row">
                        <td>
                          <div className="cf-student-cell">
                            <div
                              className="cf-avatar"
                              style={{ backgroundColor: COLORS[ci], color: TEXT_COLORS[ci] }}
                            >
                              {initials}
                            </div>
                            <span className="cf-student-name">{student.name}</span>
                          </div>
                        </td>
                        <td><span className="cf-class-badge">Class {student.class}-{student.section}</span></td>
                        <td className="cf-subtle">{student.admissionNo || '—'}</td>
                        <td>
                          <span className={`cf-amount ${tuition > 0 ? 'due' : 'paid'}`}>
                            {tuition > 0 ? `₹${tuition.toLocaleString()}` : '✓ Cleared'}
                          </span>
                        </td>
                        <td>
                          <span className={`cf-amount ${books > 0 ? 'books' : 'paid'}`}>
                            {books > 0 ? `₹${books.toLocaleString()}` : '✓ Cleared'}
                          </span>
                        </td>
                        <td>
                          <span className={`cf-amount ${transport > 0 ? 'transport' : 'paid'}`}>
                            {transport > 0 ? `₹${transport.toLocaleString()}` : '✓ Cleared'}
                          </span>
                        </td>
                        <td>
                          <span className={`cf-total ${total > 0 ? 'pending' : 'clear'}`}>
                            {total > 0 ? `₹${total.toLocaleString()}` : 'All Paid'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`cf-collect-btn ${total <= 0 ? 'disabled' : ''}`}
                            disabled={total <= 0}
                            onClick={() => selectStudent(student)}
                          >
                            <CreditCard size={13} />
                            Collect
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View (visible only on mobile) */}
            <div className="cf-mobile-card-list">
              {filteredStudents.length === 0 ? (
                <div className="cf-mobile-empty">
                  <div className="cf-empty-icon">🔍</div>
                  <div className="cf-empty-title">No students found</div>
                  <div className="cf-empty-desc">Try a different name, admission number, or class.</div>
                </div>
              ) : (
                filteredStudents.map((student, idx) => {
                  const tuition = student.feePending || 0;
                  const books = student.booksFee || 0;
                  const transport = student.transportFee || 0;
                  const total = tuition + books + transport;
                  const initials = student.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
                  const ci = idx % 6;
                  const hasDue = total > 0;

                  return (
                    <div
                      key={student.id || (student as any)._id || idx}
                      className={`cf-mcard ${hasDue ? 'has-due' : 'cleared'}`}
                      onClick={() => {
                        if (hasDue) selectStudent(student);
                      }}
                    >
                      {/* Header row */}
                      <div className="cf-mcard-header">
                        <div className="cf-mcard-user">
                          <div
                            className="cf-avatar"
                            style={{ backgroundColor: COLORS[ci], color: TEXT_COLORS[ci] }}
                          >
                            {initials}
                          </div>
                          <div className="cf-mcard-name-wrap">
                            <span className="cf-mcard-name">{student.name}</span>
                            <span className="cf-mcard-meta">
                              Adm: <strong>{student.admissionNo || '—'}</strong>
                            </span>
                          </div>
                        </div>
                        <span className="cf-class-badge">
                          Class {student.class}-{student.section}
                        </span>
                      </div>

                      {/* Dues Breakdown Grid */}
                      <div className="cf-mcard-dues">
                        <div className="cf-mcard-due-col">
                          <span className="cf-mcard-due-lbl">Tuition</span>
                          <span className={`cf-amount ${tuition > 0 ? 'due' : 'paid'}`}>
                            {tuition > 0 ? `₹${tuition.toLocaleString()}` : '✓ Paid'}
                          </span>
                        </div>
                        <div className="cf-mcard-due-col">
                          <span className="cf-mcard-due-lbl">Books</span>
                          <span className={`cf-amount ${books > 0 ? 'books' : 'paid'}`}>
                            {books > 0 ? `₹${books.toLocaleString()}` : '✓ Paid'}
                          </span>
                        </div>
                        <div className="cf-mcard-due-col">
                          <span className="cf-mcard-due-lbl">Transport</span>
                          <span className={`cf-amount ${transport > 0 ? 'transport' : 'paid'}`}>
                            {transport > 0 ? `₹${transport.toLocaleString()}` : '✓ Paid'}
                          </span>
                        </div>
                      </div>

                      {/* Footer Row */}
                      <div className="cf-mcard-footer">
                        <div className="cf-mcard-total-box">
                          <span className="cf-mcard-total-label">Total Outstanding</span>
                          <span className={`cf-total ${hasDue ? 'pending' : 'clear'}`}>
                            {hasDue ? `₹${total.toLocaleString()}` : 'All Paid ✓'}
                          </span>
                        </div>

                        {hasDue ? (
                          <button
                            type="button"
                            className="cf-mcard-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectStudent(student);
                            }}
                          >
                            <CreditCard size={14} />
                            <span>Collect Fee</span>
                            <ChevronRight size={14} />
                          </button>
                        ) : (
                          <span className="cf-mcard-paid-tag">
                            ✓ Cleared
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            STEP 2 — PAYMENT FORM
        ════════════════════════════════════════════════ */}
        {step === 'payment' && selectedStudent && (() => {
          const s = selectedStudent;
          const tuition = s.feePending || 0;
          const books = s.booksFee || 0;
          const transport = s.transportFee || 0;
          const total = tuition + books + transport;

          const categories = [
            { key: 'school' as const, label: 'Tuition Fee', icon: '🎓', pending: tuition, color: '#ef4444', bg: '#fef2f2', border: '#fca5a5' },
            { key: 'books' as const, label: 'Books Fee', icon: '📚', pending: books, color: '#0284c7', bg: '#f0f9ff', border: '#7dd3fc' },
            { key: 'transport' as const, label: 'Transport Fee', icon: '🚌', pending: transport, color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
          ];

          return (
            <div className="cf-payment-page">
              {/* Left — Student Summary */}
              <div className="cf-payment-left">
                <div className="cf-student-card">
                  <div className="cf-student-card-avatar">
                    {s.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className="cf-student-card-info">
                    <div className="cf-student-card-name">{s.name}</div>
                    <div className="cf-student-card-meta">Adm: <strong>{s.admissionNo}</strong> · Class <strong>{s.class}-{s.section}</strong></div>
                    <div className="cf-student-card-meta">Parent: {s.parentName || '—'} {s.whatsappNo ? `(${s.whatsappNo})` : ''}</div>
                  </div>
                </div>

                <div className="cf-dues-summary">
                  <div className="cf-dues-title">Outstanding Dues</div>
                  {categories.map(cat => (
                    <div key={cat.key} className="cf-dues-row">
                      <span className="cf-dues-icon">{cat.icon}</span>
                      <span className="cf-dues-label">{cat.label}</span>
                      <span
                        className="cf-dues-val"
                        style={{ color: cat.pending > 0 ? cat.color : '#10b981' }}
                      >
                        {cat.pending > 0 ? `₹${cat.pending.toLocaleString()}` : '✓ Cleared'}
                      </span>
                    </div>
                  ))}
                  <div className="cf-dues-total-row">
                    <span className="cf-dues-total-label">Total Outstanding</span>
                    <span className="cf-dues-total-val">₹{total.toLocaleString()}</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="cf-back-link"
                  onClick={() => { setStep('search'); setSelectedStudent(null); }}
                >
                  ← Back to student list
                </button>
              </div>

              {/* Right — Payment Form */}
              <div className="cf-payment-right">
                <div className="cf-form-card">
                  <div className="cf-form-title">
                    <CreditCard size={18} />
                    <span>Record Payment</span>
                  </div>
                  <p className="cf-form-subtitle">
                    Select fee category and enter the payment amount collected.
                  </p>

                  <Form onSubmit={handleSubmitPayment} className="cf-form">
                    {/* Category Picker */}
                    <div className="cf-field">
                      <label className="cf-label">Fee Category</label>
                      <div className="cf-category-grid">
                        {categories.map(cat => (
                          <label
                            key={cat.key}
                            className={`cf-category-card ${paymentType === cat.key ? 'selected' : ''} ${cat.pending <= 0 ? 'cleared' : ''}`}
                            style={paymentType === cat.key ? { borderColor: cat.color, backgroundColor: cat.bg } : {}}
                          >
                            <input
                              type="radio"
                              name="feeCategory"
                              value={cat.key}
                              checked={paymentType === cat.key}
                              disabled={cat.pending <= 0}
                              onChange={() => { setPaymentType(cat.key); setPaymentAmount(''); }}
                              style={{ display: 'none' }}
                            />
                            <div className="cf-cat-icon">{cat.icon}</div>
                            <div className="cf-cat-label">{cat.label}</div>
                            <div
                              className="cf-cat-amount"
                              style={{ color: cat.pending > 0 ? cat.color : '#10b981' }}
                            >
                              {cat.pending > 0 ? `₹${cat.pending.toLocaleString()} due` : '✓ Cleared'}
                            </div>
                            {paymentType === cat.key && cat.pending > 0 && (
                              <div className="cf-cat-selected-dot" style={{ backgroundColor: cat.color }} />
                            )}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="cf-field">
                      <label className="cf-label">Amount to Collect (₹)</label>
                      <div className="cf-amount-wrap">
                        <span className="cf-rupee">₹</span>
                        <input
                          type="number"
                          className="cf-amount-input"
                          min={1}
                          max={maxAmount}
                          required
                          placeholder={`Max ₹${maxAmount.toLocaleString()}`}
                          value={paymentAmount}
                          onChange={e => setPaymentAmount(e.target.value)}
                          autoFocus
                        />
                        {paymentAmount && Number(paymentAmount) === maxAmount && (
                          <span className="cf-full-badge">Full</span>
                        )}
                      </div>
                      <div className="cf-amount-hint">
                        <span>Max Due: ₹{maxAmount.toLocaleString()}</span>
                        <button
                          type="button"
                          className="cf-full-link"
                          onClick={() => setPaymentAmount(String(maxAmount))}
                        >
                          Pay full amount →
                        </button>
                      </div>
                    </div>

                    {/* Mode of Payment */}
                    <div className="cf-field">
                      <label className="cf-label">Payment Mode</label>
                      <select
                        className="cf-select"
                        value={paymentMode}
                        onChange={e => setPaymentMode(e.target.value)}
                      >
                        <option value="cash">Cash</option>
                        <option value="upi">UPI / Online</option>
                        <option value="bank">Bank Transfer</option>
                        <option value="cheque">Cheque</option>
                      </select>
                    </div>

                    {/* Remarks */}
                    <div className="cf-field">
                      <label className="cf-label">Remarks (optional)</label>
                      <input
                        type="text"
                        className="cf-text-input"
                        placeholder="e.g. Term 2 payment, receipt note…"
                        value={remarks}
                        onChange={e => setRemarks(e.target.value)}
                      />
                    </div>

                    {/* Submit */}
                    <button
                      type="submit"
                      className="cf-submit-btn"
                      disabled={submitting || !paymentAmount || Number(paymentAmount) <= 0 || Number(paymentAmount) > maxAmount}
                    >
                      {submitting ? (
                        <span className="cf-spinner" />
                      ) : (
                        <>
                          <CheckCircle2 size={16} />
                          <span>Confirm &amp; Generate Receipt</span>
                        </>
                      )}
                    </button>
                  </Form>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ════════════════════════════════════════════════
            STEP 3 — SUCCESS / RECEIPT
        ════════════════════════════════════════════════ */}
        {step === 'success' && receipt && selectedStudent && (
          <div className="cf-success-page">
            <div className="cf-success-card">
              {/* Check Animation */}
              <div className="cf-success-icon">
                <CheckCircle2 size={40} color="#059669" />
              </div>
              <h2 className="cf-success-title">Payment Recorded!</h2>
              <p className="cf-success-sub">
                {whatsappStatus === 'sent' && 'WhatsApp receipt has been sent to parent.'}
                {whatsappStatus === 'failed' && 'Payment recorded — WhatsApp receipt could not be sent. You can download the PDF receipt below.'}
                {whatsappStatus === null && 'Sending WhatsApp receipt to parent…'}
              </p>

              {/* Receipt Detail */}
              <div className="cf-receipt-box">
                <div className="cf-receipt-header">
                  <span className="cf-receipt-no">Receipt #{receipt.receiptNo}</span>
                  <span className="cf-receipt-date">{receipt.paymentDate} {receipt.paymentTime}</span>
                </div>
                {[
                  { label: 'Student', value: receipt.studentName || selectedStudent.name },
                  { label: 'Class', value: `${selectedStudent.class}-${selectedStudent.section}` },
                  { label: 'Admission No.', value: selectedStudent.admissionNo || '—' },
                  { label: 'Fee Category', value: feeLabel(receipt.feeType) },
                  { label: 'Amount Paid', value: `₹${Number(receipt.amount).toLocaleString()}`, highlight: true },
                  { label: 'Payment Mode', value: receipt.paymentMode || paymentMode.toUpperCase() || 'Cash' },
                ].map(({ label, value, highlight }) => (
                  <div key={label} className="cf-receipt-row">
                    <span className="cf-receipt-label">{label}</span>
                    <span className={`cf-receipt-value ${highlight ? 'highlight' : ''}`}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="cf-success-actions">
                <ActionButton className="cf-dl-btn" onClick={handleDownloadPDF}>
                  <Download size={15} />
                  <span>Download PDF Receipt</span>
                </ActionButton>
                <a
                  href={`/?verify_token=${receipt.receiptNo || receipt.token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cf-verify-link"
                >
                  <ExternalLink size={14} />
                  <span>Verify Receipt Online</span>
                </a>
                <button
                  type="button"
                  className="cf-another-btn"
                  onClick={() => {
                    setStep('search');
                    setSelectedStudent(null);
                    setPaymentAmount('');
                    setReceipt(null);
                    setRemarks('');
                  }}
                >
                  Collect Another Fee
                </button>
                <button
                  type="button"
                  className="cf-analytics-btn"
                  onClick={onGoToFeeAnalytics}
                >
                  View Fee Analytics →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminCollectFee;
