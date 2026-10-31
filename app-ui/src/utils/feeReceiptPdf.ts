import jsPDF from 'jspdf';
import type { StudentData } from '../types';

export interface FeeReceiptData {
  receiptNo: string;
  amount: number;
  date?: string;
  paymentDate?: string;
  paymentTime?: string;
  paymentMode?: string;
  paymentType?: 'school' | 'books' | 'transport';
  studentName?: string;
  admissionNo?: string;
  class?: string;
  section?: string;
  whatsappNo?: string;
  token?: string;
}

export const generateReceiptPDF = async (
  receiptData: FeeReceiptData,
  student: StudentData,
  schoolProfile?: any
): Promise<string> => {
  return new Promise((resolve) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a5', // 148mm x 210mm
    });

    const pageWidth = 148;
    const pageHeight = 210;

    // Extract school info dynamically from settings
    const schoolName = schoolProfile?.schoolInfo?.schoolName || 'SCHOOLHUB ACADEMY';
    const addressLine =
      [
        schoolProfile?.address?.addressLine,
        schoolProfile?.address?.city,
        schoolProfile?.address?.state,
        schoolProfile?.address?.pincode,
      ]
        .filter(Boolean)
        .join(', ') || '123 Education Campus Road, Hyderabad, Telangana';
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
    doc.text(
      receiptData.date
        ? new Date(receiptData.date).toLocaleDateString('en-IN')
        : receiptData.paymentDate || new Date().toISOString().split('T')[0],
      36,
      y + 20
    );

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Time:', 14, y + 26);
    doc.setTextColor(15, 23, 42);
    doc.text(receiptData.paymentTime || 'Confirmed', 36, y + 26);

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
    const stName = receiptData.studentName || student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim();
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
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text('01', 14, y + 5);
    doc.text(
      receiptData.paymentType === 'books'
        ? 'Books & Stationery Charges'
        : receiptData.paymentType === 'transport'
        ? 'School Transport / Bus Fee'
        : 'Term Tuition / Academic Fee',
      30,
      y + 5
    );
    doc.setFont('helvetica', 'bold');
    doc.text(
      (receiptData.paymentType || 'TUITION').toUpperCase(),
      85,
      y + 5
    );
    doc.text(
      `Rs. ${receiptData.amount.toLocaleString('en-IN')}/-`,
      pageWidth - 14,
      y + 5,
      { align: 'right' }
    );

    y += 8;

    // Total Row
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(10, y, pageWidth - 20, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 58, 138);
    doc.text('TOTAL AMOUNT PAID', 30, y + 5.5);
    doc.text(
      `Rs. ${receiptData.amount.toLocaleString('en-IN')}/-`,
      pageWidth - 14,
      y + 5.5,
      { align: 'right' }
    );

    y += 14;

    // Summary Balance Card
    const totalFee = student.totalFee || student.feePaid + student.feePending || 0;
    const pendingFee = student.feePending || 0;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(10, y, pageWidth - 20, 20, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Total Applicable Fee:', 14, y + 7);
    doc.text('Current Balance Due:', 14, y + 14);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Rs. ${totalFee.toLocaleString('en-IN')}/-`, 50, y + 7);

    if (pendingFee <= 0) {
      doc.setTextColor(22, 163, 74); // green-600
      doc.text('FULL DUES CLEARED (Rs. 0)', 50, y + 14);
    } else {
      doc.setTextColor(225, 29, 72); // rose-600
      doc.text(`Rs. ${pendingFee.toLocaleString('en-IN')}/-`, 50, y + 14);
    }

    // Payment Status Stamp
    doc.setDrawColor(22, 163, 74);
    doc.setLineWidth(0.8);
    doc.roundedRect(pageWidth - 48, y + 3, 34, 14, 1, 1, 'D');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(22, 163, 74);
    doc.text('PAID / VERIFIED', pageWidth - 31, y + 9.5, { align: 'center' });
    doc.setFontSize(6);
    doc.text('SCHOOL ACCOUNTS', pageWidth - 31, y + 13.5, { align: 'center' });

    y += 24;

    // Verification and Security Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(10, y, pageWidth - 20, 32, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 58, 138);
    doc.text('SECURITY & VERIFICATION', 14, y + 6);
    doc.setDrawColor(203, 213, 225);
    doc.line(14, y + 7.5, 65, y + 7.5);

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
    const originHost = typeof window !== 'undefined' ? window.location.origin : '';
    const verifyUrl = `${originHost}/?verify_token=${receiptData.receiptNo || receiptData.token || 'REC'}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(verifyUrl)}`;

    if (typeof window !== 'undefined') {
      const img = new window.Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          doc.addImage(img, 'PNG', pageWidth - 37, y + 3, 24, 24);
          doc.setFontSize(6);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(30, 58, 138);
          doc.text('SCAN TO VERIFY', pageWidth - 25, y + 29, { align: 'center' });
        } catch {}
        resolve(doc.output('datauristring'));
      };
      img.onerror = () => {
        resolve(doc.output('datauristring'));
      };
      img.src = qrUrl;
    } else {
      resolve(doc.output('datauristring'));
    }
  });
};

export const downloadReceiptFile = async (
  receiptData: FeeReceiptData,
  student: StudentData,
  schoolProfile?: any
) => {
  const pdfDataUri = await generateReceiptPDF(receiptData, student, schoolProfile);
  const link = document.createElement('a');
  link.href = pdfDataUri;
  link.download = `Receipt-${receiptData.receiptNo || 'Fee'}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
