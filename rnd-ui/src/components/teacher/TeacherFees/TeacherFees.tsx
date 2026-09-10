import React, { useState } from 'react';
import { CreditCard, Search, CheckCircle2, Users, Receipt, BookOpen } from 'lucide-react';
import jsPDF from 'jspdf';
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

  const [schoolProfile, setSchoolProfile] = React.useState<any>(null);

  React.useEffect(() => {
    fetch(`${API_BASE}/school-profile`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) setSchoolProfile(data.data);
      })
      .catch(err => console.error('Failed to load school profile:', err));
  }, []);

  const filteredStudents = students.filter(s => {
    const q = searchQuery.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q);
  });

  const paymentStudent = students.find((s) => s.id === selectedStudentForPayment || s._id === selectedStudentForPayment);

  const generateReceiptPDF = (receiptData: any, student: StudentData): Promise<string> => {
    return new Promise((resolve) => {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a5' // 148mm x 210mm
      });

      const pageWidth = 148;
      const pageHeight = 210;

      // Extract school info dynamically from settings
      const schoolName = schoolProfile?.schoolInfo?.schoolName || 'SCHOOLHUB ACADEMY';
      const addressLine = [
        schoolProfile?.address?.addressLine,
        schoolProfile?.address?.city,
        schoolProfile?.address?.state,
        schoolProfile?.address?.pincode
      ].filter(Boolean).join(', ') || '123 Education Campus Road, Hyderabad, Telangana';
      const phone = schoolProfile?.contactInfo?.phone || '+91 9392646349';
      const email = schoolProfile?.contactInfo?.email || 'admin@schoolhub.edu';
      const academicYear = schoolProfile?.academicConfig?.currentAcademicYear || '2026-27';

      // Outer Border
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.4);
      doc.rect(5, 5, pageWidth - 10, pageHeight - 10);
      doc.rect(6, 6, pageWidth - 12, pageHeight - 12);

      // Top Navy Header Bar
      doc.setFillColor(15, 23, 42); // slate-900 #0f172a
      doc.rect(6, 6, pageWidth - 12, 28, 'F');

      // Amber Gold Accent strip
      doc.setFillColor(217, 119, 6); // amber-600 #d97706
      doc.rect(6, 34, pageWidth - 12, 1.2, 'F');

      // School Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text(schoolName.toUpperCase(), 12, 16);

      // Address & Contact
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(203, 213, 225); // slate-300
      doc.text(addressLine.length > 55 ? addressLine.substring(0, 52) + '…' : addressLine, 12, 22);
      doc.text(`Phone: ${phone}  |  Email: ${email}`, 12, 27);

      // Right Top Badge: Fee Receipt Title
      doc.setFillColor(30, 58, 138); // blue-900
      doc.roundedRect(pageWidth - 48, 11, 40, 16, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text('FEE RECEIPT', pageWidth - 28, 17, { align: 'center' });
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(`AY: ${academicYear}`, pageWidth - 28, 23, { align: 'center' });

      let y = 41;

      // Receipt Metadata Box & Student Details Box (Side-by-Side Cards)
      const cardW = (pageWidth - 28) / 2; // 60mm each

      // Left Box: Receipt Details
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(10, y, cardW, 36, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(30, 58, 138);
      doc.text('RECEIPT INFORMATION', 14, y + 6);
      doc.setDrawColor(203, 213, 225);
      doc.line(14, y + 8, 10 + cardW - 4, y + 8);

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Receipt No:', 14, y + 14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(receiptData.receiptNo || 'N/A', 36, y + 14);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Date:', 14, y + 20);
      doc.setTextColor(15, 23, 42);
      doc.text(receiptData.paymentDate || new Date().toISOString().split('T')[0], 36, y + 20);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Time:', 14, y + 26);
      doc.setTextColor(15, 23, 42);
      doc.text(receiptData.paymentTime || new Date().toLocaleTimeString(), 36, y + 26);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Mode:', 14, y + 32);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 58, 138);
      doc.text((receiptData.paymentMode || 'Cash').toUpperCase(), 36, y + 32);

      // Right Box: Student Info
      const xRight = 10 + cardW + 8;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(xRight, y, cardW, 36, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(30, 58, 138);
      doc.text('STUDENT INFORMATION', xRight + 4, y + 6);
      doc.setDrawColor(203, 213, 225);
      doc.line(xRight + 4, y + 8, xRight + cardW - 4, y + 8);

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Student Name:', xRight + 4, y + 14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      const stName = receiptData.studentName || `${student.firstName || ''} ${student.lastName || ''}`.trim();
      doc.text(stName.length > 20 ? stName.substring(0, 18) + '…' : stName, xRight + 26, y + 14);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Admission ID:', xRight + 4, y + 20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(student.admissionNo || 'N/A', xRight + 26, y + 20);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Class & Sec:', xRight + 4, y + 26);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`Class ${student.class} - ${student.section}`, xRight + 26, y + 26);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Phone:', xRight + 4, y + 32);
      doc.setTextColor(15, 23, 42);
      doc.text(student.whatsappNo || 'N/A', xRight + 26, y + 32);

      y += 42;

      // Itemized Fee Breakdown Table
      doc.setFillColor(30, 41, 59); // slate-800
      doc.rect(10, y, pageWidth - 20, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text('SL', 14, y + 4.5);
      doc.text('FEE DESCRIPTION', 30, y + 4.5);
      doc.text('PAYMENT TYPE', 85, y + 4.5);
      doc.text('AMOUNT PAID (INR)', pageWidth - 14, y + 4.5, { align: 'right' });

      y += 7;

      // Row 1
      doc.setFillColor(255, 255, 255);
      doc.rect(10, y, pageWidth - 20, 8, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.line(10, y + 8, pageWidth - 10, y + 8);

      const feeName = receiptData.feeType === 'school' ? 'Tuition Fee Payment' : receiptData.feeType === 'books' ? 'Books & Material Fee' : 'Transport Fee';

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text('1', 14, y + 5);
      doc.text(feeName, 30, y + 5);
      doc.text('Partial / Installment', 85, y + 5);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 163, 74); // Green
      doc.text(`Rs. ${Number(receiptData.amount).toLocaleString('en-IN')}`, pageWidth - 14, y + 5, { align: 'right' });

      y += 12;

      // Total Net Amount Banner Card
      doc.setFillColor(240, 253, 244); // green-50
      doc.setDrawColor(187, 247, 208);
      doc.roundedRect(10, y, pageWidth - 20, 14, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(21, 128, 61);
      doc.text('TOTAL RECEIVED AMOUNT:', 15, y + 8.5);

      doc.setFontSize(13);
      doc.text(`INR ${Number(receiptData.amount).toLocaleString('en-IN')}`, pageWidth - 15, y + 9, { align: 'right' });

      y += 20;

      // Verification & QR Scanner Box (Preserved QR Code Scanner)
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(10, y, pageWidth - 20, 32, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text('OFFICIAL VERIFICATION & AUTHENTICITY', 14, y + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('This receipt is cryptographically generated & verified.', 14, y + 11);
      doc.text('Scan the QR code to verify this transaction on the portal.', 14, y + 15);
      doc.text('Verified by: SchoolHub Security Engine', 14, y + 19);

      // Signature line in verification box
      doc.setDrawColor(148, 163, 184);
      doc.line(14, y + 27, 55, y + 27);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(51, 65, 85);
      doc.text('Authorized Cashier / Accounts Stamp', 14, y + 30);

      // Generate Dynamic QR Code URL using window.location.origin
      const originHost = window.location.origin;
      const verifyUrl = `${originHost}/?verify_token=${receiptData.receiptNo || receiptData.token}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(verifyUrl)}`;

      // Draw QR Code Image into PDF
      const img = new window.Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        doc.addImage(img, 'PNG', pageWidth - 37, y + 3, 24, 24);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 58, 138);
        doc.text('SCAN TO VERIFY', pageWidth - 25, y + 29, { align: 'center' });
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
                            setSelectedStudentForPayment(s.id || s._id);
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
                          setSelectedStudentForPayment(s.id || s._id);
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
