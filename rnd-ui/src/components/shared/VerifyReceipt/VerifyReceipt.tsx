import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { API_BASE, formatClassName } from '../../../constants';

interface ReceiptDetails {
  receiptNo: string;
  studentId: string;
  studentName: string;
  class: string;
  section: string;
  classTeacherName: string;
  amountPaid: number;
  paymentDate: string;
  paymentTime: string;
  paymentMode: string;
  verifiedAt: string;
}

const VerifyReceipt: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'VERIFIED' | 'INVALID'>('INVALID');
  const [reason, setReason] = useState('');
  const [receipt, setReceipt] = useState<ReceiptDetails | null>(null);
  const [schoolProfile, setSchoolProfile] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_BASE}/school-profile`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) setSchoolProfile(data.data);
      })
      .catch(err => console.error('Failed to load school profile:', err));
  }, []);

  const generatePDF = () => {
    if (!receipt) return;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const sName = (schoolProfile?.schoolInfo?.schoolName || 'SCHOOLHUB ACADEMY').toUpperCase();

    // Outer border
    doc.rect(5, 5, 200, 287);
    doc.rect(6, 6, 198, 285);

    // Header Banner
    doc.setFillColor(30, 58, 138); // Dark Blue (#1e3a8a)
    doc.rect(10, 10, 190, 30, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(sName, 105, 22, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Official Fee Payment Receipt', 105, 32, { align: 'center' });

    // Details Content
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('PAYMENT RECEIPT', 20, 55);

    // Receipt details table structure
    doc.setFontSize(10);
    const startY = 65;
    const lineSpacing = 10;
    
    const details = [
      ['Receipt Number:', receipt.receiptNo],
      ['Student ID:', receipt.studentId],
      ['Student Name:', receipt.studentName],
      ['Class & Section:', formatClassName(receipt.class, receipt.section)],
      ['Class Teacher:', receipt.classTeacherName || 'N/A'],
      ['Payment Category:', 'School Fees'],
      ['Amount Paid:', `INR ${receipt.amountPaid.toLocaleString()}`],
      ['Payment Date:', receipt.paymentDate],
      ['Payment Time:', receipt.paymentTime],
      ['Payment Mode:', receipt.paymentMode.toUpperCase()],
      ['Verification Status:', 'VALID (Verified securely)']
    ];

    details.forEach((item, index) => {
      const currentY = startY + index * lineSpacing;
      // Draw details rows
      doc.setFont('helvetica', 'bold');
      doc.text(item[0], 20, currentY);
      doc.setFont('helvetica', 'normal');
      doc.text(item[1], 80, currentY);
      // Underline
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.line(20, currentY + 3, 190, currentY + 3);
    });

    // Verification Seal / Box
    const sealY = 185;
    doc.setFillColor(240, 253, 244); // light green
    doc.setDrawColor(187, 247, 208); // green-200
    doc.rect(20, sealY, 170, 40, 'FD');

    doc.setTextColor(20, 83, 45); // dark green
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('✓ SECURE ERP VERIFIED', 105, sealY + 15, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('This document has been cryptographically signed and verified by the school database servers.', 105, sealY + 24, { align: 'center' });
    doc.text(`Verification Protocol: Secure QR HS256 Signature`, 105, sealY + 30, { align: 'center' });

    // Footer
    doc.setTextColor(148, 163, 184); // slate-400
    doc.setFontSize(8);
    doc.text('Powered by RND School ERP System • This is a computer generated document, signature is not required.', 105, 270, { align: 'center' });

    doc.save(`Receipt_${receipt.receiptNo}.pdf`);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('verify_token') || params.get('token');

    if (!token) {
      setStatus('INVALID');
      setReason('Verification token is missing in the URL.');
      setLoading(false);
      return;
    }

    const verifyToken = async () => {
      try {
        const res = await fetch(`${API_BASE}/receipts/verify?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (data.success && data.status === 'VERIFIED') {
          setStatus('VERIFIED');
          setReceipt(data.receipt);
        } else {
          setStatus('INVALID');
          setReason(data.reason || 'Verification failed. The token signature is invalid or has expired.');
        }
      } catch (err) {
        setStatus('INVALID');
        setReason('Unable to establish connection with ERP verification servers. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, []);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        width: '100%',
        maxWidth: '480px',
        borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Top Header Design */}
        <div style={{
          backgroundColor: '#1e3a8a',
          padding: '24px',
          color: '#ffffff',
          textAlign: 'center',
          position: 'relative'
        }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em' }}>RND ERP School</h2>
          <span style={{ fontSize: '12px', color: '#93c5fd', fontWeight: 600 }}>Official Document Verification</span>
        </div>

        {/* Body content */}
        <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: '16px' }}>
              <Loader2 className="animate-spin" style={{ color: '#1e3a8a', width: '36px', height: '36px' }} />
              <span style={{ color: '#475569', fontSize: '14px', fontWeight: 600 }}>Verifying Cryptographic Signature...</span>
            </div>
          ) : status === 'VERIFIED' && receipt ? (
            // Success Verification Panel
            <div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '24px',
                textAlign: 'center'
              }}>
                <ShieldCheck style={{ color: '#16a34a', width: '48px', height: '48px', marginBottom: '8px' }} />
                <h3 style={{ margin: 0, color: '#14532d', fontSize: '18px', fontWeight: 800 }}>Receipt Verified</h3>
                <span style={{ fontSize: '12px', color: '#166534', fontWeight: 600, marginTop: '2px' }}>Verified by School ERP</span>
              </div>

              {/* Receipt metadata breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Receipt Number</span>
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{receipt.receiptNo}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Student ID</span>
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{receipt.studentId}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Student Name</span>
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{receipt.studentName}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Class &amp; Section</span>
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{formatClassName(receipt.class, receipt.section)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Class Teacher</span>
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{receipt.classTeacherName}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Payment Category</span>
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>School Fees</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Amount Paid</span>
                  <span style={{ fontSize: '15px', color: '#16a34a', fontWeight: 800 }}>₹{receipt.amountPaid.toLocaleString()}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Payment Date</span>
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{receipt.paymentDate}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Payment Time</span>
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{receipt.paymentTime}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Payment Mode</span>
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700, textTransform: 'capitalize' }}>{receipt.paymentMode}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '4px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Verification Status</span>
                  <span className="fee-badge paid" style={{ fontSize: '11px', margin: 0, padding: '2px 8px' }}>Valid</span>
                </div>
              </div>
              <button
                onClick={generatePDF}
                style={{
                  marginTop: '20px',
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 6px -1px rgba(22, 163, 74, 0.2)'
                }}
              >
                📥 Download Official PDF Receipt
              </button>
            </div>
          ) : (
            // Failure Panel
            <div style={{ textAlign: 'center' }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '20px'
              }}>
                <ShieldAlert style={{ color: '#dc2626', width: '48px', height: '48px', marginBottom: '8px' }} />
                <h3 style={{ margin: 0, color: '#7f1d1d', fontSize: '18px', fontWeight: 800 }}>Invalid Receipt</h3>
                <span style={{ fontSize: '12px', color: '#991b1b', fontWeight: 600, marginTop: '2px' }}>ERP Verification Failed</span>
              </div>
              
              <div style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '16px' }}>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Possible Reasons:</span>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {reason && <li style={{ color: '#dc2626', fontWeight: 600 }}>{reason}</li>}
                  <li>The receipt PDF data has been modified or tampered with</li>
                  <li>The cryptographic verification signature is invalid or forged</li>
                  <li>The receipt reference could not be found in the ERP database</li>
                  <li>The payment transaction was cancelled or refunded</li>
                </ul>
              </div>

              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                * ERP database holds the single source of truth. PDF files are copies only.
              </p>
            </div>
          )}

          {/* Footer branding */}
          <div style={{
            marginTop: '32px',
            borderTop: '1px solid #e2e8f0',
            paddingTop: '16px',
            textAlign: 'center'
          }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block' }}>Powered by RND School ERP System</span>
            <span style={{ fontSize: '10px', color: '#cbd5e1', display: 'block', marginTop: '2px' }}>Secure QR Verification Protocol v1.0 (HS256)</span>
          </div>

        </div>
      </div>
    </div>
  );
};

export default VerifyReceipt;
