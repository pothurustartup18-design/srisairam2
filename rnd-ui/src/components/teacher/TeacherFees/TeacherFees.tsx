import React, { useState } from 'react';
import { CreditCard, Search, CheckCircle2, Users, Receipt, BookOpen } from 'lucide-react';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { useAuth } from '../../../context/authContext';
import type { StudentData } from '../../../types';
import { API_BASE } from '../../../constants';
import { getAccessToken } from '../../../services/api';
import { cn } from '../../../lib/utils';
import {
  Button, KpiCard, PageHeader, DataTable, Th, Td, Tr,
  FilterToolbar, FilterGroup, filterControlClass,
  EmptyState, Modal, MobileRowCard, MobileCardList,
} from '../../ui';

interface TeacherFeesProps {
  students: StudentData[];
  onReload: () => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

const TeacherFees: React.FC<TeacherFeesProps> = ({ students, onReload, showToast }) => {
  const { hasPermission } = useAuth();
  const canCollect = hasPermission('fees:collect');

  const [searchQuery, setSearchQuery] = useState('');
  const [paymentType, setPaymentType] = useState<'school' | 'books'>('school');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedStudentForPayment, setSelectedStudentForPayment] = useState<string | null>(null);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [showPaymentSuccessModal, setShowPaymentSuccessModal] = useState<any | null>(null);

