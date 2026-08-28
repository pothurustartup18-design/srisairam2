import React, { useState, useEffect } from 'react';
import './AdminCollectFee.css';
import type { StudentData } from '../../../types';
import { ArrowLeft, Search, CheckCircle2, CreditCard, Download, ExternalLink } from 'lucide-react';

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
  // ── Search / Filter
  const [searchName, setSearchName] = useState('');
  const [searchClass, setSearchClass] = useState('all');

  // ── Step state
  const [step, setStep] = useState<Step>('search');
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);
  const [paymentType, setPaymentType] = useState<'school' | 'books' | 'transport'>('school');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<any | null>(null);

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
    if (query && !s.name.toLowerCase().includes(query)) return false;
    if (searchClass !== 'all' && String(s.class) !== searchClass) return false;
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
    setPaymentType(tuition > 0 ? 'school' : books > 0 ? 'books' : 'transport');
    setPaymentAmount('');
    setStep('payment');
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
        <button className="cf-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          Back
        </button>
        <div className="cf-header-title">
          <div className="cf-header-icon">💳</div>
          <div>
            <h1 className="cf-h1">Collect Fee</h1>
            <p className="cf-subtext">Search a student, select due category, and record payment.</p>
          </div>
        </div>
        <div className="cf-step-indicator">
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
                  placeholder="Search student by name…"
                  value={searchName}
                  onChange={e => setSearchName(e.target.value)}
                  autoFocus
                />
              </div>
              <select
                className="cf-class-select"
                value={searchClass}
                onChange={e => setSearchClass(e.target.value)}
              >
                <option value="all">All Classes</option>
                {uniqueClasses.map(cls => (
                  <option key={cls} value={cls}>Class {cls}</option>
                ))}
              </select>
              <div className="cf-count-badge">{filteredStudents.length} students</div>
            </div>

            {/* Table */}
            <div className="cf-table-wrap">
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
                        <div>No students found. Try a different name or class.</div>
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
                    <div className="cf-student-card-meta">Adm: {s.admissionNo} · Class {s.class}-{s.section}</div>
                    <div className="cf-student-card-meta">Parent: {s.fatherName || s.motherName || '—'}</div>
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
                    <span className="cf-dues-total-label">Total Pending</span>
                    <span className="cf-dues-total-val">₹{total.toLocaleString()}</span>
                  </div>
                </div>

                <button
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
                    Record Payment
                  </div>
                  <p className="cf-form-subtitle">
                    Select the fee category and enter the amount to collect.
                  </p>

                  <form onSubmit={handleSubmitPayment} className="cf-form">
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
                          onFocus={e => (e.target.style.borderColor = '#2563eb')}
                          onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                          autoFocus
                        />
                        {paymentAmount && Number(paymentAmount) === maxAmount && (
                          <span className="cf-full-badge">Full</span>
                        )}
                      </div>
                      <div className="cf-amount-hint">
                        <span>Max: ₹{maxAmount.toLocaleString()}</span>
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
                      <select className="cf-select">
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="bank">Bank Transfer</option>
                        <option value="cheque">Cheque</option>
                      </select>
                    </div>

                    {/* Remarks */}
                    <div className="cf-field">
                      <label className="cf-label">Remarks (optional)</label>
                      <input type="text" className="cf-text-input" placeholder="e.g. Term 2 payment…" />
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
                          Confirm &amp; Generate Receipt
                        </>
                      )}
                    </button>
                  </form>
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
              <p className="cf-success-sub">WhatsApp receipt has been sent to parent.</p>

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
                  { label: 'Payment Mode', value: receipt.paymentMode || 'Cash' },
                ].map(({ label, value, highlight }) => (
                  <div key={label} className="cf-receipt-row">
                    <span className="cf-receipt-label">{label}</span>
                    <span className={`cf-receipt-value ${highlight ? 'highlight' : ''}`}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="cf-success-actions">
                <button className="cf-dl-btn" onClick={handleDownloadPDF}>
                  <Download size={15} />
                  Download PDF Receipt
                </button>
                <a
                  href={`/?verify_token=${receipt.receiptNo || receipt.token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cf-verify-link"
                >
                  <ExternalLink size={14} />
                  Verify Receipt Online
                </a>
                <button
                  className="cf-another-btn"
                  onClick={() => {
                    setStep('search');
                    setSelectedStudent(null);
                    setPaymentAmount('');
                    setReceipt(null);
                  }}
                >
                  Collect Another Fee
                </button>
                <button className="cf-analytics-btn" onClick={onGoToFeeAnalytics}>
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