  const filteredStudents = students.filter(s => {
    const q = searchQuery.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q);
  });

  const paymentStudent = students.find((s) => s.id === selectedStudentForPayment || s._id === selectedStudentForPayment);

  const generateReceiptPDF = async (receiptData: any, student: StudentData): Promise<string> => {
    // Rendered locally with the bundled `qrcode` package (same as the report card)
    // rather than round-tripping the verification token through a third-party API,
    // and pointed at the origin the receipt was issued from so a printed QR is not
    // pinned to one machine's LAN address.
    const verifyUrl = `${window.location.origin}/?verify_token=${receiptData.receiptNo || receiptData.token}`;
    const qrUrl = await QRCode.toDataURL(verifyUrl, { width: 150, margin: 1 });
    return new Promise((resolve) => {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a5'
      });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(30, 58, 138);
      doc.text('RND ERP SCHOOL', 15, 20);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Official Fee Receipt & Payment Confirmation', 15, 25);

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(15, 28, 133, 28);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105);
      doc.text('Receipt Details', 15, 36);

      doc.setFont('helvetica', 'normal');
      doc.text('Receipt No:', 15, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(receiptData.receiptNo, 45, 42);

      doc.setFont('helvetica', 'normal');
      doc.text('Date:', 15, 48);
      doc.text(receiptData.paymentDate, 45, 48);

      doc.text('Time:', 15, 54);
      doc.text(receiptData.paymentTime, 45, 54);

      doc.setFont('helvetica', 'bold');
      doc.text('Student Details', 15, 64);
      doc.setFont('helvetica', 'normal');
      doc.text('Student Name:', 15, 70);
      doc.text(receiptData.studentName, 45, 70);

      doc.text('Admission ID:', 15, 76);
      doc.text(student.admissionNo, 45, 76);

      doc.text('Class & Section:', 15, 82);
      doc.text(`Class ${student.class} - ${student.section}`, 45, 82);

      doc.setFont('helvetica', 'bold');
      doc.text('Payment Breakdown', 15, 92);

      doc.setFont('helvetica', 'normal');
      doc.text('Fee Category:', 15, 98);
      doc.text(receiptData.feeType === 'school' ? 'School Fee' : 'Books Fee', 45, 98);

      doc.text('Amount Paid:', 15, 104);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 163, 74);
      doc.text(`INR ${Number(receiptData.amount).toLocaleString()}`, 45, 104);

      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'normal');
      doc.text('Payment Mode:', 15, 110);
      doc.text('Cash', 45, 110);

      doc.setDrawColor(226, 232, 240);
      doc.line(15, 116, 133, 116);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text('Verified by School ERP', 15, 122);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('This receipt can be verified by scanning the QR code.', 15, 126);


      const img = new Image();
      img.onload = () => {
        doc.addImage(img, 'PNG', 103, 118, 26, 26);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text('Scan to verify authenticity', 103, 147);
        resolve(doc.output('datauristring'));
      };
      img.onerror = () => {
        resolve(doc.output('datauristring'));
      };
      img.src = qrUrl;
    });
  };

  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForPayment || !paymentAmount || Number(paymentAmount) <= 0 || !paymentStudent) return;

    setSubmittingPayment(true);
    try {
      const token = getAccessToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/dashboard/record-payment`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          studentId: selectedStudentForPayment,
          amount: Number(paymentAmount),
          feeType: paymentType
        })
      });
      const data = await res.json();
      if (data.success && data.receipt) {
        showToast(data.message || 'Payment recorded successfully.', 'success');

        const pdfBase64 = await generateReceiptPDF(data.receipt, paymentStudent);

        try {
          await fetch(`${API_BASE}/dashboard/upload-receipt-pdf`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              receiptNo: data.receipt.receiptNo,
              pdfBase64,
              recipient: data.receipt.recipient || paymentStudent.whatsappNo,
              whatsappMessage: data.receipt.whatsappMessage
            })
          });
        } catch (pdfErr) {
          console.error('Failed to upload receipt PDF/dispatch alert:', pdfErr);
        }

        setShowPaymentSuccessModal({
          receiptNo: data.receipt.receiptNo,
          amount: data.receipt.amount,
          studentName: paymentStudent.name,
          paymentDate: data.receipt.paymentDate,
          feeType: paymentType,
          pdfDataUri: pdfBase64
        });

        setSelectedStudentForPayment(null);
        setPaymentAmount('');
        onReload();
      } else {
        showToast(data.message || 'Failed to record payment.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error recording fee payment.', 'error');
    } finally {
      setSubmittingPayment(false);
    }
  };

  // KPI Calculations
  const totalStudents = students.length;
  const outstandingStudentsCount = students.filter(s => s.feePending > 0 || (s.booksFee && s.booksFee > 0)).length;
  const totalPendingSchoolFees = students.reduce((sum, s) => sum + (s.feePending || 0), 0);
  const totalPendingBooksFees = students.reduce((sum, s) => sum + (s.booksFee || 0), 0);

  return (
    <div className="flex flex-col gap-5 font-sans text-slate-900">

      <PageHeader title="Fees Management" subtitle="Collect and track school and books fee dues for your assigned class." />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Class Roster" value={totalStudents}
          icon={<Users size={17} />} iconBg="bg-purple-lt" iconColor="text-purple" />
        <KpiCard label="Students with Dues" value={outstandingStudentsCount}
          icon={<CreditCard size={17} />} iconBg="bg-amber-lt" iconColor="text-amber"
          valueColor={outstandingStudentsCount > 0 ? 'text-red' : 'text-green'} />
        <KpiCard label="Outstanding School Fees" value={`₹${totalPendingSchoolFees.toLocaleString()}`}
          icon={<Receipt size={17} />} iconBg="bg-red-lt" iconColor="text-red" valueColor="text-red" />
        <KpiCard label="Outstanding Books Fees" value={`₹${totalPendingBooksFees.toLocaleString()}`}
          icon={<BookOpen size={17} />} iconBg="bg-blue-lt" iconColor="text-blue" valueColor="text-blue" />
      </div>

      <FilterToolbar>
        <FilterGroup label="Search" className="flex-1 min-w-[220px]">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-slate-400 pointer-events-none" />
            <input type="text" className={cn(filterControlClass, 'pl-8')} placeholder="Search student roster..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </FilterGroup>
      </FilterToolbar>

      <div className="hidden md:block">
        <DataTable
          card
          header={<div className="text-md font-bold text-slate-900">Class Fees &amp; Dues Roster</div>}
        >
          <thead>
            <tr>
              <Th>Student Name</Th>
              <Th>Admission ID</Th>
              <Th className="text-right">School Fee Dues</Th>
              <Th className="text-right">Books Fee Dues</Th>
              <Th className="text-right">Total Outstanding</Th>
              <Th className="text-center">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 ? (
              <tr><Td colSpan={6}><EmptyState icon={<Users size={32} />} title="No students found." /></Td></tr>
            ) : (
              filteredStudents.map(s => {
                const totalDues = s.feePending + (s.booksFee || 0);
                return (
                  <Tr key={s.id || s._id}>
                    <Td>
                      <div className="text-sm font-bold text-slate-900">{s.name}</div>
                      {s.cluster && <div className="text-xs text-slate-400 mt-0.5">📍 {s.cluster}</div>}
                    </Td>
                    <Td><span className="text-sm text-slate-500">{s.admissionNo}</span></Td>
                    <Td className={cn('text-right font-semibold', s.feePending > 0 ? 'text-red' : 'text-green')}>
                      {s.feePending > 0 ? `₹${s.feePending.toLocaleString()}` : '✅ Paid'}
                    </Td>
                    <Td className={cn('text-right font-semibold', (s.booksFee || 0) > 0 ? 'text-blue' : 'text-green')}>
                      {(s.booksFee || 0) > 0 ? `₹${(s.booksFee || 0).toLocaleString()}` : '✅ Paid'}
                    </Td>
                    <Td className={cn('text-right font-bold', totalDues > 0 ? 'text-red-700' : 'text-green-800')}>
                      {totalDues > 0 ? `₹${totalDues.toLocaleString()}` : '✅ All Clear'}
                    </Td>
                    <Td className="text-center">
                      {canCollect ? (
                        <Button
                          size="sm"
                          variant={totalDues > 0 ? 'success' : 'secondary'}
                          disabled={totalDues <= 0}
                          onClick={() => {
                            setSelectedStudentForPayment(s.id || s._id || null);
                            setPaymentAmount('');
                            setPaymentType(s.feePending > 0 ? 'school' : 'books');
                          }}
                        >
                          <CreditCard size={13} /> Collect
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400 italic">View Only</span>
                      )}
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </DataTable>
      </div>

      <div className="md:hidden">
        <div className="text-md font-bold text-slate-900 mb-3">Class Fees &amp; Dues Roster</div>
        {filteredStudents.length === 0 ? (
          <EmptyState icon={<Users size={32} />} title="No students found." />
        ) : (
          <MobileCardList>
            {filteredStudents.map(s => {
              const totalDues = s.feePending + (s.booksFee || 0);
              return (
                <MobileRowCard
                  key={s.id || s._id}
                  title={s.name}
                  subtitle={`Adm: ${s.admissionNo}${s.cluster ? ` · 📍 ${s.cluster}` : ''}`}
                  badge={
                    <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', totalDues > 0 ? 'bg-red-lt text-red-700' : 'bg-green-lt text-green-800')}>
                      {totalDues > 0 ? `₹${totalDues.toLocaleString()}` : 'All Clear'}
                    </span>
                  }
                  fields={[
                    { label: 'School Fee Dues', value: <span className={s.feePending > 0 ? 'text-red' : 'text-green'}>{s.feePending > 0 ? `₹${s.feePending.toLocaleString()}` : '✅ Paid'}</span> },
                    { label: 'Books Fee Dues', value: <span className={(s.booksFee || 0) > 0 ? 'text-blue' : 'text-green'}>{(s.booksFee || 0) > 0 ? `₹${(s.booksFee || 0).toLocaleString()}` : '✅ Paid'}</span> },
                  ]}
                  actions={
                    canCollect ? (
                      <Button
                        size="sm"
                        variant={totalDues > 0 ? 'success' : 'secondary'}
                        disabled={totalDues <= 0}
                        onClick={() => {
                          setSelectedStudentForPayment(s.id || s._id || null);
                          setPaymentAmount('');
                          setPaymentType(s.feePending > 0 ? 'school' : 'books');
                        }}
                      >
                        <CreditCard size={13} /> Collect Payment
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400 italic">View Only</span>
                    )
                  }
                />
              );
            })}
          </MobileCardList>
        )}
      </div>

      {/* Record Payment Modal */}
      <Modal
        isOpen={!!(selectedStudentForPayment && paymentStudent)}
        onClose={() => setSelectedStudentForPayment(null)}
        title="Record Fee Payment"
        subtitle={paymentStudent ? `Enter the amount collected from the parent of ${paymentStudent.name}.` : ''}
        maxWidth="400px"
        footer={
          <div className="flex gap-2">
            <Button type="submit" form="record-payment-form" variant="success" className="flex-1 justify-center" disabled={submittingPayment || !paymentAmount}>
              {submittingPayment ? 'Recording...' : 'Record Payment'}
            </Button>
            <Button variant="secondary" className="flex-1 justify-center" onClick={() => setSelectedStudentForPayment(null)} disabled={submittingPayment}>
              Cancel
            </Button>
          </div>
        }
      >
        {paymentStudent && (
          <form id="record-payment-form" onSubmit={handleRecordPaymentSubmit} className="flex flex-col gap-3.5">
            <FilterGroup label="Fee Category">
              <select className={filterControlClass} value={paymentType} onChange={(e) => setPaymentType(e.target.value as 'school' | 'books')}>
                <option value="school" disabled={paymentStudent.feePending <= 0}>
                  School Fee (Pending: ₹{paymentStudent.feePending.toLocaleString()})
                </option>
                <option value="books" disabled={!paymentStudent.booksFee || paymentStudent.booksFee <= 0}>
                  Books Fee (Pending: ₹{(paymentStudent.booksFee || 0).toLocaleString()})
                </option>
              </select>
            </FilterGroup>

            <FilterGroup label="Payment Amount (₹)">
              <input
                type="number"
                required
                min={1}
                max={paymentType === 'school' ? paymentStudent.feePending : paymentStudent.booksFee}
                placeholder="e.g. 5000"
                className={filterControlClass}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </FilterGroup>
          </form>
        )}
      </Modal>

      {/* Payment Success Modal */}
      <Modal
        isOpen={!!showPaymentSuccessModal}
        onClose={() => setShowPaymentSuccessModal(null)}
        title="Payment Recorded!"
        maxWidth="420px"
        footer={
          showPaymentSuccessModal && (
            <div className="flex gap-2">
              <a
                href={showPaymentSuccessModal.pdfDataUri}
                download={`Receipt-${showPaymentSuccessModal.receiptNo}.pdf`}
                className="flex-1 flex items-center justify-center h-11 px-4 rounded-md bg-blue text-white text-sm font-semibold no-underline hover:bg-blue-dk transition-colors"
              >
                Download Receipt PDF
              </a>
              <Button variant="secondary" className="flex-1 justify-center" onClick={() => setShowPaymentSuccessModal(null)}>
                Close Window
              </Button>
            </div>
          )
        }
      >
        {showPaymentSuccessModal && (
          <div className="text-center flex flex-col items-center gap-3">
            <CheckCircle2 size={48} className="text-green" />
            <p className="text-sm text-slate-600 m-0">
              Successfully recorded <strong>₹{showPaymentSuccessModal.amount.toLocaleString()}</strong> for <strong>{showPaymentSuccessModal.studentName}</strong> ({showPaymentSuccessModal.feeType === 'school' ? 'School Fee' : 'Books Fee'}).
            </p>
            <div className="w-full border-t border-slate-100" />
            <p className="text-xs text-slate-500 text-left w-full m-0">
              Receipt No: <strong>{showPaymentSuccessModal.receiptNo}</strong><br />
              Date: <strong>{showPaymentSuccessModal.paymentDate}</strong>
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TeacherFees;
